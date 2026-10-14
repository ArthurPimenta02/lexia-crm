import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import {
  resolvePsqlBinary,
  safePsqlFailure,
  securePsqlEnvironment,
  validateSupabaseRootCertificate,
} from "./lib/psql-client.mjs";
import { validateLote2SupabaseTarget } from "./lib/lote2-isolated-target.mjs";

const environmentFile =
  process.env.LEXIA_LOTE2_ENV_FILE?.trim() || ".env.lote2.test.local";
if (existsSync(".env.local")) loadEnvFile(".env.local");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

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

const result = spawnSync(
  resolvePsqlBinary(process.env.LEXIA_PSQL_BIN),
  ["-X", "--no-psqlrc", "--command", "\\q"],
  {
    encoding: "utf8",
    env: securePsqlEnvironment(process.env.LEXIA_LOTE2_DB_URL, rootCertificate),
  },
);

if (result.error?.code === "ENOENT") {
  console.error("psql client is not installed or could not be found.");
  process.exit(2);
}
if (result.status !== 0) {
  console.error(safePsqlFailure(result.stderr));
  process.exit(1);
}

console.log("Lot 2 Session pooler connectivity and authentication succeeded.");
console.log(`Project ref: ${target.projectRef}`);
console.log(`Environment: ${target.environment}`);
console.log(`Connection mode: ${target.database.connectionMode}`);
console.log(`Host: ${target.database.hostname}`);
console.log(`Port: ${target.database.port}`);
console.log("TLS mode: verify-full");
console.log("SQL statements executed: 0");
