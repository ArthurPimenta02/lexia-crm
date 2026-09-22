import { queueAnalystQuestion } from "@/lib/analyst/n8n";
import {
  AnalystRequestError,
  resolveAnalystScope,
} from "@/lib/analyst/scope";
import type { AnalystScopeInput } from "@/lib/analyst/types";

export const runtime = "nodejs";
export const maxDuration = 20;

type ChatRequestBody = AnalystScopeInput & {
  pergunta?: unknown;
  sessaoId?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const question = String(body.pergunta ?? "").trim();

    if (!question) {
      return Response.json(
        { error: "Escreva uma pergunta para o Analista Lexia." },
        { status: 400 },
      );
    }

    if (question.length > 4000) {
      return Response.json(
        { error: "A pergunta deve ter no máximo 4.000 caracteres." },
        { status: 400 },
      );
    }

    const scope = await resolveAnalystScope(body);
    const result = await queueAnalystQuestion(
      scope,
      question,
      typeof body.sessaoId === "string" && body.sessaoId
        ? body.sessaoId
        : null,
    );

    return Response.json(
      {
        ...result,
        scope: {
          canal: scope.channel,
          cliente: scope.clienteName,
          periodo: scope.range.label,
          timezone: scope.timezone,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    const status = error instanceof AnalystRequestError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível consultar o Analista Lexia.";

    if (status === 500) {
      console.error("Erro no chat do Analista Lexia", error);
    }

    return Response.json({ error: message }, { status });
  }
}
