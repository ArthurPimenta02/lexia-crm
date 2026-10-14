export type AnalystCallbackExecution = {
  criado_em: string;
  status: "iniciada" | "concluida" | "erro";
};

export type AnalystCallbackFinalizeInput = {
  durationMs: number;
  error: string | null;
  executionId: string;
  model: string;
  promptVersion: string;
  response: string | null;
  responseId: string | null;
  sources: unknown[];
  status: "concluida" | "erro";
  tools: string[];
  tokensInput: number | null;
  tokensOutput: number | null;
};

export type AnalystCallbackFinalizeOutcome =
  | "conflito"
  | "finalizada"
  | "invalida"
  | "nao_encontrada"
  | "repetida";

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

export type AnalystCallbackDependencies<Scope> = {
  assertAuthorized: (request: Request) => void;
  finalize: (
    input: AnalystCallbackFinalizeInput,
  ) => Promise<AnalystCallbackFinalizeOutcome>;
  getAnswerMessageId: (executionId: string) => string;
  isToolName: (value: string) => boolean;
  now?: () => number;
  onInternalError?: (error: unknown) => void;
  resolveExecution: (executionId: string) => Promise<{
    execution: AnalystCallbackExecution;
    scope: Scope | null;
  }>;
  resolveSources: (scope: Scope, sources: unknown[]) => Promise<unknown[]>;
};

export class AnalystCallbackHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AnalystCallbackHttpError";
  }
}

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

function getStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    Number.isInteger((error as { status?: unknown }).status)
  ) {
    const status = Number((error as { status: number }).status);
    if (status >= 400 && status <= 599) return status;
  }

  return 500;
}

export function createAnalystCallbackHandler<Scope>(
  dependencies: AnalystCallbackDependencies<Scope>,
) {
  return async function handleAnalystCallback(request: Request) {
    try {
      dependencies.assertAuthorized(request);

      let body: CallbackRequestBody;
      try {
        body = (await request.json()) as CallbackRequestBody;
      } catch {
        throw new AnalystCallbackHttpError("Retorno do n8n inválido.", 400);
      }

      const executionId = limitedString(body.execution_id, 100);
      const callbackStatus = limitedString(body.status, 30).toLowerCase();

      if (!executionId || !["completed", "failed"].includes(callbackStatus)) {
        throw new AnalystCallbackHttpError("Retorno do n8n inválido.", 400);
      }

      const { execution, scope } =
        await dependencies.resolveExecution(executionId);
      const now = dependencies.now?.() ?? Date.now();
      const createdAt = new Date(execution.criado_em).getTime();
      const durationMs = Number.isFinite(createdAt)
        ? Math.min(2_147_483_647, Math.max(0, now - createdAt))
        : 0;

      const answer =
        callbackStatus === "completed"
          ? limitedString(body.answer, 20_000)
          : "";
      if (callbackStatus === "completed" && !answer) {
        throw new AnalystCallbackHttpError(
          "O n8n concluiu a execução sem enviar uma resposta.",
          400,
        );
      }

      const sourceInputs =
        callbackStatus === "completed" && Array.isArray(body.sources)
          ? body.sources
          : [];
      const sources =
        callbackStatus === "completed" &&
        execution.status === "iniciada" &&
        scope
          ? await dependencies.resolveSources(scope, sourceInputs)
          : [];
      const tools = Array.isArray(body.tools)
        ? Array.from(
            new Set(
              body.tools
                .map((item) => limitedString(item, 80))
                .filter((item) => dependencies.isToolName(item)),
            ),
          ).slice(0, 30)
        : [];
      const usage = getUsage(body.usage);
      const model = limitedString(body.model, 120) || "n8n";
      const promptVersion =
        limitedString(body.prompt_version, 120) || "lexia_n8n_analyst_v1";
      const workflowError =
        callbackStatus === "failed"
          ? limitedString(body.error, 500) ||
            "O workflow do n8n não conseguiu concluir a análise."
          : null;
      const outcome = await dependencies.finalize({
        durationMs,
        error: workflowError,
        executionId,
        model,
        promptVersion,
        response: callbackStatus === "completed" ? answer : null,
        responseId:
          callbackStatus === "completed"
            ? dependencies.getAnswerMessageId(executionId)
            : null,
        sources,
        status: callbackStatus === "completed" ? "concluida" : "erro",
        tools,
        tokensInput: usage.inputTokens,
        tokensOutput: usage.outputTokens,
      });

      if (outcome === "conflito") {
        throw new AnalystCallbackHttpError(
          "Esta execução já possui um resultado final diferente.",
          409,
        );
      }

      if (outcome === "nao_encontrada") {
        throw new AnalystCallbackHttpError(
          "Execução de análise não encontrada.",
          404,
        );
      }

      if (outcome !== "finalizada" && outcome !== "repetida") {
        throw new AnalystCallbackHttpError(
          "Retorno incompatível com a execução.",
          400,
        );
      }

      return Response.json({
        execution_id: executionId,
        idempotent: outcome === "repetida",
        ok: true,
      });
    } catch (error) {
      const status = getStatus(error);
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o retorno do n8n.";

      if (status === 500) dependencies.onInternalError?.(error);

      return Response.json({ error: message, ok: false }, { status });
    }
  };
}
