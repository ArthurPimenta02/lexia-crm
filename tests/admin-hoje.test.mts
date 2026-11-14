import assert from "node:assert/strict";
import test from "node:test";

import { ehAtendimento, mesmoDiaLocal, montarCartao, pedeResposta, semResposta, type Mensagem, type Turno } from "../lib/admin/hoje";

const t = (s: string, v: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k]));
const agora = Date.parse("2026-11-14T18:00:00Z");
const m = (c: string, conversa: string, direccao: string, conteudo: string, horasAtras: number, origem: string | null = "workflow"): Mensagem =>
  ({ cliente_slug: c, identificador_conversa: conversa, direccao, origem, conteudo, criado_em: new Date(agora - horasAtras * 3_600_000).toISOString() });

test("fechos e promessas do cliente não pedem resposta; perguntas e pedidos pedem (casos reais de 14/11)", () => {
  for (const x of ["✅", "👍", "Que bom", "ok, obrigada", "Combinado", "Obrigado", "Ok perfecto", "Eu depois mando te a foto e decide se"]) assert.equal(pedeResposta(x), false, x);
  for (const x of ["Fico no aguardo", "Sim", "Teria um prazo pra esse retorno?", "quero ver se alguem me responde", "Sábado posso", "Tenho cnpj tmb e já to puto com vocês"]) assert.equal(pedeResposta(x), true, x);
});

test("sem resposta: última mensagem do cliente há mais de 20 min; quem tem de responder; isolado por cliente", () => {
  const msgs = [
    m("asteric", "whatsapp:5511", "recebida", "Tenho cnpj tmb e já to puto com vocês", 22, "recebida_na_pausa"),
    m("miranda", "instagram:1", "recebida", "Hi! I want laser", 7),
    m("miranda", "instagram:2", "recebida", "Quanto custa?", 5),
    m("miranda", "instagram:2", "enviada", "Fica US$ 150.", 4.9),
    m("miranda", "instagram:3", "recebida", "Oi", 0.1),
    m("detail", "whatsapp:", "recebida", "[anexo]", 23),
    m("detail", "whatsapp:351", "recebida", "👍", 30),
    m("asteric", "teste:x", "recebida", "teste", 30),
    // o mesmo número em dois clientes: cada um conta no seu
    m("detail", "whatsapp:5511", "enviada", "Olá!", 1),
  ];
  const turnos = new Map<string, Turno>([["miranda|instagram:1", { cliente_slug: "miranda", identificador_conversa: "instagram:1", estado: "parado", motivo: "o Samuel respondeu: conversa pausada 15 min", criado_em: "" }]]);
  const r = semResposta(msgs, turnos, agora);
  assert.deepEqual(r.map((e) => `${e.slug}:${e.conversa}:${e.quem}:${e.irritado}`), ["detail:whatsapp::defeito:false", "asteric:whatsapp:5511:equipe:true", "miranda:instagram:1:equipe:false"]);
});

test("cartão: o número é o que pede ação e a cor diz a urgência", () => {
  const e = (quem: "equipe" | "agente" | "defeito", irritado = false) => ({ slug: "x", conversa: "c", quem, irritado, desdeMs: agora - 43 * 3_600_000, texto: "" });
  const a = montarCartao({ slug: "a", nome: "Asteric", situacao: "no_ar", esperas: [e("equipe", true), e("equipe", true), e("equipe")], marcacoesNovas: 0, agora, t });
  assert.equal(a.numero, 3); assert.equal(a.tom, "alerta"); assert.equal(a.frase, "à espera da equipe"); assert.deepEqual(a.linhas, ["2 clientes irritados", "a mais antiga há 43 h"]);
  const m1 = montarCartao({ slug: "m", nome: "Miranda", situacao: "no_ar", esperas: [e("agente")], marcacoesNovas: 0, agora, t });
  assert.equal(m1.tom, "perigo"); assert.equal(m1.frase, "a agente não respondeu");
  const c = montarCartao({ slug: "c", nome: "Claudia", situacao: "teste", esperas: [], marcacoesNovas: 0, agora, t });
  assert.equal(c.tom, "positivo"); assert.equal(c.numero, 0); assert.deepEqual(c.linhas, []); // "Em teste" já é o selo do cartão
  const d = montarCartao({ slug: "d", nome: "Detail", situacao: "no_ar", esperas: [e("equipe"), e("defeito")], marcacoesNovas: 1, agora, t });
  assert.deepEqual(d.linhas, ["1 à espera da equipe · 1 conversa com defeito", "1 marcação nova"]);
});

test("agenda: só atendimentos (não a prestação do carro nem o Thanksgiving), no dia do fuso de cada cliente", () => {
  assert.equal(ehAtendimento("Prestação carro Samuel vence todo dia 15 - valor 674.00"), false);
  assert.equal(ehAtendimento("Thanksgiving"), false);
  assert.equal(ehAtendimento("(Samuel) Atendimento Lorena Alves (limpeza 120)"), true);
  // 23:00 UTC de 14/11 é 18:00 de 14/11 em Nova York, mas já 15/11 em Lisboa
  assert.equal(mesmoDiaLocal("2026-11-14T23:00:00Z", agora, "America/New_York"), true);
  assert.equal(mesmoDiaLocal("2026-11-14T23:30:00Z", Date.parse("2026-11-15T10:00:00Z"), "Europe/Lisbon"), false);
});
