import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildReprocessContext,
  validateBrainResult,
} from "../lib/omnichannel/brain-boundary";
import type {
  BrainRequest,
  BrainResult,
  OmnichannelScope,
  OutboundAction,
} from "../lib/omnichannel/contracts";
import {
  SUPERSEDED_BY_NEW_MESSAGE,
  createDeliveryPlan,
  executeDeliveryPlan,
  getDeliveredActionIds,
  planNeedsReprocess,
  prepareDeterministicDeliveryRetry,
} from "../lib/omnichannel/delivery-plan";
import { FakeProviderSendAdapter } from "../lib/omnichannel/fake-adapters";
import {
  claimInboundBatch,
  completeInboundBatch,
  createInboundBuffer,
  enqueueInboundMessage,
  supersedeInboundBatch,
} from "../lib/omnichannel/inbound-buffer";
import { assertContractSchema } from "../lib/omnichannel/schema-validator";
import {
  confirmAppointment,
  createConversationState,
  recordHumanIntervention,
  recordLeadMessage,
  type ConversationState,
} from "../lib/omnichannel/state-machine";

type Fixture = { brain_request: BrainRequest; brain_result: BrainResult };

const example = JSON.parse(
  readFileSync(
    join(process.cwd(), "contracts", "omnichannel", "v1", "examples", "empresa-sintetica-a-flow.json"),
    "utf8",
  ),
) as Fixture;

const scope: OmnichannelScope = example.brain_request.scope;
const windowMs = 60_000;
const supersededInvocationId = example.brain_result.invocation_id;
const reprocessInvocationId = "bbbbbbbb-0000-4000-8000-000000000100";

function replyActions(
  state: ConversationState,
  count: number,
  invocationId = supersededInvocationId,
  offset = 10,
): OutboundAction[] {
  return Array.from({ length: count }, (_, index) => ({
    schema_version: "lexia.outbound.action.v1",
    action_id: `bbbbbbbb-0000-4000-8000-${String(index + offset).padStart(12, "0")}`,
    invocation_id: invocationId,
    scope,
    sequence: index + 1,
    kind: "reply",
    captured_state: {
      state_version: state.stateVersion,
      delivery_epoch: state.deliveryEpoch,
    },
    content: { type: "text", text: `Synthetic bubble ${index + 1}` },
  }));
}

function sentAdapter(actions: readonly OutboundAction[]) {
  return new FakeProviderSendAdapter(
    Object.fromEntries(
      actions.map((action, index) => [
        action.action_id,
        { status: "sent" as const, providerMessageId: `provider-${index + 1}` },
      ]),
    ),
  );
}

test("a lead message advances only its own sequence and is idempotent", () => {
  const initial = createConversationState(scope);
  const first = recordLeadMessage(initial, {
    commandId: "lead-cmd-1",
    messageId: "lead-msg-1",
    occurredAt: "2026-10-08T12:00:00.000Z",
  });
  assert.equal(first.leadMessageSeq, 1);
  assert.equal(first.state.stateVersion, initial.stateVersion);
  assert.equal(first.state.deliveryEpoch, initial.deliveryEpoch);

  const retry = recordLeadMessage(first.state, {
    commandId: "lead-cmd-1",
    messageId: "lead-msg-1",
    occurredAt: "2026-10-08T12:00:00.000Z",
  });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.state.leadMessageSeq, 1);
});

test("the buffer keeps the sliding debounce and only the newest arrival closes it", () => {
  let buffer = createInboundBuffer(scope, windowMs);
  buffer = enqueueInboundMessage(buffer, { messageId: "m1", leadSeq: 1, at: "2026-10-08T12:00:00.000Z", blocked: false }).state;
  buffer = enqueueInboundMessage(buffer, { messageId: "m2", leadSeq: 2, at: "2026-10-08T12:00:30.000Z", blocked: false }).state;
  assert.equal(
    enqueueInboundMessage(buffer, { messageId: "m2", leadSeq: 2, at: "2026-10-08T12:00:31.000Z", blocked: false }).duplicate,
    true,
  );

  const older = claimInboundBatch(buffer, { candidateSeq: 1, batchId: "batch-old", at: "2026-10-08T12:01:00.000Z", blocked: false });
  assert.equal(older.claimed, false);
  assert.equal(!older.claimed && older.reason, "newer_message_waiting");

  const early = claimInboundBatch(buffer, { candidateSeq: 2, batchId: "batch-early", at: "2026-10-08T12:01:00.000Z", blocked: false });
  assert.equal(!early.claimed && early.reason, "window_open");

  const claim = claimInboundBatch(buffer, { candidateSeq: 2, batchId: "batch-1", at: "2026-10-08T12:01:30.000Z", blocked: false });
  assert.equal(claim.claimed, true);
  assert.ok(claim.claimed);
  assert.deepEqual(claim.batch.messageIds, ["m1", "m2"]);
  assert.equal(claim.batch.cutoffSeq, 2);
  assert.deepEqual(claim.state.entries, []);
});

test("a message arriving while a batch is processed is kept for the next batch", () => {
  let buffer = createInboundBuffer(scope, windowMs);
  buffer = enqueueInboundMessage(buffer, { messageId: "m1", leadSeq: 1, at: "2026-10-08T12:00:00.000Z", blocked: false }).state;
  const claim = claimInboundBatch(buffer, { candidateSeq: 1, batchId: "batch-1", at: "2026-10-08T12:01:00.000Z", blocked: false });
  assert.ok(claim.claimed);
  buffer = enqueueInboundMessage(claim.state, { messageId: "m2", leadSeq: 2, at: "2026-10-08T12:01:00.001Z", blocked: false }).state;

  const parallel = claimInboundBatch(buffer, { candidateSeq: 2, batchId: "batch-parallel", at: "2026-10-08T12:02:01.000Z", blocked: false });
  assert.equal(!parallel.claimed && parallel.reason, "batch_in_progress");

  assert.throws(
    () => completeInboundBatch(buffer, { batchId: "batch-1", fencingToken: claim.batch.fencingToken + 1 }),
    /Stale or unknown/,
  );
  const completed = completeInboundBatch(buffer, { batchId: "batch-1", fencingToken: claim.batch.fencingToken });
  assert.equal(completed.nextClaimSeq, 2);

  const next = claimInboundBatch(completed.state, { candidateSeq: 2, batchId: "batch-2", at: "2026-10-08T12:02:01.000Z", blocked: false });
  assert.ok(next.claimed);
  assert.deepEqual(next.batch.messageIds, ["m2"]);
  assert.ok(next.batch.fencingToken > claim.batch.fencingToken);
});

test("a newer lead message discards the unsent reply, keeps sent bubbles and reprocesses once", async () => {
  let state = createConversationState(scope);
  let buffer = createInboundBuffer(scope, windowMs);
  const lead1 = recordLeadMessage(state, { commandId: "lead-cmd-1", messageId: "m1", occurredAt: "2026-10-08T12:00:00.000Z" });
  state = lead1.state;
  buffer = enqueueInboundMessage(buffer, { messageId: "m1", leadSeq: lead1.leadMessageSeq, at: "2026-10-08T12:00:00.000Z", blocked: false }).state;
  const claim = claimInboundBatch(buffer, { candidateSeq: 1, batchId: "batch-1", at: "2026-10-08T12:01:00.000Z", blocked: false });
  assert.ok(claim.claimed);
  buffer = claim.state;

  const actions = replyActions(state, 3);
  const plan = createDeliveryPlan(actions, { leadCutoffSeq: claim.batch.cutoffSeq });
  const adapter = sentAdapter(actions);
  const delivered = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => state,
    send: async (action) => {
      const result = await adapter.send(action);
      // The lead writes again right after the first bubble is confirmed.
      const lead2 = recordLeadMessage(state, { commandId: "lead-cmd-2", messageId: "m2", occurredAt: "2026-10-08T12:01:10.000Z" });
      state = lead2.state;
      buffer = enqueueInboundMessage(buffer, { messageId: "m2", leadSeq: lead2.leadMessageSeq, at: "2026-10-08T12:01:10.000Z", blocked: false }).state;
      return result;
    },
    now: () => "2026-10-08T12:01:10.000Z",
  });

  assert.equal(adapter.calls.length, 1);
  // D4: the unsent remainder is suppressed as superseded; the sent bubble stays.
  assert.deepEqual(delivered.items.map((item) => item.status), ["sent", "suppressed", "suppressed"]);
  assert.equal(delivered.items[1]?.reason, SUPERSEDED_BY_NEW_MESSAGE);
  assert.equal(delivered.items[2]?.reason, SUPERSEDED_BY_NEW_MESSAGE);
  assert.equal(planNeedsReprocess(delivered), true);
  assert.throws(
    () => prepareDeterministicDeliveryRetry(delivered, actions[1]!.action_id),
    /deterministic failure/,
  );

  const superseded = supersedeInboundBatch(buffer, {
    batchId: claim.batch.batchId,
    fencingToken: claim.batch.fencingToken,
    invocationId: supersededInvocationId,
  });
  assert.equal(superseded.nextClaimSeq, 2);
  const reclaim = claimInboundBatch(superseded.state, { candidateSeq: 2, batchId: "batch-2", at: "2026-10-08T12:02:10.000Z", blocked: false });
  assert.ok(reclaim.claimed);
  assert.deepEqual(reclaim.batch.messageIds, ["m1", "m2"]);
  assert.deepEqual(reclaim.batch.supersededInvocationIds, [supersededInvocationId]);

  const reprocess = buildReprocessContext({
    supersededResults: [example.brain_result],
    deliveredActionIds: getDeliveredActionIds(delivered),
  });
  assert.deepEqual(reprocess.delivered_action_ids, [actions[0]!.action_id]);
  assert.deepEqual(
    reprocess.executed_tool_effects.map((effect) => [effect.operation, effect.appointment_ref]),
    [["appointment.create", "appointment-a-001"]],
  );

  const request: BrainRequest = {
    ...structuredClone(example.brain_request),
    invocation_id: reprocessInvocationId,
    reprocess,
  };
  assert.doesNotThrow(() => assertContractSchema("brain-request", request));

  const reusedAction: BrainResult = {
    ...structuredClone(example.brain_result),
    invocation_id: reprocessInvocationId,
    actions: [{ ...structuredClone(example.brain_result.actions[0]!), invocation_id: reprocessInvocationId, action_id: actions[0]!.action_id }],
    domain_events: [],
    tool_audit: [],
  };
  assert.throws(() => validateBrainResult(request, reusedAction), /already delivered/);

  const freshAction: BrainResult = {
    ...reusedAction,
    actions: [{ ...reusedAction.actions[0]!, action_id: "bbbbbbbb-0000-4000-8000-000000000200" }],
  };
  assert.doesNotThrow(() => validateBrainResult(request, freshAction));
});

test("an appointment reported again after reprocess does not repeat its effect", () => {
  const event = example.brain_result.domain_events[0];
  assert.ok(event && event.type === "appointment.confirmed");
  const input = {
    appointmentRef: event.appointment.appointment_ref,
    occurredAt: event.occurred_at,
    startsAt: event.appointment.starts_at,
    endsAt: event.appointment.ends_at,
    timezone: event.appointment.timezone,
    toolInvocationId: event.appointment.tool_invocation_id,
    pauseUntilEnd: true,
  };
  const applied = confirmAppointment(createConversationState(scope), { ...input, commandId: event.idempotency_key });
  const repeated = confirmAppointment(applied.state, { ...input, commandId: "reprocess-repeat" });
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.state.stateVersion, applied.state.stateVersion);
  assert.equal(repeated.state.blocks.length, 1);
});

test("reprocess metadata rejects read-only, failed or empty tool history", () => {
  const base = buildReprocessContext({ supersededResults: [example.brain_result], deliveredActionIds: [] });
  const request = (reprocess: unknown) => ({ ...structuredClone(example.brain_request), reprocess });

  assert.throws(() => assertContractSchema("brain-request", request({
    ...base,
    executed_tool_effects: [{ tool_name: "fake", invocation_id: "t-1", operation: "availability.check", result: "succeeded" }],
  })));
  assert.throws(() => assertContractSchema("brain-request", request({
    ...base,
    executed_tool_effects: [{ tool_name: "fake", invocation_id: "t-1", operation: "appointment.create", result: "failed", appointment_ref: "x" }],
  })));
  assert.throws(() => assertContractSchema("brain-request", request({ ...base, superseded_invocation_ids: [] })));
  assert.throws(() => buildReprocessContext({ supersededResults: [], deliveredActionIds: [] }), /superseded invocation/);

  const withoutAvailability = buildReprocessContext({
    supersededResults: [{
      ...example.brain_result,
      tool_audit: [{ tool_name: "fake", invocation_id: "t-2", operation: "availability.check", result: "succeeded" }],
    }],
    deliveredActionIds: [],
  });
  assert.deepEqual(withoutAvailability.executed_tool_effects, []);
});

test("blocks win over a newer lead message and do not trigger reprocess", async () => {
  let state = recordLeadMessage(createConversationState(scope), {
    commandId: "lead-cmd-1", messageId: "m1", occurredAt: "2026-10-08T12:00:00.000Z",
  }).state;
  const actions = replyActions(state, 1);
  const plan = createDeliveryPlan(actions, { leadCutoffSeq: state.leadMessageSeq });
  state = recordHumanIntervention(state, {
    commandId: "human-1", occurredAt: "2026-10-08T12:00:30.000Z", durationMs: 15 * 60 * 1000, messageId: "h1",
  }).state;
  state = recordLeadMessage(state, { commandId: "lead-cmd-2", messageId: "m2", occurredAt: "2026-10-08T12:00:40.000Z" }).state;

  const adapter = sentAdapter(actions);
  const result = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => state,
    send: (action) => adapter.send(action),
    now: () => "2026-10-08T12:00:45.000Z",
  });
  assert.equal(adapter.calls.length, 0);
  assert.equal(result.items[0]?.status, "suppressed");
  assert.notEqual(result.items[0]?.reason, SUPERSEDED_BY_NEW_MESSAGE);
  assert.equal(planNeedsReprocess(result), false);
});

test("a reminder plan is not superseded by a new lead message", async () => {
  let state = confirmAppointment(createConversationState(scope), {
    commandId: "confirm-r",
    appointmentRef: "appointment-r",
    occurredAt: "2026-10-08T12:00:00.000Z",
    startsAt: "2026-10-09T13:00:00.000Z",
    endsAt: "2026-10-09T14:00:00.000Z",
    timezone: "America/New_York",
    toolInvocationId: "tool-r",
    pauseUntilEnd: true,
  }).state;
  const reminder: OutboundAction = {
    ...replyActions(state, 1, "bbbbbbbb-0000-4000-8000-000000000300")[0]!,
    kind: "appointment_reminder",
    source_ref: "appointment-r",
  };
  const plan = createDeliveryPlan([reminder]);
  state = recordLeadMessage(state, { commandId: "lead-cmd-r", messageId: "mr", occurredAt: "2026-10-09T08:00:00.000Z" }).state;

  const adapter = sentAdapter([reminder]);
  const result = await executeDeliveryPlan(plan, {
    loadCurrentState: async () => state,
    send: (action) => adapter.send(action),
    now: () => "2026-10-09T09:00:00.000Z",
  });
  assert.equal(result.items[0]?.status, "sent");
});

test("a batch cannot be superseded without a newer lead message", () => {
  let buffer = createInboundBuffer(scope, windowMs);
  buffer = enqueueInboundMessage(buffer, { messageId: "m1", leadSeq: 1, at: "2026-10-08T12:00:00.000Z", blocked: false }).state;
  const claim = claimInboundBatch(buffer, { candidateSeq: 1, batchId: "batch-1", at: "2026-10-08T12:01:00.000Z", blocked: false });
  assert.ok(claim.claimed);
  assert.throws(
    () => supersedeInboundBatch(claim.state, {
      batchId: "batch-1", fencingToken: claim.batch.fencingToken, invocationId: supersededInvocationId,
    }),
    /newer lead message/,
  );
});
