import assert from "node:assert/strict";
import test from "node:test";

import {
  AnalystCallbackHttpError,
  createAnalystCallbackHandler,
  type AnalystCallbackFinalizeOutcome,
} from "../lib/analyst/callback-handler";
import { isValidBearerAuthorization } from "../lib/analyst/webhook-auth";

const secret = "test-only-secret-with-at-least-32-characters";

function callbackRequest(
  body: Record<string, unknown>,
  authorization = `Bearer ${secret}`,
) {
  return new Request("https://app.example.invalid/api/analista/n8n/callback", {
    body: JSON.stringify(body),
    headers: {
      authorization,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

function createDependencies(options: {
  executionStatus?: "iniciada" | "concluida" | "erro";
  outcome?: AnalystCallbackFinalizeOutcome;
} = {}) {
  const effects = {
    finalizations: [] as Array<Record<string, unknown>>,
    resolutions: 0,
    sourceResolutions: 0,
  };

  return {
    dependencies: {
      assertAuthorized(request: Request) {
        if (
          !isValidBearerAuthorization(
            request.headers.get("authorization"),
            secret,
          )
        ) {
          throw new AnalystCallbackHttpError("Integração não autorizada.", 401);
        }
      },
      async finalize(input: Record<string, unknown>) {
        effects.finalizations.push(input);
        return options.outcome ?? ("finalizada" as const);
      },
      getAnswerMessageId: () => "00000000-0000-5000-8000-000000000001",
      isToolName: (value: string) =>
        ["obter_cobertura", "listar_conversas"].includes(value),
      now: () => Date.parse("2026-10-04T12:00:01.000Z"),
      async resolveExecution() {
        effects.resolutions += 1;
        return {
          execution: {
            criado_em: "2026-10-04T12:00:00.000Z",
            status: options.executionStatus ?? ("iniciada" as const),
          },
          scope: { clienteSlug: "cliente_a" },
        };
      },
      async resolveSources(_scope: unknown, sources: unknown[]) {
        effects.sourceResolutions += 1;
        return sources;
      },
    },
    effects,
  };
}

test("callback rejects an invalid Bearer token without side effects", async () => {
  const { dependencies, effects } = createDependencies();
  const handler = createAnalystCallbackHandler(dependencies);
  const response = await handler(
    callbackRequest(
      {
        answer: "Resposta",
        execution_id: "execution-a",
        status: "completed",
      },
      "Bearer invalid-token",
    ),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Integração não autorizada.",
    ok: false,
  });
  assert.deepEqual(effects, {
    finalizations: [],
    resolutions: 0,
    sourceResolutions: 0,
  });
});

test("authenticated callback finalizes once with bounded server data", async () => {
  const { dependencies, effects } = createDependencies();
  const handler = createAnalystCallbackHandler(dependencies);
  const response = await handler(
    callbackRequest({
      answer: "Resposta final",
      execution_id: "execution-a",
      model: "fake-model",
      prompt_version: "fake-v1",
      sources: [{ conversation_id: "conversation-a" }],
      status: "completed",
      tools: ["obter_cobertura", "obter_cobertura", "not-allowed"],
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    execution_id: "execution-a",
    idempotent: false,
    ok: true,
  });
  assert.equal(effects.resolutions, 1);
  assert.equal(effects.sourceResolutions, 1);
  assert.equal(effects.finalizations.length, 1);
  assert.deepEqual(effects.finalizations[0], {
    durationMs: 1000,
    error: null,
    executionId: "execution-a",
    model: "fake-model",
    promptVersion: "fake-v1",
    response: "Resposta final",
    responseId: "00000000-0000-5000-8000-000000000001",
    sources: [{ conversation_id: "conversation-a" }],
    status: "concluida",
    tools: ["obter_cobertura"],
    tokensInput: 10,
    tokensOutput: 20,
  });
});

test("authenticated callback reports an idempotent database repetition", async () => {
  const { dependencies, effects } = createDependencies({ outcome: "repetida" });
  const handler = createAnalystCallbackHandler(dependencies);
  const response = await handler(
    callbackRequest({
      answer: "Resposta final",
      execution_id: "execution-a",
      status: "completed",
    }),
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).idempotent, true);
  assert.equal(effects.finalizations.length, 1);
});

test("completed callbacks never resolve sources or start more tools", async () => {
  const { dependencies, effects } = createDependencies({
    executionStatus: "concluida",
    outcome: "repetida",
  });
  const handler = createAnalystCallbackHandler(dependencies);
  const response = await handler(
    callbackRequest({
      answer: "Resposta final",
      execution_id: "execution-a",
      sources: [{ conversation_id: "must-not-resolve" }],
      status: "completed",
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(effects.sourceResolutions, 0);
  assert.equal(effects.finalizations.length, 1);
  assert.deepEqual(effects.finalizations[0].sources, []);
});

test("conflicting callback returns 409 without changing the final result", async () => {
  const { dependencies, effects } = createDependencies({ outcome: "conflito" });
  const handler = createAnalystCallbackHandler(dependencies);
  const response = await handler(
    callbackRequest({
      answer: "Resposta divergente",
      execution_id: "execution-a",
      status: "completed",
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Esta execução já possui um resultado final diferente.",
    ok: false,
  });
  assert.equal(effects.finalizations.length, 1);
});
