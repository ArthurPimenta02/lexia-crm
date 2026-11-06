import "server-only";

import { cookies } from "next/headers";

import type { AgentLock } from "@/lib/redis/agent-locks";

/**
 * Conta de demonstração ("Demo Dev Lexia", slug clinica_teste): é a que o
 * revisor da Apple usa. Tem dados fictícios e nenhum canal nem Redis ligado,
 * por isso nada sai para fora:
 * - responder uma conversa só grava a mensagem no histórico;
 * - "Assumir" e "Devolver ao agente" ficam num cookie deste aparelho (as
 *   conversas assumidas), que faz o papel das travas do Redis.
 */
export const CLIENTES_DEMO: ReadonlySet<string> = new Set(["clinica_teste"]);

export function ehContaDemo(clienteSlug: string | null | undefined) {
  return CLIENTES_DEMO.has(clienteSlug ?? "");
}

const COOKIE = "lexia_demo_assumidas";

async function lerAssumidas(): Promise<string[]> {
  try {
    const v = JSON.parse((await cookies()).get(COOKIE)?.value ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 40) : [];
  } catch {
    return [];
  }
}

/** Marca (assumir) ou desmarca (devolver) uma conversa como assumida pela equipe. */
export async function mudarAssumidaDemo(conversa: string, assumida: boolean) {
  const atuais = (await lerAssumidas()).filter((c) => c !== conversa);
  const lista = assumida ? [conversa, ...atuais].slice(0, 40) : atuais;
  (await cookies()).set(COOKIE, JSON.stringify(lista), { httpOnly: true, maxAge: 30 * 86400, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}

/** As travas da demo, no mesmo formato das do Redis. */
export async function travasDemo(conversa?: string): Promise<{ locks: AgentLock[] }> {
  const lista = await lerAssumidas();
  return {
    locks: lista
      .filter((c) => !conversa || c === conversa)
      .map((c) => ({ canal: c.split(":")[0], expiresAt: null, identificadorConversa: c, kind: "pausa_manual" as const, reason: null, ttlSeconds: null, value: "demo" })),
  };
}

/** Os serviços da demo (fictícios), no formato dos serviços agendáveis. */
export const SERVICOS_DEMO = [
  { id: "demo-limpeza", nome: "Limpeza de pele", precoBase: 120, executores: [{ chave: "ana", nome: "Ana", duracaoMinutos: 90 }] },
  { id: "demo-drenagem", nome: "Drenagem linfática", precoBase: 120, executores: [{ chave: "ana", nome: "Ana", duracaoMinutos: 60 }] },
  { id: "demo-modeladora", nome: "Massagem modeladora", precoBase: 120, executores: [{ chave: "ana", nome: "Ana", duracaoMinutos: 60 }] },
  { id: "demo-sobrancelha", nome: "Design de sobrancelha", precoBase: 40, executores: [{ chave: "bia", nome: "Bia", duracaoMinutos: 30 }] },
  { id: "demo-henna", nome: "Sobrancelha com henna", precoBase: 55, executores: [{ chave: "bia", nome: "Bia", duracaoMinutos: 45 }] },
  { id: "demo-avaliacao-laser", nome: "Avaliação de laser", precoBase: 50, executores: [{ chave: "ana", nome: "Ana", duracaoMinutos: 30 }] },
];

/** "2026-11-09" + "10:30" no fuso indicado → instante (ms UTC). */
export function instanteNoFuso(data: string, hora: string, fuso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data), h = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!m || !h) return null;
  const comoUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +h[1], +h[2]);
  // Diferença entre o relógio do fuso e o UTC nesse momento (duas voltas acertam a mudança de horário).
  let t = comoUtc;
  for (let k = 0; k < 2; k++) {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(t);
    const v = (x: string) => Number(p.find((y) => y.type === x)!.value);
    const relogio = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"));
    t = comoUtc - (relogio - t);
  }
  return t;
}
