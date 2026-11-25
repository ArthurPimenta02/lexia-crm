/** Caso K-Glow (24/11): o Gemini devolveu a 1.ª frase do PEDIDO antes da transcrição e isso ficou como resposta da Kelly. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { semEcoDoPedido } from "../lib/onboarding/audio";

test("transcrição: o eco do pedido sai do início; o que ela disse fica intacto", () => {
  assert.equal(semEcoDoPedido("Transcreva este áudio palavra por palavra.\nNormalmente eu uso o Dysport, mas para alguns pacientes que querem o botox, tenho essa opção a 14 dólares por unidade."),
    "Normalmente eu uso o Dysport, mas para alguns pacientes que querem o botox, tenho essa opção a 14 dólares por unidade.");
  assert.equal(semEcoDoPedido("Transcreva este áudio palavra por palavra, no idioma em que foi falado. Responda só com a transcrição. Olá, eu faço sim."), "Olá, eu faço sim.");
  for (const t of ["Normalmente eu uso o Dysport.", "Transcreva isto: o preço é 14.", "Palavra por palavra, eu faço tudo.", "[inaudível]"]) assert.equal(semEcoDoPedido(t), t, t);
});
