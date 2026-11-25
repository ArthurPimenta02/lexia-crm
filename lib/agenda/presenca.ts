import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { lerAgendamentoDaEmpresa } from "./alterar";

/**
 * Compareceu / Faltou (25/11/2026). Guardado em lexia_presencas pela chave do
 * espelho (empresa + agenda + evento), que a sincronização não reescreve.
 */

export type Presenca = "compareceu" | "faltou";
export const chavePresenca = (calendarioId: string, eventId: string) => `${calendarioId}|${eventId}`;

export async function marcarPresenca({ clienteSlug, id, presenca, userId }: { clienteSlug: string; id: string; presenca: Presenca | null; userId: string }) {
  const ag = await lerAgendamentoDaEmpresa(clienteSlug, id);
  if (!ag) return { erro: "Agendamento não encontrado.", ok: false };
  if (Date.parse(ag.inicio) > Date.now()) return { erro: "Este atendimento ainda não começou.", ok: false };
  const base = createAdminClient();
  const chave = { calendario_id: ag.calendario_id, cliente_slug: clienteSlug, event_id: ag.event_id };
  const { error } = presenca
    ? await base.from("lexia_presencas").upsert({ ...chave, marcado_em: new Date().toISOString(), marcado_por: userId, presenca }, { onConflict: "cliente_slug,calendario_id,event_id" })
    : await base.from("lexia_presencas").delete().eq("cliente_slug", clienteSlug).eq("calendario_id", ag.calendario_id).eq("event_id", ag.event_id);
  if (error) {
    console.error("[presenca] gravar", error);
    return { erro: "Não foi possível guardar.", ok: false };
  }
  return { erro: null, ok: true };
}

/** As presenças de uma lista de agendamentos, por chave. Sem tabela (antes do SQL) devolve vazio. */
export async function presencasDe(clienteSlug: string, eventos: { calendario_id: string; event_id: string }[]) {
  const mapa = new Map<string, Presenca>();
  const ids = [...new Set(eventos.map((e) => e.event_id))];
  if (!ids.length) return mapa;
  const base = createAdminClient();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await base.from("lexia_presencas").select("calendario_id, event_id, presenca").eq("cliente_slug", clienteSlug).in("event_id", ids.slice(i, i + 200));
    if (error) return mapa;
    for (const l of data ?? []) mapa.set(chavePresenca(String(l.calendario_id), String(l.event_id)), l.presenca as Presenca);
  }
  return mapa;
}

export type ParaConfirmar = { calendario_id: string; event_id: string; fim: string; id: string; inicio: string; nome: string; servico: string | null; telefone: string | null };

/**
 * Atendimentos que já acabaram (últimos 7 dias) e ainda não têm compareceu/
 * faltou. Só os que são de um cliente (com nome ou telefone): "Thanksgiving",
 * bloqueios e eventos pessoais não pedem confirmação.
 */
export async function paraConfirmar(clienteSlug: string, agora = new Date()): Promise<ParaConfirmar[]> {
  const desde = new Date(agora.getTime() - 7 * 86_400_000).toISOString();
  const { data } = await createAdminClient()
    .from("lexia_agendamentos")
    .select("id, calendario_id, event_id, inicio, fim, nome_cliente, telefone_digitos, servico, estado, dia_inteiro, dados")
    .eq("cliente_slug", clienteSlug)
    .neq("estado", "cancelado")
    .eq("dia_inteiro", false)
    .gte("inicio", desde)
    .lt("fim", agora.toISOString())
    .order("inicio", { ascending: false })
    .limit(300);
  const linhas = (data ?? []).filter((l) => (l.nome_cliente || l.telefone_digitos) && !(l.dados as { bloqueio?: boolean } | null)?.bloqueio);
  const feitas = await presencasDe(clienteSlug, linhas as { calendario_id: string; event_id: string }[]);
  return linhas
    .filter((l) => !feitas.has(chavePresenca(String(l.calendario_id), String(l.event_id))))
    .map((l) => ({
      calendario_id: String(l.calendario_id), event_id: String(l.event_id), fim: String(l.fim), id: String(l.id), inicio: String(l.inicio),
      nome: String(l.nome_cliente ?? "").trim(), servico: (l.servico as string | null) ?? null, telefone: (l.telefone_digitos as string | null) ?? null,
    }));
}
