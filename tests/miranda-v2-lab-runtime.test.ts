import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

type WorkflowNode = {
  name: string;
  type: string;
  position: [number, number];
  parameters: Record<string, unknown> & {
    jsCode?: string;
    source?: string;
    workflowId?: { value: string };
  };
  credentials?: Record<string, unknown>;
};

type Workflow = {
  id: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
};

type LabResult = Record<string, unknown> & {
  status: string;
  target: string;
  provider_send_attempted: boolean;
  trace: Array<{ step: string }>;
  output: {
    simulation_engine: string;
    context: { source_message_ids: string[] };
    executed_workflows: string[];
    assistant_message: { text: string };
    availability: { status: string };
    delivery: {
      planned_actions: number;
      confirmed_actions: number;
      automatic_retry_allowed: boolean;
    };
  };
};

type AgendaStage = Record<string, unknown> & {
  availability: { proves_appointment_creation: boolean };
  appointment?: {
    status: string;
    ends_at: string;
    cancellation_keeps_pause_until_end: boolean;
  };
};

type AutomationStage = Record<string, unknown> & {
  actions: Array<{ captured_state: { delivery_epoch: number } }>;
};

const root = join(process.cwd(), "n8n", "miranda-v2-lab-runtime");
const files = {
  entry: "01-entrada-omnichannel-lab.inactive.json",
  service: "02-atendimento-ia-lab.inactive.json",
  agenda: "03-agenda-lab.inactive.json",
  automation: "04-followups-lembretes-lab.inactive.json",
  crm: "05-integracao-crm-lab.inactive.json",
  delivery: "06-saida-segura-lab.inactive.json",
} as const;

function load(file: string) {
  return JSON.parse(readFileSync(join(root, file), "utf8")) as Workflow;
}

const workflows = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, load(file)]),
) as Record<keyof typeof files, Workflow>;

function node(current: Workflow, name: string) {
  const found = current.nodes.find((candidate) => candidate.name === name);
  assert.ok(found, `${current.name}: missing node ${name}`);
  return found;
}

function runCode<Result extends Record<string, unknown> = Record<string, unknown>>(
  current: Workflow,
  name: string,
  json: Record<string, unknown>,
  references: Record<string, Record<string, unknown>> = {},
) {
  const source = node(current, name).parameters.jsCode;
  assert.ok(typeof source === "string", `${current.name}: ${name} has no code`);
  const execute = new Function("$input", "$", source) as (
    input: { first: () => { json: Record<string, unknown> } },
    lookup: (name: string) => { first: () => { json: Record<string, unknown> } },
  ) => Array<{ json: Result }>;
  return execute(
    { first: () => ({ json }) },
    (reference: string) => ({
      first: () => {
        const value = references[reference];
        if (!value) throw new Error(`missing_reference:${reference}`);
        return { json: value };
      },
    }),
  );
}

function request(target: string) {
  const runId = "aaaaaaaa-1000-4000-8000-000000000001";
  return {
    schema_version: "lexia.workflow.test.request.v1",
    run_id: runId,
    target,
    delivery_mode: "simulate",
    execution_mode: "safe_simulation",
    tool_policy: { calendar: "disabled" },
    scope: {
      environment: "isolated_test",
      cliente_slug: "empresa_sintetica_a",
      channel: "whatsapp",
      account_ref: "aaaaaaaa-1000-4000-8000-000000000002",
      conversation_ref:
        "test:SYNTH-LEXIA-TEST-CHAT-aaaaaaaa-1000-4000-8000-000000000003",
    },
    input: {
      message_id: `test-message:${runId}`,
      type: "text",
      text: "Mensagem sintética do teste local.",
    },
    expectations: {
      provider_send: false,
      persist_synthetic_events: true,
      return_trace: true,
    },
  };
}

function projectCrm(stage: Record<string, unknown>) {
  return runCode(
    workflows.crm,
    "Validar e espelhar evento sintético",
    stage,
  )[0]!.json;
}

function finishDelivery(stage: Record<string, unknown>) {
  const gated = runCode(
    workflows.delivery,
    "Revalidar permissão antes de cada ação",
    stage,
  )[0]!.json;
  const projected = projectCrm(gated);
  return runCode<LabResult>(
    workflows.delivery,
    "Finalizar resultado protegido",
    projected,
  )[0]!.json;
}

function runService(input: Record<string, unknown>) {
  const context = runCode(
    workflows.service,
    "Buscar configuração e montar contexto isolado",
    input,
  )[0]!.json;
  const brain = runCode(
    workflows.service,
    "Simular cérebro privado sem tools",
    context,
  )[0]!.json;
  return finishDelivery(projectCrm(brain));
}

test("the versioned runtime contains six small inactive internal workflows", () => {
  assert.deepEqual(readdirSync(root).sort(), Object.values(files).sort());
  const ids = new Set(Object.values(workflows).map((current) => current.id));
  assert.equal(ids.size, 6);

  const forbidden = new Set([
    "n8n-nodes-base.httpRequest",
    "n8n-nodes-base.webhook",
    "n8n-nodes-base.scheduleTrigger",
    "n8n-nodes-base.redis",
    "n8n-nodes-base.postgres",
  ]);

  for (const current of Object.values(workflows)) {
    assert.equal(current.active, false, current.name);
    assert.equal(
      current.nodes.filter((item) => item.type === "n8n-nodes-base.executeWorkflowTrigger").length,
      1,
      current.name,
    );
    assert.ok(current.nodes.length >= 3 && current.nodes.length <= 6, current.name);
    const positions = new Set<string>();
    for (const item of current.nodes) {
      assert.ok(!forbidden.has(item.type), `${current.name}: ${item.name}`);
      assert.ok(!item.type.startsWith("@n8n/n8n-nodes-langchain."), item.name);
      assert.equal(item.credentials, undefined, item.name);
      if (item.type !== "n8n-nodes-base.stickyNote") {
        const position = JSON.stringify(item.position);
        assert.ok(!positions.has(position), `${current.name}: overlapping ${item.name}`);
        positions.add(position);
      }
      if (item.type === "n8n-nodes-base.executeWorkflow") {
        assert.equal(item.parameters.source, "database", item.name);
        assert.ok(ids.has(item.parameters.workflowId!.value), item.name);
      }
    }
    const serialized = JSON.stringify(current);
    assert.doesNotMatch(serialized, /\$env\b|https?:\/\//i);
    assert.doesNotMatch(serialized, /service_role|bearer\s+[a-z0-9]/i);
  }
});

test("the six workflows form the intended hierarchy without a parallel send route", () => {
  const calls = (current: Workflow) =>
    current.nodes
      .filter((item) => item.type === "n8n-nodes-base.executeWorkflow")
      .map((item) => item.parameters.workflowId!.value);

  assert.deepEqual(calls(workflows.entry), [workflows.service.id]);
  assert.deepEqual(calls(workflows.service), [workflows.crm.id, workflows.delivery.id]);
  assert.deepEqual(calls(workflows.agenda), [workflows.crm.id]);
  assert.deepEqual(calls(workflows.automation), [workflows.delivery.id]);
  assert.deepEqual(calls(workflows.crm), []);
  assert.deepEqual(calls(workflows.delivery), [workflows.crm.id]);
});

test("the deployable gateway extracts the HTTP body before strict validation", async () => {
  const moduleUrl = pathToFileURL(
    join(process.cwd(), "scripts", "lib", "miranda-v2-lab-runtime.mjs"),
  ).href;
  const runtime = await import(moduleUrl) as {
    buildGatewayWorkflow: (workflow: Record<string, unknown>) => Workflow;
  };
  const gateway = runtime.buildGatewayWorkflow({
    id: "AcZ9xStPyoP4NKIr",
    name: "LEXIA LAB - MIRANDA - GATEWAY TESTE CRM",
    nodes: [{
      id: "synthetic-webhook",
      name: "Receber teste do CRM",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.2,
      position: [0, 0],
      parameters: { authentication: "headerAuth" },
      credentials: { httpHeaderAuth: { id: "synthetic", name: "Synthetic" } },
    }],
    connections: {},
    settings: {},
  });
  const accepted = runCode<{
    route: string;
    request: ReturnType<typeof request>;
  }>(
    gateway,
    "Validar e rotear teste isolado",
    { headers: { authorization: "redacted" }, body: request("omnichannel") },
  );
  assert.equal(accepted[0]!.json.route, "entry");
  assert.deepEqual(accepted[0]!.json.request, request("omnichannel"));
});

test("omnichannel crosses Entry, Service, CRM and Delivery with bound context", () => {
  const body = request("omnichannel");
  const entryStage = runCode(
    workflows.entry,
    "Validar e registrar entrada sintética",
    { request: body },
  )[0]!.json;
  const result = runService(entryStage);
  const accepted = runCode<LabResult>(
    workflows.entry,
    "Validar resultado correlacionado",
    result,
    { "Validar e registrar entrada sintética": entryStage },
  )[0]!.json;

  assert.equal(accepted.status, "completed");
  assert.equal(accepted.provider_send_attempted, false);
  assert.equal(accepted.output.simulation_engine, "n8n_subworkflow_lab_v2");
  assert.deepEqual(accepted.output.context.source_message_ids, [body.input.message_id]);
  assert.deepEqual(accepted.output.executed_workflows, [
    "01_entrada_omnichannel",
    "02_atendimento_ia",
    "05_integracao_crm",
    "06_saida_segura",
  ]);
  assert.equal(accepted.output.delivery.automatic_retry_allowed, false);
  assert.match(accepted.output.assistant_message.text, /laboratório do n8n/);
});

test("direct brain rejects a crossed tenant and otherwise uses the same safe gate", () => {
  const body = request("brain");
  const accepted = runService({ request: body });
  assert.equal(accepted.target, "brain");
  assert.equal(accepted.provider_send_attempted, false);
  assert.deepEqual(accepted.output.executed_workflows, [
    "02_atendimento_ia",
    "05_integracao_crm",
    "06_saida_segura",
  ]);

  const crossed = structuredClone(body);
  crossed.scope.cliente_slug = "empresa_sintetica_b";
  assert.throws(
    () => runCode(
      workflows.service,
      "Buscar configuração e montar contexto isolado",
      { request: crossed },
    ),
    /scope_owner/,
  );
});

test("agenda never treats availability as appointment creation", () => {
  const availability = runCode<AgendaStage>(
    workflows.agenda,
    "Validar operação e simular tool",
    { request: request("check_availability") },
  )[0]!.json;
  assert.equal(availability.availability.proves_appointment_creation, false);
  assert.equal(availability.appointment, undefined);
  const availabilityResult = runCode<LabResult>(
    workflows.agenda,
    "Finalizar resultado de agenda",
    projectCrm(availability),
  )[0]!.json;
  assert.equal(availabilityResult.output.availability.status, "simulated");

  const creation = runCode<AgendaStage>(
    workflows.agenda,
    "Validar operação e simular tool",
    { request: request("create_appointment") },
  )[0]!.json;
  assert.ok(creation.appointment);
  assert.equal(creation.appointment.status, "confirmed");
  assert.match(creation.appointment.ends_at, /-03:00$/);
  assert.equal(creation.appointment.cancellation_keeps_pause_until_end, true);
});

test("follow-ups and reminders pass through Delivery and its per-action revalidation", () => {
  for (const target of ["followup", "reminder"]) {
    const prepared = runCode<AutomationStage>(
      workflows.automation,
      "Validar follow-up ou lembrete",
      { request: request(target) },
    )[0]!.json;
    const result = finishDelivery(prepared);
    assert.equal(result.target, target);
    assert.equal(result.provider_send_attempted, false);
    assert.equal(result.output.delivery.planned_actions, 1);
    assert.equal(result.output.delivery.confirmed_actions, 0);
    assert.equal(result.output.delivery.automatic_retry_allowed, false);
    assert.ok(result.trace.some((item) =>
      item.step === "delivery_permission_revalidated_1"));
  }
});

test("delivery rejects stale captured state before its simulated provider step", () => {
  const prepared = runCode<AutomationStage>(
    workflows.automation,
    "Validar follow-up ou lembrete",
    { request: request("followup") },
  )[0]!.json;
  prepared.actions[0].captured_state.delivery_epoch += 1;
  assert.throws(
    () => runCode(
      workflows.delivery,
      "Revalidar permissão antes de cada ação",
      prepared,
    ),
    /captured_state/,
  );
});
