/**
 * A ficha (Etapa 3): o que a cliente ensinou, pronto para a tela e para a equipe.
 * Correr: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { ItemDoCaderno, LinhaDoCaderno } from "../lib/onboarding/caderno";
import { montarFicha } from "../lib/onboarding/ficha";

const linha = (campo: string, valor: unknown, estado: LinhaDoCaderno["estado"], item_id: string | null = null): LinhaDoCaderno => ({ campo, item_id, valor, estado, fonte: "cliente", perguntas: 0 });

test("a ficha mostra o que está guardado e marca como aberto só o que está mesmo vazio", () => {
  const itens: ItemDoCaderno[] = [{ id: "s1", grupo: "servicos", ordem: 0, removido: false }, { id: "s2", grupo: "servicos", ordem: 1, removido: true }];
  const ficha = montarFicha(
    [
      linha("nome_do_negocio", "Studio", "confirmado"),
      linha("nome", "Microblading", "confirmado", "s1"),
      linha("nome", "Fora", "confirmado", "s2"),
      linha("descricao_e_indicacao", "rascunho que ficou", "pulado", "s1"),
      linha("contraindicacoes", null, "pulado", "s1"),
      linha("numero_de_sessoes", null, "nao_se_aplica", "s1"),
    ],
    itens,
  );
  const servicos = ficha.find((s) => s.chave === "servicos")!.grupos.find((g) => g.chave === "servicos")!.itens;
  assert.deepEqual(servicos.map((i) => i.nome), ["Microblading"], "item tirado não aparece");
  const de = (chave: string) => servicos[0].campos.find((c) => c.campo === chave)!;
  assert.deepEqual([de("descricao_e_indicacao").valor, de("descricao_e_indicacao").aberto], ["rascunho que ficou", false], "o que ficou guardado aparece");
  assert.equal(de("contraindicacoes").aberto, true);
  assert.equal(de("numero_de_sessoes").aberto, false, "o que não se aplica não conta como em falta");
  assert.ok(!servicos[0].campos.some((c) => c.campo === "nome"), "o nome é o título do item");
  assert.equal(ficha.find((s) => s.chave === "sobre_o_negocio")!.campos.find((c) => c.campo === "nome_do_negocio")!.valor, "Studio");
});
