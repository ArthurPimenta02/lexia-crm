import {
  chaveTelefone,
  derivarEtapa,
  rotularResultado,
  type Etapa,
  type FactosDoCartao,
} from "@/lib/pipeline/etapas";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

/**
 * O pipeline — o kanban de leads.
 *
 * Quatro coisas medidas a 2026-10-18 que explicam o que está aqui.
 *
 * 1. Um cartão é uma linha de `lexia_contactos`, como na ficha de clientes.
 *    Não há tabela de pipeline: a etapa é calculada a cada leitura a partir
 *    de factos. Uma tabela de etapas ficava errada no instante em que alguém
 *    respondesse a uma mensagem sem passar pelo painel, que é o que acontece
 *    todos os dias.
 *
 * 2. A coluna "Agendado" vem da `lexia_agendamentos` — o espelho das agendas
 *    do Google — e não das tabelas de marcações dos clientes. Essas só sabem
 *    do que o agente marcou: 17% da agenda. A ponte é o telefone, porque
 *    agenda e conversa vivem em sítios sem chave comum.
 *
 * 3. Só uma minoria dos eventos da agenda consegue ligar-se a um cartão, e
 *    isso é uma verdade do negócio e não uma avaria. 83% dos eventos são
 *    escritos à mão no Google e não têm telefone nenhum — muitos nem são
 *    marcações de clientes ("Pagar contabilista", "Receber carro"). Tentou-se
 *    ligar pelo nome do evento e mediu-se o resultado: 27% no Detail, 3% na
 *    Miranda, e já a juntar cartões errados. Ficou de fora.
 *
 * 4. O que a IA achou da conversa é uma etiqueta no cartão, nunca a coluna.
 *    A razão está no `lib/pipeline/etapas.ts`.
 */

type ContactoRow = {
  atualizado_em: string | null;
  canal: string | null;
  criado_em: string | null;
  fundido_em: string | null;
  id: string;
  identificador_conversa: string;
  nome: string | null;
  telefone: string | null;
  telefone_digitos: string | null;
};

type MensagemRow = {
  criado_em: string | null;
  direccao: string | null;
  identificador_conversa: string | null;
};

type AgendamentoRow = {
  estado: string | null;
  inicio: string | null;
  nome_cliente: string | null;
  origem: string | null;
  servico: string | null;
  telefone_digitos: string | null;
};

type InsightRow = {
  identificador_conversa: string | null;
  resultado: string | null;
};

export type CartaoPipeline = {
  canal: string | null;
  /** Há quantos dias calendário foi a última mensagem. */
  dias: number;
  etapa: Etapa;
  id: string;
  identificadorConversa: string;
  /** Quando é a marcação por acontecer, se houver. */
  marcacaoEm: string | null;
  /**
   * O nome com que a marcação foi feita.
   *
   * Vale a pena guardar à parte do `nome` do contacto porque os dois divergem
   * muito: o `nome` é o do perfil de WhatsApp, que a pessoa escolheu para si
   * ("Out Of Service", "The Blessed⚡️"), e este é o nome que ela deu quando
   * marcou. Mostrar só o primeiro faz o cartão parecer de outra pessoa.
   */
  marcacaoNome: string | null;
  /** `agente` se foi o agente de IA a marcar; `manual` se foi à mão. */
  marcacaoOrigem: string | null;
  marcacaoServico: string | null;
  mensagens: number;
  nome: string | null;
  /** Em texto, porque é que o cartão está nesta coluna. */
  porque: string;
  /** A etiqueta da IA. Separada da etapa, de propósito. */
  resultado: string | null;
  telefone: string | null;
  ultimaMensagemEm: string | null;
};

export type PipelineResultado = {
  cartoes: CartaoPipeline[];
  erro: string | null;
};

async function lerContactos(clienteSlug: string) {
  const admin = createAdminClient();

  return fetchAllSupabaseRows<ContactoRow>(async (from, to) => {
    const result = await admin
      .from("lexia_contactos")
      .select(
        "id, nome, telefone, telefone_digitos, canal, identificador_conversa, fundido_em, criado_em, atualizado_em",
      )
      .eq("cliente_slug", clienteSlug)
      .not("identificador_conversa", "like", "teste:%")
      .order("criado_em", { ascending: true })
      .range(from, to);

    return { data: (result.data ?? []) as ContactoRow[], error: result.error };
  });
}

async function lerMensagens(clienteSlug: string) {
  const admin = createAdminClient();

  return fetchAllSupabaseRows<MensagemRow>(async (from, to) => {
    const result = await admin
      .from("lexia_mensagens")
      .select("identificador_conversa, direccao, criado_em")
      .eq("cliente_slug", clienteSlug)
      .order("criado_em", { ascending: true })
      .range(from, to);

    return { data: (result.data ?? []) as MensagemRow[], error: result.error };
  });
}

/**
 * Lê a agenda já sem o que foi desmarcado.
 *
 * As linhas canceladas ficam na tabela de propósito, para se poder contar
 * quantas marcações caíram, mas uma marcação desmarcada não pode continuar a
 * segurar um lead na coluna "Agendado".
 */
async function lerAgenda(clienteSlug: string) {
  const admin = createAdminClient();

  return fetchAllSupabaseRows<AgendamentoRow>(async (from, to) => {
    const result = await admin
      .from("lexia_agendamentos")
      .select(
        "telefone_digitos, inicio, estado, servico, nome_cliente, origem",
      )
      .eq("cliente_slug", clienteSlug)
      .neq("estado", "cancelado")
      .order("inicio", { ascending: true })
      .range(from, to);

    return {
      data: (result.data ?? []) as AgendamentoRow[],
      error: result.error,
    };
  });
}

async function lerAnalises(clienteSlug: string) {
  const admin = createAdminClient();

  return fetchAllSupabaseRows<InsightRow>(async (from, to) => {
    const result = await admin
      .from("lexia_conversation_insights")
      .select("identificador_conversa, resultado")
      .eq("cliente_slug", clienteSlug)
      .range(from, to);

    return { data: (result.data ?? []) as InsightRow[], error: result.error };
  });
}

const data = (valor: string | null | undefined) => {
  if (!valor) {
    return null;
  }

  const d = new Date(valor);

  return Number.isNaN(d.getTime()) ? null : d;
};

export async function getPipeline(
  clienteSlug: string,
  agora = new Date(),
): Promise<PipelineResultado> {
  const vazio: PipelineResultado = {
    cartoes: [],
    erro: null,
  };

  if (!clienteSlug) {
    return { ...vazio, erro: "Sem cliente associado a esta conta." };
  }

  const [contactos, mensagens, agenda, analises] = await Promise.all([
    lerContactos(clienteSlug),
    lerMensagens(clienteSlug),
    lerAgenda(clienteSlug),
    lerAnalises(clienteSlug),
  ]);

  const falhou = contactos.error ?? mensagens.error ?? agenda.error;

  if (falhou) {
    return { ...vazio, erro: "Não foi possível carregar o pipeline." };
  }

  // A última mensagem e o total, por conversa. As mensagens vêm ordenadas por
  // data, por isso a última a passar por aqui é mesmo a última.
  const ultima = new Map<string, MensagemRow>();
  const total = new Map<string, number>();

  for (const m of mensagens.data) {
    const chave = m.identificador_conversa;

    if (!chave) {
      continue;
    }

    ultima.set(chave, m);
    total.set(chave, (total.get(chave) ?? 0) + 1);
  }

  // A agenda, indexada pelos últimos 9 dígitos do telefone.
  const porTelefone = new Map<string, AgendamentoRow[]>();

  for (const a of agenda.data) {
    const quando = data(a.inicio);

    if (!quando) {
      continue;
    }

    const chave = chaveTelefone(a.telefone_digitos);

    if (!chave) {
      continue;
    }

    const lista = porTelefone.get(chave) ?? [];

    lista.push(a);
    porTelefone.set(chave, lista);
  }

  const resultadoPorConversa = new Map<string, string | null>();

  for (const i of analises.data) {
    if (i.identificador_conversa) {
      resultadoPorConversa.set(i.identificador_conversa, i.resultado);
    }
  }

  const ligados = new Set<string>();
  const cartoes: CartaoPipeline[] = [];

  for (const contacto of contactos.data) {
    // Um contacto fundido continua a receber mensagens mas já não é uma
    // pessoa à parte: mostrá-lo seria o mesmo lead duas vezes no quadro.
    if (contacto.fundido_em) {
      continue;
    }

    const conversa = contacto.identificador_conversa;
    const ultimaMensagem = ultima.get(conversa) ?? null;
    const ultimaEm =
      data(ultimaMensagem?.criado_em) ?? data(contacto.criado_em);

    const chave = chaveTelefone(contacto.telefone_digitos);
    const marcacoes = chave ? (porTelefone.get(chave) ?? []) : [];

    let marcacaoFutura: Date | null = null;
    let marcacaoPassada: Date | null = null;
    let servicoFuturo: string | null = null;
    let nomeFuturo: string | null = null;
    let origemFutura: string | null = null;

    for (const m of marcacoes) {
      const quando = data(m.inicio);

      if (!quando) {
        continue;
      }

      ligados.add(`${m.telefone_digitos}|${m.inicio}`);

      if (quando >= agora) {
        // A lista vem ordenada por data, por isso a primeira futura é a
        // próxima — é essa que interessa mostrar no cartão.
        if (!marcacaoFutura) {
          marcacaoFutura = quando;
          nomeFuturo = m.nome_cliente;
          origemFutura = m.origem;
          servicoFuturo = m.servico;
        }
      } else {
        marcacaoPassada = quando;
      }
    }

    const factos: FactosDoCartao = {
      marcacaoFutura,
      marcacaoPassada,
      ultimaFoiRecebida: ultimaMensagem?.direccao === "recebida",
      ultimaMensagemEm: ultimaEm,
    };

    const { dias, etapa, porque } = derivarEtapa(factos, agora);

    cartoes.push({
      canal: contacto.canal,
      dias,
      etapa,
      id: contacto.id,
      identificadorConversa: conversa,
      marcacaoEm: marcacaoFutura ? marcacaoFutura.toISOString() : null,
      marcacaoNome: nomeFuturo,
      marcacaoOrigem: origemFutura,
      marcacaoServico: servicoFuturo,
      mensagens: total.get(conversa) ?? 0,
      nome: contacto.nome,
      porque,
      resultado: rotularResultado(resultadoPorConversa.get(conversa)),
      telefone: contacto.telefone,
      ultimaMensagemEm: ultimaEm ? ultimaEm.toISOString() : null,
    });
  }

  // Dentro de cada coluna, o mais urgente primeiro. Em "Agendado" isso é a
  // marcação mais próxima; nas outras é quem falou há menos tempo.
  cartoes.sort((a, b) => {
    if (a.etapa === "agendado" && b.etapa === "agendado") {
      return (a.marcacaoEm ?? "").localeCompare(b.marcacaoEm ?? "");
    }

    return (b.ultimaMensagemEm ?? "").localeCompare(a.ultimaMensagemEm ?? "");
  });

  return { cartoes, erro: null };
}

export function agruparPorEtapa(cartoes: CartaoPipeline[]) {
  const grupos = new Map<Etapa, CartaoPipeline[]>();

  for (const cartao of cartoes) {
    const lista = grupos.get(cartao.etapa) ?? [];

    lista.push(cartao);
    grupos.set(cartao.etapa, lista);
  }

  return grupos;
}
