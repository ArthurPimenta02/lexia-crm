/**
 * As telas que se acompanham ao vivo atualizam-se sozinhas (Arthur, 02/11):
 * conversas, handoffs, Controle do agente, Follow-ups e lembretes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("as telas ao vivo usam a atualização automática", () => {
  for (const p of [
    "app/app/conversas/page.tsx",
    "app/admin/conversas/page.tsx",
    "app/app/handoffs/page.tsx",
    "app/admin/handoffs/page.tsx",
    "app/admin/turnos/page.tsx",
    "app/admin/followups/page.tsx",
  ]) {
    assert.match(ler(p), /<AtualizacaoAutomatica segundos=\{\d+\} sinal=\{sinalDaTela\.bind\(null, "(conversas|handoffs|turnos|followups)"/, p);
  }
});

test("não atualiza com a aba escondida nem com alguém a escrever", () => {
  const src = ler("app/components/atualizacao-automatica.tsx");
  assert.match(src, /visibilityState !== "visible"/);
  assert.match(src, /escrevendo\(\)/);
  assert.match(src, /router\.refresh\(\)/);
});

test("o sinal respeita o âmbito: cliente só vê o seu; Controle e Follow-ups só lexia_admin", () => {
  const src = ler("lib/sinais/sinal-da-tela.ts");
  assert.match(src, /^"use server";/);
  assert.match(src, /const slug = admin \? clienteSlug \|\| null : profile\.cliente_slug;/);
  assert.match(src, /if \(!admin\) return "";\n\n  if \(tela === "turnos"\)/);
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
});

test("só recarrega a página quando o sinal muda", () => {
  const src = ler("app/components/atualizacao-automatica.tsx");
  assert.match(src, /agora !== ultimo\.current\) pendente\.current = true/);
  assert.match(src, /if \(pendente\.current && !escrevendo\(\)\)/);
});
