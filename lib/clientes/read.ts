import { normalizarTelefone, pareceTelefone } from "@/lib/clientes/telefone";
import { getServicosConfig, createServicosClient } from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

/**
 * A ficha de clientes.
 *
 * Quatro coisas que foram medidas e que explicam tudo o que está aqui.
 *
 * 1. Um "cliente" não é uma tabela nova. É uma linha de `lexia_contactos`,
 *    que o Omnichannel cria por cada conversa. Não se inventa uma tabela
 *    paralela porque ela ficaria desactualizada no primeiro cliente novo.
 *
 * 2. Nos canais da Meta, a coluna `telefone` NÃO tem telefone nenhum: tem o
 *    PSID. Medido a 2026-10-16 nos 999 contactos do Detail — messenger entre
 *    15 e 25 dígitos (498 com 17), instagram entre 15 e 17 (67 com 16),
 *    whatsapp entre 11 e 13 (340 com 12). Por isso a lista não filtra por
 *    canal: filtra por o número ter a forma de um número. A janela de 9 a 14
 *    dígitos deixa passar 341 contactos, todos de WhatsApp, e nenhum PSID.
 *
 * 3. O histórico de compras está noutra base de dados. As marcações vivem no
 *    Supabase DO DETAIL, em `marcacoes`, e o `Criar Marcação` grava lá 14
 *    campos — nenhum deles é o `identificador_conversa` nem um id do
 *    contacto. Não há chave estrangeira e não pode haver JOIN de SQL: a única
 *    ponte entre as duas bases é o telefone, e a junção faz-se aqui.
 *
 * 4. Quem marcou pelo Instagram DEU um telefone real — o `criar_marcacao`
 *    recusa o pedido com "NUNCA uses o ID do contacto" se o agente tentar
 *    passar o PSID. Esse número está em `marcacoes` e não em
 *    `lexia_contactos`, portanto essa pessoa aparece aqui pelo lado das
 *    marcações, não pelo lado do contacto.
 */


/** Uma marcação, vista da ficha: o que o cliente comprou e quando. */
export type MarcacaoDoCliente = {
  dataInicio: string | null;
  estado: string | null;
  id: string;
  servico: string | null;
  valor: number | null;
  viatura: string | null;
};

/** Um contacto que foi absorvido por este, e continua a receber mensagens. */
export type ContactoJunto = {
  canal: string;
  id: string;
  identificadorConversa: string;
  telefone: string | null;
};

export type ClienteLinha = {
  canal: string;
  canais: string[];
  email: string | null;
  /** Marcações já realizadas, do mais recente para o mais antigo. */
  historico: MarcacaoDoCliente[];
  id: string;
  idade: number | null;
  /** De quando é a idade registada: 34 anos em 2024 não é 34 hoje. */
  idadeRegistadaEm: string | null;
  identificadorConversa: string;
  /** Contactos de outros canais que o Martim juntou a este. */
  juntos: ContactoJunto[];
  /** Data da última mensagem trocada, em qualquer um dos contactos juntos. */
  mensagemUltima: string | null;
  mensagens: number;
  morada: string | null;
  nome: string;
  notas: string | null;
  /** O que a Meta confirmou. Existe em 3% dos contactos — ver `origemManual`. */
  origemCapturada: string | null;
  /** O canal que o dono escolheu. Lembrado, não medido: os dois convivem. */
  origemManual: string | null;
  origemManualNota: string | null;
  primeiroContactoEm: string | null;
  telefone: string;
  telefoneDigitos: string;
  /** Soma do que já pagou nas marcações que não foram canceladas. */
  totalGasto: number | null;
  /** O carro da pessoa, escrito no painel. Só o Detail usa. */
  viatura: string | null;
};

/** Um contacto sem número utilizável: fica de fora da lista, mas conta-se. */
export type ClientesDeFora = {
  /** Contactos de Meta cujo "telefone" é o PSID. */
  semTelefoneReal: number;
  /** Contactos com número mas sem nome. */
  semNome: number;
};

export type ClientesResultado = {
  clientes: ClienteLinha[];
  deFora: ClientesDeFora;
  /** False quando faltam as credenciais da base do cliente: sem histórico. */
  historicoLigado: boolean;
};

type ContactoRow = {
  atualizado_em: string | null;
  canal: string | null;
  criado_em: string | null;
  email: string | null;
  fundido_em: string | null;
  id: string;
  idade: number | null;
  idade_registada_em: string | null;
  identificador_conversa: string;
  morada: string | null;
  nome: string | null;
  notas: string | null;
  origem_manual: string | null;
  origem_manual_nota: string | null;
  origem_tipo: string | null;
  telefone: string | null;
  viatura: string | null;
};

type MensagemRow = {
  contacto_id: string | null;
  criado_em: string | null;
};

type MarcacaoRow = {
  data_inicio: string | null;
  estado: string | null;
  id: string | number;
  nome_cliente: string | null;
  servico: string | null;
  sinal_valor: number | string | null;
  telefone: string | null;
  valor_previsto: number | string | null;
  viatura: string | null;
};

function paraNumero(valor: number | string | null) {
  if (valor === null) {
    return null;
  }

  const numero = typeof valor === "number" ? valor : Number(valor);

  return Number.isFinite(numero) ? numero : null;
}

/**
 * Lê os contactos do cliente, já sem os da área de testes.
 *
 * O prefixo `teste:` no `identificador_conversa` é como a área de testes
 * marca as conversas dela. Medido no Detail: 81 linhas. Não são clientes.
 */
async function lerContactos(clienteSlug: string) {
  const admin = createAdminClient();

  return fetchAllSupabaseRows<ContactoRow>(async (from, to) => {
    const result = await admin
      .from("lexia_contactos")
      .select(
        "id, nome, telefone, canal, identificador_conversa, notas, fundido_em, criado_em, atualizado_em, email, morada, viatura, idade, idade_registada_em, origem_manual, origem_manual_nota, origem_tipo",
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
      .select("contacto_id, criado_em")
      .eq("cliente_slug", clienteSlug)
      .order("criado_em", { ascending: true })
      .range(from, to);

    return { data: (result.data ?? []) as MensagemRow[], error: result.error };
  });
}

/**
 * Lê as marcações na base de dados DO CLIENTE.
 *
 * Devolve `null` — e não uma lista vazia — quando o cliente não tem base
 * ligada ou faltam as credenciais. A diferença importa no ecrã: lista vazia é
 * "este cliente nunca marcou nada", null é "não sabemos".
 */
async function lerMarcacoes(clienteSlug: string) {
  const config = getServicosConfig(clienteSlug);

  if (!config) {
    return null;
  }

  const externo = createServicosClient(config);

  if (!externo) {
    return null;
  }

  const { data, error } = await fetchAllSupabaseRows<MarcacaoRow>(
    async (from, to) => {
      const result = await externo
        .from("marcacoes")
        .select(
          "id, nome_cliente, telefone, servico, estado, data_inicio, valor_previsto, sinal_valor, viatura",
        )
        .eq("cliente_slug", clienteSlug)
        .order("data_inicio", { ascending: false })
        .range(from, to);

      return { data: (result.data ?? []) as MarcacaoRow[], error: result.error };
    },
  );

  if (error) {
    console.error("[clientes] falha a ler as marcações", error);

    return null;
  }

  return data;
}

/**
 * Clientes do painel: contactos com nome e com um telefone a sério.
 *
 * A regra é a que o Arthur pediu — nome E telefone — aplicada ao número e não
 * ao canal. Aplicá-la ao texto cru da coluna deixava entrar 611 PSIDs
 * disfarçados de telemóvel.
 */
export async function getClientes(
  clienteSlug: string,
): Promise<ClientesResultado> {
  const [contactosResultado, mensagensResultado, marcacoes] = await Promise.all([
    lerContactos(clienteSlug),
    lerMensagens(clienteSlug),
    lerMarcacoes(clienteSlug),
  ]);

  if (contactosResultado.error) {
    console.error("[clientes] falha a ler os contactos", contactosResultado.error);
  }

  const contactos = contactosResultado.data;

  // Mensagens por contacto: quantas e a mais recente.
  const mensagensPorContacto = new Map<
    string,
    { ultima: string | null; total: number }
  >();

  for (const mensagem of mensagensResultado.data) {
    if (!mensagem.contacto_id) {
      continue;
    }

    const actual = mensagensPorContacto.get(mensagem.contacto_id) ?? {
      ultima: null,
      total: 0,
    };

    actual.total += 1;

    if (
      mensagem.criado_em &&
      (!actual.ultima || mensagem.criado_em > actual.ultima)
    ) {
      actual.ultima = mensagem.criado_em;
    }

    mensagensPorContacto.set(mensagem.contacto_id, actual);
  }

  // Marcações por dígitos do telefone. É a única ponte entre as duas bases.
  const marcacoesPorDigitos = new Map<string, MarcacaoDoCliente[]>();

  for (const marcacao of marcacoes ?? []) {
    const digitos = normalizarTelefone(marcacao.telefone);

    if (!digitos) {
      continue;
    }

    const lista = marcacoesPorDigitos.get(digitos) ?? [];

    lista.push({
      dataInicio: marcacao.data_inicio,
      estado: marcacao.estado,
      id: String(marcacao.id),
      servico: marcacao.servico,
      // O sinal é o que já entrou; o previsto é o total do serviço. Para "o
      // que esta pessoa vale" interessa o previsto, com o sinal como reserva
      // quando o previsto não foi preenchido.
      valor:
        paraNumero(marcacao.valor_previsto) ?? paraNumero(marcacao.sinal_valor),
      viatura: marcacao.viatura,
    });

    marcacoesPorDigitos.set(digitos, lista);
  }

  // Os contactos que foram absorvidos, agrupados pelo principal.
  const juntosPorPrincipal = new Map<string, ContactoJunto[]>();

  for (const contacto of contactos) {
    if (!contacto.fundido_em) {
      continue;
    }

    const lista = juntosPorPrincipal.get(contacto.fundido_em) ?? [];

    lista.push({
      canal: contacto.canal ?? "desconhecido",
      id: contacto.id,
      identificadorConversa: contacto.identificador_conversa,
      telefone: contacto.telefone,
    });

    juntosPorPrincipal.set(contacto.fundido_em, lista);
  }

  const deFora: ClientesDeFora = { semNome: 0, semTelefoneReal: 0 };
  const clientes: ClienteLinha[] = [];

  for (const contacto of contactos) {
    // Um contacto absorvido não é uma linha própria: aparece dentro do seu.
    if (contacto.fundido_em) {
      continue;
    }

    const nome = (contacto.nome ?? "").trim();
    const digitos = normalizarTelefone(contacto.telefone);
    const temTelefone = pareceTelefone(contacto.telefone);

    if (!temTelefone) {
      deFora.semTelefoneReal += 1;

      continue;
    }

    if (!nome) {
      deFora.semNome += 1;

      continue;
    }

    const juntos = juntosPorPrincipal.get(contacto.id) ?? [];

    // As mensagens contam-se neste contacto e em todos os que ele absorveu:
    // juntar dois contactos junta as duas conversas numa pessoa só.
    const idsDeConversa = [contacto.id, ...juntos.map((junto) => junto.id)];
    let mensagens = 0;
    let mensagemUltima: string | null = null;

    for (const id of idsDeConversa) {
      const registo = mensagensPorContacto.get(id);

      if (!registo) {
        continue;
      }

      mensagens += registo.total;

      if (registo.ultima && (!mensagemUltima || registo.ultima > mensagemUltima)) {
        mensagemUltima = registo.ultima;
      }
    }

    // O histórico vem do telefone deste contacto e dos que ele absorveu: duas
    // linhas de WhatsApp para a mesma pessoa podem ter marcações de ambos os
    // lados do número.
    const digitosDaPessoa = new Set([
      digitos,
      ...juntos.map((junto) => normalizarTelefone(junto.telefone)),
    ]);
    const historico: MarcacaoDoCliente[] = [];

    for (const chave of digitosDaPessoa) {
      if (!chave) {
        continue;
      }

      historico.push(...(marcacoesPorDigitos.get(chave) ?? []));
    }

    historico.sort((a, b) => (b.dataInicio ?? "").localeCompare(a.dataInicio ?? ""));

    const pagas = historico.filter((linha) => linha.estado !== "cancelada");
    const totalGasto = pagas.reduce(
      (soma, linha) => soma + (linha.valor ?? 0),
      0,
    );

    clientes.push({
      canal: contacto.canal ?? "desconhecido",
      canais: [
        ...new Set([
          contacto.canal ?? "desconhecido",
          ...juntos.map((junto) => junto.canal),
        ]),
      ],
      email: contacto.email,
      historico,
      id: contacto.id,
      idade: contacto.idade,
      idadeRegistadaEm: contacto.idade_registada_em,
      identificadorConversa: contacto.identificador_conversa,
      juntos,
      mensagemUltima,
      mensagens,
      morada: contacto.morada,
      nome,
      notas: contacto.notas,
      origemCapturada: contacto.origem_tipo,
      origemManual: contacto.origem_manual,
      origemManualNota: contacto.origem_manual_nota,
      primeiroContactoEm: contacto.criado_em,
      telefone: contacto.telefone ?? "",
      telefoneDigitos: digitos,
      // Null, e não zero, quando não sabemos: sem credenciais da base do
      // cliente não há marcações, e zero seria uma afirmação falsa.
      totalGasto: marcacoes === null ? null : totalGasto,
      viatura: contacto.viatura,
    });
  }

  // Quem falou mais recentemente primeiro: é a ordem por que o dono pensa.
  clientes.sort((a, b) => {
    const chaveA = a.mensagemUltima ?? a.primeiroContactoEm ?? "";
    const chaveB = b.mensagemUltima ?? b.primeiroContactoEm ?? "";

    return chaveB.localeCompare(chaveA);
  });

  return { clientes, deFora, historicoLigado: marcacoes !== null };
}

/**
 * Contactos com este número, para o aviso de duplicado.
 *
 * Compara `telefone_digitos`, a coluna gerada pelo Postgres, e não o texto de
 * `telefone`: é por o texto vir em dois formatos que os duplicados existem.
 */
export async function procurarPorTelefone(
  clienteSlug: string,
  telefoneBruto: string,
) {
  const digitos = normalizarTelefone(telefoneBruto);

  if (!digitos) {
    return [];
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lexia_contactos")
    .select("id, nome, canal, identificador_conversa, telefone, fundido_em")
    .eq("cliente_slug", clienteSlug)
    .eq("telefone_digitos", digitos);

  if (error) {
    console.error("[clientes] falha a procurar pelo telefone", error);

    return [];
  }

  return (data ?? []).map((linha) => ({
    canal: String(linha.canal ?? "desconhecido"),
    fundidoEm: linha.fundido_em ? String(linha.fundido_em) : null,
    id: String(linha.id),
    identificadorConversa: String(linha.identificador_conversa),
    nome: linha.nome ? String(linha.nome) : "",
    telefone: linha.telefone ? String(linha.telefone) : "",
  }));
}
