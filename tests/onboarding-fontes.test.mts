/**
 * Etapa 1 do onboarding: do que a IA devolve para o caderno.
 *
 * O que é que isto está a proteger
 * --------------------------------
 * A IA lê as fontes, mas quem decide o que entra no caderno é o código: só
 * passa o que bate com o esquema, tudo entra como "rascunho" (nunca como
 * resposta), e o servidor só vai buscar endereços públicos.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ESQUEMA_ONBOARDING } from "../lib/onboarding/esquema";
import { enderecoPublico, esquemaDoRascunho, rascunhoParaCaderno, textoDoHtml, valorValido, type RascunhoBruto } from "../lib/onboarding/fontes";

const campo = (chave: string) => ESQUEMA_ONBOARDING.flatMap((s) => s.campos).find((c) => c.chave === chave)!;
const vazio: RascunhoBruto = { resumo: "", campos: [], horarios: [], servicos: [], profissionais: [], faqs: [], objecoes: [], promocoes: [] };

test("o servidor só vai buscar endereços públicos", () => {
  assert.equal(enderecoPublico("jessicabeauty.com")?.href, "https://jessicabeauty.com/");
  for (const mau of ["http://localhost:3000", "http://127.0.0.1/x", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "http://[::1]/", "http://intranet", "ftp://x.com", "http://172.16.0.1"]) {
    assert.equal(enderecoPublico(mau), null, mau);
  }
});

test("o texto do site sai sem scripts nem etiquetas", () => {
  const t = textoDoHtml("<html><head><style>a{}</style><script>alert(1)</script></head><body><h1>Botox</h1><p>R$&nbsp;900 &amp; retorno</p></body></html>");
  assert.equal(t, "Botox\nR$ 900 & retorno");
});

test("só entra o que bate com o esquema: opção inexistente, 'Outro' e vazio ficam de fora", () => {
  const tom = campo("emojis");
  assert.equal(valorValido(tom, tom.opcoes![0], []), tom.opcoes![0]);
  assert.equal(valorValido(tom, "às vezes", []), undefined);
  assert.equal(valorValido(campo("sistema_de_agendamento"), "Outro sistema (qual?)", []), undefined);
  const multi = campo("formas_de_pagamento");
  assert.deepEqual(valorValido(multi, "", [multi.opcoes![0], "Fiado", "Outro"]), [multi.opcoes![0]]);
  assert.equal(valorValido(multi, "", ["Fiado"]), undefined);
  assert.equal(valorValido(campo("nome_do_negocio"), "   ", []), undefined);
});

test("tudo o que a IA achou entra como rascunho, com a fonte, e nada como resposta", () => {
  const r: RascunhoBruto = {
    ...vazio,
    campos: [
      { chave: "nome_do_negocio", valor: "Jessica Beauty", lista: [], fonte: "site", trecho: "Jessica Beauty" },
      { chave: "nome_do_negocio", valor: "Outro nome", lista: [], fonte: "site", trecho: "" },
      { chave: "campo_que_nao_existe", valor: "x", lista: [], fonte: "site", trecho: "" },
    ],
    horarios: [
      { dia: "Seg", abre: "9:00", fecha: "18:00", fonte: "google", trecho: "seg 9–18" },
      { dia: "Feriado", abre: "09:00", fecha: "18:00", fonte: "google", trecho: "" },
      { dia: "Ter", abre: "cedo", fecha: "18:00", fonte: "google", trecho: "" },
    ],
    servicos: [
      { nome: "Botox", tipo_de_preco: "Preço fixo", valor: "R$ 900", duracao_media: "", descricao_e_indicacao: "", preparo_e_cuidados: "", contraindicacoes: "", numero_de_sessoes: "", fonte: "arquivo", trecho: "Botox 900" },
      { nome: "botox", tipo_de_preco: "", valor: "R$ 950", duracao_media: "", descricao_e_indicacao: "", preparo_e_cuidados: "", contraindicacoes: "", numero_de_sessoes: "", fonte: "site", trecho: "" },
      { nome: "", tipo_de_preco: "", valor: "R$ 10", duracao_media: "", descricao_e_indicacao: "", preparo_e_cuidados: "", contraindicacoes: "", numero_de_sessoes: "", fonte: "site", trecho: "" },
    ],
  };
  const { linhas, itens } = rascunhoParaCaderno(r);
  assert.deepEqual(linhas.map((l) => l.campo).sort(), ["dias_de_funcionamento", "horario_por_dia", "nome_do_negocio"]);
  assert.equal(linhas.find((l) => l.campo === "nome_do_negocio")!.valor, "Jessica Beauty", "a primeira ocorrência vale; a repetida sai");
  assert.deepEqual(linhas.find((l) => l.campo === "horario_por_dia")!.valor, { Seg: ["09:00", "18:00"] });
  assert.equal(itens.length, 1, "serviço repetido e serviço sem nome não entram");
  assert.deepEqual(itens[0].linhas.map((l) => l.campo).sort(), ["nome", "tipo_de_preco", "valor"], "campos vazios do serviço ficam para a conversa");
  for (const l of [...linhas, ...itens.flatMap((i) => i.linhas)]) {
    assert.equal(l.estado, "rascunho");
    assert.notEqual(l.fonte, "cliente");
  }
});

test("o formato pedido à IA só aceita chaves que existem e nunca pede arquivos nem campos condicionais", () => {
  const e = esquemaDoRascunho() as unknown as { properties: { campos: { items: { properties: { chave: { enum: string[] } } } } } };
  const chaves = e.properties.campos.items.properties.chave.enum;
  assert.ok(chaves.length >= 70);
  const raiz = new Map(ESQUEMA_ONBOARDING.flatMap((s) => s.campos).map((c) => [c.chave, c]));
  for (const k of chaves) {
    const c = raiz.get(k);
    assert.ok(c, k);
    assert.ok(c.tipo !== "upload" && !c.quando, k);
  }
});

test("escolhas do dono não se deduzem do site: só entram se a equipe as anotou", () => {
  const pos = campo("posicionamento");
  assert.equal(pos.modo, "cartao");
  const doSite = rascunhoParaCaderno({ ...vazio, campos: [{ chave: "posicionamento", valor: pos.opcoes![0], lista: [], fonte: "site", trecho: "Top 10" }] });
  assert.deepEqual(doSite.linhas, [], "posicionamento deduzido do site não entra");
  const daLexia = rascunhoParaCaderno({ ...vazio, campos: [{ chave: "posicionamento", valor: pos.opcoes![0], lista: [], fonte: "lexia", trecho: "ela disse" }] });
  assert.equal(daLexia.linhas.length, 1, "anotado pela equipe entra (como rascunho)");
  assert.equal(daLexia.linhas[0].estado, "rascunho");
});

test("diferenciais e observações finais não saem das fontes: é a dona que responde", () => {
  const e = esquemaDoRascunho() as unknown as { properties: { campos: { items: { properties: { chave: { enum: string[] } } } } } };
  const chaves = e.properties.campos.items.properties.chave.enum;
  for (const k of ["diferencial_1", "diferencial_2", "diferencial_3", "informacoes_adicionais"]) assert.ok(!chaves.includes(k), k);
  const r = rascunhoParaCaderno({ ...vazio, campos: [{ chave: "diferencial_1", valor: "Boston's #1", lista: [], fonte: "site", trecho: "" }] });
  assert.deepEqual(r.linhas, []);
});
