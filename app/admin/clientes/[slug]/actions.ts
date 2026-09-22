"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ClientSettingsState = {
  message: string | null;
  type: "success" | "error" | null;
};

export type ClientUserState = {
  message: string | null;
  type: "success" | "error" | null;
};

const clientStatuses = ["ativo", "inativo", "suspenso"];
const workflowStatuses = ["ativo", "inativo", "teste"];
const clientUserRoles = ["cliente_admin", "cliente_operador"];
const clientUserStatuses = ["ativo", "inativo"];

async function isLexiaAdmin() {
  const { profile, user } = await getLoggedInUserProfile();

  return Boolean(user && profile?.role === "lexia_admin");
}

function getValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function updateClientSettings(
  clienteSlug: string,
  workflowId: string | null,
  _state: ClientSettingsState,
  formData: FormData,
): Promise<ClientSettingsState> {
  if (!(await isLexiaAdmin())) {
    return {
      message: "Acesso não autorizado.",
      type: "error",
    };
  }

  const nome = getValue(formData, "nome");
  const status = getValue(formData, "status");
  const corPrincipal = getValue(formData, "cor_principal");
  const modoTeste = formData.get("modo_teste") === "on";
  const workflowNome = getValue(formData, "workflow_nome");
  const workflowTipo = getValue(formData, "workflow_tipo");
  const webhookUrl = getValue(formData, "webhook_url");
  const workflowStatus = getValue(formData, "workflow_status");

  if (!nome || !clientStatuses.includes(status)) {
    return {
      message: "Preencha os dados obrigatórios do cliente.",
      type: "error",
    };
  }

  if (!workflowStatuses.includes(workflowStatus)) {
    return {
      message: "Status do workflow inválido.",
      type: "error",
    };
  }

  if (!workflowNome || !workflowTipo || !webhookUrl) {
    return {
      message:
        "Preencha nome, tipo e Webhook URL para salvar o workflow deste cliente.",
      type: "error",
    };
  }

  const supabase = await createClient();
  const { data: client, error: clientLookupError } = await supabase
    .from("lexia_clientes")
    .select("slug")
    .eq("slug", clienteSlug)
    .maybeSingle();

  if (clientLookupError || !client) {
    return {
      message: "Cliente não encontrado.",
      type: "error",
    };
  }

  const { error: clientError } = await supabase
    .from("lexia_clientes")
    .update({
      nome,
      status,
      modo_teste: modoTeste,
      cor_principal: corPrincipal || null,
    })
    .eq("slug", clienteSlug);

  if (clientError) {
    console.error("Erro ao atualizar cliente", clientError);

    return {
      message: "Não foi possível atualizar o cliente.",
      type: "error",
    };
  }

  const workflowPayload = {
    cliente_slug: clienteSlug,
    nome: workflowNome || null,
    tipo: workflowTipo || null,
    webhook_url: webhookUrl || null,
    status: workflowStatus,
  };

  const workflowQuery = workflowId
    ? supabase
        .from("lexia_workflows")
        .update(workflowPayload)
        .eq("id", workflowId)
        .eq("cliente_slug", clienteSlug)
    : supabase.from("lexia_workflows").insert(workflowPayload);

  const { error: workflowError } = await workflowQuery;

  if (workflowError) {
    console.error("Erro ao salvar workflow do cliente", {
      error: workflowError,
      clienteSlug,
      workflowId,
      workflowPayload,
    });

    return {
      message: "Cliente salvo, mas não foi possível salvar o workflow.",
      type: "error",
    };
  }

  revalidatePath(`/admin/clientes/${clienteSlug}`);
  revalidatePath("/admin");

  return {
    message: "Configurações salvas com sucesso.",
    type: "success",
  };
}

export async function createClientUser(
  clienteSlug: string,
  _state: ClientUserState,
  formData: FormData,
): Promise<ClientUserState> {
  if (!(await isLexiaAdmin())) {
    return {
      message: "Acesso não autorizado.",
      type: "error",
    };
  }

  const email = getValue(formData, "email").toLowerCase();
  const password = getValue(formData, "password");
  const role = getValue(formData, "role");
  const status = getValue(formData, "status");

  if (!email || !password) {
    return {
      message: "Preencha e-mail e senha temporária.",
      type: "error",
    };
  }

  if (!clientUserRoles.includes(role)) {
    return {
      message: "Role inválida para usuário de cliente.",
      type: "error",
    };
  }

  if (!clientUserStatuses.includes(status)) {
    return {
      message: "Status inválido para usuário de cliente.",
      type: "error",
    };
  }

  let supabaseAdmin: ReturnType<typeof createAdminClient>;

  try {
    supabaseAdmin = createAdminClient();
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível criar o client admin do Supabase.",
      type: "error",
    };
  }

  const { data: client, error: clientLookupError } = await supabaseAdmin
    .from("lexia_clientes")
    .select("slug")
    .eq("slug", clienteSlug)
    .maybeSingle();

  if (clientLookupError || !client) {
    return {
      message: "Cliente não encontrado.",
      type: "error",
    };
  }

  const { data: createdUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createUserError || !createdUser.user) {
    const errorMessage = createUserError?.message.toLowerCase() ?? "";
    const emailAlreadyExists =
      errorMessage.includes("already") ||
      errorMessage.includes("registered") ||
      errorMessage.includes("exists");

    return {
      message: emailAlreadyExists
        ? "Já existe um usuário com este e-mail."
        : "Não foi possível criar o usuário no Supabase Auth.",
      type: "error",
    };
  }

  const { error: linkError } = await supabaseAdmin
    .from("lexia_usuarios_clientes")
    .insert({
      user_id: createdUser.user.id,
      cliente_slug: clienteSlug,
      role,
      status,
    });

  if (linkError) {
    return {
      message:
        "Usuário criado no Auth, mas não foi possível vincular ao cliente.",
      type: "error",
    };
  }

  revalidatePath(`/admin/clientes/${clienteSlug}`);

  return {
    message: "Usuário do cliente criado com sucesso.",
    type: "success",
  };
}

export async function updateClientUserStatus(
  clienteSlug: string,
  userId: string,
  status: string,
) {
  if (!(await isLexiaAdmin())) {
    return;
  }

  if (!clientUserStatuses.includes(status)) {
    return;
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("lexia_usuarios_clientes")
    .update({ status })
    .eq("cliente_slug", clienteSlug)
    .eq("user_id", userId);

  if (error) {
    throw new Error("Não foi possível atualizar o status do usuário.");
  }

  revalidatePath(`/admin/clientes/${clienteSlug}`);
}

export async function clearClientTestData(clienteSlug: string) {
  if (!(await isLexiaAdmin()) || !clienteSlug) {
    return { ok: false, error: "Acesso não autorizado." };
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

  const { data: client, error: clientLookupError } = await supabaseAdmin
    .from("lexia_clientes")
    .select("slug")
    .eq("slug", clienteSlug)
    .maybeSingle();

  if (clientLookupError || !client) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const { data: executions, error: executionsLookupError } = await supabaseAdmin
    .from("lexia_testes_execucoes")
    .select("id")
    .eq("cliente_slug", clienteSlug);

  if (executionsLookupError) {
    return {
      ok: false,
      error: "Não foi possível buscar execuções de teste.",
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
        error: "Não foi possível excluir feedbacks de teste.",
      };
    }
  }

  const { error: executionsError } = await supabaseAdmin
    .from("lexia_testes_execucoes")
    .delete()
    .eq("cliente_slug", clienteSlug);

  if (executionsError) {
    return {
      ok: false,
      error: "Não foi possível excluir execuções de teste.",
    };
  }

  const { error: sessionsError } = await supabaseAdmin
    .from("lexia_testes_sessoes")
    .delete()
    .eq("cliente_slug", clienteSlug);

  if (sessionsError) {
    return {
      ok: false,
      error: "Não foi possível excluir sessões de teste.",
    };
  }

  const { error: messagesError } = await supabaseAdmin
    .from("lexia_mensagens")
    .delete()
    .eq("cliente_slug", clienteSlug)
    .like("identificador_conversa", "teste:%");

  if (messagesError) {
    return {
      ok: false,
      error: "Não foi possível excluir mensagens de teste.",
    };
  }

  const { error: contactsError } = await supabaseAdmin
    .from("lexia_contactos")
    .delete()
    .eq("cliente_slug", clienteSlug)
    .like("identificador_conversa", "teste:%");

  if (contactsError) {
    return {
      ok: false,
      error: "Não foi possível excluir contactos de teste.",
    };
  }

  revalidatePath(`/admin/clientes/${clienteSlug}`);
  revalidatePath("/admin/area-testes");
  revalidatePath("/admin/execucoes");
  revalidatePath("/admin/feedbacks");
  revalidatePath("/admin/handoffs");

  return { ok: true };
}
