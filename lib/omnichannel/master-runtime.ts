// Executable steps of the OMNI v2 master, run by the n8n Code nodes of the
// test workflows and by the local executor. Every step reads and returns an
// explicit test store; in the real integration that store is replaced by the
// Supabase RPCs of the Lot 2 migration. No network, credential or real data.

import { buildBrainRequest, buildReprocessContext, validateBrainResult } from "./brain-boundary";
import { applyBrainResult } from "./brain-result-apply";
import {
  ContextConfigurationUnavailableError,
  buildGenericContextAgentSet,
  type ContextAgentInput,
} from "./context-config";
import type {
  BrainRequest,
  BrainResult,
  CanonicalMessage,
  ContextAgentConfig,
  ContextResult,
  DomainEvent,
  IngressEvent,
  JsonObject,
  OmnichannelScope,
  OutboundAction,
  ToolAuditEntry,
} from "./contracts";
import { normalizeFakeProviderEvent, type FakeTrustedBinding } from "./fake-adapters";
import { selectScopedHistory } from "./history";
import { createInboundBuffer, claimInboundBatch, completeInboundBatch, enqueueInboundMessage, releasePendingMessages, supersedeInboundBatch, type InboundBatch, type InboundBufferState } from "./inbound-buffer";
import { validateContextResult } from "./operational-context";
import {
  claimOutboundAction,
  createOutboundLedger,
  finishOutboundAction,
  nextPreparedAction,
  planOutcome,
  prepareOutboundActions,
  prepareOutboundRetry,
  reconcileOutboundAction,
  type OutboundLedger,
} from "./outbound-ledger";
import { validateOmnichannelPolicy, type CompanyOmnichannelPolicy, type OmnichannelPolicy } from "./policy";
import { sameScope, serializeScope, validateScope } from "./scope";
import {
  cancelAppointment,
  createConversationState,
  endManualPause,
  expireBlocks,
  getActiveBlocks,
  getResumeDecision,
  queuePendingMessage,
  recordHumanIntervention,
  recordLeadMessage,
  removeAppointmentBlock,
  resolveHandoff,
  resumeHandoff,
  startManualPause,
  type ConversationState,
} from "./state-machine";

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type ProviderBinding = {
  provider: "zapi" | "meta" | "fake";
  provider_account_ref: string;
  environment: OmnichannelScope["environment"];
  cliente_slug: string;
  channel: OmnichannelScope["channel"];
  account_ref: string;
  delivery_owner: "v1" | "v2";
  delivery_mode: "observe_only" | "deliver";
};

export type RawProviderEvent = {
  provider: ProviderBinding["provider"];
  provider_account_ref: string;
  provider_event_id: string;
  provider_message_id: string;
  conversation_external_id: string;
  at: string;
  from_business: boolean;
  from_api?: boolean;
  is_echo?: boolean;
  text?: string;
  media?: { kind: "audio" | "image" | "pdf" | "video"; provider_media_ref: string; simulate_failure?: boolean };
  claimed_cliente_slug?: string;
  contact_ref?: string;
};

export type BrainScript = {
  bubbles?: string[];
  book?: { appointment_ref: string; starts_at: string; ends_at: string; timezone: string };
  confirmation?: string;
  confirm_ref?: string;
  cancel_ref?: string;
  handoff?: { reason: string; summary: string; priority: "low" | "normal" | "high" };
  during_generation?: RawProviderEvent[];
};

export type ProviderScriptEntry = {
  outcome: "sent" | "failed" | "timeout";
  after?: RawProviderEvent[];
};

export type StoredMessage = CanonicalMessage & {
  lead_seq?: number;
  pending?: boolean;
};

export type ConversationRecord = {
  key: string;
  scope: OmnichannelScope;
  state: ConversationState;
  buffer: InboundBufferState;
  ledger: OutboundLedger;
  contexts: ContextResult[];
};

export type InvocationRecord = {
  invocation_id: string;
  conversation_key: string;
  kind: "brain" | "automation";
  batch: InboundBatch | null;
  request: BrainRequest | null;
  result: BrainResult | null;
  status: "requested" | "applied" | "rejected" | "completed" | "superseded";
  reason: string | null;
};

export type MasterStore = {
  schema_version: "lexia.omni.test.store.v1";
  counter: number;
  bindings: ProviderBinding[];
  policies: CompanyOmnichannelPolicy[];
  context_configs: ContextAgentConfig[];
  brain_bindings: Array<{ environment: string; cliente_slug: string; brain_ref: string; capabilities: string[] }>;
  ingress: Record<string, { outcome: string; message_id: string | null }>;
  messages: StoredMessage[];
  conversations: Record<string, ConversationRecord>;
  invocations: Record<string, InvocationRecord>;
  automation_requests: Record<string, { status: string; reason: string | null; invocation_id: string | null }>;
  provider_log: Array<{ action_id: string; conversation_key: string; kind: string; text: string; outcome: string; provider_message_id: string | null; claimant: string }>;
  brain_calls: Array<{ invocation_id: string; conversation_key: string; reprocess: boolean }>;
  tool_effects: Array<{ invocation_id: string; conversation_key: string; operation: string; appointment_ref: string }>;
  trace: Array<{ step: string; conversation_key: string | null; detail: JsonObject }>;
  fixtures: {
    brain_scripts: Record<string, BrainScript[]>;
    provider_scripts: Record<string, ProviderScriptEntry[]>;
  };
};

export function createMasterStore(input: {
  bindings: ProviderBinding[];
  policies: CompanyOmnichannelPolicy[];
  contextConfigs: ContextAgentConfig[];
  brainBindings: MasterStore["brain_bindings"];
}): MasterStore {
  return {
    schema_version: "lexia.omni.test.store.v1",
    counter: 0,
    bindings: structuredClone(input.bindings),
    policies: structuredClone(input.policies),
    context_configs: structuredClone(input.contextConfigs),
    brain_bindings: structuredClone(input.brainBindings),
    ingress: {},
    messages: [],
    conversations: {},
    invocations: {},
    automation_requests: {},
    provider_log: [],
    brain_calls: [],
    tool_effects: [],
    trace: [],
    fixtures: { brain_scripts: {}, provider_scripts: {} },
  };
}

function nextUuid(store: MasterStore) {
  store.counter += 1;
  return `eeeeeeee-0000-4000-8000-${store.counter.toString(16).padStart(12, "0")}`;
}

function trace(store: MasterStore, step: string, key: string | null, detail: JsonObject) {
  store.trace.push({ step, conversation_key: key, detail });
}

function bindingScope(binding: ProviderBinding, conversationRef: string): OmnichannelScope {
  return validateScope({
    environment: binding.environment,
    cliente_slug: binding.cliente_slug,
    channel: binding.channel,
    account_ref: binding.account_ref,
    conversation_ref: conversationRef,
  });
}

function findBinding(store: MasterStore, provider: string, accountRef: string) {
  return store.bindings.find(
    (binding) => binding.provider === provider && binding.provider_account_ref === accountRef,
  ) ?? null;
}

export type ConversationSelector = {
  provider: ProviderBinding["provider"];
  provider_account_ref: string;
  conversation_external_id: string;
};

export function conversationKeyFor(store: MasterStore, selector: ConversationSelector) {
  const binding = findBinding(store, selector.provider, selector.provider_account_ref);
  if (!binding) throw new Error("unknown_account");
  return serializeScope(bindingScope(binding, selector.conversation_external_id));
}

// Exact lookups, mirroring the central RPCs: one active row for the company
// and environment, never a fallback to another tenant.
export function resolvePolicy(store: MasterStore, scope: OmnichannelScope): OmnichannelPolicy {
  const matches = store.policies.filter(
    (record) =>
      record.environment === scope.environment &&
      record.cliente_slug === scope.cliente_slug &&
      record.status === "active",
  );
  if (matches.length !== 1) throw new Error("omnichannel_policy_unavailable");
  return validateOmnichannelPolicy(matches[0]!.policy);
}

function resolveContextConfig(store: MasterStore, scope: OmnichannelScope) {
  const matches = store.context_configs.filter(
    (config) =>
      config.environment === scope.environment &&
      config.cliente_slug === scope.cliente_slug &&
      config.status === "active",
  );
  if (matches.length !== 1) throw new ContextConfigurationUnavailableError();
  return matches[0]!;
}

function resolveBrainBinding(store: MasterStore, scope: OmnichannelScope) {
  const matches = store.brain_bindings.filter(
    (binding) => binding.environment === scope.environment && binding.cliente_slug === scope.cliente_slug,
  );
  if (matches.length !== 1) throw new Error("brain_binding_unavailable");
  return matches[0]!;
}

function ensureConversation(store: MasterStore, scope: OmnichannelScope) {
  const key = serializeScope(scope);
  if (!store.conversations[key]) {
    const policy = resolvePolicy(store, scope);
    store.conversations[key] = {
      key,
      scope,
      state: createConversationState(scope, policy.resumeMode),
      buffer: createInboundBuffer(scope, policy.bufferWindowMs),
      ledger: createOutboundLedger(),
      contexts: [],
    };
  }
  return store.conversations[key]!;
}

function conversation(store: MasterStore, key: string) {
  const record = store.conversations[key];
  if (!record) throw new Error("omni_conversation_not_found");
  return record;
}

// ---------------------------------------------------------------------------
// 1. Adapter ingress and trusted scope
// ---------------------------------------------------------------------------

export function adapterIngress(store: MasterStore, raw: RawProviderEvent) {
  const binding = findBinding(store, raw.provider, raw.provider_account_ref);
  if (!binding) {
    trace(store, "adapter_ingress", null, { outcome: "rejected", reason: "unknown_account" });
    return { route: "rejected" as const, reason: "unknown_account", event: null };
  }
  // The company comes from the trusted account binding, never the payload.
  if (raw.claimed_cliente_slug && raw.claimed_cliente_slug !== binding.cliente_slug) {
    trace(store, "adapter_ingress", null, { outcome: "rejected", reason: "tenant_mismatch" });
    return { route: "rejected" as const, reason: "tenant_mismatch", event: null };
  }
  const scope = bindingScope(binding, raw.conversation_external_id);
  const key = serializeScope(scope);

  // Echo of an automatic action: matched by provider message id against the
  // ledger. Z-API marks API sends explicitly (fromApi), as in the current flow.
  let automatedActionId: string | undefined;
  if (raw.from_business) {
    const ledger = store.conversations[key]?.ledger;
    const match = ledger
      ? Object.values(ledger.entries).find((entry) => entry.providerMessageId === raw.provider_message_id)
      : undefined;
    if (match) automatedActionId = match.action.action_id;
    else if (raw.provider === "zapi" && raw.from_api) automatedActionId = "unmatched-api-echo";
  }

  const trusted: FakeTrustedBinding = {
    environment: binding.environment,
    clienteSlug: binding.cliente_slug,
    channel: binding.channel,
    accountRef: binding.account_ref,
    provider: binding.provider,
  };
  const event = normalizeFakeProviderEvent(trusted, {
    eventId: nextUuid(store),
    providerEventId: raw.provider_event_id,
    correlationId: nextUuid(store),
    messageId: raw.provider_message_id,
    conversationRef: raw.conversation_external_id,
    occurredAt: raw.at,
    direction: raw.from_business ? "outbound" : "inbound",
    fromBusinessAccount: raw.from_business,
    ...(automatedActionId ? { automatedActionId } : {}),
    ...(raw.text ? { text: raw.text } : {}),
    ...(raw.media ? { media: { kind: raw.media.kind, provider_media_ref: raw.media.provider_media_ref } } : {}),
    contact: { providerContactRef: raw.contact_ref ?? raw.conversation_external_id },
  });
  trace(store, "adapter_ingress", key, { author: event.message?.author ?? "none", provider: raw.provider });
  return {
    route: "accepted" as const,
    reason: null,
    event,
    simulate_media_failure: raw.media?.simulate_failure === true,
  };
}

// ---------------------------------------------------------------------------
// 2-3. Ingest: dedupe, persist before buffer, intervention first
// ---------------------------------------------------------------------------

export function ingest(
  store: MasterStore,
  input: { event: IngressEvent; simulate_media_failure?: boolean },
) {
  const event = input.event;
  const message = event.message;
  const key = serializeScope(event.scope);
  const dedupeKey = JSON.stringify([event.scope.environment, event.scope.account_ref, event.provider_event_id]);
  if (store.ingress[dedupeKey]) {
    trace(store, "ingest", key, { outcome: "duplicate", provider_event_id: event.provider_event_id });
    return { route: "duplicate" as const, conversation_key: key, candidate_seq: null };
  }
  if (!message) {
    store.ingress[dedupeKey] = { outcome: "audited_non_message", message_id: null };
    trace(store, "ingest", key, { outcome: "audited_non_message" });
    return { route: "audited" as const, conversation_key: key, candidate_seq: null };
  }
  if (message.author === "ai") {
    store.ingress[dedupeKey] = { outcome: "ai_echo", message_id: null };
    trace(store, "ingest", key, { outcome: "ai_echo_ignored" });
    return { route: "ai_echo" as const, conversation_key: key, candidate_seq: null };
  }

  let record: ConversationRecord;
  let policy: OmnichannelPolicy;
  try {
    record = ensureConversation(store, event.scope);
    policy = resolvePolicy(store, event.scope);
  } catch {
    // Fail closed: the message is still recorded, but nothing else runs.
    store.messages.push(structuredClone(message));
    store.ingress[dedupeKey] = { outcome: "policy_unavailable", message_id: message.message_id };
    trace(store, "ingest", key, { outcome: "policy_unavailable" });
    return { route: "policy_unavailable" as const, conversation_key: key, candidate_seq: null };
  }

  // Every message is persisted before buffer, media or brain work.
  const stored: StoredMessage = structuredClone(message);
  store.messages.push(stored);
  store.ingress[dedupeKey] = { outcome: "recorded", message_id: message.message_id };

  if (message.author === "human_agent") {
    // The intervention is applied before any download or transcription.
    record.state = recordHumanIntervention(record.state, {
      commandId: `human:${message.message_id}`,
      occurredAt: message.occurred_at,
      durationMs: policy.humanInterventionDurationMs,
      messageId: message.message_id,
    }).state;
    if (stored.media) {
      stored.media.processing_status = input.simulate_media_failure ? "failed" : "completed";
      if (input.simulate_media_failure) stored.media.error_code = `${stored.media.kind}_processing_failed`;
      else stored.media.extracted_text = "[transcrição sintética]";
    }
    trace(store, "ingest", key, { outcome: "human_intervention", media: stored.media?.processing_status ?? "none" });
    return { route: "intervention" as const, conversation_key: key, candidate_seq: null };
  }

  if (message.author !== "lead") {
    trace(store, "ingest", key, { outcome: "recorded", author: message.author });
    return { route: "recorded" as const, conversation_key: key, candidate_seq: null };
  }

  if (stored.media) {
    stored.media.processing_status = input.simulate_media_failure ? "failed" : "completed";
    if (!input.simulate_media_failure) stored.media.extracted_text = "[conteúdo sintético de mídia]";
    else stored.media.error_code = `${stored.media.kind}_processing_failed`;
  }

  const lead = recordLeadMessage(record.state, {
    commandId: `lead:${message.message_id}`,
    messageId: message.message_id,
    occurredAt: message.occurred_at,
  });
  record.state = lead.state;
  stored.lead_seq = lead.leadMessageSeq;
  const blocked = getActiveBlocks(record.state, message.occurred_at).length > 0;
  if (blocked) {
    record.state = queuePendingMessage(record.state, {
      commandId: `pending:${message.message_id}`,
      messageId: message.message_id,
      occurredAt: message.occurred_at,
    }).state;
    stored.pending = true;
  }
  record.buffer = enqueueInboundMessage(record.buffer, {
    messageId: message.message_id,
    leadSeq: lead.leadMessageSeq,
    at: message.occurred_at,
    blocked,
  }).state;
  trace(store, "ingest", key, { outcome: blocked ? "pending" : "buffered", lead_seq: lead.leadMessageSeq });
  return {
    route: blocked ? ("pending" as const) : ("buffered" as const),
    conversation_key: key,
    candidate_seq: lead.leadMessageSeq,
  };
}

export function receive(store: MasterStore, raw: RawProviderEvent) {
  const adapted = adapterIngress(store, raw);
  if (!adapted.event) return { route: adapted.route, reason: adapted.reason, conversation_key: null, candidate_seq: null };
  return { ...ingest(store, { event: adapted.event, simulate_media_failure: adapted.simulate_media_failure }), reason: null };
}

// ---------------------------------------------------------------------------
// 4. Buffer: debounce, owner election, cutoff, block check
// ---------------------------------------------------------------------------

export function bufferTick(
  store: MasterStore,
  input: { conversation_key: string; candidate_seq: number; at: string; execution_id: string },
) {
  const record = conversation(store, input.conversation_key);
  record.state = expireBlocks(record.state, { commandId: `expire:${input.at}`, occurredAt: input.at }).state;
  const blocked = getActiveBlocks(record.state, input.at).length > 0;
  const claim = claimInboundBatch(record.buffer, {
    candidateSeq: input.candidate_seq,
    batchId: nextUuid(store),
    at: input.at,
    blocked,
  });
  record.buffer = claim.state;
  if (!claim.claimed) {
    trace(store, "buffer_claim", record.key, { claimed: false, reason: claim.reason });
    return { claimed: false, reason: claim.reason, batch: null };
  }
  trace(store, "buffer_claim", record.key, {
    claimed: true,
    owner: input.execution_id,
    cutoff_seq: claim.batch.cutoffSeq,
    messages: claim.batch.messageIds,
  });
  return { claimed: true, reason: null, batch: claim.batch };
}

// ---------------------------------------------------------------------------
// 5. History and context with the exact company configuration
// ---------------------------------------------------------------------------

function fakeContextAgent(input: ContextAgentInput): ContextResult {
  const texts = input.messages.map((message) => message.text ?? message.media?.extracted_text ?? "[mídia]");
  const schema = input.company_fields_schema as { required?: string[]; properties?: Record<string, { type?: string }> };
  const companyFields: JsonObject = {};
  for (const field of schema.required ?? []) {
    companyFields[field] = schema.properties?.[field]?.type === "boolean" ? false : "sintetico";
  }
  return {
    schema_version: "lexia.context.result.v1",
    scope: input.scope,
    context_call_id: input.context_call_id,
    config_version: input.config_version,
    source_message_ids: input.messages.map((message) => message.message_id),
    operational_context: {
      summary: `Resumo sintético: ${texts.join(" | ").slice(0, 400)}`,
      language: input.locale,
      intent: "synthetic_intent",
      topic: { current: "sintetico", changed: false, resumed_previous: false },
      confidence: 0.9,
      missing_information: [],
      contact_updates: {},
      scheduling_intent: {},
    },
    company_fields: companyFields,
  };
}

export function prepareContext(store: MasterStore, input: { conversation_key: string; batch: InboundBatch }) {
  const record = conversation(store, input.conversation_key);
  let config: ContextAgentConfig;
  try {
    config = resolveContextConfig(store, record.scope);
  } catch {
    trace(store, "context", record.key, { outcome: "context_config_unavailable" });
    return { route: "context_config_unavailable" as const, context: null, messages: [] as CanonicalMessage[] };
  }
  const scoped = selectScopedHistory(store.messages, record.scope);
  const batchMessages = input.batch.messageIds.map((id) => {
    const found = scoped.find((message) => message.message_id === id);
    if (!found) throw new Error("batch_message_out_of_scope");
    return found;
  });
  const history = scoped
    .filter((message) => !input.batch.messageIds.includes(message.message_id))
    .slice(-30)
    .map((message) => ({ author: message.author, text: message.text ?? message.media?.extracted_text ?? "[mídia]" }));
  const agentInput = buildGenericContextAgentSet({
    scope: record.scope,
    contextCallId: nextUuid(store),
    config,
    messages: batchMessages,
    memory: [{ scope: record.scope, key: "history", value: history }],
  });
  const context = validateContextResult(fakeContextAgent(agentInput), agentInput);
  record.contexts.push(context);
  trace(store, "context", record.key, { config_version: config.config_version, history: history.length });
  return { route: "ready" as const, context, messages: batchMessages };
}

// ---------------------------------------------------------------------------
// 6. Brain request and fake private brain
// ---------------------------------------------------------------------------

export function buildInvocation(
  store: MasterStore,
  input: { conversation_key: string; batch: InboundBatch; context: ContextResult; messages: CanonicalMessage[] },
) {
  const record = conversation(store, input.conversation_key);
  const binding = resolveBrainBinding(store, record.scope);
  const invocationId = nextUuid(store);
  const superseded = input.batch.supersededInvocationIds
    .map((id) => store.invocations[id])
    .filter((invocation): invocation is InvocationRecord => Boolean(invocation?.result));
  const reprocess = superseded.length > 0
    ? buildReprocessContext({
        supersededResults: superseded.map((invocation) => invocation.result!),
        deliveredActionIds: superseded.flatMap(
          (invocation) => planOutcome(record.ledger, invocation.invocation_id).deliveredActionIds,
        ),
      })
    : undefined;
  const request = buildBrainRequest({
    invocationId,
    correlationId: nextUuid(store),
    scope: record.scope,
    state: { state_version: record.state.stateVersion, delivery_epoch: record.state.deliveryEpoch },
    messages: input.messages,
    contact: {},
    context: input.context,
    contextCallId: input.context.context_call_id,
    contextConfigVersion: input.context.config_version,
    policy: { brain_ref: binding.brain_ref },
    capabilities: binding.capabilities,
    ...(reprocess ? { reprocess } : {}),
  });
  store.invocations[invocationId] = {
    invocation_id: invocationId,
    conversation_key: record.key,
    kind: "brain",
    batch: structuredClone(input.batch),
    request,
    result: null,
    status: "requested",
    reason: null,
  };
  store.brain_calls.push({ invocation_id: invocationId, conversation_key: record.key, reprocess: Boolean(reprocess) });
  trace(store, "invoke_brain", record.key, { invocation_id: invocationId, reprocess: Boolean(reprocess) });
  return { request };
}

// Fake private brain: decides content and simulates its own tools. The tool
// effect happens here, inside the brain, before the master sees the result.
export function takeBrainScript(store: MasterStore, input: { conversation_key: string }): BrainScript {
  return store.fixtures.brain_scripts[input.conversation_key]?.shift() ?? { bubbles: ["Resposta sintética."] };
}

export function reserveIdSeed(store: MasterStore) {
  store.counter += 1000;
  return store.counter;
}

function seededUuid(prefix: string, seed: { next: number }) {
  seed.next += 1;
  return `${prefix}-0000-4000-8000-${seed.next.toString(16).padStart(12, "0")}`;
}

// Runs at the contract boundary: it receives only lexia.brain.request.v1 and
// its test script, never the master store, and returns lexia.brain.result.v1.
export function runFakeBrain(input: { request: BrainRequest; script: BrainScript; id_seed: number }) {
  const request = input.request;
  const script = input.script;
  const seed = { next: input.id_seed };
  const nextId = () => seededUuid("dddddddd", seed);
  const executed = request.reprocess?.executed_tool_effects ?? [];
  const toolAudit: ToolAuditEntry[] = [];
  const events: DomainEvent[] = [];
  const at = request.messages[request.messages.length - 1]?.occurred_at ?? "2026-10-08T12:00:00.000Z";

  let confirmRef = script.confirm_ref;
  if (script.book) {
    const alreadyBooked = executed.some(
      (effect) => effect.operation === "appointment.create" && effect.appointment_ref === script.book!.appointment_ref,
    );
    confirmRef = script.book.appointment_ref;
    if (!alreadyBooked) {
      const toolInvocation = `tool-${nextId()}`;
      toolAudit.push({
        tool_name: "fake_calendar_create",
        invocation_id: toolInvocation,
        operation: "appointment.create",
        result: "succeeded",
        appointment_ref: script.book.appointment_ref,
      });
      events.push({
        schema_version: "lexia.domain.event.v1",
        event_id: nextId(),
        invocation_id: request.invocation_id,
        idempotency_key: `${script.book.appointment_ref}-confirmed`,
        type: "appointment.confirmed",
        occurred_at: at,
        appointment: {
          appointment_ref: script.book.appointment_ref,
          starts_at: script.book.starts_at,
          ends_at: script.book.ends_at,
          timezone: script.book.timezone,
          tool_invocation_id: toolInvocation,
          status: "confirmed",
        },
      });
    }
  }
  if (script.cancel_ref) {
    const toolInvocation = `tool-${nextId()}`;
    toolAudit.push({
      tool_name: "fake_calendar_cancel",
      invocation_id: toolInvocation,
      operation: "appointment.cancel",
      result: "succeeded",
      appointment_ref: script.cancel_ref,
    });
    events.push({
      schema_version: "lexia.domain.event.v1",
      event_id: nextId(),
      invocation_id: request.invocation_id,
      idempotency_key: `${script.cancel_ref}-cancelled`,
      type: "appointment.cancelled",
      occurred_at: at,
      appointment: { appointment_ref: script.cancel_ref, tool_invocation_id: toolInvocation, status: "cancelled" },
    });
  }
  if (script.handoff) {
    events.push({
      schema_version: "lexia.domain.event.v1",
      event_id: nextId(),
      invocation_id: request.invocation_id,
      idempotency_key: `handoff-${request.invocation_id}`,
      type: "handoff.requested",
      occurred_at: at,
      handoff: { handoff_ref: `handoff-${request.invocation_id}`, ...script.handoff },
    });
  }

  const actionFor = (sequence: number, kind: OutboundAction["kind"], text: string, sourceRef?: string): OutboundAction => ({
    schema_version: "lexia.outbound.action.v1",
    action_id: nextId(),
    invocation_id: request.invocation_id,
    scope: request.scope,
    sequence,
    kind,
    captured_state: { ...request.state },
    content: { type: "text", text },
    ...(sourceRef ? { source_ref: sourceRef } : {}),
  });
  const actions = (script.bubbles ?? []).map((text, index) => actionFor(index + 1, "reply", text));
  if (script.confirmation && confirmRef) {
    actions.push(actionFor(actions.length + 1, "appointment_confirmation", script.confirmation, confirmRef));
  }

  const result: BrainResult = {
    schema_version: "lexia.brain.result.v1",
    invocation_id: request.invocation_id,
    captured_state: { ...request.state },
    decision: script.handoff ? "handoff" : actions.length > 0 ? "reply" : "no_reply",
    actions,
    context_patch: {},
    domain_events: events,
    tool_audit: toolAudit,
  };
  return { result, hooks: script.during_generation ?? [] };
}

// ---------------------------------------------------------------------------
// 7. Validate and apply with the company policy
// ---------------------------------------------------------------------------

export function applyResult(
  store: MasterStore,
  input: { invocation_id: string; result: BrainResult; hooks: RawProviderEvent[]; at: string },
) {
  // Test hook: events that arrived while the brain was generating.
  for (const raw of input.hooks) receive(store, raw);

  const invocation = store.invocations[input.invocation_id];
  if (!invocation?.request || !invocation.batch) throw new Error("invocation_not_found");
  const record = conversation(store, invocation.conversation_key);

  // Tool effects already happened inside the private brain, whatever the
  // master later decides about delivery; they are recorded once here.
  for (const entry of input.result.tool_audit ?? []) {
    if (entry.result === "succeeded" && entry.appointment_ref && entry.operation !== "availability.check") {
      store.tool_effects.push({
        invocation_id: input.invocation_id,
        conversation_key: record.key,
        operation: entry.operation,
        appointment_ref: entry.appointment_ref,
      });
    }
  }
  trace(store, "fake_brain", record.key, {
    actions: (input.result.actions ?? []).length,
    events: (input.result.domain_events ?? []).map((event) => event.type),
  });

  let validated: BrainResult;
  try {
    validated = validateBrainResult(invocation.request, input.result);
  } catch (error) {
    invocation.status = "rejected";
    invocation.reason = error instanceof Error ? error.message.slice(0, 120) : "invalid";
    trace(store, "apply_brain_result", record.key, { outcome: "rejected", reason: invocation.reason });
    return { route: "rejected" as const, actions: 0, rebased: false };
  }

  const policy = resolvePolicy(store, record.scope);
  const applied = applyBrainResult(record.state, {
    request: invocation.request,
    result: validated,
    policy,
    at: input.at,
  });
  record.state = applied.state;
  invocation.result = validated;
  invocation.status = "applied";
  if (applied.actions.length > 0) {
    record.ledger = prepareOutboundActions(record.ledger, {
      actions: applied.actions,
      leadCutoffSeq: invocation.batch.cutoffSeq,
    });
  }
  trace(store, "apply_brain_result", record.key, {
    outcome: "applied",
    rebased: applied.rebased,
    actions: applied.actions.map((action) => action.kind),
    pause_after_appointment: policy.appointment.pauseAfterConfirmation,
  });
  return { route: "applied" as const, actions: applied.actions.length, rebased: applied.rebased };
}

// ---------------------------------------------------------------------------
// 8-9. Per-action gate, fake provider and result recording
// ---------------------------------------------------------------------------

export function claimNextAction(
  store: MasterStore,
  input: { invocation_id: string; claimant: string; at: string },
) {
  const invocation = store.invocations[input.invocation_id];
  if (!invocation) throw new Error("invocation_not_found");
  const record = conversation(store, invocation.conversation_key);
  const entry = nextPreparedAction(record.ledger, input.invocation_id);
  if (!entry) return { has_action: false, reason: "no_prepared_action", action: null, fencing_token: null };

  const binding = store.bindings.find(
    (candidate) => candidate.account_ref === record.scope.account_ref && candidate.environment === record.scope.environment,
  );
  const claim = claimOutboundAction(record.ledger, record.state, {
    actionId: entry.action.action_id,
    claimant: input.claimant,
    at: input.at,
    deliveryEnabled: binding?.delivery_owner === "v2" && binding.delivery_mode === "deliver",
  });
  record.ledger = claim.ledger;
  record.state = claim.state;
  trace(store, "delivery_gate", record.key, {
    action_id: entry.action.action_id,
    kind: entry.action.kind,
    acquired: claim.acquired,
    reason: claim.reason,
  });
  if (!claim.acquired) {
    return { has_action: false, reason: claim.reason, action: null, fencing_token: null };
  }
  return { has_action: true, reason: null, action: entry.action, fencing_token: claim.fencingToken };
}

export function takeProviderScript(store: MasterStore, input: { conversation_key: string }): ProviderScriptEntry {
  return store.fixtures.provider_scripts[input.conversation_key]?.shift() ?? { outcome: "sent" };
}

// Fake provider: receives only the authorized action, records what it would
// have received and answers with the scripted outcome. It never sends.
export function runFakeProvider(input: { action: OutboundAction; claimant: string; script: ProviderScriptEntry; id_seed: number }) {
  const providerMessageId = input.script.outcome === "failed" ? null : `fake-provider-${input.id_seed}`;
  return {
    outcome: input.script.outcome,
    provider_message_id: providerMessageId,
    hooks: input.script.after ?? [],
    received: {
      action_id: input.action.action_id,
      kind: input.action.kind,
      text: input.action.content.type === "text" ? input.action.content.text : input.action.content.media_ref,
      claimant: input.claimant,
    },
  };
}

export function recordDelivery(
  store: MasterStore,
  input: {
    action: OutboundAction;
    claimant: string;
    fencing_token: number;
    outcome: ProviderScriptEntry["outcome"];
    provider_message_id: string | null;
    hooks: RawProviderEvent[];
    received: { action_id: string; kind: string; text: string; claimant: string };
    at: string;
  },
) {
  const key = serializeScope(input.action.scope);
  const record = conversation(store, key);
  store.provider_log.push({
    ...input.received,
    conversation_key: key,
    outcome: input.outcome,
    provider_message_id: input.provider_message_id,
  });
  const status = input.outcome === "timeout" ? "delivery_unknown" : input.outcome;
  const finished = finishOutboundAction(record.ledger, record.state, {
    actionId: input.action.action_id,
    claimant: input.claimant,
    fencingToken: input.fencing_token,
    status,
    ...(input.provider_message_id && status === "sent" ? { providerMessageId: input.provider_message_id } : {}),
    ...(status === "failed" ? { reason: "provider_rejected" } : {}),
    ...(status === "delivery_unknown" ? { reason: "provider_timeout" } : {}),
  });
  record.ledger = finished.ledger;
  record.state = finished.state;
  if (status === "delivery_unknown" && input.provider_message_id) {
    // Kept only to let reconciliation match a later provider status by ID.
    record.ledger.entries[input.action.action_id]!.providerMessageId = input.provider_message_id;
  }
  if (status === "sent") {
    store.messages.push({
      schema_version: "lexia.message.v1",
      event_id: nextUuid(store),
      provider_event_id: `out-${input.provider_message_id}`,
      message_id: input.provider_message_id!,
      scope: input.action.scope,
      author: "ai",
      direction: "outbound",
      occurred_at: input.at,
      ...(input.action.content.type === "text" ? { text: input.action.content.text } : {}),
      action_id: input.action.action_id,
    });
  }
  trace(store, "delivery_result", key, { action_id: input.action.action_id, status });
  // Test hook: events that arrived right after this bubble.
  for (const raw of input.hooks) receive(store, raw);
  return { status, continue: status === "sent" };
}

export function finishBatch(store: MasterStore, input: { invocation_id: string }) {
  const invocation = store.invocations[input.invocation_id];
  if (!invocation?.batch) throw new Error("invocation_not_found");
  const record = conversation(store, invocation.conversation_key);
  const outcome = planOutcome(record.ledger, input.invocation_id);
  const batch = invocation.batch;
  let next: number | null;
  if (outcome.superseded) {
    const superseded = supersedeInboundBatch(record.buffer, {
      batchId: batch.batchId,
      fencingToken: batch.fencingToken,
      invocationId: input.invocation_id,
    });
    record.buffer = superseded.state;
    next = superseded.nextClaimSeq;
    invocation.status = "superseded";
  } else {
    const completed = completeInboundBatch(record.buffer, { batchId: batch.batchId, fencingToken: batch.fencingToken });
    record.buffer = completed.state;
    next = completed.nextClaimSeq;
    if (invocation.status === "applied") invocation.status = "completed";
  }
  trace(store, "finish_batch", record.key, { superseded: outcome.superseded, statuses: outcome.statuses, next_claim_seq: next });
  return { superseded: outcome.superseded, next_claim_seq: next };
}

// A batch that stops before the brain (config unavailable) still completes,
// keeping the recorded messages.
export function closeBatchWithoutBrain(store: MasterStore, input: { conversation_key: string; batch: InboundBatch; reason: string }) {
  const record = conversation(store, input.conversation_key);
  record.buffer = completeInboundBatch(record.buffer, {
    batchId: input.batch.batchId,
    fencingToken: input.batch.fencingToken,
  }).state;
  trace(store, "finish_batch", record.key, { superseded: false, reason: input.reason });
  return { closed: true };
}

// ---------------------------------------------------------------------------
// Automations (reminders and follow-ups) share the same gate
// ---------------------------------------------------------------------------

export function automationRequest(
  store: MasterStore,
  input: { request_id: string; conversation_key: string; kind: "appointment_reminder" | "followup"; source_ref: string; text: string; at: string },
) {
  const existing = store.automation_requests[input.request_id];
  if (existing) return { route: "duplicate", invocation_id: existing.invocation_id, reason: existing.reason };
  const record = conversation(store, input.conversation_key);
  if (input.kind === "appointment_reminder") {
    const appointment = record.state.appointments.find((candidate) => candidate.appointmentRef === input.source_ref);
    const remindable = appointment?.status === "confirmed" && Date.parse(appointment.startsAt) > Date.parse(input.at);
    if (!remindable) {
      store.automation_requests[input.request_id] = { status: "rejected", reason: "appointment_not_remindable", invocation_id: null };
      trace(store, "automation", record.key, { outcome: "rejected", reason: "appointment_not_remindable" });
      return { route: "rejected", invocation_id: null, reason: "appointment_not_remindable" };
    }
  }
  const invocationId = nextUuid(store);
  const action: OutboundAction = {
    schema_version: "lexia.outbound.action.v1",
    action_id: nextUuid(store),
    invocation_id: invocationId,
    scope: record.scope,
    sequence: 1,
    kind: input.kind,
    captured_state: { state_version: record.state.stateVersion, delivery_epoch: record.state.deliveryEpoch },
    content: { type: "text", text: input.text },
    source_ref: input.source_ref,
  };
  // D1: reminders carry no lead cutoff.
  record.ledger = prepareOutboundActions(record.ledger, { actions: [action], leadCutoffSeq: null });
  store.invocations[invocationId] = {
    invocation_id: invocationId,
    conversation_key: record.key,
    kind: "automation",
    batch: null,
    request: null,
    result: null,
    status: "applied",
    reason: null,
  };
  store.automation_requests[input.request_id] = { status: "accepted", reason: null, invocation_id: invocationId };
  trace(store, "automation", record.key, { outcome: "accepted", kind: input.kind });
  return { route: "accepted", invocation_id: invocationId, reason: null };
}

// ---------------------------------------------------------------------------
// State commands from the platform, policy and recovery
// ---------------------------------------------------------------------------

export type StateCommandInput = {
  command:
    | "manual_pause.start"
    | "manual_pause.end"
    | "handoff.resolve"
    | "handoff.resume"
    | "appointment.cancel"
    | "appointment.remove_block"
    | "blocks.expire"
    | "policy.set_appointment_pause"
    | "policy.read";
  conversation_key?: string;
  at: string;
  actor: { role: "lexia_admin" | "cliente_admin" | "cliente_operador"; cliente_slug: string | null };
  ref?: string;
  expires_at?: string;
  pause_after_appointment?: boolean;
  environment?: OmnichannelScope["environment"];
  cliente_slug?: string;
};

export function stateCommand(store: MasterStore, input: StateCommandInput) {
  if (input.command === "policy.read" || input.command === "policy.set_appointment_pause") {
    const target = store.policies.find(
      (record) => record.environment === input.environment && record.cliente_slug === input.cliente_slug && record.status === "active",
    );
    const sameCompany = input.actor.cliente_slug === input.cliente_slug;
    if (input.command === "policy.read") {
      if (input.actor.role !== "lexia_admin" && !sameCompany) return { ok: false, reason: "forbidden" };
      return { ok: Boolean(target), reason: target ? null : "omnichannel_policy_unavailable", policy: target ?? null };
    }
    // Only an active Lexia admin changes the policy; company users view it.
    if (input.actor.role !== "lexia_admin") {
      trace(store, "state_command", null, { command: input.command, outcome: "forbidden" });
      return { ok: false, reason: "lexia_admin_required" };
    }
    if (typeof input.pause_after_appointment !== "boolean" || !target) {
      return { ok: false, reason: "explicit_post_appointment_choice_required" };
    }
    target.status = "inactive";
    store.policies.push({
      ...structuredClone(target),
      status: "active",
      policy_version: `${target.cliente_slug}-v${store.policies.filter((p) => p.cliente_slug === target.cliente_slug).length + 1}`,
      policy: { ...structuredClone(target.policy), appointment: { ...target.policy.appointment, pauseAfterConfirmation: input.pause_after_appointment } },
    });
    trace(store, "state_command", null, { command: input.command, outcome: "applied", cliente_slug: target.cliente_slug });
    return { ok: true, reason: null };
  }

  const record = conversation(store, input.conversation_key!);
  if (input.actor.role !== "lexia_admin" && input.actor.cliente_slug !== record.scope.cliente_slug) {
    return { ok: false, reason: "forbidden" };
  }
  const commandId = `${input.command}:${input.ref ?? ""}:${input.at}`;
  const before = record.state;
  try {
    switch (input.command) {
      case "manual_pause.start":
        record.state = startManualPause(record.state, { commandId, pauseRef: input.ref!, occurredAt: input.at, ...(input.expires_at ? { expiresAt: input.expires_at } : {}) }).state;
        break;
      case "manual_pause.end":
        record.state = endManualPause(record.state, { commandId, pauseRef: input.ref!, occurredAt: input.at }).state;
        break;
      case "handoff.resolve":
        record.state = resolveHandoff(record.state, { commandId, handoffRef: input.ref!, occurredAt: input.at }).state;
        break;
      case "handoff.resume":
        record.state = resumeHandoff(record.state, { commandId, handoffRef: input.ref!, occurredAt: input.at }).state;
        break;
      case "appointment.cancel":
        record.state = cancelAppointment(record.state, { commandId, appointmentRef: input.ref!, occurredAt: input.at, toolInvocationId: `manual-${commandId}` }).state;
        break;
      case "appointment.remove_block":
        record.state = removeAppointmentBlock(record.state, { commandId, appointmentRef: input.ref!, occurredAt: input.at }).state;
        break;
      case "blocks.expire":
        record.state = expireBlocks(record.state, { commandId, occurredAt: input.at }).state;
        break;
    }
  } catch (error) {
    record.state = before;
    const reason = error instanceof Error ? error.message.slice(0, 120) : "rejected";
    trace(store, "state_command", record.key, { command: input.command, outcome: "rejected", reason });
    return { ok: false, reason };
  }

  // answer_pending resumes once when the last block ends.
  let candidateSeq: number | null = null;
  if (getResumeDecision(record.state, input.at) === "answer_pending" && record.buffer.pending.length > 0) {
    const released = releasePendingMessages(record.buffer, { at: input.at });
    record.buffer = released.state;
    record.state = { ...record.state, pendingMessageIds: [] };
    candidateSeq = Math.max(...record.buffer.entries.map((entry) => entry.leadSeq));
  }
  trace(store, "state_command", record.key, { command: input.command, outcome: "applied", resume_candidate_seq: candidateSeq });
  return { ok: true, reason: null, resume_candidate_seq: candidateSeq };
}

export function recovery(
  store: MasterStore,
  input: { operation: "reconcile" | "retry"; conversation_key: string; action_id: string; status?: "sent" | "failed"; provider_message_id?: string },
) {
  const record = conversation(store, input.conversation_key);
  try {
    if (input.operation === "reconcile") {
      const reconciled = reconcileOutboundAction(record.ledger, record.state, {
        actionId: input.action_id,
        status: input.status!,
        ...(input.provider_message_id ? { providerMessageId: input.provider_message_id } : {}),
      });
      record.ledger = reconciled.ledger;
      record.state = reconciled.state;
    } else {
      record.ledger = prepareOutboundRetry(record.ledger, input.action_id);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 120) : "rejected";
    trace(store, "recovery", record.key, { operation: input.operation, outcome: "rejected", reason });
    return { ok: false, reason, invocation_id: null };
  }
  const invocationId = record.ledger.entries[input.action_id]!.action.invocation_id;
  trace(store, "recovery", record.key, { operation: input.operation, outcome: "applied" });
  return { ok: true, reason: null, invocation_id: invocationId };
}

export function scopesEqual(left: OmnichannelScope, right: OmnichannelScope) {
  return sameScope(left, right);
}

// ---------------------------------------------------------------------------
// Envelope routing and test fixtures (used by the master Route node and the
// scenario runner)
// ---------------------------------------------------------------------------

export type MasterEvent =
  | { type: "inbound"; raw: RawProviderEvent }
  | { type: "buffer_tick"; selector: ConversationSelector; candidate_seq: number | "latest"; at: string; execution_id: string }
  | { type: "automation"; selector: ConversationSelector; request_id: string; kind: "appointment_reminder" | "followup"; source_ref: string; text: string; at: string; execution_id: string }
  | { type: "recovery"; selector: ConversationSelector; operation: "reconcile" | "retry"; action_text: string; status?: "sent" | "failed"; provider_message_id?: string; at: string; execution_id: string }
  | { type: "command"; selector?: ConversationSelector; command: Omit<StateCommandInput, "conversation_key"> };

export function routeEnvelope(store: MasterStore, event: MasterEvent) {
  switch (event.type) {
    case "inbound":
      return { route: "inbound", raw: event.raw };
    case "buffer_tick": {
      const key = conversationKeyFor(store, event.selector);
      const record = store.conversations[key];
      const latest = record?.buffer.entries.reduce((max, entry) => Math.max(max, entry.leadSeq), 0) ?? 0;
      return {
        route: "buffer_tick",
        conversation_key: key,
        candidate_seq: event.candidate_seq === "latest" ? latest : event.candidate_seq,
        at: event.at,
        execution_id: event.execution_id,
      };
    }
    case "automation":
      return {
        route: "automation",
        conversation_key: conversationKeyFor(store, event.selector),
        request_id: event.request_id,
        kind: event.kind,
        source_ref: event.source_ref,
        text: event.text,
        at: event.at,
        claimant: event.execution_id,
      };
    case "recovery": {
      const key = conversationKeyFor(store, event.selector);
      const entry = Object.values(conversation(store, key).ledger.entries).find(
        (candidate) => candidate.action.content.type === "text" && candidate.action.content.text === event.action_text,
      );
      return {
        route: "recovery",
        conversation_key: key,
        operation: event.operation,
        action_id: entry?.action.action_id ?? "",
        ...(event.status ? { status: event.status } : {}),
        ...(event.provider_message_id ? { provider_message_id: event.provider_message_id } : {}),
        at: event.at,
        claimant: event.execution_id,
      };
    }
    case "command": {
      const key = event.selector ? conversationKeyFor(store, event.selector) : undefined;
      let ref = event.command.ref;
      // The platform reads the handoff reference from lexia_handoffs; the test
      // scenarios address the latest handoff of the conversation instead.
      if (ref === "$latest_handoff" && key) {
        const handoffs = store.conversations[key]?.state.handoffs ?? [];
        ref = handoffs[handoffs.length - 1]?.handoffRef ?? "";
      }
      return {
        route: "command",
        command: {
          ...event.command,
          ...(ref !== undefined ? { ref } : {}),
          ...(key ? { conversation_key: key } : {}),
        },
      };
    }
    default:
      return { route: "noop" };
  }
}

export type ScenarioFixture = {
  selector: ConversationSelector;
  brain_scripts?: BrainScript[];
  provider_scripts?: ProviderScriptEntry[];
};

export function applyFixtures(store: MasterStore, fixtures: ScenarioFixture[]) {
  for (const fixture of fixtures) {
    const key = conversationKeyFor(store, fixture.selector);
    store.fixtures.brain_scripts[key] = [...(store.fixtures.brain_scripts[key] ?? []), ...(fixture.brain_scripts ?? [])];
    store.fixtures.provider_scripts[key] = [...(store.fixtures.provider_scripts[key] ?? []), ...(fixture.provider_scripts ?? [])];
  }
  return store;
}

export function takeProviderScriptForAction(store: MasterStore, action: OutboundAction) {
  return takeProviderScript(store, { conversation_key: serializeScope(action.scope) });
}

export function planSummary(store: MasterStore, input: { invocation_id: string }) {
  const invocation = store.invocations[input.invocation_id];
  if (!invocation) return { statuses: [], superseded: false, delivered_action_ids: [] };
  const outcome = planOutcome(conversation(store, invocation.conversation_key).ledger, input.invocation_id);
  return { statuses: outcome.statuses, superseded: outcome.superseded, delivered_action_ids: outcome.deliveredActionIds };
}
