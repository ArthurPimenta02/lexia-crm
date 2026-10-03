import { AnalystDataContext } from "@/lib/analyst/data";
import {
  assertAnalystN8nRequest,
  getAnalystAnswerMessageId,
  isAnalystN8nToolName,
  resolveAnalystExecutionForCompletion,
} from "@/lib/analyst/n8n";
import { AnalystRequestError } from "@/lib/analyst/scope";
import type { AnalystWorkflowSourceInput } from "@/lib/analyst/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

type CallbackRequestBody = {
  answer?: unknown;
  error?: unknown;
  execution_id?: unknown;
  model?: unknown;
  prompt_version?: unknown;
  sources?: unknown;
  status?: unknown;
  tools?: unknown;
  usage?: unknown;
};

function limitedString(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalCount(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0
    ? Math.min(parsed, 100_000_000)
    : null;
}

function getUsage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { inputTokens: null, outputTokens: null };
  }

  const usage = value as Record<string, unknown>;
  return {
    inputTokens: optionalCount(usage.input_tokens),
    outputTokens: optionalCount(usage.output_tokens),
  };
}

function getTools(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => limitedString(item, 80))
            .filter((item) => isAnalystN8nToolName(item)),
        ),
      ).slice(0, 30)
    : [];
}

export async function POST(request: Request) {
  try {
    assertAnalystN8nRequest(request);
    const body = (await request.json()) as CallbackRequestBody;
    const executionId = limitedString(body.execution_id, 100);
    const callbackStatus = limitedString(body.status, 30).toLowerCase();

    if (!executionId || !["completed", "failed"].includes(callbackStatus)) {
      throw new AnalystRequestError("Retorno do n8n inválido.", 400);
    }

    const { execution, scope } =
      await resolveAnalystExecutionForCompletion(executionId);

    const admin = createAdminClient();
    const durationMs = Math.min(
      2_147_483_647,
      Math.max(0, Date.now() - new Date(execution.criado_em).getTime()),
    );

    const answer =
      callbackStatus === "completed" ? limitedString(body.answer, 20_000) : "";
    if (callbackStatus === "completed" && !answer) {
      throw new AnalystRequestError(
        "O n8n concluiu a execução sem enviar uma resposta.",
        400,
      );
    }

    const sourceInputs =
      callbackStatus === "completed" && Array.isArray(body.sources)
      ? (body.sources as AnalystWorkflowSourceInput[])
      : [];
    const sources =
      callbackStatus === "completed" &&
      execution.status === "iniciada" &&
      scope
      ? await new AnalystDataContext(scope).resolveWorkflowSources(sourceInputs)
      : [];
    const tools = Array.from(
      new Set([
        ...(Array.isArray(execution.ferramentas)
          ? execution.ferramentas.map((value) => String(value))
          : []),
        ...getTools(body.tools),
      ]),
    ).slice(0, 30);
    const usage = getUsage(body.usage);
    const model = limitedString(body.model, 120) || "n8n";
    const promptVersion =
      limitedString(body.prompt_version, 120) || "lexia_n8n_analyst_v1";
    const answerMessageId = getAnalystAnswerMessageId(executionId);
    const workflowError =
      callbackStatus === "failed"
        ? limitedString(body.error, 500) ||
          "O workflow do n8n não conseguiu concluir a análise."
        : null;
    const { data: outcome, error: finalizeError } = await admin.rpc(
      "lexia_finalizar_execucao_analista",
      {
        p_duracao_ms: durationMs,
        p_erro: workflowError,
        p_execucao_id: executionId,
        p_ferramentas: tools,
        p_fontes: sources,
        p_modelo: model,
        p_resposta: callbackStatus === "completed" ? answer : null,
        p_resposta_id:
          callbackStatus === "completed" ? answerMessageId : null,
        p_status:
          callbackStatus === "completed" ? "concluida" : "erro",
        p_tokens_entrada: usage.inputTokens,
        p_tokens_saida: usage.outputTokens,
        p_versao_prompt: promptVersion,
      },
    );

    if (finalizeError) {
      throw new Error("Não foi possível finalizar a execução da análise.");
    }

    if (outcome === "conflito") {
      throw new AnalystRequestError(
        "Esta execução já possui um resultado final diferente.",
        409,
      );
    }

    if (outcome === "nao_encontrada") {
      throw new AnalystRequestError("Execução de análise não encontrada.", 404);
    }

    if (outcome !== "finalizada" && outcome !== "repetida") {
      throw new AnalystRequestError("Retorno incompatível com a execução.", 400);
    }

    return Response.json({
      execution_id: executionId,
      idempotent: outcome === "repetida",
      ok: true,
    });
  } catch (error) {
    const status = error instanceof AnalystRequestError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível registrar o retorno do n8n.";

    if (status === 500) {
      console.error("Erro no callback do Analista Lexia via n8n", error);
    }

    return Response.json({ error: message, ok: false }, { status });
  }
}
