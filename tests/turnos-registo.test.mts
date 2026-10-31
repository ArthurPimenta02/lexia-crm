/**
 * Turnos do agente em código (Fase 18).
 *
 * Duas coisas a guardar:
 *
 * 1. A tabela `lexia_turnos` traz prompts, regras de preço e dados da conversa,
 *    e é lida com o `createAdminClient()` (service_role, ignora o RLS). A única
 *    coisa entre um cliente e esse conteúdo é a verificação de `lexia_admin`
 *    em cada página. Se alguém a tirar, o teste tem de cair.
 *
 * 2. O custo aparece em centavos quando é pequeno: um turno custa entre 1 e 15
 *    centavos de dólar, e "US$ 0,00" esconderia exactamente o número que
 *    interessa.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  descreverEstado,
  formatarCusto,
  formatarDuracao,
  textosDoRedator,
} from "../lib/turnos/formatar";

for (const pagina of ["app/admin/turnos/page.tsx", "app/admin/turnos/[id]/page.tsx"]) {
  test(`${pagina} só abre para lexia_admin`, () => {
    const fonte = readFileSync(pagina, "utf8");
    assert.match(fonte, /profile\.role !== "lexia_admin"\) redirect\("\/app"\)/);
    // A verificação vem antes de qualquer leitura da tabela.
    assert.ok(fonte.indexOf('"lexia_admin"') < fonte.indexOf('from("lexia_turnos")'));
  });
}

test("a migration fecha a tabela a quem não é service_role", () => {
  const sql = readFileSync("supabase/migrations/202610310012_fase18_registo_de_turnos.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.lexia_turnos from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/i);
});

test("custo pequeno aparece em centavos, grande em dólares", () => {
  assert.equal(formatarCusto(0.0834), "8,34¢");
  assert.equal(formatarCusto("0.004"), "0,4¢");
  assert.equal(formatarCusto(1.5), "US$ 1,50");
  assert.equal(formatarCusto(null), "—");
  assert.equal(formatarCusto("abc"), "—");
});

test("duração e estado em linguagem simples", () => {
  assert.equal(formatarDuracao(850), "850 ms");
  assert.equal(formatarDuracao(31250), "31,3 s");
  assert.equal(descreverEstado("parado"), "Não respondeu");
  assert.equal(descreverEstado("outro"), "outro");
});

test("texto do Redator: array, texto cru ou nada", () => {
  assert.deepEqual(textosDoRedator(["a", "b"]), ["a", "b"]);
  assert.deepEqual(textosDoRedator("cru"), ["cru"]);
  assert.deepEqual(textosDoRedator(null), []);
});
