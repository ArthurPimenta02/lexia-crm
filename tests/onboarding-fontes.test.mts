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
import { enderecoPublico, esquemaDoRascunho, juntarSugestoes, juntarTextos, MAXIMO_DE_FAQS, MAXIMO_DE_OBJECOES, rascunhoParaCaderno, servicosParaEscrever, textoDoHtml, valorValido, type RascunhoBruto } from "../lib/onboarding/fontes";

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
  assert.equal(valorValido(campo("posicionamento"), "Outro", []), undefined);
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
    assert.ok(c.tipo !== "upload" && (!c.quando || k === "valor_da_avaliacao"), k);
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

test("textos escritos pela Lexia: entram como rascunho 'recomendacao', nunca por cima do que veio de uma fonte, e vazio fica de fora", () => {
  const { itens } = rascunhoParaCaderno({
    resumo: "", campos: [], horarios: [], profissionais: [{ nome: "Jessica", especialidade: "PMU", fonte: "site", trecho: "" }], faqs: [], objecoes: [], promocoes: [],
    servicos: [
      { nome: "Microblading", tipo_de_preco: "", valor: "", duracao_media: "2 horas", descricao_e_indicacao: "Texto do site.", preparo_e_cuidados: "", contraindicacoes: "", numero_de_sessoes: "", fonte: "site", trecho: "" },
      { nome: "Pacote Jessica Glow", tipo_de_preco: "", valor: "", duracao_media: "", descricao_e_indicacao: "", preparo_e_cuidados: "", contraindicacoes: "", numero_de_sessoes: "", fonte: "site", trecho: "" },
    ],
  });
  const pedido = servicosParaEscrever(itens);
  assert.deepEqual(pedido.map((p) => [p.n, p.nome]), [[0, "Microblading"], [1, "Pacote Jessica Glow"]], "só serviços, com a posição na lista");
  assert.equal(pedido[0].dasFontes.descricao_e_indicacao, "Texto do site.");
  const vazio = { descricao_e_indicacao: "", para_quem_indicar: "", preparo_e_cuidados: "", contraindicacoes: "", numero_de_sessoes: "" };
  const juntos = juntarTextos(itens, [
    { n: 0, descricao_e_indicacao: "Texto da Lexia por cima", para_quem_indicar: "Quem tem falhas na sobrancelha.", preparo_e_cuidados: "Evitar álcool na véspera.", contraindicacoes: "Gestantes.", numero_de_sessoes: " " },
    { n: 1, ...vazio },
    { n: 2, ...vazio, para_quem_indicar: "não é serviço" },
    { n: 9, ...vazio, para_quem_indicar: "não existe" },
  ]);
  const de = (n: number, campo: string) => juntos[n].linhas.find((l) => l.campo === campo);
  assert.equal(de(0, "descricao_e_indicacao")!.valor, "Texto do site.", "o texto da fonte vale mais do que o da Lexia");
  assert.deepEqual([de(0, "contraindicacoes")!.estado, de(0, "contraindicacoes")!.fonte], ["rascunho", "recomendacao"]);
  assert.equal(de(0, "numero_de_sessoes"), undefined, "campo vazio fica de fora: será perguntado");
  assert.equal(de(0, "valor"), undefined, "a Lexia nunca escreve preço");
  assert.deepEqual(juntos[1], itens[1], "serviço que a IA não reconheceu fica como estava");
  assert.deepEqual(juntos[2], itens[2], "o que não é serviço não recebe texto");
});

test("perguntas frequentes e objeções sugeridas: rascunho 'recomendacao', sem repetir o que as fontes trouxeram, sem resposta vazia e dentro do teto", () => {
  const { itens } = rascunhoParaCaderno({ ...vazio, faqs: [{ pergunta: "Dói?", resposta: "Quase nada.", fonte: "site", trecho: "" }] });
  const juntos = juntarSugestoes(itens, {
    faqs: [{ pergunta: "dói?!", resposta: "repetida" }, { pergunta: "Sem resposta?", resposta: " " }, ...Array.from({ length: 12 }, (_, n) => ({ pergunta: `Pergunta ${n}`, resposta: `Resposta ${n}` }))],
    objecoes: Array.from({ length: 9 }, (_, n) => ({ objecao: `Objeção ${n}`, como_responder: `Resposta ${n}` })),
  });
  const faqs = juntos.filter((x) => x.grupo === "faqs"), objecoes = juntos.filter((x) => x.grupo === "objecoes");
  assert.equal(faqs.filter((x) => /d[oó]i/i.test(x.nome)).length, 1, "a pergunta que a fonte já trazia não se repete");
  assert.equal(faqs[0].linhas.find((l) => l.campo === "resposta")!.valor, "Quase nada.", "a resposta da fonte fica");
  assert.ok(!faqs.some((x) => x.nome === "Sem resposta?"), "sugestão sem resposta não entra");
  assert.equal(faqs.length, MAXIMO_DE_FAQS, "o teto conta com a que a fonte já trazia");
  assert.equal(objecoes.length, MAXIMO_DE_OBJECOES);
  assert.deepEqual(objecoes[0].linhas.map((l) => [l.campo, l.estado, l.fonte]), [["objecao", "rascunho", "recomendacao"], ["como_responder", "rascunho", "recomendacao"]]);
});

test("dúvida da fonte vira aviso de conferir; o valor da avaliação só fica se o rascunho disser que ela vira crédito", () => {
  const paga = { chave: "avaliacao_paga", valor: "Paga", lista: [], fonte: "lexia" as const, trecho: "a avaliação custa", incerto: false };
  const credito = { chave: "avaliacao_vira_credito", valor: "Sim", lista: [], fonte: "lexia" as const, trecho: "é abatido", incerto: false };
  const valor = { chave: "valor_da_avaliacao", valor: "30 dólares", lista: [], fonte: "lexia" as const, trecho: "acreditamos que 30", incerto: true };
  const com = rascunhoParaCaderno({ ...vazio, campos: [paga, valor, credito] }).linhas;
  assert.deepEqual(com.map((l) => l.campo).sort(), ["avaliacao_paga", "avaliacao_vira_credito", "valor_da_avaliacao"]);
  assert.equal(com.find((l) => l.campo === "valor_da_avaliacao")!.evidencia!.a_confirmar, true);
  assert.equal(com.find((l) => l.campo === "valor_da_avaliacao")!.valor, "30");
  assert.equal(com.find((l) => l.campo === "avaliacao_paga")!.evidencia!.a_confirmar, undefined);
  assert.ok(com.every((l) => l.estado === "rascunho"));
  const sem = rascunhoParaCaderno({ ...vazio, campos: [paga, valor] }).linhas;
  assert.deepEqual(sem.map((l) => l.campo), ["avaliacao_paga"]);
  const item = rascunhoParaCaderno({ ...vazio, servicos: [{ nome: "Harmonização", descricao_e_indicacao: "Full face", fonte: "lexia", trecho: "está começando", incerto: true } as never] }).itens[0];
  assert.ok(item.linhas.every((l) => l.evidencia!.a_confirmar === true));
});
