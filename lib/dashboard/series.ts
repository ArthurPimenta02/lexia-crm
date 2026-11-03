import {
  getConversationKey,
  type DashboardMessageMetricRow,
} from "@/lib/dashboard/operational-metrics";

/**
 * As séries do gráfico do dashboard: conversas e agendamentos por dia (ou por
 * hora, quando o período é só hoje), no fuso do cliente.
 *
 * "Conversas" num dia = conversas diferentes em que o cliente final escreveu
 * nesse dia. Uma conversa que escreve três vezes no mesmo dia conta uma vez.
 */

export type Balde = { chave: string; inicio: Date };

function partes(data: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(data);
  const v = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? "00";
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: v("hour") };
}

/** A chave do balde onde uma data cai: "2026-11-03" ou "2026-11-03T14". */
export function chaveDoBalde(data: Date, timeZone: string, porHora: boolean) {
  const { dia, hora } = partes(data, timeZone);
  return porHora ? `${dia}T${hora}` : dia;
}

/** Os baldes do período, em ordem, sem buracos. No máximo 92 dias. */
export function baldesDoPeriodo(
  range: { end: Date; start: Date },
  timeZone: string,
  porHora: boolean,
): Balde[] {
  const passo = porHora ? 3_600_000 : 86_400_000;
  const vistos = new Set<string>();
  const baldes: Balde[] = [];
  // Por dia, começa 1 h depois da meia-noite para uma mudança de hora não
  // empurrar o primeiro balde para o dia anterior. O balde conta assim que
  // começa: hoje entra mesmo a meio do dia.
  for (
    let t = range.start.getTime() + (porHora ? 0 : 3_600_000);
    t < range.end.getTime() && baldes.length < (porHora ? 48 : 92);
    t += passo
  ) {
    const inicio = new Date(t);
    const chave = chaveDoBalde(inicio, timeZone, porHora);
    if (!vistos.has(chave)) {
      vistos.add(chave);
      baldes.push({ chave, inicio });
    }
  }
  return baldes;
}

export function conversasPorBalde(
  mensagens: DashboardMessageMetricRow[],
  baldes: Balde[],
  timeZone: string,
  porHora: boolean,
) {
  const conjuntos = new Map(baldes.map((b) => [b.chave, new Set<string>()]));
  for (const m of mensagens) {
    if (m.direccao !== "recebida" || !m.criado_em) continue;
    const chave = chaveDoBalde(new Date(m.criado_em), timeZone, porHora);
    conjuntos.get(chave)?.add(getConversationKey(m));
  }
  return baldes.map((b) => conjuntos.get(b.chave)?.size ?? 0);
}

export function datasPorBalde(
  datas: string[],
  baldes: Balde[],
  timeZone: string,
  porHora: boolean,
) {
  const contagem = new Map(baldes.map((b) => [b.chave, 0]));
  for (const d of datas) {
    const data = new Date(d);
    if (Number.isNaN(data.getTime())) continue;
    const chave = chaveDoBalde(data, timeZone, porHora);
    if (contagem.has(chave)) contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return baldes.map((b) => contagem.get(b.chave) ?? 0);
}

/**
 * Conversas cuja última mensagem do período foi do cliente: estão à espera
 * de resposta. É o número da saudação ("3 conversas esperando resposta").
 */
export function conversasEsperando(mensagens: DashboardMessageMetricRow[]) {
  const ultima = new Map<string, DashboardMessageMetricRow>();
  for (const m of mensagens) {
    if (!m.criado_em) continue;
    const chave = getConversationKey(m);
    const antes = ultima.get(chave);
    if (!antes || (antes.criado_em ?? "") < m.criado_em) ultima.set(chave, m);
  }
  let n = 0;
  for (const m of ultima.values()) if (m.direccao === "recebida") n += 1;
  return n;
}

/** "Bom dia", "Boa tarde" ou "Boa noite", na hora do cliente. */
export function saudacaoDaHora(timeZone: string, agora = new Date()) {
  const hora = Number(partes(agora, timeZone).hora);
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** O período cortado em agora: os dias que ainda não chegaram ficam de fora. */
export function periodoAteAgora(range: { end: Date; start: Date }, agora = new Date()) {
  return { end: new Date(Math.min(range.end.getTime(), agora.getTime())), start: range.start };
}
