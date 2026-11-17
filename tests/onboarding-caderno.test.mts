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
  type Andamento,
  type CampoNoCaderno,
  type ItemDoCaderno,
  type LinhaDoCaderno,
  type Passo,
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

/** Uma cliente que responde a tudo o que o caderno pede. Devolve os campos perguntados, na ordem. */
function entrevistar(linhas: LinhaDoCaderno[], itens: ItemDoCaderno[], responder: (c: CampoNoCaderno) => LinhaDoCaderno | null = (c) => linha(c.campo.chave, c.campo.opcoes?.[0] ?? "resposta", "respondido", c.itemId)) {
  const andamento: Andamento = { listas: [], gruposPerguntados: [] };
  const pedidos: string[] = [];
  const passos: Passo["tipo"][] = [];
  for (let i = 0; i < 900; i++) {
    const p = proximoPasso(montarCaderno(linhas, itens), itens, andamento);
    passos.push(p.tipo);
    if (p.tipo === "fim") return { pedidos, passos, andamento };
    if (p.tipo === "lista") { andamento.listas.push(p.grupo); continue; }
    if (p.tipo === "itens") {
      andamento.gruposPerguntados.push(p.grupo);
      if (p.obrigatorio) { itens.push({ id: `${p.grupo}-novo`, grupo: p.grupo, ordem: 0, removido: false }); andamento.listas.push(p.grupo); }
      continue;
    }
    if (p.tipo === "tabela") andamento.tabelas = [...(andamento.tabelas ?? []), p.grupo];
    const alvos = p.tipo === "item" ? [...p.confirmar, ...p.cartoes, ...p.faltam] : p.tipo === "tabela" ? p.linhas.flatMap((l) => l.campos) : p.campos;
    assert.ok(alvos.length > 0, `passo ${p.tipo} vazio`);
    for (const a of alvos) {
      pedidos.push(`${a.itemId ?? ""}|${a.campo.chave}`);
      const r = responder(a);
      if (r) linhas.push(r);
    }
  }
  throw new Error("a entrevista não terminou");
}

test("nenhuma pergunta se repete: resolvido nunca volta; vago ganha UM complemento e depois é pendência", () => {
  assert.equal(MAXIMO_DE_PERGUNTAS, 2);
  const chave = "politica_de_cancelamento";
  const sit = (l: LinhaDoCaderno) => montarCaderno([l], []).find((x) => x.campo.chave === chave)!.situacao;
  assert.equal(sit(linha(chave, "24h antes sem custo", "respondido", null, 1)), "resolvido");
  assert.equal(sit(linha(chave, "depende", "vago", null, 1)), "falta", "vago à primeira: cabe um complemento");
  assert.equal(sit(linha(chave, "depende", "vago", null, 2)), "pendencia", "vago à segunda: não se pergunta uma terceira vez");
  assert.equal(sit(linha(chave, null, "pulado", null, 1)), "pendencia");

  const linhas = [linha(chave, "depende", "vago", null, 2), linha("nome_do_agente", "Lia", "respondido")];
  const { pedidos } = entrevistar(linhas, [servico("s1")]);
  assert.equal(new Set(pedidos).size, pedidos.length, "um campo foi pedido duas vezes");
  assert.ok(!pedidos.includes(`|${chave}`), "campo em pendência voltou a ser perguntado");
  assert.ok(!pedidos.includes("|nome_do_agente"), "campo resolvido voltou a ser perguntado");
  assert.ok(pedidos.length > 90, `percorreu ${pedidos.length} campos`);
});

test("quem nunca responde é perguntado duas vezes por campo e a entrevista termina, sem ciclo", () => {
  const vezes = new Map<string, number>();
  const linhas: LinhaDoCaderno[] = [];
  const { pedidos } = entrevistar(linhas, [servico("s1")], (c) => {
    const k = `${c.itemId ?? ""}|${c.campo.chave}`;
    const n = (vezes.get(k) ?? 0) + 1;
    vezes.set(k, n);
    return linha(c.campo.chave, null, "vago", c.itemId, n);
  });
  assert.equal(Math.max(...vezes.values()), 2, "ninguém é perguntado três vezes");
  assert.ok(pedidos.length > 150, String(pedidos.length));
  const r = resumir(montarCaderno(linhas, [servico("s1")]), [servico("s1")]);
  assert.equal(r.podeAprovar, false, "sem respostas não se aprova");
  assert.equal(r.faltam, 0, "tudo virou pendência: não sobra nada por perguntar");
});

test("responder tudo o que o caderno pede chega ao fim e libera a aprovação; um obrigatório em pendência não libera", () => {
  const itens: ItemDoCaderno[] = [servico("s1")];
  const linhas: LinhaDoCaderno[] = [];
  const { passos } = entrevistar(linhas, itens);
  assert.equal(passos.at(-1), "fim");
  const r = resumir(montarCaderno(linhas, itens), itens);
  assert.equal(r.podeAprovar, true, r.bloqueiam.map((b) => b.campo.chave).join(", ") + " | " + r.gruposSemItem.join(","));
  assert.equal(r.percentual, 100);
  const comPendencia = montarCaderno([...linhas.filter((l) => l.campo !== "politica_de_cancelamento"), linha("politica_de_cancelamento", "depende", "vago", null, 2)], itens);
  assert.equal(resumir(comPendencia, itens).podeAprovar, false);
});

test("a ordem: confirmar o negócio, conferir a lista de serviços, um serviço de cada vez, depois o resto", () => {
  const itens = [servico("s1", 0), servico("s2", 1)];
  const linhas = [linha("endereco_completo", "Rua X", "rascunho"), linha("nome", "Botox", "rascunho", "s1"), linha("nome", "Peeling", "rascunho", "s2")];
  const p1 = proximoPasso(montarCaderno(linhas, itens), itens);
  assert.equal(p1.tipo, "confirmar");
  if (p1.tipo === "confirmar") assert.ok(p1.campos.every((c) => !c.itemId), "a primeira confirmação é só do negócio");
  linhas.push(linha("endereco_completo", "Rua X", "confirmado"));
  const p2 = proximoPasso(montarCaderno(linhas, itens), itens);
  assert.equal(p2.tipo, "lista");
  const pTabela = proximoPasso(montarCaderno(linhas, itens), itens, { listas: ["servicos"], gruposPerguntados: [] });
  assert.equal(pTabela.tipo, "tabela", "depois da lista vem a tabela de preço e duração, uma vez");
  const andamento: Andamento = { listas: ["servicos"], gruposPerguntados: [], tabelas: ["servicos"] };
  const p3 = proximoPasso(montarCaderno(linhas, itens), itens, andamento);
  assert.equal(p3.tipo, "item");
  if (p3.tipo === "item") {
    assert.equal(p3.itemId, "s1", "começa pelo primeiro serviço");
    assert.deepEqual(p3.confirmar.map((c) => c.campo.chave), ["nome"]);
    assert.ok(p3.faltam.length > 5 && p3.faltam.every((c) => c.itemId === "s1"), "o que falta desse serviço vai junto, para um áudio responder vários campos");
    assert.ok(p3.cartoes.every((c) => c.campo.modo === "cartao"));
  }
  // serviço retirado da lista deixa de ser perguntado
  const semS1 = [{ ...itens[0], removido: true }, itens[1]];
  const p4 = proximoPasso(montarCaderno(linhas, semS1), semS1, andamento);
  assert.equal(p4.tipo === "item" && p4.itemId, "s2");
  // grupo obrigatório vazio pergunta-se duas vezes, nunca uma terceira
  assert.deepEqual(proximoPasso(montarCaderno([], []), []), { tipo: "itens", grupo: "servicos", obrigatorio: true });
  assert.deepEqual(proximoPasso(montarCaderno([], []), [], { listas: [], gruposPerguntados: ["servicos"] }), { tipo: "itens", grupo: "servicos", obrigatorio: true });
  const p5 = proximoPasso(montarCaderno([], []), [], { listas: [], gruposPerguntados: ["servicos", "servicos"] });
  assert.ok(!(p5.tipo === "itens" && p5.grupo === "servicos"), "terceira pergunta pelos serviços");
});

test("o que valia para todos os serviços pergunta-se uma vez, no negócio, e não em cada serviço", () => {
  const doServico = ESQUEMA_ONBOARDING.flatMap((s) => s.grupos).find((g) => g.chave === "servicos")!.campos.map((c) => c.chave);
  const daRaiz = ESQUEMA_ONBOARDING.flatMap((s) => s.campos).map((c) => c.chave);
  for (const k of ["prioridade_de_venda", "se_acharem_caro", "avaliacao_paga", "profissional"]) assert.ok(!doServico.includes(k), `${k} voltou a ser perguntado em cada serviço`);
  for (const k of ["servicos_prioritarios", "se_acharem_caro", "avaliacao_paga"]) assert.ok(daRaiz.includes(k), `${k} deixou de ser perguntado`);
  // quinze serviços não podem custar quinze vezes as mesmas perguntas: o caderno cresce pouco por serviço
  const itens = Array.from({ length: 15 }, (_, n) => servico(`s${n}`, n));
  const porServico = montarCaderno([], itens).filter((c) => c.itemId === "s0").length;
  assert.ok(porServico <= 8, `cada serviço abre ${porServico} campos`);
});

test("arquivos não são perguntas do caderno", () => {
  assert.ok(!montarCaderno([], [servico("s1")]).some((c) => c.campo.tipo === "upload"));
});
