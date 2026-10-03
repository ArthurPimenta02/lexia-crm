"use server";

import { revalidatePath } from "next/cache";

import {
  getAccessErrorMessage,
  requireAdministrativeClientAccess,
  requireLexiaAdmin,
} from "@/lib/auth/access-context";
import {
  recordPendingUserLink,
  retryPendingUserLinkAsAdmin,
} from "@/lib/auth/user-link-pending";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createWorkflowAsAdmin,
  updateWorkflowAsAdmin,
} from "@/lib/workflows/private-config";

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

function getValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function updateClientSettings(
  clienteSlug: string,
  workflowId: string | null,
  _state: ClientSettingsState,
  formData: FormData,
): Promise<ClientSettingsState> {
  try {
    await requireAdministrativeClientAccess(clienteSlug);
  } catch (error) {
    return {
      message: getAccessErrorMessage(error),
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

  if (!workflowNome || !workflowTipo || (!workflowId && !webhookUrl)) {
    return {
      message:
        "Preencha nome e tipo. A URL é obrigatória apenas ao criar um workflow.",
      type: "error",
    };
  }

  const supabase = createAdminClient();
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

  try {
    const workflowInput = {
      clienteSlug,
      nome: workflowNome,
      status: workflowStatus,
      tipo: workflowTipo,
      webhookUrl,
    };

    if (workflowId) {
      await updateWorkflowAsAdmin(workflowId, workflowInput);
    } else {
      await createWorkflowAsAdmin(workflowInput);
    }
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? `Cliente salvo, mas o workflow não foi salvo: ${error.message}`
          : "Cliente salvo, mas não foi possível salvar o workflow.",
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
  try {
    await requireAdministrativeClientAccess(clienteSlug);
  } catch (error) {
    return {
      message: getAccessErrorMessage(error),
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
    try {
      await recordPendingUserLink({
        clienteSlug,
        errorCode: linkError.code,
        errorSummary: "Falha ao vincular o usuário recém-criado ao cliente.",
        role,
        status,
        userId: createdUser.user.id,
      });
    } catch {
      return {
        message:
          "Usuário criado no Auth, mas o vínculo e o registro da pendência falharam. Não houve exclusão ou reassociação automática.",
        type: "error",
      };
    }

    return {
      message:
        "Usuário criado no Auth, mas o vínculo ficou pendente para recuperação. Nenhum usuário foi excluído ou reassociado.",
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
  try {
    await requireAdministrativeClientAccess(clienteSlug);
  } catch {
    return;
  }

  if (!clientUserStatuses.includes(status)) {
    return;
  }

  const supabase = createAdminClient();

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
  try {
    await requireAdministrativeClientAccess(clienteSlug);
  } catch (error) {
    return { ok: false, error: getAccessErrorMessage(error) };
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

export async function retryPendingClientUserLink(
  clienteSlug: string,
  pendingId: string,
) {
  await requireLexiaAdmin();
  await retryPendingUserLinkAsAdmin(clienteSlug, pendingId);
  revalidatePath(`/admin/clientes/${clienteSlug}`);
}
