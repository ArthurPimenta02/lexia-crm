import assert from "node:assert/strict";
import test from "node:test";

import type { OmnichannelScope, OutboundAction } from "../lib/omnichannel/contracts";
import {
  cancelAppointment,
  confirmAppointment,
  createConversationState,
  endManualPause,
  evaluateDeliveryPermission,
  expireBlocks,
  getActiveBlocks,
  getResumeDecision,
  queuePendingMessage,
  recordHumanIntervention,
  removeAppointmentBlock,
  requestHandoff,
  resolveHandoff,
  resumeHandoff,
  startManualPause,
} from "../lib/omnichannel/state-machine";

const scope: OmnichannelScope = {
  environment: "isolated_test",
  cliente_slug: "empresa_sintetica_a",
  channel: "whatsapp",
  account_ref: "11111111-1111-4111-8111-111111111111",
  conversation_ref: "conversation-state-001",
};

function action(
  state: ReturnType<typeof createConversationState>,
  kind: OutboundAction["kind"] = "reply",
  sourceRef?: string,
): OutboundAction {
  return {
    schema_version: "lexia.outbound.action.v1",
    action_id: "aaaaaaaa-0000-4000-8000-000000000030",
    invocation_id: "aaaaaaaa-0000-4000-8000-000000000031",
    scope,
    sequence: 1,
    kind,
    captured_state: {
      state_version: state.stateVersion,
      delivery_epoch: state.deliveryEpoch,
    },
    content: { type: "text", text: "Synthetic response" },
    ...(sourceRef ? { source_ref: sourceRef } : {}),
  };
}

test("human intervention renews its deadline and a duplicate does not renew twice", () => {
  const initial = createConversationState(scope);
  const first = recordHumanIntervention(initial, {
    commandId: "human-1",
    occurredAt: "2026-10-08T12:00:00.000Z",
    durationMs: 30 * 60 * 1000,
    messageId: "human-message-1",
  });
  const second = recordHumanIntervention(first.state, {
    commandId: "human-2",
    occurredAt: "2026-10-08T12:10:00.000Z",
    durationMs: 30 * 60 * 1000,
    messageId: "human-message-2",
  });
  const duplicate = recordHumanIntervention(second.state, {
    commandId: "human-2",
    occurredAt: "2026-10-08T12:20:00.000Z",
    durationMs: 30 * 60 * 1000,
    messageId: "human-message-2-retry",
  });

  assert.equal(first.state.blocks[0]?.expiresAt, "2026-10-08T12:30:00.000Z");
  assert.equal(second.state.blocks[0]?.expiresAt, "2026-10-08T12:40:00.000Z");
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state.blocks[0]?.expiresAt, "2026-10-08T12:40:00.000Z");
});

test("a delayed human event never shortens the latest intervention deadline", () => {
  const recent = recordHumanIntervention(createConversationState(scope), {
    commandId: "human-recent",
    occurredAt: "2026-10-08T12:10:00.000Z",
    durationMs: 30 * 60 * 1000,
    messageId: "human-message-recent",
  }).state;
  const delayed = recordHumanIntervention(recent, {
    commandId: "human-delayed",
    occurredAt: "2026-10-08T12:00:00.000Z",
    durationMs: 30 * 60 * 1000,
    messageId: "human-message-delayed",
  }).state;
  const block = delayed.blocks.find(
    (candidate) => candidate.blockId === "human_intervention",
  );

  assert.equal(block?.expiresAt, "2026-10-08T12:40:00.000Z");
  assert.equal(block?.updatedAt, "2026-10-08T12:10:00.000Z");
  assert.equal(block?.sourceRef, "human-message-recent");
  assert.equal(delayed.stateVersion, recent.stateVersion + 1);
});

test("manual pause and handoff remain independent through resolution and resume", () => {
  let state = startManualPause(createConversationState(scope), {
    commandId: "manual-start",
    pauseRef: "pause-1",
    occurredAt: "2026-10-08T12:00:00.000Z",
  }).state;
  state = requestHandoff(state, {
    commandId: "handoff-request",
    handoffRef: "handoff-1",
    occurredAt: "2026-10-08T12:01:00.000Z",
  }).state;
  const handoffRetry = requestHandoff(state, {
    commandId: "handoff-request-retry-with-new-command",
    handoffRef: "handoff-1",
    occurredAt: "2026-10-08T12:01:01.000Z",
  });
  assert.equal(handoffRetry.duplicate, true);
  assert.equal(handoffRetry.state.stateVersion, state.stateVersion);
  state = resolveHandoff(state, {
    commandId: "handoff-resolve",
    handoffRef: "handoff-1",
    occurredAt: "2026-10-08T12:02:00.000Z",
  }).state;

  assert.equal(getActiveBlocks(state, "2026-10-08T12:03:00.000Z").length, 2);
  assert.throws(
    () =>
      resumeHandoff(
        requestHandoff(createConversationState(scope), {
          commandId: "handoff-open",
          handoffRef: "handoff-open",
          occurredAt: "2026-10-08T12:00:00.000Z",
        }).state,
        {
          commandId: "invalid-resume",
          handoffRef: "handoff-open",
          occurredAt: "2026-10-08T12:01:00.000Z",
        },
      ),
    /resolved/,
  );

  state = resumeHandoff(state, {
    commandId: "handoff-resume",
    handoffRef: "handoff-1",
    occurredAt: "2026-10-08T12:03:00.000Z",
  }).state;
  assert.deepEqual(
    getActiveBlocks(state, "2026-10-08T12:04:00.000Z").map((block) => block.type),
    ["manual_pause"],
  );
});

test("all four pause reasons can coexist and ending one preserves the others", () => {
  let state = recordHumanIntervention(createConversationState(scope), {
    commandId: "all-human",
    occurredAt: "2026-10-08T12:00:00.000Z",
    durationMs: 60 * 60 * 1000,
    messageId: "all-human-message",
  }).state;
  state = startManualPause(state, {
    commandId: "all-manual",
    pauseRef: "all-pause",
    occurredAt: "2026-10-08T12:01:00.000Z",
  }).state;
  state = requestHandoff(state, {
    commandId: "all-handoff",
    handoffRef: "all-handoff",
    occurredAt: "2026-10-08T12:02:00.000Z",
  }).state;
  state = confirmAppointment(state, {
    commandId: "all-appointment",
    appointmentRef: "all-appointment",
    occurredAt: "2026-10-08T12:03:00.000Z",
    startsAt: "2026-10-08T13:00:00.000Z",
    endsAt: "2026-10-08T14:00:00.000Z",
    timezone: "America/Sao_Paulo",
    toolInvocationId: "all-tool",
    pauseUntilEnd: true,
  }).state;
  assert.deepEqual(
    new Set(getActiveBlocks(state, "2026-10-08T12:04:00.000Z").map((block) => block.type)),
    new Set(["human_intervention", "manual_pause", "handoff", "appointment"]),
  );

  state = endManualPause(state, {
    commandId: "all-manual-end",
    pauseRef: "all-pause",
    occurredAt: "2026-10-08T12:05:00.000Z",
  }).state;
  assert.deepEqual(
    new Set(getActiveBlocks(state, "2026-10-08T12:06:00.000Z").map((block) => block.type)),
    new Set(["human_intervention", "handoff", "appointment"]),
  );
});

test("default resume waits for a new lead message while answer_pending is explicit", () => {
  let defaultState = startManualPause(createConversationState(scope), {
    commandId: "default-start",
    pauseRef: "default",
    occurredAt: "2026-10-08T12:00:00.000Z",
  }).state;
  defaultState = queuePendingMessage(defaultState, {
    commandId: "default-pending",
    messageId: "lead-1",
    occurredAt: "2026-10-08T12:01:00.000Z",
  }).state;
  defaultState = endManualPause(defaultState, {
    commandId: "default-end",
    pauseRef: "default",
    occurredAt: "2026-10-08T12:02:00.000Z",
  }).state;
  assert.equal(getResumeDecision(defaultState, "2026-10-08T12:03:00.000Z"), "await_new_message");

  let answerState = startManualPause(
    createConversationState(scope, "answer_pending"),
    {
      commandId: "answer-start",
      pauseRef: "answer",
      occurredAt: "2026-10-08T12:00:00.000Z",
    },
  ).state;
  answerState = queuePendingMessage(answerState, {
    commandId: "answer-pending",
    messageId: "lead-2",
    occurredAt: "2026-10-08T12:01:00.000Z",
  }).state;
  answerState = endManualPause(answerState, {
    commandId: "answer-end",
    pauseRef: "answer",
    occurredAt: "2026-10-08T12:02:00.000Z",
  }).state;
  assert.equal(getResumeDecision(answerState, "2026-10-08T12:03:00.000Z"), "answer_pending");
});

test("appointment cancellation keeps its block but suppresses its reminders", () => {
  let state = confirmAppointment(createConversationState(scope), {
    commandId: "appointment-confirm",
    appointmentRef: "appointment-1",
    occurredAt: "2026-10-08T12:00:00.000Z",
    startsAt: "2026-10-09T13:00:00.000Z",
    endsAt: "2026-10-09T14:00:00.000Z",
    timezone: "America/Sao_Paulo",
    toolInvocationId: "tool-confirm-1",
    pauseUntilEnd: true,
  }).state;
  const confirmationRetry = confirmAppointment(state, {
    commandId: "appointment-confirm-retry",
    appointmentRef: "appointment-1",
    occurredAt: "2026-10-08T12:00:01.000Z",
    startsAt: "2026-10-09T13:00:00.000Z",
    endsAt: "2026-10-09T14:00:00.000Z",
    timezone: "America/Sao_Paulo",
    toolInvocationId: "tool-confirm-1-retry",
    pauseUntilEnd: true,
  });
  assert.equal(confirmationRetry.duplicate, true);
  assert.equal(confirmationRetry.state.stateVersion, state.stateVersion);

  const reminderBeforeCancel = action(state, "appointment_reminder", "appointment-1");
  assert.deepEqual(
    evaluateDeliveryPermission(state, reminderBeforeCancel, "2026-10-09T12:00:00.000Z"),
    { allowed: true },
  );
  assert.deepEqual(
    evaluateDeliveryPermission(
      state,
      action(state, "reply"),
      "2026-10-09T12:00:00.000Z",
    ),
    { allowed: false, reason: "blocked" },
  );

  state = cancelAppointment(state, {
    commandId: "appointment-cancel",
    appointmentRef: "appointment-1",
    occurredAt: "2026-10-08T13:00:00.000Z",
    toolInvocationId: "tool-cancel-1",
  }).state;
  assert.equal(getActiveBlocks(state, "2026-10-09T12:00:00.000Z").length, 1);
  assert.deepEqual(
    evaluateDeliveryPermission(
      state,
      action(state, "appointment_reminder", "appointment-1"),
      "2026-10-09T12:00:00.000Z",
    ),
    { allowed: false, reason: "appointment_cancelled" },
  );

  state = removeAppointmentBlock(state, {
    commandId: "appointment-remove",
    appointmentRef: "appointment-1",
    occurredAt: "2026-10-08T14:00:00.000Z",
  }).state;
  assert.equal(getActiveBlocks(state, "2026-10-08T14:01:00.000Z").length, 0);
});

test("appointment cancellation does not recreate a removed or expired block", () => {
  const confirmed = confirmAppointment(createConversationState(scope), {
    commandId: "appointment-detached-confirm",
    appointmentRef: "appointment-detached",
    occurredAt: "2026-10-08T12:00:00.000Z",
    startsAt: "2026-10-08T12:30:00.000Z",
    endsAt: "2026-10-08T13:00:00.000Z",
    timezone: "America/Sao_Paulo",
    toolInvocationId: "tool-detached-confirm",
    pauseUntilEnd: true,
  }).state;

  const removed = removeAppointmentBlock(confirmed, {
    commandId: "appointment-detached-remove",
    appointmentRef: "appointment-detached",
    occurredAt: "2026-10-08T12:10:00.000Z",
  }).state;
  const cancelledAfterRemoval = cancelAppointment(removed, {
    commandId: "appointment-detached-cancel",
    appointmentRef: "appointment-detached",
    occurredAt: "2026-10-08T12:20:00.000Z",
    toolInvocationId: "tool-detached-cancel",
  }).state;
  assert.equal(cancelledAfterRemoval.appointments[0]?.status, "cancelled");
  assert.equal(cancelledAfterRemoval.blocks[0]?.status, "ended");
  assert.equal(
    getActiveBlocks(cancelledAfterRemoval, "2026-10-08T12:21:00.000Z").length,
    0,
  );

  const expired = expireBlocks(confirmed, {
    commandId: "appointment-detached-expire",
    occurredAt: "2026-10-08T13:01:00.000Z",
  }).state;
  const cancelledAfterExpiry = cancelAppointment(expired, {
    commandId: "appointment-expired-cancel",
    appointmentRef: "appointment-detached",
    occurredAt: "2026-10-08T13:02:00.000Z",
    toolInvocationId: "tool-expired-cancel",
  }).state;
  assert.equal(cancelledAfterExpiry.appointments[0]?.status, "cancelled");
  assert.equal(cancelledAfterExpiry.blocks[0]?.status, "expired");
  assert.deepEqual(
    evaluateDeliveryPermission(
      cancelledAfterExpiry,
      action(
        cancelledAfterExpiry,
        "appointment_reminder",
        "appointment-detached",
      ),
      "2026-10-08T13:03:00.000Z",
    ),
    { allowed: false, reason: "appointment_cancelled" },
  );
});

test("expiring one temporary block does not remove another independent block", () => {
  let state = startManualPause(createConversationState(scope), {
    commandId: "temporary-pause",
    pauseRef: "temporary",
    occurredAt: "2026-10-08T12:00:00.000Z",
    expiresAt: "2026-10-08T12:10:00.000Z",
  }).state;
  state = requestHandoff(state, {
    commandId: "indefinite-handoff",
    handoffRef: "handoff-2",
    occurredAt: "2026-10-08T12:01:00.000Z",
  }).state;
  state = expireBlocks(state, {
    commandId: "expiry-scan",
    occurredAt: "2026-10-08T12:11:00.000Z",
  }).state;

  assert.deepEqual(
    getActiveBlocks(state, "2026-10-08T12:11:00.000Z").map((block) => block.type),
    ["handoff"],
  );
});

test("a temporary manual pause rejects an expiration before its start", () => {
  assert.throws(
    () =>
      startManualPause(createConversationState(scope), {
        commandId: "invalid-temporary-pause",
        pauseRef: "invalid",
        occurredAt: "2026-10-08T12:00:00.000Z",
        expiresAt: "2026-10-08T11:59:59.000Z",
      }),
    /after its start/,
  );
});

function confirmSyntheticAppointment(
  state: ReturnType<typeof createConversationState>,
  ref: string,
  commandId: string,
) {
  return confirmAppointment(state, {
    commandId,
    appointmentRef: ref,
    occurredAt: "2026-10-08T12:00:00.000Z",
    startsAt: "2026-10-09T13:00:00.000Z",
    endsAt: "2026-10-09T14:00:00.000Z",
    timezone: "America/New_York",
    toolInvocationId: `tool-${commandId}`,
    pauseUntilEnd: true,
  }).state;
}

test("removing a confirmed appointment block keeps its reminder while other blocks still apply", () => {
  const at = "2026-10-09T09:00:00.000Z";
  let state = confirmSyntheticAppointment(
    createConversationState(scope),
    "appointment-kept",
    "kept-confirm",
  );
  state = removeAppointmentBlock(state, {
    commandId: "kept-remove",
    appointmentRef: "appointment-kept",
    occurredAt: "2026-10-08T12:30:00.000Z",
  }).state;
  assert.equal(getActiveBlocks(state, at).length, 0);
  assert.deepEqual(
    evaluateDeliveryPermission(state, action(state, "appointment_reminder", "appointment-kept"), at),
    { allowed: true },
  );

  const paused = startManualPause(state, {
    commandId: "kept-manual",
    pauseRef: "kept",
    occurredAt: "2026-10-08T13:00:00.000Z",
  }).state;
  assert.deepEqual(
    evaluateDeliveryPermission(paused, action(paused, "appointment_reminder", "appointment-kept"), at),
    { allowed: false, reason: "blocked" },
  );

  const intervened = recordHumanIntervention(state, {
    commandId: "kept-human",
    occurredAt: "2026-10-09T08:50:00.000Z",
    durationMs: 15 * 60 * 1000,
    messageId: "kept-human-message",
  }).state;
  assert.deepEqual(
    evaluateDeliveryPermission(intervened, action(intervened, "appointment_reminder", "appointment-kept"), at),
    { allowed: false, reason: "blocked" },
  );

  const handedOff = requestHandoff(state, {
    commandId: "kept-handoff",
    handoffRef: "kept-handoff",
    occurredAt: "2026-10-08T13:00:00.000Z",
  }).state;
  assert.deepEqual(
    evaluateDeliveryPermission(handedOff, action(handedOff, "appointment_reminder", "appointment-kept"), at),
    { allowed: false, reason: "blocked" },
  );

  const withOther = confirmSyntheticAppointment(state, "appointment-other", "other-confirm");
  assert.deepEqual(
    evaluateDeliveryPermission(withOther, action(withOther, "appointment_reminder", "appointment-kept"), at),
    { allowed: false, reason: "blocked" },
  );
  assert.deepEqual(
    evaluateDeliveryPermission(withOther, action(withOther, "appointment_reminder", "appointment-other"), at),
    { allowed: true },
  );
});

test("a reminder is denied once its appointment has started, even without a block", () => {
  let state = confirmSyntheticAppointment(
    createConversationState(scope),
    "appointment-late",
    "late-confirm",
  );
  state = removeAppointmentBlock(state, {
    commandId: "late-remove",
    appointmentRef: "appointment-late",
    occurredAt: "2026-10-08T12:30:00.000Z",
  }).state;
  assert.deepEqual(
    evaluateDeliveryPermission(
      state,
      action(state, "appointment_reminder", "appointment-late"),
      "2026-10-09T13:00:00.000Z",
    ),
    { allowed: false, reason: "appointment_started" },
  );
});

test("a follow-up armed after a handoff or a confirmed appointment is suppressed", () => {
  const at = "2026-10-08T13:30:00.000Z";
  const handedOff = requestHandoff(createConversationState(scope), {
    commandId: "followup-handoff",
    handoffRef: "followup-handoff",
    occurredAt: "2026-10-08T12:00:00.000Z",
  }).state;
  assert.deepEqual(
    evaluateDeliveryPermission(handedOff, action(handedOff, "followup"), at),
    { allowed: false, reason: "blocked" },
  );

  const booked = confirmSyntheticAppointment(
    createConversationState(scope),
    "followup-appointment",
    "followup-confirm",
  );
  assert.deepEqual(
    evaluateDeliveryPermission(booked, action(booked, "followup"), at),
    { allowed: false, reason: "blocked" },
  );
});

test("a later human intervention never shortens an open handoff block", () => {
  let state = requestHandoff(createConversationState(scope), {
    commandId: "handoff-before-human",
    handoffRef: "handoff-long",
    occurredAt: "2026-10-08T12:00:00.000Z",
  }).state;
  state = recordHumanIntervention(state, {
    commandId: "human-after-handoff",
    occurredAt: "2026-10-08T12:05:00.000Z",
    durationMs: 15 * 60 * 1000,
    messageId: "human-after-handoff-message",
  }).state;
  state = expireBlocks(state, {
    commandId: "human-expiry",
    occurredAt: "2026-10-08T12:21:00.000Z",
  }).state;
  assert.deepEqual(
    getActiveBlocks(state, "2026-10-08T12:21:00.000Z").map((block) => block.type),
    ["handoff"],
  );
});
