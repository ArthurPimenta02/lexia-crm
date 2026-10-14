import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  assertStagingWorkflows,
  buildPrivateCredentialImport,
  buildStagingWorkflows,
  stagingCredentialSpecs,
  stagingWorkflowSpecs,
} from "../scripts/lib/miranda-v2-staging-deployment.mjs";

const root = join(process.cwd(), "n8n", "miranda-v2-candidate");
const files = {
  entry: "01-entrada-omnichannel-v2.inactive.json",
  service: "02-atendimento-ia-v2.inactive.json",
  agenda: "03-agenda-v2.inactive.json",
  automation: "04-followups-lembretes-v2.inactive.json",
  crm: "05-integracao-crm-v2.inactive.json",
  delivery: "06-saida-segura-v2.inactive.json",
} as const;

type WorkflowNode = {
  name: string;
  type: string;
  disabled?: boolean;
  credentials?: Record<string, { id: string; name?: string }>;
  parameters: {
    workflowId?: { value: string; cachedResultName: string };
    headerParameters?: { parameters: Array<{ name: string; value: string }> };
    [key: string]: unknown;
  };
};

type WorkflowDefinition = {
  id: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  settings: { availableInMCP?: boolean; [key: string]: unknown };
};

type WorkflowMap = Record<string, WorkflowDefinition>;

const candidates = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [
    key,
    JSON.parse(readFileSync(join(root, file), "utf8")) as WorkflowDefinition,
  ]),
) as WorkflowMap;
const config = {
  centralSupabaseUrl: "https://synthetic-project.supabase.co",
  frappeInternalUrl: "http://frappe-test-backend:8000",
  frappeSiteName: "crm-test.localhost",
  mediaAllowedHosts: "media-disabled.invalid",
  providerDisabledUrl: "https://provider-disabled.invalid",
  whatsappAccountId: "24000000-0000-4000-8000-000000000001",
  instagramAccountId: "24000000-0000-4000-8000-000000000002",
  messengerAccountId: "24000000-0000-4000-8000-000000000003",
  calendarId: "primary",
  locationLabel: "Miranda staging",
  timezone: "America/New_York",
  deliveryMode: "observe_only",
};

function findNode(workflows: WorkflowMap, name: string) {
  const matches = Object.values(workflows).flatMap((workflow) =>
    workflow.nodes.filter((node) => node.name === name),
  );
  assert.equal(matches.length, 1, `expected one node named ${name}`);
  return matches[0];
}

test("staging hydration preserves all six full candidates and every node", () => {
  const workflows = buildStagingWorkflows(candidates, config) as WorkflowMap;
  assert.equal(Object.keys(workflows).length, 6);
  for (const key of Object.keys(files) as Array<keyof typeof files>) {
    const source = candidates[key];
    assert.equal(workflows[key].nodes.length, source.nodes.length, key);
    assert.equal(workflows[key].id, stagingWorkflowSpecs[key].id, key);
    assert.equal(workflows[key].name, stagingWorkflowSpecs[key].name, key);
    assert.equal(workflows[key].active, false, key);
    assert.equal(workflows[key].settings.availableInMCP, true, key);
  }
  assert.equal(
    Object.values(workflows).reduce(
      (total, workflow) => total + workflow.nodes.length,
      0,
    ),
    312,
  );
});

test("staging fails closed: no env references, real triggers or provider destinations", () => {
  const workflows = buildStagingWorkflows(candidates, config) as WorkflowMap;
  assertStagingWorkflows(workflows, config);
  const json = JSON.stringify(workflows);
  assert.doesNotMatch(json, /\$env\./);
  assert.doesNotMatch(json, /app\.uselexia\.app/);
  assert.match(json, /provider-disabled\.invalid/);
  assert.match(json, /observe_only/);

  assert.equal(findNode(workflows, "CANAIS | Webhook interno Z-API").disabled, true);
  assert.equal(findNode(workflows, "CANAIS | Webhook interno Meta").disabled, true);
  assert.notEqual(
    findNode(workflows, "CANAIS | Webhook de teste da plataforma").disabled,
    true,
  );
  assert.notEqual(
    findNode(workflows, "COMANDOS | Webhook autenticado do Frappe").disabled,
    true,
  );
  for (const workflow of Object.values(workflows)) {
    for (const node of workflow.nodes.filter(
      (candidate) => candidate.type === "n8n-nodes-base.scheduleTrigger",
    )) {
      assert.equal(node.disabled, true, node.name);
    }
  }
});

test("every network, model and native data node has the intended credential", () => {
  const workflows = buildStagingWorkflows(candidates, config) as WorkflowMap;
  for (const workflow of Object.values(workflows)) {
    for (const node of workflow.nodes) {
      if (
        /httpRequest|webhook|redis|supabase|googleCalendar|openAi|googleGemini|lmChat/.test(
          node.type,
        )
      ) {
        assert.ok(node.credentials, `${workflow.name}: ${node.name}`);
      }
    }
  }
  assert.equal(
    findNode(workflows, "FOLLOW-UP | Buscar Histórico Follow-up").credentials
      ?.supabaseApi.id,
    stagingCredentialSpecs.centralNative.id,
  );
  assert.equal(
    findNode(workflows, "CÉREBRO | consultar_servicos").credentials?.supabaseApi.id,
    stagingCredentialSpecs.mirandaPrivateSupabase.id,
  );
  assert.equal(
    findNode(workflows, "INGRESSO | Projetar estado no Redis compartilhado")
      .credentials?.redis.id,
    stagingCredentialSpecs.redis.id,
  );
  const frappe = findNode(workflows, "ESPELHO | Enviar evento autenticado ao Frappe");
  assert.equal(frappe.credentials?.httpHeaderAuth.id, stagingCredentialSpecs.frappe.id);
  assert.deepEqual(
    frappe.parameters.headerParameters?.parameters.find(
      (header) => header.name === "X-Frappe-Site-Name",
    ),
    { name: "X-Frappe-Site-Name", value: config.frappeSiteName },
  );
});

test("all internal calls resolve to the new full staging workflow IDs", () => {
  const workflows = buildStagingWorkflows(candidates, config) as WorkflowMap;
  const ids = new Set(Object.values(stagingWorkflowSpecs).map((spec) => spec.id));
  for (const workflow of Object.values(workflows)) {
    for (const node of workflow.nodes) {
      if (
        node.type === "n8n-nodes-base.executeWorkflow" ||
        node.type === "@n8n/n8n-nodes-langchain.toolWorkflow"
      ) {
        assert.ok(node.parameters.workflowId, node.name);
        assert.ok(ids.has(node.parameters.workflowId.value), node.name);
        assert.match(node.parameters.workflowId.cachedResultName, /^LEXIA HML - MIRANDA/);
      }
    }
  }
});

test("private credential import is isolated and secrets never enter workflow JSON", () => {
  const env = {
    LEXIA_LOTE2_ENVIRONMENT: "isolated_test",
    LEXIA_LOTE2_SUPABASE_URL: "https://synthetic-project.supabase.co",
    LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-secret",
    LEXIA_LOTE2_UPSTASH_REDIS_REST_URL: "https://synthetic-redis.upstash.io",
    LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN: "synthetic-redis-secret",
    LEXIA_LOTE2_FRAPPE_INTEGRATION_API_KEY: "synthetic-frappe-key",
    LEXIA_LOTE2_FRAPPE_INTEGRATION_API_SECRET: "synthetic-frappe-secret",
  };
  const credentials = buildPrivateCredentialImport(env, "synthetic-disabled-secret");
  assert.equal(credentials.length, 5);
  assert.match(JSON.stringify(credentials), /synthetic-service-role-secret/);
  assert.match(JSON.stringify(credentials), /synthetic-redis-secret/);
  assert.match(JSON.stringify(credentials), /synthetic-frappe-secret/);

  const workflows = buildStagingWorkflows(candidates, config) as WorkflowMap;
  const workflowJson = JSON.stringify(workflows);
  assert.doesNotMatch(workflowJson, /synthetic-service-role-secret/);
  assert.doesNotMatch(workflowJson, /synthetic-redis-secret/);
  assert.doesNotMatch(workflowJson, /synthetic-frappe-secret/);
});
