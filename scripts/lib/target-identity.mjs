const projectRefPattern = /^[a-z0-9]{10,40}$/;
const sessionPoolerHostPattern =
  /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/;

function requiredProjectRef(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!projectRefPattern.test(normalized)) {
    throw new Error(`${label} must be an explicit Supabase project ref.`);
  }

  return normalized;
}

function parseUrl(value, label, protocols) {
  let url;

  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new Error(`${label} uses an unsupported protocol.`);
  }

  return url;
}

export function getSupabaseProjectRef(value, label = "Supabase URL") {
  const url = parseUrl(value, label, ["https:"]);
  const match = url.hostname.toLowerCase().match(/^([a-z0-9]+)\.supabase\.co$/);

  if (!match) {
    throw new Error(
      `${label} must use the canonical <project-ref>.supabase.co host.`,
    );
  }

  return requiredProjectRef(match[1], `${label} project ref`);
}

export function getPostgresTarget(value) {
  const url = parseUrl(value, "LEXIA_DB_OPERATION_URL", [
    "postgres:",
    "postgresql:",
  ]);
  const hostname = url.hostname.toLowerCase();
  const directMatch = hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  const username = decodeURIComponent(url.username);
  const sslMode = url.searchParams.get("sslmode")?.trim().toLowerCase();
  let connectionMode;
  let projectRef;

  if (sslMode && sslMode !== "verify-full") {
    throw new Error(
      "LEXIA_DB_OPERATION_URL cannot weaken TLS; omit sslmode or use verify-full.",
    );
  }

  if (directMatch) {
    connectionMode = "direct";
    projectRef = directMatch[1];
  } else if (sessionPoolerHostPattern.test(hostname)) {
    if (url.port !== "5432") {
      throw new Error(
        "Session pooler must use explicit port 5432; Transaction pooler port 6543 is not allowed.",
      );
    }

    const poolerUserMatch = username.match(/^postgres\.([a-z0-9]+)$/);
    if (!poolerUserMatch) {
      throw new Error(
        "Session pooler user must be postgres.<project-ref> as shown by Supabase.",
      );
    }

    if (
      !url.password ||
      decodeURIComponent(url.password) === "[YOUR-PASSWORD]"
    ) {
      throw new Error(
        "Session pooler URL must contain the local database password.",
      );
    }

    connectionMode = "session_pooler";
    projectRef = poolerUserMatch[1];
  } else {
    throw new Error(
      "LEXIA_DB_OPERATION_URL must use the direct Supabase host or the official Session pooler host.",
    );
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new Error("LEXIA_DB_OPERATION_URL must include the database name.");
  }

  if (connectionMode === "session_pooler" && databaseName !== "postgres") {
    throw new Error(
      "Session pooler URL must use the postgres database shown by Supabase.",
    );
  }

  return {
    connectionMode,
    databaseName,
    hostname,
    port: url.port || "5432",
    projectRef: requiredProjectRef(projectRef, "Database project ref"),
    username,
  };
}

export function getJwtProjectRef(value) {
  const token = String(value ?? "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return typeof payload.ref === "string"
      ? payload.ref.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function parseProtectedProjectRefs(value) {
  const refs = String(value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  for (const ref of refs) {
    requiredProjectRef(ref, "Protected Supabase project ref");
  }

  return new Set(refs);
}

export function validateIsolatedTestTarget(input) {
  const testProjectRef = requiredProjectRef(
    input.testProjectRef,
    "LEXIA_TEST_SUPABASE_PROJECT_REF",
  );
  const productionProjectRef = requiredProjectRef(
    input.productionProjectRef,
    "LEXIA_PRODUCTION_SUPABASE_PROJECT_REF",
  );
  const urlProjectRef = getSupabaseProjectRef(
    input.testUrl,
    "LEXIA_TEST_SUPABASE_URL",
  );
  const expectedConfirmation =
    `I_UNDERSTAND_THIS_IS_DISPOSABLE:${testProjectRef}`;

  if (input.confirmation !== expectedConfirmation) {
    throw new Error(
      `LEXIA_TEST_CONFIRM_ISOLATED must equal ${expectedConfirmation}.`,
    );
  }

  if (urlProjectRef !== testProjectRef) {
    throw new Error(
      "The isolated URL does not match LEXIA_TEST_SUPABASE_PROJECT_REF.",
    );
  }

  const protectedRefs = parseProtectedProjectRefs(input.protectedProjectRefs);
  protectedRefs.add(productionProjectRef);

  if (protectedRefs.has(testProjectRef)) {
    throw new Error("Refused: the isolated test project is protected.");
  }

  for (const [label, key] of [
    ["LEXIA_TEST_SUPABASE_ANON_KEY", input.anonKey],
    ["LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY", input.serviceRoleKey],
  ]) {
    if (!String(key ?? "").trim()) {
      throw new Error(`${label} is required for the isolated test target.`);
    }
  }

  if (input.applicationUrl) {
    const applicationProjectRef = getSupabaseProjectRef(
      input.applicationUrl,
      "NEXT_PUBLIC_SUPABASE_URL",
    );
    if (applicationProjectRef === testProjectRef) {
      throw new Error(
        "Refused: the isolated test project matches the current application project.",
      );
    }
  }

  for (const [label, key] of [
    ["LEXIA_TEST_SUPABASE_ANON_KEY", input.anonKey],
    ["LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY", input.serviceRoleKey],
  ]) {
    const keyProjectRef = getJwtProjectRef(key);
    if (keyProjectRef && keyProjectRef !== testProjectRef) {
      throw new Error(`${label} belongs to a different Supabase project.`);
    }
  }

  return { productionProjectRef, testProjectRef };
}

export function assertIsolatedRemoteIdentity(identity, expectedProjectRef) {
  const projectRef = requiredProjectRef(
    expectedProjectRef,
    "Expected isolated project ref",
  );

  if (
    !identity ||
    identity.project_ref !== projectRef ||
    identity.environment !== "isolated_test" ||
    identity.disposable !== true
  ) {
    throw new Error(
      "The remote disposable identity marker is missing or mismatched.",
    );
  }
}

export function validateIndexOperationTarget(input) {
  const environment = String(input.environment ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(environment)) {
    throw new Error("LEXIA_DB_OPERATION_ENVIRONMENT is invalid.");
  }

  const expectedProjectRef = requiredProjectRef(
    input.expectedProjectRef,
    "LEXIA_DB_OPERATION_EXPECTED_PROJECT_REF",
  );
  const productionProjectRef = requiredProjectRef(
    input.productionProjectRef,
    "LEXIA_PRODUCTION_SUPABASE_PROJECT_REF",
  );
  const target = getPostgresTarget(input.databaseUrl);
  const expectedConfirmation =
    `CREATE_PROFILE_UNIQUE_INDEX:${environment}:${expectedProjectRef}`;

  if (input.confirmation !== expectedConfirmation) {
    throw new Error(
      `LEXIA_DB_OPERATION_CONFIRM must equal ${expectedConfirmation}.`,
    );
  }

  if (target.projectRef !== expectedProjectRef) {
    throw new Error(
      "The database URL does not match LEXIA_DB_OPERATION_EXPECTED_PROJECT_REF.",
    );
  }

  if (
    target.connectionMode === "session_pooler" &&
    environment !== "isolated_test"
  ) {
    throw new Error(
      "Session pooler is allowed only for the isolated_test operation target.",
    );
  }

  if (target.connectionMode === "session_pooler") {
    const expectedHostname = String(input.expectedHostname ?? "")
      .trim()
      .toLowerCase();
    if (!expectedHostname || target.hostname !== expectedHostname) {
      throw new Error(
        "Session pooler host does not match LEXIA_DB_OPERATION_EXPECTED_HOST.",
      );
    }
  }

  const protectedRefs = parseProtectedProjectRefs(input.protectedProjectRefs);
  protectedRefs.add(productionProjectRef);
  const isProduction = target.projectRef === productionProjectRef;

  if (isProduction) {
    const expectedApproval =
      `I_APPROVE_PRODUCTION_PROFILE_INDEX:${productionProjectRef}`;
    if (
      environment !== "production" ||
      input.productionApproval !== expectedApproval
    ) {
      throw new Error(
        "Production is protected. Its project-bound approval is missing.",
      );
    }
  } else {
    if (environment === "production") {
      throw new Error(
        "The production label cannot target a non-production project ref.",
      );
    }
    if (protectedRefs.has(target.projectRef)) {
      throw new Error("The database operation target is protected.");
    }
  }

  return { ...target, environment, isProduction };
}

function normalizedAddress(value) {
  return String(value ?? "").trim().replace(/^::ffff:/, "").toLowerCase();
}

export function assertConnectedDatabaseTarget(input) {
  const expectedDatabaseName = String(input.expectedDatabaseName ?? "");
  const actualDatabaseName = String(input.actualDatabaseName ?? "");
  if (!expectedDatabaseName || actualDatabaseName !== expectedDatabaseName) {
    throw new Error("Connected database name does not match the operation URL.");
  }

  if (input.connectionMode === "session_pooler") {
    return;
  }

  if (input.connectionMode !== "direct") {
    throw new Error("Connected database mode is not recognized.");
  }

  const actualAddress = normalizedAddress(input.actualServerAddress);
  const resolvedAddresses = new Set(
    (input.resolvedAddresses ?? []).map(normalizedAddress).filter(Boolean),
  );

  if (!actualAddress || !resolvedAddresses.has(actualAddress)) {
    throw new Error(
      "Connected server address does not match the operation URL DNS target.",
    );
  }
}
