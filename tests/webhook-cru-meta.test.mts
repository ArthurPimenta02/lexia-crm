/**
 * Guardar o webhook da Meta tal e qual, e saber lê-lo nos quatro sítios.
 *
 * Cinco coisas aqui não são óbvias, e cada uma já custou uma conclusão errada.
 *
 * 1. O MESMO dado tem nomes e sítios diferentes por canal. No WhatsApp o id do
 *    anúncio é `referral.source_id` dentro de `changes[].value.messages[]`. No
 *    Instagram e no Messenger é `referral.ad_id`, e pode estar dentro de
 *    `message`, solto em `messaging`, ou dentro de `postback`. Um leitor
 *    escrito a olhar para um canal devolve VAZIO nos outros — e vazio passa por
 *    "esta pessoa não veio de anúncio". Foi assim que eu afirmei, a 14/10/2026,
 *    que o Instagram não mandava origem. Mandava.
 *
 * 2. O `caminho` de cada achado é a razão de ser disto. Sem ele, "a Meta não
 *    mandou" e "mandou num sítio que o workflow não lê" são a mesma resposta, e
 *    levam a trabalhos opostos.
 *
 * 3. `source_type: "post"` traz um id de POST no MESMO campo `source_id`.
 *    Gravá-lo como anúncio não dá erro nenhum: dá um contacto contado como
 *    identificado, a apontar para uma campanha que nunca vai existir.
 *
 * 4. A escrita não interpreta. O corpo vai para a base intacto e a atribuição
 *    deriva-se na leitura — porque a razão de existir desta tabela é suspeitar
 *    que o leitor está errado, e um leitor errado a escrever grava o erro para
 *    sempre. O teste afirma as colunas escritas à letra para que ninguém
 *    acrescente aqui uma coluna "anuncio_externo_id" por conveniência.
 *
 * 5. A reentrega da Meta não pode dar erro. Ela repete o webhook até receber
 *    200; um `insert` em vez de `upsert` respondia 23505 à segunda entrega, e a
 *    Meta repetia para sempre por causa de uma linha que já estava guardada.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

const A = "empresa_a";
const B = "empresa_b";
const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";
const ANUNCIO = "120237312707190118";

let base = new FakeSupabase({});

/**
 * Tudo o que é mocado é-o aqui, uma vez só, e nenhum teste chama
 * `mock.restoreAll()` — ver a nota em tests/atribuicao-anuncios.test.mts. O
 * estado por teste muda-se trocando a variável acima.
 */
mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});

const leitor = await import("@/lib/meta/webhooks");
const rota = await import("@/app/api/webhooks/meta/route");

function reiniciar() {
  base = new FakeSupabase({ lexia_clientes: [{ slug: A }, { slug: B }] });
  process.env.LEXIA_WEBHOOK_SECRET = SEGREDO;
}

/** Corpo do WhatsApp Cloud API: o referral vive na mensagem. */
function corpoWhatsApp(referral: Record<string, unknown> | null) {
  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ wa_id: "351912345678" }],
              messages: [
                {
                  from: "351912345678",
                  id: "wamid.1",
                  ...(referral ? { referral } : {}),
                  text: { body: "Olá, quanto custa?" },
                  timestamp: "1760000000",
                  type: "text",
                },
              ],
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "111" },
            },
          },
        ],
        id: "waba-1",
      },
    ],
    object: "whatsapp_business_account",
  };
}

/** Corpo do Instagram / Messenger: o referral vive num evento de `messaging`. */
function corpoMessaging(objecto: string, evento: Record<string, unknown>) {
  return {
    entry: [
      {
        id: "pagina-1",
        messaging: [
          { recipient: { id: "pagina-1" }, sender: { id: "psid-1" }, ...evento },
        ],
        time: 1760000000,
      },
    ],
    object: objecto,
  };
}

async function chamar(opcoes: {
  autorizacao?: string | null;
  cliente?: string | null;
  texto: string;
}) {
  const cabecalhos = new Headers({ "content-type": "application/json" });

  if (opcoes.autorizacao !== null) {
    cabecalhos.set("authorization", opcoes.autorizacao ?? `Bearer ${SEGREDO}`);
  }

  if (opcoes.cliente !== null) {
    cabecalhos.set("x-lexia-cliente", opcoes.cliente ?? A);
  }

  const resposta = await rota.POST(
    new Request("https://app.uselexia.app/api/webhooks/meta", {
      body: opcoes.texto,
      headers: cabecalhos,
      method: "POST",
    }),
  );

  return {
    corpo: (await resposta.json()) as Record<string, unknown>,
    status: resposta.status,
  };
}

function enviar(corpo: unknown, opcoes: { cliente?: string } = {}) {
  return chamar({ cliente: opcoes.cliente, texto: JSON.stringify(corpo) });
}

function linhas() {
  return base.linhasDe("lexia_webhooks_meta");
}

// ---------------------------------------------------------------------------
// O leitor: os quatro sítios onde o id do anúncio pode estar.
// ---------------------------------------------------------------------------

test("no WhatsApp o anúncio vem em source_id, com o identificador do clique", () => {
  const achados = leitor.extrairReferraisDoWebhook(
    corpoWhatsApp({
      body: "Lavagem completa",
      ctwa_clid: "ARAaBBccDD",
      headline: "Detail by Cordeiro",
      source_id: ANUNCIO,
      source_type: "ad",
      source_url: "https://fb.me/abc",
    }),
  );

  assert.deepEqual(achados, [
    {
      anuncioContexto: null,
      anuncioExternoId: ANUNCIO,
      caminho: "whatsapp.messages.referral",
      ctwaClid: "ARAaBBccDD",
      origemTipo: "ad",
      remetenteExternoId: "351912345678",
    },
  ]);
});

test("source_type 'post' não é um anúncio, apesar de trazer um source_id", () => {
  const [achado] = leitor.extrairReferraisDoWebhook(
    corpoWhatsApp({ source_id: "90123456789012345", source_type: "post" }),
  );

  assert.equal(
    achado.anuncioExternoId,
    null,
    "o id de um post gravado como anúncio inventa uma campanha que não existe",
  );
  assert.equal(achado.origemTipo, "post");
});

test("no Instagram o anúncio vem em message.referral.ad_id", () => {
  const achados = leitor.extrairReferraisDoWebhook(
    corpoMessaging("instagram", {
      message: {
        mid: "mid.1",
        referral: {
          ad_id: ANUNCIO,
          ads_context_data: {
            ad_title: "Higienização interior",
            photo_url: "https://scontent.example/criativo.jpg",
          },
          ref: "",
          source: "ADS",
          type: "OPEN_THREAD",
        },
        text: "Vi o anúncio",
      },
    }),
  );

  assert.deepEqual(achados, [
    {
      anuncioContexto: {
        imagemUrl: "https://scontent.example/criativo.jpg",
        titulo: "Higienização interior",
      },
      anuncioExternoId: ANUNCIO,
      caminho: "message.referral",
      // O `ctwa_clid` é do Click-to-WhatsApp. Nulo aqui é a resposta certa, e
      // não um campo esquecido.
      ctwaClid: null,
      origemTipo: "ADS",
      remetenteExternoId: "psid-1",
    },
  ]);
});

test("numa conversa reaberta o referral vem solto em messaging, fora de message", () => {
  const achados = leitor.extrairReferraisDoWebhook(
    corpoMessaging("page", {
      referral: { ad_id: ANUNCIO, source: "ADS", type: "OPEN_THREAD" },
    }),
  );

  assert.equal(achados.length, 1);
  assert.equal(achados[0].caminho, "messaging.referral");
  assert.equal(achados[0].anuncioExternoId, ANUNCIO);
});

test("no Messenger pelo botão Começar o referral vem dentro do postback", () => {
  const achados = leitor.extrairReferraisDoWebhook(
    corpoMessaging("page", {
      postback: {
        payload: "COMECAR",
        referral: { ad_id: ANUNCIO, source: "ADS", type: "OPEN_THREAD" },
        title: "Começar",
      },
    }),
  );

  assert.equal(achados.length, 1);
  assert.equal(achados[0].caminho, "postback.referral");
  assert.equal(achados[0].anuncioExternoId, ANUNCIO);
});

test("o id do anúncio fica texto, com os 18 dígitos intactos", () => {
  const [achado] = leitor.extrairReferraisDoWebhook(
    corpoWhatsApp({ source_id: ANUNCIO, source_type: "ad" }),
  );

  assert.equal(typeof achado.anuncioExternoId, "string");
  assert.equal(
    achado.anuncioExternoId,
    ANUNCIO,
    "Number(id) perde o último dígito e o anúncio deixa de casar com o espelho",
  );
});

test("um referral sem anúncio nenhum fica registado, mas sem id", () => {
  const achados = leitor.extrairReferraisDoWebhook(
    corpoMessaging("instagram", {
      message: { mid: "mid.1", referral: { ref: "promo", source: "SHORTLINK" } },
    }),
  );

  assert.equal(achados.length, 1, "o achado sem anúncio também é informação");
  assert.equal(achados[0].anuncioExternoId, null);
  assert.equal(achados[0].origemTipo, "SHORTLINK");
});

test("o primeiro achado com anúncio salta os que não têm", () => {
  const corpo = corpoMessaging("page", {
    message: { mid: "mid.1", referral: { ref: "promo", source: "SHORTLINK" } },
    postback: { payload: "X", referral: { ad_id: ANUNCIO, source: "ADS" } },
  });

  assert.equal(leitor.extrairReferraisDoWebhook(corpo).length, 2);
  assert.equal(
    leitor.primeiroReferralComAnuncio(corpo)?.anuncioExternoId,
    ANUNCIO,
  );
});

test("um corpo sem referral, ou que não é um webhook, não inventa achados", () => {
  for (const corpo of [
    null,
    "texto",
    [],
    {},
    { entry: null, object: "instagram" },
    { entry: [{}], object: "instagram" },
    corpoWhatsApp(null),
    corpoMessaging("instagram", { message: { mid: "mid.1", text: "olá" } }),
  ]) {
    assert.deepEqual(leitor.extrairReferraisDoWebhook(corpo), []);
  }
});

test("o canal lê-se do campo object, e o Messenger vem como 'page'", () => {
  const canais: [unknown, string][] = [
    [{ object: "whatsapp_business_account" }, "whatsapp"],
    [{ object: "instagram" }, "instagram"],
    // O Messenger entrega sob o objecto da Página. Quem procurar a palavra
    // "messenger" no corpo não a encontra.
    [{ object: "page" }, "messenger"],
    [{ object: "algo_novo" }, "desconhecido"],
    [{}, "desconhecido"],
    [null, "desconhecido"],
  ];

  for (const [corpo, esperado] of canais) {
    assert.equal(leitor.canalDeWebhookMeta(corpo), esperado);
  }
});

test("a impressão digital é do texto recebido, não do objecto reserializado", () => {
  const umaOrdem = '{"a":1,"b":2}';
  const outraOrdem = '{"b":2,"a":1}';

  assert.equal(
    leitor.impressaoDigitalDoWebhook(umaOrdem),
    createHash("sha256").update(umaOrdem).digest("hex"),
  );
  assert.notEqual(
    leitor.impressaoDigitalDoWebhook(umaOrdem),
    leitor.impressaoDigitalDoWebhook(outraOrdem),
    "reserializar o objecto punha a ordem das chaves do nosso JSON no meio",
  );
});

// ---------------------------------------------------------------------------
// A rota: fechada à porta, e escreve sem interpretar.
// ---------------------------------------------------------------------------

test("sem segredo configurado a rota fecha-se em vez de aceitar tudo", async () => {
  reiniciar();
  delete process.env.LEXIA_WEBHOOK_SECRET;

  const { status } = await enviar(corpoWhatsApp(null));

  assert.equal(status, 503);
  assert.equal(linhas().length, 0);
});

test("um segredo curto não serve de segredo", async () => {
  reiniciar();
  process.env.LEXIA_WEBHOOK_SECRET = "curto";

  const { status } = await chamar({
    autorizacao: "Bearer curto",
    texto: JSON.stringify(corpoWhatsApp(null)),
  });

  assert.equal(status, 503);
  assert.equal(linhas().length, 0);
});

test("sem Bearer certo não se escreve nada", async () => {
  reiniciar();

  for (const autorizacao of [
    null,
    "",
    "Bearer errado",
    SEGREDO,
    `Basic ${SEGREDO}`,
  ]) {
    const { status } = await chamar({
      autorizacao,
      texto: JSON.stringify(corpoWhatsApp(null)),
    });

    assert.equal(status, 401, `devia recusar: ${String(autorizacao)}`);
  }

  assert.equal(linhas().length, 0);
});

test("sem saber de que cliente é, a linha não se grava", async () => {
  reiniciar();

  for (const cliente of [null, "", "Detail By Cordeiro", "detail-by-cordeiro"]) {
    const { status } = await chamar({
      cliente,
      texto: JSON.stringify(corpoWhatsApp(null)),
    });

    assert.equal(status, 400, `devia recusar o slug: ${String(cliente)}`);
  }

  assert.equal(linhas().length, 0);
});

test("um corpo que não é objecto JSON é recusado com razão legível", async () => {
  reiniciar();

  for (const texto of ["não é json", "[]", '"texto"', "null"]) {
    const { corpo, status } = await chamar({ texto });

    assert.equal(status, 400, `devia recusar: ${texto}`);
    assert.match(String(corpo.error), /JSON/);
  }

  assert.equal(linhas().length, 0);
});

test("um corpo gigante é recusado à porta, não guardado", async () => {
  reiniciar();

  const { status } = await enviar({
    enchimento: "x".repeat(200 * 1024),
    object: "instagram",
  });

  assert.equal(status, 413);
  assert.equal(linhas().length, 0);
});

test("o corpo é gravado intacto, e a escrita não interpreta nada", async () => {
  reiniciar();

  const corpo = corpoWhatsApp({
    ctwa_clid: "ARAaBBccDD",
    source_id: ANUNCIO,
    source_type: "ad",
  });
  const texto = JSON.stringify(corpo);
  const { status } = await chamar({ texto });

  assert.equal(status, 200);
  assert.equal(linhas().length, 1);

  const linha = linhas()[0];

  assert.deepEqual(linha.corpo, corpo, "o corpo tem de chegar à base intacto");
  assert.equal(linha.canal, "whatsapp");
  assert.equal(linha.cliente_slug, A);
  assert.equal(linha.objecto, "whatsapp_business_account");
  assert.equal(
    linha.impressao_digital,
    createHash("sha256").update(texto).digest("hex"),
  );

  // À letra de propósito: acrescentar aqui uma coluna derivada — um
  // `anuncio_externo_id` "por conveniência" — é exactamente o que esta tabela
  // existe para impedir. Se o leitor estiver errado, o erro fica gravado.
  assert.deepEqual(Object.keys(linha).sort(), [
    "canal",
    "cliente_slug",
    "corpo",
    "impressao_digital",
    "objecto",
  ]);
});

test("a resposta diz onde é que o anúncio estava, para se ver no n8n", async () => {
  reiniciar();

  const { corpo } = await enviar(
    corpoMessaging("page", {
      referral: { ad_id: ANUNCIO, source: "ADS", type: "OPEN_THREAD" },
    }),
  );

  assert.equal(corpo.canal, "messenger");
  assert.deepEqual(corpo.referrais, [
    {
      anuncio_externo_id: ANUNCIO,
      caminho: "messaging.referral",
      origem_tipo: "ADS",
    },
  ]);
});

test("a resposta não leva texto de mensagens nem quem as enviou", async () => {
  reiniciar();

  const { corpo } = await enviar(
    corpoWhatsApp({ source_id: ANUNCIO, source_type: "ad" }),
  );

  const devolvido = JSON.stringify(corpo);

  assert.ok(!devolvido.includes("quanto custa"));
  assert.ok(!devolvido.includes("351912345678"));
});

test("a reentrega da Meta responde 200 e não duplica a linha", async () => {
  reiniciar();

  const corpo = corpoWhatsApp({ source_id: ANUNCIO, source_type: "ad" });

  const primeira = await enviar(corpo);
  const segunda = await enviar(corpo);

  assert.equal(primeira.status, 200);
  assert.equal(
    segunda.status,
    200,
    "um insert dava 23505 e punha a Meta a repetir para sempre",
  );
  assert.equal(linhas().length, 1);
});

test("dois webhooks diferentes do mesmo cliente são duas linhas", async () => {
  reiniciar();

  await enviar(corpoWhatsApp({ source_id: ANUNCIO, source_type: "ad" }));
  await enviar(corpoMessaging("instagram", { message: { mid: "mid.1" } }));

  assert.equal(
    linhas().length,
    2,
    "a chave do conflito tem de incluir a impressão digital",
  );
});

test("o mesmo corpo de dois clientes não se come a si próprio", async () => {
  reiniciar();

  const corpo = corpoWhatsApp({ source_id: ANUNCIO, source_type: "ad" });

  await enviar(corpo, { cliente: A });
  await enviar(corpo, { cliente: B });

  assert.equal(
    linhas().length,
    2,
    "a chave do conflito tem de incluir o cliente",
  );
  assert.deepEqual(
    linhas().map((linha) => linha.cliente_slug),
    [A, B],
  );
});

test("um slug que não existe na Lexia é erro de quem chamou, não do servidor", async () => {
  reiniciar();
  base.falhas.set("upsert:lexia_webhooks_meta", {
    code: "23503",
    message: 'violates foreign key constraint "lexia_webhooks_meta_cliente_slug_fkey"',
  });

  const { corpo, status } = await enviar(corpoWhatsApp(null), {
    cliente: "cliente_que_nao_existe",
  });

  assert.equal(status, 400);
  assert.match(String(corpo.error), /não existe/);
});

test("qualquer outra falha da base é 500 e não finge ter guardado", async () => {
  reiniciar();
  base.falharEm("upsert", "lexia_webhooks_meta", "ligação perdida");

  const { corpo, status } = await enviar(corpoWhatsApp(null));

  assert.equal(status, 500);
  assert.equal(corpo.ok, false);
});
