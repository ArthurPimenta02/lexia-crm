import { createClient } from "@supabase/supabase-js";

/**
 * Configuração por cliente do painel de serviços.
 *
 * Porque é que isto é um registo por slug e não uma tabela: o esquema de
 * serviços é diferente em cada cliente e não generaliza. O Detail tem duas
 * tabelas (catálogo de venda + operacional de agendamento), escalões de
 * viatura e duração por executor; a Miranda não tem catálogo nenhum deste
 * género. Um cliente sem entrada aqui vê o painel vazio com uma mensagem, e
 * não um ecrã meio preenchido.
 */

export type EscalaoConfig = {
  chave: string;
  label: string;
};

export type ExecutorConfig = {
  /**
   * Identificador estável do executor, usado para marcar qual é o principal.
   */
  chave: string;
  /**
   * Coluna de duração na tabela operacional do cliente.
   */
  duracaoColumn: string;
  /**
   * Coluna booleana que diz se este executor faz o serviço.
   */
  executaColumn: string;
  nome: string;
};

export type ServicosClientConfig = {
  /**
   * Tabela operacional: duração por executor e preço base do agendamento.
   */
  agendamentoTable: string;
  /**
   * Tabela mestre de venda, a mesma que alimenta o RAG do agente.
   * O `id` desta tabela é a chave dos custos centrais.
   */
  catalogoTable: string;
  envPrefix: string;
  escaloes: EscalaoConfig[];
  executores: ExecutorConfig[];
  moeda: string;
};

const clientConfigs: Record<string, ServicosClientConfig> = {
  detail_by_cordeiro: {
    agendamentoTable: "agendamento_servicos",
    catalogoTable: "servicos_detail_by_cordeiro",
    envPrefix: "DETAIL_BY_CORDEIRO",
    escaloes: [
      { chave: "citadino", label: "Citadino" },
      { chave: "utilitario", label: "Utilitário" },
      { chave: "sedan_mini_suv", label: "Sedan / Mini SUV" },
      { chave: "berlina_suv_jipe", label: "Berlina / SUV / Jipe" },
    ],
    executores: [
      {
        chave: "martim",
        duracaoColumn: "duracao_martim_minutos",
        executaColumn: "martim_executa",
        nome: "Martim",
      },
      {
        chave: "roberto",
        duracaoColumn: "duracao_roberto_minutos",
        executaColumn: "roberto_executa",
        nome: "Roberto",
      },
    ],
    moeda: "EUR",
  },
};

export function getServicosConfig(clienteSlug: string) {
  return clientConfigs[clienteSlug] ?? null;
}

/**
 * Como é que a tabela do cliente diz **quem** faz o serviço.
 *
 * São duas formas incompatíveis e nenhuma se converte na outra:
 *
 * - `colunas`: o Detail tem uma coluna booleana e uma de duração por pessoa
 *   (`martim_executa` + `duracao_martim_minutos`). Um serviço pode ser feito
 *   pelos dois, em tempos diferentes.
 * - `texto`: a Miranda guarda o nome do profissional numa coluna de texto
 *   (`profissional` = "Samuel" ou "Bruna") e tem uma única duração
 *   (`duracao_agenda_min`). Cada serviço é de uma pessoa só.
 */
export type ExecutoresPorColuna = {
  lista: {
    chave: string;
    duracaoColumn: string;
    executaColumn: string;
    nome: string;
  }[];
  modo: "colunas";
};

export type ExecutoresPorTexto = {
  /** A coluna de texto com o nome do profissional. */
  coluna: string;
  /** A única coluna de duração da tabela, em minutos. */
  duracaoColumn: string;
  /**
   * `valor` é o que está escrito na coluna; `chave` é o que vai para o Google
   * e para o espelho. Na Miranda são iguais de propósito: as 172 linhas que já
   * existem em `lexia_agendamentos` têm `executor` = "Samuel"/"Bruna", e
   * mudar a caixa partia o filtro por pessoa na agenda.
   */
  lista: { chave: string; nome: string; valor: string }[];
  modo: "texto";
};

/**
 * De onde vêm os serviços que dá para marcar pelo painel.
 *
 * Isto é separado do `clientConfigs` de propósito, e não é duplicação por
 * distracção. O `clientConfigs` descreve o esquema de **venda e custos** do
 * Detail — duas tabelas, escalões de viatura, custo por executor — e um
 * cliente que apareça lá liga o painel de Serviços inteiro. A Miranda não tem
 * nada disso: tem uma tabela só, e só precisa de ser marcável.
 */
export type ServicosAgendaveisConfig = {
  /** A coluna booleana do serviço vivo. O Detail escreve `activo`; a Miranda, `ativo`. */
  activoColumn: string;
  envPrefix: string;
  executores: ExecutoresPorColuna | ExecutoresPorTexto;
  moeda: string;
  /** A coluna do preço. Pode vir vazia — a Miranda tem 4 serviços sob avaliação. */
  precoColumn: string;
  tabela: string;
};

const agendaveisConfigs: Record<string, ServicosAgendaveisConfig> = {
  detail_by_cordeiro: {
    activoColumn: "activo",
    envPrefix: "DETAIL_BY_CORDEIRO",
    executores: {
      lista: [
        {
          chave: "martim",
          duracaoColumn: "duracao_martim_minutos",
          executaColumn: "martim_executa",
          nome: "Martim",
        },
        {
          chave: "roberto",
          duracaoColumn: "duracao_roberto_minutos",
          executaColumn: "roberto_executa",
          nome: "Roberto",
        },
      ],
      modo: "colunas",
    },
    moeda: "EUR",
    precoColumn: "preco_base",
    tabela: "agendamento_servicos",
  },
  miranda_skin_experts: {
    activoColumn: "ativo",
    envPrefix: "MIRANDA",
    executores: {
      coluna: "profissional",
      duracaoColumn: "duracao_agenda_min",
      lista: [
        { chave: "Samuel", nome: "Samuel", valor: "Samuel" },
        { chave: "Bruna", nome: "Bruna", valor: "Bruna" },
      ],
      modo: "texto",
    },
    // A clínica é em Boston. "EUR" aqui punha um preço em euros no ecrã de
    // quem cobra em dólares.
    moeda: "USD",
    precoColumn: "preco",
    tabela: "servicos_miranda",
  },
};

export function getServicosAgendaveisConfig(clienteSlug: string) {
  return agendaveisConfigs[clienteSlug] ?? null;
}

/**
 * A moeda em que o cliente cobra, venha ele do painel de serviços ou só da
 * agenda. Sem entrada em nenhum dos dois devolve `null`, porque escrever
 * "EUR" por omissão era inventar um preço em euros para quem cobra noutra.
 */
export function getMoedaDoCliente(clienteSlug: string) {
  return (
    clientConfigs[clienteSlug]?.moeda ??
    agendaveisConfigs[clienteSlug]?.moeda ??
    null
  );
}

/**
 * Cliente da Supabase DO CLIENTE, com a service role key.
 *
 * É service role de propósito: as tabelas de serviços do cliente não têm RLS
 * por utilizador da Lexia — o isolamento aqui é o projecto Supabase ser outro.
 * Quem valida a permissão é a server action antes de chegar a esta função.
 */
export function createServicosClient(config: { envPrefix: string }) {
  const supabaseUrl = process.env[`${config.envPrefix}_SUPABASE_URL`]?.trim();
  const serviceRoleKey =
    process.env[`${config.envPrefix}_SUPABASE_SERVICE_ROLE_KEY`]?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Normaliza um nome de serviço para juntar as duas tabelas do cliente.
 *
 * O catálogo e o operacional não têm chave comum: a única ligação é o nome.
 * Medido em 15/10/2026 no Detail: 14 dos 16 nomes casam exactamente, e nos 14
 * o preço está igual nas duas tabelas. Os 2 que não casam são o "Pacote de
 * Manutenção" (morto) e o "Plano de Manutenção" (vendável mas sem linha de
 * agendamento). Tirar acentos e caixa reduz o risco de um espaço ou um acento
 * trocado partir a ligação.
 */
export function normalizarNomeServico(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Postgres devolve `numeric` como string no PostgREST. Sem isto, somar dá
 * concatenação de texto.
 */
export function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}
