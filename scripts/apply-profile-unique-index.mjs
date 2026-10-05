import { spawnSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import {
  assertIsolatedRemoteIdentity,
  assertConnectedDatabaseTarget,
  validateIndexOperationTarget,
} from "./lib/target-identity.mjs";
import {
  resolvePsqlBinary,
  securePsqlEnvironment,
  validateSupabaseRootCertificate,
} from "./lib/psql-client.mjs";
import {
  parsePsqlBoolean,
  parsePsqlDelimitedRow,
  parsePsqlNonNegativeInteger,
  parsePsqlOptionalSingleRow,
  parsePsqlSingleRow,
} from "./lib/psql-output.mjs";

const localEnvironmentFile =
  process.env.LEXIA_LOTE1_ENV_FILE?.trim() || ".env.lote1.test.local";

if (existsSync(localEnvironmentFile)) {
  loadEnvFile(localEnvironmentFile);
}

const environment = process.env.LEXIA_DB_OPERATION_ENVIRONMENT?.trim();
const confirmation = process.env.LEXIA_DB_OPERATION_CONFIRM?.trim();
const databaseUrl = process.env.LEXIA_DB_OPERATION_URL?.trim();
const expectedProjectRef =
  process.env.LEXIA_DB_OPERATION_EXPECTED_PROJECT_REF?.trim();
const productionProjectRef =
  process.env.LEXIA_PRODUCTION_SUPABASE_PROJECT_REF?.trim();
const productionApproval =
  process.env.LEXIA_DB_OPERATION_PRODUCTION_APPROVAL?.trim();
const protectedProjectRefs =
  process.env.LEXIA_PROTECTED_SUPABASE_PROJECT_REFS?.trim();

let target;
try {
  target = validateIndexOperationTarget({
    confirmation,
    databaseUrl,
    environment,
    expectedHostname:
      process.env.LEXIA_DB_OPERATION_EXPECTED_HOST?.trim(),
    expectedProjectRef,
    productionApproval,
    productionProjectRef,
    protectedProjectRefs,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid DB target.");
  process.exit(2);
}

const psqlBinary = resolvePsqlBinary(process.env.LEXIA_PSQL_BIN);
let sslRootCertificate = "";
if (target.connectionMode === "session_pooler") {
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
}

let resolvedAddresses;
try {
  resolvedAddresses = (await lookup(target.hostname, { all: true })).map(
    ({ address }) => address,
  );
} catch {
  console.error("Could not resolve the database operation host.");
  process.exit(2);
}

function psql(args, options = {}) {
  const result = spawnSync(
    psqlBinary,
    [
      "-X",
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      ...args,
    ],
    {
      encoding: "utf8",
      env: securePsqlEnvironment(databaseUrl, sslRootCertificate),
      ...options,
    },
  );

  if (result.error?.code === "ENOENT") {
    throw new Error("psql is required for this operation.");
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "psql command failed.");
  }

  return result.stdout.trim();
}

function scalarQuery(sql) {
  return psql(["--tuples-only", "--no-align", "--command", sql]);
}

const [actualDatabaseName, actualServerAddress] = parsePsqlDelimitedRow(
  scalarQuery(`
    select current_database() || '|' || coalesce(host(inet_server_addr()), '');
  `),
  2,
  "Connected database identity",
);

try {
  assertConnectedDatabaseTarget({
    actualDatabaseName,
    actualServerAddress,
    connectionMode: target.connectionMode,
    expectedDatabaseName: target.databaseName,
    resolvedAddresses,
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Connected DB target mismatch.",
  );
  process.exit(2);
}

if (target.connectionMode === "session_pooler") {
  const [projectRef, remoteEnvironment, disposableValue] =
    parsePsqlDelimitedRow(
      scalarQuery(`
        select project_ref || '|' || environment || '|' || disposable::text
        from public.lexia_environment_identity
        where id = true;
      `),
      3,
      "Disposable database identity",
    );

  try {
    assertIsolatedRemoteIdentity(
      {
        disposable: parsePsqlBoolean(
          disposableValue,
          "Disposable database identity flag",
        ),
        environment: remoteEnvironment,
        project_ref: projectRef,
      },
      target.projectRef,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Remote disposable identity mismatch.",
    );
    process.exit(2);
  }
}

const duplicateCount = parsePsqlNonNegativeInteger(
  parsePsqlSingleRow(
    scalarQuery(`
    select count(*)
    from (
      select user_id
      from public.lexia_usuarios_clientes
      group by user_id
      having count(*) > 1
    ) duplicates;
    `),
    "Duplicate profile count",
  ),
  "Duplicate profile count",
);

if (duplicateCount > 0) {
  throw new Error(
    `Preflight failed: ${duplicateCount} user(s) have multiple associations. ` +
      "No record was changed.",
  );
}

const constraintDefinition = parsePsqlOptionalSingleRow(
  scalarQuery(`
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.lexia_usuarios_clientes'::regclass
      and conname = 'lexia_usuarios_clientes_user_id_key'
      and contype = 'u';
  `),
  "Profile uniqueness constraint lookup",
);

if (constraintDefinition) {
  if (!/^UNIQUE \(user_id\)(?:\s|$)/i.test(constraintDefinition)) {
    throw new Error(
      "The existing profile constraint has an unexpected definition.",
    );
  }

  console.log("Unique user association constraint already exists.");
  process.exit(0);
}

const indexState = parsePsqlOptionalSingleRow(
  scalarQuery(`
    select concat_ws(
      '|',
      indisvalid::text,
      indisready::text,
      indisunique::text,
      pg_get_indexdef(indexrelid)
    )
    from pg_index
    where indexrelid = to_regclass('public.lexia_usuarios_clientes_user_id_key');
  `),
  "Profile uniqueness index lookup",
);

if (indexState) {
  const [validValue, readyValue, uniqueValue, definition] =
    parsePsqlDelimitedRow(
      indexState,
      4,
      "Profile uniqueness index state",
    );
  const valid = parsePsqlBoolean(validValue, "Profile index validity");
  const ready = parsePsqlBoolean(readyValue, "Profile index readiness");
  const unique = parsePsqlBoolean(uniqueValue, "Profile index uniqueness");
  const expectedDefinition =
    /create unique index .* on public\.lexia_usuarios_clientes using btree \(user_id\)\s*$/i;

  if (!valid || !ready) {
    throw new Error(
      "An invalid or unfinished profile index exists. Inspect it, then run the " +
        "explicit DROP INDEX CONCURRENTLY recovery operation before retrying.",
    );
  }

  if (!unique || !expectedDefinition.test(definition)) {
    throw new Error(
      "An index with the expected name exists but has a different definition.",
    );
  }

  console.log("Valid concurrent index already exists; no change required.");
  process.exit(0);
}

const operationPath = resolve(
  "supabase/operations/202610030001_create_profile_unique_index.sql",
);
const operation = readFileSync(operationPath, "utf8");

// A dedicated psql invocation guarantees autocommit and avoids wrapping
// CREATE INDEX CONCURRENTLY in the transaction used by normal migrations.
psql(["--command", operation]);

const verified = parsePsqlBoolean(
  parsePsqlSingleRow(
    scalarQuery(`
      select (indisvalid and indisready and indisunique)::text
      from pg_index
      where indexrelid = to_regclass('public.lexia_usuarios_clientes_user_id_key');
    `),
    "Created profile index verification",
  ),
  "Created profile index verification",
);

if (!verified) {
  throw new Error(
    "The concurrent index command finished without a valid, ready unique index.",
  );
}

console.log(
  `Profile unique index created successfully in ${target.environment}. ` +
    "Apply the transactional Lot 1 migration next.",
);
