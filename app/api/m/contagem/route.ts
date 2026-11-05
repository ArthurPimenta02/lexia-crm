import { contextoMovel } from "@/lib/movel/contexto";
import { contarEsperas } from "@/lib/movel/esperas";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await contextoMovel();
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  try {
    return Response.json({ esperas: await contarEsperas(c.clienteSlug) });
  } catch {
    return Response.json({ esperas: 0 });
  }
}
