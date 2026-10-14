import assert from "node:assert/strict";
import test from "node:test";

import {
  ContextConfigurationUnavailableError,
  SimulatedCentralContextConfigStore,
  buildGenericContextAgentSet,
  prepareContextAgentCall,
  runSimulatedContextStage,
  type ContextMemoryEntry,
} from "../lib/omnichannel/context-config";
import type {
  CanonicalMessage,
  ContextAgentConfig,
  ContextResult,
  OmnichannelScope,
} from "../lib/omnichannel/contracts";
import { buildBrainRequest } from "../lib/omnichannel/brain-boundary";
import { validateContextResult } from "../lib/omnichannel/operational-context";

const scopeA: OmnichannelScope = {
  environment: "isolated_test",
  cliente_slug: "empresa_sintetica_a",
  channel: "whatsapp",
  account_ref: "11111111-1111-4111-8111-111111111111",
  conversation_ref: "conversation-shared-001",
};

const scopeB: OmnichannelScope = {
  environment: "isolated_test",
  cliente_slug: "empresa_sintetica_b",
  channel: "instagram",
  account_ref: "22222222-2222-4222-8222-222222222222",
  conversation_ref: "conversation-shared-001",
};

function config(
  scope: OmnichannelScope,
  marker: "A" | "B",
): ContextAgentConfig {
  return {
    schema_version: "lexia.context.agent.config.v1",
    environment: scope.environment,
    cliente_slug: scope.cliente_slug,
    config_version: `context-${marker.toLowerCase()}-v1`,
    status: "active",
    prompt_template: `PROMPT_${marker}_ONLY`,
    common_schema_version: "lexia.context.result.v1",
    company_fields_schema: {
      type: "object",
      additionalProperties: false,
      required: [`field_${marker.toLowerCase()}`],
      properties: {
        [`field_${marker.toLowerCase()}`]: { type: "string" },
      },
    },
    locale: "pt-BR",
    timezone: marker === "A" ? "America/Sao_Paulo" : "Europe/Lisbon",
    model_policy_ref: "fake-context-policy-v1",
  };
}

function message(scope: OmnichannelScope, marker: string): CanonicalMessage {
  return {
    schema_version: "lexia.message.v1",
    event_id: `${marker}0000000-0000-4000-8000-000000000001`,
    provider_event_id: "provider-event-shared",
    message_id: "message-shared",
    scope,
    author: "lead",
    direction: "inbound",
    occurred_at: "2026-10-08T12:00:00.000Z",
    text: `message-${marker}`,
  };
}

test("interleaved context calls use only the exact tenant prompt and memory", async () => {
  const store = new SimulatedCentralContextConfigStore([
    config(scopeA, "A"),
    config(scopeB, "B"),
  ]);
  const memoryA: ContextMemoryEntry[] = [
    { scope: scopeA, key: "memory", value: "A_ONLY" },
  ];
  const memoryB: ContextMemoryEntry[] = [
    { scope: scopeB, key: "memory", value: "B_ONLY" },
  ];

  const [callA1, callB, callA2] = await Promise.all([
    prepareContextAgentCall({
      scope: scopeA,
      contextCallId: "aaaaaaaa-0000-4000-8000-000000000101",
      store,
      messages: [message(scopeA, "a")],
      memory: memoryA,
    }),
    prepareContextAgentCall({
      scope: scopeB,
      contextCallId: "bbbbbbbb-0000-4000-8000-000000000101",
      store,
      messages: [message(scopeB, "b")],
      memory: memoryB,
    }),
    prepareContextAgentCall({
      scope: scopeA,
      contextCallId: "aaaaaaaa-0000-4000-8000-000000000102",
      store,
      messages: [message(scopeA, "c")],
      memory: memoryA,
    }),
  ]);

  assert.equal(callA1.prompt_template, "PROMPT_A_ONLY");
  assert.equal(callA2.prompt_template, "PROMPT_A_ONLY");
  assert.equal(callB.prompt_template, "PROMPT_B_ONLY");
  assert.equal(callA1.memory[0]?.value, "A_ONLY");
  assert.equal(callB.memory[0]?.value, "B_ONLY");
  assert.equal(store.lookups.length, 3);
});

test("missing or duplicate configuration fails closed without tenant fallback", async () => {
  const onlyA = new SimulatedCentralContextConfigStore([config(scopeA, "A")]);
  let agentCalls = 0;
  await assert.rejects(
    runSimulatedContextStage({
      scope: scopeB,
      contextCallId: "bbbbbbbb-0000-4000-8000-000000000102",
      store: onlyA,
      messages: [message(scopeB, "b")],
      memory: [],
      invoke: async () => {
        agentCalls += 1;
        return "must-not-run";
      },
    }),
    (error: unknown) =>
      error instanceof ContextConfigurationUnavailableError &&
      error.code === "context_config_unavailable",
  );
  assert.equal(agentCalls, 0);

  const duplicateA = new SimulatedCentralContextConfigStore([
    config(scopeA, "A"),
    { ...config(scopeA, "A"), config_version: "context-a-v2" },
  ]);
  await assert.rejects(
    prepareContextAgentCall({
      scope: scopeA,
      contextCallId: "aaaaaaaa-0000-4000-8000-000000000103",
      store: duplicateA,
      messages: [message(scopeA, "a")],
      memory: [],
    }),
    ContextConfigurationUnavailableError,
  );
});

test("one context-agent invocation rejects messages or memory from another tenant", async () => {
  const store = new SimulatedCentralContextConfigStore([config(scopeA, "A")]);

  await assert.rejects(
    prepareContextAgentCall({
      scope: scopeA,
      contextCallId: "aaaaaaaa-0000-4000-8000-000000000104",
      store,
      messages: [message(scopeB, "b")],
      memory: [],
    }),
    /another scope/,
  );

  await assert.rejects(
    prepareContextAgentCall({
      scope: scopeA,
      contextCallId: "aaaaaaaa-0000-4000-8000-000000000105",
      store,
      messages: [message(scopeA, "a")],
      memory: [{ scope: scopeB, key: "wrong", value: "B_ONLY" }],
    }),
    /another scope/,
  );
});

test("company fields are validated by the selected tenant schema", () => {
  const contextInput = buildGenericContextAgentSet({
    scope: scopeA,
    contextCallId: "aaaaaaaa-0000-4000-8000-000000000106",
    config: config(scopeA, "A"),
    messages: [message(scopeA, "a")],
    memory: [],
  });
  const result: ContextResult = {
    schema_version: "lexia.context.result.v1",
    scope: scopeA,
    context_call_id: contextInput.context_call_id,
    config_version: "context-a-v1",
    source_message_ids: ["message-shared"],
    operational_context: {
      summary: "Synthetic summary",
      language: "pt-BR",
      intent: "learn",
      topic: { current: "alpha", changed: false, resumed_previous: false },
      confidence: 0.9,
      missing_information: [],
      contact_updates: {},
      scheduling_intent: {},
    },
    company_fields: { field_a: "alpha" },
  };

  assert.deepEqual(validateContextResult(result, contextInput), result);
  assert.throws(
    () =>
      validateContextResult(
        { ...result, company_fields: { field_b: "cross-tenant" } },
        contextInput,
      ),
    /not allowed|required/,
  );
});

test("context output cannot be exchanged across calls, conversations or tenants", () => {
  const otherConversation = {
    ...scopeA,
    conversation_ref: "conversation-other-002",
  } satisfies OmnichannelScope;
  const sourceMessage = message(scopeA, "a");
  const context: ContextResult = {
    schema_version: "lexia.context.result.v1",
    scope: scopeA,
    context_call_id: "aaaaaaaa-0000-4000-8000-000000000107",
    config_version: "shared-config-v1",
    source_message_ids: [sourceMessage.message_id],
    operational_context: {
      summary: "Synthetic summary",
      language: "pt-BR",
      intent: "learn",
      topic: { current: "alpha", changed: false, resumed_previous: false },
      confidence: 0.9,
      missing_information: [],
      contact_updates: {},
      scheduling_intent: {},
    },
    company_fields: {},
  };
  const common = {
    invocationId: "aaaaaaaa-0000-4000-8000-000000000108",
    correlationId: "aaaaaaaa-0000-4000-8000-000000000109",
    state: { state_version: 0, delivery_epoch: 0 },
    contact: {},
    context,
    contextCallId: context.context_call_id,
    contextConfigVersion: "shared-config-v1",
    policy: {},
    capabilities: [],
  } as const;

  assert.doesNotThrow(() =>
    buildBrainRequest({ ...common, scope: scopeA, messages: [sourceMessage] }),
  );
  assert.throws(
    () =>
      buildBrainRequest({
        ...common,
        scope: otherConversation,
        messages: [message(otherConversation, "c")],
      }),
    /another scope/,
  );
  assert.throws(
    () =>
      buildBrainRequest({
        ...common,
        scope: scopeB,
        messages: [message(scopeB, "b")],
      }),
    /another scope/,
  );
  assert.throws(
    () =>
      buildBrainRequest({
        ...common,
        scope: scopeA,
        messages: [sourceMessage],
        contextCallId: "aaaaaaaa-0000-4000-8000-000000000110",
      }),
    /another context call/,
  );
  assert.throws(
    () =>
      buildBrainRequest({
        ...common,
        scope: scopeA,
        messages: [{ ...sourceMessage, message_id: "different-message" }],
      }),
    /source messages/,
  );
});

test("company schema rejects missing, mistyped, extra and unsupported rules", () => {
  const contextInput = buildGenericContextAgentSet({
    scope: scopeA,
    contextCallId: "aaaaaaaa-0000-4000-8000-000000000111",
    config: {
      ...config(scopeA, "A"),
      company_fields_schema: {
        type: "object",
        additionalProperties: false,
        required: ["field_a"],
        properties: {
          field_a: { type: "string", minLength: 2 },
        },
      },
    },
    messages: [message(scopeA, "a")],
    memory: [],
  });
  const base: ContextResult = {
    schema_version: "lexia.context.result.v1",
    scope: scopeA,
    context_call_id: contextInput.context_call_id,
    config_version: contextInput.config_version,
    source_message_ids: ["message-shared"],
    operational_context: {
      summary: "Synthetic",
      language: "pt-BR",
      intent: "learn",
      topic: { current: "alpha", changed: false, resumed_previous: false },
      confidence: 0.8,
      missing_information: [],
      contact_updates: {},
      scheduling_intent: {},
    },
    company_fields: { field_a: "ok" },
  };

  assert.doesNotThrow(() => validateContextResult(base, contextInput));
  assert.throws(
    () => validateContextResult({ ...base, company_fields: {} }, contextInput),
    /required/,
  );
  assert.throws(
    () =>
      validateContextResult(
        { ...base, company_fields: { field_a: 10 } },
        contextInput,
      ),
    /type string/,
  );
  assert.throws(
    () =>
      validateContextResult(
        { ...base, company_fields: { field_a: "ok", extra: true } },
        contextInput,
      ),
    /not allowed/,
  );

  const unsupportedInput = {
    ...contextInput,
    company_fields_schema: {
      type: "object",
      unsupportedRule: true,
    },
  };
  assert.throws(
    () => validateContextResult(base, unsupportedInput),
    /unsupported schema keyword/,
  );
});
