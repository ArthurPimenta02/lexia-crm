"use server";

import { revalidatePath } from "next/cache";

import { requireClientPanelAccess } from "@/lib/auth/access-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HandoffStatus =
  | "pendente"
  | "em_atendimento"
  | "resolvido"
  | "perdido";

const allowedStatuses: HandoffStatus[] = [
  "pendente",
  "em_atendimento",
  "resolvido",
  "perdido",
];

async function getClientSlug() {
  try {
    const context = await requireClientPanelAccess();
    return context.clienteSlug;
  } catch {
    return null;
  }
}

export async function updateHandoffStatus(
  handoffId: string,
  status: HandoffStatus,
) {
  const clienteSlug = await getClientSlug();

  if (!clienteSlug || !allowedStatuses.includes(status)) {
    throw new Error("Não foi possível atualizar o handoff.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lexia_handoffs")
    .update({ status })
    .eq("id", handoffId)
    .eq("cliente_slug", clienteSlug);

  if (error) {
    throw new Error("Não foi possível atualizar o status do handoff.");
  }

  revalidatePath("/app/handoffs");
}

export async function deleteClientSimulatedHandoff(executionId: string) {
  const clienteSlug = await getClientSlug();

  if (!clienteSlug || !executionId) {
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

  revalidatePath("/app/handoffs");
  revalidatePath("/app/execucoes");
  revalidatePath("/app/feedbacks");

  return { ok: true };
}
