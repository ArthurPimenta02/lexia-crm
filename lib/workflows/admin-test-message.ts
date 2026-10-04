import type { TestDispatchInput } from "./dispatch-service";

export type AdminTestMessageResult = {
  data: { runId: string } | null;
  error: string | null;
};

type AdminTestMessageDependencies = {
  dispatch: (input: TestDispatchInput) => Promise<{ runId: string }>;
  getAccessErrorMessage: (error: unknown) => string;
  requireActiveAdminClient: (clienteSlug: string) => Promise<unknown>;
};

export async function executeAdminTestMessage(
  input: {
    clienteSlug: string;
    messageText: string;
    sessionId: string;
    workflowId: string;
  },
  dependencies: AdminTestMessageDependencies,
): Promise<AdminTestMessageResult> {
  try {
    await dependencies.requireActiveAdminClient(input.clienteSlug);
  } catch (error) {
    return {
      data: null,
      error: dependencies.getAccessErrorMessage(error),
    };
  }

  const message = input.messageText.trim();

  if (!input.clienteSlug || !input.sessionId || !message) {
    return { data: null, error: "Digite uma mensagem para enviar." };
  }

  if (!input.workflowId) {
    return { data: null, error: "Selecione um workflow para testar." };
  }

  try {
    const result = await dependencies.dispatch({
      clienteSlug: input.clienteSlug,
      message,
      origin: "painel_admin",
      sessionId: input.sessionId,
      workflowId: input.workflowId,
    });

    return { data: result, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a mensagem ao workflow.",
    };
  }
}
