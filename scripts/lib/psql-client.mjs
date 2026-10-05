import { X509Certificate } from "node:crypto";
import { constants, accessSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const supabaseRoot2021Fingerprint =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:" +
  "82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";

export function resolvePsqlBinary(configuredValue = "") {
  const configured = String(configuredValue).trim();
  if (configured) return configured;

  for (const candidate of [
    "/opt/homebrew/opt/libpq/bin/psql",
    "/usr/local/opt/libpq/bin/psql",
  ]) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the next known client location.
    }
  }

  return "psql";
}

export function validateSupabaseRootCertificate(configuredValue) {
  const configured = String(configuredValue ?? "").trim();
  if (!configured) {
    throw new Error(
      "LEXIA_DB_OPERATION_SSL_ROOT_CERT is required for Session pooler.",
    );
  }

  const certificatePath = resolve(configured);
  let certificate;
  try {
    certificate = new X509Certificate(readFileSync(certificatePath));
  } catch {
    throw new Error("The configured Supabase root certificate is unreadable.");
  }

  if (
    certificate.fingerprint256 !== supabaseRoot2021Fingerprint ||
    !certificate.subject.includes("CN=Supabase Root 2021 CA")
  ) {
    throw new Error(
      "The configured certificate is not the expected Supabase Root 2021 CA.",
    );
  }

  return certificatePath;
}

export function securePsqlEnvironment(databaseUrl, rootCertificatePath = "") {
  const url = new URL(databaseUrl);
  const environment = { ...process.env };

  for (const key of [
    "LEXIA_DB_OPERATION_URL",
    "LEXIA_TEST_SUPABASE_ANON_KEY",
    "LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    delete environment[key];
  }

  return {
    ...environment,
    PAGER: "cat",
    PGCONNECT_TIMEOUT: "10",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    PGHOST: url.hostname,
    PGPASSWORD: decodeURIComponent(url.password),
    PGPORT: url.port || "5432",
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: rootCertificatePath || "system",
    PGUSER: decodeURIComponent(url.username),
    PSQL_PAGER: "cat",
  };
}

export function safePsqlFailure(stderr) {
  const message = String(stderr ?? "").toLowerCase();

  if (message.includes("password authentication failed")) {
    return "PostgreSQL authentication failed.";
  }
  if (message.includes("certificate") || message.includes("ssl")) {
    return "The TLS-protected PostgreSQL connection failed.";
  }
  if (message.includes("could not translate host name")) {
    return "The PostgreSQL host could not be resolved.";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "The PostgreSQL connection timed out.";
  }
  if (message.includes("connection refused")) {
    return "The PostgreSQL endpoint refused the connection.";
  }

  return "The PostgreSQL client could not establish the connection.";
}
