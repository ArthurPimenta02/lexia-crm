import "server-only";

import {
  requireActiveAdministrativeClientAccess,
  requireAdministrativeClientAccess,
  requireClientPanelAccess,
  requireLexiaAdmin,
} from "@/lib/auth/access-context";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  parseWorkflowAllowedHosts,
  toWorkflowAdminSummary,
  toWorkflowPublic,
  validateWorkflowWebhookUrl,
  type WorkflowAdminSummary,
  type WorkflowPublic,
  type WorkflowRowWithDestination,
} from "./contracts";
import {
  dispatchTestWorkflowWithDependencies,
  type TestDispatchInput,
} from "./dispatch-service";

type WorkflowWriteInput = {
  clienteSlug: string;
  nome: string;
  status: string;
  tipo: string;
  webhookUrl: string;
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
  return dispatchTestWorkflowWithDependencies(input, {
    createRunId: () => crypto.randomUUID(),
    findSession: async ({ clienteSlug, origin, sessionId }) => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("lexia_testes_sessoes")
        .select("session_id")
        .eq("cliente_slug", clienteSlug)
        .eq("session_id", sessionId)
        .eq("origem", origin)
        .maybeSingle();

      return !error && Boolean(data);
    },
    findWorkflow: async ({ clienteSlug, workflowId }) => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("lexia_workflows")
        .select("id, cliente_slug, nome, tipo, status, webhook_url")
        .eq("id", workflowId)
        .eq("cliente_slug", clienteSlug)
        .eq("status", "ativo")
        .maybeSingle();

      return error ? null : (data as WorkflowRowWithDestination | null);
    },
    postWebhook: (destination, init) => fetch(destination, init),
    requireActiveAdminClient: async (clienteSlug) => {
      const context =
        await requireActiveAdministrativeClientAccess(clienteSlug);
      return { clienteSlug: context.clienteSlug };
    },
    requireClientPanel: async () => {
      const context = await requireClientPanelAccess();
      return { clienteSlug: context.clienteSlug };
    },
    validateDestination: getAllowedDestination,
  });
}
