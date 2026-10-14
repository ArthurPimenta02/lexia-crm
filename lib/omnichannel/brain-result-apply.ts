import type { BrainRequest, BrainResult, OutboundAction } from "./contracts";
import type { OmnichannelPolicy } from "./policy";
import {
  cancelAppointment,
  confirmAppointment,
  getActiveBlocks,
  requestHandoff,
  type ConversationState,
} from "./state-machine";

// Applies the domain events of an already validated brain result and prepares
// the actions that may enter the delivery plan.
//
// - Events are real effects and are always applied, idempotently.
// - The post-appointment pause comes from the company policy.
// - If nothing else changed the conversation between the brain call and this
//   step, the actions are rebased on the state produced by their own events;
//   otherwise they keep the old snapshot and the gate suppresses them.
// - While an appointment block is active, only the single confirmation bound
//   to that appointment is kept.
export function applyBrainResult(
  state: ConversationState,
  input: {
    request: BrainRequest;
    result: BrainResult;
    policy: OmnichannelPolicy;
    at: string;
  },
) {
  const unchangedSinceRequest =
    state.stateVersion === input.request.state.state_version &&
    state.deliveryEpoch === input.request.state.delivery_epoch;

  let next = state;
  for (const event of input.result.domain_events) {
    if (event.type === "appointment.confirmed") {
      next = confirmAppointment(next, {
        commandId: event.idempotency_key,
        appointmentRef: event.appointment.appointment_ref,
        occurredAt: event.occurred_at,
        startsAt: event.appointment.starts_at,
        endsAt: event.appointment.ends_at,
        timezone: event.appointment.timezone,
        toolInvocationId: event.appointment.tool_invocation_id,
        pauseUntilEnd: input.policy.appointment.pauseAfterConfirmation,
      }).state;
    } else if (event.type === "appointment.cancelled") {
      next = cancelAppointment(next, {
        commandId: event.idempotency_key,
        appointmentRef: event.appointment.appointment_ref,
        occurredAt: event.occurred_at,
        toolInvocationId: event.appointment.tool_invocation_id,
      }).state;
    } else {
      next = requestHandoff(next, {
        commandId: event.idempotency_key,
        handoffRef: event.handoff.handoff_ref,
        occurredAt: event.occurred_at,
      }).state;
    }
  }

  const activeAppointmentRefs = getActiveBlocks(next, input.at)
    .filter((block) => block.type === "appointment")
    .map((block) => block.sourceRef);

  let actions: OutboundAction[] = [...input.result.actions].sort(
    (left, right) => left.sequence - right.sequence,
  );
  if (activeAppointmentRefs.length > 0) {
    actions = actions.filter(
      (action) =>
        action.kind === "appointment_confirmation" &&
        activeAppointmentRefs.includes(action.source_ref ?? ""),
    );
  }

  const snapshot = {
    state_version: next.stateVersion,
    delivery_epoch: next.deliveryEpoch,
  };
  actions = actions.map((action, index) => ({
    ...structuredClone(action),
    sequence: index + 1,
    ...(unchangedSinceRequest ? { captured_state: { ...snapshot } } : {}),
  }));

  return { state: next, actions, rebased: unchangedSinceRequest };
}
