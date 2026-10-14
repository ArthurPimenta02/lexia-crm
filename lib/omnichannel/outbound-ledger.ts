import { ContractValidationError, type OutboundAction } from "./contracts";
import { assertSameScope, sameScope } from "./scope";
import {
  evaluateDeliveryPermission,
  releaseAppointmentConfirmation,
  reserveAppointmentConfirmation,
  type ConversationState,
} from "./state-machine";

// Durable outbound ledger, mirroring lexia_omni_prepare/claim/finish in the
// Lot 2 migration. Only a claim that returns acquired = true may contact the
// provider, and only with its own claimant and fencing token.

export type LedgerStatus =
  | "prepared"
  | "claimed"
  | "sent"
  | "failed"
  | "delivery_unknown"
  | "suppressed";

export type LedgerEntry = {
  action: OutboundAction;
  leadCutoffSeq: number | null;
  status: LedgerStatus;
  reason: string | null;
  attempts: number;
  claimedBy: string | null;
  claimFencing: number | null;
  providerMessageId: string | null;
};

export type OutboundLedger = {
  fencingCounter: number;
  entries: Record<string, LedgerEntry>;
};

export const SUPERSEDED_BY_NEW_MESSAGE = "superseded_by_new_message";
const appointmentBound = new Set<OutboundAction["kind"]>([
  "appointment_reminder",
  "appointment_confirmation",
]);

export function createOutboundLedger(): OutboundLedger {
  return { fencingCounter: 0, entries: {} };
}

function requireText(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new ContractValidationError(code);
  }
}

function requireInteger(value: unknown, code: string): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new ContractValidationError(code);
}

function planEntries(ledger: OutboundLedger, action: OutboundAction) {
  return Object.values(ledger.entries)
    .filter(
      (entry) =>
        entry.action.invocation_id === action.invocation_id &&
        sameScope(entry.action.scope, action.scope),
    )
    .sort((left, right) => left.action.sequence - right.action.sequence);
}

export function prepareOutboundActions(
  ledger: OutboundLedger,
  input: { actions: readonly OutboundAction[]; leadCutoffSeq: number | null },
) {
  const actions = [...input.actions].sort((left, right) => left.sequence - right.sequence);
  if (actions.length === 0) throw new ContractValidationError("outbound_actions_required");
  const first = actions[0]!;
  actions.forEach((action, index) => {
    assertSameScope(first.scope, action.scope, "Outbound action");
    if (action.invocation_id !== first.invocation_id || action.sequence !== index + 1) {
      throw new ContractValidationError("outbound_sequences_must_be_contiguous");
    }
  });
  const confirmations = actions.filter((action) => action.kind === "appointment_confirmation");
  if (
    confirmations.length > 1 ||
    (confirmations.length === 1 && confirmations[0] !== actions[actions.length - 1])
  ) {
    throw new ContractValidationError("appointment_confirmation_must_be_unique_and_final");
  }
  const needsCutoff = actions.some((a) => a.kind === "reply" || a.kind === "appointment_confirmation");
  if (needsCutoff && input.leadCutoffSeq === null) {
    throw new ContractValidationError("lead_cutoff_required_for_replies");
  }
  // D1: reminders are never superseded by lead messages.
  if (input.leadCutoffSeq !== null && actions.some((a) => a.kind === "appointment_reminder")) {
    throw new ContractValidationError("reminders_do_not_carry_lead_cutoff");
  }
  if (input.leadCutoffSeq !== null) requireInteger(input.leadCutoffSeq, "lead_cutoff_invalid");

  const draft = structuredClone(ledger);
  for (const action of actions) {
    const existing = draft.entries[action.action_id];
    if (existing) {
      if (
        existing.action.invocation_id !== action.invocation_id ||
        existing.action.sequence !== action.sequence ||
        existing.action.kind !== action.kind ||
        !sameScope(existing.action.scope, action.scope)
      ) {
        throw new ContractValidationError("outbound_action_conflict");
      }
      continue;
    }
    draft.entries[action.action_id] = {
      action: structuredClone(action),
      leadCutoffSeq: input.leadCutoffSeq,
      status: "prepared",
      reason: null,
      attempts: 0,
      claimedBy: null,
      claimFencing: null,
      providerMessageId: null,
    };
  }
  return draft;
}

// D4: once an action is suppressed, the unsent remainder of its plan is
// suppressed too; sent actions are kept.
function suppressPlan(ledger: OutboundLedger, actionId: string, reason: string) {
  const entry = ledger.entries[actionId]!;
  entry.status = "suppressed";
  entry.reason = reason;
  for (const later of planEntries(ledger, entry.action)) {
    if (later.action.sequence > entry.action.sequence && later.status === "prepared") {
      later.status = "suppressed";
      later.reason = reason === SUPERSEDED_BY_NEW_MESSAGE ? reason : "plan_interrupted";
    }
  }
}

export type ClaimResult = {
  acquired: boolean;
  status: LedgerStatus;
  reason: string | null;
  fencingToken: number | null;
  ledger: OutboundLedger;
  state: ConversationState;
};

export function claimOutboundAction(
  ledger: OutboundLedger,
  state: ConversationState,
  input: { actionId: string; claimant: string; at: string; deliveryEnabled: boolean },
): ClaimResult {
  requireText(input.actionId, "action_id_required");
  requireText(input.claimant, "claimant_required");
  const current = ledger.entries[input.actionId];
  if (!current) throw new ContractValidationError("outbound_action_not_found");

  // Already claimed, finished or suppressed: never a new authorization.
  if (current.status !== "prepared") {
    return {
      acquired: false,
      status: current.status,
      reason: current.reason ?? "already_claimed",
      fencingToken: null,
      ledger,
      state,
    };
  }

  const earlierNotSent = planEntries(ledger, current.action).some(
    (entry) => entry.action.sequence < current.action.sequence && entry.status !== "sent",
  );
  if (earlierNotSent) {
    return { acquired: false, status: "prepared", reason: "previous_action_not_sent", fencingToken: null, ledger, state };
  }

  const draft = structuredClone(ledger);
  const refuse = (reason: string): ClaimResult => {
    suppressPlan(draft, input.actionId, reason);
    return { acquired: false, status: "suppressed", reason, fencingToken: null, ledger: draft, state };
  };

  if (!input.deliveryEnabled) return refuse("observe_only");

  const permission = evaluateDeliveryPermission(state, current.action, input.at);
  if (!permission.allowed) return refuse(permission.reason);

  if (current.leadCutoffSeq !== null && state.leadMessageSeq > current.leadCutoffSeq) {
    return refuse(SUPERSEDED_BY_NEW_MESSAGE);
  }

  draft.fencingCounter += 1;
  const entry = draft.entries[input.actionId]!;
  entry.status = "claimed";
  entry.claimedBy = input.claimant;
  entry.claimFencing = draft.fencingCounter;
  entry.attempts += 1;
  entry.reason = null;

  let nextState = state;
  if (entry.action.kind === "appointment_confirmation" && entry.action.source_ref) {
    nextState = reserveAppointmentConfirmation(state, {
      appointmentRef: entry.action.source_ref,
      actionId: entry.action.action_id,
    });
  }
  return {
    acquired: true,
    status: "claimed",
    reason: null,
    fencingToken: draft.fencingCounter,
    ledger: draft,
    state: nextState,
  };
}

export function finishOutboundAction(
  ledger: OutboundLedger,
  state: ConversationState,
  input: {
    actionId: string;
    claimant: string;
    fencingToken: number;
    status: "sent" | "failed" | "delivery_unknown";
    providerMessageId?: string;
    reason?: string;
  },
) {
  requireText(input.actionId, "action_id_required");
  requireText(input.claimant, "claimant_required");
  requireInteger(input.fencingToken, "fencing_token_required");
  if (!["sent", "failed", "delivery_unknown"].includes(input.status)) {
    throw new ContractValidationError("invalid_delivery_status");
  }
  if (input.status === "sent" && !input.providerMessageId) {
    throw new ContractValidationError("provider_message_id_required");
  }
  const current = ledger.entries[input.actionId];
  if (!current) throw new ContractValidationError("outbound_action_not_found");

  if (
    current.status === input.status &&
    current.claimedBy === input.claimant &&
    current.claimFencing === input.fencingToken &&
    current.providerMessageId === (input.providerMessageId ?? null)
  ) {
    return { duplicate: true, ledger, state };
  }
  if (
    current.status !== "claimed" ||
    current.claimedBy !== input.claimant ||
    current.claimFencing !== input.fencingToken
  ) {
    throw new ContractValidationError("stale_outbound_claim");
  }

  const draft = structuredClone(ledger);
  const entry = draft.entries[input.actionId]!;
  entry.status = input.status;
  entry.providerMessageId = input.providerMessageId ?? null;
  entry.reason = input.reason ?? null;

  let nextState = state;
  if (input.status === "failed" && entry.action.kind === "appointment_confirmation" && entry.action.source_ref) {
    nextState = releaseAppointmentConfirmation(state, {
      appointmentRef: entry.action.source_ref,
      actionId: entry.action.action_id,
    });
  }
  return { duplicate: false, ledger: draft, state: nextState };
}

export function reconcileOutboundAction(
  ledger: OutboundLedger,
  state: ConversationState,
  input: { actionId: string; status: "sent" | "failed"; providerMessageId?: string; reason?: string },
) {
  const current = ledger.entries[input.actionId];
  if (!current || current.status !== "delivery_unknown") {
    throw new ContractValidationError("only_unknown_delivery_can_be_reconciled");
  }
  if (input.status === "sent" && !input.providerMessageId) {
    throw new ContractValidationError("provider_message_id_required");
  }
  const draft = structuredClone(ledger);
  const entry = draft.entries[input.actionId]!;
  entry.status = input.status;
  entry.providerMessageId = input.providerMessageId ?? null;
  entry.reason = input.reason ?? null;
  let nextState = state;
  if (input.status === "failed" && entry.action.kind === "appointment_confirmation" && entry.action.source_ref) {
    nextState = releaseAppointmentConfirmation(state, {
      appointmentRef: entry.action.source_ref,
      actionId: entry.action.action_id,
    });
  }
  return { ledger: draft, state: nextState };
}

export function prepareOutboundRetry(ledger: OutboundLedger, actionId: string) {
  const current = ledger.entries[actionId];
  if (!current) throw new ContractValidationError("outbound_action_not_found");
  if (current.status === "delivery_unknown") {
    throw new ContractValidationError("unknown_delivery_must_be_reconciled");
  }
  if (current.status !== "failed") {
    throw new ContractValidationError("only_deterministic_failure_can_be_retried");
  }
  const draft = structuredClone(ledger);
  const entry = draft.entries[actionId]!;
  entry.status = "prepared";
  entry.reason = null;
  entry.claimedBy = null;
  entry.claimFencing = null;
  return draft;
}

export function nextPreparedAction(ledger: OutboundLedger, invocationId: string) {
  return Object.values(ledger.entries)
    .filter((entry) => entry.action.invocation_id === invocationId && entry.status === "prepared")
    .sort((left, right) => left.action.sequence - right.action.sequence)[0] ?? null;
}

export function planOutcome(ledger: OutboundLedger, invocationId: string) {
  const entries = Object.values(ledger.entries).filter(
    (entry) => entry.action.invocation_id === invocationId,
  );
  return {
    superseded: entries.some((entry) => entry.reason === SUPERSEDED_BY_NEW_MESSAGE),
    deliveredActionIds: entries.filter((entry) => entry.status === "sent").map((e) => e.action.action_id),
    statuses: entries
      .sort((left, right) => left.action.sequence - right.action.sequence)
      .map((entry) => entry.status),
  };
}

export function isAppointmentBound(action: OutboundAction) {
  return appointmentBound.has(action.kind);
}
