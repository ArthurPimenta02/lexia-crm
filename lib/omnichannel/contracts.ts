export const OMNICHANNEL_CONTRACT_STATUS = "provisional" as const;

export const omnichannelContractVersions = [
  "lexia.ingress.event.v1",
  "lexia.state.command.v1",
  "lexia.context.agent.config.v1",
  "lexia.context.result.v1",
  "lexia.domain.event.v1",
  "lexia.brain.request.v1",
  "lexia.brain.result.v1",
  "lexia.automation.request.v1",
  "lexia.outbound.action.v1",
  "lexia.delivery.result.v1",
  "lexia.crm.event.v1",
  "lexia.workflow.test.request.v1",
  "lexia.workflow.test.result.v1",
] as const;

export type OmnichannelContractVersion =
  (typeof omnichannelContractVersions)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type OmnichannelEnvironment =
  | "local"
  | "isolated_test"
  | "staging"
  | "production";

export type OmnichannelChannel = "whatsapp" | "instagram" | "messenger";

export type OmnichannelScope = {
  environment: OmnichannelEnvironment;
  cliente_slug: string;
  channel: OmnichannelChannel;
  account_ref: string;
  conversation_ref: string;
};

export type MessageAuthor = "lead" | "human_agent" | "ai" | "system";
export type MessageDirection = "inbound" | "outbound";
export type MediaKind = "text" | "audio" | "image" | "pdf" | "video";
export type MediaProcessingStatus =
  | "pending"
  | "completed"
  | "failed"
  | "not_supported";

export type MediaDescriptor = {
  kind: MediaKind;
  provider_media_ref?: string;
  mime_type?: string;
  caption?: string;
  processing_status: MediaProcessingStatus;
  extracted_text?: string;
  error_code?: string;
};

export type CanonicalMessage = {
  schema_version: "lexia.message.v1";
  event_id: string;
  provider_event_id: string;
  message_id: string;
  scope: OmnichannelScope;
  author: MessageAuthor;
  direction: MessageDirection;
  occurred_at: string;
  text?: string;
  media?: MediaDescriptor;
  action_id?: string;
  ad_origin?: {
    provider_ref: string;
    source_type: string;
  };
};

export type IngressEvent = {
  schema_version: "lexia.ingress.event.v1";
  event_id: string;
  provider_event_id: string;
  correlation_id: string;
  scope: OmnichannelScope;
  provider: "meta" | "zapi" | "fake";
  event_type:
    | "message"
    | "message_edit"
    | "message_delete"
    | "reaction"
    | "postback"
    | "unsupported";
  occurred_at: string;
  message?: CanonicalMessage;
  contact?: {
    provider_contact_ref: string;
    display_name?: string;
    phone?: string;
  };
  capability_refs: string[];
};

export type ContextAgentConfig = {
  schema_version: "lexia.context.agent.config.v1";
  environment: OmnichannelEnvironment;
  cliente_slug: string;
  config_version: string;
  status: "active" | "inactive";
  prompt_template: string;
  common_schema_version: "lexia.context.result.v1";
  company_fields_schema: JsonObject;
  locale: string;
  timezone: string;
  model_policy_ref: string;
};

export type OperationalContext = {
  summary: string;
  language: string;
  intent: string;
  topic: {
    current: string;
    changed: boolean;
    resumed_previous: boolean;
  };
  confidence: number;
  missing_information: string[];
  contact_updates: JsonObject;
  scheduling_intent: JsonObject;
};

export type ContextResult = {
  schema_version: "lexia.context.result.v1";
  scope: OmnichannelScope;
  context_call_id: string;
  config_version: string;
  source_message_ids: string[];
  operational_context: OperationalContext;
  company_fields: JsonObject;
};

export type ConversationStateSnapshot = {
  state_version: number;
  delivery_epoch: number;
};

export type OutboundActionKind =
  | "reply"
  | "followup"
  | "appointment_reminder"
  | "appointment_confirmation";

export type OutboundContent =
  | { type: "text"; text: string }
  | { type: "audio"; media_ref: string }
  | {
      type: "image";
      media_ref: string;
      caption?: string;
    };

export type OutboundAction = {
  schema_version: "lexia.outbound.action.v1";
  action_id: string;
  invocation_id: string;
  scope: OmnichannelScope;
  sequence: number;
  kind: OutboundActionKind;
  captured_state: ConversationStateSnapshot;
  content: OutboundContent;
  source_ref?: string;
};

export type AppointmentConfirmedEvent = {
  schema_version: "lexia.domain.event.v1";
  event_id: string;
  invocation_id: string;
  idempotency_key: string;
  type: "appointment.confirmed";
  occurred_at: string;
  appointment: {
    appointment_ref: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    tool_invocation_id: string;
    status: "confirmed";
  };
};

export type AppointmentCancelledEvent = {
  schema_version: "lexia.domain.event.v1";
  event_id: string;
  invocation_id: string;
  idempotency_key: string;
  type: "appointment.cancelled";
  occurred_at: string;
  appointment: {
    appointment_ref: string;
    tool_invocation_id: string;
    status: "cancelled";
  };
};

export type HandoffRequestedEvent = {
  schema_version: "lexia.domain.event.v1";
  event_id: string;
  invocation_id: string;
  idempotency_key: string;
  type: "handoff.requested";
  occurred_at: string;
  handoff: {
    handoff_ref: string;
    reason: string;
    summary: string;
    priority: "low" | "normal" | "high";
  };
};

export type DomainEvent =
  | AppointmentConfirmedEvent
  | AppointmentCancelledEvent
  | HandoffRequestedEvent;

export type BrainRequest = {
  schema_version: "lexia.brain.request.v1";
  invocation_id: string;
  correlation_id: string;
  scope: OmnichannelScope;
  state: ConversationStateSnapshot;
  messages: CanonicalMessage[];
  contact: JsonObject;
  operational_context: OperationalContext;
  company_fields: JsonObject;
  policy: JsonObject;
  capabilities: string[];
  reprocess?: BrainReprocess;
};

export type ExecutedToolEffect = {
  tool_name: string;
  invocation_id: string;
  operation: "appointment.create" | "appointment.cancel" | "other";
  result: "succeeded";
  appointment_ref?: string;
};

export type BrainReprocess = {
  superseded_invocation_ids: string[];
  delivered_action_ids: string[];
  executed_tool_effects: ExecutedToolEffect[];
};

export type BrainDecision = "reply" | "no_reply" | "handoff" | "error";

export type ToolOperation =
  | "availability.check"
  | "appointment.create"
  | "appointment.cancel"
  | "other";

export type ToolAuditEntry = {
  tool_name: string;
  invocation_id: string;
  operation: ToolOperation;
  result: "succeeded" | "failed";
  appointment_ref?: string;
};

export type BrainResult = {
  schema_version: "lexia.brain.result.v1";
  invocation_id: string;
  captured_state: ConversationStateSnapshot;
  decision: BrainDecision;
  actions: OutboundAction[];
  context_patch: JsonObject;
  domain_events: DomainEvent[];
  tool_audit: ToolAuditEntry[];
};

export type AutomationRequest = {
  schema_version: "lexia.automation.request.v1";
  request_id: string;
  kind: "appointment_reminder" | "followup";
  scope: OmnichannelScope;
  source_ref: string;
  due_at: string;
  proposed_actions: OutboundAction[];
};

export type WorkflowTestTarget =
  | "omnichannel"
  | "brain"
  | "followup"
  | "reminder"
  | "create_appointment"
  | "check_availability";

export type WorkflowTestExecutionMode =
  | "safe_simulation"
  | "full_agent_virtual";

export type WorkflowTestCalendarAccess =
  | "disabled"
  | "test_read_only"
  | "test_read_write";

export type WorkflowTestRequest = {
  schema_version: "lexia.workflow.test.request.v1";
  run_id: string;
  target: WorkflowTestTarget;
  delivery_mode: "simulate";
  execution_mode: WorkflowTestExecutionMode;
  tool_policy: {
    calendar: WorkflowTestCalendarAccess;
  };
  scope: Omit<OmnichannelScope, "environment"> & {
    environment: "isolated_test" | "staging";
  };
  input: {
    message_id: string;
    type: "text";
    text: string;
  };
  expectations: {
    provider_send: false;
    persist_synthetic_events: true;
    return_trace: true;
  };
};

export type WorkflowTestTraceStep = {
  step: string;
  status: "passed" | "blocked" | "failed" | "simulated";
  reason?: string;
};

export type WorkflowTestResult = {
  schema_version: "lexia.workflow.test.result.v1";
  run_id: string;
  target: WorkflowTestTarget;
  status: "completed" | "blocked" | "failed";
  provider_send_attempted: false;
  summary: string;
  error_code?: string;
  trace: WorkflowTestTraceStep[];
  output?: JsonObject;
};

export type StateCommand = {
  schema_version: "lexia.state.command.v1";
  command_id: string;
  scope: OmnichannelScope;
  type:
    | "human_intervention.record"
    | "manual_pause.start"
    | "manual_pause.end"
    | "handoff.request"
    | "handoff.resolve"
    | "handoff.resume"
    | "appointment.confirm"
    | "appointment.cancel"
    | "appointment.remove"
    | "appointment.attendance.update";
  occurred_at: string;
  payload: JsonObject;
};

export type CrmCommand = {
  schema_version: "lexia.crm.command.v1";
  command_id: string;
  correlation_id: string;
  command_type:
    | "manual_pause.start"
    | "manual_pause.end"
    | "handoff.resolve"
    | "handoff.resume"
    | "appointment.cancel"
    | "appointment.attendance.update";
  occurred_at: string;
  scope: OmnichannelScope;
  payload: JsonObject;
};

export type DeliveryStatus =
  | "sent"
  | "failed"
  | "delivery_unknown"
  | "suppressed"
  | "duplicate";

export type DeliveryResult = {
  schema_version: "lexia.delivery.result.v1";
  action_id: string;
  status: DeliveryStatus;
  attempted_at: string;
  provider_message_id?: string;
  reason?: string;
};

export type CrmEventType =
  | "contact.upserted"
  | "conversation.opened"
  | "conversation.context.updated"
  | "message.recorded"
  | "message.enrichment.updated"
  | "message.delivery.updated"
  | "block.upserted"
  | "block.closed"
  | "appointment.confirmed"
  | "appointment.cancelled"
  | "appointment.attendance.updated"
  | "automation.updated"
  | "handoff.requested"
  | "handoff.resolved"
  | "handoff.resumed"
  | "attribution.captured";

export type CrmEventAuthority =
  | "provider_event"
  | "provider_result"
  | "workflow_execution"
  | "tool_result"
  | "brain_result"
  | "crm_user"
  | "system_reconciliation";

export type CrmEventSource = {
  system: "provider" | "workflow" | "brain" | "tool" | "crm" | "system";
  authority: CrmEventAuthority;
  workflow_ref: string;
  execution_ref: string;
  node_ref?: string;
  provider_ref?: string;
};

export type CrmSyncEvent = {
  schema_version: "lexia.crm.event.v1";
  event_id: string;
  idempotency_key: string;
  correlation_id: string;
  causation_id?: string;
  event_type: CrmEventType;
  occurred_at: string;
  emitted_at: string;
  sequence: number;
  scope: OmnichannelScope;
  source: CrmEventSource;
  payload: JsonObject;
};

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

export function isOmnichannelContractVersion(
  value: string,
): value is OmnichannelContractVersion {
  return (omnichannelContractVersions as readonly string[]).includes(value);
}

export function assertProvisionalContractVersion(value: string) {
  if (!isOmnichannelContractVersion(value)) {
    throw new ContractValidationError(`Unsupported contract version: ${value}`);
  }
}
