import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { createClient } from "@supabase/supabase-js";

import { assertContractSchema } from "../lib/omnichannel/schema-validator";
import {
  resolvePsqlBinary,
  securePsqlEnvironment,
  validateSupabaseRootCertificate,
} from "./lib/psql-client.mjs";
import {
  validateLote2FrappeTarget,
  validateLote2RedisTarget,
  validateLote2RuntimeApproval,
  validateLote2SupabaseTarget,
} from "./lib/lote2-isolated-target.mjs";

type JsonRecord = Record<string, unknown>;
type Credentials = { key: string; secret: string };

type Manifest = {
  environment: "isolated_test";
  external_destinations: unknown[];
  real_client_data_allowed: boolean;
  runtime: {
    run_id: string;
    conversation_ref: string;
    identificador_conversa: string;
  };
  tenants: Array<{
    slug: string;
    client_id: string;
    account_id: string;
    provider: "fake";
    delivery_mode: "observe_only";
  }>;
};

type CrmCommand = {
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
  scope: {
    environment: "isolated_test";
    cliente_slug: string;
    channel: "whatsapp";
    account_ref: string;
    conversation_ref: string;
  };
  payload: JsonRecord;
};

const environmentFile =
  process.env.LEXIA_LOTE2_ENV_FILE?.trim() || ".env.lote2.test.local";
if (existsSync(".env.local")) loadEnvFile(".env.local");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const manifest = JSON.parse(
  readFileSync("supabase/isolated/lote2/manifest.json", "utf8"),
) as Manifest;

function sanitize(value: unknown) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/token\s+[^:\s]+:[^\s]+/gi, "token [REDACTED]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .trim();
}

const supabaseTarget = validateLote2SupabaseTarget({
  anonKey: process.env.LEXIA_LOTE2_SUPABASE_ANON_KEY,
  applicationUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  confirmation: process.env.LEXIA_LOTE2_SUPABASE_CONFIRM,
  databaseUrl: process.env.LEXIA_LOTE2_DB_URL,
  environment: process.env.LEXIA_LOTE2_ENVIRONMENT,
  expectedDatabaseHost: process.env.LEXIA_LOTE2_DB_EXPECTED_HOST,
  productionProjectRef: process.env.LEXIA_PRODUCTION_SUPABASE_PROJECT_REF,
  projectRef: process.env.LEXIA_LOTE2_SUPABASE_PROJECT_REF,
  protectedProjectRefs: process.env.LEXIA_PROTECTED_SUPABASE_PROJECT_REFS,
  serviceRoleKey: process.env.LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl: process.env.LEXIA_LOTE2_SUPABASE_URL,
});

const redisTarget = validateLote2RedisTarget({
  confirmation: process.env.LEXIA_LOTE2_REDIS_CONFIRM,
  environment: process.env.LEXIA_LOTE2_ENVIRONMENT,
  expectedHost: process.env.LEXIA_LOTE2_REDIS_EXPECTED_HOST,
  legacyMirandaRedisUrl: process.env.MIRANDA_UPSTASH_REDIS_REST_URL,
  productionRedisUrl: process.env.LEXIA_PRODUCTION_REDIS_REST_URL,
  protectedRedisUrls: process.env.LEXIA_PROTECTED_REDIS_REST_URLS,
  redisUrl: process.env.LEXIA_LOTE2_UPSTASH_REDIS_REST_URL,
  requireEmpty: process.env.LEXIA_LOTE2_REDIS_REQUIRE_EMPTY,
  token: process.env.LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN,
});

validateLote2RuntimeApproval(
  process.env.LEXIA_LOTE2_RUNTIME_CONFIRM,
  supabaseTarget.projectRef,
  redisTarget.host,
);

const frappeTarget = validateLote2FrappeTarget({
  confirmation: process.env.LEXIA_LOTE2_FRAPPE_CONFIRM,
  environment: process.env.LEXIA_LOTE2_ENVIRONMENT,
  expectedSite: process.env.LEXIA_LOTE2_FRAPPE_EXPECTED_SITE,
  integrationApiKey: process.env.LEXIA_LOTE2_FRAPPE_INTEGRATION_API_KEY,
  integrationApiSecret: process.env.LEXIA_LOTE2_FRAPPE_INTEGRATION_API_SECRET,
  operatorApiKey: process.env.LEXIA_LOTE2_FRAPPE_OPERATOR_API_KEY,
  operatorApiSecret: process.env.LEXIA_LOTE2_FRAPPE_OPERATOR_API_SECRET,
  projectRef: supabaseTarget.projectRef,
  url: process.env.LEXIA_LOTE2_FRAPPE_URL,
});

assert.equal(manifest.environment, "isolated_test");
assert.deepEqual(manifest.external_destinations, []);
assert.equal(manifest.real_client_data_allowed, false);
const tenant = manifest.tenants[0]!;
assert.deepEqual(tenant, {
  slug: "empresa_sintetica_a",
  client_id: "20000000-0000-4000-8000-000000000001",
  account_id: "24000000-0000-4000-8000-000000000001",
  provider: "fake",
  delivery_mode: "observe_only",
});

const integrationCredentials: Credentials = {
  key: String(process.env.LEXIA_LOTE2_FRAPPE_INTEGRATION_API_KEY),
  secret: String(process.env.LEXIA_LOTE2_FRAPPE_INTEGRATION_API_SECRET),
};
const operatorCredentials: Credentials = {
  key: String(process.env.LEXIA_LOTE2_FRAPPE_OPERATOR_API_KEY),
  secret: String(process.env.LEXIA_LOTE2_FRAPPE_OPERATOR_API_SECRET),
};
const redisToken = String(process.env.LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN);
const supabase = createClient(
  supabaseTarget.supabaseUrl,
  String(process.env.LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY),
  { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } },
);

const scenarios: string[] = [];
let frappeConversation: string | null = null;
let centralConversation: string | null = null;
let functionalError: unknown;
let cleanupError: unknown;
let sequence = 0;

async function redisCommand(command: Array<string | number>) {
  const response = await fetch(redisTarget.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${redisToken}`,
      "content-type": "application/json",
      "user-agent": "lexia-lote2-frappe-harness",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`redis_http_${response.status}`);
  const body = (await response.json()) as { error?: string; result?: unknown };
  if (body.error) throw new Error("redis_command_rejected");
  return body.result;
}

async function rpc(name: string, parameters: JsonRecord) {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw new Error(`${name}:${error.code}:${sanitize(error.message)}`);
  return data;
}

function firstRow<T>(value: unknown): T {
  const row = Array.isArray(value) ? value[0] : value;
  assert.ok(row, "RPC returned no row.");
  return row as T;
}

async function frappeRequest(
  credentials: Credentials,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${frappeTarget.url}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `token ${credentials.key}:${credentials.secret}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  const body = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(
      `frappe:${path}:http_${response.status}:${sanitize(body.exc_type ?? "request_failed")}`,
    );
  }
  return body;
}

async function frappeMethod(
  credentials: Credentials,
  method: string,
  args: JsonRecord = {},
  httpMethod: "GET" | "POST" = "POST",
) {
  const path = `/api/method/${method}`;
  const body = await frappeRequest(credentials, path, {
    method: httpMethod,
    ...(httpMethod === "POST" ? { body: JSON.stringify(args) } : {}),
  });
  return body.message;
}

async function frappeRows<T>(
  doctype: string,
  filters: unknown[],
  fields: string[],
) {
  const query = new URLSearchParams({
    filters: JSON.stringify(filters),
    fields: JSON.stringify(fields),
    limit_page_length: "100",
  });
  const body = await frappeRequest(
    operatorCredentials,
    `/api/resource/${encodeURIComponent(doctype)}?${query}`,
    { method: "GET" },
  );
  assert.ok(Array.isArray(body.data));
  return body.data as T[];
}

async function expectFrappeFailure(operation: () => Promise<unknown>, code: RegExp) {
  let captured: unknown;
  try {
    await operation();
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof Error, "Frappe operation should have failed.");
  assert.match(captured.message, code);
}

function crmEvent(
  eventType: string,
  payload: JsonRecord,
  source: { authority: string; system: string },
) {
  const eventId = randomUUID();
  sequence += 1;
  return {
    schema_version: "lexia.crm.event.v1",
    event_id: eventId,
    idempotency_key: `frappe-runtime:${eventType}:${eventId}`,
    correlation_id: randomUUID(),
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    emitted_at: new Date().toISOString(),
    sequence,
    scope: {
      environment: "isolated_test",
      cliente_slug: tenant.slug,
      channel: "whatsapp",
      account_ref: tenant.account_id,
      conversation_ref: manifest.runtime.conversation_ref,
    },
    source: {
      system: source.system,
      authority: source.authority,
      workflow_ref: "frappe-isolated-fake-adapter-v1",
      execution_ref: randomUUID(),
    },
    payload,
  };
}

async function ingest(event: JsonRecord) {
  return (await frappeMethod(integrationCredentials, "lexia_crm.api.ingest_event", {
    event,
  })) as JsonRecord;
}

async function queueOperatorCommand(method: string, args: JsonRecord) {
  return (await frappeMethod(operatorCredentials, method, {
    ...args,
    request_id: randomUUID(),
  })) as { command_id: string; status: string };
}

async function claim(commandId: string) {
  const claimed = (await frappeMethod(
    integrationCredentials,
    "lexia_crm.api.crm_claim_command",
    { command_id: commandId },
  )) as { command: CrmCommand; queue_status: string };
  assert.equal(claimed.queue_status, "claimed");
  assertContractSchema("crm-command", claimed.command);
  assert.deepEqual(claimed.command.scope, {
    environment: "isolated_test",
    cliente_slug: tenant.slug,
    channel: "whatsapp",
    account_ref: tenant.account_id,
    conversation_ref: manifest.runtime.conversation_ref,
  });
  return claimed.command;
}

async function applyCommand(command: CrmCommand) {
  assert.ok(centralConversation);
  const common = {
    p_actor: null,
    p_command_id: command.command_id,
    p_conversation_id: centralConversation,
    p_occurred_at: command.occurred_at,
  };
  switch (command.command_type) {
    case "manual_pause.start":
      return rpc("lexia_omni_start_manual_pause", {
        ...common,
        p_expires_at: command.payload.expires_at ?? null,
        p_pause_ref: command.payload.pause_ref,
      });
    case "manual_pause.end":
      return rpc("lexia_omni_end_block", {
        ...common,
        p_block_key: `manual:${command.payload.pause_ref}`,
        p_reason: command.payload.reason ?? "frappe_isolated_harness",
      });
    case "handoff.resolve":
      return rpc("lexia_omni_resolve_handoff", {
        ...common,
        p_handoff_id: command.payload.handoff_id,
        p_notes: command.payload.notes ?? null,
        p_resolution: command.payload.resolution,
      });
    case "handoff.resume":
      return rpc("lexia_omni_resume_handoff", {
        ...common,
        p_handoff_id: command.payload.handoff_id,
      });
    case "appointment.cancel":
      return rpc("lexia_omni_cancel_appointment_from_crm", {
        ...common,
        p_appointment_ref: command.payload.appointment_ref,
      });
    case "appointment.attendance.update":
      return rpc("lexia_omni_update_appointment_attendance", {
        ...common,
        p_appointment_ref: command.payload.appointment_ref,
        p_attendance_status: command.payload.attendance_status,
      });
  }
}

async function acknowledge(commandId: string, status = "applied", reason?: string) {
  return (await frappeMethod(
    integrationCredentials,
    "lexia_crm.api.crm_acknowledge_command",
    { command_id: commandId, status, reason: reason ?? null },
  )) as JsonRecord;
}

async function dispatch(method: string, args: JsonRecord) {
  const queued = await queueOperatorCommand(method, args);
  assert.equal(queued.status, "prepared");
  const command = await claim(queued.command_id);
  await applyCommand(command);
  const ack = await acknowledge(command.command_id);
  assert.equal(ack.projection_applied, true);
  return command;
}

async function centralRows<T>(
  table: string,
  columns: string,
  filters: Array<[string, unknown]>,
) {
  let query = supabase.from(table).select(columns);
  for (const [field, value] of filters) query = query.eq(field, value);
  const { data, error } = await query;
  if (error) throw error;
  return data as T[];
}

async function preflight() {
  const status = (await frappeMethod(
    integrationCredentials,
    "lexia_crm.api.crm_integration_status",
    {},
    "GET",
  )) as JsonRecord;
  assert.deepEqual(status, {
    app_version: "0.4.1",
    environment: "isolated_test",
    client_ref: tenant.slug,
    allowed_account_refs: [tenant.account_id],
    commands_enabled: true,
    command_mode: "outbox_only",
    synthetic_only: true,
  });

  const { data: identity, error: identityError } = await supabase
    .from("lexia_environment_identity")
    .select("project_ref,environment,disposable");
  if (identityError) throw identityError;
  assert.deepEqual(identity, [
    {
      project_ref: supabaseTarget.projectRef,
      environment: "isolated_test",
      disposable: true,
    },
  ]);
  const { count: conversationCount, error: conversationError } = await supabase
    .from("lexia_conversation_states")
    .select("id", { count: "exact", head: true })
    .eq("conversation_ref", manifest.runtime.conversation_ref);
  if (conversationError) throw conversationError;
  assert.equal(conversationCount, 0);
  assert.equal(await redisCommand(["DBSIZE"]), 0);
  scenarios.push("exact Supabase, Redis and Frappe identities validated");
}

async function prepareConversation() {
  centralConversation = String(
    await rpc("lexia_omni_resolve_conversation", {
      p_account_id: tenant.account_id,
      p_conversation_ref: manifest.runtime.conversation_ref,
      p_identificador_conversa: manifest.runtime.identificador_conversa,
    }),
  ).replace(/^"|"$/g, "");
  assert.match(centralConversation, /^[0-9a-f-]{36}$/i);
  const { error } = await supabase.from("lexia_lote2_test_resources").upsert(
    {
      run_id: manifest.runtime.run_id,
      resource_type: "conversation",
      resource_id: centralConversation,
      cliente_slug: tenant.slug,
    },
    { onConflict: "run_id,resource_type,resource_id" },
  );
  if (error) throw error;

  const opened = crmEvent(
    "conversation.opened",
    {
      contact_ref: "synthetic-runtime-frappe-contact",
      display_name: "Pessoa Sintética Frappe",
      resume_mode: "await_new_message",
    },
    { authority: "provider_event", system: "provider" },
  );
  const first = await ingest(opened);
  const duplicate = await ingest(opened);
  assert.equal(first.status, "applied");
  assert.equal(duplicate.status, "duplicate");
  frappeConversation = String(first.aggregate_ref);

  const message = crmEvent(
    "message.recorded",
    {
      message_id: "synthetic-runtime-frappe-message-1",
      direction: "inbound",
      author: "lead",
      message_type: "text",
      delivery_status: "received",
      provider_message_ref: "synthetic-runtime-provider-message-1",
      text: "Mensagem sintética para a timeline do CRM.",
    },
    { authority: "provider_event", system: "provider" },
  );
  assert.equal((await ingest(message)).status, "applied");
  assert.equal((await ingest(message)).status, "duplicate");
  const rows = await frappeRows<JsonRecord>(
    "Lexia Message",
    [["conversation", "=", frappeConversation]],
    ["name", "external_message_ref"],
  );
  assert.equal(rows.length, 1);
  scenarios.push("conversation and message are idempotent in the CRM timeline");
}

async function exerciseCommands() {
  assert.ok(frappeConversation && centralConversation);

  await expectFrappeFailure(
    () =>
      frappeMethod(integrationCredentials, "lexia_crm.api.crm_start_manual_pause", {
        conversation: frappeConversation,
        request_id: randomUUID(),
      }),
    /http_(403|417)/,
  );

  const pause = await queueOperatorCommand("lexia_crm.api.crm_start_manual_pause", {
    conversation: frappeConversation,
    reason: "Pausa sintética do operador.",
  });
  await expectFrappeFailure(
    () =>
      frappeMethod(operatorCredentials, "lexia_crm.api.crm_claim_command", {
        command_id: pause.command_id,
      }),
    /http_(403|417)/,
  );
  const pauseCommand = await claim(pause.command_id);
  await applyCommand(pauseCommand);
  await acknowledge(pause.command_id);

  const handoffRef = "synthetic-runtime-frappe-handoff";
  const handoff = firstRow<{ out_handoff_id: string; out_duplicate: boolean }>(
    await rpc("lexia_omni_request_handoff", {
      p_conversation_id: centralConversation,
      p_handoff_ref: handoffRef,
      p_idempotency_key: "synthetic-runtime-frappe-handoff-request",
      p_motivo: "Atendimento humano sintético.",
      p_occurred_at: new Date().toISOString(),
      p_prioridade: "normal",
      p_resumo: "Handoff sintético para validar o cockpit.",
    }),
  );
  assert.equal(handoff.out_duplicate, false);
  const handoffEvent = crmEvent(
    "handoff.requested",
    {
      handoff_ref: handoffRef,
      central_handoff_id: handoff.out_handoff_id,
      reason: "Atendimento humano sintético.",
      summary: "Handoff sintético para validar o cockpit.",
      priority: "normal",
      requested_at: new Date().toISOString(),
    },
    { authority: "brain_result", system: "brain" },
  );
  const handoffResult = await ingest(handoffEvent);
  assert.equal(handoffResult.status, "applied");
  const frappeHandoff = String(handoffResult.aggregate_ref);

  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const appointmentRef = "synthetic-runtime-frappe-appointment-cancel";
  const originalToolRef = "synthetic-runtime-tool-create-cancel";
  await rpc("lexia_omni_confirm_appointment", {
    p_appointment_ref: appointmentRef,
    p_conversation_id: centralConversation,
    p_ends_at: endsAt,
    p_idempotency_key: "synthetic-runtime-frappe-appointment-confirm",
    p_occurred_at: new Date().toISOString(),
    p_starts_at: startsAt,
    p_timezone: "America/Sao_Paulo",
    p_tool_invocation_id: originalToolRef,
  });
  const appointmentEvent = crmEvent(
    "appointment.confirmed",
    {
      appointment_ref: appointmentRef,
      tool_invocation_id: originalToolRef,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: "America/Sao_Paulo",
      pause_until_end: true,
    },
    { authority: "tool_result", system: "tool" },
  );
  const appointmentResult = await ingest(appointmentEvent);
  assert.equal(appointmentResult.status, "applied");
  const frappeAppointment = String(appointmentResult.aggregate_ref);
  await ingest(
    crmEvent(
      "automation.updated",
      {
        automation_ref: "synthetic-runtime-frappe-reminder",
        automation_type: "appointment_reminder",
        status: "scheduled",
        source_ref: appointmentRef,
        due_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      { authority: "workflow_execution", system: "workflow" },
    ),
  );

  const manualBlocks = await frappeRows<JsonRecord>(
    "Lexia Conversation Block",
    [
      ["conversation", "=", frappeConversation],
      ["block_type", "=", "Pausa manual"],
      ["status", "=", "Ativo"],
    ],
    ["name", "external_ref", "status"],
  );
  assert.equal(manualBlocks.length, 1);
  await dispatch("lexia_crm.api.crm_end_manual_pause", {
    conversation: frappeConversation,
    block: manualBlocks[0]!.name,
    reason: "Retomada sintética pelo operador.",
  });
  const activeAfterManual = await centralRows<{ block_type: string }>(
    "lexia_conversation_blocks",
    "block_type",
    [
      ["conversation_id", centralConversation],
      ["status", "active"],
    ],
  );
  assert.deepEqual(
    new Set(activeAfterManual.map((row) => row.block_type)),
    new Set(["handoff", "appointment"]),
  );
  scenarios.push("manual pause ends without removing handoff or appointment blocks");

  await dispatch("lexia_crm.api.crm_resolve_handoff", {
    handoff: frappeHandoff,
    resolution: "resolved",
    notes: "Resolução sintética.",
  });
  const centralHandoff = (
    await centralRows<{ status: string; retomado_em: string | null }>(
      "lexia_handoffs",
      "status,retomado_em",
      [["id", handoff.out_handoff_id]],
    )
  )[0]!;
  assert.equal(centralHandoff.status, "resolvido");
  assert.equal(centralHandoff.retomado_em, null);
  const handoffBlockBeforeResume = (
    await centralRows<{ status: string }>(
      "lexia_conversation_blocks",
      "status",
      [
        ["conversation_id", centralConversation],
        ["block_key", `handoff:${handoffRef}`],
      ],
    )
  )[0]!;
  assert.equal(handoffBlockBeforeResume.status, "active");

  await dispatch("lexia_crm.api.crm_resume_handoff", { handoff: frappeHandoff });
  const handoffBlockAfterResume = (
    await centralRows<{ status: string }>(
      "lexia_conversation_blocks",
      "status",
      [
        ["conversation_id", centralConversation],
        ["block_key", `handoff:${handoffRef}`],
      ],
    )
  )[0]!;
  assert.equal(handoffBlockAfterResume.status, "ended");
  scenarios.push("handoff resolution and AI resume remain separate commands");

  await dispatch("lexia_crm.api.crm_cancel_appointment", {
    appointment: frappeAppointment,
  });
  const cancelled = (
    await centralRows<{
      status: string;
      tool_invocation_id: string;
      attendance_status: string;
    }>(
      "lexia_appointment_events",
      "status,tool_invocation_id,attendance_status",
      [
        ["conversation_id", centralConversation],
        ["appointment_ref", appointmentRef],
      ],
    )
  )[0]!;
  assert.deepEqual(cancelled, {
    status: "cancelled",
    tool_invocation_id: originalToolRef,
    attendance_status: "cancelled",
  });
  const appointmentBlock = (
    await centralRows<{ status: string }>(
      "lexia_conversation_blocks",
      "status",
      [
        ["conversation_id", centralConversation],
        ["block_key", `appointment:${appointmentRef}`],
      ],
    )
  )[0]!;
  assert.equal(appointmentBlock.status, "active");
  const reminders = await frappeRows<{ status: string }>(
    "Lexia Automation Event",
    [
      ["conversation", "=", frappeConversation],
      ["source_ref", "=", appointmentRef],
    ],
    ["status"],
  );
  assert.deepEqual(reminders, [{ status: "Cancelado" }]);
  scenarios.push("CRM cancellation preserves tool provenance and pause while cancelling reminders");

  const attendanceRef = "synthetic-runtime-frappe-appointment-attendance";
  const attendanceStartsAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const attendanceEndsAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await rpc("lexia_omni_confirm_appointment", {
    p_appointment_ref: attendanceRef,
    p_conversation_id: centralConversation,
    p_ends_at: attendanceEndsAt,
    p_idempotency_key: "synthetic-runtime-frappe-attendance-confirm",
    p_occurred_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    p_starts_at: attendanceStartsAt,
    p_timezone: "America/Sao_Paulo",
    p_tool_invocation_id: "synthetic-runtime-tool-create-attendance",
  });
  const attendanceEvent = await ingest(
    crmEvent(
      "appointment.confirmed",
      {
        appointment_ref: attendanceRef,
        tool_invocation_id: "synthetic-runtime-tool-create-attendance",
        starts_at: attendanceStartsAt,
        ends_at: attendanceEndsAt,
        timezone: "America/Sao_Paulo",
        pause_until_end: true,
      },
      { authority: "tool_result", system: "tool" },
    ),
  );
  await dispatch("lexia_crm.api.crm_update_appointment_attendance", {
    appointment: String(attendanceEvent.aggregate_ref),
    attendance_status: "no_show",
  });
  const attendance = (
    await centralRows<{ attendance_status: string }>(
      "lexia_appointment_events",
      "attendance_status",
      [
        ["conversation_id", centralConversation],
        ["appointment_ref", attendanceRef],
      ],
    )
  )[0]!;
  assert.equal(attendance.attendance_status, "no_show");
  scenarios.push("no-show recorded in the central control plane and Frappe");

  const uncertain = await queueOperatorCommand("lexia_crm.api.crm_start_manual_pause", {
    conversation: frappeConversation,
    reason: "Resultado sintético incerto.",
  });
  const uncertainCommand = await claim(uncertain.command_id);
  const unknownAck = await acknowledge(
    uncertain.command_id,
    "delivery_unknown",
    "synthetic_timeout",
  );
  assert.equal(unknownAck.projection_applied, false);
  await expectFrappeFailure(
    () =>
      frappeMethod(integrationCredentials, "lexia_crm.api.crm_claim_command", {
        command_id: uncertain.command_id,
      }),
    /http_(409|417|422)/,
  );
  const uncertainBlocks = await centralRows<{ id: string }>(
    "lexia_conversation_blocks",
    "id",
    [
      ["conversation_id", centralConversation],
      ["block_key", `manual:${uncertainCommand.payload.pause_ref}`],
    ],
  );
  assert.equal(uncertainBlocks.length, 0);
  scenarios.push("uncertain command result is not projected or retried automatically");
}

function cleanupDatabase() {
  const certificate = validateSupabaseRootCertificate(
    process.env.LEXIA_LOTE2_DB_SSL_ROOT_CERT,
  );
  const psql = resolvePsqlBinary(process.env.LEXIA_PSQL_BIN);
  const environment = securePsqlEnvironment(
    process.env.LEXIA_LOTE2_DB_URL,
    certificate,
  );
  const declaration =
    `set lexia.target_project_ref = '${supabaseTarget.projectRef}'; ` +
    `set lexia.lote2_runtime_cleanup_confirm = ` +
    `'CLEAN_LOTE2_RUNTIME:${supabaseTarget.projectRef}';`;
  const result = spawnSync(
    psql,
    [
      "-X",
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      declaration,
      "--file",
      "supabase/isolated/lote2/000000000004_lote2_runtime_cleanup.sql",
    ],
    { encoding: "utf8", env: environment, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`database_cleanup_failed:${sanitize(result.stderr).split("\n").slice(-12).join("\n")}`);
  }
}

async function cleanup() {
  const errors: Error[] = [];
  if (frappeConversation) {
    try {
      await frappeMethod(
        integrationCredentials,
        "lexia_crm.api.crm_cleanup_synthetic_conversation",
        { conversation: frappeConversation },
      );
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (centralConversation) {
    try {
      cleanupDatabase();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  try {
    const { count, error } = await supabase
      .from("lexia_conversation_states")
      .select("id", { count: "exact", head: true })
      .eq("conversation_ref", manifest.runtime.conversation_ref);
    if (error) throw error;
    assert.equal(count, 0);
    const { count: runtimeResources, error: resourceError } = await supabase
      .from("lexia_lote2_test_resources")
      .select("resource_id", { count: "exact", head: true })
      .eq("run_id", manifest.runtime.run_id);
    if (resourceError) throw resourceError;
    assert.equal(runtimeResources, 0);
    assert.equal(await redisCommand(["DBSIZE"]), 0);
    if (frappeConversation) {
      const remaining = await frappeRows<JsonRecord>(
        "Lexia Conversation",
        [["name", "=", frappeConversation]],
        ["name"],
      );
      assert.equal(remaining.length, 0);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  if (errors.length > 0) throw new Error(errors.map((error) => sanitize(error.message)).join(" | "));
}

async function main() {
  try {
    await preflight();
    await prepareConversation();
    await exerciseCommands();
  } catch (error) {
    functionalError = error;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupError = error;
    }
  }

  for (const scenario of scenarios) console.log(`PASS: ${scenario}`);
  if (functionalError) console.error(`Functional failure: ${sanitize(functionalError)}`);
  if (cleanupError) console.error(`Cleanup failure: ${sanitize(cleanupError)}`);
  if (functionalError || cleanupError) {
    process.exitCode = 1;
    return;
  }
  console.log("PASS: Frappe and Supabase synthetic cleanup completed; Redis remained empty");
}

void main().catch((error) => {
  console.error(`Harness failure before cleanup: ${sanitize(error)}`);
  process.exitCode = 1;
});
