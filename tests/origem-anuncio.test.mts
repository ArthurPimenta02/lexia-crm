/**
 * A regra única de origem de anúncio (lib/meta/origem-anuncio.ts) — o espelho
 * em TS do que a migration 202611190019 faz na base, e o que o script de
 * recuperação do histórico corre.
 *
 * A paridade TS ↔ SQL (normalização, frase, força, triggers) foi corrida num
 * Postgres em memória fora do repo; aqui fica o que não precisa de Postgres:
 * a semente da migration tem de ser exactamente FRASES_INICIAIS, e o leitor do
 * webhook tem de ver o messaging_referrals em changes[] e ignorar ecos.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} });

const regra = await import("@/lib/meta/origem-anuncio");
const leitor = await import("@/lib/meta/webhooks");

const { FRASES_INICIAIS, forcaDaOrigem, frasePronta, normalizarFrase, origemRecuperada } = regra;

test("a semente da migration é exactamente FRASES_INICIAIS", () => {
  const sql = readFileSync(new URL("../supabase/migrations/202611190019_atribuicao_padrao.sql", import.meta.url), "utf8");
  const bloco = sql.split("insert into public.lexia_frases_anuncio (cliente_slug, frase) values")[1].split("on conflict")[0];
  const daMigration = [...bloco.matchAll(/\((null|'[^']+'), '((?:[^']|'')+)'\)/g)]
    .map((m) => [m[1] === "null" ? null : m[1].slice(1, -1), m[2].replace(/''/g, "'")]);
  assert.deepEqual(daMigration, FRASES_INICIAIS.map((f) => [f.cliente_slug, f.frase]));
  assert.ok(FRASES_INICIAIS.every((f) => f.campanha_externa_id === null), "o mapa frase → campanha começa vazio");
});

test("frase pronta: começa por (em qualquer linha), sem acentos nem pontuação, e só as do cliente ou as gerais", () => {
  const sim = [
    ["detail_by_cordeiro", "Olá! Posso saber mais informações sobre isto?"],
    ["detail_by_cordeiro", "OLÁ!! posso saber mais informacoes sobre isto"],
    ["detail_by_cordeiro", "Olá! Posso saber mais informações sobre isto?\n\nValores"],
    ["detail_by_cordeiro", "onde estão?\n\nOlá! Posso saber mais informações sobre isto?"],
    ["detail_by_cordeiro", "Olá! Gostaria de conhecer mais sobre os pacotes de detalhe automóvel"],
    ["miranda_skin_experts", "Hi! I saw your ad and I’d like to know more about the treatments"],
    ["miranda_skin_experts", "¡Hola! Quiero más información"],
    ["claudia_leite_spa", "Hello! Can I get more info on this?"],
  ] as const;
  for (const [slug, t] of sim) assert.ok(frasePronta(slug, t, FRASES_INICIAIS), `${slug}: ${t}`);

  const nao = [
    ["detail_by_cordeiro", "Olá! Posso saber mais informações sobre os vossos serviços?"],
    ["detail_by_cordeiro", "Boa tarde, Olá! Posso saber mais informações sobre isto?"],
    ["detail_by_cordeiro", "Olá! Posso saber mais informações sobre istoo"],
    ["detail_by_cordeiro", "Olá, vim pelo anúncio e gostaria de agendar uma avaliação de pele"],
    ["detail_by_cordeiro", "olá"],
    ["detail_by_cordeiro", ""],
    ["detail_by_cordeiro", null],
  ] as const;
  for (const [slug, t] of nao) assert.equal(frasePronta(slug, t, FRASES_INICIAIS), null, `${slug}: ${t}`);
});

test("a frase do próprio cliente ganha à geral (é a que pode trazer campanha)", () => {
  const frases = [
    { cliente_slug: null, frase: "Olá! Posso saber mais informações sobre isto?", campanha_externa_id: null },
    { cliente_slug: "detail_by_cordeiro", frase: "Olá! Posso saber mais informações sobre isto?", campanha_externa_id: "120200000000000777" },
  ];
  assert.equal(frasePronta("detail_by_cordeiro", "Olá! Posso saber mais informações sobre isto?", frases)?.campanha_externa_id, "120200000000000777");
  assert.equal(frasePronta("miranda_skin_experts", "Olá! Posso saber mais informações sobre isto?", frases)?.campanha_externa_id, null);
});

test("normalização: o que o Postgres faz com translate/lower/regexp", () => {
  assert.equal(normalizarFrase("  ¡Hola!  Quiero MÁS información…"), "hola quiero mas informacion");
  assert.equal(normalizarFrase("I’d"), normalizarFrase("I'd"));
});

test("força da origem: sem < orgânico < anúncio sem id (frase, post) < anúncio com id", () => {
  assert.deepEqual(
    [[null, null], ["organico", "1"], ["anuncio", null], ["instagram_post", "9"], ["ctwa", ""], ["ctwa", "12"], ["messenger_ad", "1"]].map(([t, s]) => forcaDaOrigem(t, s)),
    [0, 1, 2, 2, 2, 3, 3],
  );
});

const ficha = (extra: Partial<Parameters<typeof origemRecuperada>[0]> = {}) => ({
  cliente_slug: "detail_by_cordeiro", identificador_conversa: "messenger:7001", criado_em: "2026-11-10T10:00:00Z",
  origem_tipo: "organico", origem_source_id: null, ...extra,
});
const ref = (recebidoEm: string, ad = "120211111111111111") => ({ anuncioExternoId: ad, titulo: "Pacotes", caminho: "messaging.referral", canal: "messenger", recebidoEm });

test("recuperação: referral na janela de 7 dias ganha à frase; fora da janela não conta; liga à campanha", () => {
  const frase = "Olá! Posso saber mais informações sobre isto?";
  const r = origemRecuperada(ficha(), frase, [ref("2026-11-12T10:00:00Z")], FRASES_INICIAIS, new Map([["120211111111111111", "C-9"]]));
  assert.equal(r?.origem_tipo, "messenger_ad");
  assert.equal(r?.origem_source_id, "120211111111111111");
  assert.equal(r?.origem_dados.campanha_externa_id, "C-9");

  const velho = origemRecuperada(ficha(), frase, [ref("2026-10-01T10:00:00Z")], FRASES_INICIAIS);
  assert.equal(velho?.fonte, "frase_pronta");
  assert.equal(velho?.origem_tipo, "anuncio");
  assert.equal(velho?.origem_source_id, null);

  assert.equal(origemRecuperada(ficha(), "Boa tarde", [ref("2026-11-25T10:00:00Z")], FRASES_INICIAIS), null);
  assert.equal(origemRecuperada(ficha(), "Boa tarde", [ref("2026-11-12T10:00:00Z", "abc")], FRASES_INICIAIS), null, "id que não é número não é anúncio");
});

test("recuperação: nunca rebaixa nem repete — ficha com anúncio fica; ficha com frase só sobe por um referral", () => {
  const frase = "Olá! Posso saber mais informações sobre isto?";
  assert.equal(origemRecuperada(ficha({ origem_tipo: "ctwa", origem_source_id: "120299" }), frase, [ref("2026-11-12T10:00:00Z")], FRASES_INICIAIS), null);
  assert.equal(origemRecuperada(ficha({ origem_tipo: "anuncio" }), frase, [], FRASES_INICIAIS), null);
  assert.equal(origemRecuperada(ficha({ origem_tipo: "anuncio" }), frase, [ref("2026-11-12T10:00:00Z")], FRASES_INICIAIS)?.fonte, "referral");
  assert.equal(origemRecuperada(ficha({ origem_tipo: null }), frase, [], FRASES_INICIAIS)?.fonte, "frase_pronta");
});

test("leitor do webhook: messaging_referrals em changes[] (o teste da Meta de 19/11) e eco ignorado", () => {
  const testeMeta = {
    object: "page",
    entry: [{ id: "0", time: 1795125210, changes: [{ field: "messaging_referrals", value: {
      sender: { id: "12334" }, recipient: { id: "23245" }, timestamp: "1527459824",
      referral: { ref: "EXAMPLE_STRING_PAYLOAD", type: "OPEN_THREAD", source: "SHORTLINK", ads_context_data: { ad_title: "<TITLE_OF_THE_AD>" } },
    } }] }],
  };
  const [a] = leitor.extrairReferraisDoWebhook(testeMeta);
  assert.equal(a.caminho, "changes.messaging_referrals");
  assert.equal(a.remetenteExternoId, "12334");
  assert.equal(a.anuncioExternoId, null, "SHORTLINK sem ad_id não é anúncio");

  const comId = structuredClone(testeMeta);
  (comId.entry[0].changes[0].value.referral as Record<string, unknown>).ad_id = "120233333333333333";
  assert.equal(leitor.extrairReferraisDoWebhook(comId)[0].anuncioExternoId, "120233333333333333");

  const outroCampo = structuredClone(testeMeta);
  outroCampo.entry[0].changes[0].field = "feed";
  assert.deepEqual(leitor.extrairReferraisDoWebhook(outroCampo), []);

  const eco = { object: "instagram", entry: [{ id: "IG", messaging: [{ sender: { id: "IG" }, recipient: { id: "9" }, message: { is_echo: true, mid: "e", referral: { ad_id: "120244444444444444" } } }] }] };
  assert.deepEqual(leitor.extrairReferraisDoWebhook(eco), []);
});
