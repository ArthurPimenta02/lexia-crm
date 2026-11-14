import { isValidConversationId } from "@/lib/redis/agent-locks";
import { contextoMovel } from "@/lib/movel/contexto";
import { lerConversa } from "@/lib/movel/conversas";

export const dynamic = "force-dynamic";

/** As mensagens novas de uma conversa (o chat pergunta a cada 3 s com a tela aberta). */
export async function GET(request: Request) {
  const c = await contextoMovel();
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  const url = new URL(request.url);
  const conversa = url.searchParams.get("c") ?? "";
  const desde = url.searchParams.get("desde");
  if (!isValidConversationId(conversa) || (desde && Number.isNaN(Date.parse(desde)))) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  try {
    const d = await lerConversa(c.clienteSlug, conversa, desde);
    return Response.json({ esperaDesde: d?.esperaDesde ?? null, estado: d?.estado ?? null, mensagens: d?.mensagens ?? [] });
  } catch {
    return Response.json({ erro: c.t("Não foi possível atualizar a conversa.") }, { status: 500 });
  }
}
