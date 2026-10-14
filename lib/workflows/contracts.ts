export type WorkflowPublic = {
  id: string;
  nome: string | null;
  tipo: string | null;
  status: string | null;
};

export type WorkflowAdminSummary = WorkflowPublic & {
  webhookConfigured: boolean;
};

export type WorkflowRowWithDestination = WorkflowPublic & {
  cliente_slug: string;
  webhook_url: string | null;
};

export class WorkflowConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowConfigurationError";
  }
}

export function parseWorkflowAllowedHosts(value: string | undefined) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function validateWorkflowWebhookUrl(
  value: string,
  allowedHosts: ReadonlySet<string>,
  options: { allowLocalHttp?: boolean } = {},
) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new WorkflowConfigurationError("A URL do workflow é inválida.");
  }

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const validProtocol =
    url.protocol === "https:" ||
    (Boolean(options.allowLocalHttp) && isLocal && url.protocol === "http:");

  if (!validProtocol) {
    throw new WorkflowConfigurationError("A URL do workflow precisa usar HTTPS.");
  }

  if (url.username || url.password) {
    throw new WorkflowConfigurationError(
      "A URL do workflow não pode conter credenciais.",
    );
  }

  if (!isLocal && url.port) {
    throw new WorkflowConfigurationError(
      "A URL do workflow não pode usar uma porta personalizada.",
    );
  }

  if (allowedHosts.size === 0) {
    throw new WorkflowConfigurationError(
      "A lista privada de destinos de workflow não está configurada.",
    );
  }

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new WorkflowConfigurationError(
      "O destino informado não está autorizado para workflows.",
    );
  }

  return url.toString();
}

export function toWorkflowPublic(
  row: Pick<WorkflowRowWithDestination, "id" | "nome" | "tipo" | "status">,
): WorkflowPublic {
  return {
    id: row.id,
    nome: row.nome,
    status: row.status,
    tipo: row.tipo,
  };
}

export function toWorkflowAdminSummary(
  row: WorkflowRowWithDestination,
): WorkflowAdminSummary {
  return {
    ...toWorkflowPublic(row),
    webhookConfigured: Boolean(row.webhook_url?.trim()),
  };
}

export function buildTestWorkflowPayload(input: {
  message: string;
  origin: "painel_admin" | "painel_cliente";
  runId: string;
  sessionId: string;
  workflow: Pick<WorkflowPublic, "id" | "tipo">;
}) {
  return {
    lexia_modo_teste: true,
    lexia_origem: input.origin,
    lexia_run_id: input.runId,
    lexia_session_id: input.sessionId,
    lexia_teste_id: "",
    lexia_workflow_id: input.workflow.id,
    lexia_workflow_tipo: input.workflow.tipo ?? "",
    message: {
      text: input.message,
      type: "text",
    },
  };
}
