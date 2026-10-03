"use server";

import { revalidatePath } from "next/cache";

import {
  getAccessErrorMessage,
  requireClientPanelAccess,
} from "@/lib/auth/access-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowPublic } from "@/lib/workflows/contracts";
import { dispatchTestWorkflow } from "@/lib/workflows/private-config";

export type TestSession = {
  id: string;
  session_id: string;
  cliente_slug: string;
  origem: string;
  status: string;
  nome: string | null;
  criado_em: string | null;
};

export type TestExecution = {
  id: string;
  run_id: string | null;
  session_id: string;
  cliente_slug: string;
  origem: string;
  mensagem_teste: string | null;
  mensagens: unknown;
  resposta_obtida: string | null;
  criado_em: string | null;
};

export type FeedbackRating = "boa_resposta" | "precisa_ajuste" | "erro_grave";

export type TestFeedback = {
  id: string;
  teste_execucao_id: string;
  avaliacao: FeedbackRating;
};

export type TestWorkflow = WorkflowPublic;

type ActionResult<T> =
  {
    data: T | null;
    error: string | null;
  };

type DeleteResult = {
  ok: boolean;
  error?: string;
};

type ClientContext =
  | {
      clienteSlug: string;
      userId: string;
      error?: never;
    }
  | {
      clienteSlug?: never;
      userId?: never;
      error: string;
    };

async function getClientContext(): Promise<ClientContext> {
  try {
    const context = await requireClientPanelAccess();

    return { clienteSlug: context.clienteSlug, userId: context.user.id };
  } catch (error) {
    return { error: getAccessErrorMessage(error) };
  }
}

function stringifyMessage(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const candidate = value as {
      text?: unknown;
      content?: unknown;
      message?: unknown;
      resposta?: unknown;
    };

    for (const item of [
      candidate.text,
      candidate.content,
      candidate.message,
      candidate.resposta,
    ]) {
      if (typeof item === "string" && item.trim()) {
        return item;
      }
    }
  }

  return "";
}

function getAgentResponseText(execution: Pick<TestExecution, "mensagens" | "resposta_obtida">) {
  const fallback = execution.resposta_obtida ? [execution.resposta_obtida] : [];
  const source = execution.mensagens;

  if (Array.isArray(source)) {
    const messages = source.map(stringifyMessage).filter(Boolean);

    return (messages.length > 0 ? messages : fallback).join("\n\n");
  }

  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source) as unknown;

      if (Array.isArray(parsed)) {
        const messages = parsed.map(stringifyMessage).filter(Boolean);

        return (messages.length > 0 ? messages : fallback).join("\n\n");
      }
    } catch {
      // Mensagens em texto simples seguem para o tratamento abaixo.
    }
  }

  return stringifyMessage(source) || fallback.join("\n\n");
}

export async function createTestSession(): Promise<ActionResult<TestSession>> {
  const context = await getClientContext();

  if (context.error) {
    return { data: null, error: context.error };
  }

  const supabase = await createClient();
  const sessionId = crypto.randomUUID();

  const { data, error } = await supabase
    .from("lexia_testes_sessoes")
    .insert({
      session_id: sessionId,
      cliente_slug: context.clienteSlug,
      origem: "painel_cliente",
      status: "activa",
      nome: "Nova sessão",
    })
    .select("id, session_id, cliente_slug, origem, status, nome, criado_em")
    .single();

  if (error) {
    return {
      data: null,
      error: "Não foi possível criar a sessão de teste.",
    };
  }

  revalidatePath("/app/area-testes");

  return { data: data as TestSession, error: null };
}

export async function deleteTestSession(
  sessionId: string,
): Promise<DeleteResult> {
  const context = await getClientContext();

  if (context.error) {
    return { ok: false, error: context.error };
  }

  if (!sessionId) {
    return { ok: false, error: "Sessão de teste inválida." };
  }

  let supabaseAdmin: ReturnType<typeof createAdminClient>;

  try {
    supabaseAdmin = createAdminClient();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível criar o client admin do Supabase.",
    };
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("lexia_testes_sessoes")
    .select("session_id")
    .eq("cliente_slug", context.clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_cliente")
    .maybeSingle();

  if (sessionError || !session) {
    return { ok: false, error: "Sessão de teste não encontrada." };
  }

  const { data: executions, error: executionsLookupError } = await supabaseAdmin
    .from("lexia_testes_execucoes")
    .select("id")
    .eq("cliente_slug", context.clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_cliente");

  if (executionsLookupError) {
    return {
      ok: false,
      error: "Não foi possível buscar execuções da sessão.",
    };
  }

  const executionIds = (executions ?? []).map((execution) => execution.id);

  if (executionIds.length > 0) {
    const { error: feedbackError } = await supabaseAdmin
      .from("lexia_feedbacks")
      .delete()
      .eq("cliente_slug", context.clienteSlug)
      .in("teste_execucao_id", executionIds);

    if (feedbackError) {
      return {
        ok: false,
        error: "Não foi possível excluir feedbacks da sessão.",
      };
    }
  }

  const { error: executionsError } = await supabaseAdmin
    .from("lexia_testes_execucoes")
    .delete()
    .eq("cliente_slug", context.clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_cliente");

  if (executionsError) {
    return { ok: false, error: "Não foi possível excluir execuções." };
  }

  const testConversationId = `teste:${sessionId}`;

  const { error: messagesError } = await supabaseAdmin
    .from("lexia_mensagens")
    .delete()
    .eq("cliente_slug", context.clienteSlug)
    .eq("identificador_conversa", testConversationId);

  if (messagesError) {
    return { ok: false, error: "Não foi possível excluir mensagens." };
  }

  const { error: contactsError } = await supabaseAdmin
    .from("lexia_contactos")
    .delete()
    .eq("cliente_slug", context.clienteSlug)
    .eq("identificador_conversa", testConversationId);

  if (contactsError) {
    return { ok: false, error: "Não foi possível excluir contacto." };
  }

  const { error: deleteSessionError } = await supabaseAdmin
    .from("lexia_testes_sessoes")
    .delete()
    .eq("cliente_slug", context.clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_cliente");

  if (deleteSessionError) {
    return { ok: false, error: "Não foi possível excluir a sessão." };
  }

  revalidatePath("/app/area-testes");
  revalidatePath("/app/feedbacks");
  revalidatePath("/app/handoffs");
  revalidatePath("/app/execucoes");

  return { ok: true };
}

export async function getSessionExecutions(
  sessionId: string,
): Promise<ActionResult<TestExecution[]>> {
  const context = await getClientContext();

  if (context.error) {
    return { data: null, error: context.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_testes_execucoes")
    .select(
      "id, run_id, session_id, cliente_slug, origem, mensagem_teste, mensagens, resposta_obtida, criado_em",
    )
    .eq("cliente_slug", context.clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_cliente")
    .order("criado_em", { ascending: true });

  if (error) {
    return {
      data: null,
      error: "Não foi possível buscar as mensagens da sessão.",
    };
  }

  return { data: (data ?? []) as TestExecution[], error: null };
}

export async function getExecutionByRunId(
  sessionId: string,
  runId: string,
): Promise<ActionResult<TestExecution | null>> {
  const context = await getClientContext();

  if (context.error) {
    return { data: null, error: context.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_testes_execucoes")
    .select(
      "id, run_id, session_id, cliente_slug, origem, mensagem_teste, mensagens, resposta_obtida, criado_em",
    )
    .eq("cliente_slug", context.clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_cliente")
    .eq("run_id", runId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: "Não foi possível buscar a resposta do agente.",
    };
  }

  return { data: (data as TestExecution | null) ?? null, error: null };
}

export async function sendTestMessage(
  sessionId: string,
  messageText: string,
  workflowId: string,
): Promise<ActionResult<{ runId: string }>> {
  const context = await getClientContext();

  if (context.error) {
    return { data: null, error: context.error };
  }

  const message = messageText.trim();

  if (!sessionId || !message) {
    return { data: null, error: "Digite uma mensagem para enviar." };
  }

  if (!workflowId) {
    return { data: null, error: "Selecione um workflow para testar." };
  }

  try {
    const result = await dispatchTestWorkflow({
      message,
      origin: "painel_cliente",
      sessionId,
      workflowId,
    });

    return { data: result, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a mensagem ao workflow.",
    };
  }
}

export async function saveExecutionFeedback(
  executionId: string,
  avaliacao: FeedbackRating,
  comentario?: string,
): Promise<ActionResult<TestFeedback>> {
  const context = await getClientContext();

  if (context.error) {
    return { data: null, error: context.error };
  }

  const validRatings: FeedbackRating[] = [
    "boa_resposta",
    "precisa_ajuste",
    "erro_grave",
  ];

  if (!validRatings.includes(avaliacao)) {
    return { data: null, error: "Avaliação inválida." };
  }

  const supabase = await createClient();
  const { data: execution, error: executionError } = await supabase
    .from("lexia_testes_execucoes")
    .select("id, cliente_slug, origem, mensagem_teste, mensagens, resposta_obtida")
    .eq("id", executionId)
    .eq("cliente_slug", context.clienteSlug)
    .eq("origem", "painel_cliente")
    .maybeSingle();

  if (executionError || !execution) {
    return { data: null, error: "Execução de teste não encontrada." };
  }

  const testExecution = execution as Pick<
    TestExecution,
    "id" | "cliente_slug" | "origem" | "mensagem_teste" | "mensagens" | "resposta_obtida"
  >;

  const feedbackPayload = {
    cliente_slug: context.clienteSlug,
    teste_execucao_id: testExecution.id,
    origem: "painel_cliente",
    avaliacao,
    comentario: comentario?.trim() || null,
    mensagem_cliente: testExecution.mensagem_teste,
    resposta_agente: getAgentResponseText(testExecution),
    status: "pendente",
    criado_por: context.userId,
  };

  const { data: existingFeedback, error: existingError } = await supabase
    .from("lexia_feedbacks")
    .select("id")
    .eq("cliente_slug", context.clienteSlug)
    .eq("teste_execucao_id", executionId)
    .eq("criado_por", context.userId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: "Não foi possível buscar feedback existente." };
  }

  const query = existingFeedback
    ? supabase
        .from("lexia_feedbacks")
        .update(feedbackPayload)
        .eq("id", existingFeedback.id)
    : supabase.from("lexia_feedbacks").insert(feedbackPayload);

  const { data, error } = await query
    .select("id, teste_execucao_id, avaliacao")
    .single();

  if (error) {
    return { data: null, error: "Não foi possível salvar o feedback." };
  }

  revalidatePath("/app/area-testes");
  revalidatePath("/app/feedbacks");

  return { data: data as TestFeedback, error: null };
}
