/**
 * A lista "à espera de uma pessoa" do app (lib/movel/esperas-regra.ts): a
 * mesma regra serve a aba Conversas, o chip "Esperando", o Hoje e o número
 * no ícone do iPhone. O Arthur via um número que não encontrava: estes casos
 * guardam o que conta e o que não conta.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { esperasDe, resolvidasDesde } from "../lib/movel/esperas-regra";

const agora = new Date("2026-11-14T15:00:00.000Z");
const m = (identificador_conversa: string, criado_em: string) => ({ criado_em, identificador_conversa });

test("à espera: recebida na pausa sem enviada depois", () => {
  const lista = esperasDe([m("whatsapp:1", "2026-11-14T14:00:00.000Z"), m("whatsapp:1", "2026-11-14T14:10:00.000Z")], [], agora);
  assert.deepEqual(lista, [{ conversa: "whatsapp:1", desde: "2026-11-14T14:00:00.000Z", ultima: "2026-11-14T14:10:00.000Z" }]);
});

test("respondida depois da pausa: deixa de estar à espera", () => {
  const naPausa = [m("whatsapp:1", "2026-11-14T14:00:00.000Z")];
  assert.deepEqual(esperasDe(naPausa, [m("whatsapp:1", "2026-11-14T14:05:00.000Z")], agora), []);
  // Uma enviada ANTES da pausa não responde a nada.
  assert.equal(esperasDe(naPausa, [m("whatsapp:1", "2026-11-14T13:00:00.000Z")], agora).length, 1);
  // Nova mensagem na pausa depois da resposta: volta a esperar, desde a nova.
  const voltou = esperasDe([...naPausa, m("whatsapp:1", "2026-11-14T14:30:00.000Z")], [m("whatsapp:1", "2026-11-14T14:05:00.000Z")], agora);
  assert.deepEqual(voltou.map((e) => e.desde), ["2026-11-14T14:30:00.000Z"]);
});

test("conversas da Área de testes (teste:…) nunca contam", () => {
  assert.deepEqual(esperasDe([m("teste:abc", "2026-11-14T14:00:00.000Z")], [], agora), []);
});

test("mais de 48 h: já não conta", () => {
  assert.deepEqual(esperasDe([m("whatsapp:1", "2026-11-12T14:59:00.000Z")], [], agora), []);
  assert.equal(esperasDe([m("whatsapp:1", "2026-11-12T15:01:00.000Z")], [], agora).length, 1);
});

test("ordem: quem espera há mais tempo primeiro", () => {
  const lista = esperasDe([m("whatsapp:2", "2026-11-14T14:00:00.000Z"), m("whatsapp:1", "2026-11-14T10:00:00.000Z")], [], agora);
  assert.deepEqual(lista.map((e) => e.conversa), ["whatsapp:1", "whatsapp:2"]);
});

test("já resolvido hoje: respondida hoje e não voltou a esperar", () => {
  const naPausa = [m("whatsapp:1", "2026-11-13T20:00:00.000Z"), m("whatsapp:2", "2026-11-14T09:00:00.000Z"), m("whatsapp:3", "2026-11-14T09:00:00.000Z")];
  const enviadas = [m("whatsapp:1", "2026-11-14T08:00:00.000Z"), m("whatsapp:2", "2026-11-13T23:00:00.000Z")];
  assert.deepEqual(resolvidasDesde(naPausa, enviadas, "2026-11-14T00:00:00.000Z", agora), ["whatsapp:1"]);
});
