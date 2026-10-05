import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import {
  resolvePsqlBinary,
  safePsqlFailure,
  securePsqlEnvironment,
  validateSupabaseRootCertificate,
} from "./lib/psql-client.mjs";
import { validateIndexOperationTarget } from "./lib/target-identity.mjs";

const localEnvironmentFile =
  process.env.LEXIA_LOTE1_ENV_FILE?.trim() || ".env.lote1.test.local";

if (existsSync(localEnvironmentFile)) {
  loadEnvFile(localEnvironmentFile);
}

let target;
try {
  target = validateIndexOperationTarget({
    confirmation: process.env.LEXIA_DB_OPERATION_CONFIRM?.trim(),
    databaseUrl: process.env.LEXIA_DB_OPERATION_URL?.trim(),
    environment: process.env.LEXIA_DB_OPERATION_ENVIRONMENT?.trim(),
    expectedHostname:
      process.env.LEXIA_DB_OPERATION_EXPECTED_HOST?.trim(),
    expectedProjectRef:
      process.env.LEXIA_DB_OPERATION_EXPECTED_PROJECT_REF?.trim(),
    productionApproval:
      process.env.LEXIA_DB_OPERATION_PRODUCTION_APPROVAL?.trim(),
    productionProjectRef:
      process.env.LEXIA_PRODUCTION_SUPABASE_PROJECT_REF?.trim(),
    protectedProjectRefs:
      process.env.LEXIA_PROTECTED_SUPABASE_PROJECT_REFS?.trim(),
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid database target.",
  );
  process.exit(2);
}

if (target.connectionMode !== "session_pooler") {
  console.error("Connectivity check requires the approved Session pooler URI.");
  process.exit(2);
}

const psqlBinary = resolvePsqlBinary(process.env.LEXIA_PSQL_BIN);
let sslRootCertificate;
try {
  sslRootCertificate = validateSupabaseRootCertificate(
    process.env.LEXIA_DB_OPERATION_SSL_ROOT_CERT,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid root certificate.",
  );
  process.exit(2);
}
const result = spawnSync(
  psqlBinary,
  ["-X", "--no-psqlrc", "--command", "\\q"],
  {
    encoding: "utf8",
    env: securePsqlEnvironment(
      process.env.LEXIA_DB_OPERATION_URL?.trim(),
      sslRootCertificate,
    ),
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

console.log("Session pooler connectivity and authentication succeeded.");
console.log(`Project ref: ${target.projectRef}`);
console.log(`Connection mode: ${target.connectionMode}`);
console.log(`Host: ${target.hostname}`);
console.log(`Port: ${target.port}`);
console.log("TLS mode: verify-full");
console.log("SQL statements executed: 0");
