/**
 * 13/11/2026 (Arthur): o filtro de tempo de todas as telas é
 * Hoje · Ontem · Uma semana · Período total · Personalizado.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { dashboardPeriodOptions, getDateRange, getDateInputValue, getInclusiveRangeEnd } from "../lib/dashboard/date-range";
import { baldesDoPeriodo, granularidadeDoPeriodo } from "../lib/dashboard/series";
import { conversationPeriodOptions, getConversationDateRange } from "../lib/conversations/date-range";

const TZ = "America/New_York";
const dia = (d: Date) => getDateInputValue(d, TZ);

test("as cinco opções, nesta ordem, em todas as telas (conversas incluídas)", () => {
  assert.deepEqual(dashboardPeriodOptions.map((o) => o.label), ["Hoje", "Ontem", "Uma semana", "Período total", "Personalizado"]);
  assert.deepEqual(conversationPeriodOptions.map((o) => o.key), dashboardPeriodOptions.map((o) => o.key));
});

test("ontem = o dia anterior inteiro; uma semana = últimos 7 dias com hoje; período total desde 01/2025", () => {
  const hoje = getDateRange("hoje", "", "", TZ);
  const ontem = getDateRange("ontem", "", "", TZ);
  assert.equal(ontem.end.getTime(), hoje.start.getTime());
  assert.equal(Math.round((ontem.end.getTime() - ontem.start.getTime()) / 3_600_000) >= 23, true);
  const semana = getDateRange("semana", "", "", TZ);
  assert.equal(semana.end.getTime(), hoje.end.getTime());
  assert.equal(Math.round((semana.end.getTime() - semana.start.getTime()) / 86_400_000), 7);
  const tudo = getDateRange("tudo", "", "", TZ);
  assert.equal(dia(tudo.start), "2025-01-01");
  assert.equal(dia(getInclusiveRangeEnd(tudo.end)), dia(getInclusiveRangeEnd(hoje.end)));
  assert.equal(getConversationDateRange("tudo", "", "", TZ).key, "tudo");
  // "mes" já não aparece, mas um link antigo continua a funcionar
  assert.equal(getDateRange("mes", "", "", TZ).key, "mes");
});

test("gráfico: por hora em hoje/ontem, por dia até 92 dias, por mês no período total", () => {
  assert.equal(granularidadeDoPeriodo(getDateRange("ontem", "", "", TZ)), true);
  assert.equal(granularidadeDoPeriodo(getDateRange("semana", "", "", TZ)), false);
  const tudo = getDateRange("tudo", "", "", TZ);
  assert.equal(granularidadeDoPeriodo(tudo), "mes");
  const baldes = baldesDoPeriodo(tudo, TZ, "mes");
  assert.equal(baldes[0].chave, "2025-01");
  assert.match(baldes[baldes.length - 1].chave, /^\d{4}-\d{2}$/);
  assert.ok(baldes.length >= 12 && baldes.length <= 60);
});
