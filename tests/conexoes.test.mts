/**
 * Conexões (Fase 19): o cofre dos tokens de cada agente.
 *
 * O que um teste tem de guardar:
 *
 * 1. O segredo gravado não se lê sem a chave, e um byte alterado faz a
 *    leitura FALHAR (GCM). Devolver lixo seria pior: o agente usava-o como
 *    token e o erro aparecia longe daqui.
 *
 * 2. Um campo de segredo deixado em branco mantém o valor antigo. A tela
 *    nunca devolve o segredo, por isso o campo vem sempre vazio; sem esta
 *    regra, gravar o formulário para mudar a URL apagava o token.
 *
 * 3. A página nunca pede a coluna `segredos` à base, e a acção verifica
 *    `lexia_admin` antes de ler ou gravar. A tabela é lida com a service_role,
 *    que ignora o RLS: estas verificações são a única barreira.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cifrar, decifrar, finalDe } from "../lib/conexoes/cifra";
import { juntarSegredos, tiposDoAmbito, TIPOS_CONEXAO } from "../lib/conexoes/tipos";

const chave = randomBytes(32).toString("base64");
const outra = randomBytes(32).toString("base64");

test("cifra e decifra com a mesma chave", () => {
  const texto = cifrar({ token: "abc123secreto" }, chave);
  assert.doesNotMatch(texto, /abc123secreto/);
  assert.deepEqual(decifrar(texto, chave), { token: "abc123secreto" });
});

test("cada gravação tem IV novo: o mesmo segredo não dá o mesmo texto", () => {
  assert.notEqual(cifrar({ t: "x" }, chave), cifrar({ t: "x" }, chave));
});

test("outra chave ou um byte alterado: falha, não devolve lixo", () => {
  const texto = cifrar({ token: "abc" }, chave);
  assert.throws(() => decifrar(texto, outra));
  const partes = texto.split(".");
  const dados = Buffer.from(partes[3], "base64url");
  dados[0] ^= 1;
  partes[3] = dados.toString("base64url");
  assert.throws(() => decifrar(partes.join("."), chave));
});

test("sem chave ou chave do tamanho errado: erro claro", () => {
  assert.throws(() => cifrar({ a: "b" }, ""), /LEXIA_CONEXOES_CHAVE/);
  assert.throws(() => cifrar({ a: "b" }, Buffer.alloc(16).toString("base64")), /32 bytes/);
});

test("campo em branco mantém o segredo antigo; apagar remove", () => {
  const antigos = { token: "velho", client_token: "ct" };
  assert.deepEqual(juntarSegredos(antigos, { token: "" }, []), antigos);
  assert.deepEqual(juntarSegredos(antigos, { token: " novo " }, []), { token: "novo", client_token: "ct" });
  assert.deepEqual(juntarSegredos(antigos, {}, ["client_token"]), { token: "velho" });
});

test("o final mostra só 4 caracteres, e nada em segredos curtos", () => {
  assert.equal(finalDe("sk-ant-1234567890abcd"), "…abcd");
  assert.equal(finalDe("curto"), "…");
});

test("tipos: nomes únicos e Google da Lexia só no âmbito global", () => {
  const nomes = TIPOS_CONEXAO.map((t) => t.tipo);
  assert.equal(new Set(nomes).size, nomes.length);
  assert.ok(tiposDoAmbito("global").some((t) => t.tipo === "google_conta"));
  assert.ok(!tiposDoAmbito("cliente").some((t) => t.tipo === "google_conta"));
  assert.ok(tiposDoAmbito("cliente").some((t) => t.tipo === "ia"));
});

test("a página nunca pede a coluna segredos e só abre para lexia_admin", () => {
  const fonte = readFileSync("app/admin/conexoes/page.tsx", "utf8");
  const selects = [...fonte.matchAll(/\.select\("([^"]*)"\)/g)].map((m) => m[1]);
  assert.ok(selects.length > 0);
  for (const s of selects) assert.doesNotMatch(s, /segredos|\*/);
  assert.ok(fonte.indexOf('"lexia_admin"') < fonte.indexOf('from("lexia_conexoes")'));
});

test("a acção verifica lexia_admin antes de tocar na tabela", () => {
  const fonte = readFileSync("app/admin/conexoes/actions.ts", "utf8");
  assert.ok(fonte.indexOf('"lexia_admin"') > 0);
  assert.ok(fonte.indexOf('"lexia_admin"') < fonte.indexOf('from("lexia_conexoes")'));
});

test("a migration fecha a tabela a quem não é service_role", () => {
  const sql = readFileSync("supabase/migrations/202610310013_fase19_conexoes.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.lexia_conexoes from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/i);
});
