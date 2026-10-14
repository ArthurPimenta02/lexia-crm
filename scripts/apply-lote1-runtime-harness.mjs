import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import {
  assertConnectedDatabaseTarget,
  assertIsolatedRemoteIdentity,
  validateIndexOperationTarget,
  validateIsolatedTestTarget,
} from "./lib/target-identity.mjs";
import {
  resolvePsqlBinary,
  securePsqlEnvironment,
  validateSupabaseRootCertificate,
} from "./lib/psql-client.mjs";
import {
  parsePsqlBoolean,
  parsePsqlDataLines,
  parsePsqlDelimitedRow,
  parsePsqlNonNegativeInteger,
  parsePsqlSingleRow,
} from "./lib/psql-output.mjs";
import { assertRuntimeHarnessMode } from "./lib/runtime-harness-contracts.mjs";

const commandArguments = process.argv.slice(2);
if (
  commandArguments.length > 1 ||
  (commandArguments.length === 1 && commandArguments[0] !== "--verify-only")
) {
  console.error("Only the optional --verify-only argument is supported.");
  process.exit(2);
}
const verifyOnly = commandArguments[0] === "--verify-only";

const localEnvironmentFile =
  process.env.LEXIA_LOTE1_ENV_FILE?.trim() || ".env.lote1.test.local";

if (existsSync(localEnvironmentFile)) {
  loadEnvFile(localEnvironmentFile);
}

const testUrl = process.env.LEXIA_TEST_SUPABASE_URL?.trim();
const anonKey = process.env.LEXIA_TEST_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey =
  process.env.LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY?.trim();
const testProjectRef =
  process.env.LEXIA_TEST_SUPABASE_PROJECT_REF?.trim();
const runtimeConfirmation =
  process.env.LEXIA_RUNTIME_HARNESS_CONFIRM?.trim();
const databaseUrl = process.env.LEXIA_DB_OPERATION_URL?.trim();

let isolatedTarget;
let databaseTarget;

try {
  isolatedTarget = validateIsolatedTestTarget({
    anonKey,
    applicationUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    confirmation: process.env.LEXIA_TEST_CONFIRM_ISOLATED?.trim(),
    productionProjectRef:
      process.env.LEXIA_PRODUCTION_SUPABASE_PROJECT_REF?.trim(),
    protectedProjectRefs:
      process.env.LEXIA_PROTECTED_SUPABASE_PROJECT_REFS?.trim(),
    serviceRoleKey,
    testProjectRef,
    testUrl,
  });

  databaseTarget = validateIndexOperationTarget({
    confirmation: process.env.LEXIA_DB_OPERATION_CONFIRM?.trim(),
    databaseUrl,
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
    error instanceof Error ? error.message : "Invalid isolated target.",
  );
  process.exit(2);
}

if (
  isolatedTarget.testProjectRef !== databaseTarget.projectRef ||
  databaseTarget.environment !== "isolated_test" ||
  databaseTarget.connectionMode !== "session_pooler"
) {
  console.error(
    "The API target and database target are not the same isolated project.",
  );
  process.exit(2);
}

const confirmationOperation = verifyOnly
  ? "VERIFY_RUNTIME_HARNESS"
  : "APPLY_RUNTIME_HARNESS";
const expectedRuntimeConfirmation =
  `${confirmationOperation}:${isolatedTarget.testProjectRef}`;
if (runtimeConfirmation !== expectedRuntimeConfirmation) {
  console.error(
    `LEXIA_RUNTIME_HARNESS_CONFIRM must equal ${expectedRuntimeConfirmation}.`,
  );
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

function redact(value) {
  let output = String(value ?? "");
  for (const secret of [databaseUrl, anonKey, serviceRoleKey]) {
    if (secret) output = output.replaceAll(secret, "[REDACTED]");
  }
  return output;
}

function psql(args) {
  const result = spawnSync(
    psqlBinary,
    ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", ...args],
    {
      encoding: "utf8",
      env: securePsqlEnvironment(databaseUrl, sslRootCertificate),
    },
  );

  if (result.error?.code === "ENOENT") {
    throw new Error("psql client is not installed or could not be found.");
  }

  if (result.status !== 0) {
    throw new Error(redact(result.stderr.trim() || "psql command failed."));
  }

  return result.stdout.trim();
}

function scalarQuery(sql) {
  return psql(["--tuples-only", "--no-align", "--command", sql]);
}

const baseTables = [
  "lexia_ai_execucoes",
  "lexia_ai_mensagens",
  "lexia_ai_sessoes",
  "lexia_ajustes_agente",
  "lexia_clientes",
  "lexia_conversation_insights",
  "lexia_environment_identity",
  "lexia_user_link_pendencias",
  "lexia_usuarios_clientes",
  "lexia_workflows",
];
const runtimeTables = [
  "lexia_contactos",
  "lexia_feedbacks",
  "lexia_handoffs",
  "lexia_mensagens",
  "lexia_runtime_test_harness",
  "lexia_testes_execucoes",
  "lexia_testes_sessoes",
];

try {
  const [actualDatabaseName, actualServerAddress] = parsePsqlDelimitedRow(
    scalarQuery(`
      begin transaction read only;
      select current_database() || '|' || coalesce(host(inet_server_addr()), '');
      commit;
    `),
    2,
    "Connected database identity",
  );

  assertConnectedDatabaseTarget({
    actualDatabaseName,
    actualServerAddress,
    connectionMode: databaseTarget.connectionMode,
    expectedDatabaseName: databaseTarget.databaseName,
    resolvedAddresses: [],
  });

  const [projectRef, environment, disposableValue] = parsePsqlDelimitedRow(
    scalarQuery(`
      begin transaction read only;
      select project_ref || '|' || environment || '|' || disposable::text
      from public.lexia_environment_identity
      where id = true;
      commit;
    `),
    3,
    "Disposable database identity",
  );
  const disposable = parsePsqlBoolean(
    disposableValue,
    "Disposable database identity flag",
  );

  assertIsolatedRemoteIdentity(
    {
      disposable,
      environment,
      project_ref: projectRef,
    },
    isolatedTarget.testProjectRef,
  );

  const harnessExists = parsePsqlBoolean(
    parsePsqlSingleRow(
      scalarQuery(`
      begin transaction read only;
      select (to_regclass('public.lexia_runtime_test_harness') is not null)::text;
      commit;
      `),
      "Runtime harness marker lookup",
    ),
    "Runtime harness marker lookup",
  );

  assertRuntimeHarnessMode({ harnessExists, verifyOnly });

  const installedTables = parsePsqlDataLines(
    scalarQuery(`
      begin transaction read only;
      select tablename
      from pg_catalog.pg_tables
      where schemaname = 'public'
      order by tablename;
      commit;
    `),
  );
  const expectedTables = [...baseTables, ...(harnessExists ? runtimeTables : [])]
    .sort();

  if (JSON.stringify(installedTables) !== JSON.stringify(expectedTables)) {
    throw new Error(
      "Preflight stopped: the disposable public schema contains unexpected or missing tables.",
    );
  }

  const countLines = parsePsqlDataLines(
    scalarQuery(`
      begin transaction read only;
      select count(*)::text from public.lexia_environment_identity;
      select count(*)::text from auth.users;
      select sum(row_count)::text
      from (
        select count(*) row_count from public.lexia_clientes
        union all select count(*) from public.lexia_usuarios_clientes
        union all select count(*) from public.lexia_workflows
        union all select count(*) from public.lexia_ajustes_agente
        union all select count(*) from public.lexia_user_link_pendencias
        union all select count(*) from public.lexia_ai_sessoes
        union all select count(*) from public.lexia_ai_mensagens
        union all select count(*) from public.lexia_ai_execucoes
        union all select count(*) from public.lexia_conversation_insights
      ) counts;
      commit;
    `),
  );

  if (countLines.length !== 3) {
    throw new Error("Disposable database counts returned an unexpected shape.");
  }

  const [identityCount, authUserCount, dataCount] = countLines.map(
    (value, index) =>
      parsePsqlNonNegativeInteger(
        value,
        ["Identity count", "Auth user count", "Product data count"][index],
      ),
  );

  if (identityCount !== 1 || authUserCount !== 0 || dataCount !== 0) {
    throw new Error(
      "Preflight stopped: the disposable project contains users or product data.",
    );
  }

  if (harnessExists) {
    const runtimeDataCount = parsePsqlNonNegativeInteger(
      parsePsqlSingleRow(
        scalarQuery(`
          begin transaction read only;
          select sum(row_count)::text
          from (
            select count(*) row_count from public.lexia_testes_sessoes
            union all select count(*) from public.lexia_testes_execucoes
            union all select count(*) from public.lexia_feedbacks
            union all select count(*) from public.lexia_handoffs
            union all select count(*) from public.lexia_contactos
            union all select count(*) from public.lexia_mensagens
          ) counts;
          commit;
        `),
        "Runtime product data count",
      ),
      "Runtime product data count",
    );

    if (runtimeDataCount !== 0) {
      throw new Error(
        "Preflight stopped: the runtime harness contains existing product data.",
      );
    }
  }

  console.log(
    `Runtime harness preflight passed for ${isolatedTarget.testProjectRef}.`,
  );
  console.log("Existing Auth users: 0; existing product rows: 0.");
  console.log("Public schema inventory matches the expected disposable state.");

  const verifyPath = resolve(
    "supabase/isolated/202610040002_lote1_runtime_next_verify.sql",
  );

  if (!harnessExists) {
    const schemaPath = resolve(
      "supabase/isolated/202610040001_lote1_runtime_next_schema.sql",
    );
    psql(["--file", schemaPath]);
    console.log("Disposable Next.js runtime schema applied.");
  } else {
    console.log("Disposable Next.js runtime schema was already installed.");
  }

  psql(["--file", verifyPath]);
  console.log("Disposable Next.js runtime schema verification passed.");
} catch (error) {
  console.error(
    error instanceof Error ? redact(error.message) : "Runtime harness failed.",
  );
  process.exit(1);
}
