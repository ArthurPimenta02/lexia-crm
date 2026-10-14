"use server";

import { redirect } from "next/navigation";

import { requireLexiaAdmin } from "@/lib/auth/access-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createWorkflowAsAdmin } from "@/lib/workflows/private-config";

export type NewClientState = {
  message: string | null;
};

const clientStatuses = ["ativo", "inativo", "suspenso"];
const workflowStatuses = ["ativo", "inativo", "teste"];

function getValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function createClientAction(
  _state: NewClientState,
  formData: FormData,
): Promise<NewClientState> {
  try {
    await requireLexiaAdmin();
  } catch {
    return { message: "Acesso não autorizado." };
  }

  const nome = getValue(formData, "nome");
  const slug = normalizeSlug(getValue(formData, "slug"));
  const status = getValue(formData, "status");
  const modoTeste = formData.get("modo_teste") === "on";
  const corPrincipal = getValue(formData, "cor_principal");
  const criarWorkflow = formData.get("criar_workflow") === "on";
  const workflowNome = getValue(formData, "workflow_nome");
  const workflowTipo = getValue(formData, "workflow_tipo");
  const webhookUrl = getValue(formData, "webhook_url");
  const workflowStatus = getValue(formData, "workflow_status");

  if (!nome || !slug) {
    return { message: "Nome e slug são obrigatórios." };
  }

  if (!clientStatuses.includes(status)) {
    return { message: "Status do cliente inválido." };
  }

  if (criarWorkflow && !workflowStatuses.includes(workflowStatus)) {
    return { message: "Status do workflow inválido." };
  }

  if (criarWorkflow && (!workflowNome || !workflowTipo || !webhookUrl)) {
    return {
      message: "Preencha nome, tipo e URL para criar o workflow inicial.",
    };
  }

  const supabase = createAdminClient();
  const { data: existingClient, error: lookupError } = await supabase
    .from("lexia_clientes")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (lookupError) {
    return { message: "Não foi possível validar o slug." };
  }

  if (existingClient) {
    return { message: "Já existe um cliente com este slug." };
  }

  const { error: clientError } = await supabase.from("lexia_clientes").insert({
    nome,
    slug,
    status,
    modo_teste: modoTeste,
    cor_principal: corPrincipal || null,
  });

  if (clientError) {
    return { message: "Não foi possível criar o cliente." };
  }

  if (criarWorkflow) {
    try {
      await createWorkflowAsAdmin({
        clienteSlug: slug,
        nome: workflowNome,
        status: workflowStatus,
        tipo: workflowTipo,
        webhookUrl,
      });
    } catch {
      return {
        message:
          "Cliente criado, mas não foi possível criar o workflow inicial.",
      };
    }
  }

  redirect(`/admin/clientes/${slug}`);
}
