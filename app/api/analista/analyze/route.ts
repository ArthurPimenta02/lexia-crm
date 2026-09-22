import { analyzeConversationBatch } from "@/lib/analyst/classifier";
import {
  AnalystRequestError,
  resolveAnalystScope,
} from "@/lib/analyst/scope";
import type { AnalystScopeInput } from "@/lib/analyst/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalystScopeInput & {
      limite?: unknown;
    };
    const scope = await resolveAnalystScope(body);
    const limit = Math.max(1, Math.min(Number(body.limite ?? 4) || 4, 6));
    const result = await analyzeConversationBatch(scope, limit);

    return Response.json(result);
  } catch (error) {
    const status = error instanceof AnalystRequestError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível atualizar a base analítica.";

    if (status === 500) {
      console.error("Erro na classificação do Analista Lexia", error);
    }

    return Response.json({ error: message }, { status });
  }
}
