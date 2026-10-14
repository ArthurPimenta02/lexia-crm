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
  console.error(error instanceof Error ? error.message : "Invalid Lot 2 CRM follow-up target.");
  process.exit(2);
}

const psql = resolvePsqlBinary(process.env.LEXIA_PSQL_BIN);
const environment = securePsqlEnvironment(
  process.env.LEXIA_LOTE2_DB_URL,
  rootCertificate,
);
const declaration =
  `set lexia.target_project_ref = '${target.projectRef}'; ` +
  "set lexia.target_environment = 'isolated_test';";
for (const [label, file] of [
  ["CRM follow-up preflight", "supabase/checks/202610090003_lote2_crm_followup_preflight.sql"],
  ["CRM command follow-up", "supabase/migrations/202610090002_lote2_crm_appointment_cancellation.sql"],
]) {
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
    console.error(`Lot 2 ${label} failed.`);
    console.error(sanitize(result.stderr).split("\n").slice(-16).join("\n"));
    process.exit(1);
  }
  console.log(`Lot 2 ${label} passed.`);
}

console.log(`Project ref: ${target.projectRef}`);
console.log("Added RPC: lexia_omni_cancel_appointment_from_crm");
