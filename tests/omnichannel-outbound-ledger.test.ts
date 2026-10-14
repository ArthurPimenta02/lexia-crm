import assert from "node:assert/strict";
import test from "node:test";

import type { OmnichannelScope, OutboundAction } from "../lib/omnichannel/contracts";
import {
  claimInboundBatch,
  createInboundBuffer,
  enqueueInboundMessage,
  releasePendingMessages,
} from "../lib/omnichannel/inbound-buffer";
import {
  SUPERSEDED_BY_NEW_MESSAGE,
  claimOutboundAction,
  createOutboundLedger,
  finishOutboundAction,
  prepareOutboundActions,
  prepareOutboundRetry,
  reconcileOutboundAction,
} from "../lib/omnichannel/outbound-ledger";
import {
  confirmAppointment,
  createConversationState,
  queuePendingMessage,
  recordHumanIntervention,
  recordLeadMessage,
  startManualPause,
  type ConversationState,
} from "../lib/omnichannel/state-machine";

const scopeA: OmnichannelScope = {
  environment: "isolated_test",
  cliente_slug: "empresa_sintetica_a",
  channel: "whatsapp",
  account_ref: "11111111-1111-4111-8111-111111111111",
  conversation_ref: "conversation-shared-001",
};
const scopeB: OmnichannelScope = {
  ...scopeA,
  cliente_slug: "empresa_sintetica_b",
  account_ref: "22222222-2222-4222-8222-222222222222",
};
const at = "2026-10-08T12:00:00.000Z";

function action(
  state: ConversationState,
  scope: OmnichannelScope,
  sequence: number,
  kind: OutboundAction["kind"] = "reply",
  sourceRef?: string,
  invocation = "cccccccc-0000-4000-8000-000000000001",
): OutboundAction {
  return {
    schema_version: "lexia.outbound.action.v1",
    action_id: `cccccccc-0000-4000-8000-${String(100 + sequence).padStart(12, "0")}`,
    invocation_id: invocation,
    scope,
    sequence,
    kind,
    captured_state: { state_version: state.stateVersion, delivery_epoch: state.deliveryEpoch },
    content: { type: "text", text: `Synthetic ${sequence}` },
    ...(sourceRef ? { source_ref: sourceRef } : {}),
  };
}

function prepared(state: ConversationState, count: number) {
  const actions = Array.from({ length: count }, (_, i) => action(state, scopeA, i + 1));
  return { actions, ledger: prepareOutboundActions(createOutboundLedger(), { actions, leadCutoffSeq: 0 }) };
}

test("two processes racing for one action: only the first acquires and holds the token", () => {
  const state = createConversationState(scopeA);
  const { actions, ledger } = prepared(state, 1);
  const id = actions[0]!.action_id;

  const first = claimOutboundAction(ledger, state, { actionId: id, claimant: "exec-1", at, deliveryEnabled: true });
  assert.equal(first.acquired, true);
  assert.equal(typeof first.fencingToken, "number");

  const second = claimOutboundAction(first.ledger, first.state, { actionId: id, claimant: "exec-2", at, deliveryEnabled: true });
  assert.equal(second.acquired, false);
  assert.equal(second.status, "claimed");
  assert.equal(second.fencingToken, null);
  assert.deepEqual(second.ledger, first.ledger);

  // Even the first claimant gets no second authorization by claiming again.
  const again = claimOutboundAction(first.ledger, first.state, { actionId: id, claimant: "exec-1", at, deliveryEnabled: true });
  assert.equal(again.acquired, false);

  assert.throws(
    () => finishOutboundAction(first.ledger, first.state, {
      actionId: id, claimant: "exec-2", fencingToken: first.fencingToken!, status: "sent", providerMessageId: "p-1",
    }),
    /stale_outbound_claim/,
  );
});

test("null, wrong and old tokens or claimants are rejected without changing the ledger", () => {
  const state = createConversationState(scopeA);
  const { actions, ledger } = prepared(state, 1);
  const id = actions[0]!.action_id;
  const claim = claimOutboundAction(ledger, state, { actionId: id, claimant: "exec-1", at, deliveryEnabled: true });
  const before = structuredClone(claim.ledger);
  const finish = (input: Record<string, unknown>) =>
    finishOutboundAction(claim.ledger, claim.state, {
      actionId: id, claimant: "exec-1", fencingToken: claim.fencingToken!, status: "sent", providerMessageId: "p-1",
      ...input,
    } as Parameters<typeof finishOutboundAction>[2]);

  assert.throws(() => finish({ fencingToken: null }), /fencing_token_required/);
  assert.throws(() => finish({ fencingToken: undefined }), /fencing_token_required/);
  assert.throws(() => finish({ fencingToken: claim.fencingToken! + 1 }), /stale_outbound_claim/);
  assert.throws(() => finish({ fencingToken: claim.fencingToken! - 1 }), /stale_outbound_claim/);
  assert.throws(() => finish({ claimant: null }), /claimant_required/);
  assert.throws(() => finish({ claimant: "" }), /claimant_required/);
  assert.throws(() => finish({ status: null }), /invalid_delivery_status/);
  assert.throws(() => finish({ providerMessageId: undefined }), /provider_message_id_required/);
  assert.throws(
    () => claimOutboundAction(ledger, state, { actionId: id, claimant: null as unknown as string, at, deliveryEnabled: true }),
    /claimant_required/,
  );
  assert.deepEqual(claim.ledger, before);

  const ok = finish({});
  assert.equal(ok.ledger.entries[id]?.status, "sent");
  assert.equal(finish({}).duplicate, false);
  assert.equal(finishOutboundAction(ok.ledger, ok.state, {
    actionId: id, claimant: "exec-1", fencingToken: claim.fencingToken!, status: "sent", providerMessageId: "p-1",
  }).duplicate, true);

  // A retry after a deterministic failure gets a new, newer token; the old
  // token can no longer finish the action.
  const { actions: retryActions, ledger: retryLedger } = prepared(state, 1);
  const retryId = retryActions[0]!.action_id;
  const c1 = claimOutboundAction(retryLedger, state, { actionId: retryId, claimant: "exec-1", at, deliveryEnabled: true });
  const failed = finishOutboundAction(c1.ledger, c1.state, { actionId: retryId, claimant: "exec-1", fencingToken: c1.fencingToken!, status: "failed", reason: "rejected" });
  const c2 = claimOutboundAction(prepareOutboundRetry(failed.ledger, retryId), failed.state, { actionId: retryId, claimant: "exec-2", at, deliveryEnabled: true });
  assert.ok(c2.fencingToken! > c1.fencingToken!);
  assert.throws(
    () => finishOutboundAction(c2.ledger, c2.state, { actionId: retryId, claimant: "exec-1", fencingToken: c1.fencingToken!, status: "sent", providerMessageId: "p" }),
    /stale_outbound_claim/,
  );
});

test("D2: confirmation reserved at claim, kept when uncertain, released on definitive failure", () => {
  const booked = confirmAppointment(createConversationState(scopeA), {
    commandId: "confirm", appointmentRef: "appt", occurredAt: at,
    startsAt: "2026-10-09T13:00:00.000Z", endsAt: "2026-10-09T14:00:00.000Z",
    timezone: "America/New_York", toolInvocationId: "tool", pauseUntilEnd: true,
  }).state;
  const confirmation = action(booked, scopeA, 1, "appointment_confirmation", "appt");
  const ledger = prepareOutboundActions(createOutboundLedger(), { actions: [confirmation], leadCutoffSeq: 0 });
  const claim = claimOutboundAction(ledger, booked, { actionId: confirmation.action_id, claimant: "exec-1", at, deliveryEnabled: true });
  assert.equal(claim.acquired, true);
  assert.equal(claim.state.appointments[0]?.confirmationActionId, confirmation.action_id);
  assert.equal(claim.state.stateVersion, booked.stateVersion);
  assert.equal(claim.ledger.entries[confirmation.action_id]?.status, "claimed");

  const unknown = finishOutboundAction(claim.ledger, claim.state, {
    actionId: confirmation.action_id, claimant: "exec-1", fencingToken: claim.fencingToken!, status: "delivery_unknown",
  });
  assert.equal(unknown.state.appointments[0]?.confirmationActionId, confirmation.action_id);
  assert.throws(() => prepareOutboundRetry(unknown.ledger, confirmation.action_id), /reconciled/);

  const other = action(booked, scopeA, 1, "appointment_confirmation", "appt", "cccccccc-0000-4000-8000-000000000002");
  const otherAction = { ...other, action_id: "cccccccc-0000-4000-8000-000000000999" };
  const withOther = prepareOutboundActions(unknown.ledger, { actions: [otherAction], leadCutoffSeq: 0 });
  const blocked = claimOutboundAction(withOther, unknown.state, { actionId: otherAction.action_id, claimant: "exec-2", at, deliveryEnabled: true });
  assert.equal(blocked.acquired, false);
  assert.equal(blocked.reason, "appointment_confirmation_already_sent");

  const failed = reconcileOutboundAction(unknown.ledger, unknown.state, { actionId: confirmation.action_id, status: "failed", reason: "not_delivered" });
  assert.equal(failed.state.appointments[0]?.confirmationActionId, null);
  const recovered = prepareOutboundActions(failed.ledger, { actions: [otherAction], leadCutoffSeq: 0 });
  const retry = claimOutboundAction(recovered, failed.state, { actionId: otherAction.action_id, claimant: "exec-2", at, deliveryEnabled: true });
  assert.equal(retry.acquired, true);
});

test("D4: a newer lead message suppresses the unsent remainder and keeps sent actions", () => {
  let state = recordLeadMessage(createConversationState(scopeA), { commandId: "l1", messageId: "m1", occurredAt: at }).state;
  const actions = [1, 2, 3].map((n) => action(state, scopeA, n));
  let ledger = prepareOutboundActions(createOutboundLedger(), { actions, leadCutoffSeq: state.leadMessageSeq });
  const c1 = claimOutboundAction(ledger, state, { actionId: actions[0]!.action_id, claimant: "e", at, deliveryEnabled: true });
  ledger = finishOutboundAction(c1.ledger, c1.state, { actionId: actions[0]!.action_id, claimant: "e", fencingToken: c1.fencingToken!, status: "sent", providerMessageId: "p1" }).ledger;
  state = recordLeadMessage(state, { commandId: "l2", messageId: "m2", occurredAt: at }).state;

  const c2 = claimOutboundAction(ledger, state, { actionId: actions[1]!.action_id, claimant: "e", at, deliveryEnabled: true });
  assert.equal(c2.acquired, false);
  assert.deepEqual(
    actions.map((a) => [c2.ledger.entries[a.action_id]?.status, c2.ledger.entries[a.action_id]?.reason]),
    [["sent", null], ["suppressed", SUPERSEDED_BY_NEW_MESSAGE], ["suppressed", SUPERSEDED_BY_NEW_MESSAGE]],
  );
  assert.throws(() => prepareOutboundRetry(c2.ledger, actions[2]!.action_id), /only_deterministic_failure_can_be_retried/);
});

test("D1: lead messages advance only their counter and reminders carry no cutoff", () => {
  const booked = confirmAppointment(createConversationState(scopeA), {
    commandId: "c", appointmentRef: "r", occurredAt: at,
    startsAt: "2026-10-09T13:00:00.000Z", endsAt: "2026-10-09T14:00:00.000Z",
    timezone: "America/New_York", toolInvocationId: "t", pauseUntilEnd: false,
  }).state;
  const reminder = action(booked, scopeA, 1, "appointment_reminder", "r");
  assert.throws(
    () => prepareOutboundActions(createOutboundLedger(), { actions: [reminder], leadCutoffSeq: 1 }),
    /reminders_do_not_carry_lead_cutoff/,
  );
  assert.throws(
    () => prepareOutboundActions(createOutboundLedger(), { actions: [action(booked, scopeA, 1)], leadCutoffSeq: null }),
    /lead_cutoff_required_for_replies/,
  );
  const ledger = prepareOutboundActions(createOutboundLedger(), { actions: [reminder], leadCutoffSeq: null });

  const paused = startManualPause(booked, { commandId: "p", pauseRef: "p", occurredAt: at }).state;
  const pending = queuePendingMessage(paused, { commandId: "q", messageId: "m", occurredAt: at }).state;
  assert.equal(pending.stateVersion, paused.stateVersion);
  assert.equal(pending.deliveryEpoch, paused.deliveryEpoch);

  const afterLead = recordLeadMessage(booked, { commandId: "l", messageId: "m", occurredAt: at }).state;
  const claim = claimOutboundAction(ledger, afterLead, { actionId: reminder.action_id, claimant: "e", at, deliveryEnabled: true });
  assert.equal(claim.acquired, true);
});

test("a block during the buffer stops the batch before the brain and keeps messages pending", () => {
  let buffer = createInboundBuffer(scopeA, 60_000);
  buffer = enqueueInboundMessage(buffer, { messageId: "m1", leadSeq: 1, at, blocked: false }).state;
  const blocked = claimInboundBatch(buffer, { candidateSeq: 1, batchId: "b1", at: "2026-10-08T12:01:00.000Z", blocked: true });
  assert.equal(blocked.claimed, false);
  assert.equal(!blocked.claimed && blocked.reason, "blocked");
  assert.deepEqual(blocked.state.pending.map((e) => e.messageId), ["m1"]);
  assert.deepEqual(blocked.state.entries, []);

  buffer = enqueueInboundMessage(blocked.state, { messageId: "m2", leadSeq: 2, at, blocked: true }).state;
  assert.deepEqual(buffer.pending.map((e) => e.messageId), ["m1", "m2"]);
  assert.equal(
    claimInboundBatch(buffer, { candidateSeq: 2, batchId: "b2", at: "2026-10-08T12:05:00.000Z", blocked: false }).claimed,
    false,
  );

  const released = releasePendingMessages(buffer, { at: "2026-10-08T12:20:00.000Z" });
  assert.equal(released.released, 2);
  const claim = claimInboundBatch(released.state, { candidateSeq: 2, batchId: "b3", at: "2026-10-08T12:20:00.000Z", blocked: false });
  assert.ok(claim.claimed);
  assert.deepEqual(claim.batch.messageIds, ["m1", "m2"]);
  assert.throws(
    () => claimInboundBatch(buffer, { candidateSeq: null as unknown as number, batchId: "b4", at, blocked: false }),
    /candidateSeq/,
  );
});

test("actions never cross companies, environments or conversations", () => {
  const stateA = createConversationState(scopeA);
  const actionA = action(stateA, scopeA, 1);
  const ledger = prepareOutboundActions(createOutboundLedger(), { actions: [actionA], leadCutoffSeq: 0 });

  for (const scope of [
    scopeB,
    { ...scopeA, environment: "staging" as const },
    { ...scopeA, conversation_ref: "conversation-other" },
  ]) {
    const foreign = createConversationState(scope);
    const claim = claimOutboundAction(ledger, foreign, { actionId: actionA.action_id, claimant: "e", at, deliveryEnabled: true });
    assert.equal(claim.acquired, false);
    assert.equal(claim.reason, "scope_mismatch");
    assert.throws(
      () => prepareOutboundActions(ledger, { actions: [{ ...actionA, scope }], leadCutoffSeq: 0 }),
      /outbound_action_conflict/,
    );
  }

  const intervened = recordHumanIntervention(stateA, { commandId: "h", occurredAt: at, durationMs: 60_000, messageId: "h1" }).state;
  const claim = claimOutboundAction(ledger, intervened, { actionId: actionA.action_id, claimant: "e", at, deliveryEnabled: true });
  assert.equal(claim.reason, "state_changed");
});
