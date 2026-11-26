/** Caso K-Glow (25/11): "31 de dezembro 2026" ficou gravado tal e qual e a passagem ao agente recusou a promoção. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { conferir, dataIso } from "../lib/onboarding/conversa";

test("datas: escritas ou ditas viram AAAA-MM-DD; ambíguas ou impossíveis ficam por responder", () => {
  for (const [t, d] of [["31 de dezembro 2026", "2026-12-31"], ["31 de dezembro de 2026", "2026-12-31"], ["December 31, 2026", "2026-12-31"], ["Dec 31st 2026", "2026-12-31"], ["31/12/2026", "2026-12-31"], ["12/31/2026", "2026-12-31"], ["2026-12-31", "2026-12-31"], ["1º de março de 2027", "2027-03-01"], ["15 de marzo de 2027", "2027-03-15"], ["05/05/2027", "2027-05-05"]] as const)
    assert.equal(dataIso(t), d, t);
  for (const t of ["03/04/2026", "31 de fevereiro de 2026", "dezembro", "31 de dezembro", "até acabar o estoque", "2026-13-01"]) assert.equal(dataIso(t), undefined, t);
  const campo = { chave: "validade", pergunta: "Data de validade", tipo: "date", obrigatorio: true, modo: "conversa" } as never;
  assert.equal(conferir(campo, "31 de dezembro 2026"), "2026-12-31");
  assert.equal(conferir(campo, "logo se vê"), undefined, "não é data: não se grava, volta a ser perguntado");
});
