import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { createClient } from "@supabase/supabase-js";

import { buildRedisKey } from "../lib/omnichannel/redis-keys";
import type { OmnichannelScope } from "../lib/omnichannel/contracts";
import {
  resolvePsqlBinary,
  securePsqlEnvironment,
  validateSupabaseRootCertificate,
} from "./lib/psql-client.mjs";
import {
  validateLote2RedisTarget,
  validateLote2RuntimeApproval,
  validateLote2SupabaseTarget,
} from "./lib/lote2-isolated-target.mjs";

type JsonRecord = Record<string, unknown>;

type RuntimeManifest = {
  environment: "isolated_test";
  external_destinations: unknown[];
  real_client_data_allowed: boolean;
  runtime: {
    run_id: string;
    conversation_ref: string;
    identificador_conversa: string;
  };
  redis: {
    allowed_tenant_prefixes: string[];
  };
  tenants: Array<{
    slug: string;
    account_id: string;
    provider: "fake";
    delivery_mode: "observe_only";
  }>;
};

type RuntimeState = {
  id: string;
  environment: "isolated_test";
  cliente_slug: string;
  channel: "whatsapp";
  account_id: string;
  conversation_ref: string;
  state_version: number;
  delivery_epoch: number;
  lead_message_seq: number;
  projection_status: "current" | "stale";
};

type RuntimeBlock = {
  conversation_id: string;
  block_key: string;
  block_type: string;
  source_ref: string;
  expires_at: string | null;
  status: string;
};

const environmentFile =
  process.env.LEXIA_LOTE2_ENV_FILE?.trim() || ".env.lote2.test.local";
if (existsSync(".env.local")) loadEnvFile(".env.local");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const manifest = JSON.parse(
  readFileSync("supabase/isolated/lote2/manifest.json", "utf8"),
) as RuntimeManifest;

function sanitize(value: unknown) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
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

assert.equal(manifest.environment, "isolated_test");
assert.deepEqual(manifest.external_destinations, []);
assert.equal(manifest.real_client_data_allowed, false);
assert.deepEqual(
  manifest.tenants.map((tenant) => tenant.slug),
  ["empresa_sintetica_a", "empresa_sintetica_b"],
);

const serviceRoleKey = String(process.env.LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY);
const redisToken = String(process.env.LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN);
const supabase = createClient(supabaseTarget.supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const runtimeRedisKeys = new Set<string>();
const scenarioResults: string[] = [];
let databaseCleanupAttempted = false;
let redisCleanupAttempted = false;

async function redisCommand(command: Array<string | number>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(redisTarget.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${redisToken}`,
        "content-type": "application/json",
        "user-agent": "lexia-lote2-runtime-harness",
      },
      body: JSON.stringify(command),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
    const payload = (await response.json()) as { error?: string; result?: unknown };
    if (payload.error) throw new Error("Redis rejected a harness command.");
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function rpc(name: string, parameters: JsonRecord) {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) {
    throw new Error(`${name}:${error.code ?? "rpc_error"}:${sanitize(error.message)}`);
  }
  return data;
}

function firstRow<T>(data: unknown): T {
  const value = Array.isArray(data) ? data[0] : data;
  assert.ok(value, "RPC returned no row.");
  return value as T;
}

async function insertResources(rows: JsonRecord[]) {
  const { error } = await supabase
    .from("lexia_lote2_test_resources")
    .upsert(rows, { onConflict: "run_id,resource_type,resource_id" });
  if (error) throw new Error(`resource_manifest:${error.code}:${sanitize(error.message)}`);
}

async function assertRemoteIdentityAndFixtures() {
  const { data: identities, error: identityError } = await supabase
    .from("lexia_environment_identity")
    .select("project_ref,environment,disposable");
  if (identityError) throw identityError;
  assert.equal(identities.length, 1);
  assert.deepEqual(identities[0], {
    project_ref: supabaseTarget.projectRef,
    environment: "isolated_test",
    disposable: true,
  });

  const accountIds = manifest.tenants.map((tenant) => tenant.account_id);
  const { data: accounts, error: accountError } = await supabase
    .from("lexia_channel_accounts")
    .select(
      "id,environment,cliente_slug,channel,provider,status,delivery_owner,delivery_mode",
    )
    .in("id", accountIds);
  if (accountError) throw accountError;
  assert.equal(accounts.length, 2);
  for (const account of accounts) {
    assert.equal(account.environment, "isolated_test");
    assert.equal(account.channel, "whatsapp");
    assert.equal(account.provider, "fake");
    assert.equal(account.status, "active");
    assert.equal(account.delivery_owner, "v2");
    assert.equal(account.delivery_mode, "observe_only");
  }

  const { count: resourceCount, error: resourceError } = await supabase
    .from("lexia_lote2_test_resources")
    .select("resource_id", { count: "exact", head: true })
    .eq("run_id", manifest.runtime.run_id);
  if (resourceError) throw resourceError;
  assert.equal(resourceCount, 0, "A previous runtime manifest still exists.");

  const { count: conversationCount, error: conversationError } = await supabase
    .from("lexia_conversation_states")
    .select("id", { count: "exact", head: true })
    .eq("environment", "isolated_test")
    .eq("conversation_ref", manifest.runtime.conversation_ref);
  if (conversationError) throw conversationError;
  assert.equal(conversationCount, 0, "A previous synthetic runtime conversation remains.");

  const redisSize = await redisCommand(["DBSIZE"]);
  assert.equal(redisSize, 0, "The isolated Redis must be empty before the run.");
  scenarioResults.push("identity, fixtures and empty Redis preflight");
}

async function resolveConversation(accountId: string) {
  const id = await rpc("lexia_omni_resolve_conversation", {
    p_account_id: accountId,
    p_conversation_ref: manifest.runtime.conversation_ref,
    p_identificador_conversa: manifest.runtime.identificador_conversa,
  });
  assert.match(String(id), /^[0-9a-f-]{36}$/i);
  return String(id);
}

async function recordMessage(input: {
  author: "lead" | "human_agent";
  conversationId: string;
  content: string;
  mediaKind?: string | null;
  mediaStatus?: string | null;
  providerMessageId: string;
  timestamp: string;
  type?: string;
}) {
  return firstRow<{ out_mensagem_id: string; out_duplicate: boolean }>(
    await rpc("lexia_omni_record_message", {
      p_action_id: null,
      p_author: input.author,
      p_conteudo: input.content,
      p_conversation_id: input.conversationId,
      p_media_kind: input.mediaKind ?? null,
      p_media_processing_status: input.mediaStatus ?? null,
      p_provider_message_id: input.providerMessageId,
      p_provider_timestamp: input.timestamp,
      p_tipo: input.type ?? "texto",
    }),
  );
}

async function expectRpcFailure(
  name: string,
  parameters: JsonRecord,
  expectedCode: RegExp,
) {
  let captured: unknown;
  try {
    await rpc(name, parameters);
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof Error, `${name} should have failed.`);
  assert.match(captured.message, expectedCode);
}

async function getRuntimeStates(ids: string[]) {
  const { data, error } = await supabase
    .from("lexia_conversation_states")
    .select(
      "id,environment,cliente_slug,channel,account_id,conversation_ref,state_version,delivery_epoch,lead_message_seq,projection_status",
    )
    .in("id", ids);
  if (error) throw error;
  assert.equal(data.length, ids.length);
  return data as RuntimeState[];
}

function scopeForState(state: RuntimeState): OmnichannelScope {
  return {
    environment: state.environment,
    cliente_slug: state.cliente_slug,
    channel: state.channel,
    account_ref: state.account_id,
    conversation_ref: state.conversation_ref,
  };
}

async function projectConversations(conversationIds: string[], hmacSecret: string) {
  const states = await getRuntimeStates(conversationIds);
  const { data: blocks, error: blockError } = await supabase
    .from("lexia_conversation_blocks")
    .select("conversation_id,block_key,block_type,source_ref,expires_at,status")
    .in("conversation_id", conversationIds)
    .eq("status", "active");
  if (blockError) throw blockError;

  const resources: JsonRecord[] = [];
  for (const state of states) {
    const scope = scopeForState(state);
    const stateKey = buildRedisKey(scope, "state", hmacSecret);
    const blocksKey = buildRedisKey(scope, "blocks", hmacSecret);
    const expiriesKey = buildRedisKey(scope, "block_expiries", hmacSecret);
    const tenantPrefix = `lexia:omni:v2:isolated_test:${state.cliente_slug}:`;
    assert.ok(manifest.redis.allowed_tenant_prefixes.includes(tenantPrefix));

    for (const key of [stateKey, blocksKey, expiriesKey]) {
      assert.ok(key.startsWith(tenantPrefix));
      assert.ok(!key.includes(manifest.runtime.conversation_ref));
      runtimeRedisKeys.add(key);
      resources.push({
        run_id: manifest.runtime.run_id,
        resource_type: "redis_key",
        resource_id: key,
        cliente_slug: state.cliente_slug,
      });
    }
  }
  await insertResources(resources);

  for (const state of states) {
    const scope = scopeForState(state);
    const stateKey = buildRedisKey(scope, "state", hmacSecret);
    const blocksKey = buildRedisKey(scope, "blocks", hmacSecret);
    const expiriesKey = buildRedisKey(scope, "block_expiries", hmacSecret);
    const scopedBlocks = (blocks as RuntimeBlock[]).filter(
      (block) => block.conversation_id === state.id,
    );

    await redisCommand(["DEL", blocksKey, expiriesKey]);
    await redisCommand([
      "HSET",
      stateKey,
      "environment",
      state.environment,
      "cliente_slug",
      state.cliente_slug,
      "channel",
      state.channel,
      "account_ref",
      state.account_id,
      "state_version",
      state.state_version,
      "delivery_epoch",
      state.delivery_epoch,
      "lead_message_seq",
      state.lead_message_seq,
      "active_block_count",
      scopedBlocks.length,
    ]);

    for (const block of scopedBlocks) {
      await redisCommand([
        "HSET",
        blocksKey,
        block.block_key,
        JSON.stringify({
          block_type: block.block_type,
          expires_at: block.expires_at,
          source_ref: block.source_ref,
          status: block.status,
        }),
      ]);
      if (block.expires_at) {
        await redisCommand([
          "ZADD",
          expiriesKey,
          Date.parse(block.expires_at),
          block.block_key,
        ]);
      }
    }

    assert.equal(await redisCommand(["HGET", stateKey, "cliente_slug"]), state.cliente_slug);
    assert.equal(
      Number(await redisCommand(["HGET", stateKey, "state_version"])),
      state.state_version,
    );
  }

  const { data: outbox, error: outboxError } = await supabase
    .from("lexia_omnichannel_projection_outbox")
    .select("id,conversation_id,state_version")
    .in("conversation_id", conversationIds)
    .eq("status", "pending")
    .order("state_version", { ascending: true });
  if (outboxError) throw outboxError;
  for (const item of outbox) {
    await rpc("lexia_omni_complete_projection", {
      p_outbox_id: item.id,
      p_status: "done",
    });
  }

  const projected = await getRuntimeStates(conversationIds);
  for (const state of projected) assert.equal(state.projection_status, "current");
  return projected;
}

function runDatabaseCleanup() {
  databaseCleanupAttempted = true;
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
    throw new Error(
      `database_cleanup_failed:${sanitize(result.stderr).split("\n").slice(-12).join("\n")}`,
    );
  }
}

async function runRedisCleanup() {
  redisCleanupAttempted = true;
  if (runtimeRedisKeys.size > 0) {
    await redisCommand(["DEL", ...runtimeRedisKeys]);
  }
  assert.equal(await redisCommand(["DBSIZE"]), 0, "Redis cleanup left unexpected keys.");
}

async function verifyDatabaseCleanup() {
  const { count: conversations, error: conversationError } = await supabase
    .from("lexia_conversation_states")
    .select("id", { count: "exact", head: true })
    .eq("environment", "isolated_test")
    .eq("conversation_ref", manifest.runtime.conversation_ref);
  if (conversationError) throw conversationError;
  assert.equal(conversations, 0);

  const { count: resources, error: resourceError } = await supabase
    .from("lexia_lote2_test_resources")
    .select("resource_id", { count: "exact", head: true })
    .eq("run_id", manifest.runtime.run_id);
  if (resourceError) throw resourceError;
  assert.equal(resources, 0);

  const { count: fixtures, error: fixtureError } = await supabase
    .from("lexia_channel_accounts")
    .select("id", { count: "exact", head: true })
    .in(
      "id",
      manifest.tenants.map((tenant) => tenant.account_id),
    );
  if (fixtureError) throw fixtureError;
  assert.equal(fixtures, 2, "Runtime cleanup removed configuration fixtures.");
}

async function runScenarios() {
  await assertRemoteIdentityAndFixtures();

  const tenantA = manifest.tenants[0];
  const tenantB = manifest.tenants[1];
  const conversationA = await resolveConversation(tenantA.account_id);
  await insertResources([
    {
      run_id: manifest.runtime.run_id,
      resource_type: "conversation",
      resource_id: conversationA,
      cliente_slug: tenantA.slug,
    },
  ]);
  const conversationB = await resolveConversation(tenantB.account_id);
  await insertResources([
    {
      run_id: manifest.runtime.run_id,
      resource_type: "conversation",
      resource_id: conversationB,
      cliente_slug: tenantB.slug,
    },
  ]);
  assert.notEqual(conversationA, conversationB);
  scenarioResults.push("same external conversation remains isolated by tenant/account");

  const now = Date.now();
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  const ingressA = firstRow<{ out_duplicate: boolean }>(
    await rpc("lexia_omni_register_ingress", {
      p_account_id: tenantA.account_id,
      p_conversation_id: conversationA,
      p_event_type: "message",
      p_occurred_at: at(0),
      p_provider_event_id: "synthetic-runtime-event-a-1",
    }),
  );
  const ingressARetry = firstRow<{ out_duplicate: boolean }>(
    await rpc("lexia_omni_register_ingress", {
      p_account_id: tenantA.account_id,
      p_conversation_id: conversationA,
      p_event_type: "message",
      p_occurred_at: at(0),
      p_provider_event_id: "synthetic-runtime-event-a-1",
    }),
  );
  assert.equal(ingressA.out_duplicate, false);
  assert.equal(ingressARetry.out_duplicate, true);

  const leadA = await recordMessage({
    author: "lead",
    content: "Mensagem sintetica A",
    conversationId: conversationA,
    providerMessageId: "synthetic-runtime-message-a-1",
    timestamp: at(0),
  });
  const leadARetry = await recordMessage({
    author: "lead",
    content: "Mensagem sintetica A",
    conversationId: conversationA,
    providerMessageId: "synthetic-runtime-message-a-1",
    timestamp: at(0),
  });
  assert.equal(leadA.out_duplicate, false);
  assert.equal(leadARetry.out_duplicate, true);
  assert.equal(leadA.out_mensagem_id, leadARetry.out_mensagem_id);
  const leadStateA = firstRow<{
    out_disposition: string;
    out_duplicate: boolean;
    out_lead_seq: number;
  }>(
    await rpc("lexia_omni_record_lead_message", {
      p_command_id: "synthetic-runtime-lead-a-1",
      p_conversation_id: conversationA,
      p_mensagem_id: leadA.out_mensagem_id,
      p_occurred_at: at(0),
    }),
  );
  assert.equal(leadStateA.out_disposition, "buffered");
  assert.equal(leadStateA.out_duplicate, false);
  scenarioResults.push("ingress and message retries are idempotent");

  await rpc("lexia_omni_start_manual_pause", {
    p_actor: null,
    p_command_id: "synthetic-runtime-manual-b-start",
    p_conversation_id: conversationB,
    p_expires_at: null,
    p_occurred_at: at(1000),
    p_pause_ref: "runtime-b",
  });
  const leadB = await recordMessage({
    author: "lead",
    content: "Mensagem sintetica B durante pausa",
    conversationId: conversationB,
    providerMessageId: "synthetic-runtime-message-b-1",
    timestamp: at(2000),
  });
  const leadStateB = firstRow<{ out_disposition: string }>(
    await rpc("lexia_omni_record_lead_message", {
      p_command_id: "synthetic-runtime-lead-b-1",
      p_conversation_id: conversationB,
      p_mensagem_id: leadB.out_mensagem_id,
      p_occurred_at: at(2000),
    }),
  );
  assert.equal(leadStateB.out_disposition, "pending");
  await rpc("lexia_omni_end_block", {
    p_actor: null,
    p_block_key: "manual:runtime-b",
    p_command_id: "synthetic-runtime-manual-b-end",
    p_conversation_id: conversationB,
    p_occurred_at: at(3000),
    p_reason: "synthetic_runtime_test",
  });
  const releasedB = await rpc("lexia_omni_release_pending", {
    p_command_id: "synthetic-runtime-release-b",
    p_conversation_id: conversationB,
  });
  assert.equal(releasedB, 1);
  scenarioResults.push("answer_pending releases once after the final block ends");

  await rpc("lexia_omni_register_ingress", {
    p_account_id: tenantB.account_id,
    p_conversation_id: conversationB,
    p_event_type: "message",
    p_occurred_at: at(2000),
    p_provider_event_id: "synthetic-runtime-event-b-1",
  });

  const humanAudio = await recordMessage({
    author: "human_agent",
    content: "[audio sintetico da equipe]",
    conversationId: conversationA,
    mediaKind: "audio",
    mediaStatus: "pending",
    providerMessageId: "synthetic-runtime-human-audio-a-1",
    timestamp: at(10_000),
    type: "audio",
  });
  const humanLatest = firstRow<{ out_expires_at: string }>(
    await rpc("lexia_omni_record_human_intervention", {
      p_command_id: "synthetic-runtime-human-a-latest",
      p_conversation_id: conversationA,
      p_mensagem_id: humanAudio.out_mensagem_id,
      p_occurred_at: at(10_000),
    }),
  );
  await rpc("lexia_omni_update_media_status", {
    p_media_error_code: "synthetic_transcription_failed",
    p_media_processing_status: "failed",
    p_mensagem_id: humanAudio.out_mensagem_id,
  });

  const delayedHuman = await recordMessage({
    author: "human_agent",
    content: "Intervencao sintetica atrasada",
    conversationId: conversationA,
    providerMessageId: "synthetic-runtime-human-a-delayed",
    timestamp: at(-590_000),
  });
  const delayedResult = firstRow<{ out_expires_at: string }>(
    await rpc("lexia_omni_record_human_intervention", {
      p_command_id: "synthetic-runtime-human-a-delayed",
      p_conversation_id: conversationA,
      p_mensagem_id: delayedHuman.out_mensagem_id,
      p_occurred_at: at(-590_000),
    }),
  );
  assert.equal(delayedResult.out_expires_at, humanLatest.out_expires_at);

  const { data: audioRow, error: audioError } = await supabase
    .from("lexia_mensagens")
    .select("id,media_processing_status,media_error_code")
    .eq("id", humanAudio.out_mensagem_id)
    .single();
  if (audioError) throw audioError;
  assert.equal(audioRow.media_processing_status, "failed");
  assert.equal(audioRow.media_error_code, "synthetic_transcription_failed");
  scenarioResults.push("audio transcription failure preserves message and human pause");

  await rpc("lexia_omni_start_manual_pause", {
    p_actor: null,
    p_command_id: "synthetic-runtime-manual-a-start",
    p_conversation_id: conversationA,
    p_expires_at: null,
    p_occurred_at: at(20_000),
    p_pause_ref: "runtime-a",
  });
  const handoff = firstRow<{ out_handoff_id: string; out_duplicate: boolean }>(
    await rpc("lexia_omni_request_handoff", {
      p_conversation_id: conversationA,
      p_handoff_ref: "runtime-a",
      p_idempotency_key: "synthetic-runtime-handoff-a",
      p_motivo: "Handoff sintetico",
      p_occurred_at: at(30_000),
      p_prioridade: "normal",
      p_resumo: "Resumo sintetico sem dados reais",
    }),
  );
  assert.equal(handoff.out_duplicate, false);
  const handoffRetry = firstRow<{ out_handoff_id: string; out_duplicate: boolean }>(
    await rpc("lexia_omni_request_handoff", {
      p_conversation_id: conversationA,
      p_handoff_ref: "runtime-a",
      p_idempotency_key: "synthetic-runtime-handoff-a",
      p_motivo: "Handoff sintetico",
      p_occurred_at: at(30_000),
      p_prioridade: "normal",
      p_resumo: "Resumo sintetico sem dados reais",
    }),
  );
  assert.equal(handoffRetry.out_duplicate, true);
  assert.equal(handoffRetry.out_handoff_id, handoff.out_handoff_id);

  const appointmentA = firstRow<{ out_paused: boolean; out_duplicate: boolean }>(
    await rpc("lexia_omni_confirm_appointment", {
      p_appointment_ref: "synthetic-runtime-appointment-a",
      p_conversation_id: conversationA,
      p_ends_at: at(7_200_000),
      p_idempotency_key: "synthetic-runtime-appointment-confirm-a",
      p_occurred_at: at(40_000),
      p_starts_at: at(3_600_000),
      p_timezone: "America/Sao_Paulo",
      p_tool_invocation_id: "synthetic-tool-create-a",
    }),
  );
  assert.equal(appointmentA.out_paused, true);
  assert.equal(appointmentA.out_duplicate, false);
  await rpc("lexia_omni_cancel_appointment", {
    p_appointment_ref: "synthetic-runtime-appointment-a",
    p_conversation_id: conversationA,
    p_idempotency_key: "synthetic-runtime-appointment-cancel-a",
    p_occurred_at: at(50_000),
    p_tool_invocation_id: "synthetic-tool-cancel-a",
  });

  const appointmentB = firstRow<{ out_paused: boolean }>(
    await rpc("lexia_omni_confirm_appointment", {
      p_appointment_ref: "synthetic-runtime-appointment-b",
      p_conversation_id: conversationB,
      p_ends_at: at(7_200_000),
      p_idempotency_key: "synthetic-runtime-appointment-confirm-b",
      p_occurred_at: at(40_000),
      p_starts_at: at(3_600_000),
      p_timezone: "America/Sao_Paulo",
      p_tool_invocation_id: "synthetic-tool-create-b",
    }),
  );
  assert.equal(appointmentB.out_paused, false);

  const pausedLeadA = await recordMessage({
    author: "lead",
    content: "Mensagem sintetica A durante bloqueios simultaneos",
    conversationId: conversationA,
    providerMessageId: "synthetic-runtime-message-a-2",
    timestamp: at(60_000),
  });
  const pausedLeadStateA = firstRow<{ out_disposition: string }>(
    await rpc("lexia_omni_record_lead_message", {
      p_command_id: "synthetic-runtime-lead-a-2",
      p_conversation_id: conversationA,
      p_mensagem_id: pausedLeadA.out_mensagem_id,
      p_occurred_at: at(60_000),
    }),
  );
  assert.equal(pausedLeadStateA.out_disposition, "pending");

  await rpc("lexia_omni_end_block", {
    p_actor: null,
    p_block_key: "manual:runtime-a",
    p_command_id: "synthetic-runtime-manual-a-end",
    p_conversation_id: conversationA,
    p_occurred_at: at(70_000),
    p_reason: "synthetic_runtime_test",
  });
  await rpc("lexia_omni_resolve_handoff", {
    p_actor: null,
    p_command_id: "synthetic-runtime-handoff-a-resolve",
    p_conversation_id: conversationA,
    p_handoff_id: handoff.out_handoff_id,
    p_notes: "Resolucao sintetica",
    p_occurred_at: at(80_000),
    p_resolution: "resolved",
  });
  const { data: unresolvedBlock, error: unresolvedBlockError } = await supabase
    .from("lexia_conversation_blocks")
    .select("status")
    .eq("conversation_id", conversationA)
    .eq("block_key", "handoff:runtime-a")
    .single();
  if (unresolvedBlockError) throw unresolvedBlockError;
  assert.equal(unresolvedBlock.status, "active");
  await rpc("lexia_omni_resume_handoff", {
    p_actor: null,
    p_command_id: "synthetic-runtime-handoff-a-resume",
    p_conversation_id: conversationA,
    p_handoff_id: handoff.out_handoff_id,
    p_occurred_at: at(90_000),
  });

  const releasedA = await rpc("lexia_omni_release_pending", {
    p_command_id: "synthetic-runtime-release-a",
    p_conversation_id: conversationA,
  });
  assert.equal(releasedA, 0);
  const { data: activeBlocksA, error: activeBlockError } = await supabase
    .from("lexia_conversation_blocks")
    .select("block_key,block_type,status")
    .eq("conversation_id", conversationA)
    .eq("status", "active");
  if (activeBlockError) throw activeBlockError;
  assert.deepEqual(
    activeBlocksA.map((block) => block.block_type).sort(),
    ["appointment", "human_intervention"],
  );
  const { data: cancelledAppointment, error: appointmentError } = await supabase
    .from("lexia_appointment_events")
    .select("status,attendance_status,paused_until_end")
    .eq("conversation_id", conversationA)
    .eq("appointment_ref", "synthetic-runtime-appointment-a")
    .single();
  if (appointmentError) throw appointmentError;
  assert.deepEqual(cancelledAppointment, {
    status: "cancelled",
    attendance_status: "cancelled",
    paused_until_end: true,
  });
  scenarioResults.push("independent pause, handoff and appointment lifecycles");

  await rpc("lexia_omni_store_context", {
    p_company_fields: { segmento_a: "sintetico" },
    p_config_version: "synthetic-a-v1",
    p_context_call_id: randomUUID(),
    p_conversation_id: conversationA,
    p_expected_context_version: 0,
    p_operational_context: { summary: "Contexto sintetico A" },
    p_source_message_ids: [leadA.out_mensagem_id],
  });
  await expectRpcFailure(
    "lexia_omni_store_context",
    {
      p_company_fields: { segmento_b: "sintetico" },
      p_config_version: "synthetic-b-v1",
      p_context_call_id: randomUUID(),
      p_conversation_id: conversationB,
      p_expected_context_version: 0,
      p_operational_context: { summary: "Tentativa cruzada" },
      p_source_message_ids: [leadA.out_mensagem_id],
    },
    /context_source_scope_mismatch/,
  );
  scenarioResults.push("context source cannot cross conversations or tenants");

  const [stateA] = (await getRuntimeStates([conversationA])) as [RuntimeState];
  const actionId = randomUUID();
  const invocationId = randomUUID();
  const prepared = await rpc("lexia_omni_prepare_outbound_actions", {
    p_actions: [
      {
        action_id: actionId,
        captured_state: {
          state_version: stateA.state_version,
          delivery_epoch: stateA.delivery_epoch,
        },
        content: { type: "text", text: "Resposta sintetica que nao sera enviada" },
        kind: "reply",
        sequence: 1,
        source_ref: null,
      },
    ],
    p_automation_request_id: null,
    p_conversation_id: conversationA,
    p_invocation_id: invocationId,
    p_lead_cutoff_seq: stateA.lead_message_seq,
  });
  assert.equal(prepared, 1);
  const claim = firstRow<{
    out_acquired: boolean;
    out_reason: string;
    out_status: string;
  }>(
    await rpc("lexia_omni_claim_outbound_action", {
      p_action_id: actionId,
      p_claimant: "isolated-runtime-harness",
    }),
  );
  assert.deepEqual(claim, {
    out_acquired: false,
    out_status: "suppressed",
    out_reason: "observe_only",
    out_fencing_token: null,
  });
  scenarioResults.push("observe_only gate suppresses delivery before any provider call");

  const hmacSecret = randomBytes(32).toString("hex");
  const firstProjection = await projectConversations(
    [conversationA, conversationB],
    hmacSecret,
  );
  const firstProjectedA = firstProjection.find((state) => state.id === conversationA);
  assert.ok(firstProjectedA);

  const laterHuman = await recordMessage({
    author: "human_agent",
    content: "Nova intervencao sintetica apos projecao",
    conversationId: conversationA,
    providerMessageId: "synthetic-runtime-human-a-after-projection",
    timestamp: at(120_000),
  });
  await rpc("lexia_omni_record_human_intervention", {
    p_command_id: "synthetic-runtime-human-a-after-projection",
    p_conversation_id: conversationA,
    p_mensagem_id: laterHuman.out_mensagem_id,
    p_occurred_at: at(120_000),
  });
  const [staleA] = (await getRuntimeStates([conversationA])) as [RuntimeState];
  assert.equal(staleA.projection_status, "stale");
  assert.ok(staleA.state_version > firstProjectedA.state_version);
  const stateKeyA = buildRedisKey(scopeForState(staleA), "state", hmacSecret);
  assert.equal(
    Number(await redisCommand(["HGET", stateKeyA, "state_version"])),
    firstProjectedA.state_version,
  );

  const secondProjection = await projectConversations(
    [conversationA, conversationB],
    hmacSecret,
  );
  const secondProjectedA = secondProjection.find((state) => state.id === conversationA);
  assert.ok(secondProjectedA);
  assert.equal(secondProjectedA.state_version, staleA.state_version);
  assert.equal(
    Number(await redisCommand(["HGET", stateKeyA, "state_version"])),
    staleA.state_version,
  );
  scenarioResults.push("Redis projection is tenant-scoped, stale-aware and replayable");
}

async function main() {
  let functionalError: unknown;
  let cleanupError: unknown;

  try {
    await runScenarios();
  } catch (error) {
    functionalError = error;
  } finally {
    try {
      await runRedisCleanup();
    } catch (error) {
      cleanupError = error;
    }
    try {
      runDatabaseCleanup();
      await verifyDatabaseCleanup();
    } catch (error) {
      cleanupError ??= error;
    }
  }

  if (functionalError || cleanupError) {
    if (functionalError) {
      console.error(`Functional failure: ${sanitize(functionalError)}`);
    }
    if (cleanupError) {
      console.error(`Cleanup failure: ${sanitize(cleanupError)}`);
    }
    console.error(`Redis cleanup attempted: ${redisCleanupAttempted}`);
    console.error(`Database cleanup attempted: ${databaseCleanupAttempted}`);
    process.exitCode = 1;
    return;
  }

  console.log("Lot 2 isolated Supabase + Redis runtime harness passed.");
  console.log(`Project ref: ${supabaseTarget.projectRef}`);
  console.log(`Redis host: ${redisTarget.host}`);
  console.log("Provider: fake");
  console.log("Delivery mode: observe_only");
  for (const result of scenarioResults) console.log(`PASS: ${result}`);
  console.log("External calls to models, channels or providers: 0");
  console.log("Redis cleanup: passed (0 keys)");
  console.log("Database runtime cleanup: passed (configuration fixtures preserved)");
}

void main();
