/**
 * Perguntas acrescentadas a 24/11/2026 (antes de a Kelly, K-Glow, começar), a partir do mapa da Etapa 3:
 * o que o agente lê e a entrevista não perguntava.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { seAplica } from "../lib/onboarding/caderno";
import { ESQUEMA_ONBOARDING } from "../lib/onboarding/esquema";

const raiz = (chave: string) => ESQUEMA_ONBOARDING.flatMap((s) => s.campos).find((c) => c.chave === chave)!;
const doGrupo = (g: string, chave: string) => ESQUEMA_ONBOARDING.flatMap((s) => s.grupos).find((x) => x.chave === g)!.campos.find((c) => c.chave === chave)!;

test("serviços que pedem consulta antes: escolha da lista de serviços, pode ficar em branco", () => {
  const c = raiz("servicos_com_consulta_antes");
  assert.equal(c.tipo, "multi");
  assert.equal(c.opcoesDe, "servicos");
  assert.equal(c.obrigatorio, false);
});

test("lembretes: pergunta-se primeiro se o sistema de agendamento já manda; se basta ele, não se pergunta o horário", () => {
  const quem = raiz("quem_manda_lembretes");
  assert.equal(quem.opcoes?.length, 3);
  const lem = raiz("lembretes");
  assert.equal(seAplica(lem.quando, { quem_manda_lembretes: "Sim, e basta: a assistente não precisa mandar" }), false);
  assert.equal(seAplica(lem.quando, { quem_manda_lembretes: "Sim, e quero que a assistente também mande pelo WhatsApp" }), true);
  assert.equal(seAplica(lem.quando, { quem_manda_lembretes: "Não manda (a assistente manda pelo WhatsApp)" }), true);
});

test("promoção: para quem vale, com a explicação de que pode ter vindo do sistema de agendamento (Moxie)", () => {
  const c = doGrupo("promocoes", "para_quem_vale");
  assert.deepEqual(c.opcoes, ["Só para clientes novas", "Só para quem já é cliente", "Para todas"]);
  assert.match(c.ajuda ?? "", /Moxie/);
});

test("preço: 'Por unidade' existe, em português de gente, sem mudar as opções antigas", () => {
  const tp = doGrupo("servicos", "tipo_de_preco");
  assert.equal(tp.pergunta, "Como este serviço é cobrado?");
  for (const o of ["Preço fixo", "A partir de (preço mínimo)", "Sob orçamento — só após avaliação presencial", "Outro"]) assert.ok(tp.opcoes?.includes(o), o);
  assert.ok(tp.opcoes?.some((o) => /^Por unidade/.test(o)));
  assert.match(doGrupo("servicos", "valor").ajuda ?? "", /por unidade/);
});

test("valor da avaliação: perguntado sempre que é paga (antes só quando virava crédito)", () => {
  const v = raiz("valor_da_avaliacao");
  assert.equal(seAplica(v.quando, { avaliacao_paga: "Paga" }), true);
  assert.equal(seAplica(v.quando, { avaliacao_paga: "Depende do serviço" }), true);
  assert.equal(seAplica(v.quando, { avaliacao_paga: "Gratuita" }), false);
});

test("retoque cobrado à parte: perguntado uma vez para o negócio", () => {
  const c = raiz("retoque_cobrado");
  assert.equal(c.tipo, "long");
  assert.equal(c.obrigatorio, false);
});
