/**
 * Mídia guardada nas conversas (Fase 20).
 *
 * O que um teste tem de guardar:
 *
 * 1. Um cliente nunca vê mídia de outro. O bucket é privado e lido com a
 *    service_role, por isso a barreira é a assinatura: só se gera URL para
 *    mensagens do cliente da página E caminhos que começam pelo slug dele.
 *    Um caminho com `..` nem chega a ser reconhecido.
 *
 * 2. As mensagens antigas aparecem como sempre: texto, link do WhatsApp e os
 *    blocos <ContextoImagem>. O formato novo é reconhecido só quando é JSON
 *    com `midia.caminho` válido.
 *
 * 3. Se o bucket não existir ou a assinatura falhar, a página não rebenta: a
 *    mídia fica "indisponível" e o texto continua.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", {
  namedExports: {
    createAdminClient: () => {
      throw new Error("o teste não pode chegar ao Supabase real");
    },
  },
});

const { expandConversationMessage, parseMidiaGuardada, textoLegivelDaMensagem } =
  await import("../lib/conversations/message-display");
const { assinarMidias } = await import("../lib/conversations/media-urls");

const base = {
  id: "m1",
  cliente_slug: "miranda_skin_experts",
  contacto_id: null,
  identificador_conversa: "whatsapp:15550001234",
  direccao: "recebida",
  origem: null,
  criado_em: "2026-10-31T12:00:00Z",
};

const conteudo = (caminho: string, tipo = "audio", texto = "quero saber o preço") =>
  JSON.stringify({ midia: { caminho, tipo, mime: "audio/ogg" }, texto });

const meu = "miranda_skin_experts/whatsapp_15550001234/abc.ogg";

test("formato novo: caminho, tipo e texto", () => {
  const m = parseMidiaGuardada(conteudo(meu));
  assert.deepEqual(m, { caminho: meu, tipo: "audio", mime: "audio/ogg", texto: "quero saber o preço" });
  const [parte] = expandConversationMessage({ ...base, tipo: "audio", conteudo: conteudo(meu) });
  assert.equal(parte.displayType, "audio");
  assert.equal(parte.mediaPath, meu);
  assert.equal(parte.mediaUrl, null);
  assert.equal(parte.content, "quero saber o preço");
});

test("caminhos inválidos não são reconhecidos", () => {
  for (const c of [
    "miranda_skin_experts/../detail_by_cordeiro/x.ogg",
    "miranda_skin_experts/x.ogg",
    "/miranda_skin_experts/a/x.ogg",
    "miranda_skin_experts/a/b/x.ogg",
    "Miranda/a/x.ogg",
  ]) {
    assert.equal(parseMidiaGuardada(conteudo(c)), null, c);
  }
  assert.equal(parseMidiaGuardada('{"midia": quebrado'), null);
  assert.equal(parseMidiaGuardada('{"outra":1}'), null);
});

test("mensagens antigas aparecem como antes", () => {
  const [texto] = expandConversationMessage({ ...base, tipo: "texto", conteudo: "olá" });
  assert.equal(texto.content, "olá");
  assert.equal(texto.mediaPath, null);
  const [wa] = expandConversationMessage({ ...base, tipo: "imagem", conteudo: "https://mmg.whatsapp.net/x.enc" });
  assert.equal(wa.mediaUrl, "https://mmg.whatsapp.net/x.enc");
  assert.equal(wa.mediaPath, null);
  const ctx = expandConversationMessage({
    ...base,
    tipo: "texto",
    conteudo: "<ContextoImagem><MensagemUsuario>https://x.test/a.jpg</MensagemUsuario></ContextoImagem>",
  });
  assert.equal(ctx[0].displayType, "imagem");
  assert.equal(ctx[0].mediaUrl, "https://x.test/a.jpg");
});

test("só assina mídia do cliente da página (nunca de outro)", async () => {
  const pedidos: string[][] = [];
  const assinar = async (caminhos: string[]) => {
    pedidos.push(caminhos);
    return new Map(caminhos.map((c) => [c, `https://assinada/${c}`]));
  };
  const mensagens = [
    ...expandConversationMessage({ ...base, id: "a", tipo: "audio", conteudo: conteudo(meu) }),
    // mensagem de OUTRO cliente que, por engano, chegasse à lista
    ...expandConversationMessage({ ...base, id: "b", cliente_slug: "detail_by_cordeiro", tipo: "audio", conteudo: conteudo("detail_by_cordeiro/c/x.ogg") }),
    // mensagem de OUTRO cliente com um caminho que começa pelo slug da página
    ...expandConversationMessage({ ...base, id: "d", cliente_slug: "detail_by_cordeiro", tipo: "audio", conteudo: conteudo("miranda_skin_experts/c/z.ogg") }),
    // mensagem do cliente certo mas a apontar para a pasta de outro
    ...expandConversationMessage({ ...base, id: "c", tipo: "imagem", conteudo: conteudo("detail_by_cordeiro/c/y.jpg", "imagem") }),
  ];
  const r = await assinarMidias(mensagens, "miranda_skin_experts", assinar);
  assert.deepEqual(pedidos, [[meu]]);
  assert.equal(r.find((m) => m.id === "a")?.mediaUrl, `https://assinada/${meu}`);
  assert.equal(r.find((m) => m.id === "b")?.mediaUrl, null);
  assert.equal(r.find((m) => m.id === "c")?.mediaUrl, null);
  assert.equal(r.find((m) => m.id === "d")?.mediaUrl, null);
});

test("bucket inexistente ou erro: mídia indisponível, página de pé", async () => {
  const mensagens = expandConversationMessage({ ...base, tipo: "audio", conteudo: conteudo(meu) });
  const r = await assinarMidias(mensagens, "miranda_skin_experts", async () => {
    throw new Error("Bucket not found");
  });
  assert.equal(r[0].mediaUrl, null);
  assert.equal(r[0].content, "quero saber o preço");
  const vazio = await assinarMidias(mensagens, "miranda_skin_experts", async () => new Map());
  assert.equal(vazio[0].mediaUrl, null);
});

test("texto legível: o analista e o feedback leem o texto, não o JSON", () => {
  assert.equal(textoLegivelDaMensagem(conteudo(meu)), "quero saber o preço");
  assert.equal(textoLegivelDaMensagem("olá"), "olá");
});

test("as duas páginas de conversa assinam com o slug do cliente da página", () => {
  const cliente = readFileSync("app/app/conversas/page.tsx", "utf8");
  assert.match(cliente, /assinarMidias\(\s*prepareConversationMessages\(selectedMessages\),\s*profile\.cliente_slug,\s*\)/);
  const admin = readFileSync("app/admin/conversas/page.tsx", "utf8");
  assert.match(admin, /assinarMidias\(\s*prepareConversationMessages\(selectedMessages\),\s*selectedClient\.slug,\s*\)/);
});

test("o bucket é privado e sem policies", () => {
  const sql = readFileSync("supabase/migrations/202610310014_fase20_midia_guardada.sql", "utf8");
  assert.match(sql, /'lexia-midia',\s*'lexia-midia',\s*false/);
  assert.match(sql, /set public = false/);
  assert.doesNotMatch(sql, /create policy/i);
});

test("a bolha mostra o player com a URL assinada e o texto por baixo", async () => {
  const { renderToString } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { ConversationMessageBubble } = await import("../app/components/conversation-message-bubble");
  const [m] = await assinarMidias(
    expandConversationMessage({ ...base, tipo: "audio", conteudo: conteudo(meu) }),
    "miranda_skin_experts",
    async (c) => new Map(c.map((x) => [x, "https://assinada.test/audio.ogg?token=t"])),
  );
  const html = renderToString(createElement(ConversationMessageBubble, { message: m, timeZone: "America/New_York" }));
  assert.match(html, /<audio[^>]*src="https:\/\/assinada\.test\/audio\.ogg\?token=t"/);
  assert.match(html, /quero saber o preço/);
  assert.doesNotMatch(html, /\{&quot;midia/);
});
