import { AnalystDataContext } from "@/lib/analyst/data";
import {
  AnalystRequestError,
  resolveAnalystScope,
} from "@/lib/analyst/scope";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = await resolveAnalystScope({
      canal: url.searchParams.get("canal") ?? undefined,
      clienteSlug: url.searchParams.get("clienteSlug") ?? undefined,
      fim: url.searchParams.get("fim") ?? undefined,
      inicio: url.searchParams.get("inicio") ?? undefined,
      periodo: url.searchParams.get("periodo") ?? undefined,
    }, { mode: "read" });
    const context = new AnalystDataContext(scope);
    const coverage = await context.getCoverage();

    return Response.json({
      coverage,
      scope: {
        canal: scope.channel,
        cliente: scope.clienteName,
        periodo: scope.range.label,
        timezone: scope.timezone,
      },
    });
  } catch (error) {
    const status = error instanceof AnalystRequestError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível consultar a cobertura analítica.";

    return Response.json({ error: message }, { status });
  }
}
