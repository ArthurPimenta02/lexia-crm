import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  assertSanitizedWorkflowPackage,
  buildGatewayWorkflow,
  buildLabRuntimeWorkflows,
  gatewaySpec,
  hydrateRemoteWorkflow,
  workflowSpecs,
} from "./lib/miranda-v2-lab-runtime.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value || value.startsWith("--")) throw new Error(`missing_argument:${name}`);
  return resolve(value);
}

function loadSingleExport(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(`expected_single_workflow_export:${path}`);
  }
  return value[0];
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

const outputDirectory = requiredArgument("--output");
const exportDirectoryValue = argument("--export-dir");
const templates = buildLabRuntimeWorkflows();
assertSanitizedWorkflowPackage("versioned_lab_runtime", templates);
mkdirSync(outputDirectory, { recursive: true });

if (!exportDirectoryValue) {
  for (const [key, spec] of Object.entries(workflowSpecs)) {
    writeJson(join(outputDirectory, spec.file), templates[key]);
  }
  process.stdout.write(`Prepared six versioned lab runtime workflows in ${outputDirectory}\n`);
  process.exit(0);
}

const exportDirectory = resolve(exportDirectoryValue);
const deployment = {};
for (const [key, spec] of Object.entries(workflowSpecs)) {
  const exported = loadSingleExport(join(exportDirectory, `${spec.id}.json`));
  deployment[key] = hydrateRemoteWorkflow(templates[key], exported);
}
assertSanitizedWorkflowPackage("remote_lab_runtime", deployment);

const gatewayExport = loadSingleExport(join(exportDirectory, `${gatewaySpec.id}.json`));
const gateway = buildGatewayWorkflow(gatewayExport);
assertSanitizedWorkflowPackage("remote_lab_gateway", [gateway], { allowGateway: true });

for (const [key, spec] of Object.entries(workflowSpecs)) {
  writeJson(join(outputDirectory, spec.deployFile), [deployment[key]]);
}
writeJson(join(outputDirectory, gatewaySpec.deployFile), [gateway]);

writeJson(join(outputDirectory, "DEPLOYMENT_MANIFEST.json"), {
  schema_version: "lexia.n8n.lab-deployment.v2",
  generated_from: "versioned_synthetic_runtime",
  environment: "isolated_test",
  workflows: [
    ...Object.values(workflowSpecs).map((spec) => ({ id: spec.id, name: spec.name, file: spec.deployFile })),
    { id: gatewaySpec.id, name: gatewaySpec.name, file: gatewaySpec.deployFile },
  ],
  guarantees: {
    credentials_in_six_subworkflows: false,
    external_urls: false,
    external_effects: false,
    provider_send_attempted: false,
    gateway_header_auth_preserved_from_remote_export: true,
  },
});

process.stdout.write(`Prepared seven sanitized deployment files in ${outputDirectory}\n`);
