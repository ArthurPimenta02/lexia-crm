/**
 * Follow-ups e lembretes (/admin/followups).
 * As regras do lembrete são as do agente (nó "Travas de Lembrete"): um por
 * consulta, entre 24 h e 2 h antes. Dados inventados: o repositório é público.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { emQuanto, estadoDoLembrete, motivoLegivel } from "../lib/followups/leitura";

const agora = Date.parse("2026-01-10T12:00:00Z");
const consulta = (inicio: string, extra: Record<string, unknown> = {}) => ({
  id: "1", nome_cliente: "Ana Teste", telefone: "17815550000", servico: "Limpeza", inicio, status: "confirmado",
  lembrete_enviado_em: null, criado_via: "agente", ...extra,
});

test("lembrete: enviado, a enviar, agendado e em cima da hora", () => {
  assert.equal(estadoDoLembrete(consulta("2026-01-11T10:00:00Z", { lembrete_enviado_em: "2026-01-10T11:00:00Z" }), agora).tipo, "enviado");
  assert.equal(estadoDoLembrete(consulta("2026-01-11T10:00:00Z"), agora).tipo, "a_enviar");
  const ag = estadoDoLembrete(consulta("2026-01-13T12:00:00Z"), agora);
  assert.deepEqual(ag, { tipo: "agendado", aPartirDe: "2026-01-12T12:00:00.000Z" });
  assert.deepEqual(estadoDoLembrete(consulta("2026-01-10T13:00:00Z"), agora), { tipo: "nao_sai", motivo: "marcada em cima da hora" });
  assert.equal(estadoDoLembrete(consulta("2026-01-11T10:00:00Z", { telefone: "123" }), agora).tipo, "nao_sai");
  assert.equal(estadoDoLembrete(consulta("2026-01-11T10:00:00Z", { status: "cancelado" }), agora).tipo, "nao_sai");
});

test("textos simples", () => {
  assert.equal(emQuanto("2026-01-10T15:00:00Z", agora), "daqui a 3 h");
  assert.equal(emQuanto("2026-01-10T11:40:00Z", agora), "atrasado 20 min");
  assert.equal(motivoLegivel("nova mensagem na conversa"), "o cliente respondeu");
  assert.equal(motivoLegivel("outro motivo"), "outro motivo");
});

test("a página só abre para lexia_admin e não escreve na base do cliente", () => {
  const src = readFileSync(new URL("../app/admin/followups/page.tsx", import.meta.url), "utf8");
  assert.match(src, /profile\.role !== "lexia_admin"\) redirect\("\/app"\)/);
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
});
