import assert from "node:assert/strict";
import test from "node:test";

import { validateBrainResult } from "../lib/omnichannel/brain-boundary";
import { applyBrainResult } from "../lib/omnichannel/brain-result-apply";
import type {
  BrainRequest,
  BrainResult,
  OmnichannelScope,
  OutboundAction,
} from "../lib/omnichannel/contracts";
import { createDeliveryPlan, executeDeliveryPlan } from "../lib/omnichannel/delivery-plan";
import { FakeProviderSendAdapter } from "../lib/omnichannel/fake-adapters";
import {
  OmnichannelPolicyUnavailableError,
  SimulatedCentralPolicyStore,
  type CompanyOmnichannelPolicy,
  type OmnichannelPolicy,
} from "../lib/omnichannel/policy";
import {
  cancelAppointment,
  confirmAppointment,
  createConversationState,
  evaluateDeliveryPermission,
  getActiveBlocks,
  reserveAppointmentConfirmation,
  recordHumanIntervention,
  startManualPause,
  type ConversationState,
} from "../lib/omnichannel/state-machine";

// Both companies share channel and external conversation identifier on
// purpose: only environment, company and account separate them.
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

function policy(pauseAfterConfirmation: boolean): OmnichannelPolicy {
  return {
    resumeMode: "await_new_message",
    humanInterventionDurationMs: 15 * 60 * 1000,
    bufferWindowMs: 60_000,
    appointment: {
      pauseAfterConfirmation,
      cancellationKeepsBlock: true,
      cancelledReminderAllowed: false,
    },
  };
}

function record(
  cliente_slug: string,
  pauseAfterConfirmation: boolean,
  overrides: Partial<CompanyOmnichannelPolicy> = {},
): CompanyOmnichannelPolicy {
  return {
    environment: "isolated_test",
    cliente_slug,
    policy_version: `${cliente_slug}-v1`,
    status: "active",
    policy: policy(pauseAfterConfirmation),
    ...overrides,
  };
}

const records = [record("empresa_sintetica_a", true), record("empresa_sintetica_b", false)];

const requestedAt = "2026-10-08T12:00:00.000Z";
const deliveredAt = "2026-10-08T12:00:20.000Z";
const startsAt = "2026-10-09T13:00:00.000Z";
const endsAt = "2026-10-09T14:00:00.000Z";

function uuid(prefix: string, n: number) {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function brainRequest(scope: OmnichannelScope, state: ConversationState, invocation: string): BrainRequest {
  return {
    schema_version: "lexia.brain.request.v1",
    invocation_id: invocation,
    correlation_id: uuid("cccccccc", 1),
    scope,
    state: { state_version: state.stateVersion, delivery_epoch: state.deliveryEpoch },
    messages: [],
    contact: {},
    operational_context: {
      summary: "Synthetic booking",
      language: "pt-BR",
      intent: "booking",
      topic: { current: "booking", changed: false, resumed_previous: false },
      confidence: 1,
      missing_information: [],
      contact_updates: {},
      scheduling_intent: {},
    },
    company_fields: {},
    policy: {},
    capabilities: ["appointment.confirmed"],
  };
}

function bookingResult(
  request: BrainRequest,
  appointmentRef: string,
  options: { confirmationLast?: boolean; extraConfirmation?: boolean; withEvent?: boolean } = {},
): BrainResult {
  const action = (n: number, kind: OutboundAction["kind"], sequence: number): OutboundAction => ({
    schema_version: "lexia.outbound.action.v1",
    action_id: uuid("dddddddd", n),
    invocation_id: request.invocation_id,
    scope: request.scope,
    sequence,
    kind,
    captured_state: { ...request.state },
    content: { type: "text", text: kind === "reply" ? "Synthetic reply" : "Synthetic confirmation" },
    ...(kind === "appointment_confirmation" ? { source_ref: appointmentRef } : {}),
  });
  const confirmationLast = options.confirmationLast ?? true;
  const actions = confirmationLast
    ? [action(1, "reply", 1), action(2, "appointment_confirmation", 2)]
    : [action(2, "appointment_confirmation", 1), action(1, "reply", 2)];
  if (options.extraConfirmation) actions.push(action(3, "appointment_confirmation", 3));

  return {
    schema_version: "lexia.brain.result.v1",
    invocation_id: request.invocation_id,
    captured_state: { ...request.state },
    decision: "reply",
    actions,
    context_patch: {},
    domain_events: options.withEvent === false ? [] : [{
      schema_version: "lexia.domain.event.v1",
      event_id: uuid("eeeeeeee", 1),
      invocation_id: request.invocation_id,
      idempotency_key: `${appointmentRef}-confirmed`,
      type: "appointment.confirmed",
      occurred_at: requestedAt,
      appointment: {
        appointment_ref: appointmentRef,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: "America/New_York",
        tool_invocation_id: `tool-${appointmentRef}`,
        status: "confirmed",
      },
    }],
    tool_audit: [{
      tool_name: "fake_calendar_create",
      invocation_id: `tool-${appointmentRef}`,
      operation: "appointment.create",
      result: "succeeded",
      appointment_ref: appointmentRef,
    }],
  };
}

async function deliver(state: ConversationState, actions: OutboundAction[]) {
  const adapter = new FakeProviderSendAdapter(
    Object.fromEntries(actions.map((a, i) => [a.action_id, { status: "sent" as const, providerMessageId: `p-${i}` }])),
  );
  const plan = await executeDeliveryPlan(createDeliveryPlan(actions), {
    loadCurrentState: async () => state,
    send: (action) => adapter.send(action),
    now: () => deliveredAt,
  });
  return { plan, adapter };
}

function followAction(state: ConversationState, scope: OmnichannelScope, kind: OutboundAction["kind"], n: number, sourceRef?: string): OutboundAction {
  return {
    schema_version: "lexia.outbound.action.v1",
    action_id: uuid("ffffffff", n),
    invocation_id: uuid("ffffffff", 100 + n),
    scope,
    sequence: 1,
    kind,
    captured_state: { state_version: state.stateVersion, delivery_epoch: state.deliveryEpoch },
    content: { type: "text", text: "Synthetic follow" },
    ...(sourceRef ? { source_ref: sourceRef } : {}),
  };
}

test("each company resolves only its own post-appointment policy", async () => {
  const store = new SimulatedCentralPolicyStore(records);
  const results = [];
  for (const scope of [scopeA, scopeB, scopeA, scopeB]) {
    results.push((await store.getActiveForScope(scope)).policy.appointment.pauseAfterConfirmation);
  }
  assert.deepEqual(results, [true, false, true, false]);
  assert.deepEqual(
    store.lookups.map((lookup) => lookup.cliente_slug),
    ["empresa_sintetica_a", "empresa_sintetica_b", "empresa_sintetica_a", "empresa_sintetica_b"],
  );

  const changedB = new SimulatedCentralPolicyStore([records[0]!, record("empresa_sintetica_b", true, { policy_version: "b-v2" })]);
  assert.equal((await changedB.getActiveForScope(scopeA)).policy.appointment.pauseAfterConfirmation, true);
  assert.equal((await changedB.getActiveForScope(scopeB)).policyVersion, "b-v2");
});

test("a missing, duplicated, inactive, other-environment or invalid policy fails closed", async () => {
  const unavailable = async (store: SimulatedCentralPolicyStore, scope: OmnichannelScope) =>
    assert.rejects(store.getActiveForScope(scope), OmnichannelPolicyUnavailableError);

  await unavailable(new SimulatedCentralPolicyStore(records), { ...scopeA, cliente_slug: "empresa_sintetica_c" });
  await unavailable(new SimulatedCentralPolicyStore(records), { ...scopeA, environment: "staging" });
  await unavailable(
    new SimulatedCentralPolicyStore([...records, record("empresa_sintetica_a", false, { policy_version: "a-v2" })]),
    scopeA,
  );
  await unavailable(new SimulatedCentralPolicyStore([record("empresa_sintetica_a", true, { status: "inactive" })]), scopeA);

  const withoutChoice = record("empresa_sintetica_a", true);
  delete (withoutChoice.policy.appointment as Partial<OmnichannelPolicy["appointment"]>).pauseAfterConfirmation;
  await unavailable(new SimulatedCentralPolicyStore([withoutChoice]), scopeA);

  assert.throws(
    () => confirmAppointment(createConversationState(scopeA), {
      commandId: "no-policy",
      appointmentRef: "no-policy",
      occurredAt: requestedAt,
      startsAt,
      endsAt,
      timezone: "America/New_York",
      toolInvocationId: "tool-no-policy",
    } as unknown as Parameters<typeof confirmAppointment>[1]),
    /company policy/,
  );
});

test("pause enabled: one tool-bound confirmation, then a block until the appointment ends", async () => {
  const { policy: policyA } = await new SimulatedCentralPolicyStore(records).getActiveForScope(scopeA);
  const initial = createConversationState(scopeA);
  const request = brainRequest(scopeA, initial, uuid("aaaaaaaa", 501));
  const result = validateBrainResult(request, bookingResult(request, "appointment-a"));

  const applied = applyBrainResult(initial, { request, result, policy: policyA, at: deliveredAt });
  assert.equal(applied.rebased, true);
  assert.deepEqual(applied.actions.map((action) => [action.kind, action.sequence]), [["appointment_confirmation", 1]]);
  assert.deepEqual(getActiveBlocks(applied.state, deliveredAt).map((block) => block.expiresAt), [new Date(endsAt).toISOString()]);

  const { plan, adapter } = await deliver(applied.state, applied.actions);
  assert.deepEqual(plan.items.map((item) => item.status), ["sent"]);
  assert.equal(adapter.calls.length, 1);

  // D2: the single confirmation is reserved when its delivery is claimed.
  const state = reserveAppointmentConfirmation(applied.state, {
    appointmentRef: "appointment-a",
    actionId: applied.actions[0]!.action_id,
  });
  const at = "2026-10-09T09:00:00.000Z";
  assert.deepEqual(evaluateDeliveryPermission(state, followAction(state, scopeA, "reply", 1), at), { allowed: false, reason: "blocked" });
  assert.deepEqual(evaluateDeliveryPermission(state, followAction(state, scopeA, "followup", 2), at), { allowed: false, reason: "blocked" });
  assert.deepEqual(
    evaluateDeliveryPermission(state, followAction(state, scopeA, "appointment_confirmation", 3, "appointment-a"), at),
    { allowed: false, reason: "appointment_confirmation_already_sent" },
  );
  assert.deepEqual(
    evaluateDeliveryPermission(state, followAction(state, scopeA, "appointment_reminder", 4, "appointment-a"), at),
    { allowed: true },
  );
  assert.equal(getActiveBlocks(state, "2026-10-09T14:00:01.000Z").length, 0);
});

test("pause enabled still respects other blocks for the confirmation", async () => {
  const paused = startManualPause(createConversationState(scopeA), {
    commandId: "manual-before-booking",
    pauseRef: "manual",
    occurredAt: "2026-10-08T11:59:00.000Z",
  }).state;
  const request = brainRequest(scopeA, paused, uuid("aaaaaaaa", 502));
  const result = validateBrainResult(request, bookingResult(request, "appointment-a2"));
  const applied = applyBrainResult(paused, { request, result, policy: policy(true), at: deliveredAt });

  const { plan, adapter } = await deliver(applied.state, applied.actions);
  assert.equal(adapter.calls.length, 0);
  assert.deepEqual(plan.items.map((item) => [item.status, item.reason]), [["suppressed", "blocked"]]);
});

test("pause disabled: the appointment creates no block and other blocks still apply", async () => {
  const { policy: policyB } = await new SimulatedCentralPolicyStore(records).getActiveForScope(scopeB);
  const initial = createConversationState(scopeB);
  const request = brainRequest(scopeB, initial, uuid("bbbbbbbb", 601));
  const result = validateBrainResult(request, bookingResult(request, "appointment-b"));

  const applied = applyBrainResult(initial, { request, result, policy: policyB, at: deliveredAt });
  assert.equal(getActiveBlocks(applied.state, deliveredAt).length, 0);
  assert.equal(applied.state.appointments[0]?.pausedUntilEnd, false);
  assert.deepEqual(applied.actions.map((action) => action.kind), ["reply", "appointment_confirmation"]);

  const { plan } = await deliver(applied.state, applied.actions);
  assert.deepEqual(plan.items.map((item) => item.status), ["sent", "sent"]);

  const at = "2026-10-09T09:00:00.000Z";
  const state = applied.state;
  assert.deepEqual(evaluateDeliveryPermission(state, followAction(state, scopeB, "reply", 11), at), { allowed: true });
  assert.deepEqual(evaluateDeliveryPermission(state, followAction(state, scopeB, "followup", 12), at), { allowed: true });
  assert.deepEqual(
    evaluateDeliveryPermission(state, followAction(state, scopeB, "appointment_reminder", 13, "appointment-b"), at),
    { allowed: true },
  );

  const paused = startManualPause(state, { commandId: "manual-b", pauseRef: "b", occurredAt: "2026-10-09T08:00:00.000Z" }).state;
  assert.deepEqual(evaluateDeliveryPermission(paused, followAction(paused, scopeB, "reply", 14), at), { allowed: false, reason: "blocked" });
  assert.deepEqual(
    evaluateDeliveryPermission(paused, followAction(paused, scopeB, "appointment_reminder", 15, "appointment-b"), at),
    { allowed: false, reason: "blocked" },
  );

  const cancelled = cancelAppointment(state, {
    commandId: "cancel-b", appointmentRef: "appointment-b", occurredAt: "2026-10-09T08:00:00.000Z", toolInvocationId: "tool-cancel-b",
  }).state;
  assert.equal(getActiveBlocks(cancelled, at).length, 0);
  assert.deepEqual(
    evaluateDeliveryPermission(cancelled, followAction(cancelled, scopeB, "appointment_reminder", 16, "appointment-b"), at),
    { allowed: false, reason: "appointment_cancelled" },
  );
});

test("the same booking produces each company's own result and never crosses scopes", async () => {
  const store = new SimulatedCentralPolicyStore(records);
  const stateA = createConversationState(scopeA);
  const stateB = createConversationState(scopeB);
  const requestA = brainRequest(scopeA, stateA, uuid("aaaaaaaa", 701));
  const requestB = brainRequest(scopeB, stateB, uuid("bbbbbbbb", 701));
  const resultA = validateBrainResult(requestA, bookingResult(requestA, "appointment-shared"));
  const resultB = validateBrainResult(requestB, bookingResult(requestB, "appointment-shared"));

  const appliedA = applyBrainResult(stateA, { request: requestA, result: resultA, policy: (await store.getActiveForScope(scopeA)).policy, at: deliveredAt });
  const appliedB = applyBrainResult(stateB, { request: requestB, result: resultB, policy: (await store.getActiveForScope(scopeB)).policy, at: deliveredAt });
  assert.equal(getActiveBlocks(appliedA.state, deliveredAt).length, 1);
  assert.equal(getActiveBlocks(appliedB.state, deliveredAt).length, 0);
  assert.equal(appliedA.actions.length, 1);
  assert.equal(appliedB.actions.length, 2);

  assert.throws(() => validateBrainResult(requestB, { ...resultA, invocation_id: requestB.invocation_id }), /another scope|invocation/);
  assert.deepEqual(
    evaluateDeliveryPermission(appliedB.state, appliedA.actions[0]!, deliveredAt),
    { allowed: false, reason: "scope_mismatch" },
  );
});

test("a confirmation must be unique, final and bound to a tool-created appointment", () => {
  const state = createConversationState(scopeA);
  const request = brainRequest(scopeA, state, uuid("aaaaaaaa", 801));
  assert.throws(() => validateBrainResult(request, bookingResult(request, "x", { extraConfirmation: true })), /Only one/);
  assert.throws(() => validateBrainResult(request, bookingResult(request, "x", { confirmationLast: false })), /final action/);
  assert.throws(() => validateBrainResult(request, bookingResult(request, "x", { withEvent: false })), /tool-created/);

  const reprocessRequest: BrainRequest = {
    ...request,
    reprocess: {
      superseded_invocation_ids: [uuid("aaaaaaaa", 800)],
      delivered_action_ids: [],
      executed_tool_effects: [{ tool_name: "fake_calendar_create", invocation_id: "tool-x", operation: "appointment.create", result: "succeeded", appointment_ref: "x" }],
    },
  };
  assert.doesNotThrow(() => validateBrainResult(reprocessRequest, bookingResult(reprocessRequest, "x", { withEvent: false })));
});

test("a change between the brain call and the result keeps actions stale", async () => {
  const initial = createConversationState(scopeB);
  const request = brainRequest(scopeB, initial, uuid("bbbbbbbb", 901));
  const result = validateBrainResult(request, bookingResult(request, "appointment-stale"));
  const intervened = recordHumanIntervention(initial, {
    commandId: "human-during-brain", occurredAt: "2026-10-08T12:00:05.000Z", durationMs: 60_000, messageId: "h-1",
  }).state;

  const applied = applyBrainResult(intervened, { request, result, policy: policy(false), at: "2026-10-08T12:02:00.000Z" });
  assert.equal(applied.rebased, false);
  assert.equal(applied.state.appointments.length, 1);
  const { plan, adapter } = await deliver(applied.state, applied.actions);
  assert.equal(adapter.calls.length, 0);
  assert.equal(plan.items[0]?.reason, "state_changed");
});
