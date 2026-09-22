"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdminHandoffStatus =
  | "pendente"
  | "em_atendimento"
  | "resolvido"
  | "perdido";

const allowedStatuses: AdminHandoffStatus[] = [
  "pendente",
  "em_atendimento",
  "resolvido",
  "perdido",
];

async function isLexiaAdmin() {
  const { profile, user } = await getLoggedInUserProfile();

  return Boolean(user && profile?.role === "lexia_admin");
}

export async function updateAdminHandoffStatus(
  handoffId: string,
  status: AdminHandoffStatus,
) {
  if (!(await isLexiaAdmin()) || !allowedStatuses.includes(status)) {
    throw new Error("Não foi possível atualizar o handoff.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lexia_handoffs")
    .update({ status })
    .eq("id", handoffId);

  if (error) {
    throw new Error("Não foi possível atualizar o status do handoff.");
  }

  revalidatePath("/admin/handoffs");
}

export async function deleteAdminSimulatedHandoff(
  executionId: string,
  clienteSlug: string,
) {
  if (!(await isLexiaAdmin()) || !executionId || !clienteSlug) {
    return {
      ok: false,
      error: "Não foi possível excluir o handoff simulado.",
    };
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

  const { data: execution, error: executionError } = await supabaseAdmin
    .from("lexia_testes_execucoes")
    .select("id")
    .eq("id", executionId)
    .eq("cliente_slug", clienteSlug)
    .eq("rota", "handoff_atendimento")
    .maybeSingle();

  if (executionError || !execution) {
    return { ok: false, error: "Handoff simulado não encontrado." };
  }

  const { error: feedbackError } = await supabaseAdmin
    .from("lexia_feedbacks")
    .delete()
    .eq("cliente_slug", clienteSlug)
    .eq("teste_execucao_id", executionId);

  if (feedbackError) {
    return {
      ok: false,
      error: "Não foi possível excluir feedbacks do simulado.",
    };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("lexia_testes_execucoes")
    .delete()
    .eq("id", executionId)
    .eq("cliente_slug", clienteSlug)
    .eq("rota", "handoff_atendimento");

  if (deleteError) {
    return {
      ok: false,
      error: "Não foi possível excluir o handoff simulado.",
    };
  }

  revalidatePath("/admin/handoffs");
  revalidatePath("/admin/execucoes");
  revalidatePath("/admin/feedbacks");
  revalidatePath(`/admin/clientes/${clienteSlug}`);

  return { ok: true };
}
