import "server-only";

import { DIAS_ACTIVO } from "@/lib/pipeline/etapas";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O que o painel tem para te dizer.
 *
 * Três avisos, nenhum deles guardado em tabela: derivam-se todos de factos que
 * já estão na base. Guardá-los obrigava a mantê-los em sincronia com os factos
 * de que saem, e um aviso já resolvido que continua aceso é pior do que não
 * haver aviso nenhum. O que se guarda em `lexia_avisos_lidos` são os dois
 * gestos de quem lê: o "já vi isto" e o "tira isto da minha frente".
 *
 * Porque é que isto não chama o `getPipeline`
 * -------------------------------------------
 * Chamava, e era uma linha. Mas o sino está em TODAS as páginas, e medido a
 * 2026-10-19 o `getPipeline` custa 2493 ms no Detail porque lê as 9747
 * mensagens todas para derivar as etapas. Meio segundo de espera em cada
 * página do produto para mostrar um número ao lado de um sino não se paga.
 *
 * O atalho não é uma aproximação: é a própria regra. `porResponder` é
 * `ultimaFoiRecebida && dias <= DIAS_ACTIVO`, portanto uma conversa cuja
 * última mensagem tem mais de sete dias NUNCA está por responder. Basta ler as
 * mensagens dessa janela para saber qual foi a última de cada conversa. Medido
 * nos dois clientes: 835 mensagens em vez de 9747, 531 ms em vez de 2493.
 *
 * Porque é que sai das mensagens e não dos contactos
 * -------------------------------------------------
 * Esta é a diferença que importa. Medido a 2026-10-19: 42 conversas do Detail
 * e 55 da Miranda têm mensagens e NENHUMA linha em `lexia_contactos` — e por
 * isso não aparecem no Pipeline, nos Clientes nem nas Conversas, que percorrem
 * todos os contactos. Dessas, 17 do Detail estão à espera de resposta, a mais
 * recente desde 2026-10-16.
 *
 * São exactamente as pessoas que mais precisam do aviso: não há nenhum outro
 * ecrã onde apareçam. Sair das mensagens apanha-as; sair dos contactos
 * perdia-as em silêncio. O telefone tira-se do identificador da conversa
 * (`whatsapp:351939902228` → `351939902228`), que é accionável mesmo sem
 * ficha — abre-se o WhatsApp e responde-se.
 */

/** Uma janela de folga sobre os sete dias da regra, para o `>=` da consulta. */
const DIAS_DE_JANELA = DIAS_ACTIVO + 1;

/** Quanto para a frente se olha na agenda. */
const HORAS_DE_AGENDA = 24;

/**
 * A marca de um aviso limpo, à frente da chave dele.
 *
 * Limpar não é o mesmo que ler. Lido tira o realce e deixa o aviso na lista —
 * é o que acontece sozinho ao fechar o sino. Limpo tira-o da lista: a pessoa
 * decidiu que já não quer aquilo à frente dos olhos, e a lista é dela.
 *
 * Porque é que isto é um prefixo na chave e não uma coluna
 * -------------------------------------------------------
 * Uma coluna `limpo_em` era mais arrumada, e seria a escolha se a tabela
 * estivesse vazia. Não está: foi criada à mão no Supabase central, e qualquer
 * coluna nova obriga a uma ida à consola antes de a funcionalidade existir
 * para quem a pediu. Entre isso e um segundo espaço de nomes na coluna que já
 * existe, ganha o que já funciona no dia em que é escrito.
 *
 * E a troca não é só conveniência: a unicidade da tabela é `(user_id, chave)`,
 * portanto o prefixo dá de graça exactamente a regra certa — uma linha de lido
 * e uma de limpo por aviso, por pessoa, sem nada que as deixe repetir.
 *
 * O limpo vale para a chave, e a chave carrega o instante do facto. Logo, um
 * aviso limpo volta no dia em que a situação mudar: mensagem nova, chave nova,
 * lista outra vez. Limpar não é apagar ninguém.
 */
export const MARCA_LIMPO = "limpo:";

export type TipoDeAviso = "por_responder" | "handoff" | "marcacao";

export type Aviso = {
  /**
   * Identifica a SITUAÇÃO e carrega o instante do facto. É isto que faz o
   * aviso voltar a acender quando a situação muda: chega mensagem nova, o
   * instante muda, a chave muda, e o aviso deixa de estar lido.
   */
  chave: string;
  /** O que fazer a seguir. `null` quando não há ecrã onde a pessoa exista. */
  href: string | null;
  lido: boolean;
  /** A segunda linha: o porquê, em texto. */
  porque: string;
  /** O instante do facto, para ordenar e para escrever "há 2 dias". */
  quando: string | null;
  /** A primeira linha: o nome, ou o número quando não há nome. */
  titulo: string;
  tipo: TipoDeAviso;
};

export type AvisosResultado = {
  avisos: Aviso[];
  erro: string | null;
  /** Quantos ainda não foram vistos. É o número que vai no sino. */
  naoLidos: number;
};

/** O telefone dentro de `whatsapp:351939902228`. */
function telefoneDaConversa(conversa: string) {
  const depoisDosDoisPontos = conversa.slice(conversa.indexOf(":") + 1);

  return /^[0-9]{6,}$/.test(depoisDosDoisPontos) ? depoisDosDoisPontos : null;
}

/** "hoje", "ontem", "há 3 dias" — o que se lê num aviso. */
function hreferencia(quando: string, agora: Date) {
  const horas = Math.floor(
    (agora.getTime() - new Date(quando).getTime()) / 3_600_000,
  );

  if (horas < 1) {
    return "agora mesmo";
  }

  if (horas < 24) {
    return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  }

  const dias = Math.floor(horas / 24);

  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

/** Quanto falta para uma marcação: "dentro de 3 horas". */
function daquiA(quando: string, agora: Date) {
  const minutos = Math.round(
    (new Date(quando).getTime() - agora.getTime()) / 60_000,
  );

  if (minutos <= 0) {
    return "está a começar";
  }

  if (minutos < 60) {
    return `dentro de ${minutos} min`;
  }

  const horas = Math.round(minutos / 60);

  return `dentro de ${horas} ${horas === 1 ? "hora" : "horas"}`;
}

export async function getAvisos(
  clienteSlug: string,
  userId: string,
  agora = new Date(),
): Promise<AvisosResultado> {
  const vazio: AvisosResultado = { avisos: [], erro: null, naoLidos: 0 };

  if (!clienteSlug || !userId) {
    return vazio;
  }

  const base = createAdminClient();
  const desde = new Date(
    agora.getTime() - DIAS_DE_JANELA * 86_400_000,
  ).toISOString();
  const ate = new Date(
    agora.getTime() + HORAS_DE_AGENDA * 3_600_000,
  ).toISOString();

  const [mensagens, contactos, handoffs, marcacoes, lidos] = await Promise.all([
    base
      .from("lexia_mensagens")
      .select("identificador_conversa, direccao, criado_em")
      .eq("cliente_slug", clienteSlug)
      .gte("criado_em", desde)
      .order("criado_em", { ascending: true }),
    base
      .from("lexia_contactos")
      .select("identificador_conversa, nome, telefone, fundido_em")
      .eq("cliente_slug", clienteSlug),
    base
      .from("lexia_handoffs")
      .select("id, criado_em, nome_contacto, telefone, motivo, status")
      .eq("cliente_slug", clienteSlug)
      .in("status", ["pendente", "em_atendimento"])
      .order("criado_em", { ascending: false }),
    base
      .from("lexia_agendamentos")
      .select("id, inicio, nome_cliente, telefone, servico, executor")
      .eq("cliente_slug", clienteSlug)
      .eq("estado", "confirmado")
      .gte("inicio", agora.toISOString())
      .lte("inicio", ate)
      .order("inicio", { ascending: true }),
    base.from("lexia_avisos_lidos").select("chave").eq("user_id", userId),
  ]);

  const falha =
    mensagens.error ?? contactos.error ?? handoffs.error ?? marcacoes.error;

  if (falha) {
    return { ...vazio, erro: "Não foi possível ler os avisos." };
  }

  // Um erro só aqui não deve esconder os avisos: o pior que acontece é
  // aparecerem avisos já lidos. É melhor do que um sino em branco.
  const jaLidos = new Set<string>();
  const limpos = new Set<string>();

  for (const linha of lidos.data ?? []) {
    if (linha.chave.startsWith(MARCA_LIMPO)) {
      limpos.add(linha.chave.slice(MARCA_LIMPO.length));
    } else {
      jaLidos.add(linha.chave);
    }
  }

  /** A ficha de cada conversa, quando existe. */
  const fichaPorConversa = new Map<
    string,
    { nome: string | null; telefone: string | null }
  >();

  for (const contacto of contactos.data ?? []) {
    // Um contacto fundido noutro deixou de ser uma pessoa à parte: o nome
    // certo é o do contacto que o absorveu, por isso não entra aqui.
    if (contacto.identificador_conversa && !contacto.fundido_em) {
      fichaPorConversa.set(contacto.identificador_conversa, {
        nome: contacto.nome,
        telefone: contacto.telefone,
      });
    }
  }

  /** A última mensagem de cada conversa dentro da janela. */
  const ultimaPorConversa = new Map<
    string,
    { criadoEm: string | null; direccao: string | null }
  >();

  for (const mensagem of mensagens.data ?? []) {
    const conversa = mensagem.identificador_conversa;

    // As conversas de teste não são ninguém à espera.
    if (!conversa || conversa.startsWith("teste:")) {
      continue;
    }

    // As mensagens vêm por ordem crescente, por isso a última a ser escrita
    // sobre a chave é a mais recente.
    ultimaPorConversa.set(conversa, {
      criadoEm: mensagem.criado_em,
      direccao: mensagem.direccao,
    });
  }

  const avisos: Aviso[] = [];

  for (const [conversa, ultima] of ultimaPorConversa) {
    if (ultima.direccao !== "recebida" || !ultima.criadoEm) {
      continue;
    }

    const chave = `por_responder:${conversa}:${ultima.criadoEm}`;

    if (limpos.has(chave)) {
      continue;
    }

    const ficha = fichaPorConversa.get(conversa);
    const telefone = ficha?.telefone ?? telefoneDaConversa(conversa);

    avisos.push({
      chave,
      // Sem ficha não há ecrã onde esta pessoa exista — nem Conversas, nem
      // Clientes, nem Pipeline. O aviso continua a valer: o número está aqui.
      href: ficha
        ? `/app/conversas?conversa=${encodeURIComponent(conversa)}`
        : null,
      lido: jaLidos.has(chave),
      porque: ficha
        ? `Escreveu ${hreferencia(ultima.criadoEm, agora)} e ainda não teve resposta.`
        : `Escreveu ${hreferencia(ultima.criadoEm, agora)} e ainda não teve resposta. Não tem ficha no painel.`,
      quando: ultima.criadoEm,
      titulo: ficha?.nome ?? telefone ?? conversa,
      tipo: "por_responder",
    });
  }

  for (const handoff of handoffs.data ?? []) {
    const chave = `handoff:${handoff.id}:${handoff.status}`;

    if (limpos.has(chave)) {
      continue;
    }

    const estado =
      handoff.status === "em_atendimento"
        ? "Está com alguém da equipa"
        : "Está à espera de alguém da equipa";

    avisos.push({
      chave,
      href: "/app/handoffs",
      lido: jaLidos.has(chave),
      porque: handoff.motivo
        ? `${estado}. Motivo: ${handoff.motivo}`
        : `${estado}.`,
      quando: handoff.criado_em,
      titulo:
        handoff.nome_contacto ?? handoff.telefone ?? "Passagem para a equipa",
      tipo: "handoff",
    });
  }

  for (const marcacao of marcacoes.data ?? []) {
    const chave = `marcacao:${marcacao.id}:${marcacao.inicio}`;

    if (limpos.has(chave)) {
      continue;
    }

    const quem = marcacao.nome_cliente ?? marcacao.telefone ?? "Sem nome";
    const oque = marcacao.servico ? ` · ${marcacao.servico}` : "";

    avisos.push({
      chave,
      href: "/app/agenda",
      lido: jaLidos.has(chave),
      porque: `${daquiA(marcacao.inicio, agora)}${oque}${
        marcacao.executor ? ` · ${marcacao.executor}` : ""
      }`,
      quando: marcacao.inicio,
      titulo: quem,
      tipo: "marcacao",
    });
  }

  /*
   * As marcações primeiro, e por ordem de quem chega primeiro.
   *
   * As outras duas famílias ordenam-se pelo mais recente, que é o costume de
   * uma caixa de avisos. As marcações não: um atendimento dentro de uma hora
   * é mais urgente do que um dentro de vinte, e com a ordem do mais recente
   * saía ao contrário — o de amanhã à noite por cima do da próxima hora.
   */
  const peso: Record<TipoDeAviso, number> = {
    handoff: 1,
    marcacao: 0,
    por_responder: 2,
  };

  avisos.sort((a, b) => {
    if (peso[a.tipo] !== peso[b.tipo]) {
      return peso[a.tipo] - peso[b.tipo];
    }

    if (a.tipo === "marcacao") {
      return (a.quando ?? "").localeCompare(b.quando ?? "");
    }

    return (b.quando ?? "").localeCompare(a.quando ?? "");
  });

  return {
    avisos,
    erro: null,
    naoLidos: avisos.filter((aviso) => !aviso.lido).length,
  };
}
