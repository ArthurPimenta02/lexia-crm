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

import { explicarFollowup } from "../lib/followups/leitura";

const fu = (extra: Record<string, unknown> = {}) => ({
  id: "f1", canal: "whatsapp", identificador: "whatsapp:17815550000", nome_contacto: "Ana", etapa: 1, status: "agendado",
  ultima_msg_cliente_em: "2026-01-10T10:00:00Z", ultima_msg_agente_em: "2026-01-10T10:05:00Z",
  proxima_tentativa_em: "2026-01-10T15:00:00Z", tentativas_enviadas: 0, motivo_encerramento: null, motivo_juiz: null,
  dia_combinado: null, atualizado_em: null, ...extra,
});
const d = (iso: string) => iso.slice(0, 16);

test("follow-up marcado no WhatsApp: 1.ª de 2, sem janela da Meta", () => {
  const e = explicarFollowup(fu(), d, agora);
  assert.match(e.resumo, /^1\.ª de 2 tentativas · sai 2026-01-10T15:00 \(daqui a 3 h\)$/);
  assert.ok(e.proximos.some((p) => p.includes("não há janela de 24 h")));
  assert.ok(e.proximos.some((p) => p.includes("2.ª tentativa")));
  assert.equal(e.alertas.length, 0);
});

test("Instagram: avisa quando a janela da Meta fecha antes do envio, e com dia combinado avisa o Samuel", () => {
  const tarde = fu({ canal: "instagram", proxima_tentativa_em: "2026-01-11T12:00:00Z" });
  assert.ok(explicarFollowup(tarde, d, agora).alertas[0].includes("vai encerrar sem enviar"));
  const combinado = fu({ canal: "instagram", proxima_tentativa_em: "2026-01-11T12:00:00Z", dia_combinado: "2026-01-11T12:00:00Z" });
  assert.ok(explicarFollowup(combinado, d, agora).alertas[0].includes("Samuel recebe um aviso"));
});

test("2.ª tentativa é a última; encerrado explica o motivo", () => {
  assert.ok(explicarFollowup(fu({ etapa: 2 }), d, agora).proximos.some((p) => p.includes("última tentativa")));
  const fim = explicarFollowup(fu({ status: "cancelado", motivo_encerramento: "nova mensagem na conversa" }), d, agora);
  assert.equal(fim.tom, "fim");
  assert.equal(fim.resumo, "Cancelado: o cliente respondeu");
});
