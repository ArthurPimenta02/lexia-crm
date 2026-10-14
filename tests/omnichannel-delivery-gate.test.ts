import assert from "node:assert/strict";
import test from "node:test";

import type { OmnichannelScope, OutboundAction } from "../lib/omnichannel/contracts";
import {
  createDeliveryPlan,
  executeDeliveryPlan,
  prepareDeterministicDeliveryRetry,
  reconcileUnknownDelivery,
} from "../lib/omnichannel/delivery-plan";
import { FakeProviderSendAdapter } from "../lib/omnichannel/fake-adapters";
import {
  createConversationState,
  recordHumanIntervention,
  type ConversationState,
} from "../lib/omnichannel/state-machine";

const scope: OmnichannelScope = {
  environment: "isolated_test",
  cliente_slug: "empresa_sintetica_a",
  channel: "whatsapp",
  account_ref: "11111111-1111-4111-8111-111111111111",
  conversation_ref: "conversation-delivery-001",
};

function actions(state: ConversationState, count: number): OutboundAction[] {
  return Array.from({ length: count }, (_, index) => ({
    schema_version: "lexia.outbound.action.v1",
    action_id: `aaaaaaaa-0000-4000-8000-${String(index + 40).padStart(12, "0")}`,
    invocation_id: "aaaaaaaa-0000-4000-8000-000000000039",
    scope,
    sequence: index + 1,
    kind: "reply",
    captured_state: {
      state_version: state.stateVersion,
      delivery_epoch: state.deliveryEpoch,
    },
    content: { type: "text", text: `Synthetic action ${index + 1}` },
  }));
}

test("permission is loaded again before every ordered send", async () => {
  const state = createConversationState(scope);
  const plan = createDeliveryPlan(actions(state, 3));
  const adapter = new FakeProviderSendAdapter(
    Object.fromEntries(
      plan.items.map((item, index) => [
        item.action.action_id,
        { status: "sent" as const, providerMessageId: `provider-${index + 1}` },
      ]),
    ),
  );
  let stateLoads = 0;

  const result = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => {
      stateLoads += 1;
      return state;
    },
    send: (action) => adapter.send(action),
    now: () => "2026-10-08T12:00:00.000Z",
  });

  assert.equal(stateLoads, 3);
  assert.equal(adapter.calls.length, 3);
  assert.deepEqual(result.items.map((item) => item.status), ["sent", "sent", "sent"]);
});

test("delivery plans reject duplicate or non-contiguous ordering", () => {
  const state = createConversationState(scope);
  const base = actions(state, 2);
  assert.throws(
    () => createDeliveryPlan([base[0]!, { ...base[1]!, sequence: 3 }]),
    /contiguous/,
  );
  assert.throws(
    () =>
      createDeliveryPlan([
        base[0]!,
        { ...base[1]!, action_id: base[0]!.action_id },
      ]),
    /unique/,
  );
});

test("an image and supported caption remain one atomic ordered action", () => {
  const state = createConversationState(scope);
  const imageAction: OutboundAction = {
    ...actions(state, 1)[0]!,
    content: {
      type: "image",
      media_ref: "fake-image-ref",
      caption: "Synthetic caption",
    },
  };
  const plan = createDeliveryPlan([imageAction]);

  assert.equal(plan.items.length, 1);
  assert.deepEqual(plan.items[0]?.action.content, imageAction.content);
});

test("human intervention between actions suppresses the remaining prepared response", async () => {
  let state = createConversationState(scope);
  const plan = createDeliveryPlan(actions(state, 2));
  const adapter = new FakeProviderSendAdapter({
    [plan.items[0]!.action.action_id]: {
      status: "sent",
      providerMessageId: "provider-first",
    },
    [plan.items[1]!.action.action_id]: {
      status: "sent",
      providerMessageId: "must-not-send",
    },
  });

  const result = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => state,
    send: async (action) => {
      const delivery = await adapter.send(action);
      state = recordHumanIntervention(state, {
        commandId: "human-during-delivery",
        occurredAt: "2026-10-08T12:00:01.000Z",
        durationMs: 30 * 60 * 1000,
        messageId: "human-message-during-delivery",
      }).state;
      return delivery;
    },
    now: () => "2026-10-08T12:00:02.000Z",
  });

  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(result.items.map((item) => item.status), ["sent", "suppressed"]);
  assert.equal(result.items[1]?.reason, "state_changed");
});

test("partial deterministic failure keeps sent actions and resumes explicitly", async () => {
  const state = createConversationState(scope);
  const plan = createDeliveryPlan(actions(state, 3));
  const firstAdapter = new FakeProviderSendAdapter({
    [plan.items[0]!.action.action_id]: { status: "sent", providerMessageId: "provider-1" },
    [plan.items[1]!.action.action_id]: { status: "failed", reason: "fake_rejected" },
    [plan.items[2]!.action.action_id]: { status: "sent", providerMessageId: "must-not-send" },
  });

  const partial = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => state,
    send: (action) => firstAdapter.send(action),
    now: () => "2026-10-08T12:00:00.000Z",
  });
  assert.deepEqual(partial.items.map((item) => item.status), ["sent", "failed", "pending"]);
  assert.equal(firstAdapter.calls.length, 2);

  const retry = prepareDeterministicDeliveryRetry(
    partial,
    partial.items[1]!.action.action_id,
  );
  const secondAdapter = new FakeProviderSendAdapter({
    [plan.items[1]!.action.action_id]: { status: "sent", providerMessageId: "provider-2" },
    [plan.items[2]!.action.action_id]: { status: "sent", providerMessageId: "provider-3" },
  });
  const completed = await executeDeliveryPlan(retry, {
    loadCurrentState: async () => state,
    send: (action) => secondAdapter.send(action),
    now: () => "2026-10-08T12:05:00.000Z",
  });

  assert.deepEqual(secondAdapter.calls.map((item) => item.sequence), [2, 3]);
  assert.deepEqual(completed.items.map((item) => item.status), ["sent", "sent", "sent"]);
});

test("an uncertain provider result cannot be retried before reconciliation", async () => {
  const state = createConversationState(scope);
  const plan = createDeliveryPlan(actions(state, 2));
  const adapter = new FakeProviderSendAdapter({
    [plan.items[0]!.action.action_id]: {
      status: "delivery_unknown",
      reason: "fake_timeout_after_write",
    },
    [plan.items[1]!.action.action_id]: {
      status: "sent",
      providerMessageId: "must-not-send",
    },
  });
  const uncertain = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => state,
    send: (action) => adapter.send(action),
    now: () => "2026-10-08T12:00:00.000Z",
  });

  assert.deepEqual(uncertain.items.map((item) => item.status), ["delivery_unknown", "pending"]);
  assert.equal(adapter.calls.length, 1);
  assert.throws(
    () => prepareDeterministicDeliveryRetry(uncertain, uncertain.items[0]!.action.action_id),
    /reconciled/,
  );

  const reconciled = reconcileUnknownDelivery(
    uncertain,
    uncertain.items[0]!.action.action_id,
    { status: "sent", providerMessageId: "provider-found-by-reconciliation" },
  );
  assert.equal(reconciled.items[0]?.status, "sent");
});

test("a preflight exception preserves prior delivery progress", async () => {
  const state = createConversationState(scope);
  const plan = createDeliveryPlan(actions(state, 3));
  const adapter = new FakeProviderSendAdapter({
    [plan.items[0]!.action.action_id]: {
      status: "sent",
      providerMessageId: "provider-before-preflight-error",
    },
  });
  let loads = 0;

  const result = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => {
      loads += 1;
      if (loads === 2) throw new Error("synthetic state read failure");
      return state;
    },
    send: (action) => adapter.send(action),
    now: () => "2026-10-08T12:00:00.000Z",
  });

  assert.deepEqual(result.items.map((item) => item.status), [
    "sent",
    "failed",
    "pending",
  ]);
  assert.equal(result.items[1]?.reason, "delivery_preflight_exception");
  assert.equal(result.items[0]?.providerMessageId, "provider-before-preflight-error");
  assert.equal(adapter.calls.length, 1);
});

test("a send exception after possible provider acceptance requires reconciliation", async () => {
  const state = createConversationState(scope);
  const plan = createDeliveryPlan(actions(state, 3));
  const acceptedActionIds: string[] = [];

  const result = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => state,
    send: async (action) => {
      acceptedActionIds.push(action.action_id);
      if (action.sequence === 2) {
        throw new Error("synthetic timeout after provider acceptance");
      }
      return {
        schema_version: "lexia.delivery.result.v1",
        action_id: action.action_id,
        status: "sent",
        attempted_at: "2026-10-08T12:00:00.000Z",
        provider_message_id: "provider-first-confirmed",
      };
    },
    now: () => "2026-10-08T12:00:00.000Z",
  });

  assert.deepEqual(result.items.map((item) => item.status), [
    "sent",
    "delivery_unknown",
    "pending",
  ]);
  assert.equal(result.items[1]?.attempts, 1);
  assert.equal(result.items[1]?.reason, "provider_send_exception");
  assert.deepEqual(acceptedActionIds, [
    plan.items[0]!.action.action_id,
    plan.items[1]!.action.action_id,
  ]);
  assert.throws(
    () => prepareDeterministicDeliveryRetry(result, plan.items[1]!.action.action_id),
    /reconciled/,
  );
});

test("a stale action is suppressed without calling the provider adapter", async () => {
  const initial = createConversationState(scope);
  const plan = createDeliveryPlan(actions(initial, 1));
  const current = recordHumanIntervention(initial, {
    commandId: "human-before-delivery",
    occurredAt: "2026-10-08T12:00:00.000Z",
    durationMs: 30 * 60 * 1000,
    messageId: "human-before-delivery",
  }).state;
  const adapter = new FakeProviderSendAdapter({
    [plan.items[0]!.action.action_id]: {
      status: "sent",
      providerMessageId: "must-not-send",
    },
  });

  const result = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => current,
    send: (action) => adapter.send(action),
    now: () => "2026-10-08T12:01:00.000Z",
  });

  assert.equal(adapter.calls.length, 0);
  assert.equal(result.items[0]?.status, "suppressed");
  assert.equal(result.items[0]?.reason, "state_changed");
});
