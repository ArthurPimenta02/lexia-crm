import {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPrivateCredentialImport,
  buildStagingWorkflows,
  stagingCredentialSpecs,
  stagingWorkflowSpecs,
} from "./lib/miranda-v2-staging-deployment.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const candidateDirectory = join(repositoryRoot, "n8n", "miranda-v2-candidate");

const candidateFiles = {
  entry: "01-entrada-omnichannel-v2.inactive.json",
  service: "02-atendimento-ia-v2.inactive.json",
  agenda: "03-agenda-v2.inactive.json",
  automation: "04-followups-lembretes-v2.inactive.json",
  crm: "05-integracao-crm-v2.inactive.json",
  delivery: "06-saida-segura-v2.inactive.json",
};

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value || value.startsWith("--")) throw new Error(`missing_argument:${name}`);
  return resolve(value);
}

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    env[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return env;
}

function writePrivateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

const outputDirectory = requiredArgument("--output");
const envPath = resolve(argument("--env") || join(repositoryRoot, ".env.lote2.test.local"));
if (isInside(repositoryRoot, outputDirectory)) {
  throw new Error("private_staging_output_must_be_outside_repository");
}

const env = loadEnv(envPath);
if (env.LEXIA_LOTE2_ENVIRONMENT !== "isolated_test") {
  throw new Error("staging_environment_must_be_isolated_test");
}
if (!env.LEXIA_LOTE2_SUPABASE_CONFIRM?.includes(env.LEXIA_LOTE2_SUPABASE_PROJECT_REF)) {
  throw new Error("staging_supabase_identity_confirmation_missing");
}
if (!env.LEXIA_LOTE2_REDIS_CONFIRM?.includes(env.LEXIA_LOTE2_REDIS_EXPECTED_HOST)) {
  throw new Error("staging_redis_identity_confirmation_missing");
}

const candidates = Object.fromEntries(
  Object.entries(candidateFiles).map(([key, file]) => [
    key,
    JSON.parse(readFileSync(join(candidateDirectory, file), "utf8")),
  ]),
);
const syntheticAccount = "24000000-0000-4000-8000-000000000001";
const config = {
  centralSupabaseUrl: env.LEXIA_LOTE2_SUPABASE_URL,
  frappeInternalUrl: "http://lexia-frappe-hml-backend-1:8000",
  frappeSiteName: env.LEXIA_LOTE2_FRAPPE_EXPECTED_SITE,
  mediaAllowedHosts: "media-disabled.invalid",
  providerDisabledUrl: "https://provider-disabled.invalid",
  whatsappAccountId: env.LEXIA_LOTE2_MIRANDA_ZAPI_ACCOUNT_ID || syntheticAccount,
  instagramAccountId: env.LEXIA_LOTE2_MIRANDA_INSTAGRAM_ACCOUNT_ID || syntheticAccount,
  messengerAccountId: env.LEXIA_LOTE2_MIRANDA_MESSENGER_ACCOUNT_ID || syntheticAccount,
  calendarId: "primary",
  locationLabel: "Miranda staging",
  timezone: "America/New_York",
  deliveryMode: "observe_only",
};

const workflows = buildStagingWorkflows(candidates, config);
const credentials = buildPrivateCredentialImport(env);
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
chmodSync(outputDirectory, 0o700);

for (const [key, workflow] of Object.entries(workflows)) {
  writePrivateJson(join(outputDirectory, stagingWorkflowSpecs[key].file), [workflow]);
}
writePrivateJson(join(outputDirectory, "workflows.private.json"), Object.values(workflows));
writePrivateJson(join(outputDirectory, "credentials.private.json"), credentials);
writePrivateJson(join(outputDirectory, "DEPLOYMENT_MANIFEST.json"), {
  schema_version: "lexia.miranda.hml.deployment.v1",
  environment: "isolated_test",
  source: "six_full_miranda_candidates",
  delivery_mode: "observe_only",
  workflows: Object.values(stagingWorkflowSpecs).map(({ id, name, file }) => ({
    id,
    name,
    file,
  })),
  credentials: Object.values(stagingCredentialSpecs)
    .filter((spec) => !["MIRANDA SKIN EXPERT", "Open AI Amynda", "gEMINI pRO", "Chave API - Miranda Skin", "Calendar Testes Arthur", "Lexia CRM Agent Test Header Auth"].includes(spec.name))
    .map(({ id, name, type }) => ({ id, name, type })),
  guards: {
    provider_webhooks_disabled: true,
    schedules_disabled: true,
    provider_destinations_invalid: true,
    delivery_mode_observe_only: true,
    agent_test_webhook_enabled: true,
    crm_command_webhook_enabled: true,
    secrets_only_in_private_credential_file: true,
  },
});

process.stdout.write(
  `Prepared six full isolated staging workflows in ${realpathSync(outputDirectory)}\n`,
);
