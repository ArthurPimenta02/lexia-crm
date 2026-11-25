"use server";

import { cancelarAgendamento, remarcarAgendamento } from "@/lib/agenda/alterar";
import { marcarPresenca, type Presenca } from "@/lib/agenda/presenca";
import { contextoMovel } from "@/lib/movel/contexto";
import { ehContaDemo } from "@/lib/movel/demo";
import { partesNoFuso } from "@/lib/movel/formato";

type R = { conflitos?: string[]; erro: string | null; ok: boolean };

export async function presencaMovel(id: string, presenca: Presenca | null): Promise<R> {
  const c = await contextoMovel();
  if (!c) return { erro: "Sessão inválida.", ok: false };
  if (presenca !== null && presenca !== "compareceu" && presenca !== "faltou") return { erro: c.t("Escolha uma opção."), ok: false };
  const r = await marcarPresenca({ clienteSlug: c.clienteSlug, id, presenca, userId: c.userId });
  return { erro: r.erro ? c.t(r.erro) : null, ok: r.ok };
}

export async function cancelarMovel(id: string): Promise<R> {
  const c = await contextoMovel();
  if (!c) return { erro: "Sessão inválida.", ok: false };
  if (ehContaDemo(c.clienteSlug)) return { erro: c.t("Na conta de demonstração não se altera a agenda."), ok: false };
  const r = await cancelarAgendamento({ clienteSlug: c.clienteSlug, id });
  return { erro: r.erro ? c.t(r.erro) : null, ok: r.ok };
}

export async function remarcarMovel(id: string, dia: string, hora: string, ignorarConflito: boolean): Promise<R> {
  const c = await contextoMovel();
  if (!c) return { erro: "Sessão inválida.", ok: false };
  if (ehContaDemo(c.clienteSlug)) return { erro: c.t("Na conta de demonstração não se altera a agenda."), ok: false };
  const r = await remarcarAgendamento({ clienteSlug: c.clienteSlug, dia, hora, id, ignorarConflito });
  return {
    conflitos: (r.conflitos ?? []).map((x) => [x.inicio && x.fim ? `${partesNoFuso(x.inicio, c.fuso).hora}–${partesNoFuso(x.fim, c.fuso).hora}` : "", x.titulo ?? ""].filter(Boolean).join(" · ")),
    erro: r.erro ? c.t(r.erro) : null,
    ok: r.ok,
  };
}
