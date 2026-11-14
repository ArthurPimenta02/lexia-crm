import { clientesAtivos, contextoMovel } from "@/lib/movel/contexto";
import { contarEsperas, esperasPorEmpresa } from "@/lib/movel/esperas";

export const dynamic = "force-dynamic";

/**
 * Os números da espera (lib/movel/esperas.ts, uma regra só):
 * - `esperas`: as da empresa que o app mostra (aba Conversas e chip "Esperando");
 * - `emblema`: o número do ícone do iPhone. Para o dono é o mesmo; para a
 *   Lexia é a soma de todas as empresas ativas, como nos avisos do admin.
 */
export async function GET() {
  const c = await contextoMovel();
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  try {
    if (c.admin) {
      const porEmpresa = await esperasPorEmpresa((await clientesAtivos()).map((x) => x.slug));
      const esperas = porEmpresa[c.clienteSlug] ?? 0;
      return Response.json({ emblema: Object.values(porEmpresa).reduce((a, n) => a + n, 0), esperas });
    }
    const esperas = await contarEsperas(c.clienteSlug);
    return Response.json({ emblema: esperas, esperas });
  } catch {
    return Response.json({ emblema: 0, esperas: 0 });
  }
}
