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
   * Tem de casar com `lexia_executores_custo.executor` na base central.
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
 * Cliente da Supabase DO CLIENTE, com a service role key.
 *
 * É service role de propósito: as tabelas de serviços do cliente não têm RLS
 * por utilizador da Lexia — o isolamento aqui é o projecto Supabase ser outro.
 * Quem valida a permissão é a server action antes de chegar a esta função.
 */
export function createServicosClient(config: ServicosClientConfig) {
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
