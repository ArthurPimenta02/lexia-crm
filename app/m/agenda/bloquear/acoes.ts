"use server";

import { bloquearHorario } from "@/lib/agenda/alterar";
import { contextoMovel } from "@/lib/movel/contexto";
import { ehContaDemo } from "@/lib/movel/demo";

export async function bloquearMovel(f: { dia: string; executor: string; fim: string; inicio: string; motivo: string }) {
  const c = await contextoMovel();
  if (!c) return { erro: "Sessão inválida.", ok: false };
  if (ehContaDemo(c.clienteSlug)) return { erro: c.t("Na conta de demonstração não se altera a agenda."), ok: false };
  const r = await bloquearHorario({ clienteSlug: c.clienteSlug, ...f });
  return { erro: r.erro ? c.t(r.erro) : null, ok: r.ok };
}
