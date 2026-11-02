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
    assert.match(ler(p), /<AtualizacaoAutomatica segundos=\{\d+\} \/>/, p);
  }
});

test("não atualiza com a aba escondida nem com alguém a escrever", () => {
  const src = ler("app/components/atualizacao-automatica.tsx");
  assert.match(src, /visibilityState !== "visible"/);
  assert.match(src, /escrevendo\(\)/);
  assert.match(src, /router\.refresh\(\)/);
});
