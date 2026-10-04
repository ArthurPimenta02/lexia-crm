import { spawnSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertConnectedDatabaseTarget,
  validateIndexOperationTarget,
} from "./lib/target-identity.mjs";

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
    expectedProjectRef,
    productionApproval,
    productionProjectRef,
    protectedProjectRefs,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid DB target.");
  process.exit(2);
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
    "psql",
    [
      "-X",
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      ...args,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PAGER: "cat",
        PGDATABASE: databaseUrl,
        PSQL_PAGER: "cat",
      },
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

const [actualDatabaseName, actualServerAddress] = scalarQuery(`
  select current_database() || '|' || coalesce(host(inet_server_addr()), '');
`).split("|");

try {
  assertConnectedDatabaseTarget({
    actualDatabaseName,
    actualServerAddress,
    expectedDatabaseName: target.databaseName,
    resolvedAddresses,
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Connected DB target mismatch.",
  );
  process.exit(2);
}

const duplicateCount = Number(
  scalarQuery(`
    select count(*)
    from (
      select user_id
      from public.lexia_usuarios_clientes
      group by user_id
      having count(*) > 1
    ) duplicates;
  `),
);

if (duplicateCount > 0) {
  throw new Error(
    `Preflight failed: ${duplicateCount} user(s) have multiple associations. ` +
      "No record was changed.",
  );
}

const constraintDefinition = scalarQuery(`
  select pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid = 'public.lexia_usuarios_clientes'::regclass
    and conname = 'lexia_usuarios_clientes_user_id_key'
    and contype = 'u';
`);

if (constraintDefinition) {
  if (!/^UNIQUE \(user_id\)(?:\s|$)/i.test(constraintDefinition)) {
    throw new Error(
      "The existing profile constraint has an unexpected definition.",
    );
  }

  console.log("Unique user association constraint already exists.");
  process.exit(0);
}

const indexState = scalarQuery(`
  select concat_ws('|', indisvalid, indisready, indisunique, pg_get_indexdef(indexrelid))
  from pg_index
  where indexrelid = to_regclass('public.lexia_usuarios_clientes_user_id_key');
`);

if (indexState) {
  const [valid, ready, unique, definition] = indexState.split("|");
  const expectedDefinition =
    /create unique index .* on public\.lexia_usuarios_clientes using btree \(user_id\)\s*$/i;

  if (valid !== "t" || ready !== "t") {
    throw new Error(
      "An invalid or unfinished profile index exists. Inspect it, then run the " +
        "explicit DROP INDEX CONCURRENTLY recovery operation before retrying.",
    );
  }

  if (unique !== "t" || !expectedDefinition.test(definition)) {
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

const verified = scalarQuery(`
  select indisvalid and indisready and indisunique
  from pg_index
  where indexrelid = to_regclass('public.lexia_usuarios_clientes_user_id_key');
`);

if (verified !== "t") {
  throw new Error(
    "The concurrent index command finished without a valid, ready unique index.",
  );
}

console.log(
  `Profile unique index created successfully in ${target.environment}. ` +
    "Apply the transactional Lot 1 migration next.",
);
