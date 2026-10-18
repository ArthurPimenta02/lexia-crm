import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

/**
 * A agenda do dono — a semana ou o mês, como ele a vê no Google.
 *
 * Quatro coisas medidas a 2026-10-18 que explicam o que está aqui.
 *
 * 1. Isto lê a `lexia_agendamentos`, que é o **espelho** das agendas do
 *    Google, sincronizado de 15 em 15 minutos. O Google continua a ser a
 *    fonte da verdade: é ele que os agentes consultam para saber se uma hora
 *    está livre. Por isso este ecrã não escreve — cada evento leva o link
 *    para o Google, que é onde se altera. Escrever daqui exige uma conta de
 *    serviço do Google que ainda não existe.
 *
 * 2. O dia de um evento é o dia **no fuso do cliente**, não em UTC. Sem isso
 *    uma marcação das 21h de Boston aparecia no dia seguinte: 153 das 172
 *    linhas da Miranda são à tarde ou à noite no fuso dela, e a essa hora a
 *    data em UTC já virou. O fuso de cada cliente vem do
 *    `lib/clientes/timezone.ts` e não se escreve aqui.
 *
 * 3. A semana começa à segunda, e a grelha do mês também. É como as agendas
 *    de trabalho se lêem nos dois países, e põe sábado e domingo juntos no
 *    fim — que é precisamente quando o Detail trabalha mais. O Google começa
 *    ao domingo porque está em locale americano; alinhar as duas vistas uma
 *    com a outra vale mais do que alinhar com ele, senão as colunas saltavam
 *    de sítio ao trocar de vista.
 *
 * 4. O `executor` vem preenchido em todas as linhas e é por isso que serve de
 *    filtro: no Detail são duas agendas separadas (Martim 114, Roberto 67) e
 *    na Miranda uma só (Samuel 171, Bruna 1). A pergunta "o que é que o
 *    Roberto tem na quinta" é a razão de existir deste ecrã.
 */

export type EventoAgenda = {
  /** `true` quando o evento ocupa o dia todo e não tem hora. */
  diaInteiro: boolean;
  executor: string | null;
  fim: string | null;
  id: string;
  inicio: string;
  linkGoogle: string | null;
  localizacao: string | null;
  nomeCliente: string | null;
  /** `agente` quando foi o agente de IA a marcar; `manual` quando foi à mão. */
  origem: string | null;
  servico: string | null;
  telefone: string | null;
  titulo: string | null;
  valorPrevisto: number | null;
};

export const VISTAS = ["semana", "mes"] as const;

export type Vista = (typeof VISTAS)[number];

export type DiaAgenda = {
  /** O dia em `AAAA-MM-DD`, já no fuso do cliente. */
  chave: string;
  eventos: EventoAgenda[];
  /**
   * `true` para os dias que a grelha do mês mostra só para fechar a semana e
   * que pertencem ao mês ao lado. Na vista de semana é sempre `false`.
   */
  foraDoPeriodo: boolean;
  /** `true` se for hoje no fuso do cliente. */
  hoje: boolean;
};

export type AgendaResultado = {
  /** Um dia dentro do período anterior, para o link de recuar. */
  anterior: string;
  /**
   * O dia a levar ao trocar de vista: hoje, quando hoje cai no período que
   * está à vista, e o primeiro dia do período quando não cai. Sem isto, saltar
   * do mês de outubro para a semana deixava o dono na semana de 1 de outubro
   * em vez da semana em que está.
   */
  diaDeReferencia: string;
  dias: DiaAgenda[];
  erro: string | null;
  /** Os executores que aparecem no período, para o filtro. */
  executores: string[];
  /** O primeiro dia do período: a segunda-feira, ou o dia 1 do mês. */
  inicio: string;
  /** Quantos eventos do período foram marcados pelo agente. */
  marcadosPeloAgente: number;
  /** Um dia dentro do período seguinte, para o link de avançar. */
  proximo: string;
  total: number;
  vista: Vista;
};

type AgendamentoRow = {
  dia_inteiro: boolean | null;
  executor: string | null;
  fim: string | null;
  id: string;
  inicio: string;
  link_google: string | null;
  localizacao: string | null;
  nome_cliente: string | null;
  origem: string | null;
  servico: string | null;
  telefone: string | null;
  titulo: string | null;
  valor_previsto: number | string | null;
};

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * O dia de um instante, escrito `AAAA-MM-DD`, no fuso pedido.
 *
 * `en-CA` dá exactamente essa forma sem ter de remontar as partes à mão.
 */
export function diaNoFuso(instante: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(instante);
}

/** Soma dias a um dia escrito `AAAA-MM-DD`, sem tocar em fusos. */
export function somarDias(dia: string, dias: number) {
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);

  return new Date(Date.UTC(ano, mes - 1, diaDoMes) + dias * UM_DIA)
    .toISOString()
    .slice(0, 10);
}

/**
 * A segunda-feira da semana a que um dia pertence.
 *
 * `getUTCDay()` dá 0 ao domingo, e o domingo pertence à semana que começou na
 * segunda anterior — daí o 7 em vez do 0.
 */
export function segundaDaSemana(dia: string) {
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, diaDoMes));
  const diaDaSemana = data.getUTCDay() === 0 ? 7 : data.getUTCDay();

  return somarDias(dia, 1 - diaDaSemana);
}

/** O dia 1 do mês a que um dia pertence. */
export function primeiroDoMes(dia: string) {
  return `${dia.slice(0, 7)}-01`;
}

/**
 * Soma meses ao dia 1 de um mês.
 *
 * Conta em meses absolutos em vez de mexer no número do mês, senão dezembro
 * mais um dava o mês 13 e janeiro menos um dava o mês 0.
 */
export function somarMeses(dia: string, meses: number) {
  const [ano, mes] = dia.split("-").map(Number);
  const total = ano * 12 + (mes - 1) + meses;

  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String(
    (total % 12) + 1,
  ).padStart(2, "0")}-01`;
}

/** O último dia do mês a que um dia pertence. */
export function ultimoDoMes(dia: string) {
  return somarDias(somarMeses(primeiroDoMes(dia), 1), -1);
}

/**
 * Os dias que a vista mostra, em ordem.
 *
 * A grelha do mês não tem 30 dias: tem semanas inteiras, por isso começa na
 * segunda antes do dia 1 e acaba no domingo depois do último dia. Dão 28 a 42
 * dias conforme o mês cair, e é por isso que o número não está escrito à mão.
 */
function diasDoPeriodo(vista: Vista, inicio: string) {
  if (vista === "semana") {
    return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  }

  const primeiro = segundaDaSemana(inicio);
  const ultimo = somarDias(segundaDaSemana(ultimoDoMes(inicio)), 6);
  const dias: string[] = [];

  for (let d = primeiro; d <= ultimo; d = somarDias(d, 1)) {
    dias.push(d);
  }

  return dias;
}

/** Valida `AAAA-MM-DD` e recusa datas impossíveis como `2026-02-31`. */
function diaValido(valor: string | undefined) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return null;
  }

  const [ano, mes, diaDoMes] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, diaDoMes));

  return data.toISOString().slice(0, 10) === valor ? valor : null;
}

const numero = (valor: number | string | null) => {
  if (valor === null) {
    return null;
  }

  const convertido = typeof valor === "number" ? valor : Number(valor);

  return Number.isFinite(convertido) ? convertido : null;
};

export async function getAgenda({
  clienteSlug,
  dia,
  executor,
  timeZone,
  vista = "semana",
  agora = new Date(),
}: {
  clienteSlug: string;
  /** O dia pedido no endereço, `AAAA-MM-DD`. Sem ele, o período de hoje. */
  dia?: string;
  /** O executor escolhido no filtro, se houver. */
  executor?: string;
  timeZone: string;
  vista?: Vista;
  agora?: Date;
}): Promise<AgendaResultado> {
  const hoje = diaNoFuso(agora, timeZone);
  const escolhido = diaValido(dia) ?? hoje;
  const inicio =
    vista === "semana" ? segundaDaSemana(escolhido) : primeiroDoMes(escolhido);

  const chaves = diasDoPeriodo(vista, inicio);
  const primeiroDaGrelha = chaves[0];
  const ultimoDaGrelha = chaves[chaves.length - 1];

  const doPeriodo = (chave: string) =>
    vista === "semana" ? true : chave.slice(0, 7) === inicio.slice(0, 7);

  const vazio: AgendaResultado = {
    anterior:
      vista === "semana" ? somarDias(inicio, -7) : somarMeses(inicio, -1),
    diaDeReferencia: doPeriodo(hoje) && chaves.includes(hoje) ? hoje : inicio,
    dias: [],
    erro: null,
    executores: [],
    inicio,
    marcadosPeloAgente: 0,
    proximo: vista === "semana" ? somarDias(inicio, 7) : somarMeses(inicio, 1),
    total: 0,
    vista,
  };

  if (!clienteSlug) {
    return { ...vazio, erro: "Sem cliente associado a esta conta." };
  }

  const admin = createAdminClient();

  // A janela vai um dia para cada lado em UTC e só depois se filtra pelo dia
  // no fuso do cliente. Sem a folga, um evento das 21h de sexta em Boston —
  // que em UTC já é sábado — ficava de fora da semana a que pertence.
  const de = `${somarDias(primeiroDaGrelha, -1)}T00:00:00.000Z`;
  const ate = `${somarDias(ultimoDaGrelha, 2)}T00:00:00.000Z`;

  const { data, error } = await fetchAllSupabaseRows<AgendamentoRow>(
    async (from, to) => {
      const result = await admin
        .from("lexia_agendamentos")
        .select(
          "id, inicio, fim, dia_inteiro, titulo, servico, nome_cliente, telefone, executor, origem, link_google, localizacao, valor_previsto",
        )
        .eq("cliente_slug", clienteSlug)
        .neq("estado", "cancelado")
        .gte("inicio", de)
        .lt("inicio", ate)
        .order("inicio", { ascending: true })
        .range(from, to);

      return {
        data: (result.data ?? []) as AgendamentoRow[],
        error: result.error,
      };
    },
  );

  if (error) {
    return { ...vazio, erro: "Não foi possível carregar a agenda." };
  }

  const porDia = new Map<string, EventoAgenda[]>(chaves.map((c) => [c, []]));
  const executores = new Set<string>();
  let total = 0;
  let marcadosPeloAgente = 0;

  for (const linha of data) {
    const instante = new Date(linha.inicio);

    if (Number.isNaN(instante.getTime())) {
      continue;
    }

    const chave = diaNoFuso(instante, timeZone);
    const doDia = porDia.get(chave);

    if (!doDia) {
      continue;
    }

    // O filtro aplica-se depois de recolher os executores, senão escolher um
    // deles fazia o outro desaparecer da barra e já não havia como voltar.
    if (linha.executor) {
      executores.add(linha.executor);
    }

    if (executor && linha.executor !== executor) {
      continue;
    }

    // Os dias que a grelha do mês traz do mês ao lado contam-se para fora da
    // soma: o cabeçalho diz "outubro", e dizer "15 marcações" a incluir dois
    // dias de setembro era um número que não batia com coisa nenhuma.
    if (doPeriodo(chave)) {
      total += 1;

      if (linha.origem === "agente") {
        marcadosPeloAgente += 1;
      }
    }

    doDia.push({
      diaInteiro: linha.dia_inteiro === true,
      executor: linha.executor,
      fim: linha.fim,
      id: linha.id,
      inicio: linha.inicio,
      linkGoogle: linha.link_google,
      localizacao: linha.localizacao,
      nomeCliente: linha.nome_cliente,
      origem: linha.origem,
      servico: linha.servico,
      telefone: linha.telefone,
      titulo: linha.titulo,
      valorPrevisto: numero(linha.valor_previsto),
    });
  }

  // Dentro do dia, o que ocupa o dia todo vem primeiro — não tem hora para
  // competir com as outras — e o resto por ordem de relógio.
  for (const eventos of porDia.values()) {
    eventos.sort((a, b) => {
      if (a.diaInteiro !== b.diaInteiro) {
        return a.diaInteiro ? -1 : 1;
      }

      return a.inicio.localeCompare(b.inicio);
    });
  }

  return {
    ...vazio,
    dias: chaves.map((chave) => ({
      chave,
      eventos: porDia.get(chave) ?? [],
      foraDoPeriodo: !doPeriodo(chave),
      hoje: chave === hoje,
    })),
    executores: [...executores].sort((a, b) => a.localeCompare(b)),
    marcadosPeloAgente,
    total,
  };
}
