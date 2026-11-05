import { contextoMovel } from "@/lib/movel/contexto";
import { tipoDaMidia } from "@/lib/movel/midia";
import { chamarPlataforma, ErroPlataforma } from "@/lib/movel/plataforma";
import { isValidConversationId } from "@/lib/redis/agent-locks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Envia uma mensagem do dono ao cliente pelo canal real do negócio.
 * A empresa vem SEMPRE da sessão (contextoMovel), nunca do pedido; a mídia só
 * pode vir de um caminho da própria empresa no bucket.
 */
export async function POST(request: Request) {
  const c = await contextoMovel();
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const conversa = String(corpo.conversa ?? "");
  const texto = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
  const midia = corpo.midia && typeof corpo.midia === "object" ? (corpo.midia as Record<string, unknown>) : null;

  if (!isValidConversationId(conversa)) return Response.json({ erro: c.t("Conversa inválida.") }, { status: 400 });
  if (!texto && !midia) return Response.json({ erro: c.t("Escreva uma mensagem.") }, { status: 400 });
  if (texto.length > 4096) return Response.json({ erro: c.t("A mensagem é longa demais.") }, { status: 400 });

  let midiaOk: { caminho: string; mime: string; tipo: string } | null = null;
  if (midia) {
    const caminho = String(midia.caminho ?? "");
    const mime = String(midia.mime ?? "");
    if (!caminho.startsWith(`${c.clienteSlug}/`) || caminho.includes("..") || !mime) {
      return Response.json({ erro: c.t("Arquivo inválido.") }, { status: 400 });
    }
    midiaOk = { caminho, mime, tipo: tipoDaMidia(mime) };
  }

  try {
    const r = await chamarPlataforma<Record<string, unknown>>("/enviar", {
      autor_user_id: c.userId,
      cliente_slug: c.clienteSlug,
      conversa,
      ...(midiaOk ? { legenda: texto || undefined, midia: midiaOk } : { texto }),
    });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const status = e instanceof ErroPlataforma ? e.status : 500;
    return Response.json({ erro: e instanceof Error ? e.message : c.t("O envio falhou.") }, { status });
  }
}
