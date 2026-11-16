/**
 * O caderno de respostas do onboarding.
 *
 * O que é que isto está a proteger
 * --------------------------------
 * As três regras do Arthur para a entrevistadora (16/11/2026): nada fica de
 * fora, nenhuma pergunta se repete, e nada do que a IA achou entra sem a
 * cliente confirmar. Quem as cumpre é o código de lib/onboarding/caderno.ts,
 * não a IA — por isso é aqui que se prova.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAXIMO_DE_PERGUNTAS,
  montarCaderno,
  proximoPasso,
  resumir,
  seAplica,
  type ItemDoCaderno,
  type LinhaDoCaderno,
} from "../lib/onboarding/caderno";
import { ESQUEMA_ONBOARDING } from "../lib/onboarding/esquema";

const linha = (campo: string, valor: unknown, estado: LinhaDoCaderno["estado"] = "respondido", item: string | null = null, perguntas = 1): LinhaDoCaderno => ({
  campo, item_id: item, valor, estado, fonte: estado === "rascunho" ? "site" : "cliente", perguntas,
});
const servico = (id: string, ordem = 0): ItemDoCaderno => ({ id, grupo: "servicos", ordem, removido: false });

test("o esquema cobre o formulário inteiro: chaves únicas, opções nos campos de escolha, recomendação que existe nas opções", () => {
  const raiz = ESQUEMA_ONBOARDING.flatMap((s) => s.campos.map((c) => c.chave));
  assert.equal(new Set(raiz).size, raiz.length, "chave repetida na raiz");
  for (const s of ESQUEMA_ONBOARDING) for (const g of s.grupos) {
    const chaves = g.campos.map((c) => c.chave);
    assert.equal(new Set(chaves).size, chaves.length, `chave repetida em ${g.chave}`);
  }
  const todos = ESQUEMA_ONBOARDING.flatMap((s) => [...s.campos, ...s.grupos.flatMap((g) => g.campos)]);
  assert.ok(todos.length >= 140, "o formulário tem mais de 140 campos");
  for (const c of todos) {
    assert.match(c.chave, /^[a-z][a-z0-9_]{1,60}$/, c.chave);
    if (c.recomendado !== undefined) for (const r of [c.recomendado].flat()) assert.ok(c.opcoes?.includes(r), `${c.chave}: recomendado fora das opções`);
  }
  // as 12 seções do formulário e as regras da casa
  for (const k of ["sobre_o_negocio", "objetivos_do_agente", "horarios", "tom_e_identidade", "servicos", "precos_e_pagamento", "agendamento", "follow_up", "handoff", "faqs_e_objecoes", "promocoes_e_prioridades", "arquivos_e_revisao", "regras_da_casa"]) {
    assert.ok(ESQUEMA_ONBOARDING.some((s) => s.chave === k), `falta a seção ${k}`);
  }
});

test("nada fica de fora: caderno vazio não aprova, e cada obrigatório por resolver bloqueia", () => {
  const vazio = montarCaderno([], []);
  const r = resumir(vazio, []);
  assert.equal(r.podeAprovar, false);
  assert.ok(r.bloqueiam.length > 40);
  assert.ok(r.gruposSemItem.includes("servicos"), "sem serviços não se aprova");
  assert.equal(r.percentual, 0);
});

test("campo condicional só aparece quando a resposta de que depende o pede", () => {
  assert.equal(seAplica({ campo: "tamanho_da_equipe", valor: "Outro" }, {}), false);
  assert.equal(seAplica({ campo: "tamanho_da_equipe", valor: "Outro" }, { tamanho_da_equipe: "Outro" }), true);
  assert.equal(seAplica({ campo: "tipo_de_preco", diferenteDe: "Preço fixo" }, {}), false, "sem resposta ainda não se pergunta o dependente");
  assert.equal(seAplica({ algum: [{ campo: "objetivos", valor: "Outro" }, { campo: "objetivo_principal", valor: "Outro" }] }, { objetivos: ["Informar preços", "Outro"] }), true);
  const sem = montarCaderno([linha("tamanho_da_equipe", "Só eu")], []);
  assert.ok(!sem.some((c) => c.campo.chave === "outro_tamanho_da_equipe"));
  const com = montarCaderno([linha("tamanho_da_equipe", "Outro")], []);
  assert.ok(com.some((c) => c.campo.chave === "outro_tamanho_da_equipe"));
});

test("o que a IA achou é rascunho: aparece para confirmar e NÃO conta como resposta", () => {
  const c = montarCaderno([linha("nome_do_negocio", "Jessica Beauty", "rascunho")], []);
  const nome = c.find((x) => x.campo.chave === "nome_do_negocio")!;
  assert.equal(nome.situacao, "por_confirmar");
  assert.ok(resumir(c, []).bloqueiam.includes(nome), "rascunho por confirmar bloqueia a aprovação");
  const passo = proximoPasso(c, []);
  assert.equal(passo.tipo, "confirmar");
  const depois = montarCaderno([linha("nome_do_negocio", "Jessica Beauty", "confirmado")], []);
  assert.equal(depois.find((x) => x.campo.chave === "nome_do_negocio")!.situacao, "resolvido");
});

test("nenhuma pergunta se repete: resolvido nunca volta; vago ganha UM complemento e depois é pendência", () => {
  assert.equal(MAXIMO_DE_PERGUNTAS, 2);
  const chave = "politica_de_cancelamento";
  const sit = (l: LinhaDoCaderno) => montarCaderno([l], []).find((x) => x.campo.chave === chave)!.situacao;
  assert.equal(sit(linha(chave, "24h antes sem custo", "respondido", null, 1)), "resolvido");
  assert.equal(sit(linha(chave, "depende", "vago", null, 1)), "falta", "vago à primeira: cabe um complemento");
  assert.equal(sit(linha(chave, "depende", "vago", null, 2)), "pendencia", "vago à segunda: não se pergunta uma terceira vez");
  assert.equal(sit(linha(chave, null, "pulado", null, 1)), "pendencia");
  // o próximo passo nunca devolve um campo resolvido ou em pendência
  const linhas = [linha(chave, "depende", "vago", null, 2), linha("nome_do_agente", "Lia", "respondido")];
  const itens: ItemDoCaderno[] = [servico("s1"), { id: "f1", grupo: "faqs", ordem: 0, removido: false }, { id: "o1", grupo: "objecoes", ordem: 0, removido: false }];
  const visto = new Set<string>();
  let caderno = montarCaderno(linhas, itens);
  for (let i = 0; i < 400; i++) {
    const p = proximoPasso(caderno, itens);
    if (p.tipo === "fim" || p.tipo === "itens") break;
    const alvos = p.tipo === "pergunta" ? [p.alvo] : p.campos;
    for (const a of alvos) {
      const k = `${a.itemId}|${a.campo.chave}`;
      assert.ok(!visto.has(k), `perguntou duas vezes: ${k}`);
      assert.notEqual(a.campo.chave, chave, "campo em pendência voltou a ser perguntado");
      assert.notEqual(a.campo.chave, "nome_do_agente", "campo resolvido voltou a ser perguntado");
      visto.add(k);
      linhas.push(linha(a.campo.chave, a.campo.opcoes?.[0] ?? "resposta", "respondido", a.itemId));
    }
    caderno = montarCaderno(linhas, itens);
  }
  assert.ok(visto.size > 60, `percorreu ${visto.size} campos`);
});

test("responder tudo o que o caderno pede chega ao fim e libera a aprovação; um obrigatório em pendência não libera", () => {
  const itens: ItemDoCaderno[] = [servico("s1"), { id: "f1", grupo: "faqs", ordem: 0, removido: false }, { id: "o1", grupo: "objecoes", ordem: 0, removido: false }];
  const linhas: LinhaDoCaderno[] = [];
  let caderno = montarCaderno(linhas, itens);
  for (let i = 0; i < 600; i++) {
    const p = proximoPasso(caderno, itens);
    if (p.tipo === "fim") break;
    assert.notEqual(p.tipo, "itens", "todos os grupos obrigatórios têm item");
    const alvos = p.tipo === "pergunta" ? [p.alvo] : (p as { campos: typeof caderno }).campos;
    for (const a of alvos) linhas.push(linha(a.campo.chave, a.campo.opcoes?.[0] ?? "resposta", "respondido", a.itemId));
    caderno = montarCaderno(linhas, itens);
  }
  const r = resumir(caderno, itens);
  assert.equal(r.podeAprovar, true, r.bloqueiam.map((b) => b.campo.chave).join(", "));
  assert.equal(r.percentual, 100);
  const comPendencia = montarCaderno([...linhas.filter((l) => l.campo !== "politica_de_cancelamento"), linha("politica_de_cancelamento", "depende", "vago", null, 2)], itens);
  assert.equal(resumir(comPendencia, itens).podeAprovar, false);
});

test("a entrevista começa por confirmar o que já se sabe, depois os serviços, um de cada vez", () => {
  const itens = [servico("s1", 0), servico("s2", 1)];
  const linhas = [linha("endereco_completo", "Rua X", "rascunho"), linha("nome", "Botox", "rascunho", "s1"), linha("nome", "Peeling", "confirmado", "s2")];
  const p1 = proximoPasso(montarCaderno(linhas, itens), itens);
  assert.equal(p1.tipo, "confirmar");
  const confirmadas = linhas.map((l) => ({ ...l, estado: "confirmado" as const }));
  const p2 = proximoPasso(montarCaderno(confirmadas, itens), itens);
  assert.equal(p2.tipo, "pergunta");
  if (p2.tipo === "pergunta") {
    assert.equal(p2.alvo.itemId, "s1", "começa pelo primeiro serviço");
    assert.ok(p2.mesmoItem.every((c) => c.itemId === "s1"), "o que mais falta desse serviço vai junto, para um áudio responder vários campos");
  }
  // item removido deixa de ser perguntado
  const semS1 = [{ ...itens[0], removido: true }, itens[1]];
  const p3 = proximoPasso(montarCaderno(confirmadas, semS1), semS1);
  if (p3.tipo === "pergunta") assert.equal(p3.alvo.itemId, "s2");
});
