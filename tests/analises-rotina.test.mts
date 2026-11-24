/**
 * Porta HTTPS da rotina de análise (24/11/2026): /api/analises/rotina.
 *
 * O que é que isto está a proteger
 * --------------------------------
 * 1. Sem o token certo (ANALISE_ROTINA_TOKEN, mínimo 32 caracteres) a rota não
 *    lê nem grava nada. Token vazio ou curto no servidor = porta fechada.
 * 2. Na base central só saem as tabelas da lista (conversas, turnos, contactos,
 *    clientes e as análises), nunca lexia_conexoes, perfis ou onboarding, e as
 *    colunas com nome de segredo são tiradas.
 * 3. O relatório só grava as duas tabelas das análises, com gravidade válida.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  filtroDaTabela,
  horasPedidas,
  semColunasEscondidas,
  TABELAS_CRM,
  tokenValido,
  validarRelatorio,
} from "../lib/analises/rotina";

const TOKEN = "x".repeat(40);

test("token: só o exato, com ou sem Bearer; vazio ou curto no servidor fecha a porta", () => {
  assert.equal(tokenValido(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(tokenValido(TOKEN, TOKEN), true);
  assert.equal(tokenValido(`Bearer ${TOKEN}y`, TOKEN), false);
  assert.equal(tokenValido(null, TOKEN), false);
  assert.equal(tokenValido("", ""), false);
  assert.equal(tokenValido("curto", "curto"), false);
  assert.equal(tokenValido(`Bearer ${TOKEN}`, undefined), false);
});

test("base central: nenhuma tabela de segredos ou perfis na lista", () => {
  for (const proibida of ["lexia_conexoes", "profiles", "lexia_onboarding_respostas", "lexia_perfis"]) {
    assert.equal((TABELAS_CRM as readonly string[]).includes(proibida), false, proibida);
  }
  assert.ok((TABELAS_CRM as readonly string[]).includes("lexia_mensagens"));
  assert.ok((TABELAS_CRM as readonly string[]).includes("lexia_turnos"));
});

test("colunas com nome de segredo são tiradas", () => {
  const [l] = semColunasEscondidas([{ id: 1, segredos: "v1.x", token: "t", conteudo: "oi" }]);
  assert.deepEqual(l, { conteudo: "oi", id: 1 });
});

test("filtro: pequena inteira, grande por data, grande sem data não lida", () => {
  const desde = "2026-11-23T00:00:00.000Z";
  assert.deepEqual(filtroDaTabela(10, ["id"], desde), { tipo: "inteira" });
  assert.deepEqual(filtroDaTabela(5000, ["id", "created_at", "criado_em"], desde), {
    coluna: "criado_em",
    desde,
    tipo: "desde",
  });
  assert.deepEqual(filtroDaTabela(5000, ["id"], desde), { tipo: "nao_lida" });
});

test("horas: padrão 24, arredonda para cima, teto de 31 dias", () => {
  assert.equal(horasPedidas(null), 24);
  assert.equal(horasPedidas("abc"), 24);
  assert.equal(horasPedidas("-3"), 24);
  assert.equal(horasPedidas("72"), 72);
  assert.equal(horasPedidas("99999"), 744);
});

test("relatório: aceita o formato do gravar.mjs e recusa gravidade ou id inválidos", () => {
  const bom = {
    analise_id: "182c54e5-76ec-4585-ab24-d333eb4a7394",
    itens: [{ cliente_slug: "detail_by_cordeiro", gravidade: "grave", titulo: "Preço errado" }],
    periodo_fim: "2026-11-24T13:08:56.635Z",
    periodo_inicio: "2026-11-21T13:08:56.635Z",
    resumo: "ok",
    tipo: "geral",
  };
  const v = validarRelatorio(bom);
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.relatorio.itens[0].citacao, null);
  assert.equal(validarRelatorio({ ...bom, analise_id: "1; drop table" }).ok, false);
  assert.equal(validarRelatorio({ ...bom, itens: [{ ...bom.itens[0], gravidade: "critico" }] }).ok, false);
  assert.equal(validarRelatorio({ ...bom, tipo: "outro" }).ok, false);
  assert.equal(validarRelatorio(null).ok, false);
});

test("a rota confere o token antes de tudo e só escreve nas tabelas das análises", () => {
  const fonte = readFileSync(new URL("../app/api/analises/rotina/route.ts", import.meta.url), "utf8");
  for (const metodo of ["GET", "POST"]) {
    const corpo = fonte.slice(fonte.indexOf(`export async function ${metodo}`));
    assert.match(corpo.slice(0, 120), /if \(!autorizado\(request\)\) return negado\(\);/, metodo);
  }
  const escritas = [...fonte.matchAll(/from\("([a-z_]+)"\)\s*\.(insert|update|upsert|delete)/g)].map((m) => m[1]);
  assert.ok(escritas.length > 0);
  for (const t of escritas) assert.ok(t === "lexia_analises" || t === "lexia_analises_itens", t);
  assert.doesNotMatch(fonte, /\.(delete|upsert)\(/);
});
