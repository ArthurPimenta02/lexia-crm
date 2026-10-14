import type {
  DeliveryResult,
  OutboundAction,
} from "./contracts";
import {
  evaluateDeliveryPermission,
  type ConversationState,
} from "./state-machine";
import { assertContractSchema } from "./schema-validator";
import { assertSameScope } from "./scope";

export type DeliveryPlanItemStatus =
  | "pending"
  | "sent"
  | "failed"
  | "delivery_unknown"
  | "suppressed";

export type DeliveryPlanItem = {
  action: OutboundAction;
  status: DeliveryPlanItemStatus;
  attempts: number;
  providerMessageId?: string;
  reason?: string;
};

export type DeliveryPlan = {
  invocationId: string;
  // Last lead message sequence included in the batch that produced the plan.
  // Replies set it; automations such as reminders leave it undefined.
  leadCutoffSeq?: number;
  items: DeliveryPlanItem[];
};

export const SUPERSEDED_BY_NEW_MESSAGE = "superseded_by_new_message";

// D4: a suppressed action ends the plan; the unsent remainder is suppressed
// too and never resumes. Sent actions are kept.
function suppressRemainder(plan: DeliveryPlan, fromIndex: number, reason: string) {
  for (const later of plan.items.slice(fromIndex + 1)) {
    if (later.status === "pending") {
      later.status = "suppressed";
      later.reason = reason === SUPERSEDED_BY_NEW_MESSAGE ? reason : "plan_interrupted";
    }
  }
}

export function createDeliveryPlan(
  actions: readonly OutboundAction[],
  options: { leadCutoffSeq?: number } = {},
): DeliveryPlan {
  if (
    options.leadCutoffSeq !== undefined &&
    (!Number.isSafeInteger(options.leadCutoffSeq) || options.leadCutoffSeq < 0)
  ) {
    throw new Error("leadCutoffSeq must be a non-negative integer.");
  }
  if (actions.length === 0) throw new Error("A delivery plan needs at least one action.");
  const sorted = [...actions].sort((left, right) => left.sequence - right.sequence);
  const first = sorted[0];
  if (!first) throw new Error("A delivery plan needs at least one action.");

  const actionIds = new Set<string>();
  const sequences = new Set<number>();
  for (const [index, action] of sorted.entries()) {
    assertSameScope(first.scope, action.scope, "Delivery action");
    if (action.invocation_id !== first.invocation_id) {
      throw new Error("Delivery actions must share one invocation.");
    }
    if (actionIds.has(action.action_id) || sequences.has(action.sequence)) {
      throw new Error("Delivery action IDs and sequences must be unique.");
    }
    if (action.sequence !== index + 1) {
      throw new Error("Delivery action sequences must be contiguous and start at 1.");
    }
    actionIds.add(action.action_id);
    sequences.add(action.sequence);
  }

  return {
    invocationId: first.invocation_id,
    ...(options.leadCutoffSeq !== undefined
      ? { leadCutoffSeq: options.leadCutoffSeq }
      : {}),
    items: sorted.map((action) => ({
      action: structuredClone(action),
      attempts: 0,
      status: "pending",
    })),
  };
}

function applyDeliveryResult(item: DeliveryPlanItem, result: DeliveryResult) {
  if (result.action_id !== item.action.action_id) {
    throw new Error("Delivery result belongs to another action.");
  }

  item.attempts += 1;
  item.status = result.status === "duplicate" ? "sent" : result.status;
  if (result.provider_message_id) item.providerMessageId = result.provider_message_id;
  if (result.reason) item.reason = result.reason;
}

export async function executeDeliveryPlan(
  plan: DeliveryPlan,
  dependencies: {
    loadCurrentState: () => Promise<ConversationState>;
    send: (action: OutboundAction) => Promise<DeliveryResult>;
    now: () => string;
  },
) {
  const next = structuredClone(plan);

  for (const [index, item] of next.items.entries()) {
    if (item.status === "sent") continue;
    if (item.status !== "pending") break;

      let permission: ReturnType<typeof evaluateDeliveryPermission>;
      let currentLeadSeq: number;
      try {
        const currentState = await dependencies.loadCurrentState();
        permission = evaluateDeliveryPermission(
          currentState,
          item.action,
          dependencies.now(),
        );
        currentLeadSeq = currentState.leadMessageSeq;
      } catch {
        item.status = "failed";
        item.reason = "delivery_preflight_exception";
        break;
      }
      // Blocks win over a new lead message: a blocked reply is not reprocessed.
      if (!permission.allowed) {
        item.status = "suppressed";
        item.reason = permission.reason;
        suppressRemainder(next, index, permission.reason);
        break;
      }
      if (next.leadCutoffSeq !== undefined && currentLeadSeq > next.leadCutoffSeq) {
        item.status = "suppressed";
        item.reason = SUPERSEDED_BY_NEW_MESSAGE;
        suppressRemainder(next, index, SUPERSEDED_BY_NEW_MESSAGE);
        break;
      }

      try {
        const result = await dependencies.send(item.action);
        assertContractSchema("delivery-result", result);
        const delivered = result.status === "sent" || result.status === "duplicate";
        applyDeliveryResult(item, result);
        if (!delivered) break;
      } catch {
        item.attempts += 1;
        item.status = "delivery_unknown";
        item.reason = "provider_send_exception";
        break;
      }
  }

  return next;
}

export function planNeedsReprocess(plan: DeliveryPlan) {
  return plan.items.some((item) => item.reason === SUPERSEDED_BY_NEW_MESSAGE);
}

export function getDeliveredActionIds(plan: DeliveryPlan) {
  return plan.items
    .filter((item) => item.status === "sent")
    .map((item) => item.action.action_id);
}

export function prepareDeterministicDeliveryRetry(
  plan: DeliveryPlan,
  actionId: string,
) {
  const next = structuredClone(plan);
  const item = next.items.find((candidate) => candidate.action.action_id === actionId);
  if (!item) throw new Error("Delivery action not found.");
  if (item.status === "delivery_unknown") {
    throw new Error("Unknown delivery must be reconciled before any retry.");
  }
  if (item.status !== "failed") {
    throw new Error("Only a deterministic failure can be prepared for retry.");
  }
  item.status = "pending";
  delete item.reason;
  return next;
}

export function reconcileUnknownDelivery(
  plan: DeliveryPlan,
  actionId: string,
  resolution:
    | { status: "sent"; providerMessageId: string }
    | { status: "failed"; reason: string },
) {
  const next = structuredClone(plan);
  const item = next.items.find((candidate) => candidate.action.action_id === actionId);
  if (!item || item.status !== "delivery_unknown") {
    throw new Error("Only an unknown delivery can be reconciled.");
  }
  item.status = resolution.status;
  if (resolution.status === "sent") item.providerMessageId = resolution.providerMessageId;
  else item.reason = resolution.reason;
  return next;
}
