import { ehContaDemo, mudarAssumidaDemo } from "@/lib/movel/demo";
import { contextoDaEmpresa } from "@/lib/movel/empresa-do-pedido";
import { chamarPlataforma, ErroPlataforma } from "@/lib/movel/plataforma";
import { isValidConversationId } from "@/lib/redis/agent-locks";

export const dynamic = "force-dynamic";

/** "Assumir" (o agente para nesta conversa) e "Devolver ao agente". */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // A empresa vem da sessão; só a Lexia pode indicar outra (a da página do painel).
  const c = await contextoDaEmpresa(corpo.cliente);
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  const conversa = String(corpo.conversa ?? "");
  const accao = corpo.accao === "assumir" || corpo.accao === "devolver" ? corpo.accao : null;
  if (!isValidConversationId(conversa) || !accao) return Response.json({ erro: c.t("Pedido inválido.") }, { status: 400 });
  if (ehContaDemo(c.clienteSlug)) {
    await mudarAssumidaDemo(conversa, accao === "assumir");
    return Response.json({ ok: true });
  }
  try {
    await chamarPlataforma(`/conversa/${accao}`, { autor_user_id: c.userId, cliente_slug: c.clienteSlug, conversa }, 20_000);
    return Response.json({ ok: true });
  } catch (e) {
    const status = e instanceof ErroPlataforma ? e.status : 500;
    return Response.json({ erro: e instanceof Error ? e.message : c.t("Não foi possível mudar.") }, { status });
  }
}
