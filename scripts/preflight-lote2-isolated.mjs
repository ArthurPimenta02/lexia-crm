import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import {
  resolvePsqlBinary,
  securePsqlEnvironment,
  validateSupabaseRootCertificate,
} from "./lib/psql-client.mjs";
import { validateLote2SupabaseTarget } from "./lib/lote2-isolated-target.mjs";

const environmentFile =
  process.env.LEXIA_LOTE2_ENV_FILE?.trim() || ".env.lote2.test.local";
if (existsSync(".env.local")) loadEnvFile(".env.local");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

function sanitizedPsqlFailure(stderr) {
  return String(stderr ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .trim()
    .split("\n")
    .slice(-12)
    .join("\n");
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
  rootCertificate = validateSupabaseRootCertificate(
    process.env.LEXIA_LOTE2_DB_SSL_ROOT_CERT,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid Lot 2 target.");
  process.exit(2);
}

const declaration =
  `set lexia.target_project_ref = '${target.projectRef}'; ` +
  "set lexia.target_environment = 'isolated_test';";
const result = spawnSync(
  resolvePsqlBinary(process.env.LEXIA_PSQL_BIN),
  [
    "-X",
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    declaration,
    "--file",
    "supabase/isolated/lote2/bootstrap_preflight.sql",
  ],
  {
    encoding: "utf8",
    env: securePsqlEnvironment(process.env.LEXIA_LOTE2_DB_URL, rootCertificate),
    maxBuffer: 4 * 1024 * 1024,
  },
);

if (result.status !== 0) {
  console.error(sanitizedPsqlFailure(result.stderr) || "Lot 2 bootstrap preflight failed.");
  process.exit(1);
}

process.stdout.write(result.stdout);
console.log(`Read-only bootstrap preflight passed for ${target.projectRef}.`);
console.log("Database writes executed: 0");
