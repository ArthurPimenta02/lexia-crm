/**
 * As séries do gráfico do dashboard (conversas e agendamentos por dia/hora).
 *
 * O que já correu mal e um teste tem de guardar:
 * - cortar o período em "agora" deixava a semana só com o primeiro dia (o
 *   balde de hoje só entrava ao meio-dia) e o gráfico ficava vazio;
 * - a mudança de hora não pode duplicar nem saltar dias;
 * - uma conversa que escreve três vezes no mesmo dia conta uma vez.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  baldesDoPeriodo,
  conversasEsperando,
  conversasPorBalde,
  datasPorBalde,
  saudacaoDaHora,
} from "../lib/dashboard/series";

const NY = "America/New_York";

test("o dia de hoje entra no gráfico assim que começa, mesmo de manhã", () => {
  const baldes = baldesDoPeriodo(
    { end: new Date("2026-11-03T14:00:00Z"), start: new Date("2026-11-02T05:00:00Z") },
    NY,
    false,
  );
  assert.deepEqual(baldes.map((b) => b.chave), ["2026-11-02", "2026-11-03"]);
});

test("a mudança de hora não duplica nem salta dias", () => {
  const marco = baldesDoPeriodo(
    { end: new Date("2026-04-01T04:00:00Z"), start: new Date("2026-03-01T05:00:00Z") },
    NY,
    false,
  );
  assert.equal(marco.length, 31);
  assert.equal(new Set(marco.map((b) => b.chave)).size, 31);
  const novembro = baldesDoPeriodo(
    { end: new Date("2026-12-01T05:00:00Z"), start: new Date("2026-11-01T04:00:00Z") },
    NY,
    false,
  );
  assert.equal(novembro.length, 30);
});

test("por hora: as horas de hoje até agora", () => {
  const baldes = baldesDoPeriodo(
    { end: new Date("2026-11-03T14:30:00Z"), start: new Date("2026-11-03T05:00:00Z") },
    NY,
    true,
  );
  assert.equal(baldes.length, 10);
  assert.equal(baldes[0].chave, "2026-11-03T00");
});

test("conversas por dia contam cada conversa uma vez e só as que o cliente escreveu", () => {
  const baldes = baldesDoPeriodo(
    { end: new Date("2026-11-04T05:00:00Z"), start: new Date("2026-11-02T05:00:00Z") },
    NY,
    false,
  );
  const m = (conversa: string, quando: string, direccao = "recebida") => ({
    cliente_slug: "x",
    criado_em: quando,
    direccao,
    identificador_conversa: conversa,
    origem: null,
  });
  const serie = conversasPorBalde(
    [
      m("a", "2026-11-02T15:00:00Z"),
      m("a", "2026-11-02T16:00:00Z"),
      m("a", "2026-11-02T17:00:00Z"),
      m("b", "2026-11-02T18:00:00Z", "enviada"),
      m("b", "2026-11-03T18:00:00Z"),
      m("c", "2026-11-03T19:00:00Z"),
    ],
    baldes,
    NY,
    false,
  );
  assert.deepEqual(serie, [1, 2]);
  assert.deepEqual(
    datasPorBalde(["2026-11-03T12:00:00Z", "lixo", "2026-12-25T12:00:00Z"], baldes, NY, false),
    [0, 1],
  );
});

test("à espera de resposta = a última mensagem da conversa é do cliente", () => {
  const m = (conversa: string, quando: string, direccao: string) => ({
    cliente_slug: "x",
    criado_em: quando,
    direccao,
    identificador_conversa: conversa,
    origem: null,
  });
  assert.equal(
    conversasEsperando([
      m("a", "2026-11-02T15:00:00Z", "recebida"),
      m("a", "2026-11-02T15:01:00Z", "enviada"),
      m("b", "2026-11-02T16:00:00Z", "enviada"),
      m("b", "2026-11-02T16:05:00Z", "recebida"),
    ]),
    1,
  );
});

test("a saudação segue a hora do cliente, não a do servidor", () => {
  const meioDiaUtc = new Date("2026-11-03T12:00:00Z");
  assert.equal(saudacaoDaHora(NY, meioDiaUtc), "Bom dia");
  assert.equal(saudacaoDaHora("Europe/Lisbon", meioDiaUtc), "Boa tarde");
  assert.equal(saudacaoDaHora("Asia/Tokyo", meioDiaUtc), "Boa noite");
});

test("a curva suave passa pelos pontos e não inventa picos nem valores abaixo de zero", async () => {
  const { caminhoSuave } = await import("../lib/curva");
  const d = caminhoSuave([[0, 100], [10, 100], [20, 0], [30, 100]]);
  const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const ys = nums.filter((_, i) => i % 2 === 1);
  assert.ok(Math.max(...ys) <= 100 && Math.min(...ys) >= 0, d);
  assert.ok(d.startsWith("M0.0,100.0") && d.endsWith("30.0,100.0"), d);
});
