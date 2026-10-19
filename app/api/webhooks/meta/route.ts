import { timingSafeEqual } from "node:crypto";

import {
  canalDeWebhookMeta,
  extrairReferraisDoWebhook,
  impressaoDigitalDoWebhook,
  objectoDoWebhookMeta,
} from "@/lib/meta/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recebe uma cópia do webhook de mensagens da Meta e grava-a intacta.
 *
 * PARA QUE SERVE
 * Enquanto o n8n for o único a ver o webhook, "a origem não apareceu na ficha"
 * tem duas explicações opostas — a Meta não mandou, ou o n8n não soube ler — e
 * nenhuma forma de escolher entre elas. Esta rota resolve isso guardando o
 * corpo antes de qualquer interpretação.
 *
 * O QUE ELA NÃO É
 * Não é a rota que a Meta chama. A Meta continua a chamar o n8n, e é o n8n que
 * nos manda uma cópia — de propósito: mudar a URL de callback na app da Meta
 * parava o agente a responder, e o agente a responder vale mais do que este
 * diagnóstico. Por isso a autenticação é um Bearer nosso e não a assinatura
 * `X-Hub-Signature-256` da Meta: quem assina o pedido já não é a Meta.
 *
 * PORQUE É QUE ELA DEVOLVE O QUE ENCONTROU
 * A resposta traz a lista de referrais lidos e, em cada um, o caminho onde o
 * id estava. Isso aparece no registo de execução do n8n, e é aí que se vê, sem
 * abrir a base de dados, se o Messenger manda o anúncio num sítio que o
 * workflow não lê. Não leva texto de mensagens nem identificadores de pessoas.
 */

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Um webhook de mensagens da Meta anda nos poucos KB — as imagens vêm por URL,
 * não embutidas. O tecto existe para que um corpo enorme seja recusado à porta
 * em vez de ir parar à base de dados.
 */
const maxCorpoBytes = 128 * 1024;

/** Os slugs reais usam underscore: `detail_by_cordeiro`, `miranda_skin_experts`. */
const slugValido = /^[a-z0-9_]{2,64}$/;

class PedidoInvalido extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function constantTimeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function assertAutorizado(request: Request) {
  const secret = process.env.LEXIA_WEBHOOK_SECRET?.trim();

  // Sem segredo configurado a rota fecha-se, em vez de aceitar tudo. Uma rota
  // de escrita aberta por uma variável em falta é pior do que uma rota que não
  // existe.
  if (!secret || secret.length < 32) {
    throw new PedidoInvalido(
      "A captura de webhooks da Meta ainda não está configurada.",
      503,
    );
  }

  const [scheme, token] = (request.headers.get("authorization") ?? "").split(
    /\s+/,
    2,
  );

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    !constantTimeEqual(token, secret)
  ) {
    throw new PedidoInvalido("Integração não autorizada.", 401);
  }
}

function clienteDoPedido(request: Request) {
  const slug = (request.headers.get("x-lexia-cliente") ?? "").trim();

  if (!slugValido.test(slug)) {
    throw new PedidoInvalido(
      "Falta o cabeçalho x-lexia-cliente com o slug do cliente.",
      400,
    );
  }

  return slug;
}

async function corpoDoPedido(request: Request) {
  const texto = await request.text();

  if (Buffer.byteLength(texto) > maxCorpoBytes) {
    throw new PedidoInvalido("O corpo do webhook é demasiado grande.", 413);
  }

  let corpo: unknown;

  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new PedidoInvalido("O corpo do webhook não é JSON válido.", 400);
  }

  // Um corpo que não é um objecto não é um webhook da Meta. Recusar com uma
  // razão legível é melhor do que gravar uma linha que não se sabe ler.
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new PedidoInvalido(
      "O corpo do webhook tem de ser um objecto JSON.",
      400,
    );
  }

  return { corpo, texto };
}

export async function POST(request: Request) {
  try {
    assertAutorizado(request);

    const clienteSlug = clienteDoPedido(request);
    const { corpo, texto } = await corpoDoPedido(request);
    const canal = canalDeWebhookMeta(corpo);
    const admin = createAdminClient();
    const { error } = await admin.from("lexia_webhooks_meta").upsert(
      {
        canal,
        cliente_slug: clienteSlug,
        corpo,
        impressao_digital: impressaoDigitalDoWebhook(texto),
        objecto: objectoDoWebhookMeta(corpo),
      },
      {
        // `upsert` e não `insert`: a Meta reentrega o mesmo corpo quando não
        // recebe 200, e um `insert` respondia 23505 a cada reentrega. Isso
        // devolvia 500 a quem nos chamou e punha a Meta a repetir para sempre
        // por causa de uma linha que já estava guardada.
        ignoreDuplicates: true,
        onConflict: "cliente_slug,impressao_digital",
      },
    );

    if (error) {
      // 23503 = chave estrangeira. O slug não existe em lexia_clientes, e isso
      // é um erro de quem chamou, não do servidor.
      if (error.code === "23503") {
        throw new PedidoInvalido(
          `O cliente "${clienteSlug}" não existe na Lexia.`,
          400,
        );
      }

      throw new Error("Não foi possível guardar o webhook da Meta.");
    }

    return Response.json({
      canal,
      ok: true,
      referrais: extrairReferraisDoWebhook(corpo).map((achado) => ({
        anuncio_externo_id: achado.anuncioExternoId,
        caminho: achado.caminho,
        origem_tipo: achado.origemTipo,
      })),
    });
  } catch (error) {
    const status = error instanceof PedidoInvalido ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível guardar o webhook da Meta.";

    if (status === 500) {
      console.error("Erro ao guardar o webhook da Meta", error);
    }

    return Response.json({ error: message, ok: false }, { status });
  }
}
