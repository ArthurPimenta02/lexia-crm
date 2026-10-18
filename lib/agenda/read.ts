import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

/**
 * A agenda do dono — a semana, como ele a vê no Google.
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
 * 3. A semana começa à segunda. É como as agendas de trabalho se lêem nos
 *    dois países, e põe sábado e domingo juntos no fim — que é precisamente
 *    quando o Detail trabalha mais.
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

export type DiaAgenda = {
  /** O dia em `AAAA-MM-DD`, já no fuso do cliente. */
  chave: string;
  eventos: EventoAgenda[];
  /** `true` se for hoje no fuso do cliente. */
  hoje: boolean;
};

export type AgendaResultado = {
  dias: DiaAgenda[];
  erro: string | null;
  /** Os executores que aparecem na semana, para o filtro. */
  executores: string[];
  /** A segunda-feira desta semana, em `AAAA-MM-DD`. */
  inicioSemana: string;
  /** Quantos eventos da semana foram marcados pelo agente. */
  marcadosPeloAgente: number;
  proximaSemana: string;
  semanaAnterior: string;
  total: number;
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

export async function getAgendaSemana({
  clienteSlug,
  dia,
  executor,
  timeZone,
  agora = new Date(),
}: {
  clienteSlug: string;
  /** O dia pedido no endereço, `AAAA-MM-DD`. Sem ele, a semana de hoje. */
  dia?: string;
  /** O executor escolhido no filtro, se houver. */
  executor?: string;
  timeZone: string;
  agora?: Date;
}): Promise<AgendaResultado> {
  const hoje = diaNoFuso(agora, timeZone);
  const inicioSemana = segundaDaSemana(diaValido(dia) ?? hoje);
  const fimSemana = somarDias(inicioSemana, 6);

  const vazio: AgendaResultado = {
    dias: [],
    erro: null,
    executores: [],
    inicioSemana,
    marcadosPeloAgente: 0,
    proximaSemana: somarDias(inicioSemana, 7),
    semanaAnterior: somarDias(inicioSemana, -7),
    total: 0,
  };

  if (!clienteSlug) {
    return { ...vazio, erro: "Sem cliente associado a esta conta." };
  }

  const admin = createAdminClient();

  // A janela vai um dia para cada lado em UTC e só depois se filtra pelo dia
  // no fuso do cliente. Sem a folga, um evento das 21h de sexta em Boston —
  // que em UTC já é sábado — ficava de fora da semana a que pertence.
  const de = `${somarDias(inicioSemana, -1)}T00:00:00.000Z`;
  const ate = `${somarDias(fimSemana, 2)}T00:00:00.000Z`;

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

  const chaves = Array.from({ length: 7 }, (_, i) => somarDias(inicioSemana, i));
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

    total += 1;

    if (linha.origem === "agente") {
      marcadosPeloAgente += 1;
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
    dias: chaves.map((chave) => ({
      chave,
      eventos: porDia.get(chave) ?? [],
      hoje: chave === hoje,
    })),
    erro: null,
    executores: [...executores].sort((a, b) => a.localeCompare(b)),
    inicioSemana,
    marcadosPeloAgente,
    proximaSemana: somarDias(inicioSemana, 7),
    semanaAnterior: somarDias(inicioSemana, -7),
    total,
  };
}
