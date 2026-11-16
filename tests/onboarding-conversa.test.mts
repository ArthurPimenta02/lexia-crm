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
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [] });
  const i = ia(() => ({ ...NADA, campos: [
    { chave: "valor", item: "servicos#1", valor: "US$ 600", lista: [], estado: "respondido" },
    { chave: "duracao_media", item: "servicos#1", valor: "2 horas", lista: [], estado: "respondido" },
    { chave: "contraindicacoes", item: "servicos#1", valor: "", lista: [], estado: "vago" },
  ] }));
  await turno(b.repo, i, msg({ texto: "áudio 1" }), "");
  assert.equal((await atual(b, "duracao_media", "s1"))!.estado, "respondido");
  const c1 = b.ultimoCartao();
  assert.equal(c1.tipo, "item");
  assert.match(b.msgs.at(-1)!.conteudo, /complemento/, "segunda vez no mesmo serviço: é um complemento");
  if (c1.tipo === "item") assert.ok(!c1.faltam.some((f) => f.campo === "valor" || f.campo === "duracao_media"), "o que ela respondeu não volta");
  assert.deepEqual([(await atual(b, "contraindicacoes", "s1"))!.estado, (await atual(b, "contraindicacoes", "s1"))!.perguntas], ["vago", 1]);
  await turno(b.repo, ia(), msg({ texto: "não sei mais" }), "");
  assert.deepEqual([(await atual(b, "contraindicacoes", "s1"))!.estado, (await atual(b, "contraindicacoes", "s1"))!.perguntas], ["vago", 2]);
  const c2 = b.ultimoCartao();
  assert.ok(!(c2.tipo === "item" && c2.itemId === "s1" && c2.faltam.length > 0), "não há terceira pergunta sobre o mesmo serviço");
});

test("'está tudo certo' não gasta uma tentativa: a primeira resposta que não toca nas perguntas não conta; a segunda seguida conta", async () => {
  const b = comServico();
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [] });
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
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [] });
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
  await b.repo.gravarAndamento({ listas: ["servicos"], gruposPerguntados: [] });
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
  assert.equal(c.tipo === "item" && c.nome, "Microblading", "passa ao primeiro serviço, e a lista não volta");
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
  assert.equal(c.tipo, "item", "ela acabou de dizer os serviços: não se pede para conferir a lista");
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
