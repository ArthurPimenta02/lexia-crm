import "server-only";

import {
  requireAdministrativeClientAccess,
  requireClientPanelAccess,
  requireLexiaAdmin,
  requireOperationalClientAccess,
} from "@/lib/auth/access-context";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  buildTestWorkflowPayload,
  parseWorkflowAllowedHosts,
  toWorkflowAdminSummary,
  toWorkflowPublic,
  validateWorkflowWebhookUrl,
  type WorkflowAdminSummary,
  type WorkflowPublic,
  type WorkflowRowWithDestination,
} from "./contracts";

type WorkflowWriteInput = {
  clienteSlug: string;
  nome: string;
  status: string;
  tipo: string;
  webhookUrl: string;
};

type TestDispatchInput = {
  clienteSlug?: string;
  message: string;
  origin: "painel_admin" | "painel_cliente";
  sessionId: string;
  workflowId: string;
};

const workflowStatuses = new Set(["ativo", "inativo", "teste"]);

function getAllowedDestination(value: string) {
  return validateWorkflowWebhookUrl(
    value,
    parseWorkflowAllowedHosts(process.env.LEXIA_WORKFLOW_ALLOWED_HOSTS),
    { allowLocalHttp: process.env.NODE_ENV !== "production" },
  );
}

function normalizeWorkflowWrite(input: WorkflowWriteInput) {
  const nome = input.nome.trim();
  const tipo = input.tipo.trim();
  const status = input.status.trim();

  if (!nome || !tipo || !workflowStatuses.has(status)) {
    throw new Error("Preencha nome, tipo e status válidos para o workflow.");
  }

  return {
    cliente_slug: input.clienteSlug,
    nome,
    status,
    tipo,
  };
}

async function loadWorkflowRows(clienteSlug: string, onlyActive = false) {
  const admin = createAdminClient();
  let query = admin
    .from("lexia_workflows")
    .select("id, cliente_slug, nome, tipo, status, webhook_url")
    .eq("cliente_slug", clienteSlug)
    .order("nome");

  if (onlyActive) query = query.eq("status", "ativo");

  const { data, error } = await query;

  if (error) throw new Error("Não foi possível buscar os workflows.");

  return (data ?? []) as WorkflowRowWithDestination[];
}

export async function listClientTestWorkflows(): Promise<WorkflowPublic[]> {
  const context = await requireClientPanelAccess();
  const rows = await loadWorkflowRows(context.clienteSlug, true);

  return rows.map(toWorkflowPublic);
}

export async function listAdminTestWorkflows(
  clienteSlug: string,
): Promise<WorkflowPublic[]> {
  const context = await requireAdministrativeClientAccess(clienteSlug);
  const rows = await loadWorkflowRows(context.clienteSlug, true);

  return rows.map(toWorkflowPublic);
}

export async function listAdminWorkflowConfigurations(
  clienteSlug: string,
): Promise<WorkflowAdminSummary[]> {
  const context = await requireAdministrativeClientAccess(clienteSlug);
  const rows = await loadWorkflowRows(context.clienteSlug);

  return rows.map(toWorkflowAdminSummary);
}

export async function createWorkflowAsAdmin(input: WorkflowWriteInput) {
  await requireLexiaAdmin();
  await requireAdministrativeClientAccess(input.clienteSlug);

  const destination = getAllowedDestination(input.webhookUrl.trim());
  const admin = createAdminClient();
  const { error } = await admin.from("lexia_workflows").insert({
    ...normalizeWorkflowWrite(input),
    webhook_url: destination,
  });

  if (error) throw new Error("Não foi possível criar o workflow.");
}

export async function updateWorkflowAsAdmin(
  workflowId: string,
  input: WorkflowWriteInput,
) {
  await requireLexiaAdmin();
  await requireAdministrativeClientAccess(input.clienteSlug);

  const admin = createAdminClient();
  const payload: Record<string, string> = normalizeWorkflowWrite(input);
  const newDestination = input.webhookUrl.trim();

  if (newDestination) {
    payload.webhook_url = getAllowedDestination(newDestination);
  }

  const { data, error } = await admin
    .from("lexia_workflows")
    .update(payload)
    .eq("id", workflowId)
    .eq("cliente_slug", input.clienteSlug)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Não foi possível atualizar o workflow.");
  }
}

export async function dispatchTestWorkflow(input: TestDispatchInput) {
  const message = input.message.trim();

  if (!message || !input.sessionId || !input.workflowId) {
    throw new Error("Mensagem, sessão e workflow são obrigatórios.");
  }

  const context =
    input.origin === "painel_admin"
      ? await requireOperationalClientAccess(input.clienteSlug)
      : await requireClientPanelAccess();
  const admin = createAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("lexia_testes_sessoes")
    .select("session_id")
    .eq("cliente_slug", context.clienteSlug)
    .eq("session_id", input.sessionId)
    .eq("origem", input.origin)
    .maybeSingle();

  if (sessionError || !session) {
    throw new Error("Sessão de teste não encontrada.");
  }

  const { data, error } = await admin
    .from("lexia_workflows")
    .select("id, cliente_slug, nome, tipo, status, webhook_url")
    .eq("id", input.workflowId)
    .eq("cliente_slug", context.clienteSlug)
    .eq("status", "ativo")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Workflow ativo não encontrado para este cliente.");
  }

  const workflow = data as WorkflowRowWithDestination;
  if (!workflow.webhook_url) {
    throw new Error("O workflow selecionado não possui destino configurado.");
  }

  const destination = getAllowedDestination(workflow.webhook_url);
  const runId = crypto.randomUUID();
  const response = await fetch(destination, {
    body: JSON.stringify(
      buildTestWorkflowPayload({
        message,
        origin: input.origin,
        runId,
        sessionId: input.sessionId,
        workflow,
      }),
    ),
    headers: { "content-type": "application/json" },
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error("O workflow não confirmou o recebimento da mensagem.");
  }

  return { runId };
}
