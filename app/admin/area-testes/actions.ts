"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

export type AdminTestWorkflow = {
  id: string;
  nome: string | null;
  tipo: string | null;
  webhook_url: string | null;
};

type ActionResult<T> = {
  data: T | null;
  error: string | null;
};

type DeleteResult = {
  ok: boolean;
  error?: string;
};

async function isLexiaAdmin() {
  const { profile, user } = await getLoggedInUserProfile();

  return Boolean(user && profile?.role === "lexia_admin");
}

async function ensureClientExists(clienteSlug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_clientes")
    .select("slug")
    .eq("slug", clienteSlug)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
}

export async function createAdminTestSession(
  clienteSlug: string,
): Promise<ActionResult<AdminTestSession>> {
  if (!(await isLexiaAdmin()) || !(await ensureClientExists(clienteSlug))) {
    return { data: null, error: "Acesso não autorizado." };
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

  revalidatePath("/admin/area-testes");

  return { data: data as AdminTestSession, error: null };
}

export async function deleteAdminTestSession(
  clienteSlug: string,
  sessionId: string,
): Promise<DeleteResult> {
  if (!(await isLexiaAdmin())) {
    return { ok: false, error: "Acesso não autorizado." };
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
  if (!(await isLexiaAdmin())) {
    return { data: null, error: "Acesso não autorizado." };
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
  if (!(await isLexiaAdmin())) {
    return { data: null, error: "Acesso não autorizado." };
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
    return {
      data: null,
      error: "Não foi possível buscar a resposta do agente.",
    };
  }

  return { data: (data as AdminTestExecution | null) ?? null, error: null };
}

export async function sendAdminTestMessage(
  clienteSlug: string,
  sessionId: string,
  messageText: string,
  workflowId: string,
): Promise<ActionResult<{ runId: string }>> {
  if (!(await isLexiaAdmin())) {
    return { data: null, error: "Acesso não autorizado." };
  }

  const message = messageText.trim();

  if (!clienteSlug || !sessionId || !message) {
    return { data: null, error: "Digite uma mensagem para enviar." };
  }

  if (!workflowId) {
    return { data: null, error: "Selecione um workflow para testar." };
  }

  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("lexia_testes_sessoes")
    .select("session_id")
    .eq("cliente_slug", clienteSlug)
    .eq("session_id", sessionId)
    .eq("origem", "painel_admin")
    .maybeSingle();

  if (sessionError || !session) {
    return { data: null, error: "Sessão de teste não encontrada." };
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("lexia_workflows")
    .select("id, nome, tipo, webhook_url")
    .eq("id", workflowId)
    .eq("cliente_slug", clienteSlug)
    .eq("status", "ativo")
    .maybeSingle();

  if (workflowError) {
    return {
      data: null,
      error: "Não foi possível buscar o workflow ativo.",
    };
  }

  const activeWorkflow = workflow as AdminTestWorkflow | null;

  if (!activeWorkflow?.webhook_url) {
    return {
      data: null,
      error: "Nenhum workflow ativo configurado para este cliente.",
    };
  }

  const runId = crypto.randomUUID();
  const response = await fetch(activeWorkflow.webhook_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lexia_modo_teste: true,
      lexia_origem: "painel_admin",
      lexia_session_id: sessionId,
      lexia_run_id: runId,
      lexia_teste_id: "",
      lexia_workflow_id: activeWorkflow.id,
      lexia_workflow_tipo: activeWorkflow.tipo ?? "",
      message: {
        type: "text",
        text: message,
      },
    }),
  });

  if (!response.ok) {
    return {
      data: null,
      error: "Não foi possível enviar a mensagem ao workflow.",
    };
  }

  return { data: { runId }, error: null };
}
