import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

type Node = {
  name: string;
  type: string;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name?: string }>;
  retryOnFail?: boolean;
};

type Connection = { node: string; type: string; index: number };

type Workflow = {
  name: string;
  active: boolean;
  nodes: Node[];
  connections: Record<string, Record<string, Connection[][]>>;
};

type Manifest = {
  schema_version: string;
  workflows: Array<{
    file: string;
    name: string;
    nodes: number;
    sha256: string;
    active: false;
  }>;
};

const root = join(process.cwd(), "n8n", "miranda-v2-candidate");
const files = {
  entry: "01-entrada-omnichannel-v2.inactive.json",
  service: "02-atendimento-ia-v2.inactive.json",
  agenda: "03-agenda-v2.inactive.json",
  automations: "04-followups-lembretes-v2.inactive.json",
  crm: "05-integracao-crm-v2.inactive.json",
  delivery: "06-saida-segura-v2.inactive.json",
} as const;
const manifest = JSON.parse(
  readFileSync(join(root, "MANIFEST.json"), "utf8"),
) as Manifest;

function workflow(file: string) {
  return JSON.parse(readFileSync(join(root, file), "utf8")) as Workflow;
}

function resolveName(current: Workflow, name: string) {
  const matches = current.nodes.filter(
    (candidate) => candidate.name === name || candidate.name.endsWith(` | ${name}`),
  );
  assert.equal(matches.length, 1, `${current.name}: expected one ${name}, found ${matches.length}`);
  return matches[0]!.name;
}

function node(current: Workflow, name: string) {
  return current.nodes.find((candidate) => candidate.name === resolveName(current, name))!;
}

function codeOf(current: Workflow, name: string) {
  const value = node(current, name).parameters.jsCode;
  assert.equal(typeof value, "string", `${name} must contain code`);
  return value as string;
}

function targets(current: Workflow, from: string, output?: number) {
  const resolved = resolveName(current, from);
  const byType = current.connections[resolved] ?? {};
  const branches = Object.values(byType);
  return output === undefined
    ? branches.flat(2).map((connection) => connection.node)
    : branches.flatMap((outputs) => outputs[output] ?? []).map((connection) => connection.node);
}

function canReach(current: Workflow, from: string, to: string) {
  const start = resolveName(current, from);
  const destination = resolveName(current, to);
  const queue = [start];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (name === destination) return true;
    if (visited.has(name)) continue;
    visited.add(name);
    queue.push(
      ...Object.values(current.connections[name] ?? {})
        .flat(2)
        .map((connection) => connection.node),
    );
  }
  return false;
}

function reachableNames(current: Workflow, from: string) {
  const queue = [resolveName(current, from)];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (visited.has(name)) continue;
    visited.add(name);
    queue.push(
      ...Object.values(current.connections[name] ?? {})
        .flat(2)
        .map((connection) => connection.node),
    );
  }
  return visited;
}

function serialized(current: Workflow) {
  return JSON.stringify(current);
}

function executeCode(
  source: string,
  body: Record<string, unknown>,
  environment: Record<string, string>,
) {
  return executeNodeCode(source, { body }, environment);
}

function executeNodeCode(
  source: string,
  json: Record<string, unknown>,
  environment: Record<string, string> = {},
  references: Record<string, Record<string, unknown>> = {},
) {
  const run = new Function("$input", "$env", "$", source) as (
    input: {
      all: () => Array<{ json: Record<string, unknown> }>;
      first: () => { json: Record<string, unknown> };
    },
    env: Record<string, string>,
    lookup: (name: string) => {
      all: () => Array<{ json: Record<string, unknown> }>;
      first: () => { json: Record<string, unknown> };
    },
  ) => unknown;
  return run(
    { all: () => [{ json }], first: () => ({ json }) },
    environment,
    (name: string) => {
      const value = references[name];
      if (!value) throw new Error(`Missing test reference: ${name}`);
      return {
        all: () => [{ json: value }],
        first: () => ({ json: value }),
      };
    },
  );
}

function sdkCodeOf(source: string, name: string) {
  const marker = `name: "${name}"`;
  const nodeStart = source.indexOf(marker);
  if (nodeStart === -1) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const call = source.match(new RegExp(`unwrap\\("${escapedName}",\\s*"([^"]+)"`));
    assert.ok(call, `SDK node ${name} must exist`);
    const helperStart = source.indexOf("function unwrap(");
    const codeStart = source.indexOf("jsCode: `", helperStart);
    assert.notEqual(codeStart, -1, `SDK node ${name} must contain code`);
    const valueStart = codeStart + "jsCode: `".length;
    const valueEnd = source.indexOf("`,\n", valueStart);
    assert.notEqual(valueEnd, -1, `SDK node ${name} code must terminate`);
    return source.slice(valueStart, valueEnd).replaceAll("${expectedRoute}", call[1]!);
  }
  const codeStart = source.indexOf("jsCode: `", nodeStart);
  assert.notEqual(codeStart, -1, `SDK node ${name} must contain code`);
  const valueStart = codeStart + "jsCode: `".length;
  const valueEnd = source.indexOf("`,\n", valueStart);
  assert.notEqual(valueEnd, -1, `SDK node ${name} code must terminate`);
  return source.slice(valueStart, valueEnd);
}

function candidateTestRequest() {
  const runId = "aaaaaaaa-0000-4000-8000-000000000991";
  const conversationId = "bbbbbbbb-0000-4000-8000-000000000993";
  return {
    schema_version: "lexia.workflow.test.request.v1",
    run_id: runId,
    target: "omnichannel",
    delivery_mode: "simulate",
    execution_mode: "safe_simulation",
    tool_policy: { calendar: "disabled" },
    scope: {
      environment: "isolated_test",
      cliente_slug: "empresa_sintetica_a",
      channel: "whatsapp",
      account_ref: "aaaaaaaa-0000-4000-8000-000000000992",
      conversation_ref: `test:SYNTH-LEXIA-TEST-CHAT-${conversationId}`,
    },
    input: {
      message_id: `test-message:${runId}`,
      type: "text",
      text: "Mensagem sintética para o corredor candidato.",
    },
    expectations: {
      provider_send: false,
      persist_synthetic_events: true,
      return_trace: true,
    },
  };
}

test("candidate package contains exactly six inactive, hashed and sanitized workflows", () => {
  assert.equal(manifest.schema_version, "lexia.miranda.v2.candidate.manifest.v2");
  assert.equal(manifest.workflows.length, 6);
  assert.deepEqual(
    readdirSync(root).filter((file) => file.endsWith(".inactive.json")).sort(),
    Object.values(files).sort(),
  );
  const report = JSON.parse(
    readFileSync(join(root, "SANITIZATION_REPORT.json"), "utf8"),
  ) as {
    passed: boolean;
    secret_findings: unknown[];
    disallowed_paths: unknown[];
  };
  assert.equal(report.passed, true);
  assert.deepEqual(report.secret_findings, []);
  assert.deepEqual(report.disallowed_paths, []);

  for (const entry of manifest.workflows) {
    const current = workflow(entry.file);
    assert.equal(current.active, false, entry.file);
    assert.equal(entry.active, false, entry.file);
    assert.equal(current.name, entry.name, entry.file);
    assert.equal(current.nodes.length, entry.nodes, entry.file);
    assert.equal(
      createHash("sha256").update(JSON.stringify(current)).digest("hex"),
      entry.sha256,
      entry.file,
    );
    const json = serialized(current);
    assert.doesNotMatch(json, /"credentials"\s*:/i, entry.file);
    assert.doesNotMatch(json, /"webhookId"\s*:/i, entry.file);
    assert.doesNotMatch(json, /https?:\/\//i, entry.file);
  }
});

test("JSON HTTP writes never use raw bodies or expose streaming response internals", () => {
  const allWorkflows = Object.values(files).map(workflow);
  const httpWrites = allWorkflows.flatMap((current) =>
    current.nodes.filter(
      (candidate) =>
        candidate.type === "n8n-nodes-base.httpRequest" &&
        ["POST", "PUT", "PATCH"].includes(String(candidate.parameters.method ?? "GET")),
    ),
  );

  assert.ok(httpWrites.length > 0);
  for (const current of httpWrites) {
    assert.notEqual(current.parameters.contentType, "raw", current.name);
    assert.equal(current.parameters.specifyBody, "json", current.name);
    assert.equal(typeof current.parameters.jsonBody, "string", current.name);
    assert.equal(Object.hasOwn(current.parameters, "body"), false, current.name);
    assert.equal(Object.hasOwn(current.parameters, "rawContentType"), false, current.name);
  }

  for (const current of allWorkflows.flatMap((candidate) => candidate.nodes)) {
    if (typeof current.parameters.jsCode !== "string") continue;
    assert.doesNotMatch(current.parameters.jsCode, /_readableState|ClientRequest|IncomingMessage/);
    assert.doesNotMatch(
      current.parameters.jsCode,
      /const input = String\(input\./,
      current.name,
    );
  }
});

test("RPC responses preserve cardinality and parse scalar or structured bodies", () => {
  const current = workflow(files.entry);
  const rpcNodes = Object.values(files)
    .map(workflow)
    .flatMap((candidate) => candidate.nodes)
    .filter(
      (candidate) =>
        candidate.type === "n8n-nodes-base.httpRequest" &&
        String(candidate.parameters.url).includes("/rest/v1/rpc"),
    );
  assert.ok(rpcNodes.length > 0);
  for (const rpcNode of rpcNodes) {
    const response = (
      rpcNode.parameters.options as {
        response?: { response?: Record<string, unknown> };
      }
    ).response?.response;
    assert.equal(response?.fullResponse, false, rpcNode.name);
    assert.equal(response?.responseFormat, "text", rpcNode.name);
    assert.equal(response?.outputPropertyName, "body", rpcNode.name);
  }

  const conversationId = "f4224a2a-120e-4a2c-9be8-29895b34501f";
  const bound = {
    account: { id: "24000000-0000-4000-8000-000000000001" },
    echo_candidate: false,
    event: {
      event_type: "message",
      message: { author: "lead" },
      occurred_at: "2026-10-10T12:00:00-03:00",
      provider_event_id: "provider-message-1",
    },
  };
  const prepared = executeNodeCode(
    codeOf(current, "Preparar verificação de eco"),
    {},
    {},
    {
      [resolveName(current, "Vincular escopo à integração")]: bound,
      [resolveName(current, "Resolver conversa central")]: { body: conversationId },
    },
  ) as Array<{ json: { conversation_id: string } }>;
  assert.equal(prepared[0]!.json.conversation_id, conversationId);

  const classified = executeNodeCode(
    codeOf(current, "Classificar eco ou intervenção humana"),
    {},
    {},
    {
      [resolveName(current, "Preparar verificação de eco")]: prepared[0]!.json,
      [resolveName(current, "Procurar ação de saída pelo ID do provedor")]: {
        body: "[]",
      },
    },
  ) as Array<{ json: { automatic_echo: boolean } }>;
  assert.equal(classified[0]!.json.automatic_echo, false);
});

test("provider HTTP results keep status codes and never retry blindly", () => {
  const current = workflow(files.delivery);
  for (const name of ["Enviar Z-API", "Enviar Meta"]) {
    const request = node(current, name);
    const response = (
      request.parameters.options as {
        response?: { response?: Record<string, unknown> };
      }
    ).response?.response;
    assert.equal(response?.fullResponse, true, name);
    assert.equal(response?.neverError, true, name);
    assert.equal(request.retryOnFail, false, name);
  }
  assert.match(codeOf(current, "Classificar resultado sem retry cego"), /provider_rejected_/);
  assert.match(codeOf(current, "Classificar resultado sem retry cego"), /delivery_unknown/);
  assert.match(
    codeOf(current, "Tratar exceção como resultado incerto"),
    /automatic_retry_allowed: false/,
  );
});

test("Redis is a scoped projection after the durable central write", () => {
  const entry = workflow(files.entry);
  const service = workflow(files.service);
  const crm = workflow(files.crm);

  for (const [current, durable, prepare, projection, next] of [
    [entry, "Aplicar pausa ou buffer atomicamente", "Preparar projeção Redis do estado", "Projetar estado no Redis compartilhado", "Montar espelho CRM após persistência"],
    [service, "Persistir resumo e fatos versionados", "Preparar projeção Redis do contexto", "Projetar contexto no Redis compartilhado", "Montar Brain Request vinculado"],
    [crm, "Aplicar comando no central", "Preparar projeção Redis do comando", "Projetar comando no Redis compartilhado", "Espelhar comando aceito no CRM"],
  ] as const) {
    assert.equal(node(current, projection).type, "n8n-nodes-base.redis");
    assert.equal(node(current, projection).parameters.operation, "set");
    assert.equal(node(current, projection).parameters.expire, true);
    assert.equal(targets(current, durable, 0)[0], resolveName(current, prepare));
    assert.equal(targets(current, prepare, 0)[0], resolveName(current, projection));
    assert.equal(targets(current, projection, 0)[0], resolveName(current, next));
    assert.match(codeOf(current, prepare), /environment/);
    assert.match(codeOf(current, prepare), /cliente_slug/);
    assert.match(codeOf(current, prepare), /account_ref/);
    assert.match(codeOf(current, prepare), /conversation_id/);
  }
});

test("all six canvases are organized into labeled lanes without overlapping nodes", () => {
  for (const entry of manifest.workflows) {
    const current = workflow(entry.file);
    const functional = current.nodes.filter(
      (candidate) => candidate.type !== "n8n-nodes-base.stickyNote",
    );
    const notes = current.nodes.filter(
      (candidate) => candidate.type === "n8n-nodes-base.stickyNote",
    );
    assert.ok(notes.length >= 3, `${entry.file}: missing visual sections`);
    assert.equal(
      new Set(functional.map((candidate) => candidate.position.join(","))).size,
      functional.length,
      `${entry.file}: duplicate node positions`,
    );
    for (let left = 0; left < functional.length; left++) {
      for (let right = left + 1; right < functional.length; right++) {
        const a = functional[left]!;
        const b = functional[right]!;
        const overlaps =
          Math.abs(a.position[0] - b.position[0]) < 250 &&
          Math.abs(a.position[1] - b.position[1]) < 150;
        assert.equal(overlaps, false, `${entry.file}: ${a.name} overlaps ${b.name}`);
      }
    }
  }
});

test("Code nodes use only globals available in the n8n sandbox", () => {
  for (const entry of manifest.workflows) {
    const current = workflow(entry.file);
    for (const candidate of current.nodes.filter(
      (item) => item.type === "n8n-nodes-base.code",
    )) {
      assert.doesNotMatch(
        String(candidate.parameters.jsCode ?? ""),
        /\bstructuredClone\b/,
        `${entry.file}: ${candidate.name}`,
      );
    }
  }
});

test("every internal node reference and subworkflow target resolves inside the six-workflow package", () => {
  const packageNames = new Set(manifest.workflows.map((entry) => entry.name));
  for (const entry of manifest.workflows) {
    const current = workflow(entry.file);
    const names = new Set(current.nodes.map((candidate) => candidate.name));
    for (const candidate of current.nodes) {
      const parameters = JSON.stringify(candidate.parameters);
      for (const pattern of [
        /\$\('([^']+)'\)/g,
        /\$\("([^"]+)"\)/g,
        /\$node\['([^']+)'\]/g,
        /\$node\["([^"]+)"\]/g,
      ]) {
        for (const match of parameters.matchAll(pattern)) {
          assert.ok(names.has(match[1]!), `${entry.file}: unresolved node ${match[1]}`);
        }
      }
      if (
        candidate.type === "n8n-nodes-base.executeWorkflow" ||
        candidate.type === "@n8n/n8n-nodes-langchain.toolWorkflow"
      ) {
        const target = candidate.parameters.workflowId as Record<string, unknown>;
        assert.ok(packageNames.has(String(target.cachedResultName)), `${entry.file}: unknown target`);
      }
    }
  }
});

test("entry persists and deduplicates every message before state, CRM and expensive work", () => {
  const current = workflow(files.entry);
  assert.equal(
    canReach(current, "Deduplicar evento antes de efeitos", "Persistir mensagem antes de pausa buffer ou mídia"),
    true,
  );
  assert.equal(
    canReach(current, "Persistir mensagem antes de pausa buffer ou mídia", "Aplicar pausa ou buffer atomicamente"),
    true,
  );
  assert.equal(
    canReach(current, "Aplicar pausa ou buffer atomicamente", "Criar Lead Deal timeline no CRM"),
    true,
  );
  assert.match(
    JSON.stringify(node(current, "Persistir mensagem antes de pausa buffer ou mídia").parameters),
    /lexia_omni_record_message/,
  );
  assert.match(
    codeOf(current, "Montar espelho CRM após persistência"),
    /contact\.upserted[\s\S]*conversation\.opened[\s\S]*message\.recorded/,
  );
});

test("human intervention is persisted and blocked before media can reach the brain", () => {
  const current = workflow(files.entry);
  assert.equal(
    targets(current, "Rotear mensagem já persistida", 1)[0],
    resolveName(current, "Validar mídia de mensagem persistida"),
  );
  assert.equal(
    targets(current, "Continuar conforme autoria", 1)[0],
    resolveName(current, "Encerrar intervenção antes da IA"),
  );
  assert.deepEqual(targets(current, "Encerrar intervenção antes da IA"), [
    resolveName(current, "Consolidar resultado da entrada"),
  ]);
  assert.match(codeOf(current, "Preservar mensagem em falha de mídia"), /failed/);
  assert.doesNotMatch(serialized(current), /lexia_omni_end_block|manual_pause\.end/);
});

test("context prompt, memory and history fail closed per company and conversation", () => {
  const current = workflow(files.service);
  const query = JSON.stringify(node(current, "Buscar único prompt da empresa").parameters);
  assert.match(query, /environment=eq/);
  assert.match(query, /cliente_slug=eq/);
  assert.match(query, /status=eq\.active/);
  assert.match(query, /limit=2/);
  const assembled = codeOf(current, "Montar item isolado por empresa");
  const contextVersionQuery = JSON.stringify(
    node(current, "Carregar última versão de contexto").parameters,
  );
  assert.match(contextVersionQuery, /conversation_id=eq/);
  assert.match(contextVersionQuery, /environment=eq/);
  assert.match(contextVersionQuery, /cliente_slug=eq/);
  assert.match(contextVersionQuery, /order=context_version\.desc/);
  assert.match(contextVersionQuery, /limit=1/);
  assert.match(assembled, /inputItems\.length !== 1/);
  assert.match(assembled, /configs\.length !== 1/);
  assert.match(assembled, /context_config_scope_mismatch/);
  assert.match(assembled, /conversation_scope_mismatch/);
  assert.match(assembled, /context_version_scope_mismatch/);
  assert.match(assembled, /context_version: contextVersion/);
  assert.match(assembled, /mixed_company_history/);
  assert.match(assembled, /mixed_company_outbound_history/);
  const validate = codeOf(current, "Validar origem e conteúdo do contexto");
  assert.match(validate, /preparedItems\.length !== 1/);
  assert.match(validate, /context_call_id/);
  assert.match(validate, /source_message_ids/);
  assert.match(
    validate,
    /p_expected_context_version: Number\(prepared\.context_version\)/,
  );
  assert.doesNotMatch(
    validate,
    /p_expected_context_version: Number\(prepared\.state\.state_version\)/,
  );
  const genericSet = JSON.stringify(node(current, "Set genérico do agente de contexto").parameters);
  assert.doesNotMatch(genericSet, /\.first\(\)|staticData/);
  assert.match(genericSet, /prompt_template/);
  const agent = node(current, "Agente de contexto compartilhado");
  assert.equal(agent.parameters.hasOutputParser, false);
  assert.match(String(agent.parameters.text), /company_fields_schema/);
  assert.match(JSON.stringify(agent.parameters), /EXATAMENTE duas chaves irmãs/);
  assert.equal(
    current.nodes.some((candidate) => candidate.name.endsWith("Parser estruturado do contexto por empresa")),
    false,
  );
  assert.match(validate, /allowedRoot = new Set\(\['operational_context','company_fields'\]\)/);
  assert.match(validate, /company_fields_object_required/);
  const contextStore = node(current, "Persistir resumo e fatos versionados");
  assert.equal(
    ((contextStore.parameters.options as { timeout?: number }) || {}).timeout,
    12000,
  );
  assert.equal(contextStore.retryOnFail, false);
});

test("context agent transport envelopes are normalized before strict content validation", () => {
  const current = workflow(files.service);
  const validate = codeOf(current, "Validar origem e conteúdo do contexto");
  const prepared = {
    conversation_id: "aaaaaaaa-0000-4000-8000-000000000070",
    context_version: 2,
    context_call_id: "aaaaaaaa-0000-4000-8000-000000000071",
    mensagem_ids: ["central-message-1"],
    scope: {
      environment: "isolated_test",
      cliente_slug: "empresa_sintetica_a",
      channel: "whatsapp",
      account_ref: "aaaaaaaa-0000-4000-8000-000000000072",
      conversation_ref: "conversation-context-validator",
    },
    context_config: { config_version: "same-version" },
    company_fields_schema: {
      type: "object",
      additionalProperties: false,
      required: ["segmento_a"],
      properties: { segmento_a: { type: "string" } },
    },
    source_messages: [{ message_id: "provider-message-1" }],
    previous_context: null,
  };
  const operational = {
    summary: "Lead quer avaliar manchas.",
    language: "pt-BR",
    intent: "avaliacao",
    topic: { current: "manchas", changed: false, resumed_previous: false },
    confidence: 0.95,
    missing_information: [],
    contact_updates: {},
    scheduling_intent: {},
  };
  const references = {
    [resolveName(current, "Set genérico do agente de contexto")]: prepared,
  };
  const normalized = executeNodeCode(
    validate,
    {
      output: JSON.stringify({
        output: {
          operational_context: {
            ...operational,
            company_fields: { segmento_a: "estetica" },
          },
        },
      }),
    },
    {},
    references,
  ) as Array<{ json: { context_result: { operational_context: Record<string, unknown>; company_fields: Record<string, unknown> } } }>;
  assert.deepEqual(normalized[0]!.json.context_result.operational_context, operational);
  assert.deepEqual(normalized[0]!.json.context_result.company_fields, { segmento_a: "estetica" });

  assert.throws(
    () => executeNodeCode(
      validate,
      {
        output: JSON.stringify({
          operational_context: operational,
          company_fields: { segmento_a: "estetica" },
          foreign_tenant_context: {},
        }),
      },
      {},
      references,
    ),
    /context_result_extra_root_foreign_tenant_context/,
  );
});

test("Miranda brain receives chronological history, current batch and prior memory without reintroducing Carol", () => {
  const current = workflow(files.service);
  const historyQuery = JSON.stringify(node(current, "Carregar mensagens pela conversa").parameters);
  assert.match(historyQuery, /omni_conversation_id=eq/);
  assert.match(historyQuery, /cliente_slug=eq/);
  assert.match(historyQuery, /lead_seq\.lte/);
  assert.match(historyQuery, /limit=30/);
  assert.doesNotMatch(historyQuery, /&id=in\./);
  const outboundHistoryQuery = JSON.stringify(
    node(current, "Carregar saídas confirmadas e virtuais").parameters,
  );
  assert.match(outboundHistoryQuery, /lexia_outbound_actions/);
  assert.match(outboundHistoryQuery, /conversation_id=eq/);
  assert.match(outboundHistoryQuery, /status=in\.\(sent,suppressed\)/);
  assert.match(outboundHistoryQuery, /lead_cutoff_seq\.lt/);

  const scope = {
    environment: "isolated_test",
    cliente_slug: "empresa_sintetica_a",
    channel: "whatsapp",
    account_ref: "aaaaaaaa-0000-4000-8000-000000000010",
    conversation_ref: "conversation-a",
  };
  const input = {
    conversation_id: "aaaaaaaa-0000-4000-8000-000000000011",
    batch_id: "aaaaaaaa-0000-4000-8000-000000000012",
    batch_fencing_token: 7,
    lead_cutoff_seq: 3,
    mensagem_ids: ["message-current"],
    delivery_mode: "observe_only",
    scope,
    event: { event_id: "event-current", correlation_id: "correlation-current", contact: {} },
  };
  const rows = [
    {
      id: "message-current", cliente_slug: scope.cliente_slug, provider_message_id: "provider-current",
      provider_timestamp: "2026-10-10T12:02:00Z", omni_author: "lead", direccao: "recebida",
      tipo: "texto", conteudo: "Gostaria de ser atendido em espanhol", media_kind: "text",
      media_processing_status: "completed", lead_seq: 3,
    },
    {
      id: "message-first", cliente_slug: scope.cliente_slug, provider_message_id: "provider-first",
      provider_timestamp: "2026-10-10T12:00:00Z", omni_author: "lead", direccao: "recebida",
      tipo: "texto", conteudo: "Olá, quero agendar uma avaliação.", media_kind: "text",
      media_processing_status: "completed", lead_seq: 1,
    },
  ];
  const references = {
    [resolveName(current, "Validar lote e escopo")]: input,
    [resolveName(current, "Buscar único prompt da empresa")]: { body: [{
      environment: scope.environment, cliente_slug: scope.cliente_slug, config_version: "shared-v1",
      prompt_template: "Prompt sintético por empresa", common_schema_version: "lexia.context.result.v1",
      company_fields_schema: {}, locale: "pt-BR", timezone: "America/Sao_Paulo", model_policy_ref: "test",
    }] },
    [resolveName(current, "Carregar mensagens pela conversa")]: { body: rows },
    [resolveName(current, "Carregar saídas confirmadas e virtuais")]: { body: [{
      id: "action-ai", conversation_id: input.conversation_id, environment: scope.environment,
      cliente_slug: scope.cliente_slug, invocation_id: "invocation-virtual", sequence: 1, kind: "reply",
      content: { type: "text", text: "Olá, sou a Carol da Miranda Skin Experts." },
      status: "suppressed", reason: "observe_only", provider_message_id: null, mensagem_id: null,
      preparado_em: "2026-10-10T12:01:00Z", concluido_em: "2026-10-10T12:01:01Z", lead_cutoff_seq: 1,
    }, {
      id: "action-ai-question", conversation_id: input.conversation_id, environment: scope.environment,
      cliente_slug: scope.cliente_slug, invocation_id: "invocation-virtual", sequence: 2, kind: "reply",
      content: { type: "text", text: "Há quanto tempo essas manchas apareceram?" },
      status: "suppressed", reason: "plan_interrupted", provider_message_id: null, mensagem_id: null,
      preparado_em: "2026-10-10T12:01:00Z", concluido_em: "2026-10-10T12:01:02Z", lead_cutoff_seq: 1,
    }] },
    [resolveName(current, "Carregar estado e versão atuais")]: { body: [{
      id: input.conversation_id, state_version: 8, delivery_epoch: 4, lead_message_seq: 3,
      environment: scope.environment, cliente_slug: scope.cliente_slug, channel: scope.channel,
      account_id: scope.account_ref, conversation_ref: scope.conversation_ref,
    }] },
    [resolveName(current, "Carregar última versão de contexto")]: { body: [{
      conversation_id: input.conversation_id, environment: scope.environment, cliente_slug: scope.cliente_slug,
      context_version: 5, config_version: "shared-v1", context_call_id: "context-before",
      source_message_ids: ["message-first"], operational_context: { language: "pt-BR", summary: "Quer avaliação." },
      company_fields: { servico_interesse: "avaliação de pele" },
    }] },
  };
  type AssembledContext = Record<string, unknown> & {
    history_messages: Array<Record<string, unknown>>;
    source_messages: Array<Record<string, unknown>>;
    previous_context: { company_fields: { servico_interesse: string } };
  };
  const assembled = executeNodeCode(
    codeOf(current, "Montar item isolado por empresa"),
    {},
    {},
    references,
  ) as Array<{ json: AssembledContext }>;
  assert.deepEqual(
    assembled[0]!.json.history_messages.map((message: Record<string, unknown>) => message.central_message_id),
    ["message-first", "action-ai", "action-ai-question", "message-current"],
  );
  assert.deepEqual(
    assembled[0]!.json.source_messages.map((message: Record<string, unknown>) => message.central_message_id),
    ["message-current"],
  );
  assert.equal(assembled[0]!.json.previous_context.company_fields.servico_interesse, "avaliação de pele");

  const contextInput = {
    ...assembled[0]!.json,
    context_result: {
      operational_context: { language: "es", summary: "Solicitou atendimento em espanhol." },
      company_fields: { servico_interesse: "avaliação de pele" },
    },
  };
  const brainCall = executeNodeCode(
    codeOf(current, "Montar Brain Request vinculado"),
    {},
    {},
    {
      [resolveName(current, "Validar origem e conteúdo do contexto")]: contextInput,
      [resolveName(current, "Persistir resumo e fatos versionados")]: { body: 6 },
    },
  ) as Array<{ json: Record<string, unknown> }>;
  type BrainPayload = {
    mensagem: { actual: string };
    historico: Array<{ direccao: string; [key: string]: unknown }>;
  };
  const brainInput = executeNodeCode(
    codeOf(current, "Validar Brain Request V2"),
    brainCall[0]!.json,
  ) as Array<{ json: { payload: BrainPayload } }>;
  assert.equal(brainInput[0]!.json.payload.mensagem.actual, "Gostaria de ser atendido em espanhol");
  assert.equal(brainInput[0]!.json.payload.historico.length, 4);
  assert.equal(brainInput[0]!.json.payload.historico[1].direccao, "enviada");
  assert.equal(brainInput[0]!.json.payload.historico[2].direccao, "enviada");

  const finalOutput = executeNodeCode(
    codeOf(current, "Montar Saída Final"),
    {
      output: JSON.stringify({
        mensagens: [
          "Hola, ¿todo bien? Soy Carol, de Miranda Skin Experts, y voy a atenderte hoy.",
          "Claro, con gusto te atendemos en español. ¿En qué tratamiento podemos ayudarte? ¿Prefieres que te orientemos?",
        ],
      }),
    },
    {},
    {
      [resolveName(current, "Preparar Briefing")]: {
        briefing: { modulo: "geral", handoff: { necessario: false }, operacoes: {}, contexto_actualizado: {}, fotos: [] },
        historico: brainInput[0]!.json.payload.historico,
        mensagem_actual: "Gostaria de ser atendido em espanhol",
        idioma: "es",
      },
      [resolveName(current, "Preparar Entrada")]: { cliente: { canal: "whatsapp" }, contacto: {} },
    },
  ) as Array<{ json: { output: string } }>;
  const parsed = JSON.parse(finalOutput[0]!.json.output) as { entregas: Array<{ texto: string }> };
  assert.equal(parsed.entregas.length, 1);
  assert.doesNotMatch(parsed.entregas[0]!.texto, /Carol|Miranda Skin Experts/i);
  assert.equal((parsed.entregas[0]!.texto.match(/\?/g) || []).length, 1);
});

test("brain working memory persists lead facts but not unconfirmed proposed questions", () => {
  const current = workflow(files.service);
  const source = codeOf(current, "Validar e fundir memória proposta pelo cérebro");
  assert.doesNotMatch(source, /allowed = new Set\([^\n]*perguntas_feitas/);
  const validated = {
    conversation_id: "aaaaaaaa-0000-4000-8000-000000000020",
    request: {
      invocation_id: "aaaaaaaa-0000-4000-8000-000000000021",
      scope: { environment: "isolated_test", cliente_slug: "empresa_sintetica_a" },
      operational_context: { language: "pt-BR", summary: "Resumo anterior" },
      company_fields: { queixa_principal: "manchas" },
      policy: { context_version: 4, context_config_version: "miranda-test-v1", source_central_message_ids: ["message-a"] },
    },
    result: {
      context_patch: {
        servico_interesse: "avaliação de pele",
        perguntas_feitas: ["Qual dia fica melhor?"],
      },
      domain_events: [],
    },
  };
  type MemoryOutput = {
    merged_context: {
      company_fields: Record<string, unknown>;
    };
  };
  const output = executeNodeCode(source, {}, {}, {
    [resolveName(current, "Validar resultado e atestados")]: validated,
  }) as Array<{ json: MemoryOutput }>;
  assert.equal(output[0]!.json.merged_context.company_fields.queixa_principal, "manchas");
  assert.equal(output[0]!.json.merged_context.company_fields.servico_interesse, "avaliação de pele");
  assert.equal(output[0]!.json.merged_context.company_fields.perguntas_feitas, undefined);
  assert.equal(
    canReach(current, "Validar e fundir memória proposta pelo cérebro", "Preparar ações após efeitos de domínio"),
    true,
  );
});

test("public model release identifiers survive sanitization without restoring credentials", () => {
  const current = workflow(files.service);
  const anthropic = node(current, "Anthropic Chat Model1");
  const selector = anthropic.parameters.model as { value?: unknown };
  assert.equal(selector.value, "claude-haiku-4-5-20251001");
  assert.doesNotMatch(JSON.stringify(anthropic.parameters), /REDACTED_PHONE/);
  assert.equal(anthropic.credentials, undefined);
});

test("only Safe Delivery owns provider delivery and uncertain results never retry", () => {
  for (const entry of manifest.workflows) {
    const json = serialized(workflow(entry.file));
    if (entry.file === files.delivery) {
      assert.match(json, /LEXIA_ZAPI_SEND_URL/);
      assert.match(json, /LEXIA_META_SEND_URL/);
    } else {
      assert.doesNotMatch(json, /LEXIA_(?:ZAPI|META)_SEND_URL/, entry.file);
    }
  }
  const current = workflow(files.delivery);
  for (const name of ["Enviar Z-API", "Enviar Meta"]) {
    assert.equal(node(current, name).retryOnFail, false, name);
  }
  assert.match(
    codeOf(current, "Classificar resultado sem retry cego"),
    /delivery_unknown[\s\S]*automatic_retry_allowed: false/,
  );
  assert.match(
    codeOf(current, "Tratar exceção como resultado incerto"),
    /delivery_unknown[\s\S]*automatic_retry_allowed: false/,
  );
  assert.match(codeOf(current, "Parar plano suprimido"), /provider_send_attempted: false/);
  assert.match(codeOf(current, "Parar plano após falha ou incerteza"), /provider_send_attempted: true/);
  assert.match(codeOf(current, "Plano concluído sem duplicar"), /provider_send_attempted: plan\.actions\.length > 0/);
});

test("delivery revalidates each action, preserves partial progress and stops on uncertainty", () => {
  const current = workflow(files.delivery);
  assert.equal(canReach(current, "Enviar uma ação por vez", "Revalidar permissão imediatamente antes do envio"), true);
  assert.equal(canReach(current, "Revalidar permissão imediatamente antes do envio", "Validar autorização de envio"), true);
  assert.match(
    JSON.stringify(node(current, "Revalidar permissão imediatamente antes do envio").parameters),
    /lexia_omni_claim_outbound_action/,
  );
  assert.match(
    codeOf(current, "Parar plano após falha ou incerteza"),
    /partial_progress_preserved: true[\s\S]*automatic_retry_allowed: false/,
  );
  assert.deepEqual(targets(current, "Parar plano após falha ou incerteza"), []);
});

test("observe-only suppression completes the batch and only newer lead state supersedes it", () => {
  const current = workflow(files.service);
  const finish = codeOf(current, "Encerrar lote conforme resultado");
  assert.doesNotMatch(finish, /\['suppressed',\s*'state_changed'/);
  assert.match(finish, /\['state_changed','superseded_by_new_message'\]/);
  assert.match(finish, /reason === 'state_changed'/);
  assert.match(finish, /reason === 'superseded_by_new_message'/);
  assert.match(finish, /superseded \? 'lexia_omni_supersede_inbound_batch' : 'lexia_omni_complete_inbound_batch'/);
  assert.equal(
    canReach(current, "Carregar sequência mais recente antes da resposta", "Descartar resposta obsoleta antes de exibir"),
    true,
  );
  assert.equal(
    canReach(current, "Descartar resposta obsoleta antes de exibir", "Concluir ou superseder lote"),
    true,
  );
  assert.match(codeOf(current, "Comparar lote com a conversa atual"), /currentLeadSeq > cutoff/);
  assert.match(
    codeOf(current, "Descartar resposta obsoleta antes de exibir"),
    /status: 'superseded_by_new_message'[\s\S]*provider_send_attempted: false/,
  );
  const returned = codeOf(current, "Retornar resultado do cérebro");
  assert.match(returned, /provider_send_attempted: input\.delivery_result\?\.provider_send_attempted === true/);
  assert.match(returned, /languageBlocked \|\| superseded \? \[\]/);
  assert.match(returned, /reprocess_required: superseded/);
});

test("brain delivery gate enforces the lead language before every provider plan", () => {
  const current = workflow(files.service);
  const source = codeOf(current, "Preparar ações após efeitos de domínio");
  assert.match(codeOf(current, "Preparar Briefing"), /saudacoesUnivocas = \{ oi: 'pt', ola: 'pt', hello: 'en', hi: 'en', hola: 'es' \}/);
  assert.match(codeOf(current, "Preparar Briefing"), /\(en\|em\).*\(espanol\|espanhol\)/);
  assert.match(codeOf(current, "Retornar resultado do cérebro"), /languageBlocked \|\| superseded \? \[\]/);
  const request = {
    invocation_id: "aaaaaaaa-0000-4000-8000-000000000101",
    correlation_id: "aaaaaaaa-0000-4000-8000-000000000102",
    operational_context: { language: "en" },
    messages: [
      {
        message_id: "lead-message-en",
        author: "lead",
        text: "Hello, I would like to know which treatments are available.",
      },
    ],
  };
  const action = (text: string) => ({
    action_id: "aaaaaaaa-0000-4000-8000-000000000103",
    sequence: 1,
    content: { type: "text", text },
  });
  const references = (text: string) => ({
    [resolveName(current, "Validar resultado e atestados")]: {
      request,
      result: { decision: "reply", actions: [action(text)] },
      delivery_mode: "observe_only",
      lead_cutoff_seq: 1,
    },
    [resolveName(current, "Preparar Briefing")]: { idioma: "en" },
  });

  const matched = executeNodeCode(source, {}, {}, references(
    "Hello, I can help you choose the best treatment for your skin.",
  )) as Array<{
    json: {
      skip_delivery: boolean;
      language_policy: { status: string; expected_language: string };
    };
  }>;
  assert.equal(matched[0]!.json.skip_delivery, false);
  assert.deepEqual(matched[0]!.json.language_policy, {
    status: "passed",
    expected_language: "en",
    detected_languages: ["en"],
    checked_action_count: 1,
  });

  const mismatched = executeNodeCode(source, {}, {}, references(
    "Olá, posso ajudar você a escolher o melhor tratamento para sua pele.",
  )) as Array<{
    json: {
      skip_delivery: boolean;
      language_policy: { status: string; expected_language: string };
      delivery_result: { status: string; reason: string; provider_send_attempted: boolean };
    };
  }>;
  assert.equal(mismatched[0]!.json.skip_delivery, true);
  assert.equal(mismatched[0]!.json.language_policy.status, "blocked");
  assert.equal(mismatched[0]!.json.language_policy.expected_language, "en");
  assert.deepEqual(mismatched[0]!.json.delivery_result, {
    status: "suppressed",
    reason: "response_language_mismatch",
    provider_send_attempted: false,
  });

  const explicitSpanishRequest = {
    ...request,
    operational_context: { language: "pt" },
    messages: [
      ...request.messages,
      {
        message_id: "lead-message-explicit-es",
        author: "lead",
        text: "Gostaria de ser atendido em espanol",
      },
    ],
  };
  const explicitSpanish = executeNodeCode(source, {}, {}, {
    [resolveName(current, "Validar resultado e atestados")]: {
      request: explicitSpanishRequest,
      result: {
        decision: "reply",
        actions: [
          action("Perfecto, sin problema. ¿Qué tratamiento te gustaría conocer?"),
        ],
      },
      delivery_mode: "observe_only",
      lead_cutoff_seq: 2,
    },
    [resolveName(current, "Preparar Briefing")]: { idioma: "pt" },
  }) as Array<{
    json: {
      skip_delivery: boolean;
      language_policy: { status: string; expected_language: string };
    };
  }>;
  assert.equal(explicitSpanish[0]!.json.skip_delivery, false);
  assert.equal(explicitSpanish[0]!.json.language_policy.status, "passed");
  assert.equal(explicitSpanish[0]!.json.language_policy.expected_language, "es");
});

test("agenda routes explicit operations and availability cannot prove appointment creation", () => {
  const current = workflow(files.agenda);
  assert.equal(targets(current, "Escolher operação", 0)[0], resolveName(current, "Validar solicitação de disponibilidade"));
  assert.equal(targets(current, "Escolher operação", 1)[0], resolveName(current, "Validar contrato de criação"));
  assert.equal(canReach(current, "Create an event", "Create a row"), true);
  assert.equal(canReach(current, "Create a row", "Emitir agendamento atestado"), true);
  const emitted = codeOf(current, "Emitir agendamento atestado");
  assert.match(emitted, /appointment\.confirmed/);
  assert.match(emitted, /appointment\.create/);
  assert.match(emitted, /ends_at/);
  assert.doesNotMatch(
    codeOf(current, "Emitir disponibilidade sem confirmar agendamento"),
    /appointment\.confirmed|appointment\.create/,
  );
});

test("test calendar policy defaults closed and separates reads from writes", () => {
  const current = workflow(files.agenda);
  const source = codeOf(current, "Aplicar política de Calendar do teste");
  const input = {
    operation: "availability.check",
    test_control: {
      execution_mode: "full_agent_virtual",
      tool_policy: { calendar: "disabled" },
    },
  };
  const disabled = executeNodeCode(source, input) as Array<{
    json: { agenda_route: string };
  }>;
  assert.equal(disabled[0]!.json.agenda_route, "test.calendar.disabled");

  const readOnlyAvailability = executeNodeCode(source, {
    ...input,
    test_control: {
      ...input.test_control,
      tool_policy: { calendar: "test_read_only" },
    },
  }) as Array<{ json: { agenda_route: string } }>;
  assert.equal(readOnlyAvailability[0]!.json.agenda_route, "availability.check");

  const readOnlyCreate = executeNodeCode(source, {
    ...input,
    operation: "appointment.create",
    test_control: {
      ...input.test_control,
      tool_policy: { calendar: "test_read_only" },
    },
  }) as Array<{ json: { agenda_route: string } }>;
  assert.equal(readOnlyCreate[0]!.json.agenda_route, "test.calendar.read_only");
});

test("follow-ups and reminders are separate schedules sharing one automation and delivery gate", () => {
  const current = workflow(files.automations);
  assert.equal(
    node(current, "Receber solicitação interna").type,
    "n8n-nodes-base.executeWorkflowTrigger",
  );
  assert.equal(
    targets(current, "Receber solicitação interna", 0)[0],
    resolveName(current, "Validar pedido de automação"),
  );
  assert.equal(
    targets(current, "Montar pedido idempotente de follow-up")[0],
    resolveName(current, "Validar pedido de automação"),
  );
  assert.equal(
    targets(current, "Montar lembrete idempotente")[0],
    resolveName(current, "Validar pedido de automação"),
  );
  assert.equal(canReach(current, "Montar plano da automação", "Entregar automação pelo gate"), true);
  assert.doesNotMatch(serialized(current), /LEXIA_(?:ZAPI|META)_SEND_URL/);
  assert.match(codeOf(current, "Montar pedido idempotente de follow-up"), /followup_media_ref/);
  assert.match(codeOf(current, "Montar pedido idempotente de follow-up"), /type: 'image'/);
  assert.match(codeOf(current, "Montar pedido idempotente de follow-up"), /type: 'audio'/);
});

test("CRM commands cover pause, handoff, cancellation and attendance without trusting tenant", () => {
  const current = workflow(files.crm);
  assert.equal(node(current, "Webhook autenticado do Frappe").parameters.authentication, "headerAuth");
  const validate = codeOf(current, "Validar comando sem confiar no tenant");
  for (const type of [
    "manual_pause.start",
    "manual_pause.end",
    "handoff.resolve",
    "handoff.resume",
    "appointment.cancel",
    "appointment.attendance.update",
  ]) {
    assert.match(validate, new RegExp(type.replace(".", "\\.")), type);
  }
  assert.match(validate, /exactKeys\(input\.payload/);
  assert.match(validate, /code \+ '_extra_'/);
  assert.match(validate, /crm_command_payload_required_/);
  assert.match(validate, /crm_command_attendance_invalid/);
  assert.match(validate, /validDateTime/);
  const map = codeOf(current, "Mapear comando para RPC restrita");
  for (const rpc of [
    "lexia_omni_start_manual_pause",
    "lexia_omni_end_block",
    "lexia_omni_resolve_handoff",
    "lexia_omni_resume_handoff",
    "lexia_omni_cancel_appointment_from_crm",
    "lexia_omni_update_appointment_attendance",
  ]) {
    assert.match(map, new RegExp(rpc), rpc);
  }
  assert.match(JSON.stringify(node(current, "Carregar vínculo confiável do comando").parameters), /lexia_channel_accounts/);
});

test("platform test route is header-authenticated and cannot deliver", () => {
  const current = workflow(files.entry);
  assert.equal(node(current, "Webhook de teste da plataforma").parameters.authentication, "headerAuth");
  const validate = codeOf(current, "Validar teste sintético");
  assert.match(validate, /delivery_mode !== 'simulate'/);
  assert.match(validate, /provider_send !== false/);
  assert.match(validate, /delivery_mode: 'observe_only'/);
  assert.equal(canReach(current, "Validar teste sintético", "Responder teste"), true);
});

test("isolated candidate corridor reaches only simulation nodes before returning", () => {
  const entry = workflow(files.entry);
  const entryReachable = reachableNames(entry, "Preparar simulação curta");
  const entryTypes = new Set(
    [...entryReachable].map(
      (name) => entry.nodes.find((candidate) => candidate.name === name)!.type,
    ),
  );
  assert.deepEqual(
    [...entryTypes].sort(),
    [
      "n8n-nodes-base.code",
      "n8n-nodes-base.executeWorkflow",
    ],
  );
  for (const name of entryReachable) {
    const current = entry.nodes.find((candidate) => candidate.name === name)!;
    if (typeof current.parameters.jsCode === "string") {
      assert.doesNotMatch(current.parameters.jsCode, /structuredClone/);
    }
  }
  const execute = node(entry, "Executar atendimento sintético isolado");
  assert.equal(
    (execute.parameters.workflowId as Record<string, unknown>).cachedResultName,
    "LEXIA V2 CANDIDATO - MIRANDA - 02 ATENDIMENTO IA",
  );

  const service = workflow(files.service);
  const simulationReachable = reachableNames(
    service,
    "Simular contexto isolado por empresa e conversa",
  );
  assert.deepEqual(
    [...simulationReachable].map(
      (name) => service.nodes.find((candidate) => candidate.name === name)!.type,
    ),
    ["n8n-nodes-base.code", "n8n-nodes-base.code"],
  );
  for (const name of simulationReachable) {
    const current = service.nodes.find((candidate) => candidate.name === name)!;
    if (typeof current.parameters.jsCode === "string") {
      assert.doesNotMatch(current.parameters.jsCode, /structuredClone/);
    }
  }
  assert.equal(
    targets(service, "Rotear contrato isolado", 0)[0],
    resolveName(service, "Simular contexto isolado por empresa e conversa"),
  );
  assert.equal(
    targets(service, "Rotear contrato isolado", 1)[0],
    resolveName(service, "Restaurar contrato real sem metadado de rota"),
  );
});

test("remote gateway routes every target to the published lab subworkflows", () => {
  const source = readFileSync(
    join(process.cwd(), "n8n", "omnichannel-test", "remote-gateway.sdk.mjs"),
    "utf8",
  );
  assert.match(source, /omnichannel: 'entry'/);
  assert.match(source, /brain: 'service'/);
  assert.match(source, /followup: 'automation'/);
  assert.match(source, /create_appointment: 'agenda'/);
  assert.match(source, /LEXIA HML - MIRANDA - 01 ENTRADA OMNICHANNEL/);
  assert.match(source, /LEXIA HML - MIRANDA - 02 ATENDIMENTO IA/);
  assert.match(source, /LEXIA HML - MIRANDA - 03 AGENDA/);
  assert.match(source, /LEXIA HML - MIRANDA - 04 FOLLOW-UPS E LEMBRETES/);
  assert.match(source, /n8n-nodes-base\.executeWorkflow/);
  assert.match(source, /source: "database"/);
  assert.doesNotMatch(source, /source: "parameter"/);
  assert.doesNotMatch(source, /target_not_connected_yet|gateway_build_required/);
  assert.match(source, /provider_send_attempted !== false/);
  assert.match(source, /Preparar contrato puro para 01 Entrada/);
  assert.match(source, /return \[\{ json: input\.request \}\]/);
  assert.match(source, /executeEntry\.output\(2\)\.to\(validateResult/);
  assert.doesNotMatch(
    source,
    /n8n-nodes-base\.(?:httpRequest|openAi|postgres|redis)/,
  );
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(
    sdkCodeOf(source, "Validar e rotear teste isolado"),
    /structuredClone/,
  );

  const validate = sdkCodeOf(source, "Validar e rotear teste isolado");
  const valid = candidateTestRequest();
  const accepted = executeNodeCode(validate, { body: valid }) as Array<{
    json: { route: string };
  }>;
  assert.equal(accepted[0]!.json.route, "entry");
  const unwrapEntry = sdkCodeOf(source, "Preparar contrato puro para 01 Entrada");
  assert.deepEqual(
    executeNodeCode(unwrapEntry, accepted[0]!.json) as Array<{ json: Record<string, unknown> }>,
    [{ json: valid }],
  );
  assert.throws(
    () => executeNodeCode(unwrapEntry, { route: "agenda", request: valid }),
    /route_envelope_invalid:entry/,
  );

  const full = structuredClone(valid);
  full.execution_mode = "full_agent_virtual";
  assert.equal(
    (executeNodeCode(validate, { body: full }) as Array<{ json: { route: string } }>)[0]!
      .json.route,
    "entry",
  );

  const routes = new Map([
    ["brain", "service"],
    ["followup", "automation"],
    ["reminder", "automation"],
    ["create_appointment", "agenda"],
    ["check_availability", "agenda"],
  ]);
  for (const [target, route] of routes) {
    const request = structuredClone(valid);
    request.target = target;
    const result = executeNodeCode(validate, { body: request }) as Array<{
      json: { route: string };
    }>;
    assert.equal(result[0]!.json.route, route);
  }

  const invalidFullBrain = structuredClone(full);
  invalidFullBrain.target = "brain";
  assert.throws(
    () => executeNodeCode(validate, { body: invalidFullBrain }),
    /full_mode_target/,
  );

  const singleRun = structuredClone(valid);
  singleRun.scope.conversation_ref = `test:${singleRun.run_id}`;
  assert.doesNotThrow(() => executeNodeCode(validate, { body: singleRun }));

  const operationalConversation = structuredClone(valid);
  operationalConversation.scope.conversation_ref = "instagram:real-conversation";
  assert.throws(
    () => executeNodeCode(validate, { body: operationalConversation }),
    /conversation_ref/,
  );

  const builder = readFileSync(
    join(process.cwd(), "scripts", "build-miranda-v2-lab-deployment.mjs"),
    "utf8",
  );
  const runtimeBuilder = readFileSync(
    join(process.cwd(), "scripts", "lib", "miranda-v2-lab-runtime.mjs"),
    "utf8",
  );
  assert.match(runtimeBuilder, /source: "database"/);
  assert.match(runtimeBuilder, /lab_package_forbidden_node/);
  assert.match(runtimeBuilder, /n8n_subworkflow_lab_v2/);
  assert.match(builder, /assertSanitizedWorkflowPackage/);
  assert.doesNotMatch(builder, /n8n import:workflow|ssh |docker exec/);
});

test("candidate entry accepts only the exact isolated synthetic contract", () => {
  const current = workflow(files.entry);
  assert.equal(
    canReach(current, "Validar retorno correlacionado do atendimento", "Retornar contrato único ao gateway"),
    true,
  );
  assert.equal(
    canReach(current, "Retornar resultado ao gateway", "Retornar contrato único ao gateway"),
    true,
  );
  const source = codeOf(current, "Validar contrato isolado do teste");
  const valid = candidateTestRequest();
  const result = executeNodeCode(source, valid) as Array<{
    json: Record<string, unknown>;
  }>;
  const stage = result[0]!.json.stage as Record<string, unknown>;
  assert.equal(result[0]!.json.route, "safe_simulation");
  assert.equal(stage.stage, "entry_validated");
  assert.deepEqual(stage.guard, {
    environment: "isolated_test",
    external_effects_allowed: false,
    provider_send_allowed: false,
  });

  const singleRun = structuredClone(valid);
  singleRun.scope.conversation_ref = `test:${singleRun.run_id}`;
  assert.doesNotThrow(() => executeNodeCode(source, singleRun));

  for (const conversationRef of [
    "test:SYNTH-LEXIA-TEST-CHAT-not-a-uuid",
    "SYNTH-LEXIA-TEST-CHAT-bbbbbbbb-0000-4000-8000-000000000993",
    "test:operational-conversation",
    "test:bbbbbbbb-0000-4000-8000-000000000993",
  ]) {
    const invalidConversation = structuredClone(valid);
    invalidConversation.scope.conversation_ref = conversationRef;
    assert.throws(
      () => executeNodeCode(source, invalidConversation),
      /conversation_ref/,
    );
  }

  const wrongTenant = structuredClone(valid);
  wrongTenant.scope.cliente_slug = "empresa_sintetica_b";
  assert.throws(() => executeNodeCode(source, wrongTenant), /cliente_slug/);

  const wrongEnvironment = structuredClone(valid);
  wrongEnvironment.scope.environment = "production";
  assert.throws(() => executeNodeCode(source, wrongEnvironment), /environment/);

  const providerSend = structuredClone(valid);
  providerSend.expectations.provider_send = true;
  assert.throws(() => executeNodeCode(source, providerSend), /provider_send/);

  const wrongTarget = structuredClone(valid);
  wrongTarget.target = "brain";
  assert.throws(() => executeNodeCode(source, wrongTarget), /target/);
});

test("candidate entry waits for an active owner and reclaims the newest complete batch", () => {
  const current = workflow(files.entry);
  assert.equal(canReach(current, "Lote ainda permitido?", "Claim deve aguardar?"), true);
  assert.equal(canReach(current, "Claim deve aguardar?", "Aguardar liberação ou novo debounce"), true);
  assert.equal(canReach(current, "Aguardar liberação ou novo debounce", "Carregar sequência para nova tentativa"), true);
  assert.equal(canReach(current, "Carregar sequência para nova tentativa", "Preparar nova tentativa de claim"), true);
  assert.equal(canReach(current, "Preparar nova tentativa de claim", "Reivindicar lote após prontidão"), true);
  assert.equal(canReach(current, "Reivindicar lote após prontidão", "Avaliar lote após prontidão"), true);
  assert.equal(canReach(current, "Avaliar lote após prontidão", "Lote permitido após prontidão?"), true);
  assert.equal(canReach(current, "Lote permitido após prontidão?", "Executar contexto e cérebro"), true);
  assert.equal(
    targets(current, "Lote permitido após prontidão?", 1).includes(resolveName(current, "Claim deve aguardar?")),
    true,
  );
  assert.match(
    JSON.stringify(node(current, "Claim deve aguardar?").parameters),
    /window_open[\s\S]*batch_in_progress[\s\S]*newer_message_waiting[\s\S]*60/,
  );
  assert.match(
    codeOf(current, "Preparar nova tentativa de claim"),
    /lead_message_seq[\s\S]*claim_attempts[\s\S]*p_candidate_seq: candidateSeq/,
  );
  assert.doesNotMatch(
    codeOf(current, "Validar política antes do buffer"),
    /full_agent_virtual[^\n]+\?\s*1/,
  );
  assert.match(
    codeOf(current, "Montar resultado do agente completo"),
    /full_agent_test_brain_not_completed/,
  );
  for (const status of ["newer_message_waiting", "superseded_by_new_message"]) {
    const bufferedResult = executeNodeCode(
      codeOf(current, "Montar resultado do agente completo"),
      {
        status,
        message_persisted: true,
        provider_send_attempted: false,
        reprocess_required: status === "superseded_by_new_message",
        workflow_test: {
          run_id: "bbbbbbbb-0000-4000-8000-000000000993",
          target: "omnichannel",
          execution_mode: "full_agent_virtual",
          tool_policy: { calendar: "disabled" },
        },
      },
    ) as Array<{ json: Record<string, unknown> }>;
    assert.equal(bufferedResult[0]!.json.status, "completed", status);
    assert.deepEqual(
      (bufferedResult[0]!.json.output as Record<string, unknown>).assistant_messages,
      [],
      status,
    );
    assert.equal(
      (bufferedResult[0]!.json.output as Record<string, unknown>).buffered_into_newer_run,
      true,
      status,
    );
  }
});

test("candidate service isolates context and simulates the brain without external effects", () => {
  const entry = workflow(files.entry);
  const service = workflow(files.service);
  const request = candidateTestRequest();
  const entryResult = executeNodeCode(
    codeOf(entry, "Validar contrato isolado do teste"),
    request,
  ) as Array<{ json: Record<string, unknown> }>;
  const stage = entryResult[0]!.json.stage as Record<string, unknown>;

  const routed = executeNodeCode(
    codeOf(service, "Separar simulação do contrato real"),
    stage,
  ) as Array<{ json: { route: string; payload: Record<string, unknown> } }>;
  assert.equal(routed[0]!.json.route, "lab_simulation");

  const prepared = executeNodeCode(
    codeOf(service, "Simular contexto isolado por empresa e conversa"),
    routed[0]!.json,
  ) as Array<{ json: Record<string, unknown> }>;
  const context = prepared[0]!.json.context as Record<string, unknown>;
  assert.equal(context.config_version, "lab-context-empresa-sintetica-a-v1");
  assert.deepEqual(context.source_message_ids, [request.input.message_id]);
  assert.deepEqual(context.scope, request.scope);

  const brain = executeNodeCode(
    codeOf(service, "Simular cérebro sem modelo tools ou efeitos"),
    prepared[0]!.json,
  ) as Array<{ json: Record<string, unknown> }>;
  assert.equal(brain[0]!.json.stage, "service_completed");
  assert.equal(brain[0]!.json.provider_send_attempted, false);
  assert.match(
    String((brain[0]!.json.assistant_message as Record<string, unknown>).text),
    /Nenhum modelo, tool, canal ou provedor real/,
  );

  const crossed = structuredClone(stage) as typeof stage & {
    scope: Record<string, unknown>;
  };
  crossed.scope.cliente_slug = "empresa_sintetica_b";
  assert.throws(
    () => executeNodeCode(codeOf(service, "Separar simulação do contrato real"), crossed),
    /scope_owner/,
  );

  const unknown = structuredClone(stage);
  unknown.schema_version = "lexia.workflow.test.stage.v2";
  assert.throws(
    () => executeNodeCode(codeOf(service, "Separar simulação do contrato real"), unknown),
    /unknown_test_contract/,
  );
});

test("candidate entry rejects a service result from another run scope or source message", () => {
  const entry = workflow(files.entry);
  const service = workflow(files.service);
  const request = candidateTestRequest();
  const entryValidated = (
    executeNodeCode(codeOf(entry, "Validar contrato isolado do teste"), request) as Array<{
      json: Record<string, unknown>;
    }>
  )[0]!.json;
  const entryStage = entryValidated.stage as Record<string, unknown>;
  const routed = (
    executeNodeCode(codeOf(service, "Separar simulação do contrato real"), entryStage) as Array<{
      json: { route: string; payload: Record<string, unknown> };
    }>
  )[0]!.json;
  const prepared = (
    executeNodeCode(
      codeOf(service, "Simular contexto isolado por empresa e conversa"),
      routed,
    ) as Array<{ json: Record<string, unknown> }>
  )[0]!.json;
  const serviceResult = (
    executeNodeCode(
      codeOf(service, "Simular cérebro sem modelo tools ou efeitos"),
      prepared,
    ) as Array<{ json: Record<string, unknown> }>
  )[0]!.json;
  const references = {
    "LABORATÓRIO | Validar contrato isolado do teste": entryValidated,
  };
  const validate = codeOf(entry, "Validar retorno correlacionado do atendimento");
  const accepted = executeNodeCode(validate, serviceResult, {}, references) as Array<{
    json: Record<string, unknown>;
  }>;
  assert.equal(accepted[0]!.json.status, "completed");
  assert.equal(accepted[0]!.json.provider_send_attempted, false);

  const wrongRun = structuredClone(serviceResult);
  wrongRun.run_id = "bbbbbbbb-0000-4000-8000-000000000991";
  assert.throws(
    () => executeNodeCode(validate, wrongRun, {}, references),
    /request_correlation/,
  );

  const wrongScope = structuredClone(serviceResult) as typeof serviceResult & {
    scope: Record<string, unknown>;
  };
  wrongScope.scope.conversation_ref =
    "test:SYNTH-LEXIA-TEST-CHAT-cccccccc-0000-4000-8000-000000000993";
  assert.throws(
    () => executeNodeCode(validate, wrongScope, {}, references),
    /scope_correlation/,
  );

  const wrongMessage = structuredClone(serviceResult) as typeof serviceResult & {
    context: { source_message_ids: string[] };
  };
  wrongMessage.context.source_message_ids = [
    "test-message:bbbbbbbb-0000-4000-8000-000000000991",
  ];
  assert.throws(
    () => executeNodeCode(validate, wrongMessage, {}, references),
    /context_source_messages/,
  );
});

test("provider adapters retain every Meta event and structured ad attribution", () => {
  const current = workflow(files.entry);
  const meta = codeOf(current, "Normalizar Meta sem token inline");
  assert.match(meta, /for \(const entry of Array\.isArray\(raw\.entry\)/);
  assert.match(meta, /for \(const messaging of Array\.isArray\(entry\?\.messaging\)/);
  assert.doesNotMatch(meta, /raw\.entry\[0\]|entry\.messaging\[0\]/);
  for (const field of ["campaign_ref", "adset_ref", "ad_ref", "fbclid"]) {
    assert.match(meta, new RegExp(field), field);
  }
  const zapi = codeOf(current, "Normalizar Z-API sem confiar no tenant");
  for (const field of ["campaign_ref", "adset_ref", "ad_ref"]) {
    assert.match(zapi, new RegExp(field), field);
  }
  assert.match(codeOf(current, "Montar espelho CRM após persistência"), /attribution\.captured/);
});

test("Meta adapter behavior emits every message from a batched webhook", () => {
  const current = workflow(files.entry);
  const result = executeCode(
    codeOf(current, "Normalizar Meta sem token inline"),
    {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "lead-a" },
              recipient: { id: "account-a" },
              timestamp: 1791547200000,
              message: {
                mid: "meta-message-a",
                text: "Mensagem sintética A",
                referral: {
                  campaign_id: "campaign-a",
                  adset_id: "adset-a",
                  ad_id: "ad-a",
                },
              },
            },
            {
              sender: { id: "lead-b" },
              recipient: { id: "account-a" },
              timestamp: 1791547201000,
              message: { mid: "meta-message-b", text: "Mensagem sintética B" },
            },
          ],
        },
      ],
    },
    {
      LEXIA_MIRANDA_INSTAGRAM_ACCOUNT_ID: "aaaaaaaa-0000-4000-8000-000000000001",
      LEXIA_MIRANDA_MESSENGER_ACCOUNT_ID: "aaaaaaaa-0000-4000-8000-000000000002",
      LEXIA_DELIVERY_MODE: "observe_only",
    },
  ) as Array<{ json: { event: { provider_event_id: string; message: Record<string, unknown> } } }>;

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((item) => item.json.event.provider_event_id),
    ["meta-message-a", "meta-message-b"],
  );
  assert.deepEqual(result[0]!.json.event.message.ad_origin, {
    source_type: "meta_ad",
    campaign_ref: "campaign-a",
    adset_ref: "adset-a",
    ad_ref: "ad-a",
    fbclid: undefined,
  });
});

test("CRM command validation fails closed before resolving its account", () => {
  const current = workflow(files.crm);
  const source = codeOf(current, "Validar comando sem confiar no tenant");
  const account = "aaaaaaaa-0000-4000-8000-000000000010";
  const environment = { LEXIA_MIRANDA_ZAPI_ACCOUNT_ID: account };
  const valid = {
    schema_version: "lexia.crm.command.v1",
    command_id: "aaaaaaaa-0000-4000-8000-000000000011",
    correlation_id: "aaaaaaaa-0000-4000-8000-000000000012",
    command_type: "appointment.attendance.update",
    occurred_at: "2026-10-09T12:00:00-03:00",
    scope: {
      environment: "isolated_test",
      cliente_slug: "empresa_sintetica_a",
      channel: "whatsapp",
      account_ref: account,
      conversation_ref: "conversation-synthetic-a",
    },
    payload: { appointment_ref: "appointment-synthetic-a", attendance_status: "no_show" },
  };
  assert.doesNotThrow(() => executeCode(source, valid, environment));
  assert.throws(
    () => executeCode(source, { ...valid, payload: { ...valid.payload, cliente_slug: "forged" } }, environment),
    /crm_command_payload_extra_cliente_slug/,
  );
  assert.throws(
    () => executeCode(source, { ...valid, occurred_at: "2026-02-30T12:00:00Z" }, environment),
    /crm_command_fields_invalid/,
  );
});
