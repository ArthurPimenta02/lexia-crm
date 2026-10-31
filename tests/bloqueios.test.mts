/**
 * Bloqueios (Fase 21).
 *
 * 1. O identificador gravado tem de ser exactamente o que o agente compara:
 *    o que vem depois de "<canal>:" no identificador_conversa, e o telefone só
 *    com dígitos. Um "+1 (781)…" gravado como está nunca bateria.
 * 2. A tabela é lida e escrita com a service_role (ignora o RLS): cada acção
 *    e a página verificam lexia_admin antes de tocar nela.
 * 3. Desbloquear apaga só a linha DESTE cliente (eq cliente_slug), para um id
 *    de outro cliente não servir.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { bloqueioDaConversa, normalizarIdentificador } from "../lib/bloqueios/identificador";

test("da conversa para o identificador que o agente compara", () => {
  assert.deepEqual(bloqueioDaConversa("whatsapp:17815550000"), { canal: "whatsapp", identificador: "17815550000" });
  assert.deepEqual(bloqueioDaConversa("instagram:1234567890123456"), { canal: "instagram", identificador: "1234567890123456" });
  assert.deepEqual(bloqueioDaConversa("messenger:12345678901234567"), { canal: "messenger", identificador: "12345678901234567" });
  assert.equal(bloqueioDaConversa("teste:abc-123"), null);
  assert.equal(bloqueioDaConversa("semcanal"), null);
});

test("telefone só com dígitos e DDI; IDs do Instagram só dígitos", () => {
  assert.equal(normalizarIdentificador("whatsapp", "+1 (781) 555-0000"), "17815550000");
  assert.equal(normalizarIdentificador("whatsapp", "00 55 41 99700 1234"), "5541997001234");
  assert.equal(normalizarIdentificador("whatsapp", "555-0000"), null);
  assert.equal(normalizarIdentificador("instagram", "@ana.silva"), null);
  assert.equal(normalizarIdentificador("instagram", " 1234567890 "), "1234567890");
});

test("cada acção verifica lexia_admin antes de tocar na tabela", () => {
  const fonte = readFileSync("app/admin/bloqueios/actions.ts", "utf8");
  for (const nome of ["adicionarBloqueio", "bloquearConversa", "removerBloqueio"]) {
    const corpo = fonte.slice(fonte.indexOf(`export async function ${nome}`));
    const fim = corpo.indexOf("\nexport async function", 10);
    const funcao = fim > 0 ? corpo.slice(0, fim) : corpo;
    assert.ok(funcao.indexOf("adminId()") > 0, `${nome} sem adminId`);
    const tabela = Math.min(...["gravar(", 'from("lexia_bloqueios")'].map((x) => (funcao.indexOf(x) < 0 ? Infinity : funcao.indexOf(x))));
    assert.ok(funcao.indexOf("adminId()") < tabela, `${nome} toca na tabela antes de verificar`);
  }
  assert.match(fonte, /return user && profile\?\.role === "lexia_admin" \? user\.id : null/);
});

test("desbloquear só apaga a linha deste cliente", () => {
  const fonte = readFileSync("app/admin/bloqueios/actions.ts", "utf8");
  const remover = fonte.slice(fonte.indexOf("export async function removerBloqueio"));
  assert.match(remover, /\.eq\("id", id\)\s*\.eq\("cliente_slug", clienteSlug\)/);
});

test("a página só abre para lexia_admin, antes de ler os bloqueios", () => {
  const fonte = readFileSync("app/admin/bloqueios/page.tsx", "utf8");
  assert.match(fonte, /profile\.role !== "lexia_admin"\) redirect\("\/app"\)/);
  assert.ok(fonte.indexOf('"lexia_admin"') < fonte.indexOf('from("lexia_bloqueios")'));
});

test("a migration fecha a tabela a quem não é service_role", () => {
  const sql = readFileSync("supabase/migrations/202610310015_fase21_bloqueios.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.lexia_bloqueios from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /unique \(cliente_slug, canal, identificador\)/);
});
