import type {
  OmnichannelScope,
  OutboundAction,
} from "./contracts";
import type { ResumeMode } from "./policy";
import { sameScope, validateScope } from "./scope";

export type ConversationBlockType =
  | "human_intervention"
  | "manual_pause"
  | "handoff"
  | "appointment";

export type ConversationBlock = {
  blockId: string;
  type: ConversationBlockType;
  status: "active" | "ended" | "expired";
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  sourceRef: string;
};

export type HandoffRecord = {
  handoffRef: string;
  status: "open" | "resolved" | "resumed";
  requestedAt: string;
  resolvedAt: string | null;
  resumedAt: string | null;
};

export type AppointmentRecord = {
  appointmentRef: string;
  status: "confirmed" | "cancelled";
  startsAt: string;
  endsAt: string;
  timezone: string;
  toolInvocationId: string;
  // Captured from the company policy when the appointment was confirmed.
  pausedUntilEnd: boolean;
  // Action holding the single confirmation reservation; reserved, not sent.
  confirmationActionId: string | null;
};

export type ConversationState = {
  scope: OmnichannelScope;
  stateVersion: number;
  deliveryEpoch: number;
  // Counts accepted lead messages. It is separate from stateVersion and
  // deliveryEpoch so a new lead message supersedes a prepared reply without
  // invalidating unrelated automations such as reminders.
  leadMessageSeq: number;
  resumeMode: ResumeMode;
  blocks: ConversationBlock[];
  pendingMessageIds: string[];
  processedCommandIds: string[];
  handoffs: HandoffRecord[];
  appointments: AppointmentRecord[];
};

export type StateMutationResult = {
  state: ConversationState;
  duplicate: boolean;
};

function parseTime(value: string, field: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} is invalid.`);
  return timestamp;
}

function mutateOnce(
  state: ConversationState,
  commandId: string,
  mutation: (draft: ConversationState) => void,
): StateMutationResult {
  if (!commandId.trim()) throw new Error("commandId cannot be empty.");
  if (state.processedCommandIds.includes(commandId)) {
    return { duplicate: true, state };
  }

  const draft = structuredClone(state);
  mutation(draft);
  draft.processedCommandIds.push(commandId);
  draft.stateVersion += 1;
  draft.deliveryEpoch += 1;
  return { duplicate: false, state: draft };
}

function upsertBlock(
  state: ConversationState,
  block: Omit<ConversationBlock, "status">,
) {
  const index = state.blocks.findIndex((candidate) => candidate.blockId === block.blockId);
  const next: ConversationBlock = { ...block, status: "active" };
  if (index === -1) state.blocks.push(next);
  else state.blocks[index] = next;
}

function activeAt(block: ConversationBlock, at: string) {
  return (
    block.status === "active" &&
    (block.expiresAt === null || parseTime(block.expiresAt, "expiresAt") > parseTime(at, "at"))
  );
}

export function createConversationState(
  scope: OmnichannelScope,
  resumeMode: ResumeMode = "await_new_message",
): ConversationState {
  return {
    scope: validateScope(scope),
    stateVersion: 0,
    deliveryEpoch: 0,
    leadMessageSeq: 0,
    resumeMode,
    blocks: [],
    pendingMessageIds: [],
    processedCommandIds: [],
    handoffs: [],
    appointments: [],
  };
}

export function recordHumanIntervention(
  state: ConversationState,
  input: {
    commandId: string;
    occurredAt: string;
    durationMs: number;
    messageId: string;
  },
) {
  const occurredAt = parseTime(input.occurredAt, "occurredAt");
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs <= 0) {
    throw new Error("durationMs must be a positive integer.");
  }

  return mutateOnce(state, input.commandId, (draft) => {
    const existing = draft.blocks.find(
      (block) => block.blockId === "human_intervention",
    );
    const candidateExpiresAt = occurredAt + input.durationMs;
    const existingExpiresAt = existing?.expiresAt
      ? parseTime(existing.expiresAt, "expiresAt")
      : Number.NEGATIVE_INFINITY;
    const existingUpdatedAt = existing
      ? parseTime(existing.updatedAt, "updatedAt")
      : Number.NEGATIVE_INFINITY;
    const candidateControlsDeadline =
      candidateExpiresAt > existingExpiresAt ||
      (candidateExpiresAt === existingExpiresAt && occurredAt >= existingUpdatedAt);
    const createdAt = existing
      ? new Date(
          Math.min(parseTime(existing.createdAt, "createdAt"), occurredAt),
        ).toISOString()
      : input.occurredAt;
    const updatedAt = new Date(Math.max(existingUpdatedAt, occurredAt)).toISOString();

    upsertBlock(draft, {
      blockId: "human_intervention",
      type: "human_intervention",
      createdAt,
      updatedAt,
      expiresAt: new Date(
        Math.max(existingExpiresAt, candidateExpiresAt),
      ).toISOString(),
      sourceRef: candidateControlsDeadline
        ? input.messageId
        : (existing?.sourceRef ?? input.messageId),
    });
  });
}

export function recordLeadMessage(
  state: ConversationState,
  input: { commandId: string; messageId: string; occurredAt: string },
) {
  parseTime(input.occurredAt, "occurredAt");
  if (!input.commandId.trim() || !input.messageId.trim()) {
    throw new Error("Lead message command and message IDs cannot be empty.");
  }
  if (state.processedCommandIds.includes(input.commandId)) {
    return { duplicate: true, state, leadMessageSeq: state.leadMessageSeq };
  }

  const draft = structuredClone(state);
  draft.processedCommandIds.push(input.commandId);
  draft.leadMessageSeq += 1;
  return { duplicate: false, state: draft, leadMessageSeq: draft.leadMessageSeq };
}

export function startManualPause(
  state: ConversationState,
  input: {
    commandId: string;
    pauseRef: string;
    occurredAt: string;
    expiresAt?: string;
  },
) {
  const occurredAt = parseTime(input.occurredAt, "occurredAt");
  if (
    input.expiresAt &&
    parseTime(input.expiresAt, "expiresAt") <= occurredAt
  ) {
    throw new Error("Manual pause expiration must be after its start.");
  }

  return mutateOnce(state, input.commandId, (draft) => {
    upsertBlock(draft, {
      blockId: `manual:${input.pauseRef}`,
      type: "manual_pause",
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      expiresAt: input.expiresAt ?? null,
      sourceRef: input.pauseRef,
    });
  });
}

export function endManualPause(
  state: ConversationState,
  input: { commandId: string; pauseRef: string; occurredAt: string },
) {
  return endSpecificBlock(state, {
    blockId: `manual:${input.pauseRef}`,
    commandId: input.commandId,
    occurredAt: input.occurredAt,
  });
}

export function requestHandoff(
  state: ConversationState,
  input: { commandId: string; handoffRef: string; occurredAt: string },
) {
  parseTime(input.occurredAt, "occurredAt");
  if (state.handoffs.some((handoff) => handoff.handoffRef === input.handoffRef)) {
    return { duplicate: true, state } satisfies StateMutationResult;
  }
  return mutateOnce(state, input.commandId, (draft) => {
    draft.handoffs.push({
      handoffRef: input.handoffRef,
      requestedAt: input.occurredAt,
      resolvedAt: null,
      resumedAt: null,
      status: "open",
    });
    upsertBlock(draft, {
      blockId: `handoff:${input.handoffRef}`,
      type: "handoff",
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      expiresAt: null,
      sourceRef: input.handoffRef,
    });
  });
}

export function resolveHandoff(
  state: ConversationState,
  input: { commandId: string; handoffRef: string; occurredAt: string },
) {
  parseTime(input.occurredAt, "occurredAt");
  const current = state.handoffs.find(
    (candidate) => candidate.handoffRef === input.handoffRef,
  );
  if (current?.status === "resolved" || current?.status === "resumed") {
    return { duplicate: true, state } satisfies StateMutationResult;
  }
  return mutateOnce(state, input.commandId, (draft) => {
    const handoff = draft.handoffs.find(
      (candidate) => candidate.handoffRef === input.handoffRef,
    );
    if (!handoff || handoff.status !== "open") {
      throw new Error("Only an open handoff can be resolved.");
    }
    handoff.status = "resolved";
    handoff.resolvedAt = input.occurredAt;
  });
}

export function resumeHandoff(
  state: ConversationState,
  input: { commandId: string; handoffRef: string; occurredAt: string },
) {
  parseTime(input.occurredAt, "occurredAt");
  const handoff = state.handoffs.find(
    (candidate) => candidate.handoffRef === input.handoffRef,
  );
  if (handoff?.status === "resumed") {
    return { duplicate: true, state } satisfies StateMutationResult;
  }
  if (!handoff || handoff.status !== "resolved") {
    throw new Error("Handoff must be resolved before it can be resumed.");
  }

  return mutateOnce(state, input.commandId, (draft) => {
    const draftHandoff = draft.handoffs.find(
      (candidate) => candidate.handoffRef === input.handoffRef,
    );
    if (!draftHandoff) throw new Error("Handoff not found.");
    draftHandoff.status = "resumed";
    draftHandoff.resumedAt = input.occurredAt;
    const block = draft.blocks.find(
      (candidate) => candidate.blockId === `handoff:${input.handoffRef}`,
    );
    if (!block) throw new Error("Handoff block not found.");
    block.status = "ended";
    block.updatedAt = input.occurredAt;
  });
}

export function confirmAppointment(
  state: ConversationState,
  input: {
    commandId: string;
    appointmentRef: string;
    occurredAt: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    toolInvocationId: string;
    // Comes from the company policy; it is never inferred here.
    pauseUntilEnd: boolean;
  },
) {
  if (typeof input.pauseUntilEnd !== "boolean") {
    throw new Error("pauseUntilEnd must come from the company policy.");
  }
  if (parseTime(input.endsAt, "endsAt") <= parseTime(input.startsAt, "startsAt")) {
    throw new Error("Appointment end must be after its start.");
  }

  const current = state.appointments.find(
    (appointment) => appointment.appointmentRef === input.appointmentRef,
  );
  if (current) {
    const sameAppointment =
      current.startsAt === input.startsAt &&
      current.endsAt === input.endsAt &&
      current.timezone === input.timezone;
    if (!sameAppointment) {
      throw new Error("Appointment reference conflicts with existing data.");
    }
    return { duplicate: true, state } satisfies StateMutationResult;
  }

  return mutateOnce(state, input.commandId, (draft) => {
    draft.appointments.push({
      appointmentRef: input.appointmentRef,
      endsAt: input.endsAt,
      startsAt: input.startsAt,
      status: "confirmed",
      timezone: input.timezone,
      toolInvocationId: input.toolInvocationId,
      pausedUntilEnd: input.pauseUntilEnd,
      confirmationActionId: null,
    });
    if (!input.pauseUntilEnd) return;
    upsertBlock(draft, {
      blockId: `appointment:${input.appointmentRef}`,
      type: "appointment",
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      expiresAt: input.endsAt,
      sourceRef: input.appointmentRef,
    });
  });
}

// D2: the single confirmation is reserved when its delivery is claimed, in
// the same step as the claim. A reservation is not a delivery: an uncertain
// result keeps it and only a definitive failure releases it. Neither changes
// state_version, because the confirmation is the final action of its plan.
export function reserveAppointmentConfirmation(
  state: ConversationState,
  input: { appointmentRef: string; actionId: string },
) {
  if (!input.actionId.trim()) throw new Error("actionId cannot be empty.");
  const current = state.appointments.find(
    (candidate) => candidate.appointmentRef === input.appointmentRef,
  );
  if (!current) throw new Error("Appointment not found.");
  if (current.confirmationActionId === input.actionId) return state;
  if (current.confirmationActionId !== null) {
    throw new Error("Appointment confirmation is already reserved.");
  }
  const draft = structuredClone(state);
  const appointment = draft.appointments.find(
    (candidate) => candidate.appointmentRef === input.appointmentRef,
  );
  if (appointment) appointment.confirmationActionId = input.actionId;
  return draft;
}

export function releaseAppointmentConfirmation(
  state: ConversationState,
  input: { appointmentRef: string; actionId: string },
) {
  const current = state.appointments.find(
    (candidate) => candidate.appointmentRef === input.appointmentRef,
  );
  if (!current || current.confirmationActionId !== input.actionId) return state;
  const draft = structuredClone(state);
  const appointment = draft.appointments.find(
    (candidate) => candidate.appointmentRef === input.appointmentRef,
  );
  if (appointment) appointment.confirmationActionId = null;
  return draft;
}

export function cancelAppointment(
  state: ConversationState,
  input: {
    commandId: string;
    appointmentRef: string;
    occurredAt: string;
    toolInvocationId: string;
  },
) {
  parseTime(input.occurredAt, "occurredAt");
  const current = state.appointments.find(
    (candidate) => candidate.appointmentRef === input.appointmentRef,
  );
  if (current?.status === "cancelled") {
    return { duplicate: true, state } satisfies StateMutationResult;
  }
  return mutateOnce(state, input.commandId, (draft) => {
    const appointment = draft.appointments.find(
      (candidate) => candidate.appointmentRef === input.appointmentRef,
    );
    if (!appointment) throw new Error("Appointment not found.");
    appointment.status = "cancelled";
    appointment.toolInvocationId = input.toolInvocationId;
      const block = draft.blocks.find(
        (candidate) => candidate.blockId === `appointment:${input.appointmentRef}`,
      );
      if (block?.status === "active") {
        block.updatedAt = input.occurredAt;
      }
    });
}

export function removeAppointmentBlock(
  state: ConversationState,
  input: { commandId: string; appointmentRef: string; occurredAt: string },
) {
  return endSpecificBlock(state, {
    blockId: `appointment:${input.appointmentRef}`,
    commandId: input.commandId,
    occurredAt: input.occurredAt,
  });
}

function endSpecificBlock(
  state: ConversationState,
  input: { commandId: string; blockId: string; occurredAt: string },
) {
  parseTime(input.occurredAt, "occurredAt");
  return mutateOnce(state, input.commandId, (draft) => {
    const block = draft.blocks.find(
      (candidate) => candidate.blockId === input.blockId,
    );
    if (!block || block.status !== "active") {
      throw new Error("Active block not found.");
    }
    block.status = "ended";
    block.updatedAt = input.occurredAt;
  });
}

export function queuePendingMessage(
  state: ConversationState,
  input: { commandId: string; messageId: string; occurredAt: string },
) {
  if (getActiveBlocks(state, input.occurredAt).length === 0) {
    throw new Error("A message is pending only while automation is blocked.");
  }

  // D1: a pending lead message does not change blocks, so state_version and
  // delivery_epoch stay put and reminders prepared earlier remain valid.
  if (state.processedCommandIds.includes(input.commandId)) {
    return { duplicate: true, state } satisfies StateMutationResult;
  }
  const draft = structuredClone(state);
  draft.processedCommandIds.push(input.commandId);
  if (!draft.pendingMessageIds.includes(input.messageId)) {
    draft.pendingMessageIds.push(input.messageId);
  }
  return { duplicate: false, state: draft } satisfies StateMutationResult;
}

export function expireBlocks(
  state: ConversationState,
  input: { commandId: string; occurredAt: string },
) {
  const expiredIds = state.blocks
    .filter(
      (block) =>
        block.status === "active" &&
        block.expiresAt !== null &&
        parseTime(block.expiresAt, "expiresAt") <= parseTime(input.occurredAt, "occurredAt"),
    )
    .map((block) => block.blockId);

  if (expiredIds.length === 0) {
    return { duplicate: false, state } satisfies StateMutationResult;
  }

  return mutateOnce(state, input.commandId, (draft) => {
    for (const block of draft.blocks) {
      if (expiredIds.includes(block.blockId)) {
        block.status = "expired";
        block.updatedAt = input.occurredAt;
      }
    }
  });
}

export function getActiveBlocks(state: ConversationState, at: string) {
  return state.blocks.filter((block) => activeAt(block, at));
}

export function getResumeDecision(state: ConversationState, at: string) {
  if (getActiveBlocks(state, at).length > 0 || state.pendingMessageIds.length === 0) {
    return "none" as const;
  }

  return state.resumeMode;
}

export type DeliveryPermission =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "scope_mismatch"
        | "state_changed"
        | "blocked"
        | "appointment_cancelled"
        | "appointment_not_found"
        | "appointment_started"
        | "appointment_confirmation_already_sent";
    };

const appointmentBoundKinds = new Set<OutboundAction["kind"]>([
  "appointment_reminder",
  "appointment_confirmation",
]);

// An appointment block admits only the reminder and the single confirmation of
// its own appointment; every other active block, including another
// appointment, keeps blocking them.
function blocksAction(block: ConversationBlock, action: OutboundAction) {
  if (block.type !== "appointment") return true;
  return !(appointmentBoundKinds.has(action.kind) && block.sourceRef === action.source_ref);
}

export function evaluateDeliveryPermission(
  state: ConversationState,
  action: OutboundAction,
  at: string,
): DeliveryPermission {
  if (!sameScope(state.scope, action.scope)) {
    return { allowed: false, reason: "scope_mismatch" };
  }

  if (
    action.captured_state.state_version !== state.stateVersion ||
    action.captured_state.delivery_epoch !== state.deliveryEpoch
  ) {
    return { allowed: false, reason: "state_changed" };
  }

  const activeBlocks = getActiveBlocks(state, at);
  if (activeBlocks.some((block) => blocksAction(block, action))) {
    return { allowed: false, reason: "blocked" };
  }

  if (appointmentBoundKinds.has(action.kind)) {
    const appointment = state.appointments.find(
      (candidate) => candidate.appointmentRef === action.source_ref,
    );
    if (!appointment) return { allowed: false, reason: "appointment_not_found" };
    if (appointment.status === "cancelled") {
      return { allowed: false, reason: "appointment_cancelled" };
    }
    // Removing the appointment block manually keeps reminders and the
    // confirmation; both stop once the appointment has started.
    if (parseTime(appointment.startsAt, "startsAt") <= parseTime(at, "at")) {
      return { allowed: false, reason: "appointment_started" };
    }
    if (
      action.kind === "appointment_confirmation" &&
      appointment.confirmationActionId !== null &&
      appointment.confirmationActionId !== action.action_id
    ) {
      return { allowed: false, reason: "appointment_confirmation_already_sent" };
    }
  }

  return { allowed: true };
}
