import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import {
  resolvePsqlBinary,
  securePsqlEnvironment,
  validateSupabaseRootCertificate,
} from "./lib/psql-client.mjs";
import {
  validateLote2DatabaseWriteApproval,
  validateLote2SupabaseTarget,
} from "./lib/lote2-isolated-target.mjs";

const environmentFile =
  process.env.LEXIA_LOTE2_ENV_FILE?.trim() || ".env.lote2.test.local";
if (existsSync(".env.local")) loadEnvFile(".env.local");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

function sanitize(text) {
  return String(text ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .trim();
}

let target;
let rootCertificate;
try {
  target = validateLote2SupabaseTarget({
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
  validateLote2DatabaseWriteApproval(
    process.env.LEXIA_LOTE2_APPLY_CONFIRM,
    target.projectRef,
  );
  rootCertificate = validateSupabaseRootCertificate(
    process.env.LEXIA_LOTE2_DB_SSL_ROOT_CERT,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid Lot 2 apply target.");
  process.exit(2);
}

const declaration =
  `set lexia.target_project_ref = '${target.projectRef}'; ` +
  "set lexia.target_environment = 'isolated_test';";
const psql = resolvePsqlBinary(process.env.LEXIA_PSQL_BIN);
const environment = securePsqlEnvironment(
  process.env.LEXIA_LOTE2_DB_URL,
  rootCertificate,
);

const steps = [
  ["empty-project preflight", "supabase/isolated/lote2/bootstrap_preflight.sql"],
  ["minimal isolated baseline", "supabase/isolated/lote2/000000000000_lote2_test_baseline.sql"],
  ["Lot 2 migration preflight", "supabase/checks/202610080001_lote2_preflight.sql"],
  ["Lot 2 control-plane migration", "supabase/migrations/202610080001_lote2_omnichannel_control_plane.sql"],
  ["Lot 2 state-event follow-up", "supabase/migrations/202610090001_lote2_state_event_command_types.sql"],
  ["synthetic fixtures", "supabase/isolated/lote2/000000000001_lote2_test_fixtures.sql"],
  ["Lot 2 post-migration verification", "supabase/checks/202610080002_lote2_verify.sql"],
  ["isolated harness verification", "supabase/isolated/lote2/000000000002_lote2_test_verify.sql"],
];

for (const [label, file] of steps) {
  console.log(`Running ${label}...`);
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
      file,
    ],
    { encoding: "utf8", env: environment, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error(`${label} failed. No later step was executed.`);
    console.error(sanitize(result.stderr).split("\n").slice(-16).join("\n"));
    process.exit(1);
  }
  console.log(`${label}: passed`);
}

console.log("Lot 2 isolated database harness installed and verified.");
console.log(`Project ref: ${target.projectRef}`);
console.log("Delivery mode: observe_only");
console.log("External destinations configured: 0");
