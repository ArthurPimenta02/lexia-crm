import { AnalystDataContext } from "@/lib/analyst/data";
import {
  assertAnalystN8nRequest,
  getAnalystAnswerMessageId,
  isAnalystN8nToolName,
  resolveAnalystExecution,
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

    const { execution, scope } = await resolveAnalystExecution(executionId);

    if (execution.status === "concluida" && callbackStatus === "completed") {
      return Response.json({ execution_id: executionId, ok: true });
    }

    if (execution.status === "erro" && callbackStatus === "failed") {
      return Response.json({ execution_id: executionId, ok: true });
    }

    if (execution.status !== "iniciada") {
      throw new AnalystRequestError(
        "Esta execução já foi encerrada e não aceita outro retorno.",
        409,
      );
    }

    const admin = createAdminClient();
    const completedAt = new Date().toISOString();
    const durationMs = Math.max(
      0,
      Date.now() - new Date(execution.criado_em).getTime(),
    );

    if (callbackStatus === "failed") {
      const workflowError =
        limitedString(body.error, 500) ||
        "O workflow do n8n não conseguiu concluir a análise.";
      const { error } = await admin
        .from("lexia_ai_execucoes")
        .update({
          concluido_em: completedAt,
          duracao_ms: durationMs,
          erro: workflowError,
          status: "erro",
        })
        .eq("id", executionId)
        .eq("status", "iniciada");

      if (error) throw new Error("Não foi possível encerrar a execução.");

      return Response.json({ execution_id: executionId, ok: true });
    }

    const answer = limitedString(body.answer, 20_000);
    if (!answer) {
      throw new AnalystRequestError(
        "O n8n concluiu a execução sem enviar uma resposta.",
        400,
      );
    }

    const sourceInputs = Array.isArray(body.sources)
      ? (body.sources as AnalystWorkflowSourceInput[])
      : [];
    const context = new AnalystDataContext(scope);
    const sources = await context.resolveWorkflowSources(sourceInputs);
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
    const { error: messageError } = await admin
      .from("lexia_ai_mensagens")
      .insert({
        cliente_slug: scope.clienteSlug,
        conteudo: answer,
        criado_por: scope.userId,
        fontes: sources,
        id: answerMessageId,
        metadata: {
          execucao_id: executionId,
          ferramentas: tools,
          modelo: model,
          orquestrador: "n8n",
          versao_prompt: promptVersion,
        },
        papel: "assistente",
        sessao_id: execution.sessao_id,
      });

    if (messageError && messageError.code !== "23505") {
      throw new Error("Não foi possível guardar a resposta do Analista Lexia.");
    }

    const { error: executionError } = await admin
      .from("lexia_ai_execucoes")
      .update({
        concluido_em: completedAt,
        duracao_ms: durationMs,
        erro: null,
        ferramentas: tools,
        fontes: sources,
        modelo: model,
        status: "concluida",
        tokens_entrada: usage.inputTokens,
        tokens_saida: usage.outputTokens,
        versao_prompt: promptVersion,
      })
      .eq("id", executionId)
      .eq("status", "iniciada");

    if (executionError) {
      throw new Error("Não foi possível concluir a execução da análise.");
    }

    await admin
      .from("lexia_ai_sessoes")
      .update({ atualizado_em: completedAt })
      .eq("id", execution.sessao_id)
      .eq("cliente_slug", scope.clienteSlug)
      .eq("criado_por", scope.userId);

    return Response.json({ execution_id: executionId, ok: true });
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
