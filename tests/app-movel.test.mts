/**
 * App do iPhone (/m): o que um teste tem de guardar.
 *
 * 1. A empresa vem SEMPRE da sessão. O pedido de envio não escolhe o cliente,
 *    e a mídia só pode vir de um caminho da própria empresa no bucket.
 * 2. O estado de cada conversa (à espera / comigo / agente) segue a mesma
 *    regra dos avisos do iPhone.
 * 3. O idioma é o do iPhone (Arthur, 05/11), incluindo inglês e espanhol.
 * 4. O login só volta para caminhos /m (nunca para um site de fora).
 * 5. Datas e "hoje" contam-se no fuso do cliente, não no da Vercel.
 * 6. O eco que o agente grava na Meta não aparece duas vezes no chat.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

let contexto: unknown = null;
const chamadas: { caminho: string; corpo: Record<string, unknown> }[] = [];
mock.module("@/lib/movel/contexto", {
  namedExports: {
    contextoMovel: async () => contexto,
  },
});
mock.module("@/lib/movel/plataforma", {
  namedExports: {
    chamarPlataforma: async (caminho: string, corpo: Record<string, unknown>) => {
      chamadas.push({ caminho, corpo });
      return { mensagem_id: "m1" };
    },
    ErroPlataforma: class extends Error {
      status = 500;
    },
  },
});
const base = new FakeSupabase({});
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });

const { idiomaDoAparelho } = await import("@/lib/i18n/idiomas");
const { destinoSeguro } = await import("@/lib/movel/destino");
const { estadoDe, canalDe, telefoneLegivel } = await import("@/lib/movel/conversas");
const { duracaoCurta, quandoCurto, iniciais } = await import("@/lib/movel/formato");
const { limitesDoDia, semanaDe } = await import("@/lib/movel/hoje");
const { caminhoDoOriginal, parteSegura, tipoDaMidia } = await import("@/lib/movel/midia");
const enviar = await import("@/app/api/m/enviar/route");
const { semEcos } = await import("@/app/m/conversas/[conversa]/chat");

const t = (s: string) => s;
const sessaoDe = (clienteSlug: string) => ({ admin: false, clienteNome: "X", clienteSlug, fuso: "Europe/Lisbon", idioma: "pt-BR", locale: "pt-BR", nomeUsuario: "Martim", t, userId: "u1" });
const pedido = (corpo: unknown) => new Request("https://painel.test/api/m/enviar", { body: JSON.stringify(corpo), headers: { "content-type": "application/json" }, method: "POST" });

test("envio: a empresa vem da sessão, nunca do pedido", async () => {
  contexto = sessaoDe("empresa_a");
  chamadas.length = 0;
  const r = await enviar.POST(pedido({ cliente_slug: "empresa_b", conversa: "whatsapp:351912345678", texto: "Olá" }));
  assert.equal(r.status, 200);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].caminho, "/enviar");
  assert.equal(chamadas[0].corpo.cliente_slug, "empresa_a");
  assert.equal(chamadas[0].corpo.texto, "Olá");
});

test("envio: mídia de outra empresa ou fora da pasta é recusada antes de chamar a VPS", async () => {
  contexto = sessaoDe("empresa_a");
  chamadas.length = 0;
  for (const caminho of ["empresa_b/whatsapp_1/x.jpg", "empresa_a/../empresa_b/x.jpg", "x.jpg"]) {
    const r = await enviar.POST(pedido({ conversa: "whatsapp:351912345678", midia: { caminho, mime: "image/jpeg" } }));
    assert.equal(r.status, 400, caminho);
  }
  assert.equal(chamadas.length, 0);
  const ok = await enviar.POST(pedido({ conversa: "whatsapp:351912345678", midia: { caminho: "empresa_a/whatsapp_351912345678/original-1.jpg", mime: "image/jpeg" }, texto: "legenda" }));
  assert.equal(ok.status, 200);
  assert.deepEqual(chamadas[0].corpo.midia, { caminho: "empresa_a/whatsapp_351912345678/original-1.jpg", mime: "image/jpeg", tipo: "imagem" });
  assert.equal(chamadas[0].corpo.legenda, "legenda");
});

test("envio: sem sessão, conversa estranha ou texto vazio, recusa", async () => {
  contexto = null;
  assert.equal((await enviar.POST(pedido({ conversa: "whatsapp:351912345678", texto: "x" }))).status, 401);
  contexto = sessaoDe("empresa_a");
  assert.equal((await enviar.POST(pedido({ conversa: "<script>", texto: "x" }))).status, 400);
  assert.equal((await enviar.POST(pedido({ conversa: "whatsapp:351912345678", texto: "   " }))).status, 400);
  assert.equal((await enviar.POST(pedido({ conversa: "whatsapp:351912345678", texto: "x".repeat(5000) }))).status, 400);
});

test("caminho da mídia: dentro da pasta da empresa e no formato que o painel aceita", () => {
  const c = caminhoDoOriginal("detail_by_cordeiro", "whatsapp:351912345678", "audio/mp4", "abc");
  assert.equal(c, "detail_by_cordeiro/whatsapp_351912345678/original-abc.m4a");
  assert.match(c, /^[a-z0-9_]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/);
  assert.equal(parteSegura("../x y"), "x_y");
  assert.equal(tipoDaMidia("video/quicktime"), "video");
});

const msg = (direccao: string, origem: string | null, criado_em: string) => ({ criado_em, direccao, origem });

test("estado da conversa: à espera, comigo e agente", () => {
  assert.deepEqual(estadoDe([msg("enviada", "workflow", "1"), msg("recebida", "recebida_na_pausa", "2"), msg("recebida", "recebida_na_pausa", "3")], []), { esperaDesde: "2", estado: "espera" });
  assert.equal(estadoDe([msg("recebida", "recebida_na_pausa", "1"), msg("enviada", "humano", "2")], []).estado, "comigo");
  assert.equal(estadoDe([msg("recebida", "workflow", "1"), msg("enviada", "workflow", "2")], []).estado, "agente");
  const pausa = [{ canal: "whatsapp", expiresAt: null, identificadorConversa: "whatsapp:1", kind: "pausa_manual" as const, reason: null, ttlSeconds: null, value: "{}" }];
  assert.equal(estadoDe([msg("recebida", "workflow", "1"), msg("enviada", "workflow", "2")], pausa).estado, "comigo");
});

test("idioma do iPhone: os quatro idiomas, e o resto em inglês", () => {
  assert.equal(idiomaDoAparelho("pt-PT,pt;q=0.9"), "pt-PT");
  assert.equal(idiomaDoAparelho("pt-BR"), "pt-BR");
  assert.equal(idiomaDoAparelho("es-ES,es;q=0.9"), "es");
  assert.equal(idiomaDoAparelho("en-US"), "en");
  assert.equal(idiomaDoAparelho("fr-FR"), "en");
  assert.equal(idiomaDoAparelho(""), "pt-BR");
});

test("login: só volta para o app (/m), nunca para fora", () => {
  assert.equal(destinoSeguro("/m"), "/m");
  assert.equal(destinoSeguro("/m/conversas/whatsapp%3A1"), "/m/conversas/whatsapp%3A1");
  for (const mau of ["https://mal.example", "//mal.example", "/m//mal.example", "/mal", "/admin", "/m\\..", 42, null]) assert.equal(destinoSeguro(mau), null, String(mau));
});

test("datas no fuso do cliente", () => {
  // 23:30 UTC de 5/11 já é 6/11 em Lisboa? Não (Lisboa = UTC em novembro); em Tóquio sim.
  const lis = limitesDoDia("2026-11-06", "Europe/Lisbon");
  assert.equal(lis.inicio, "2026-11-06T00:00:00.000Z");
  const ny = limitesDoDia("2026-11-06", "America/New_York");
  assert.equal(ny.inicio, "2026-11-06T05:00:00.000Z");
  assert.equal(ny.fim, "2026-11-07T05:00:00.000Z");
  assert.deepEqual(semanaDe("2026-11-06").slice(0, 2), ["2026-11-02", "2026-11-03"]);
  assert.equal(semanaDe("2026-11-08")[6], "2026-11-08");
  const agora = new Date("2026-11-06T15:00:00Z");
  assert.equal(quandoCurto("2026-11-06T09:12:00Z", agora, "Europe/Lisbon", "pt-PT", "Ontem"), "09:12");
  assert.equal(quandoCurto("2026-11-05T20:00:00Z", agora, "Europe/Lisbon", "pt-PT", "Ontem"), "Ontem");
  assert.equal(duracaoCurta("2026-11-06T14:46:00Z", agora), "14 min");
  assert.equal(duracaoCurta("2026-11-06T13:45:00Z", agora), "1 h 15 min");
});

test("nomes e números para mostrar", () => {
  assert.equal(iniciais("Rafael Sousa"), "RS");
  assert.equal(iniciais("ana"), "A");
  assert.equal(iniciais("+351 912"), "#");
  assert.equal(telefoneLegivel("351912345678"), "+351 912 345 678");
  assert.equal(canalDe("instagram:123"), "instagram");
});

test("chat: o eco que o agente grava na Meta não aparece duas vezes", () => {
  const m = (id: string, direccao: string, origem: string, content: string, criado_em: string) => ({ cliente_slug: "a", contacto_id: null, content, conteudo: content, criado_em, direccao, displayId: id, displayType: "texto", id, identificador_conversa: "instagram:1", mediaPath: null, mediaUrl: null, origem, partCount: 1, partIndex: 0, sourceMessageId: id, tipo: "texto" });
  const ms = [m("1", "recebida", "workflow", "oi", "2026-11-06T10:00:00Z"), m("2", "enviada", "humano", "olá!", "2026-11-06T10:01:00Z"), m("3", "enviada", "humano", "olá!", "2026-11-06T10:01:20Z"), m("4", "enviada", "humano", "olá!", "2026-11-06T10:09:00Z")];
  assert.deepEqual(semEcos(ms).map((x) => x.id), ["1", "2", "4"]);
});
