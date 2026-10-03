"use server";

import { revalidatePath } from "next/cache";

import {
  getAccessErrorMessage,
  requireAdministrativeClientAccess,
  requireOperationalClientAccess,
} from "@/lib/auth/access-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowPublic } from "@/lib/workflows/contracts";
import { dispatchTestWorkflow } from "@/lib/workflows/private-config";

export type AdminTestSession = {
  id: string;
  session_id: string;
  cliente_slug: string;
  origem: string;
  status: string;
  nome: string | null;
  criado_em: string | null;
};

export type AdminTestExecution = {
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

export type AdminTestWorkflow = WorkflowPublic;

type ActionResult<T> = {
  data: T | null;
  error: string | null;
};

type DeleteResult = {
  ok: boolean;
  error?: string;
};

export async function createAdminTestSession(
  clienteSlug: string,
): Promise<ActionResult<AdminTestSession>> {
  try {
    await requireAdministrativeClientAccess(clienteSlug, {
      requireActiveClient: true,
    });
  } catch (error) {
    return { data: null, error: getAccessErrorMessage(error) };
  }

  const supabase = await createClient();
  const sessionId = crypto.randomUUID();

  const { data, error } = await supabase
    .from("lexia_testes_sessoes")
    .insert({
      session_id: sessionId,
      cliente_slug: clienteSlug,
      origem: "painel_admin",
      status: "activa",
      nome: "Nova sessão admin",
    })
    .select("id, session_id, cliente_slug, origem, status, nome, criado_em")
    .single();

  if (error) {
    return {
      data: null,
      error: "Não foi possível criar a sessão de teste.",
    };
  }

  revalidatePath("/admin/area-testes");

  return { data: data as AdminTestSession, error: null };
}

export async function deleteAdminTestSession(
  clienteSlug: string,
  sessionId: string,
): Promise<DeleteResult> {
  try {
    await requireAdministrativeClientAccess(clienteSlug);
  } catch (error) {
    return { ok: false, error: getAccessErrorMessage(error) };
  }

  if (!clienteSlug || !sessionId) {
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
    .eq("cliente_slug", clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_admin")
    .maybeSingle();

  if (sessionError || !session) {
    return { ok: false, error: "Sessão de teste admin não encontrada." };
  }

  const { data: executions, error: executionsLookupError } = await supabaseAdmin
    .from("lexia_testes_execucoes")
    .select("id")
    .eq("cliente_slug", clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_admin");

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
      .eq("cliente_slug", clienteSlug)
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
    .eq("cliente_slug", clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_admin");

  if (executionsError) {
    return { ok: false, error: "Não foi possível excluir execuções." };
  }

  const testConversationId = `teste:${sessionId}`;

  const { error: messagesError } = await supabaseAdmin
    .from("lexia_mensagens")
    .delete()
    .eq("cliente_slug", clienteSlug)
    .eq("identificador_conversa", testConversationId);

  if (messagesError) {
    return { ok: false, error: "Não foi possível excluir mensagens." };
  }

  const { error: contactsError } = await supabaseAdmin
    .from("lexia_contactos")
    .delete()
    .eq("cliente_slug", clienteSlug)
    .eq("identificador_conversa", testConversationId);

  if (contactsError) {
    return { ok: false, error: "Não foi possível excluir contacto." };
  }

  const { error: deleteSessionError } = await supabaseAdmin
    .from("lexia_testes_sessoes")
    .delete()
    .eq("cliente_slug", clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_admin");

  if (deleteSessionError) {
    return { ok: false, error: "Não foi possível excluir a sessão." };
  }

  revalidatePath("/admin/area-testes");
  revalidatePath("/admin/feedbacks");
  revalidatePath("/admin/handoffs");
  revalidatePath("/admin/execucoes");
  revalidatePath(`/admin/clientes/${clienteSlug}`);

  return { ok: true };
}

export async function getAdminSessionExecutions(
  clienteSlug: string,
  sessionId: string,
): Promise<ActionResult<AdminTestExecution[]>> {
  try {
    await requireAdministrativeClientAccess(clienteSlug);
  } catch (error) {
    return { data: null, error: getAccessErrorMessage(error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_testes_execucoes")
    .select(
      "id, run_id, session_id, cliente_slug, origem, mensagem_teste, mensagens, resposta_obtida, criado_em",
    )
    .eq("cliente_slug", clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_admin")
    .order("criado_em", { ascending: true });

  if (error) {
    return {
      data: null,
      error: "Não foi possível buscar as mensagens da sessão.",
    };
  }

  return { data: (data ?? []) as AdminTestExecution[], error: null };
}

export async function getAdminExecutionByRunId(
  clienteSlug: string,
  sessionId: string,
  runId: string,
): Promise<ActionResult<AdminTestExecution | null>> {
  try {
    await requireAdministrativeClientAccess(clienteSlug);
  } catch (error) {
    return { data: null, error: getAccessErrorMessage(error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_testes_execucoes")
    .select(
      "id, run_id, session_id, cliente_slug, origem, mensagem_teste, mensagens, resposta_obtida, criado_em",
    )
    .eq("cliente_slug", clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_admin")
    .eq("run_id", runId)
    .maybeSingle();

  if (error) {
    return { data: null, error: "Não foi possível buscar a resposta do agente." };
  }

  return { data: (data as AdminTestExecution | null) ?? null, error: null };
}

export async function sendAdminTestMessage(
  clienteSlug: string,
  sessionId: string,
  messageText: string,
  workflowId: string,
): Promise<ActionResult<{ runId: string }>> {
  try {
    await requireOperationalClientAccess(clienteSlug);
  } catch (error) {
    return { data: null, error: getAccessErrorMessage(error) };
  }

  const message = messageText.trim();

  if (!clienteSlug || !sessionId || !message) {
    return { data: null, error: "Digite uma mensagem para enviar." };
  }

  if (!workflowId) {
    return { data: null, error: "Selecione um workflow para testar." };
  }

  try {
    const result = await dispatchTestWorkflow({
      clienteSlug,
      message,
      origin: "painel_admin",
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
