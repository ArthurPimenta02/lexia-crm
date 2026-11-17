/**
 * O motor da conversa do onboarding (Etapa 2).
 *
 * O que é que isto está a proteger
 * --------------------------------
 * "A pior coisa que pode acontecer é ela ter de ser entrevistada de novo" e
 * "não podemos ficar repetindo pergunta" (Arthur, 16/11/2026). Aqui prova-se,
 * com um banco em memória e uma IA de mentira, que:
 *   - a mensagem dela é gravada antes de tudo, e uma falha da IA não deixa nada a meio;
 *   - reenviar a mesma mensagem não anota duas vezes;
 *   - a IA não escreve no caderno o que não cabe no esquema, nem reescreve o que já foi respondido;
 *   - nada é perguntado mais de duas vezes, e a entrevista termina sempre.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { montarCaderno, resumir, type Andamento, type ItemDoCaderno, type LinhaDoCaderno } from "../lib/onboarding/caderno";
import { abrirConversa, turno, type Cartao, type ContextoDaExtracao, type Extracao, type Inteligencia, type MensagemDaConversa, type Repositorio, type Resposta } from "../lib/onboarding/conversa";
import type { NovaLinha } from "../lib/onboarding/dados";

function banco(inicio: { linhas?: NovaLinha[]; itens?: ItemDoCaderno[] } = {}) {
  const diario: (NovaLinha & { n: number })[] = [];
  const itens: ItemDoCaderno[] = [...(inicio.itens ?? [])];
  const msgs: MensagemDaConversa[] = [];
  let andamento: Andamento = { listas: [], gruposPerguntados: [] };
  let n = 0;
  let terminou = false;
  const acrescentar = (ls: NovaLinha[]) => { for (const l of ls) diario.push({ ...l, n: ++n }); };
  acrescentar(inicio.linhas ?? []);
  const repo: Repositorio = {
    async linhas() {
      const ultimo = new Map<string, NovaLinha & { n: number }>();
      for (const l of diario) ultimo.set(`${l.itemId ?? ""}|${l.campo}`, l);
      return [...ultimo.values()].map((l): LinhaDoCaderno => ({ campo: l.campo, item_id: l.itemId ?? null, valor: l.valor, estado: l.estado, fonte: l.fonte, perguntas: l.perguntas ?? 0 }));
    },
    async itens() { return itens.map((i) => ({ ...i })); },
    async andamento() { return JSON.parse(JSON.stringify(andamento)); },
    async gravarAndamento(a) { andamento = JSON.parse(JSON.stringify(a)); },
    async acrescentarLinhas(ls) { acrescentar(ls); },
    async criarItem(grupo, ordem) { const id = `${grupo}-${itens.length + 1}`; itens.push({ id, grupo, ordem, removido: false }); return id; },
    async removerItens(ids) { for (const i of itens) if (ids.includes(i.id)) i.removido = true; },
    async gravarDaCliente(r) {
      const ja = msgs.find((m) => m.dados.idDoAparelho === r.idDoAparelho);
      if (ja) return ja;
      const m: MensagemDaConversa = { id: `m${msgs.length + 1}`, autor: "cliente", tipo: "texto", conteudo: r.texto ?? r.textoDoArquivo ?? "", dados: { idDoAparelho: r.idDoAparelho }, criado_em: "", processada_em: null };
      msgs.push(m);
      return m;
    },
    async marcarProcessada(id) { msgs.find((m) => m.id === id)!.processada_em = "agora"; },
    async gravarDaEntrevistadora(texto, cartao) {
      const m: MensagemDaConversa = { id: `m${msgs.length + 1}`, autor: "entrevistadora", tipo: "texto", conteudo: texto, dados: { passo: cartao }, criado_em: "", processada_em: "agora" };
      msgs.push(m);
      return m;
    },
    async mensagens() { return [...msgs]; },
    async terminar() { terminou = true; },
  };
  return { repo, diario, itens, msgs, terminou: () => terminou, andamento: () => andamento, ultimoCartao: () => [...msgs].reverse().find((m) => m.autor === "entrevistadora")!.dados.passo as Cartao };
}

const NADA: Extracao = { campos: [], horarios: [], novos_itens: [], duvida: "" };
function ia(extrair: (c: ContextoDaExtracao) => Extracao | Promise<Extracao> = () => NADA): Inteligencia & { chamadas: ContextoDaExtracao[] } {
  const chamadas: ContextoDaExtracao[] = [];
  return { chamadas, async extrair(c) { chamadas.push(c); return extrair(c); }, async falar(c) { return `fala:${c.passo.tipo}${c.complemento ? ":complemento" : ""}`; } };
}
let seq = 0;
const msg = (r: Omit<Resposta, "idDoAparelho"> & { idDoAparelho?: string }): Resposta => ({ idDoAparelho: `a${++seq}`, ...r });
const rascunho = (campo: string, valor: unknown, itemId: string | null = null): NovaLinha => ({ campo, itemId, valor, estado: "rascunho", fonte: "site" });
const servico = (id: string, ordem = 0): ItemDoCaderno => ({ id, grupo: "servicos", ordem, removido: false });
const comServico = () => banco({ itens: [servico("s1")], linhas: [{ campo: "nome", itemId: "s1", valor: "Microblading", estado: "confirmado", fonte: "cliente" }] });
const atual = async (b: ReturnType<typeof banco>, campo: string, item: string | null = null) => (await b.repo.linhas()).find((l) => l.campo === campo && l.item_id === item);

test("abrir a conversa apresenta a Lia e o primeiro passo, uma vez só", async () => {
  const b = banco({ linhas: [rascunho("nome_do_negocio", "Jessica Bruns Beauty Studio")] });
  const r1 = await abrirConversa(b.repo, ia(), "Jessica Bruns");
  assert.equal(r1.mensagens.length, 1);
  assert.match(r1.mensagens[0].conteudo, /Oi, Jessica! Eu sou a Lia/);
  assert.equal(b.ultimoCartao().tipo, "confirmar");
  const r2 = await abrirConversa(b.repo, ia(), "Jessica Bruns");
  assert.equal(r2.mensagens.length, 1, "abrir de novo não cria outra mensagem");
});

test("confirmar: igual ao rascunho fica confirmado, corrigido fica respondido, 'não é isso' segue para a conversa", async () => {
  const b = banco({ linhas: [rascunho("nome_do_negocio", "Jessica Beauty"), rascunho("cidade", "Malden"), rascunho("endereco_completo", "Rua errada")] });
  const i = ia();
  await turno(b.repo, i, msg({ valores: [{ campo: "nome_do_negocio", itemId: null, valor: "Jessica Bruns Beauty Studio" }, { campo: "cidade", itemId: null, valor: "Malden" }, { campo: "endereco_completo", itemId: null, valor: null }] }), "");
  assert.equal(i.chamadas.length, 0, "cartão não gasta IA");
  assert.deepEqual([(await atual(b, "nome_do_negocio"))!.estado, (await atual(b, "nome_do_negocio"))!.valor], ["respondido", "Jessica Bruns Beauty Studio"]);
  assert.equal((await atual(b, "cidade"))!.estado, "confirmado");
  const end = (await atual(b, "endereco_completo"))!;
  assert.deepEqual([end.estado, end.perguntas], ["vago", 1], "sai do rascunho e fica por perguntar");
  assert.notEqual(b.ultimoCartao().tipo, "confirmar", "o mesmo cartão não volta");
});

test("a mensagem é gravada antes da IA; se a IA falha, nada fica a meio e reenviar recomeça sem duplicar", async () => {
  const b = comServico();
  b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [] });
  let falhar = true;
  const i = ia(() => { if (falhar) throw new Error("IA fora do ar"); return { ...NADA, campos: [{ chave: "valor", item: "servicos#1", valor: "US$ 600", lista: [], estado: "respondido" }] }; });
  const m = msg({ texto: "custa 600 dólares" });
  await assert.rejects(turno(b.repo, i, m, ""));
  assert.equal(b.msgs.filter((x) => x.autor === "cliente").length, 1, "a mensagem dela ficou guardada");
  assert.equal(b.msgs[0].processada_em, null);
  assert.equal(b.diario.length, 1, "nenhuma linha escrita a meio");
  falhar = false;
  await turno(b.repo, i, m, "");
  assert.equal(b.msgs.filter((x) => x.autor === "cliente").length, 1, "reenviar não duplica a mensagem");
  assert.equal((await atual(b, "valor", "s1"))!.valor, "US$ 600");
  const linhasAntes = b.diario.length;
  await turno(b.repo, i, m, "");
  assert.equal(b.diario.length, linhasAntes, "mensagem já tratada não anota de novo");
  assert.equal(i.chamadas.length, 2, "nem volta a gastar IA");
});

test("um áudio responde vários campos do serviço; o que faltar ganha UM complemento e depois vira pendência", async () => {
  const b = comServico();
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [], tabelas: ["servicos"] });
  const i = ia(() => ({ ...NADA, campos: [
    { chave: "valor", item: "servicos#1", valor: "US$ 600", lista: [], estado: "respondido" },
    { chave: "duracao_media", item: "servicos#1", valor: "2 horas", lista: [], estado: "respondido" },
    { chave: "contraindicacoes", item: "servicos#1", valor: "", lista: [], estado: "vago" },
  ] }));
  await turno(b.repo, i, msg({ texto: "áudio 1" }), "");
  assert.equal((await atual(b, "duracao_media", "s1"))!.estado, "respondido");
  const c1 = b.ultimoCartao();
  assert.equal(c1.tipo, "item");
  assert.match(b.msgs.at(-1)!.conteudo, /^Anotei\. Sobre Microblading, ficou faltando só isto\./, "segunda vez no mesmo serviço: é um complemento, curto e escrito pelo código");
  if (c1.tipo === "item") assert.ok(!c1.faltam.some((f) => f.campo === "valor" || f.campo === "duracao_media"), "o que ela respondeu não volta");
  assert.deepEqual([(await atual(b, "contraindicacoes", "s1"))!.estado, (await atual(b, "contraindicacoes", "s1"))!.perguntas], ["vago", 1]);
  await turno(b.repo, ia(), msg({ texto: "não sei mais" }), "");
  assert.deepEqual([(await atual(b, "contraindicacoes", "s1"))!.estado, (await atual(b, "contraindicacoes", "s1"))!.perguntas], ["vago", 2]);
  const c2 = b.ultimoCartao();
  assert.ok(!(c2.tipo === "item" && c2.itemId === "s1" && c2.faltam.length > 0), "não há terceira pergunta sobre o mesmo serviço");
});

test("'está tudo certo' não gasta uma tentativa: a primeira resposta que não toca nas perguntas não conta; a segunda seguida conta", async () => {
  const b = comServico();
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [], tabelas: ["servicos"] });
  await turno(b.repo, ia(), msg({ texto: "está tudo certo" }), "");
  assert.equal(await atual(b, "contraindicacoes", "s1"), undefined, "nenhuma pergunta foi contada");
  const c1 = b.ultimoCartao();
  assert.ok(c1.tipo === "item" && c1.itemId === "s1" && c1.faltam.length > 5, "o serviço continua inteiro por perguntar");
  await turno(b.repo, ia(), msg({ texto: "ok" }), "");
  assert.equal((await atual(b, "contraindicacoes", "s1"))!.perguntas, 2, "à segunda vez seguida sem resposta, o assunto fecha");
  const c2 = b.ultimoCartao();
  assert.ok(!(c2.tipo === "item" && c2.itemId === "s1" && c2.faltam.length > 0), "o serviço não aparece uma terceira vez");
});

test("o código confere o que a IA devolve: opção inexistente, item desconhecido e campo já respondido ficam de fora", async () => {
  const b = comServico();
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [], tabelas: ["servicos"] });
  await b.repo.acrescentarLinhas([{ campo: "nome_do_agente", valor: "Bia", estado: "respondido", fonte: "cliente" }]);
  await turno(b.repo, ia(() => ({ ...NADA, campos: [
    { chave: "tipo_de_preco", item: "servicos#1", valor: "Baratinho", lista: [], estado: "respondido" },
    { chave: "valor", item: "servicos#9", valor: "US$ 1", lista: [], estado: "respondido" },
    { chave: "nome_do_agente", item: "", valor: "Outra", lista: [], estado: "respondido" },
    { chave: "emojis", item: "", valor: "Nunca", lista: [], estado: "respondido" },
    { chave: "numero_de_sessoes", item: "servicos#1", valor: "", lista: [], estado: "nao_se_aplica" },
  ] })), msg({ texto: "blá" }), "");
  assert.notEqual((await atual(b, "tipo_de_preco", "s1"))?.estado, "respondido", "opção que não existe não entra");
  assert.equal((await atual(b, "nome_do_agente"))!.valor, "Bia", "a IA não reescreve o que já foi respondido");
  assert.equal((await atual(b, "numero_de_sessoes", "s1"))!.estado, "nao_se_aplica");
  assert.equal((await atual(b, "emojis"))?.valor, "Nunca", "resposta dada de passagem a um campo em aberto fica anotada");
  assert.ok(!b.diario.some((l) => l.valor === "US$ 1"));
});

test("uma dúvida dela não gasta uma pergunta; 'não sei agora' manda para a Lexia", async () => {
  const b = comServico();
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [], tabelas: ["servicos"] });
  await turno(b.repo, ia(() => ({ ...NADA, duvida: "o que é contraindicação?" })), msg({ texto: "o que é contraindicação?" }), "");
  assert.equal(b.diario.length, 1, "nada foi contado como pergunta");
  const antes = b.ultimoCartao();
  assert.equal(antes.tipo === "item" && antes.itemId, "s1");
  await turno(b.repo, ia(), msg({ pular: true }), "");
  const abertos = montarCaderno(await b.repo.linhas(), await b.repo.itens()).filter((c) => c.itemId === "s1");
  assert.ok(abertos.length > 5 && abertos.every((c) => c.situacao === "pendencia" || c.situacao === "resolvido"));
  assert.ok(!(b.ultimoCartao().tipo === "item"), "segue em frente");
});

test("lista de serviços: tira os que ela não faz, acrescenta os que faltam e confirma os nomes", async () => {
  const b = banco({ itens: [servico("s1", 0), servico("s2", 1)], linhas: [rascunho("nome", "Microblading", "s1"), rascunho("nome", "Depilação", "s2")] });
  await abrirConversa(b.repo, ia(), "");
  assert.equal(b.ultimoCartao().tipo, "lista");
  await turno(b.repo, ia(), msg({ lista: { manter: ["s1"], novos: ["Lip Blush", " "] } }), "");
  const ativos = b.itens.filter((x) => !x.removido);
  assert.equal(ativos.length, 2);
  assert.equal((await atual(b, "nome", "s1"))!.estado, "confirmado");
  assert.equal((await atual(b, "nome", ativos[1].id))!.valor, "Lip Blush");
  const c = b.ultimoCartao();
  assert.equal(c.tipo === "tabela" && c.linhas.map((l) => l.nome).join(), "Microblading,Lip Blush", "passa à tabela de preço e duração, e a lista não volta");
});

test("tabela dos serviços: preço e duração de todos de uma vez; aparece uma vez só e o que ficou em branco é perguntado no serviço", async () => {
  const b = banco({
    itens: [servico("s1", 0), servico("s2", 1), servico("s3", 2)],
    linhas: [
      { campo: "nome", itemId: "s1", valor: "Microblading", estado: "confirmado", fonte: "cliente" },
      { campo: "nome", itemId: "s2", valor: "Lash Lifting", estado: "confirmado", fonte: "cliente" },
      { campo: "nome", itemId: "s3", valor: "Botox", estado: "confirmado", fonte: "cliente" },
      rascunho("duracao_media", "2 horas", "s1"),
    ],
  });
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [] });
  await abrirConversa(b.repo, ia(), "");
  const c = b.ultimoCartao();
  assert.ok(c.tipo === "tabela" && c.linhas.length === 3);
  if (c.tipo !== "tabela") return;
  assert.deepEqual(c.linhas[0].campos.map((f) => f.campo), ["tipo_de_preco", "valor", "duracao_media"], "o preço entra na tabela mesmo antes de o tipo de preço ser respondido");
  assert.equal(c.linhas[0].campos[2].valor, "2 horas", "o que as fontes acharam vem escrito na linha");
  const i = ia();
  await turno(b.repo, i, msg({ valores: [
    { campo: "tipo_de_preco", itemId: "s1", valor: "Preço fixo" }, { campo: "valor", itemId: "s1", valor: "650" }, { campo: "duracao_media", itemId: "s1", valor: "2 horas" },
    { campo: "tipo_de_preco", itemId: "s2", valor: "Sob orçamento — só após avaliação presencial" }, { campo: "duracao_media", itemId: "s2", valor: "1h" },
    { campo: "tipo_de_preco", itemId: "s3", valor: "Inventado" },
  ] }), "");
  assert.equal(i.chamadas.length, 0, "tabela respondida no cartão não passa pela IA");
  assert.deepEqual([(await atual(b, "valor", "s1"))!.valor, (await atual(b, "valor", "s1"))!.estado], ["650", "respondido"]);
  assert.equal((await atual(b, "duracao_media", "s1"))!.estado, "confirmado", "igual ao rascunho: confirmado");
  assert.equal((await atual(b, "tipo_de_preco", "s2"))!.estado, "respondido");
  assert.notEqual((await atual(b, "tipo_de_preco", "s3"))?.estado, "respondido", "opção que não existe não entra");
  assert.deepEqual(b.andamento().tabelas, ["servicos"]);
  // a tabela não volta; o Botox, que ficou em branco, é perguntado no passo dele (uma vez mais, nunca uma terceira)
  const vistos: string[] = [];
  for (let n = 0; n < 12 && b.ultimoCartao().tipo !== "fim"; n++) {
    const p = b.ultimoCartao();
    assert.notEqual(p.tipo, "tabela", "a tabela apareceu de novo");
    if (p.tipo !== "item" || p.grupo !== "servicos") break;
    vistos.push(`${p.nome}:${p.faltam.map((f) => f.campo).filter((x) => ["tipo_de_preco", "valor", "duracao_media"].includes(x)).join("+")}`);
    await turno(b.repo, ia(), msg({ pular: true }), "");
  }
  assert.ok(vistos.includes("Botox:tipo_de_preco+duracao_media"), `o que ficou em branco na tabela tem de ser perguntado no serviço: ${vistos.join(" | ")}`);
  assert.ok(vistos.some((v) => v === "Microblading:"), "o que ela preencheu na tabela não volta");
});

test("serviço só com rascunho da Lexia: conferir é um toque, sem chamar a IA, e o que ela corrige fica como resposta dela", async () => {
  const b = banco({
    itens: [servico("s1")],
    linhas: [
      { campo: "nome", itemId: "s1", valor: "Microblading", estado: "confirmado", fonte: "cliente" },
      ...["tipo_de_preco:Preço fixo", "valor:650", "duracao_media:2h", "motivo_da_avaliacao:x"].slice(0, 3).map((x) => ({ campo: x.split(":")[0], itemId: "s1", valor: x.split(":")[1], estado: "respondido" as const, fonte: "cliente" as const })),
      ...["descricao_e_indicacao", "para_quem_indicar", "preparo_e_cuidados", "contraindicacoes", "numero_de_sessoes"].map((campo) => ({ campo, itemId: "s1", valor: `rascunho de ${campo}`, estado: "rascunho" as const, fonte: "recomendacao" as const })),
    ],
  });
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [], tabelas: ["servicos"] });
  let falas = 0;
  const i: Inteligencia = { async extrair() { return NADA; }, async falar() { falas++; return "fala da IA"; } };
  await abrirConversa(b.repo, i, "");
  const c = b.ultimoCartao();
  assert.ok(c.tipo === "item" && c.faltam.length === 0 && c.confirmar.length === 5, JSON.stringify(c));
  assert.equal(falas, 0, "apresentar um rascunho para conferir não precisa de IA");
  if (c.tipo !== "item") return;
  assert.ok(c.confirmar.every((f) => f.fonte === "recomendacao"), "a tela sabe que foi a Lexia que escreveu");
  assert.deepEqual(c.confirmar.filter((f) => f.atencao).map((f) => f.campo).sort(), ["contraindicacoes", "preparo_e_cuidados"], "informação de saúde vem marcada para conferir com atenção");
  await turno(b.repo, i, msg({ valores: c.confirmar.map((f) => ({ campo: f.campo, itemId: "s1", valor: f.campo === "contraindicacoes" ? "Gestantes e quem usa isotretinoína" : f.valor })) }), "");
  assert.equal((await atual(b, "para_quem_indicar", "s1"))!.estado, "confirmado");
  assert.deepEqual([(await atual(b, "contraindicacoes", "s1"))!.estado, (await atual(b, "contraindicacoes", "s1"))!.valor], ["respondido", "Gestantes e quem usa isotretinoína"]);
  assert.ok(!(b.ultimoCartao().tipo === "item" && (b.ultimoCartao() as { itemId: string }).itemId === "s1"), "o serviço fica fechado num turno só");
});

test("perguntas frequentes sugeridas: conferem-se todas num cartão só; a que ela tira sai, a que ela corrige fica como resposta dela", async () => {
  const faq = (id: string, ordem: number): ItemDoCaderno => ({ id, grupo: "faqs", ordem, removido: false });
  const sug = (campo: string, valor: string, itemId: string): NovaLinha => ({ campo, itemId, valor, estado: "rascunho", fonte: "recomendacao" });
  const b = banco({ itens: [faq("f1", 0), faq("f2", 1), faq("f3", 2)], linhas: [sug("pergunta", "Dói?", "f1"), sug("resposta", "Usamos anestésico.", "f1"), sug("pergunta", "Quanto tempo dura?", "f2"), sug("resposta", "De 1 a 2 anos.", "f2"), sug("pergunta", "Posso fazer grávida?", "f3"), sug("resposta", "Não.", "f3")] });
  await b.repo.gravarAndamento({ listas: ["servicos", "profissionais"], gruposPerguntados: ["servicos", "servicos", "profissionais"] });
  // tudo o resto já respondido: só interessa o grupo
  const resto = montarCaderno(await b.repo.linhas(), await b.repo.itens()).filter((c) => !c.grupo);
  await b.repo.acrescentarLinhas(resto.map((c) => ({ campo: c.campo.chave, valor: null, estado: "nao_se_aplica" as const, fonte: "cliente" as const })));
  let falas = 0;
  const i: Inteligencia = { async extrair() { return NADA; }, async falar() { falas++; return "fala"; } };
  await abrirConversa(b.repo, i, "");
  const c = b.ultimoCartao();
  assert.ok(c.tipo === "lista" && c.grupo === "faqs", JSON.stringify(c).slice(0, 200));
  if (c.tipo !== "lista") return;
  assert.deepEqual(c.itens.map((x) => [x.nome, x.campos?.map((f) => f.campo).join(), x.campos?.[0].fonte]), [["Dói?", "resposta", "recomendacao"], ["Quanto tempo dura?", "resposta", "recomendacao"], ["Posso fazer grávida?", "resposta", "recomendacao"]]);
  assert.equal(falas, 0);
  await turno(b.repo, i, msg({ lista: { manter: ["f1", "f2"], novos: [] }, valores: [{ campo: "resposta", itemId: "f1", valor: "Usamos anestésico." }, { campo: "resposta", itemId: "f2", valor: "De 1 a 3 anos, depende da pele." }] }), "");
  assert.deepEqual([(await atual(b, "pergunta", "f1"))!.estado, (await atual(b, "resposta", "f1"))!.estado], ["confirmado", "confirmado"]);
  assert.deepEqual([(await atual(b, "resposta", "f2"))!.estado, (await atual(b, "resposta", "f2"))!.valor], ["respondido", "De 1 a 3 anos, depende da pele."]);
  assert.ok(b.itens.find((x) => x.id === "f3")!.removido, "a que ela desmarcou sai");
  const depois = b.ultimoCartao();
  assert.ok(!(depois.tipo === "item" && depois.grupo === "faqs") && !(depois.tipo === "lista" && depois.grupo === "faqs"), "as perguntas frequentes fecharam num turno só");
});

test("escolhas com recomendação: vão todas juntas, uma vez, com a recomendada à vista; o que ela não escolher volta na seção", async () => {
  const b = banco({ itens: [servico("s1")], linhas: [{ campo: "nome", itemId: "s1", valor: "Botox", estado: "confirmado", fonte: "cliente" }] });
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: ["profissionais"], tabelas: ["servicos"] });
  const doServico = montarCaderno(await b.repo.linhas(), await b.repo.itens()).filter((c) => c.itemId === "s1" && c.campo.chave !== "nome");
  await b.repo.acrescentarLinhas(doServico.map((c) => ({ campo: c.campo.chave, itemId: "s1", valor: null, estado: "nao_se_aplica" as const, fonte: "cliente" as const })));
  await abrirConversa(b.repo, ia(), "");
  const c = b.ultimoCartao();
  assert.ok(c.tipo === "cartoes" && c.secao === "recomendadas" && c.campos.length >= 20, JSON.stringify(c).slice(0, 200));
  if (c.tipo !== "cartoes") return;
  assert.ok(c.campos.every((f) => f.recomendado !== undefined), "só entram escolhas que têm recomendação");
  assert.ok(new Set(c.campos.map((f) => f.campo)).has("emojis") && new Set(c.campos.map((f) => f.campo)).has("ativar_follow_up"), "de todas as seções");
  // ela aceita todas menos uma, que muda, e deixa uma por escolher
  const semEsta = c.campos.find((f) => f.campo === "emojis")!;
  await turno(b.repo, ia(), msg({ valores: c.campos.filter((f) => f !== semEsta).map((f) => ({ campo: f.campo, itemId: null, valor: f.campo === "forma_de_tratamento" ? f.opcoes!.find((o) => o !== f.recomendado) : f.recomendado })) }), "");
  assert.equal((await atual(b, "ativar_follow_up"))!.estado, "respondido");
  assert.notEqual((await atual(b, "forma_de_tratamento"))!.valor, c.campos.find((f) => f.campo === "forma_de_tratamento")!.recomendado, "o que ela mudou fica como ela escolheu");
  const vistos: string[] = [];
  for (let n = 0; n < 40 && b.ultimoCartao().tipo !== "fim"; n++) {
    const p = b.ultimoCartao();
    assert.ok(!(p.tipo === "cartoes" && p.secao === "recomendadas"), "o cartão das recomendações apareceu de novo");
    if (p.tipo === "cartoes") vistos.push(...p.campos.map((f) => f.campo));
    await turno(b.repo, ia(), msg({ pular: true }), "");
  }
  assert.ok(vistos.includes("emojis"), "o que ela deixou por escolher volta na seção dele");
  assert.ok(!vistos.includes("ativar_follow_up"), "o que ela aceitou não volta");
});

test("grupo vazio: ela conta quais são e eles entram como itens; itens repetidos não duplicam", async () => {
  const b = banco();
  await abrirConversa(b.repo, ia(), "");
  assert.deepEqual(b.ultimoCartao(), { tipo: "itens", grupo: "servicos", obrigatorio: true });
  const i = ia(() => ({ ...NADA, novos_itens: [{ grupo: "servicos", nome: "Botox", campos: [{ chave: "valor", valor: "US$ 12 por unidade" }] }, { grupo: "servicos", nome: "botox", campos: [] }, { grupo: "inventado", nome: "x", campos: [] }] }));
  await turno(b.repo, i, msg({ texto: "faço botox, 12 dólares a unidade" }), "");
  const ativos = b.itens.filter((x) => !x.removido);
  assert.equal(ativos.length, 1);
  assert.equal((await atual(b, "valor", ativos[0].id))!.valor, "US$ 12 por unidade");
  const c = b.ultimoCartao();
  assert.equal(c.tipo, "tabela", "ela acabou de dizer os serviços: não se pede para conferir a lista");
  assert.ok(c.tipo === "tabela" && !c.linhas[0].campos.some((f) => f.campo === "valor"), "o preço que ela já disse não volta na tabela");
});

test("entrevista inteira: termina sempre, nada é perguntado mais de duas vezes e o que ela respondeu fica resolvido", async () => {
  for (const colabora of [true, false]) {
    const b = banco({ itens: [servico("s1", 0), servico("s2", 1)], linhas: [rascunho("nome_do_negocio", "Studio"), rascunho("nome", "Microblading", "s1"), rascunho("nome", "Lip Blush", "s2"), rascunho("duracao_media", "2 horas", "s1")] });
    const vezes = new Map<string, number>();
    const conta = (c: Cartao) => {
      const campos = c.tipo === "item" ? c.faltam : c.tipo === "pergunta" ? c.campos : [];
      for (const f of campos) vezes.set(`${f.itemId}|${f.campo}`, (vezes.get(`${f.itemId}|${f.campo}`) ?? 0) + 1);
    };
    // Uma IA que "ouve" a resposta a tudo o que o passo pergunta em conversa.
    const i = ia((c) => {
      if (!colabora) return NADA;
      const p = c.passo;
      if (p.tipo === "itens") return { ...NADA, novos_itens: [{ grupo: p.grupo, nome: `novo de ${p.grupo}`, campos: [] }] };
      const ref = p.tipo === "item" ? c.itens.find((x) => x.nome === p.nome)?.ref ?? "" : "";
      const campos = p.tipo === "item" ? p.faltam : p.tipo === "pergunta" ? p.campos : [];
      const horarios = campos.some((f) => f.campo === "horario_por_dia") ? [{ dia: "Seg", abre: "9:00", fecha: "18:00" }] : [];
      return { ...NADA, horarios, campos: campos.filter((f) => f.campo !== "horario_por_dia").map((f) => ({ chave: f.campo, item: ref, valor: f.opcoes?.[0] ?? "resposta", lista: f.tipo === "multi" ? [f.opcoes![0]] : [], estado: "respondido" as const })) };
    });
    await abrirConversa(b.repo, i, "Jessica");
    let turnos = 0;
    for (; turnos < 400 && !b.terminou(); turnos++) {
      const c = b.ultimoCartao();
      conta(c);
      const cartao = c.tipo === "item" ? [...c.confirmar, ...c.cartoes] : c.tipo === "confirmar" || c.tipo === "cartoes" ? c.campos : [];
      const valores = colabora ? cartao.map((f) => ({ campo: f.campo, itemId: f.itemId, valor: f.valor ?? f.recomendado ?? (f.tipo === "multi" ? [f.opcoes![0]] : f.opcoes?.[0]) ?? "ok" })) : [];
      await turno(b.repo, i, msg({ texto: c.tipo === "item" || c.tipo === "pergunta" || c.tipo === "itens" ? "resposta em áudio" : colabora ? undefined : "hmm", valores, lista: c.tipo === "lista" && colabora ? { manter: c.itens.map((x) => x.id), novos: [] } : undefined }), "Jessica");
    }
    assert.ok(b.terminou(), `colabora=${colabora}: a entrevista não terminou em ${turnos} turnos`);
    assert.ok(Math.max(...vezes.values()) <= 2, `colabora=${colabora}: um campo foi perguntado ${Math.max(...vezes.values())} vezes`);
    const itens = await b.repo.itens();
    const r = resumir(montarCaderno(await b.repo.linhas(), itens), itens);
    assert.equal(r.faltam, 0, "não sobra nada por perguntar");
    assert.equal(r.porConfirmar, 0, "não sobra rascunho por confirmar");
    if (colabora) {
      assert.equal(r.podeAprovar, true, r.bloqueiam.slice(0, 8).map((x) => `${x.itemId ?? ""}|${x.campo.chave}:${x.situacao}`).join(", ") + " | " + r.gruposSemItem.join(","));
      assert.ok(turnos < 90, `quem colabora termina em ${turnos} turnos`);
      console.log(`    quem responde tudo termina em ${turnos} turnos`);
    } else {
      assert.equal(r.podeAprovar, false);
    }
  }
});
