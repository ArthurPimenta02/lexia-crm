import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getUpstashRestTarget,
  parseStrictBoolean,
  validateLote2DatabaseWriteApproval,
  validateLote2FrappeTarget,
  validateLote2RedisTarget,
  validateLote2RuntimeApproval,
  validateLote2SupabaseTarget,
} from "../scripts/lib/lote2-isolated-target.mjs";

const testRef = "aaaaaaaaaaaaaaaaaaaa";
const productionRef = "pppppppppppppppppppp";
const pooler = "aws-0-us-east-2.pooler.supabase.com";

function supabaseInput() {
  return {
    anonKey: "publishable-test-key",
    confirmation: `I_UNDERSTAND_THIS_IS_DISPOSABLE_LOTE2:${testRef}`,
    databaseUrl: `postgresql://postgres.${testRef}:fake@${pooler}:5432/postgres`,
    environment: "isolated_test",
    expectedDatabaseHost: pooler,
    productionProjectRef: productionRef,
    projectRef: testRef,
    serviceRoleKey: "secret-test-key",
    supabaseUrl: `https://${testRef}.supabase.co`,
  };
}

test("Lot 2 Supabase target binds API, Session pooler, ref and confirmation", () => {
  const target = validateLote2SupabaseTarget(supabaseInput());
  assert.equal(target.projectRef, testRef);
  assert.equal(target.database.connectionMode, "session_pooler");

  assert.throws(
    () => validateLote2SupabaseTarget({
      ...supabaseInput(),
      confirmation: `I_UNDERSTAND_THIS_IS_DISPOSABLE_LOTE2:${productionRef}`,
      databaseUrl: `postgresql://postgres.${productionRef}:fake@${pooler}:5432/postgres`,
      projectRef: productionRef,
      supabaseUrl: `https://${productionRef}.supabase.co`,
    }),
    /protected/,
  );
  assert.throws(
    () => validateLote2SupabaseTarget({
      ...supabaseInput(),
      databaseUrl: `postgresql://postgres.${testRef}:fake@${pooler}:6543/postgres`,
    }),
    /Transaction pooler/,
  );
  assert.throws(
    () => validateLote2SupabaseTarget({
      ...supabaseInput(),
      expectedDatabaseHost: "aws-0-sa-east-1.pooler.supabase.com",
    }),
    /EXPECTED_HOST/,
  );
  assert.throws(
    () => validateLote2SupabaseTarget({
      ...supabaseInput(),
      confirmation: `I_UNDERSTAND_THIS_IS_DISPOSABLE_LOTE2:${productionRef}`,
    }),
    /must equal/,
  );
});

test("database writes require a separate project-bound approval", () => {
  assert.equal(
    validateLote2DatabaseWriteApproval(`APPLY_LOTE2_ISOLATED:${testRef}`, testRef),
    true,
  );
  assert.throws(
    () => validateLote2DatabaseWriteApproval("APPLY_LOTE2_ISOLATED", testRef),
    /must equal/,
  );
});

test("runtime writes require an approval bound to both disposable targets", () => {
  const redisHost = "synthetic-cat-12345.upstash.io";
  assert.equal(
    validateLote2RuntimeApproval(
      `RUN_LOTE2_ISOLATED:${testRef}:${redisHost}`,
      testRef,
      redisHost,
    ),
    true,
  );
  assert.throws(
    () => validateLote2RuntimeApproval(
      `RUN_LOTE2_ISOLATED:${testRef}:another-cat-12345.upstash.io`,
      testRef,
      redisHost,
    ),
    /must equal/,
  );
  assert.throws(
    () => validateLote2RuntimeApproval("", testRef, "redis.example.com"),
    /host is invalid/,
  );
});

test("Frappe runtime is bound to the loopback lab and separate roles", () => {
  const input = {
    confirmation: `RUN_LOTE2_FRAPPE_ISOLATED:${testRef}:crm-hml.localhost:18080`,
    environment: "isolated_test",
    expectedSite: "crm-hml.localhost",
    integrationApiKey: "integration-key-synthetic",
    integrationApiSecret: "integration-secret-synthetic",
    operatorApiKey: "operator-key-synthetic",
    operatorApiSecret: "operator-secret-synthetic",
    projectRef: testRef,
    url: "http://crm-hml.localhost:18080",
  };
  assert.deepEqual(validateLote2FrappeTarget(input), {
    environment: "isolated_test",
    expectedSite: "crm-hml.localhost",
    projectRef: testRef,
    url: "http://crm-hml.localhost:18080",
  });
  assert.throws(
    () => validateLote2FrappeTarget({ ...input, url: "https://crm.example.com" }),
    /loopback-only/,
  );
  assert.throws(
    () => validateLote2FrappeTarget({ ...input, operatorApiKey: input.integrationApiKey }),
    /must be distinct/,
  );
  assert.throws(
    () => validateLote2FrappeTarget({ ...input, confirmation: "" }),
    /must equal/,
  );
});

test("strict booleans fail closed", () => {
  assert.equal(parseStrictBoolean("true", "FLAG"), true);
  assert.equal(parseStrictBoolean("false", "FLAG"), false);
  assert.throws(() => parseStrictBoolean("", "FLAG"), /exactly true or false/);
  assert.throws(() => parseStrictBoolean("yes", "FLAG"), /exactly true or false/);
});

test("Redis target requires an exact disposable HTTPS endpoint", () => {
  const url = "https://synthetic-cat-12345.upstash.io";
  const input = {
    confirmation: "I_UNDERSTAND_THIS_IS_DISPOSABLE_REDIS:synthetic-cat-12345.upstash.io",
    environment: "isolated_test",
    expectedHost: "synthetic-cat-12345.upstash.io",
    redisUrl: url,
    requireEmpty: "true",
    token: "synthetic-token",
  };
  assert.deepEqual(validateLote2RedisTarget(input), {
    environment: "isolated_test",
    host: "synthetic-cat-12345.upstash.io",
    requireEmpty: true,
    url,
  });
  assert.throws(
    () => validateLote2RedisTarget({ ...input, legacyMirandaRedisUrl: url }),
    /protected or already in use/,
  );
  assert.throws(
    () => validateLote2RedisTarget({ ...input, token: "" }),
    /TOKEN is required/,
  );
  assert.throws(
    () => getUpstashRestTarget(`${url}/get/key`),
    /only the HTTPS endpoint host/,
  );
  assert.throws(
    () => getUpstashRestTarget("http://synthetic-cat-12345.upstash.io"),
    /HTTPS/,
  );
});

test("the bootstrap is read-only and the baseline refuses a non-empty project", () => {
  const preflight = readFileSync(
    "supabase/isolated/lote2/bootstrap_preflight.sql",
    "utf8",
  );
  const baseline = readFileSync(
    "supabase/isolated/lote2/000000000000_lote2_test_baseline.sql",
    "utf8",
  );
  assert.match(preflight, /begin transaction read only/i);
  const preflightWithoutComments = preflight.replace(/--.*$/gm, "");
  assert.doesNotMatch(
    preflightWithoutComments,
    /\b(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/i,
  );
  assert.match(baseline, /Unexpected public relations exist; baseline refused/);
  assert.match(baseline, /Auth users already exist; baseline refused/);
  assert.match(baseline, /Storage objects already exist; baseline refused/);
});

test("fixtures and cleanup are synthetic, scoped and destination-free", () => {
  const fixtures = readFileSync(
    "supabase/isolated/lote2/000000000001_lote2_test_fixtures.sql",
    "utf8",
  );
  const cleanup = readFileSync(
    "supabase/isolated/lote2/000000000003_lote2_test_cleanup.sql",
    "utf8",
  );
  const runtimeCleanup = readFileSync(
    "supabase/isolated/lote2/000000000004_lote2_runtime_cleanup.sql",
    "utf8",
  );
  const manifest = JSON.parse(
    readFileSync("supabase/isolated/lote2/manifest.json", "utf8"),
  );

  assert.deepEqual(
    manifest.tenants.map((tenant: { slug: string }) => tenant.slug),
    ["empresa_sintetica_a", "empresa_sintetica_b"],
  );
  assert.deepEqual(
    manifest.tenants.map((tenant: { client_id: string }) => tenant.client_id),
    [
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
    ],
  );
  assert.deepEqual(manifest.external_destinations, []);
  assert.equal(manifest.real_client_data_allowed, false);
  assert.doesNotMatch(fixtures, /miranda|detail|asteric/i);
  assert.doesNotMatch(fixtures, /https?:\/\//i);
  assert.match(fixtures, /'fake'[\s\S]*?'observe_only'/);
  assert.match(cleanup, /CLEAN_LOTE2_SYNTHETIC_DATA:/);
  assert.match(cleanup, /where cliente_slug in \('empresa_sintetica_a', 'empresa_sintetica_b'\)/g);
  assert.match(cleanup, /disable trigger lexia_conversation_state_events_append_only/i);
  assert.match(cleanup, /enable trigger lexia_conversation_state_events_append_only/i);
  assert.doesNotMatch(cleanup, /delete from auth\.users/i);
  assert.match(runtimeCleanup, /CLEAN_LOTE2_RUNTIME:/);
  assert.match(runtimeCleanup, /synthetic-runtime-conversation-shared/g);
  assert.match(runtimeCleanup, /disable trigger lexia_conversation_state_events_append_only/i);
  assert.match(runtimeCleanup, /enable trigger lexia_conversation_state_events_append_only/i);
  assert.doesNotMatch(runtimeCleanup, /delete from auth\.users/i);
  assert.doesNotMatch(runtimeCleanup, /\btruncate\b/i);
});

test("runtime harness is fail-closed and cleans only manifest Redis keys", () => {
  const source = readFileSync("scripts/test-lote2-runtime-isolated.ts", "utf8");
  assert.match(source, /validateLote2SupabaseTarget/);
  assert.match(source, /validateLote2RedisTarget/);
  assert.match(source, /validateLote2RuntimeApproval/);
  assert.match(source, /provider, "fake"/);
  assert.match(source, /delivery_mode, "observe_only"/);
  assert.match(source, /p_event_type: "message"/);
  assert.doesNotMatch(source, /p_event_type: "message\.received"/);
  assert.match(source, /runtimeRedisKeys/);
  assert.match(source, /\["DEL", \.\.\.runtimeRedisKeys\]/);
  assert.doesNotMatch(source, /FLUSHDB|FLUSHALL/i);
  assert.doesNotMatch(source, /\/rest\/v1\/["'`]?[^\s]*https?:/i);
});

test("Frappe harness uses separate roles, outbox acknowledgement and manifest cleanup", () => {
  const source = readFileSync("scripts/test-lote2-frappe-isolated.ts", "utf8");
  assert.match(source, /validateLote2FrappeTarget/);
  assert.match(source, /LEXIA_LOTE2_FRAPPE_INTEGRATION_API_KEY/);
  assert.match(source, /LEXIA_LOTE2_FRAPPE_OPERATOR_API_KEY/);
  assert.match(source, /lexia_crm\.api\.crm_claim_command/);
  assert.match(source, /lexia_crm\.api\.crm_acknowledge_command/);
  assert.match(source, /lexia_omni_cancel_appointment_from_crm/);
  assert.match(source, /tool_invocation_id: originalToolRef/);
  assert.match(source, /delivery_unknown/);
  assert.match(source, /crm_cleanup_synthetic_conversation/);
  assert.match(source, /000000000004_lote2_runtime_cleanup\.sql/);
  assert.doesNotMatch(source, /FLUSHDB|FLUSHALL/i);
  assert.doesNotMatch(source, /provider.*send|openai|anthropic|googleapis/i);
});

test("isolated harness files contain no credential-shaped values", () => {
  const files = [
    "supabase/isolated/lote2/000000000000_lote2_test_baseline.sql",
    "supabase/isolated/lote2/000000000001_lote2_test_fixtures.sql",
    "supabase/isolated/lote2/000000000002_lote2_test_verify.sql",
    "supabase/isolated/lote2/000000000003_lote2_test_cleanup.sql",
    "supabase/isolated/lote2/000000000004_lote2_runtime_cleanup.sql",
    "supabase/isolated/lote2/bootstrap_preflight.sql",
    "supabase/isolated/lote2/manifest.json",
  ];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(content, /eyJ[A-Za-z0-9_-]{20,}/, file);
    assert.doesNotMatch(content, /redis(?:s)?:\/\/[^\s]+@/i, file);
    assert.doesNotMatch(content, /postgres(?:ql)?:\/\/[^\s]+@/i, file);
  }
});

test("all remote gates compare the isolated target with local application config", () => {
  for (const file of [
    "scripts/check-lote2-db-connectivity.mjs",
    "scripts/check-lote2-redis-connectivity.mjs",
    "scripts/preflight-lote2-isolated.mjs",
    "scripts/apply-lote2-isolated.mjs",
    "scripts/apply-lote2-isolated-followup.mjs",
    "scripts/apply-lote2-crm-command-followup.mjs",
    "scripts/test-lote2-runtime-isolated.ts",
    "scripts/test-lote2-frappe-isolated.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    const local = source.indexOf('loadEnvFile(".env.local")');
    const isolated = source.indexOf("loadEnvFile(environmentFile)");
    assert.ok(local !== -1 && isolated > local, file);
  }
});
