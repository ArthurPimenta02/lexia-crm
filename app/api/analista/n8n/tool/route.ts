import { AnalystDataContext } from "@/lib/analyst/data";
import {
  assertAnalystN8nRequest,
  expireAnalystExecutionIfNeeded,
  isAnalystN8nToolName,
  resolveAnalystExecutionForTool,
} from "@/lib/analyst/n8n";
import { AnalystRequestError } from "@/lib/analyst/scope";
import type {
  AnalystToolName,
  AnalystWorkflowSource,
} from "@/lib/analyst/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type ToolRequestBody = {
  arguments?: unknown;
  execution_id?: unknown;
  tool?: unknown;
};

function asArguments(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(Math.floor(parsed), maximum));
}

export async function POST(request: Request) {
  try {
    assertAnalystN8nRequest(request);
    const body = (await request.json()) as ToolRequestBody;
    const executionId = String(body.execution_id ?? "").trim();
    const tool = String(body.tool ?? "").trim();

    if (!executionId || !isAnalystN8nToolName(tool)) {
      throw new AnalystRequestError(
        "Execução ou ferramenta não informada corretamente.",
        400,
      );
    }

    const { execution, scope } =
      await resolveAnalystExecutionForTool(executionId);
    const status = await expireAnalystExecutionIfNeeded(execution);

    if (status !== "iniciada") {
      throw new AnalystRequestError(
        "Esta execução não aceita novas consultas.",
        409,
      );
    }

    const admin = createAdminClient();
    const { data: claimed, error: claimError } = await admin.rpc(
      "lexia_reivindicar_ferramenta_analista",
      {
        p_execucao_id: executionId,
        p_ferramenta: tool,
      },
    );

    if (claimError) {
      throw new Error("Não foi possível validar a execução da ferramenta.");
    }

    if (!claimed) {
      throw new AnalystRequestError(
        "Esta execução já foi encerrada e não aceita ferramentas.",
        409,
      );
    }

    const context = new AnalystDataContext(scope);
    const argumentsValue = asArguments(body.arguments);
    let data: Record<string, unknown>;
    let sources: AnalystWorkflowSource[] = [];

    if (tool === "listar_conversas") {
      const batch = await context.getConversationBatch(
        boundedInteger(argumentsValue.offset, 0, 0, 100_000),
        boundedInteger(argumentsValue.limit, 4, 1, 4),
      );
      data = batch as unknown as Record<string, unknown>;
    } else if (tool === "obter_cobertura") {
      data = {
        coverage: await context.getCoverage(),
      };
    } else {
      const executionResult = await context.executeTool(
        tool as AnalystToolName,
        argumentsValue,
      );
      data = executionResult.result;
      sources = context.toWorkflowSources(executionResult.sources);
    }

    return Response.json({
      data,
      execution_id: executionId,
      ok: true,
      sources,
      tool,
    });
  } catch (error) {
    const status = error instanceof AnalystRequestError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível executar a ferramenta analítica.";

    if (status === 500) {
      console.error("Erro em ferramenta do Analista Lexia via n8n", error);
    }

    return Response.json({ error: message, ok: false }, { status });
  }
}
