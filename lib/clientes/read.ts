import {
  limparNome,
  nomeDaMensagem,
  nomeDoResumo,
} from "@/lib/clientes/nome-dado";
import {
  normalizarTelefone,
  pareceTelefone,
  telefonesNoTexto,
} from "@/lib/clientes/telefone";
import {
  getAtribuicaoPorAnuncio,
  type AtribuicaoAnuncio,
} from "@/lib/meta/atribuicao";
import { chaveTelefone } from "@/lib/pipeline/etapas";
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
 *
 * 5. Desde 19/11 os leads do Instagram e do Messenger entram na lista, a
 *    pedido do Arthur, mesmo sem telefone. O número deles junta-se na
 *    LEITURA, sem escrever nada na base: é um número que a pessoa escreveu
 *    numa mensagem ao agente E que bate (pelos últimos 9 dígitos, a mesma
 *    ponte do pipeline) com uma marcação. As duas condições juntas, porque
 *    só a primeira apanhava NIFs e números de encomenda — medido a 19/11 no
 *    Detail, 30 conversas de Meta têm números escritos e só 3 batem com uma
 *    marcação; na Miranda, 61 e 40. Sem número, a ficha mostra o nome da
 *    conta e o canal — nunca o PSID, que fica só no `identificadorConversa`
 *    para abrir a conversa.
 *
 * 6. Decisão do Arthur (19/11), para a lista não se encher de gente que só
 *    mandou a frase pronta do anúncio e desapareceu: na lista "Todos", uma
 *    ficha de Instagram/Messenger só entra se a pessoa escreveu pelo menos 2
 *    mensagens, OU deu o telefone ao marcar, OU tem nome. As outras vêm na
 *    mesma, marcadas `apenasNoFiltro`, e só se vêem no filtro "Instagram e
 *    Messenger". O nome conta o da conta e o que a pessoa deu na conversa
 *    (ver `lib/clientes/nome-dado.ts`): marcação > resumo do agente > a
 *    própria mensagem.
 */

/** Os canais onde a coluna `telefone` do contacto leva o PSID. */
const canaisDaMeta = new Set(["instagram", "messenger"]);


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
  /**
   * O anúncio exacto de onde a pessoa veio, com o conjunto e a campanha.
   *
   * Null na grande maioria, e isso não quer dizer "não veio de anúncio": o
   * Instagram Direct e o Messenger não enviam referral, e é para lá que vai
   * 76% do gasto do Detail. Só o clique-para-WhatsApp o manda. Ver
   * `lib/meta/atribuicao.ts`.
   */
  anuncio: AtribuicaoAnuncio | null;
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
  /**
   * O nome a mostrar. Numa ficha da Meta sem nome de conta pode ser o nome
   * que a pessoa deu — ver `nomeFonte`. Vazio quando não há nenhum.
   */
  nome: string;
  /**
   * De onde veio o nome: `conta` é o do perfil (ou o que está na ficha);
   * os outros três são o que a pessoa disse, por ordem de confiança —
   * `marcacao` (o nome da marcação que bate pelo telefone), `resumo` (a linha
   * "👤 …"/"Nome: …" do agente) e `mensagem` ("o meu nome é …").
   */
  nomeFonte: "conta" | "marcacao" | "resumo" | "mensagem" | null;
  /**
   * Instagram/Messenger que falou pouco (menos de 2 mensagens, sem nome e
   * sem telefone): fora da lista "Todos", só no filtro de Instagram e
   * Messenger.
   */
  apenasNoFiltro: boolean;
  notas: string | null;
  /** O que a Meta confirmou. Existe em 3% dos contactos — ver `origemManual`. */
  origemCapturada: string | null;
  /** O canal que o dono escolheu. Lembrado, não medido: os dois convivem. */
  origemManual: string | null;
  origemManualNota: string | null;
  primeiroContactoEm: string | null;
  /**
   * Um número a sério, ou vazio. Nunca o PSID: num contacto de Instagram ou
   * Messenger é o número que a pessoa deu ao marcar, ou nada.
   */
  telefone: string;
  telefoneDigitos: string;
  /**
   * De onde veio o número. `contacto` é o do WhatsApp (o da própria
   * conversa); `marcacao` é o que um lead de Instagram/Messenger escreveu ao
   * agente e bate com uma marcação — serve para ligar, mas a ficha não o
   * tem gravado, por isso o registo de serviço à mão continua a pedi-lo.
   */
  telefoneOrigem: "contacto" | "marcacao" | null;
  /** Soma do que já pagou nas marcações que não foram canceladas. */
  totalGasto: number | null;
  /** O carro da pessoa, escrito no painel. Só o Detail usa. */
  viatura: string | null;
};

/** Os contactos que ficam de fora da lista, contados. */
export type ClientesDeFora = {
  /**
   * Não estão "de fora" de tudo: estão na resposta, marcados
   * `apenasNoFiltro`, e só faltam na lista "Todos". Conta-se aqui para o
   * aviso de baixo dizer onde estão.
   */
  soNoFiltroMeta: number;
  /**
   * Instagram/Messenger sem nome, sem número e sem uma única mensagem: uma
   * ficha vazia que a Meta abriu e onde ninguém escreveu nada.
   */
  semConversa: number;
  /** Fora da Meta, sem um número com forma de número. */
  semTelefoneReal: number;
  /** WhatsApp com número mas sem nome. */
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
  origem_source_id: string | null;
  origem_tipo: string | null;
  telefone: string | null;
  viatura: string | null;
};

type MensagemRow = {
  contacto_id: string | null;
  criado_em: string | null;
  direccao: string | null;
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
        "id, nome, telefone, canal, identificador_conversa, notas, fundido_em, criado_em, atualizado_em, email, morada, viatura, idade, idade_registada_em, origem_manual, origem_manual_nota, origem_tipo, origem_source_id",
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
      .select("contacto_id, criado_em, direccao")
      .eq("cliente_slug", clienteSlug)
      .order("criado_em", { ascending: true })
      .range(from, to);

    return { data: (result.data ?? []) as MensagemRow[], error: result.error };
  });
}

/**
 * Os números que os leads escreveram nas mensagens deles.
 *
 * Só as mensagens RECEBIDAS e só as que têm uma sequência de dígitos: o
 * filtro corre no Postgres, por isso o texto das outras nunca sai da base.
 * Medido a 19/11: 398 mensagens no Detail e 166 na Miranda, em menos de 1 s.
 * O texto não chega ao browser — daqui só sai o número, e só se bater com uma
 * marcação.
 */
async function lerTelefonesDitos(clienteSlug: string) {
  const admin = createAdminClient();

  return fetchAllSupabaseRows<{
    contacto_id: string | null;
    conteudo: string | null;
    criado_em: string | null;
  }>(async (from, to) => {
    const result = await admin
      .from("lexia_mensagens")
      .select("contacto_id, conteudo, criado_em")
      .eq("cliente_slug", clienteSlug)
      .eq("direccao", "recebida")
      .filter("conteudo", "match", "[0-9][0-9 ().+-]{7,}[0-9]")
      .order("criado_em", { ascending: true })
      .range(from, to);

    return { data: result.data ?? [], error: result.error };
  });
}

/**
 * As mensagens onde pode estar o nome que a pessoa deu.
 *
 * Duas leituras pequenas, cada uma já filtrada no Postgres por uma expressão:
 * as do agente com a linha de resumo ("👤 …", "Nome: …") e as do cliente
 * com uma apresentação ("o meu nome é", "sou o", "me llamo"…). Medido a
 * 19/11: 70 + 30 mensagens no Detail, 5 + 19 na Miranda. O texto fica no
 * servidor; daqui só sai o nome, e só para fichas da Meta sem nome.
 */
async function lerNomesDitos(clienteSlug: string) {
  const admin = createAdminClient();
  const ler = (direccao: string, expressao: string) =>
    fetchAllSupabaseRows<{
      contacto_id: string | null;
      conteudo: string | null;
    }>(async (from, to) => {
      const result = await admin
        .from("lexia_mensagens")
        .select("contacto_id, conteudo")
        .eq("cliente_slug", clienteSlug)
        .eq("direccao", direccao)
        .filter("conteudo", "match", expressao)
        .order("criado_em", { ascending: true })
        .range(from, to);

      return { data: result.data ?? [], error: result.error };
    });

  const [resumos, apresentacoes] = await Promise.all([
    ler("enviada", "(👤|Nome *:|Name *:|Nombre *:)"),
    ler(
      "recebida",
      "([Mm]eu nome|[Cc]hamo-me|[Mm]e chamo|[Ss]ou |SOU |[Mm]y name is|[Mm]e llamo|[Mm]i nombre es)",
    ),
  ]);

  for (const resultado of [resumos, apresentacoes]) {
    if (resultado.error) {
      console.error("[clientes] falha a ler os nomes ditos", resultado.error);
    }
  }

  return { apresentacoes: apresentacoes.data, resumos: resumos.data };
}

/**
 * Os telefones das marcações no espelho da agenda (`lexia_agendamentos`).
 *
 * É a tabela que os dois clientes têm — a `marcacoes` só existe no Detail, e
 * só com credenciais. Inclui as canceladas: quem desmarcou também deu o número.
 */
async function lerTelefonesDaAgenda(clienteSlug: string) {
  const admin = createAdminClient();

  return fetchAllSupabaseRows<{
    nome_cliente: string | null;
    telefone_digitos: string | null;
  }>(
    async (from, to) => {
      const result = await admin
        .from("lexia_agendamentos")
        .select("telefone_digitos, nome_cliente")
        .eq("cliente_slug", clienteSlug)
        .not("telefone_digitos", "is", null)
        .order("inicio", { ascending: true })
        .range(from, to);

      return { data: result.data ?? [], error: result.error };
    },
  );
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
 * Clientes do painel.
 *
 * No WhatsApp a regra continua a ser a antiga — nome E telefone — aplicada ao
 * número e não ao texto cru da coluna, que deixava entrar 611 PSIDs
 * disfarçados de telemóvel. No Instagram e no Messenger (ver o ponto 5 lá em
 * cima) entra quem tem nome, número dado ao marcar ou pelo menos uma mensagem.
 */
export async function getClientes(
  clienteSlug: string,
): Promise<ClientesResultado> {
  const [
    contactosResultado,
    mensagensResultado,
    marcacoes,
    ditosResultado,
    agendaResultado,
    nomesDitos,
  ] = await Promise.all([
    lerContactos(clienteSlug),
    lerMensagens(clienteSlug),
    lerMarcacoes(clienteSlug),
    lerTelefonesDitos(clienteSlug),
    lerTelefonesDaAgenda(clienteSlug),
    lerNomesDitos(clienteSlug),
  ]);

  if (ditosResultado.error) {
    console.error("[clientes] falha a ler os números ditos", ditosResultado.error);
  }

  if (agendaResultado.error) {
    console.error("[clientes] falha a ler os telefones da agenda", agendaResultado.error);
  }

  if (contactosResultado.error) {
    console.error("[clientes] falha a ler os contactos", contactosResultado.error);
  }

  const contactos = contactosResultado.data;

  // O dicionário dos anúncios pede-se depois de ter os contactos, porque é a
  // lista de ids deles que diz o que perguntar. Uma leitura só para todos, e
  // não uma por ficha: os 1.028 contactos do Detail resolvem-se em 13 ids.
  const anuncios = await getAtribuicaoPorAnuncio(
    clienteSlug,
    contactos.map((contacto) => contacto.origem_source_id),
  );

  // Mensagens por contacto: quantas e a mais recente.
  const mensagensPorContacto = new Map<
    string,
    { recebidas: number; ultima: string | null; total: number }
  >();

  for (const mensagem of mensagensResultado.data) {
    if (!mensagem.contacto_id) {
      continue;
    }

    const actual = mensagensPorContacto.get(mensagem.contacto_id) ?? {
      recebidas: 0,
      ultima: null,
      total: 0,
    };

    actual.total += 1;

    if (mensagem.direccao === "recebida") {
      actual.recebidas += 1;
    }

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

  // Os números das marcações, pela chave dos últimos 9 dígitos. A `marcacoes`
  // do cliente primeiro: é com os dígitos exactos dela que o histórico casa.
  const marcadosPorChave = new Map<string, string>();
  // E o nome que a pessoa deu nessa marcação, pela mesma chave.
  const nomeMarcadoPorChave = new Map<string, string>();

  for (const { digitos, nomeCliente } of [
    ...(marcacoes ?? []).map((marcacao) => ({
      digitos: normalizarTelefone(marcacao.telefone),
      nomeCliente: marcacao.nome_cliente,
    })),
    ...agendaResultado.data.map((linha) => ({
      digitos: normalizarTelefone(linha.telefone_digitos),
      nomeCliente: linha.nome_cliente,
    })),
  ]) {
    const chave = chaveTelefone(digitos);

    if (!chave || !pareceTelefone(digitos)) {
      continue;
    }

    if (!marcadosPorChave.has(chave)) {
      marcadosPorChave.set(chave, digitos);
    }

    const nomeLimpo = limparNome(nomeCliente);

    if (nomeLimpo && !nomeMarcadoPorChave.has(chave)) {
      nomeMarcadoPorChave.set(chave, nomeLimpo);
    }
  }

  // O nome no resumo do agente e o nome na apresentação do cliente, por
  // contacto. Lidos por ordem: o último ganha (o resumo mais recente é o da
  // marcação que ficou).
  const nomeDoResumoPorContacto = new Map<string, string>();
  const nomeDaMensagemPorContacto = new Map<string, string>();

  for (const mensagem of nomesDitos.resumos) {
    const achado = mensagem.contacto_id ? nomeDoResumo(mensagem.conteudo) : null;

    if (achado && mensagem.contacto_id) {
      nomeDoResumoPorContacto.set(mensagem.contacto_id, achado);
    }
  }

  for (const mensagem of nomesDitos.apresentacoes) {
    const achado = mensagem.contacto_id ? nomeDaMensagem(mensagem.conteudo) : null;

    if (achado && mensagem.contacto_id) {
      nomeDaMensagemPorContacto.set(mensagem.contacto_id, achado);
    }
  }

  // O número que cada contacto escreveu e que bate com uma marcação. Lidas por
  // ordem, a última ganha: se a pessoa corrigiu o número, vale o corrigido.
  const marcadoPorContacto = new Map<string, string>();

  for (const mensagem of ditosResultado.data) {
    if (!mensagem.contacto_id) {
      continue;
    }

    for (const digitos of telefonesNoTexto(mensagem.conteudo)) {
      const chave = chaveTelefone(digitos);
      const marcado = chave ? marcadosPorChave.get(chave) : undefined;

      if (marcado) {
        marcadoPorContacto.set(mensagem.contacto_id, marcado);
      }
    }
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
      // O PSID não sai daqui: é um identificador interno, não um número.
      telefone: pareceTelefone(contacto.telefone) ? contacto.telefone : null,
    });

    juntosPorPrincipal.set(contacto.fundido_em, lista);
  }

  const deFora: ClientesDeFora = {
    semConversa: 0,
    soNoFiltroMeta: 0,
    semNome: 0,
    semTelefoneReal: 0,
  };
  const clientes: ClienteLinha[] = [];

  for (const contacto of contactos) {
    // Um contacto absorvido não é uma linha própria: aparece dentro do seu.
    if (contacto.fundido_em) {
      continue;
    }

    const nomeDaConta = (contacto.nome ?? "").trim();
    const temTelefone = pareceTelefone(contacto.telefone);
    const daMeta = !temTelefone && canaisDaMeta.has(contacto.canal ?? "");
    const juntos = juntosPorPrincipal.get(contacto.id) ?? [];

    if (!temTelefone && !daMeta) {
      deFora.semTelefoneReal += 1;

      continue;
    }

    if (temTelefone && !nomeDaConta) {
      deFora.semNome += 1;

      continue;
    }

    // O número dado ao marcar, procurado também nos contactos que este
    // absorveu: a conversa onde a pessoa o escreveu pode ser a outra.
    const marcado = daMeta
      ? [contacto.id, ...juntos.map((junto) => junto.id)]
          .map((id) => marcadoPorContacto.get(id))
          .find(Boolean) ?? null
      : null;
    const digitos = temTelefone
      ? normalizarTelefone(contacto.telefone)
      : (marcado ?? "");

    // As mensagens contam-se neste contacto e em todos os que ele absorveu:
    // juntar dois contactos junta as duas conversas numa pessoa só.
    const idsDeConversa = [contacto.id, ...juntos.map((junto) => junto.id)];
    let mensagens = 0;
    let recebidas = 0;
    let mensagemUltima: string | null = null;

    for (const id of idsDeConversa) {
      const registo = mensagensPorContacto.get(id);

      if (!registo) {
        continue;
      }

      mensagens += registo.total;
      recebidas += registo.recebidas;

      if (registo.ultima && (!mensagemUltima || registo.ultima > mensagemUltima)) {
        mensagemUltima = registo.ultima;
      }
    }

    // Uma ficha de Meta sem nome, sem número e sem mensagens não tem nada
    // para mostrar: é a Meta a abrir uma conversa onde ninguém escreveu.
    if (daMeta && !nomeDaConta && !marcado && mensagens === 0) {
      deFora.semConversa += 1;

      continue;
    }

    // Sem nome de conta, o nome que a pessoa deu, por ordem de confiança.
    // Só para fichas da Meta: no WhatsApp a regra continua nome + número.
    const primeiroDe = (mapa: Map<string, string>) =>
      idsDeConversa.map((id) => mapa.get(id)).find(Boolean) ?? null;
    const chaveMarcada = marcado ? chaveTelefone(marcado) : null;
    const candidatos: [ClienteLinha["nomeFonte"], string | null][] = daMeta && !nomeDaConta
      ? [
          ["marcacao", chaveMarcada ? nomeMarcadoPorChave.get(chaveMarcada) ?? null : null],
          ["resumo", primeiroDe(nomeDoResumoPorContacto)],
          ["mensagem", primeiroDe(nomeDaMensagemPorContacto)],
        ]
      : [];
    const [nomeFonteDado, nomeDado] =
      candidatos.find(([, valor]) => valor) ?? [null, null];
    const nome = nomeDaConta || nomeDado || "";
    const nomeFonte: ClienteLinha["nomeFonte"] = nomeDaConta
      ? "conta"
      : nomeFonteDado;

    // A regra da lista "Todos" (ponto 6 lá em cima).
    const apenasNoFiltro = daMeta && !nome && !marcado && recebidas < 2;

    if (apenasNoFiltro) {
      deFora.soNoFiltroMeta += 1;
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
      apenasNoFiltro,
      anuncio: contacto.origem_source_id
        ? anuncios.get(contacto.origem_source_id.trim()) ?? null
        : null,
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
      nomeFonte,
      notas: contacto.notas,
      origemCapturada: contacto.origem_tipo,
      origemManual: contacto.origem_manual,
      origemManualNota: contacto.origem_manual_nota,
      primeiroContactoEm: contacto.criado_em,
      telefone: temTelefone ? (contacto.telefone ?? "") : digitos,
      telefoneDigitos: digitos,
      telefoneOrigem: temTelefone ? "contacto" : marcado ? "marcacao" : null,
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

/** Um cliente como opção de escolha: o que basta para marcar no nome dele. */
export type ContactoParaEscolha = {
  id: string;
  nome: string;
  telefone: string;
  telefoneDigitos: string;
  viatura: string | null;
};

/**
 * Os clientes que se podem escolher ao marcar, e mais nada.
 *
 * É de propósito que isto não é o `getClientes`. Esse lê os contactos, **todas
 * as mensagens** do cliente e **todas as marcações** da outra base de dados,
 * para calcular histórico e total gasto. Arrastar isso para a agenda era pagar
 * três leituras grandes a cada abertura da página para encher uma caixa de
 * texto.
 *
 * Medido a 2026-10-19: devolve 352 clientes no Detail e 98 na Miranda — 35 KB
 * e 9 KB. Cabe todo no ecrã de uma vez, o que é a razão de não haver aqui
 * pesquisa nenhuma no servidor: a escolha filtra-se no navegador, sem espera.
 *
 * O filtro é o mesmo da ficha de clientes, e pela mesma razão: `pareceTelefone`
 * em vez do canal, senão entravam PSIDs da Meta disfarçados de telemóvel. Um
 * cliente sem número não serve aqui de nada — é o número que liga a marcação
 * ao histórico dele.
 */
export async function getContactosParaEscolha(
  clienteSlug: string,
): Promise<ContactoParaEscolha[]> {
  const { data, error } = await fetchAllSupabaseRows<{
    fundido_em: string | null;
    id: string;
    nome: string | null;
    telefone: string | null;
    viatura: string | null;
  }>(async (from, to) => {
    const admin = createAdminClient();
    const result = await admin
      .from("lexia_contactos")
      .select("id, nome, telefone, viatura, fundido_em")
      .eq("cliente_slug", clienteSlug)
      .not("identificador_conversa", "like", "teste:%")
      .range(from, to);

    return { data: result.data ?? [], error: result.error };
  });

  if (error) {
    console.error("[clientes] falha a ler os clientes para escolha", error);

    return [];
  }

  const escolhas: ContactoParaEscolha[] = [];

  for (const linha of data) {
    const nome = (linha.nome ?? "").trim();

    // Um contacto absorvido não é uma opção à parte: marcar no nome dele era
    // escrever uma venda que a ficha do principal não vai mostrar.
    if (linha.fundido_em || !nome || !pareceTelefone(linha.telefone)) {
      continue;
    }

    escolhas.push({
      id: linha.id,
      nome,
      telefone: String(linha.telefone),
      telefoneDigitos: normalizarTelefone(linha.telefone),
      viatura: linha.viatura?.trim() ? linha.viatura.trim() : null,
    });
  }

  return escolhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
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
