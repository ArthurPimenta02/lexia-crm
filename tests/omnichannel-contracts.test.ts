import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import test from "node:test";

import {
  OMNICHANNEL_CONTRACT_STATUS,
  type AutomationRequest,
  type BrainRequest,
  type BrainResult,
  type ContextResult,
  type OmnichannelScope,
  isOmnichannelContractVersion,
} from "../lib/omnichannel/contracts";
import { omnichannelCapabilityMatrix } from "../lib/omnichannel/capabilities";
import { buildBrainRequest, validateBrainResult } from "../lib/omnichannel/brain-boundary";
import { validateAutomationRequest } from "../lib/omnichannel/automation";

const contractDir = join(process.cwd(), "contracts", "omnichannel", "v1");
const schemaNames = [
  "ingress-event.schema.json",
  "state-command.schema.json",
  "context-agent-config.schema.json",
  "context-result.schema.json",
  "domain-event.schema.json",
  "brain-request.schema.json",
  "brain-result.schema.json",
  "automation-request.schema.json",
  "outbound-action.schema.json",
  "delivery-result.schema.json",
];

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

test("all v1 schemas remain explicitly provisional and closed at the root", () => {
  for (const name of schemaNames) {
    const schema = readJson(join(contractDir, name));
    assert.equal(schema["x-lexia-contract-status"], OMNICHANNEL_CONTRACT_STATUS);
    assert.match(String(schema.$comment), /PROVISIONAL/);
    assert.equal(schema.additionalProperties, false, basename(name));
  }
});

test("synthetic examples cover both tenants without destinations or credentials", () => {
  for (const file of [
    "empresa-sintetica-a-flow.json",
    "empresa-sintetica-b-flow.json",
  ]) {
    const raw = readFileSync(join(contractDir, "examples", file), "utf8");
    const fixture = JSON.parse(raw) as {
      context_config: { schema_version: string; cliente_slug: string };
      ingress_event: { schema_version: string; scope: { cliente_slug: string } };
      brain_request: { schema_version: string };
      brain_result: { schema_version: string };
      automation_request: { schema_version: string };
      delivery_results: Array<{ schema_version: string }>;
    };

    assert.match(fixture.context_config.cliente_slug, /^empresa_sintetica_[ab]$/);
    assert.equal(
      fixture.context_config.cliente_slug,
      fixture.ingress_event.scope.cliente_slug,
    );
    for (const version of [
      fixture.context_config.schema_version,
      fixture.ingress_event.schema_version,
      fixture.brain_request.schema_version,
      fixture.brain_result.schema_version,
      fixture.automation_request.schema_version,
      ...fixture.delivery_results.map((result) => result.schema_version),
    ]) {
      assert.equal(isOmnichannelContractVersion(version), true, version);
    }

    assert.doesNotMatch(raw, /https?:\/\//i);
    assert.doesNotMatch(raw, /(?:password|secret|token|credential)["']?\s*:/i);
    assert.doesNotMatch(raw, /asteric/i);
  }
});

test("the local capability matrix covers the Miranda reference boundaries", () => {
  const ids = new Set(omnichannelCapabilityMatrix.map((capability) => capability.id));

  for (const required of [
    "context_agent",
    "human_audio",
    "authorship",
    "history",
    "inbound_audio",
    "inbound_image",
    "inbound_pdf",
    "inbound_video",
    "meta_events",
    "zapi_events",
    "contact_without_phone",
    "ad_origin",
    "brain_boundary",
    "tools_boundary",
    "reminders",
    "followups",
    "ordered_delivery",
  ]) {
    assert.equal(ids.has(required), true, required);
  }

  assert.equal(
    omnichannelCapabilityMatrix.every((capability) => capability.provisional),
    true,
  );
  assert.doesNotMatch(JSON.stringify(omnichannelCapabilityMatrix), /asteric/i);
});

function collectJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectJsonFiles(path) : path.endsWith(".json") ? [path] : [];
  });
}

test("all n8n harness exports are inactive, simulated and unable to call a service", () => {
  const files = collectJsonFiles(join(process.cwd(), "n8n", "omnichannel"));
  assert.equal(files.length, 18);

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const workflow = JSON.parse(raw) as {
      active?: boolean;
      name?: string;
      nodes?: Array<{ type?: string }>;
    };
    assert.equal(workflow.active, false, basename(file));
    assert.match(workflow.name ?? "", /LOCAL INACTIVE/);
    assert.ok((workflow.nodes?.length ?? 0) > 0);
    assert.equal(
      workflow.nodes?.every((node) =>
        [
          "n8n-nodes-base.manualTrigger",
          "n8n-nodes-base.code",
          "n8n-nodes-base.set",
        ].includes(
          node.type ?? "",
        ),
      ),
      true,
      basename(file),
    );
    assert.doesNotMatch(raw, /https?:\/\//i);
    assert.doesNotMatch(raw, /"credentials"\s*:/i);
    assert.doesNotMatch(raw, /asteric/i);
  }
});

test("the generic n8n Set reads the validated item instead of a tenant literal", () => {
  const path = join(
    process.cwd(),
    "n8n",
    "omnichannel",
    "subworkflows",
    "context-config-fake-v1.inactive.json",
  );
  const workflow = readJson(path) as {
    nodes: Array<{ type: string; parameters: unknown }>;
  };
  const setNodes = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.set");
  assert.equal(setNodes.length, 1);
  const serialized = JSON.stringify(setNodes[0]?.parameters);
  assert.match(serialized, /\$json\.context_config\.prompt_template/);
  assert.doesNotMatch(serialized, /empresa_sintetica_[ab]/);
});

test("inactive context and brain fixtures preserve origin and state correlation", () => {
  const contextFixture = readFileSync(
    join(
      process.cwd(),
      "n8n",
      "omnichannel",
      "subworkflows",
      "context-agent-v1.inactive.json",
    ),
    "utf8",
  );
  assert.match(contextFixture, /context_call_id/);
  assert.match(contextFixture, /source_message_ids/);
  assert.match(contextFixture, /item\.json\.scope/);

  const brainFixture = readFileSync(
    join(
      process.cwd(),
      "n8n",
      "omnichannel",
      "subworkflows",
      "invoke-brain-fake-v1.inactive.json",
    ),
    "utf8",
  );
  assert.match(brainFixture, /captured_state/);
  assert.match(brainFixture, /item\.json\.state/);
  assert.doesNotMatch(`${contextFixture}${brainFixture}`, /empresa_sintetica_[ab]/);
});

test("the inactive master represents every local boundary and ends fail closed", () => {
  const workflow = readJson(
    join(process.cwd(), "n8n", "omnichannel", "master-v1.inactive.json"),
  ) as unknown as {
    active: boolean;
    nodes: Array<{ name: string }>;
  };
  const names = workflow.nodes.map((node) => node.name);
  for (const expected of [
    "Resolve Scope Fake",
    "Ingest Fake",
    "State Command Fake",
    "Project Redis Fake",
    "Media Normalize Fake",
    "Context Config Fake",
    "Buffer Context Fake",
    "Context Agent Fake",
    "Invoke Brain Fake",
    "Apply Brain Result Fake",
    "Delivery Gate Fake",
    "Fail Closed Before Delivery",
  ]) {
    assert.equal(names.includes(expected), true, expected);
  }
  assert.equal(workflow.active, false);
});

test("brain boundary rejects mixed scope and unattested tool events", () => {
  const scope: OmnichannelScope = {
    environment: "isolated_test",
    cliente_slug: "empresa_sintetica_a",
    channel: "whatsapp",
    account_ref: "11111111-1111-4111-8111-111111111111",
    conversation_ref: "brain-boundary-1",
  };
  const context: ContextResult = {
    schema_version: "lexia.context.result.v1",
    scope,
    context_call_id: "aaaaaaaa-0000-4000-8000-000000000079",
    config_version: "context-a-v1",
    source_message_ids: [],
    operational_context: {
      summary: "Synthetic",
      language: "pt-BR",
      intent: "schedule",
      topic: { current: "synthetic", changed: false, resumed_previous: false },
      confidence: 1,
      missing_information: [],
      contact_updates: {},
      scheduling_intent: {},
    },
    company_fields: {},
  };
  const request = buildBrainRequest({
    invocationId: "aaaaaaaa-0000-4000-8000-000000000080",
    correlationId: "aaaaaaaa-0000-4000-8000-000000000081",
    scope,
    state: { state_version: 0, delivery_epoch: 0 },
    messages: [],
    contact: {},
    context,
    contextCallId: context.context_call_id,
    contextConfigVersion: context.config_version,
    policy: {},
    capabilities: ["appointment.confirmed"],
  });
  assert.throws(
    () =>
      buildBrainRequest({
        invocationId: request.invocation_id,
        correlationId: request.correlation_id,
        scope,
        state: request.state,
        messages: [
          {
            schema_version: "lexia.message.v1",
            event_id: "bbbbbbbb-0000-4000-8000-000000000083",
            provider_event_id: "other-tenant-event",
            message_id: "other-tenant-message",
            scope: {
              ...scope,
              cliente_slug: "empresa_sintetica_b",
              account_ref: "22222222-2222-4222-8222-222222222222",
            },
            author: "lead",
            direction: "inbound",
            occurred_at: "2026-10-08T12:00:00.000Z",
          },
        ],
        contact: {},
        context,
        contextCallId: context.context_call_id,
        contextConfigVersion: context.config_version,
        policy: {},
        capabilities: [],
      }),
    /another scope/,
  );
  const result: BrainResult = {
    schema_version: "lexia.brain.result.v1",
    invocation_id: request.invocation_id,
    captured_state: request.state,
    decision: "no_reply",
    actions: [],
    context_patch: {},
    domain_events: [
      {
        schema_version: "lexia.domain.event.v1",
        event_id: "aaaaaaaa-0000-4000-8000-000000000082",
        invocation_id: request.invocation_id,
        idempotency_key: "synthetic-appointment",
        type: "appointment.confirmed",
        occurred_at: "2026-10-08T12:00:00.000Z",
        appointment: {
          appointment_ref: "appointment-1",
          starts_at: "2026-10-09T12:00:00.000Z",
          ends_at: "2026-10-09T13:00:00.000Z",
          timezone: "America/Sao_Paulo",
          tool_invocation_id: "tool-1",
          status: "confirmed",
        },
      },
    ],
    tool_audit: [],
  };

  assert.throws(() => validateBrainResult(request, result), /tool operation/);
  assert.doesNotThrow(() =>
    validateBrainResult(request, {
      ...result,
      tool_audit: [
        {
          tool_name: "fake_calendar",
          invocation_id: "tool-1",
          operation: "appointment.create",
          result: "succeeded",
          appointment_ref: "appointment-1",
        },
      ],
    }),
  );

  for (const tool_audit of [
    [
      {
        tool_name: "fake_calendar",
        invocation_id: "tool-1",
        operation: "availability.check" as const,
        result: "succeeded" as const,
      },
    ],
    [
      {
        tool_name: "fake_calendar",
        invocation_id: "tool-1",
        operation: "appointment.cancel" as const,
        result: "succeeded" as const,
        appointment_ref: "appointment-1",
      },
    ],
    [
      {
        tool_name: "fake_calendar",
        invocation_id: "tool-1",
        operation: "appointment.create" as const,
        result: "succeeded" as const,
        appointment_ref: "appointment-other",
      },
    ],
  ]) {
    assert.throws(
      () => validateBrainResult(request, { ...result, tool_audit }),
      /matching successful tool operation/,
    );
  }

  assert.throws(
    () =>
      validateBrainResult(request, {
        ...result,
        captured_state: { state_version: 1, delivery_epoch: 0 },
      }),
    /captured state/,
  );
});

test("brain boundary rejects divergent captured state on an individual action", () => {
  const fixture = readJson(
    join(
      contractDir,
      "examples",
      "empresa-sintetica-a-flow.json",
    ),
  ) as unknown as {
    brain_request: BrainRequest;
    brain_result: BrainResult;
  };
  const result = structuredClone(fixture.brain_result);
  result.actions[0]!.captured_state.state_version += 1;

  assert.throws(
    () => validateBrainResult(fixture.brain_request, result),
    /Brain action captured state/,
  );
});

test("appointment cancellation rejects an incompatible tool audit", () => {
  const fixture = readJson(
    join(
      contractDir,
      "examples",
      "empresa-sintetica-a-flow.json",
    ),
  ) as unknown as {
    brain_request: BrainRequest;
    brain_result: BrainResult;
  };
  const request = structuredClone(fixture.brain_request);
  request.capabilities = ["appointment.cancelled"];
  const result: BrainResult = {
    ...structuredClone(fixture.brain_result),
    decision: "no_reply",
    actions: [],
    domain_events: [
      {
        schema_version: "lexia.domain.event.v1",
        event_id: "aaaaaaaa-0000-4000-8000-000000000094",
        invocation_id: request.invocation_id,
        idempotency_key: "appointment-a-001-cancelled",
        type: "appointment.cancelled",
        occurred_at: "2026-10-08T12:02:00.000Z",
        appointment: {
          appointment_ref: "appointment-a-001",
          tool_invocation_id: "tool-a-cancel-001",
          status: "cancelled",
        },
      },
    ],
    tool_audit: [
      {
        tool_name: "fake_calendar",
        invocation_id: "tool-a-cancel-001",
        operation: "appointment.create",
        result: "succeeded",
        appointment_ref: "appointment-a-001",
      },
    ],
  };

  assert.throws(
    () => validateBrainResult(request, result),
    /matching successful tool operation/,
  );
});

test("separate automation requests must match scope, kind and source", () => {
  const scope: OmnichannelScope = {
    environment: "isolated_test",
    cliente_slug: "empresa_sintetica_a",
    channel: "whatsapp",
    account_ref: "11111111-1111-4111-8111-111111111111",
    conversation_ref: "automation-boundary-1",
  };
  const request: AutomationRequest = {
    schema_version: "lexia.automation.request.v1",
    request_id: "aaaaaaaa-0000-4000-8000-000000000090",
    kind: "followup",
    scope,
    source_ref: "followup-rule-1",
    due_at: "2026-10-09T12:00:00.000Z",
    proposed_actions: [
      {
        schema_version: "lexia.outbound.action.v1",
        action_id: "aaaaaaaa-0000-4000-8000-000000000091",
        invocation_id: "aaaaaaaa-0000-4000-8000-000000000092",
        scope,
        sequence: 1,
        kind: "followup",
        captured_state: { state_version: 0, delivery_epoch: 0 },
        content: { type: "text", text: "Synthetic follow-up" },
        source_ref: "followup-rule-1",
      },
    ],
  };

  assert.deepEqual(validateAutomationRequest(request), request);
  assert.throws(
    () =>
      validateAutomationRequest({
        ...request,
        proposed_actions: [{ ...request.proposed_actions[0]!, source_ref: "other" }],
      }),
    /source reference/,
  );
});

test("inactive exports encode the policy, confirmation and reprocess rules without services", () => {
  const subworkflow = (name: string) =>
    readJson(join(process.cwd(), "n8n", "omnichannel", "subworkflows", `${name}.inactive.json`)) as unknown as {
      nodes: Array<{ name: string; parameters: { jsCode?: string } }>;
    };
  const code = (name: string) =>
    subworkflow(name).nodes.map((node) => node.parameters.jsCode ?? "").join("\n");

  const gate = code("delivery-gate-v1");
  for (const reason of [
    "state_changed",
    "blocked",
    "appointment_cancelled",
    "appointment_started",
    "appointment_confirmation_already_sent",
    "superseded_by_new_message",
  ]) {
    assert.match(gate, new RegExp(`'${reason}'`), reason);
  }
  const gateNode = subworkflow("delivery-gate-v1").nodes.find((node) => node.parameters.jsCode);
  const gateOutput = new Function("items", gateNode!.parameters.jsCode!)([]) as Array<{
    json: { allowed: boolean; reprocess_batch: boolean; reason: string };
  }>;
  assert.equal(gateOutput[0]?.json.allowed, false);
  assert.equal(gateOutput[0]?.json.reprocess_batch, true);
  assert.equal(gateOutput[0]?.json.reason, "observe_only");

  assert.match(code("apply-brain-result-v1"), /central_company_policy[\s\S]*single_confirmation_only/);
  assert.match(code("buffer-context-v1"), /persisted_before_buffer[\s\S]*atomic_claim/);
  assert.match(code("invoke-brain-fake-v1"), /item\.json\.reprocess/);
  assert.match(code("appointment-policy-v1"), /other_conversations_of_lead_paused: false/);
  assert.doesNotMatch(code("appointment-policy-v1"), /miranda/i);

  const master = readJson(join(process.cwd(), "n8n", "omnichannel", "master-v1.inactive.json")) as unknown as {
    nodes: Array<{ name: string }>;
    connections: Record<string, { main: Array<Array<{ node: string }>> }>;
  };
  assert.ok(master.nodes.some((node) => node.name === "Omnichannel Policy Fake"));
  assert.equal(master.connections["Context Config Fake"]?.main[0]?.[0]?.node, "Omnichannel Policy Fake");
  assert.equal(master.connections["Omnichannel Policy Fake"]?.main[0]?.[0]?.node, "Buffer Context Fake");
});
