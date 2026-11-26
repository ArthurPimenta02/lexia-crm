import { dadosDoWidget, lerChaveWidget } from "@/lib/app/widget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** O widget do iPhone lê aqui os atendimentos (chave própria no cabeçalho Authorization). */
export async function GET(request: Request) {
  const chave = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const dono = chave ? await lerChaveWidget(chave).catch(() => null) : null;
  if (!dono) return Response.json({ erro: "Chave inválida." }, { status: 401 });
  try {
    return Response.json(await dadosDoWidget(dono.clienteSlug), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[widget] leitura", e);
    return Response.json({ erro: "Não foi possível ler a agenda." }, { status: 500 });
  }
}
