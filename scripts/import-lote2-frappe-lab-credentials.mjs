import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const credentialsPath = argument("--credentials");
const envPath = resolve(argument("--env") || ".env.lote2.test.local");
if (!credentialsPath) {
  throw new Error("Usage: --credentials <private-json> [--env <env-file>]");
}

const credentials = JSON.parse(readFileSync(resolve(credentialsPath), "utf8"));
const required = [
  "integration_api_key",
  "integration_api_secret",
  "operator_api_key",
  "operator_api_secret",
];
for (const key of required) {
  if (typeof credentials[key] !== "string" || credentials[key].length < 12) {
    throw new Error(`Private Frappe credential file is missing ${key}.`);
  }
}

const values = new Map([
  ["LEXIA_LOTE2_FRAPPE_URL", "http://crm-hml.localhost:18080"],
  ["LEXIA_LOTE2_FRAPPE_EXPECTED_SITE", "crm-hml.localhost"],
  ["LEXIA_LOTE2_FRAPPE_INTEGRATION_API_KEY", credentials.integration_api_key],
  ["LEXIA_LOTE2_FRAPPE_INTEGRATION_API_SECRET", credentials.integration_api_secret],
  ["LEXIA_LOTE2_FRAPPE_OPERATOR_API_KEY", credentials.operator_api_key],
  ["LEXIA_LOTE2_FRAPPE_OPERATOR_API_SECRET", credentials.operator_api_secret],
]);

const source = readFileSync(envPath, "utf8");
const seen = new Set();
const lines = source.split(/\r?\n/).map((line) => {
  const match = /^([A-Z0-9_]+)=/.exec(line);
  if (!match || !values.has(match[1])) return line;
  seen.add(match[1]);
  return `${match[1]}=${values.get(match[1])}`;
});
for (const [key, value] of values) {
  if (!seen.has(key)) lines.push(`${key}=${value}`);
}

const temporary = `${envPath}.tmp`;
writeFileSync(temporary, `${lines.join("\n").replace(/\n+$/, "")}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
renameSync(temporary, envPath);
chmodSync(envPath, 0o600);
process.stdout.write("Frappe lab credentials imported into the ignored local env file.\n");
