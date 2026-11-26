import { criarChaveWidget } from "@/lib/app/widget";
import { ecraPermitido } from "@/lib/auth/ecras";
import { contextoMovel } from "@/lib/movel/contexto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** O app (com sessão) pede a chave do widget e entrega-a ao iPhone (LexiaNativo.definirWidget). */
export async function POST(request: Request) {
  const c = await contextoMovel();
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  if (!ecraPermitido(c.clienteSlug, "/app/agenda")) return Response.json({ erro: "Sem agenda." }, { status: 403 });
  try {
    const token = await criarChaveWidget(c.userId, c.clienteSlug);
    return Response.json({ base: new URL(request.url).origin, slug: c.clienteSlug, token }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[widget] chave", e);
    return Response.json({ erro: "Não foi possível criar a chave." }, { status: 500 });
  }
}
