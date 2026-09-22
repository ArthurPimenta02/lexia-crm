"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export type AgentAdjustmentActionResult = {
  ok: boolean;
  error?: string;
};

const allowedModules = ["geral", "detailing", "venda_veiculo", "indefinido"];

async function getAdminContext() {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || profile.role !== "lexia_admin" || profile.status !== "ativo") {
    return { error: "Acesso não autorizado." };
  }

  return { userId: user.id };
}

function getRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getPriority(formData: FormData) {
  const rawPriority = getRequiredString(formData, "prioridade");
  const priority = Number.parseInt(rawPriority || "0", 10);

  return Number.isFinite(priority) ? priority : Number.NaN;
}

function validateAdjustmentForm(formData: FormData) {
  const clienteSlug = getRequiredString(formData, "cliente_slug");
  const modulo = getRequiredString(formData, "modulo");
  const titulo = getRequiredString(formData, "titulo");
  const gatilho = getRequiredString(formData, "gatilho");
  const comportamentoCorreto = getRequiredString(
    formData,
    "comportamento_correto",
  );
  const prioridade = getPriority(formData);
  const origemFeedbackId = getRequiredString(formData, "origem_feedback_id");

  if (!clienteSlug) {
    return { error: "Cliente obrigatório." };
  }

  if (!allowedModules.includes(modulo)) {
    return { error: "Módulo inválido." };
  }

  if (!titulo) {
    return { error: "Título obrigatório." };
  }

  if (!gatilho) {
    return { error: "Gatilho obrigatório." };
  }

  if (!comportamentoCorreto) {
    return { error: "Comportamento correcto obrigatório." };
  }

  if (!Number.isInteger(prioridade) || prioridade < 0 || prioridade > 100) {
    return { error: "Prioridade deve estar entre 0 e 100." };
  }

  return {
    data: {
      clienteSlug,
      modulo,
      titulo,
      gatilho,
      comportamentoCorreto,
      prioridade,
      activo: formData.get("activo") === "on",
      origemFeedbackId: origemFeedbackId || null,
    },
  };
}

function getRedirectPath(clienteSlug: string, modulo: string, status: string) {
  const params = new URLSearchParams({
    cliente: clienteSlug,
    modulo,
    status,
  });

  return `/admin/ajustes?${params.toString()}`;
}

export async function createAgentAdjustment(formData: FormData) {
  const context = await getAdminContext();

  if (context.error) {
    redirect("/admin/ajustes?status=erro");
  }

  const validated = validateAdjustmentForm(formData);

  if (validated.error) {
    redirect(`/admin/ajustes?status=erro&mensagem=${encodeURIComponent(validated.error)}`);
  }

  const data = validated.data;
  if (!data) {
    redirect("/admin/ajustes?status=erro");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lexia_ajustes_agente").insert({
    cliente_slug: data.clienteSlug,
    modulo: data.modulo,
    titulo: data.titulo,
    gatilho: data.gatilho,
    comportamento_correto: data.comportamentoCorreto,
    prioridade: data.prioridade,
    activo: data.activo,
    origem_feedback_id: data.origemFeedbackId,
    criado_por: context.userId,
    atualizado_por: context.userId,
  });

  if (error) {
    console.error("Erro ao criar ajuste do agente", error);
    redirect("/admin/ajustes?status=erro");
  }

  revalidatePath("/admin/ajustes");
  redirect(getRedirectPath(data.clienteSlug, data.modulo, "criado"));
}

export async function updateAgentAdjustment(
  adjustmentId: string,
  formData: FormData,
) {
  const context = await getAdminContext();

  if (context.error) {
    redirect("/admin/ajustes?status=erro");
  }

  const validated = validateAdjustmentForm(formData);

  if (validated.error) {
    redirect(`/admin/ajustes?status=erro&mensagem=${encodeURIComponent(validated.error)}`);
  }

  const data = validated.data;
  if (!data) {
    redirect("/admin/ajustes?status=erro");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lexia_ajustes_agente")
    .update({
      cliente_slug: data.clienteSlug,
      modulo: data.modulo,
      titulo: data.titulo,
      gatilho: data.gatilho,
      comportamento_correto: data.comportamentoCorreto,
      prioridade: data.prioridade,
      activo: data.activo,
      origem_feedback_id: data.origemFeedbackId,
      atualizado_por: context.userId,
    })
    .eq("id", adjustmentId);

  if (error) {
    console.error("Erro ao actualizar ajuste do agente", error);
    redirect("/admin/ajustes?status=erro");
  }

  revalidatePath("/admin/ajustes");
  redirect(getRedirectPath(data.clienteSlug, data.modulo, "actualizado"));
}

export async function updateAgentAdjustmentStatus(
  adjustmentId: string,
  nextActive: boolean,
): Promise<AgentAdjustmentActionResult> {
  const context = await getAdminContext();

  if (context.error) {
    return { ok: false, error: context.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lexia_ajustes_agente")
    .update({
      activo: nextActive,
      atualizado_por: context.userId,
    })
    .eq("id", adjustmentId);

  if (error) {
    console.error("Erro ao alterar estado do ajuste do agente", error);
    return { ok: false, error: "Não foi possível alterar o ajuste." };
  }

  revalidatePath("/admin/ajustes");

  return { ok: true };
}
