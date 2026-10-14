import { createHash } from "node:crypto";

import type {
  CrmEventAuthority,
  CrmEventType,
  CrmSyncEvent,
  OmnichannelScope,
} from "./contracts";
import { ContractValidationError } from "./contracts";
import { assertContractSchema } from "./schema-validator";
import { validateScope } from "./scope";

export const crmEventAuthorityRules: Record<
  CrmEventType,
  readonly CrmEventAuthority[]
> = {
  "contact.upserted": ["provider_event", "system_reconciliation"],
  "conversation.opened": ["provider_event", "system_reconciliation"],
  "conversation.context.updated": ["workflow_execution", "system_reconciliation"],
  "message.recorded": [
    "provider_event",
    "workflow_execution",
    "system_reconciliation",
  ],
  "message.enrichment.updated": [
    "workflow_execution",
    "system_reconciliation",
  ],
  "message.delivery.updated": ["provider_result", "system_reconciliation"],
  "block.upserted": [
    "workflow_execution",
    "tool_result",
    "crm_user",
    "system_reconciliation",
  ],
  "block.closed": ["workflow_execution", "crm_user", "system_reconciliation"],
  "appointment.confirmed": ["tool_result", "system_reconciliation"],
  "appointment.cancelled": ["tool_result", "crm_user", "system_reconciliation"],
  "appointment.attendance.updated": ["crm_user", "system_reconciliation"],
  "automation.updated": ["workflow_execution", "system_reconciliation"],
  "handoff.requested": ["brain_result", "workflow_execution"],
  "handoff.resolved": ["crm_user", "system_reconciliation"],
  "handoff.resumed": ["crm_user", "system_reconciliation"],
  "attribution.captured": ["provider_event", "system_reconciliation"],
};

export const crmInformationAuthority = {
  messages: "provider_event_or_result",
  appointments: "attested_tool_result",
  attendance: "crm_user",
  automations: "workflow_execution",
  handoff_request: "validated_brain_result",
  handoff_resolution: "crm_user",
  context: "workflow_execution",
} as const;

const authoritySystems: Record<
  CrmEventAuthority,
  CrmSyncEvent["source"]["system"]
> = {
  provider_event: "provider",
  provider_result: "provider",
  workflow_execution: "workflow",
  tool_result: "tool",
  brain_result: "brain",
  crm_user: "crm",
  system_reconciliation: "system",
};

export function assertCrmSyncEvent(value: unknown): asserts value is CrmSyncEvent {
  assertContractSchema("crm-sync-event", value);
  const event = value as CrmSyncEvent;
  validateScope(event.scope);

  const allowed = crmEventAuthorityRules[event.event_type];
  if (!allowed.includes(event.source.authority)) {
    throw new ContractValidationError(
      `${event.event_type} cannot use authority ${event.source.authority}.`,
    );
  }

  const expectedSystem = authoritySystems[event.source.authority];
  if (event.source.system !== expectedSystem) {
    throw new ContractValidationError(
      `${event.source.authority} must be emitted by ${expectedSystem}, not ${event.source.system}.`,
    );
  }

  if (
    event.event_type === "appointment.confirmed" &&
    event.source.authority !== "tool_result" &&
    event.source.authority !== "system_reconciliation"
  ) {
    throw new ContractValidationError(
      "An appointment can only be confirmed by an attested tool result.",
    );
  }

  if (
    event.event_type === "message.delivery.updated" &&
    event.source.authority === "workflow_execution"
  ) {
    throw new ContractValidationError(
      "A workflow attempt cannot prove provider delivery.",
    );
  }

  if (
    event.event_type === "message.recorded" &&
    event.payload.delivery_status === "delivery_unknown" &&
    !event.payload.action_id
  ) {
    throw new ContractValidationError(
      "An uncertain outbound message requires its stable action_id for reconciliation.",
    );
  }

  if (
    event.event_type === "message.enrichment.updated" &&
    event.payload.status === "completed" &&
    !event.payload.content
  ) {
    throw new ContractValidationError(
      "Completed message enrichment requires validated content.",
    );
  }
}

export function buildCrmEventIdempotencyKey(
  scope: OmnichannelScope,
  eventType: CrmEventType,
  sourceRef: string,
) {
  const valid = validateScope(scope);
  if (!sourceRef.trim()) {
    throw new ContractValidationError("CRM event source reference cannot be empty.");
  }

  const encoded = JSON.stringify([
    "lexia.crm.event.key.v1",
    valid.environment,
    valid.cliente_slug,
    valid.channel,
    valid.account_ref,
    valid.conversation_ref,
    eventType,
    sourceRef,
  ]);
  return `lexia:crm:v1:${createHash("sha256").update(encoded).digest("hex")}`;
}

export function orderCrmEvents(events: readonly CrmSyncEvent[]) {
  return [...events].sort((left, right) => {
    const sequence = left.sequence - right.sequence;
    if (sequence !== 0) return sequence;
    const occurred = left.occurred_at.localeCompare(right.occurred_at);
    if (occurred !== 0) return occurred;
    return left.event_id.localeCompare(right.event_id);
  });
}
