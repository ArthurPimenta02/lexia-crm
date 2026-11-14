import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Temperatura do lead (14/11/2026): frio, morno ou quente, com uma frase de
 * motivo. Quem decide é o Juiz de Follow-up dos agentes (IA que lê a conversa,
 * com travas no código) e cada avaliação fica em `lexia_eventos` com o tipo
 * `lead_temperatura`. A temperatura atual é a do evento mais recente da
 * conversa — sobe e desce (quem desiste volta a frio).
 *
 * A fila dos follow-ups de 3 e 7 dias sai dos eventos
 * `followup_longo_agendado`: o agendado mais recente de cada conversa que não
 * teve depois um envio, cancelamento ou encerramento.
 */
export type Temperatura = "frio" | "morno" | "quente";
export type TemperaturaLead = { temperatura: Temperatura; motivo: string; em: string };

export const TEMPERATURAS: Temperatura[] = ["quente", "morno", "frio"];
export const ehTemperatura = (v: unknown): v is Temperatura =>
  v === "frio" || v === "morno" || v === "quente";

type EventoTemperatura = {
  identificador_conversa: string | null;
  ocorrido_em: string;
  dados: Record<string, unknown> | null;
};

/** O evento mais recente de cada conversa (os eventos chegam do mais novo para o mais velho). */
export function temperaturaPorConversa(eventos: EventoTemperatura[]) {
  const mapa = new Map<string, TemperaturaLead>();
  const ordenados = [...eventos].sort((a, b) => String(b.ocorrido_em).localeCompare(String(a.ocorrido_em)));

  for (const e of ordenados) {
    const conversa = e.identificador_conversa;
    const t = e.dados?.temperatura;
    if (!conversa || mapa.has(conversa) || !ehTemperatura(t)) continue;
    mapa.set(conversa, { temperatura: t, motivo: String(e.dados?.motivo ?? "").trim(), em: e.ocorrido_em });
  }

  return mapa;
}

/**
 * Lê as temperaturas do cliente (últimos 90 dias). Se a leitura falhar, a tela
 * segue sem elas — a temperatura é um extra, não pode apagar as conversas.
 */
export async function lerTemperaturas(supabase: SupabaseClient, clienteSlug: string) {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("lexia_eventos")
    .select("identificador_conversa, ocorrido_em, dados")
    .eq("cliente_slug", clienteSlug)
    .eq("tipo", "lead_temperatura")
    .gte("ocorrido_em", desde)
    .order("ocorrido_em", { ascending: false })
    .limit(5000);

  if (error || !data) return new Map<string, TemperaturaLead>();
  return temperaturaPorConversa(data as EventoTemperatura[]);
}

export type FollowupLongo = {
  conversa: string;
  etapa: number;
  quando: string;
  temperatura: Temperatura | null;
  motivo: string;
};

type EventoFila = { tipo: string; identificador_conversa: string | null; ocorrido_em: string; dados: Record<string, unknown> | null };

const FECHAM = new Set(["followup_enviado", "followup_cancelado", "followup_encerrado"]);

/** Os follow-ups longos ainda por sair: o agendado mais recente sem envio/cancelamento/encerramento depois. */
export function filaDosLongos(eventos: EventoFila[], agora = Date.now()): FollowupLongo[] {
  const porConversa = new Map<string, EventoFila[]>();
  for (const e of eventos) {
    if (!e.identificador_conversa) continue;
    porConversa.set(e.identificador_conversa, [...(porConversa.get(e.identificador_conversa) ?? []), e]);
  }

  const fila: FollowupLongo[] = [];
  for (const [conversa, lista] of porConversa) {
    const ordenada = [...lista].sort((a, b) => String(a.ocorrido_em).localeCompare(String(b.ocorrido_em)));
    const ultimoAgendado = [...ordenada].reverse().find((e) => e.tipo === "followup_longo_agendado");
    if (!ultimoAgendado) continue;
    const fechou = ordenada.some((e) => FECHAM.has(e.tipo) && e.ocorrido_em > ultimoAgendado.ocorrido_em);
    if (fechou) continue;
    const quando = String(ultimoAgendado.dados?.quando ?? "");
    const t = Date.parse(quando);
    // Mais de 48 h atrasado: o agente já o encerrou (follow-up que não faz sentido sair).
    if (!Number.isFinite(t) || t < agora - 48 * 3_600_000) continue;
    const temp = ultimoAgendado.dados?.temperatura;
    fila.push({
      conversa,
      etapa: Number(ultimoAgendado.dados?.etapa ?? 0),
      quando,
      temperatura: ehTemperatura(temp) ? temp : null,
      motivo: String(ultimoAgendado.dados?.motivo ?? "").trim(),
    });
  }

  return fila.sort((a, b) => a.quando.localeCompare(b.quando));
}

/** Lê a fila com a service role (tela do admin), filtrada pelo cliente. */
export async function lerFilaDosLongos(supabase: SupabaseClient, clienteSlug: string) {
  const desde = new Date(Date.now() - 12 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("lexia_eventos")
    .select("tipo, identificador_conversa, ocorrido_em, dados")
    .eq("cliente_slug", clienteSlug)
    .in("tipo", ["followup_longo_agendado", ...FECHAM])
    .gte("ocorrido_em", desde)
    .order("ocorrido_em", { ascending: true })
    .limit(10000);

  if (error || !data) return { fila: [] as FollowupLongo[], erro: error?.message ?? null };
  return { fila: filaDosLongos(data as EventoFila[]), erro: null };
}
