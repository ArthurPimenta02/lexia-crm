import assert from "node:assert/strict";
import test from "node:test";

import { executeAdminTestMessage } from "../lib/workflows/admin-test-message";
import { dispatchTestWorkflowWithDependencies } from "../lib/workflows/dispatch-service";

test("admin Server Action core denies a client before dispatching", async () => {
  let dispatchCalls = 0;

  const result = await executeAdminTestMessage(
    {
      clienteSlug: "cliente_a",
      messageText: "Teste administrativo",
      sessionId: "admin-session-known-to-client",
      workflowId: "workflow-a",
    },
    {
      dispatch: async () => {
        dispatchCalls += 1;
        return { runId: "must-not-exist" };
      },
      getAccessErrorMessage: () =>
        "Acesso restrito à administração da Lexia.",
      requireActiveAdminClient: async () => {
        throw new Error("client profile is not a Lexia admin");
      },
    },
  );

  assert.deepEqual(result, {
    data: null,
    error: "Acesso restrito à administração da Lexia.",
  });
  assert.equal(dispatchCalls, 0);
});

test("admin workflow dispatch denies before session lookup or webhook", async () => {
  const effects = {
    sessionLookups: 0,
    webhookCalls: 0,
    workflowLookups: 0,
  };

  await assert.rejects(
    dispatchTestWorkflowWithDependencies(
      {
        clienteSlug: "cliente_a",
        message: "Teste administrativo",
        origin: "painel_admin",
        sessionId: "admin-session-known-to-client",
        workflowId: "workflow-a",
      },
      {
        createRunId: () => "must-not-exist",
        findSession: async () => {
          effects.sessionLookups += 1;
          return true;
        },
        findWorkflow: async () => {
          effects.workflowLookups += 1;
          return {
            cliente_slug: "cliente_a",
            id: "workflow-a",
            nome: "Workflow A",
            status: "ativo",
            tipo: "whatsapp",
            webhook_url: "https://hooks.example.invalid/admin",
          };
        },
        postWebhook: async () => {
          effects.webhookCalls += 1;
          return { ok: true };
        },
        requireActiveAdminClient: async () => {
          throw new Error("Acesso restrito à administração da Lexia.");
        },
        requireClientPanel: async () => ({ clienteSlug: "cliente_a" }),
        validateDestination: (value) => value,
      },
    ),
    /Acesso restrito à administração da Lexia/,
  );

  assert.deepEqual(effects, {
    sessionLookups: 0,
    webhookCalls: 0,
    workflowLookups: 0,
  });
});

test("authorized admin dispatch uses the validated tenant and fake webhook", async () => {
  const postedBodies: Array<Record<string, unknown>> = [];

  const result = await dispatchTestWorkflowWithDependencies(
    {
      clienteSlug: "cliente_a",
      message: "  Olá  ",
      origin: "painel_admin",
      sessionId: "session-a",
      workflowId: "workflow-a",
    },
    {
      createRunId: () => "run-a",
      findSession: async (input) => {
        assert.deepEqual(input, {
          clienteSlug: "cliente_a",
          origin: "painel_admin",
          sessionId: "session-a",
        });
        return true;
      },
      findWorkflow: async () => ({
        cliente_slug: "cliente_a",
        id: "workflow-a",
        nome: "Workflow A",
        status: "ativo",
        tipo: "whatsapp",
        webhook_url: "https://hooks.example.invalid/admin",
      }),
      postWebhook: async (destination, init) => {
        assert.equal(destination, "https://hooks.example.invalid/admin");
        postedBodies.push(
          JSON.parse(String(init.body)) as Record<string, unknown>,
        );
        return { ok: true };
      },
      requireActiveAdminClient: async () => ({ clienteSlug: "cliente_a" }),
      requireClientPanel: async () => {
        throw new Error("client authorization must not run");
      },
      validateDestination: (value) => value,
    },
  );

  assert.deepEqual(result, { runId: "run-a" });
  assert.equal(postedBodies.length, 1);
  const postedBody = postedBodies[0];
  assert.equal(postedBody?.lexia_origem, "painel_admin");
  assert.deepEqual(postedBody?.message, { text: "Olá", type: "text" });
});
