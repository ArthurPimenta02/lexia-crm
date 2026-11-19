/**
 * O nome que a pessoa deu, lido das mensagens (lib/clientes/nome-dado.ts).
 *
 * Os casos são frases reais do Detail e da Miranda (19/11). A regra é
 * enviesada para recusar: "Cliente do Messenger" é sempre aceitável, o nome
 * de uma cidade ou de uma empresa no lugar do nome da pessoa não é.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  limparNome,
  nomeDaMensagem,
  nomeDoResumo,
} from "../lib/clientes/nome-dado";

test("apresentações reais em pt, es: apanha o nome e pára onde ele acaba", () => {
  const casos: [string, string][] = [
    ["Combinado. O meu nome é Américo e Segunda vou contactar.", "Américo"],
    ["Olá, bom domingo, eu sou o Carlos Miguel, tudo bem?", "Carlos Miguel"],
    ["Olá, boa tarde! O meu nome é Guilherme e sou de Alverca.", "Guilherme"],
    ["Prazer, chamo-me Lucas.", "Lucas"],
    ["Boa tarde\n\nMeu nome é Henrique Rufino\n\nVi um Toyota", "Henrique Rufino"],
    ["Sou João Diniz.", "João Diniz"],
    ["Eu sou a Maria da Silva Santos e quero marcar", "Maria da Silva Santos"],
    ["Mi nombre es Gerson López y mi número es +17812683370", "Gerson López"],
    ["My name is Brian Thompson", "Brian Thompson"],
    ["Me chamo Giselly e minha amiga Lucélia", "Giselly"],
  ];

  for (const [frase, nome] of casos) {
    assert.equal(nomeDaMensagem(frase), nome, frase);
  }
});

test("falsos positivos: cidade, 'cliente', ordinais, minúsculas, @ e empresas", () => {
  for (const frase of [
    "sou de Lisboa",
    "Sou de Boston",
    "sou cliente vosso",
    "Sou cliente",
    "Sou Cliente desde 2020",
    "Olá. Sou Brasileira e moro aqui",
    "Eu sou o segundo dono",
    "eu sou o primeiro cliente",
    "Sim, vou precisar de fatura em nome empresarial",
    "Olá, sou o @carlos_detail",
    "Sou Boston Detailing",
    "O meu nome é EDS Construction",
    "my name is john smith",
    "Quanto custa?",
  ]) {
    assert.equal(nomeDaMensagem(frase), null, frase);
  }
});

test("o resumo do agente: a linha 👤 e o 'Nome:'", () => {
  assert.equal(
    nomeDoResumo("A tua marcação está registada ✅\n\n📋 Lavagem\n👤 Valéria 🦋\n\nEstá"),
    "Valéria",
  );
  assert.equal(
    nomeDoResumo("Botox com a Bruna. Nome: Arlaine Castro, telefone: 8573129786."),
    "Arlaine Castro",
  );
  assert.equal(nomeDoResumo("👤 RD"), null);
  assert.equal(nomeDoResumo("Sem resumo nenhum"), null);
});

test("limpar o nome: unicode decorativo, maiúsculas, siglas, handles e empresas", () => {
  assert.equal(limparNome("𝑽𝒂𝒍𝒒𝒖𝒊𝒓𝒊𝒂"), "Valquiria");
  assert.equal(limparNome("JOÃO DINIZ"), "João Diniz");
  assert.equal(limparNome("Cristina P"), "Cristina");
  assert.equal(limparNome("EDS Construction"), null);
  assert.equal(limparNome("andremoura2524"), null);
  assert.equal(limparNome("RD"), null);
  assert.equal(limparNome("ㅤ"), null);
  assert.equal(limparNome("Boston's Favorite Beauty"), null);
  assert.equal(limparNome(""), null);
});
