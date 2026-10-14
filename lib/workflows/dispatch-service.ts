import {
  buildTestWorkflowPayload,
  type WorkflowRowWithDestination,
} from "./contracts";

export type TestDispatchInput = {
  clienteSlug?: string;
  message: string;
  origin: "painel_admin" | "painel_cliente";
  sessionId: string;
  workflowId: string;
};

type DispatchContext = {
  clienteSlug: string;
};

export type TestWorkflowDispatchDependencies = {
  createRunId: () => string;
  findSession: (input: {
    clienteSlug: string;
    origin: TestDispatchInput["origin"];
    sessionId: string;
  }) => Promise<boolean>;
  findWorkflow: (input: {
    clienteSlug: string;
    workflowId: string;
  }) => Promise<WorkflowRowWithDestination | null>;
  postWebhook: (
    destination: string,
    init: RequestInit,
  ) => Promise<{ ok: boolean }>;
  requireActiveAdminClient: (clienteSlug: string) => Promise<DispatchContext>;
  requireClientPanel: () => Promise<DispatchContext>;
  validateDestination: (value: string) => string;
};

export async function dispatchTestWorkflowWithDependencies(
  input: TestDispatchInput,
  dependencies: TestWorkflowDispatchDependencies,
) {
  const message = input.message.trim();

  if (!message || !input.sessionId || !input.workflowId) {
    throw new Error("Mensagem, sessão e workflow são obrigatórios.");
  }

  const context =
    input.origin === "painel_admin"
      ? await dependencies.requireActiveAdminClient(
          String(input.clienteSlug ?? ""),
        )
      : await dependencies.requireClientPanel();

  const sessionExists = await dependencies.findSession({
    clienteSlug: context.clienteSlug,
    origin: input.origin,
    sessionId: input.sessionId,
  });

  if (!sessionExists) {
    throw new Error("Sessão de teste não encontrada.");
  }

  const workflow = await dependencies.findWorkflow({
    clienteSlug: context.clienteSlug,
    workflowId: input.workflowId,
  });

  if (!workflow) {
    throw new Error("Workflow ativo não encontrado para este cliente.");
  }

  if (!workflow.webhook_url) {
    throw new Error("O workflow selecionado não possui destino configurado.");
  }

  const destination = dependencies.validateDestination(workflow.webhook_url);
  const runId = dependencies.createRunId();
  const response = await dependencies.postWebhook(destination, {
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
