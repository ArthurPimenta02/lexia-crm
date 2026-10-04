import "server-only";

import { createHash } from "node:crypto";

import type { LexiaUserRole } from "@/lib/auth/profile";
import {
  formatRangeDate,
  getDateInputValue,
  getInclusiveRangeEnd,
} from "@/lib/dashboard/date-range";
import { getClientTimezone } from "@/lib/metrics/external-client-metrics";
import { createAdminClient } from "@/lib/supabase/admin";

import { AnalystRequestError } from "./scope";
import { isValidBearerAuthorization } from "./webhook-auth";
import {
  analystChannels,
  type AnalystChannel,
  type AnalystN8nToolName,
  type AnalystScope,
} from "./types";

const analystN8nPromptVersion = "lexia_n8n_analyst_v1";
const analystN8nToolNames = new Set<AnalystN8nToolName>([
  "obter_desempenho",
  "analisar_objecoes",
  "analisar_qualidade",
  "buscar_conversas",
  "abrir_conversa",
  "resumir_feedbacks",
  "listar_conversas",
  "obter_cobertura",
]);

export const analystPollIntervalMs = 1500;
export const analystExecutionTimeoutMs = 10 * 60 * 1000;

type AnalystExecutionRow = {
  canal: string | null;
  cliente_slug: string;
  concluido_em: string | null;
  criado_em: string;
  criado_por: string | null;
  erro: string | null;
  ferramentas: unknown;
  id: string;
  periodo_fim: string | null;
  periodo_inicio: string | null;
  sessao_id: string | null;
  status: "iniciada" | "concluida" | "erro";
  tipo: "chat" | "classificacao";
};

type AnalystWebhookConfig = {
  appUrl: string;
  secret: string;
  webhookUrl: string;
};

function parseHttpUrl(value: string, label: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new AnalystRequestError(`${label} não possui uma URL válida.`, 503);
  }

  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if (url.protocol !== "https:" && !localHttp) {
    throw new AnalystRequestError(`${label} precisa usar HTTPS.`, 503);
  }

  return url.toString().replace(/\/$/, "");
}

function getAnalystN8nSecret() {
  const secret = process.env.N8N_ANALYST_WEBHOOK_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new AnalystRequestError(
      "A integração do Analista Lexia com o n8n ainda não está configurada.",
      503,
    );
  }

  return secret;
}

function getAnalystWebhookConfig(): AnalystWebhookConfig {
  const webhookUrl = process.env.N8N_ANALYST_WEBHOOK_URL?.trim();
  const appUrl = process.env.LEXIA_APP_URL?.trim();

  if (!webhookUrl || !appUrl) {
    throw new AnalystRequestError(
      "A integração do Analista Lexia com o n8n ainda não está configurada.",
      503,
    );
  }

  return {
    appUrl: parseHttpUrl(appUrl, "LEXIA_APP_URL"),
    secret: getAnalystN8nSecret(),
    webhookUrl: parseHttpUrl(webhookUrl, "N8N_ANALYST_WEBHOOK_URL"),
  };
}

export function assertAnalystN8nRequest(request: Request) {
  const expected = getAnalystN8nSecret();

  if (
    !isValidBearerAuthorization(
      request.headers.get("authorization"),
      expected,
    )
  ) {
    throw new AnalystRequestError("Integração não autorizada.", 401);
  }
}

export function isAnalystN8nToolName(
  value: string,
): value is AnalystN8nToolName {
  return analystN8nToolNames.has(value as AnalystN8nToolName);
}

export function getAnalystAnswerMessageId(executionId: string) {
  const digest = createHash("sha256")
    .update(`lexia-ai-execution\0${executionId}`)
    .digest("hex")
    .slice(0, 32);
  const variant = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);

  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function buildSessionContext(scope: AnalystScope) {
  return {
    canal: scope.channel,
    data_fim: getDateInputValue(
      new Date(scope.range.end.getTime() - 1),
      scope.timezone,
    ),
    data_inicio: getDateInputValue(scope.range.start, scope.timezone),
    periodo: scope.range.key,
    periodo_fim: scope.range.end.toISOString(),
    periodo_inicio: scope.range.start.toISOString(),
    timezone: scope.timezone,
  };
}

async function enforceRateLimit(scope: AnalystScope) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("lexia_ai_execucoes")
    .select("id", { count: "exact", head: true })
    .eq("criado_por", scope.userId)
    .eq("tipo", "chat")
    .gte("criado_em", since);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      throw new Error("A migration do Analista Lexia ainda não foi aplicada.");
    }
    throw new Error("Não foi possível validar o limite de uso.");
  }

  if ((count ?? 0) >= 12) {
    throw new AnalystRequestError(
      "Foram feitas muitas perguntas em poucos minutos. Aguarde um pouco e tente novamente.",
      429,
    );
  }
}

async function getOrCreateSession(
  scope: AnalystScope,
  requestedSessionId: string | null,
  question: string,
) {
  const admin = createAdminClient();

  if (requestedSessionId) {
    const { data, error } = await admin
      .from("lexia_ai_sessoes")
      .select("id")
      .eq("id", requestedSessionId)
      .eq("cliente_slug", scope.clienteSlug)
      .eq("criado_por", scope.userId)
      .eq("status", "ativa")
      .maybeSingle();

    if (error) throw new Error("Não foi possível abrir esta conversa.");
    if (!data) {
      throw new AnalystRequestError(
        "Conversa do Analista Lexia não encontrada.",
        404,
      );
    }

    return data.id as string;
  }

  const title = question.replace(/\s+/g, " ").trim().slice(0, 72);
  const { data, error } = await admin
    .from("lexia_ai_sessoes")
    .insert({
      cliente_slug: scope.clienteSlug,
      contexto: buildSessionContext(scope),
      criado_por: scope.userId,
      status: "ativa",
      titulo: title || "Nova análise",
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "42P01" || error?.code === "PGRST205") {
      throw new Error("A migration do Analista Lexia ainda não foi aplicada.");
    }
    throw new Error("Não foi possível iniciar a conversa com o Analista Lexia.");
  }

  return data.id as string;
}

async function loadWorkflowHistory(
  scope: AnalystScope,
  sessionId: string,
  currentQuestion: string,
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lexia_ai_mensagens")
    .select("papel, conteudo")
    .eq("sessao_id", sessionId)
    .eq("cliente_slug", scope.clienteSlug)
    .order("criado_em", { ascending: false })
    .limit(16);

  if (error) throw new Error("Não foi possível carregar o histórico da análise.");

  const history = (data ?? []).reverse().map((message) => ({
    content: String(message.conteudo ?? "").slice(0, 8000),
    role: message.papel === "assistente" ? "assistant" : "user",
  }));
  const latest = history.at(-1);

  if (latest?.role === "user" && latest.content === currentQuestion) {
    history.pop();
  }

  return history;
}

async function failExecution(executionId: string, message: string) {
  const admin = createAdminClient();
  await admin
    .from("lexia_ai_execucoes")
    .update({
      concluido_em: new Date().toISOString(),
      erro: message.slice(0, 500),
      status: "erro",
    })
    .eq("id", executionId)
    .eq("status", "iniciada");
}

export async function queueAnalystQuestion(
  scope: AnalystScope,
  question: string,
  requestedSessionId: string | null,
) {
  const config = getAnalystWebhookConfig();
  await enforceRateLimit(scope);

  const admin = createAdminClient();
  const sessionId = await getOrCreateSession(
    scope,
    requestedSessionId,
    question,
  );
  const startedAt = Date.now();
  const { data: execution, error: executionError } = await admin
    .from("lexia_ai_execucoes")
    .insert({
      canal: scope.channel === "todos" ? null : scope.channel,
      cliente_slug: scope.clienteSlug,
      criado_por: scope.userId,
      modelo: "n8n",
      pergunta: question,
      periodo_fim: scope.range.end.toISOString(),
      periodo_inicio: scope.range.start.toISOString(),
      sessao_id: sessionId,
      status: "iniciada",
      tipo: "chat",
      versao_prompt: analystN8nPromptVersion,
    })
    .select("id")
    .single();

  if (executionError || !execution) {
    throw new Error("Não foi possível registrar a execução da análise.");
  }

  const executionId = String(execution.id);

  try {
    const { error: userMessageError } = await admin
      .from("lexia_ai_mensagens")
      .insert({
        cliente_slug: scope.clienteSlug,
        conteudo: question,
        criado_por: scope.userId,
        metadata: {
          canal: scope.channel,
          execucao_id: executionId,
          orquestrador: "n8n",
          periodo_fim: scope.range.end.toISOString(),
          periodo_inicio: scope.range.start.toISOString(),
        },
        papel: "usuario",
        sessao_id: sessionId,
      });

    if (userMessageError) {
      throw new Error("Não foi possível registrar a pergunta.");
    }

    await admin
      .from("lexia_ai_sessoes")
      .update({ contexto: buildSessionContext(scope) })
      .eq("id", sessionId)
      .eq("cliente_slug", scope.clienteSlug)
      .eq("criado_por", scope.userId);

    const history = await loadWorkflowHistory(scope, sessionId, question);
    const response = await fetch(config.webhookUrl, {
      body: JSON.stringify({
        client: {
          name: scope.clienteName,
          slug: scope.clienteSlug,
          timezone: scope.timezone,
        },
        endpoints: {
          callback: `${config.appUrl}/api/analista/n8n/callback`,
          tool: `${config.appUrl}/api/analista/n8n/tool`,
        },
        event: "lexia.analyst.question.created",
        execution_id: executionId,
        history,
        question,
        requested_at: new Date().toISOString(),
        scope: {
          channel: scope.channel,
          period: {
            end: scope.range.end.toISOString(),
            key: scope.range.key,
            label: scope.range.label,
            start: scope.range.start.toISOString(),
          },
        },
        session_id: sessionId,
        version: "1",
      }),
      headers: {
        authorization: `Bearer ${config.secret}`,
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      console.error("Webhook do Analista Lexia recusou a execução", {
        executionId,
        status: response.status,
      });
      throw new AnalystRequestError(
        "O fluxo de análise está indisponível no momento. Tente novamente em instantes.",
        502,
      );
    }

    return {
      executionId,
      pollAfterMs: analystPollIntervalMs,
      sessionId,
      status: "processing" as const,
    };
  } catch (error) {
    const storedMessage =
      error instanceof AnalystRequestError
        ? error.message
        : error instanceof Error && error.name === "TimeoutError"
          ? "O webhook do n8n não confirmou o recebimento a tempo."
          : "Falha ao despachar a execução para o n8n.";

    await admin
      .from("lexia_ai_execucoes")
      .update({
        concluido_em: new Date().toISOString(),
        duracao_ms: Date.now() - startedAt,
        erro: storedMessage.slice(0, 500),
        status: "erro",
      })
      .eq("id", executionId)
      .eq("status", "iniciada");

    if (error instanceof AnalystRequestError) throw error;
    throw new AnalystRequestError(
      "Não foi possível iniciar a análise no n8n. Tente novamente em instantes.",
      502,
    );
  }
}

function normalizeExecutionChannel(value: string | null): AnalystChannel {
  if (!value) return "todos";
  return analystChannels.includes(value as AnalystChannel)
    ? (value as AnalystChannel)
    : "todos";
}

type AnalystExecutionClient = {
  nome: string;
  slug: string;
  status: string;
};

type AnalystExecutionProfile = {
  cliente_slug: string | null;
  role: string;
  status: string;
};

function isValidExecutionRole(value: string): value is LexiaUserRole {
  return (
    value === "lexia_admin" ||
    value === "cliente_admin" ||
    value === "cliente_operador"
  );
}

function buildExecutionScope(
  row: AnalystExecutionRow,
  client: AnalystExecutionClient,
  role: LexiaUserRole,
) {
  const start = new Date(row.periodo_inicio ?? "");
  const end = new Date(row.periodo_fim ?? "");

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start ||
    end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000
  ) {
    throw new AnalystRequestError("Período inválido nesta execução.", 400);
  }

  const timezone = getClientTimezone(row.cliente_slug);

  return {
    channel: normalizeExecutionChannel(row.canal),
    clienteName: client.nome || client.slug,
    clienteSlug: row.cliente_slug,
    range: {
      end,
      key: "personalizado" as const,
      label: `${formatRangeDate(start, timezone)} - ${formatRangeDate(
        getInclusiveRangeEnd(end),
        timezone,
      )}`,
      start,
    },
    role,
    timezone,
    userId: row.criado_por as string,
  } satisfies AnalystScope;
}

async function loadRegisteredAnalystExecution(executionId: string) {
  const admin = createAdminClient();
  const { data: execution, error: executionError } = await admin
    .from("lexia_ai_execucoes")
    .select(
      "id, sessao_id, cliente_slug, criado_por, tipo, status, periodo_inicio, periodo_fim, canal, ferramentas, erro, criado_em, concluido_em",
    )
    .eq("id", executionId)
    .maybeSingle();

  if (executionError || !execution) {
    throw new AnalystRequestError("Execução de análise não encontrada.", 404);
  }

  const row = execution as AnalystExecutionRow;
  if (row.tipo !== "chat" || !row.criado_por || !row.sessao_id) {
    throw new AnalystRequestError("Execução de análise inválida.", 400);
  }

  const [
    { data: profiles, error: profileError },
    { data: client, error: clientError },
    { data: session, error: sessionError },
  ] = await Promise.all([
    admin
      .from("lexia_usuarios_clientes")
      .select("role, cliente_slug, status")
      .eq("user_id", row.criado_por)
      .limit(2),
    admin
      .from("lexia_clientes")
      .select("nome, slug, status")
      .eq("slug", row.cliente_slug)
      .maybeSingle(),
    admin
      .from("lexia_ai_sessoes")
      .select("id")
      .eq("id", row.sessao_id)
      .eq("cliente_slug", row.cliente_slug)
      .eq("criado_por", row.criado_por)
      .maybeSingle(),
  ]);

  if (profileError || clientError || sessionError) {
    throw new Error("Não foi possível validar a execução do Analista Lexia.");
  }

  if (!client || !session) {
    throw new AnalystRequestError(
      "A execução não possui sessão e cliente válidos.",
      400,
    );
  }

  if ((profiles ?? []).length > 1) {
    throw new AnalystRequestError(
      "A execução possui um vínculo de usuário ambíguo.",
      409,
    );
  }

  const profile = ((profiles ?? [])[0] as AnalystExecutionProfile | undefined) ?? null;
  const clientRow = client as AnalystExecutionClient;

  // Valida o período mesmo quando o retorno tardio só servirá para encerrar a
  // execução; o callback nunca pode ampliar o escopo persistido.
  buildExecutionScope(row, clientRow, "cliente_admin");

  return { client: clientRow, execution: row, profile };
}

export async function resolveAnalystExecutionForTool(executionId: string) {
  const { client, execution, profile } =
    await loadRegisteredAnalystExecution(executionId);
  const role = profile?.role ?? "";

  if (
    !profile ||
    profile.status !== "ativo" ||
    !isValidExecutionRole(role) ||
    (role !== "lexia_admin" && profile.cliente_slug !== execution.cliente_slug)
  ) {
    throw new AnalystRequestError("O acesso desta execução não está ativo.", 403);
  }

  if (client.status !== "ativo") {
    throw new AnalystRequestError("O cliente desta execução não está ativo.", 403);
  }

  return {
    execution,
    scope: buildExecutionScope(execution, client, role),
  };
}

export async function resolveAnalystExecutionForCompletion(
  executionId: string,
) {
  const { client, execution, profile } =
    await loadRegisteredAnalystExecution(executionId);
  const role = profile?.role ?? "";
  const profileMatchesExecution =
    profile &&
    isValidExecutionRole(role) &&
    (role === "lexia_admin" || profile.cliente_slug === execution.cliente_slug);
  const canResolveSources =
    Boolean(profileMatchesExecution) &&
    profile?.status === "ativo" &&
    client.status === "ativo";

  return {
    execution,
    scope: canResolveSources
      ? buildExecutionScope(execution, client, role as LexiaUserRole)
      : null,
  };
}

export async function expireAnalystExecutionIfNeeded(
  execution: AnalystExecutionRow,
) {
  if (execution.status !== "iniciada") return execution.status;

  const age = Date.now() - new Date(execution.criado_em).getTime();
  if (age <= analystExecutionTimeoutMs) return execution.status;

  await failExecution(
    execution.id,
    "O workflow do n8n excedeu o tempo máximo de processamento.",
  );
  return "erro" as const;
}
