import {
  getJwtProjectRef,
  getPostgresTarget,
  getSupabaseProjectRef,
  parseProtectedProjectRefs,
} from "./target-identity.mjs";

const projectRefPattern = /^[a-z0-9]{10,40}$/;
const upstashHostPattern = /^[a-z0-9-]+\.upstash\.io$/;

function requiredProjectRef(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!projectRefPattern.test(normalized)) {
    throw new Error(`${label} must be an explicit Supabase project ref.`);
  }
  return normalized;
}

export function parseStrictBoolean(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${label} must be exactly true or false.`);
}

export function getUpstashRestTarget(value, label = "Upstash REST URL") {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }
  if (!upstashHostPattern.test(url.hostname.toLowerCase())) {
    throw new Error(`${label} must use an official *.upstash.io host.`);
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(`${label} must contain only the HTTPS endpoint host.`);
  }

  return {
    host: url.hostname.toLowerCase(),
    url: `https://${url.hostname.toLowerCase()}`,
  };
}

function parseProtectedRedisHosts(value) {
  const hosts = new Set();
  for (const entry of String(value ?? "").split(",")) {
    const normalized = entry.trim();
    if (!normalized) continue;
    hosts.add(getUpstashRestTarget(normalized, "Protected Redis URL").host);
  }
  return hosts;
}

export function validateLote2SupabaseTarget(input) {
  const environment = String(input.environment ?? "").trim().toLowerCase();
  if (environment !== "isolated_test") {
    throw new Error("Lot 2 database target must be isolated_test.");
  }

  const projectRef = requiredProjectRef(
    input.projectRef,
    "LEXIA_LOTE2_SUPABASE_PROJECT_REF",
  );
  const productionProjectRef = requiredProjectRef(
    input.productionProjectRef,
    "LEXIA_PRODUCTION_SUPABASE_PROJECT_REF",
  );
  const apiProjectRef = getSupabaseProjectRef(
    input.supabaseUrl,
    "LEXIA_LOTE2_SUPABASE_URL",
  );
  const database = getPostgresTarget(input.databaseUrl);
  const expectedConfirmation =
    `I_UNDERSTAND_THIS_IS_DISPOSABLE_LOTE2:${projectRef}`;

  if (input.confirmation !== expectedConfirmation) {
    throw new Error(
      `LEXIA_LOTE2_SUPABASE_CONFIRM must equal ${expectedConfirmation}.`,
    );
  }
  if (apiProjectRef !== projectRef || database.projectRef !== projectRef) {
    throw new Error("Supabase API and database targets must match the Lot 2 project ref.");
  }
  if (database.connectionMode !== "session_pooler") {
    throw new Error("Lot 2 isolated database access requires Session pooler.");
  }

  const expectedHost = String(input.expectedDatabaseHost ?? "")
    .trim()
    .toLowerCase();
  if (!expectedHost || database.hostname !== expectedHost) {
    throw new Error("Session pooler host does not match LEXIA_LOTE2_DB_EXPECTED_HOST.");
  }

  const protectedRefs = parseProtectedProjectRefs(input.protectedProjectRefs);
  protectedRefs.add(productionProjectRef);
  if (protectedRefs.has(projectRef)) {
    throw new Error("Refused: the Lot 2 isolated Supabase project is protected.");
  }

  if (input.applicationUrl) {
    const applicationProjectRef = getSupabaseProjectRef(
      input.applicationUrl,
      "NEXT_PUBLIC_SUPABASE_URL",
    );
    if (applicationProjectRef === projectRef) {
      throw new Error(
        "Refused: the isolated target matches the current application project.",
      );
    }
  }

  const keys = [
    ["LEXIA_LOTE2_SUPABASE_ANON_KEY", input.anonKey],
    ["LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY", input.serviceRoleKey],
  ];
  for (const [label, key] of keys) {
    if (!String(key ?? "").trim()) {
      throw new Error(`${label} is required.`);
    }
    const keyProjectRef = getJwtProjectRef(key);
    if (keyProjectRef && keyProjectRef !== projectRef) {
      throw new Error(`${label} belongs to a different Supabase project.`);
    }
  }
  if (String(input.anonKey).trim() === String(input.serviceRoleKey).trim()) {
    throw new Error("Supabase anon and service role credentials must be different.");
  }

  return {
    database,
    environment,
    productionProjectRef,
    projectRef,
    supabaseUrl: `https://${projectRef}.supabase.co`,
  };
}

export function validateLote2DatabaseWriteApproval(value, projectRef) {
  const normalizedRef = requiredProjectRef(projectRef, "Lot 2 project ref");
  const expected = `APPLY_LOTE2_ISOLATED:${normalizedRef}`;
  if (value !== expected) {
    throw new Error(`LEXIA_LOTE2_APPLY_CONFIRM must equal ${expected}.`);
  }
  return true;
}

export function validateLote2RuntimeApproval(
  value,
  projectRef,
  redisHost,
) {
  const normalizedRef = requiredProjectRef(projectRef, "Lot 2 project ref");
  const normalizedHost = String(redisHost ?? "").trim().toLowerCase();
  if (!upstashHostPattern.test(normalizedHost)) {
    throw new Error("Lot 2 runtime Redis host is invalid.");
  }
  const expected = `RUN_LOTE2_ISOLATED:${normalizedRef}:${normalizedHost}`;
  if (value !== expected) {
    throw new Error(`LEXIA_LOTE2_RUNTIME_CONFIRM must equal ${expected}.`);
  }
  return true;
}

export function validateLote2FrappeTarget(input) {
  const environment = String(input.environment ?? "").trim().toLowerCase();
  if (environment !== "isolated_test") {
    throw new Error("Lot 2 Frappe target must be isolated_test.");
  }
  const projectRef = requiredProjectRef(input.projectRef, "Lot 2 project ref");
  const expectedSite = String(input.expectedSite ?? "").trim().toLowerCase();
  let url;
  try {
    url = new URL(String(input.url ?? "").trim());
  } catch {
    throw new Error("LEXIA_LOTE2_FRAPPE_URL is not a valid URL.");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname.toLowerCase() !== expectedSite ||
    !expectedSite.endsWith(".localhost") ||
    url.port !== "18080" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("Frappe lab must use the exact loopback-only site on port 18080.");
  }
  for (const [label, value] of [
    ["integration API key", input.integrationApiKey],
    ["integration API secret", input.integrationApiSecret],
    ["operator API key", input.operatorApiKey],
    ["operator API secret", input.operatorApiSecret],
  ]) {
    if (String(value ?? "").trim().length < 12) {
      throw new Error(`Frappe ${label} is required.`);
    }
  }
  if (
    input.integrationApiKey === input.operatorApiKey ||
    input.integrationApiSecret === input.operatorApiSecret
  ) {
    throw new Error("Frappe integration and operator credentials must be distinct.");
  }

  const expectedConfirmation =
    `RUN_LOTE2_FRAPPE_ISOLATED:${projectRef}:${expectedSite}:18080`;
  if (input.confirmation !== expectedConfirmation) {
    throw new Error(`LEXIA_LOTE2_FRAPPE_CONFIRM must equal ${expectedConfirmation}.`);
  }
  return {
    environment,
    expectedSite,
    projectRef,
    url: `http://${expectedSite}:18080`,
  };
}

export function validateLote2RedisTarget(input) {
  const environment = String(input.environment ?? "").trim().toLowerCase();
  if (environment !== "isolated_test") {
    throw new Error("Lot 2 Redis target must be isolated_test.");
  }

  const target = getUpstashRestTarget(
    input.redisUrl,
    "LEXIA_LOTE2_UPSTASH_REDIS_REST_URL",
  );
  const expectedHost = String(input.expectedHost ?? "").trim().toLowerCase();
  if (!expectedHost || expectedHost !== target.host) {
    throw new Error("Redis host does not match LEXIA_LOTE2_REDIS_EXPECTED_HOST.");
  }

  const expectedConfirmation =
    `I_UNDERSTAND_THIS_IS_DISPOSABLE_REDIS:${target.host}`;
  if (input.confirmation !== expectedConfirmation) {
    throw new Error(
      `LEXIA_LOTE2_REDIS_CONFIRM must equal ${expectedConfirmation}.`,
    );
  }
  if (!String(input.token ?? "").trim()) {
    throw new Error("LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN is required.");
  }

  const protectedHosts = parseProtectedRedisHosts(input.protectedRedisUrls);
  for (const [label, value] of [
    ["Production Redis URL", input.productionRedisUrl],
    ["Legacy Miranda Redis URL", input.legacyMirandaRedisUrl],
  ]) {
    if (!String(value ?? "").trim()) continue;
    protectedHosts.add(getUpstashRestTarget(value, label).host);
  }
  if (protectedHosts.has(target.host)) {
    throw new Error("Refused: the Lot 2 isolated Redis target is protected or already in use.");
  }

  return {
    ...target,
    environment,
    requireEmpty: parseStrictBoolean(
      input.requireEmpty,
      "LEXIA_LOTE2_REDIS_REQUIRE_EMPTY",
    ),
  };
}
