import { createHash } from "node:crypto";

export const LAB_ENGINE = "n8n_subworkflow_lab_v2";

export const workflowSpecs = {
  entry: {
    id: "I3hvCPl1UrLYdSyx",
    name: "LEXIA V2 CANDIDATO - MIRANDA - 01 ENTRADA OMNICHANNEL",
    file: "01-entrada-omnichannel-lab.inactive.json",
    deployFile: "01-entrada-omnichannel-deploy.json",
  },
  service: {
    id: "dPUKWYXI8mvxFQhA",
    name: "LEXIA V2 CANDIDATO - MIRANDA - 02 ATENDIMENTO IA",
    file: "02-atendimento-ia-lab.inactive.json",
    deployFile: "02-atendimento-ia-deploy.json",
  },
  agenda: {
    id: "RktITiD0oMhIgsbY",
    name: "LEXIA V2 CANDIDATO - MIRANDA - 03 AGENDA",
    file: "03-agenda-lab.inactive.json",
    deployFile: "03-agenda-deploy.json",
  },
  automation: {
    id: "fQHHfZvyDa3cNrbm",
    name: "LEXIA V2 CANDIDATO - MIRANDA - 04 FOLLOW-UPS E LEMBRETES",
    file: "04-followups-lembretes-lab.inactive.json",
    deployFile: "04-followups-lembretes-deploy.json",
  },
  crm: {
    id: "0m9dWrKrZSFBMUM0",
    name: "LEXIA V2 CANDIDATO - MIRANDA - 05 INTEGRAÇÃO CRM",
    file: "05-integracao-crm-lab.inactive.json",
    deployFile: "05-integracao-crm-deploy.json",
  },
  delivery: {
    id: "mPwHqXNS2ACuzSb7",
    name: "LEXIA V2 CANDIDATO - MIRANDA - 06 SAÍDA SEGURA",
    file: "06-saida-segura-lab.inactive.json",
    deployFile: "06-saida-segura-deploy.json",
  },
};

export const gatewaySpec = {
  id: "AcZ9xStPyoP4NKIr",
  name: "LEXIA LAB - MIRANDA - GATEWAY TESTE CRM",
  deployFile: "07-gateway-teste-crm-deploy.json",
};

const connection = (target) => ({ node: target, type: "main", index: 0 });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableId(scope, name) {
  const value = createHash("sha256").update(`lexia-lab-v2:${scope}:${name}`).digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function rawNode(scope, name, type, typeVersion, position, parameters, extra = {}) {
  return {
    id: stableId(scope, name),
    name,
    type,
    typeVersion,
    position,
    parameters,
    ...extra,
  };
}

function note(scope, name, position, content, width = 1280, height = 180) {
  return rawNode(scope, name, "n8n-nodes-base.stickyNote", 1, position, {
    content,
    width,
    height,
    color: 5,
  });
}

function trigger(scope, name, position) {
  return rawNode(scope, name, "n8n-nodes-base.executeWorkflowTrigger", 1.1, position, {
    inputSource: "passthrough",
  });
}

function code(scope, name, position, jsCode) {
  return rawNode(scope, name, "n8n-nodes-base.code", 2, position, {
    mode: "runOnceForAllItems",
    language: "javaScript",
    jsCode,
  });
}

function call(scope, name, position, target) {
  return rawNode(scope, name, "n8n-nodes-base.executeWorkflow", 1.1, position, {
    source: "database",
    workflowId: {
      __rl: true,
      mode: "list",
      value: target.id,
      cachedResultName: target.name,
    },
    options: { waitForSubWorkflow: true },
  });
}

function linearConnections(names) {
  const connections = {};
  for (let index = 0; index < names.length - 1; index += 1) {
    connections[names[index]] = { main: [[connection(names[index + 1])]] };
  }
  return connections;
}

function workflow(spec, nodes, connections, description) {
  return {
    id: spec.id,
    name: spec.name,
    description,
    active: false,
    isArchived: false,
    nodes,
    connections,
    settings: { executionOrder: "v1" },
    staticData: null,
    pinData: {},
    tags: [],
  };
}

const strictRequestPrelude = String.raw`const incoming = $input.first().json;
const body = incoming && typeof incoming === 'object' && incoming.body
  ? incoming.body
  : incoming && typeof incoming === 'object' && incoming.request
    ? incoming.request
    : incoming;
const fail = (code) => { throw new Error('lexia_lab_request_rejected:' + code); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed, code) => {
  if (!isObject(value)) fail(code);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(code + '_field_' + key);
};
const copyJson = (value) => JSON.parse(JSON.stringify(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chatConversation = /^test:SYNTH-LEXIA-TEST-CHAT-([0-9a-f-]{36})$/i;

exactKeys(body, ['schema_version','run_id','target','delivery_mode','execution_mode','tool_policy','scope','input','expectations'], 'top_level');
if (body.schema_version !== 'lexia.workflow.test.request.v1') fail('schema_version');
if (!uuid.test(String(body.run_id || ''))) fail('run_id');
if (body.delivery_mode !== 'simulate') fail('delivery_mode');
if (body.execution_mode !== 'safe_simulation') fail('execution_mode');
exactKeys(body.tool_policy, ['calendar'], 'tool_policy');
if (body.tool_policy.calendar !== 'disabled') fail('calendar_policy');
exactKeys(body.scope, ['environment','cliente_slug','channel','account_ref','conversation_ref'], 'scope');
if (body.scope.environment !== 'isolated_test') fail('environment');
if (body.scope.cliente_slug !== 'empresa_sintetica_a') fail('cliente_slug');
if (!['whatsapp','instagram','messenger'].includes(body.scope.channel)) fail('channel');
if (!uuid.test(String(body.scope.account_ref || ''))) fail('account_ref');
const chatMatch = chatConversation.exec(String(body.scope.conversation_ref || ''));
const isSingleRunConversation = body.scope.conversation_ref === 'test:' + body.run_id;
const isPersistentChatConversation = Boolean(chatMatch && uuid.test(chatMatch[1]));
if (!isSingleRunConversation && !isPersistentChatConversation) fail('conversation_ref');
exactKeys(body.input, ['message_id','type','text'], 'input');
if (body.input.message_id !== 'test-message:' + body.run_id) fail('message_id');
if (body.input.type !== 'text') fail('message_type');
if (typeof body.input.text !== 'string' || body.input.text.trim().length === 0 || body.input.text.length > 4000) fail('message_text');
exactKeys(body.expectations, ['provider_send','persist_synthetic_events','return_trace'], 'expectations');
if (body.expectations.provider_send !== false) fail('provider_send');
if (body.expectations.persist_synthetic_events !== true) fail('persist_synthetic_events');
if (body.expectations.return_trace !== true) fail('return_trace');`;

const stageFromRequest = String.raw`const stage = {
  schema_version: 'lexia.workflow.test.stage.v2',
  stage: 'request_validated',
  run_id: body.run_id,
  target: body.target,
  delivery_mode: 'simulate',
  execution_mode: body.execution_mode,
  tool_policy: copyJson(body.tool_policy),
  scope: copyJson(body.scope),
  input: copyJson(body.input),
  expectations: copyJson(body.expectations),
  guard: {
    environment: 'isolated_test',
    external_effects_allowed: false,
    provider_send_allowed: false,
    state_version: 1,
    delivery_epoch: 1,
  },
  provider_send_attempted: false,
  executed_workflows: [],
  trace: [],
};`;

const entryValidateCode = `${strictRequestPrelude}
if (body.target !== 'omnichannel') fail('target');
${stageFromRequest}
stage.stage = 'entry_validated';
stage.entry = {
  provider: 'fake',
  event_ref: 'test-event:' + body.run_id,
  message_id: body.input.message_id,
  author: 'lead',
  persistence: 'simulated',
};
stage.executed_workflows.push('01_entrada_omnichannel');
stage.trace.push(
  { step: 'entry_contract', status: 'passed' },
  { step: 'trusted_scope', status: 'passed' },
  { step: 'persist_message', status: 'simulated', reason: 'frappe_test_projection_owns_synthetic_persistence' },
);
return [{ json: stage }];`;

const servicePrepareCode = String.raw`const incoming = $input.first().json;
const copyJson = (value) => JSON.parse(JSON.stringify(value));
const fail = (code) => { throw new Error('lexia_lab_service_rejected:' + code); };
let stage;

if (incoming?.schema_version === 'lexia.workflow.test.stage.v2') {
  stage = copyJson(incoming);
  if (stage.stage !== 'entry_validated' || stage.target !== 'omnichannel') fail('entry_stage');
} else {
  const requestWrapper = incoming && typeof incoming === 'object' && incoming.request ? incoming.request : incoming;
  const body = requestWrapper;
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const exactKeys = (value, allowed, code) => {
    if (!isObject(value)) fail(code);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(code + '_field_' + key);
  };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const chatConversation = /^test:SYNTH-LEXIA-TEST-CHAT-([0-9a-f-]{36})$/i;
  exactKeys(body, ['schema_version','run_id','target','delivery_mode','execution_mode','tool_policy','scope','input','expectations'], 'top_level');
  if (body.schema_version !== 'lexia.workflow.test.request.v1' || body.target !== 'brain') fail('contract');
  if (!uuid.test(String(body.run_id || '')) || body.delivery_mode !== 'simulate') fail('mode');
  if (body.execution_mode !== 'safe_simulation') fail('execution_mode');
  exactKeys(body.tool_policy, ['calendar'], 'tool_policy');
  if (body.tool_policy.calendar !== 'disabled') fail('calendar_policy');
  exactKeys(body.scope, ['environment','cliente_slug','channel','account_ref','conversation_ref'], 'scope');
  if (body.scope.environment !== 'isolated_test' || body.scope.cliente_slug !== 'empresa_sintetica_a') fail('scope_owner');
  if (!['whatsapp','instagram','messenger'].includes(body.scope.channel) || !uuid.test(String(body.scope.account_ref || ''))) fail('scope');
  const match = chatConversation.exec(String(body.scope.conversation_ref || ''));
  if (body.scope.conversation_ref !== 'test:' + body.run_id && !(match && uuid.test(match[1]))) fail('conversation_ref');
  exactKeys(body.input, ['message_id','type','text'], 'input');
  if (body.input.message_id !== 'test-message:' + body.run_id || body.input.type !== 'text') fail('message');
  if (typeof body.input.text !== 'string' || !body.input.text.trim() || body.input.text.length > 4000) fail('message_text');
  exactKeys(body.expectations, ['provider_send','persist_synthetic_events','return_trace'], 'expectations');
  if (body.expectations.provider_send !== false || body.expectations.persist_synthetic_events !== true || body.expectations.return_trace !== true) fail('expectations');
  stage = {
    schema_version: 'lexia.workflow.test.stage.v2', stage: 'request_validated', run_id: body.run_id,
    target: body.target, delivery_mode: 'simulate', execution_mode: body.execution_mode,
    tool_policy: copyJson(body.tool_policy), scope: copyJson(body.scope), input: copyJson(body.input),
    expectations: copyJson(body.expectations),
    guard: { environment: 'isolated_test', external_effects_allowed: false, provider_send_allowed: false, state_version: 1, delivery_epoch: 1 },
    provider_send_attempted: false, executed_workflows: [], trace: [
      { step: 'service_contract', status: 'passed' },
      { step: 'trusted_scope', status: 'passed' },
    ],
  };
}

if (stage.guard?.external_effects_allowed !== false || stage.guard?.provider_send_allowed !== false) fail('guard');
if (stage.scope?.environment !== 'isolated_test' || stage.scope?.cliente_slug !== 'empresa_sintetica_a') fail('scope_owner');
if (stage.input?.message_id !== 'test-message:' + stage.run_id) fail('source_message');

const configs = {
  'isolated_test|empresa_sintetica_a': {
    config_version: 'lab-context-empresa-sintetica-a-v1',
    prompt_ref: 'context:empresa_sintetica_a:v1',
    locale: 'pt-BR',
  },
};
const configKey = stage.scope.environment + '|' + stage.scope.cliente_slug;
const config = configs[configKey];
if (!config) fail('context_config_unavailable');
const messages = [{
  message_id: stage.input.message_id,
  scope: copyJson(stage.scope),
  author: 'lead',
  type: stage.input.type,
  text: stage.input.text,
}];
if (messages.some((message) => JSON.stringify(message.scope) !== JSON.stringify(stage.scope))) fail('mixed_scope');
stage.stage = 'context_prepared';
stage.context = {
  schema_version: 'lexia.context.result.v1',
  scope: copyJson(stage.scope),
  context_call_id: 'test-context:' + stage.run_id,
  config_version: config.config_version,
  source_message_ids: messages.map((message) => message.message_id),
  operational_context: {
    summary: 'Resumo sintético isolado para validação do encadeamento.',
    language: config.locale,
    intent: 'workflow_test',
    topic: { current: 'workflow_test', changed: false, resumed_previous: false },
    confidence: 1,
    missing_information: [], contact_updates: {}, scheduling_intent: {},
  },
  company_fields: {},
};
stage.executed_workflows = [...(stage.executed_workflows || []), '02_atendimento_ia'];
stage.trace = [...(stage.trace || []),
  { step: 'context_config', status: 'simulated', reason: config.prompt_ref },
  { step: 'history_scope', status: 'passed' },
];
return [{ json: stage }];`;

const serviceBrainCode = String.raw`const stage = $input.first().json;
const fail = (code) => { throw new Error('lexia_lab_brain_rejected:' + code); };
if (stage?.schema_version !== 'lexia.workflow.test.stage.v2' || stage.stage !== 'context_prepared') fail('stage');
if (stage.context?.context_call_id !== 'test-context:' + stage.run_id) fail('context_call');
if (JSON.stringify(stage.context?.scope) !== JSON.stringify(stage.scope)) fail('context_scope');
if (stage.context?.source_message_ids?.length !== 1 || stage.context.source_message_ids[0] !== stage.input.message_id) fail('source_messages');
if (stage.guard?.external_effects_allowed !== false || stage.guard?.provider_send_allowed !== false) fail('guard');
const captured = { state_version: stage.guard.state_version, delivery_epoch: stage.guard.delivery_epoch };
return [{ json: {
  ...stage,
  stage: 'brain_prepared',
  assistant_message: {
    message_id: 'n8n-test-out:' + stage.run_id,
    type: 'text',
    text: 'Recebi sua mensagem no laboratório do n8n. O fluxo completo foi percorrido sem chamar modelo, tool ou provedor real.',
  },
  actions: [{
    action_id: 'test-action:' + stage.run_id,
    sequence: 1,
    kind: 'reply',
    captured_state: captured,
    content: { type: 'text', text: 'Resposta sintética protegida.' },
  }],
  trace: [
    ...stage.trace,
    { step: 'context_agent', status: 'simulated', reason: 'external_model_disabled' },
    { step: 'private_brain_and_tools', status: 'simulated', reason: 'external_model_and_tools_disabled' },
    { step: 'brain_result_binding', status: 'passed' },
  ],
} }];`;

const crmProjectionCode = String.raw`const stage = $input.first().json;
const fail = (code) => { throw new Error('lexia_lab_crm_rejected:' + code); };
if (stage?.schema_version !== 'lexia.workflow.test.stage.v2') fail('schema_version');
if (stage.scope?.environment !== 'isolated_test' || stage.scope?.cliente_slug !== 'empresa_sintetica_a') fail('scope');
if (stage.guard?.external_effects_allowed !== false || stage.provider_send_attempted !== false) fail('guard');
if (!Array.isArray(stage.trace) || !Array.isArray(stage.executed_workflows)) fail('trace');
return [{ json: {
  ...stage,
  executed_workflows: [...stage.executed_workflows, '05_integracao_crm'],
  crm_projection: {
    mode: 'simulated',
    lead_deal: 'validated',
    timeline: 'validated',
    source_message_id: stage.input?.message_id,
  },
  trace: [...stage.trace, {
    step: 'crm_projection',
    status: 'simulated',
    reason: 'frappe_test_projection_owns_synthetic_persistence',
  }],
} }];`;

const deliveryGateCode = String.raw`const stage = $input.first().json;
const fail = (code) => { throw new Error('lexia_lab_delivery_rejected:' + code); };
if (stage?.schema_version !== 'lexia.workflow.test.stage.v2') fail('schema_version');
if (stage.scope?.environment !== 'isolated_test' || stage.scope?.cliente_slug !== 'empresa_sintetica_a') fail('scope');
if (stage.guard?.external_effects_allowed !== false || stage.guard?.provider_send_allowed !== false) fail('guard');
if (stage.provider_send_attempted !== false) fail('provider_send_attempted');
const actions = Array.isArray(stage.actions) ? stage.actions : [];
const seen = new Set();
const checks = [];
let previous = 0;
for (const action of actions) {
  if (!action || typeof action !== 'object') fail('action');
  if (typeof action.action_id !== 'string' || seen.has(action.action_id)) fail('action_id');
  if (!Number.isInteger(action.sequence) || action.sequence !== previous + 1) fail('action_sequence');
  if (action.captured_state?.state_version !== stage.guard.state_version || action.captured_state?.delivery_epoch !== stage.guard.delivery_epoch) fail('captured_state');
  seen.add(action.action_id);
  previous = action.sequence;
  checks.push(
    { step: 'delivery_permission_revalidated_' + action.sequence, status: 'passed' },
    { step: 'provider_send_' + action.sequence, status: 'simulated', reason: 'external_send_disabled' },
  );
}
return [{ json: {
  ...stage,
  stage: 'delivery_checked',
  provider_send_attempted: false,
  executed_workflows: [...(stage.executed_workflows || []), '06_saida_segura'],
  delivery: {
    mode: 'simulate',
    planned_actions: actions.length,
    confirmed_actions: 0,
    uncertain_actions: 0,
    automatic_retry_allowed: false,
  },
  trace: [...(stage.trace || []), ...checks, {
    step: 'uncertain_delivery_policy', status: 'passed', reason: 'reconciliation_required_before_retry'
  }],
} }];`;

const finalizeResultCode = String.raw`const stage = $input.first().json;
const fail = (code) => { throw new Error('lexia_lab_result_rejected:' + code); };
if (stage?.schema_version !== 'lexia.workflow.test.stage.v2') fail('schema_version');
if (!stage.run_id || !stage.target || stage.provider_send_attempted !== false) fail('correlation');
const output = {
  simulation_engine: 'n8n_subworkflow_lab_v2',
  executed_workflows: [...new Set(stage.executed_workflows || [])],
  external_effects: { supabase: false, redis: false, model: false, tool: false, provider: false },
};
if (stage.assistant_message) output.assistant_message = stage.assistant_message;
if (stage.context) output.context = {
  context_call_id: stage.context.context_call_id,
  config_version: stage.context.config_version,
  source_message_ids: stage.context.source_message_ids,
};
if (stage.appointment) output.appointment = stage.appointment;
if (stage.availability) output.availability = stage.availability;
if (stage.automation) output.automation = stage.automation;
if (stage.delivery) output.delivery = stage.delivery;
return [{ json: {
  schema_version: 'lexia.workflow.test.result.v1',
  run_id: stage.run_id,
  target: stage.target,
  status: 'completed',
  provider_send_attempted: false,
  summary: 'Fluxo de laboratório executado entre subworkflows reais do n8n, sem efeitos externos.',
  trace: stage.trace,
  output,
} }];`;

const agendaPrepareCode = `${strictRequestPrelude}
if (!['create_appointment','check_availability'].includes(body.target)) fail('target');
${stageFromRequest}
stage.stage = 'agenda_prepared';
stage.executed_workflows.push('03_agenda');
if (body.target === 'check_availability') {
  stage.availability = {
    operation: 'availability.check',
    status: 'simulated',
    slots: ['2026-10-15T15:00:00-03:00'],
    proves_appointment_creation: false,
  };
  stage.trace.push(
    { step: 'agenda_contract', status: 'passed' },
    { step: 'availability_tool', status: 'simulated', reason: 'calendar_tool_disabled' },
    { step: 'appointment_event', status: 'blocked', reason: 'availability_does_not_prove_creation' },
  );
} else {
  stage.appointment = {
    appointment_ref: 'test-appointment:' + body.run_id,
    status: 'confirmed',
    starts_at: '2026-10-15T15:00:00-03:00',
    ends_at: '2026-10-15T16:00:00-03:00',
    timezone: 'America/Sao_Paulo',
    tool_operation: 'appointment.create',
    reminder_allowed: true,
    cancellation_keeps_pause_until_end: true,
  };
  stage.trace.push(
    { step: 'agenda_contract', status: 'passed' },
    { step: 'appointment_create_tool', status: 'simulated', reason: 'calendar_tool_disabled' },
    { step: 'appointment_event_binding', status: 'passed' },
  );
}
return [{ json: stage }];`;

const automationPrepareCode = `${strictRequestPrelude}
if (!['followup','reminder'].includes(body.target)) fail('target');
${stageFromRequest}
stage.stage = 'automation_prepared';
stage.executed_workflows.push('04_followups_lembretes');
const kind = body.target === 'followup' ? 'followup' : 'appointment_reminder';
stage.automation = {
  request_id: 'test-automation:' + body.run_id,
  kind,
  status: 'accepted_for_gate',
  source_ref: body.target === 'reminder' ? 'test-appointment:' + body.run_id : 'test-followup:' + body.run_id,
};
stage.actions = [{
  action_id: 'test-action:' + body.run_id,
  sequence: 1,
  kind,
  captured_state: { state_version: stage.guard.state_version, delivery_epoch: stage.guard.delivery_epoch },
  content: { type: 'text', text: body.target === 'followup' ? 'Follow-up sintético.' : 'Lembrete sintético.' },
}];
stage.trace.push(
  { step: 'automation_contract', status: 'passed' },
  { step: 'automation_source_state', status: 'simulated', reason: 'isolated_fixture' },
);
return [{ json: stage }];`;

const entryResultCode = String.raw`const stage = $('Validar e registrar entrada sintética').first().json;
const result = $input.first().json;
const fail = (code) => { throw new Error('lexia_lab_entry_result_rejected:' + code); };
if (result?.schema_version !== 'lexia.workflow.test.result.v1') fail('schema_version');
if (result.run_id !== stage.run_id || result.target !== stage.target) fail('correlation');
if (result.status !== 'completed' || result.provider_send_attempted !== false) fail('status');
if (result.output?.simulation_engine !== 'n8n_subworkflow_lab_v2') fail('engine');
if (result.output?.assistant_message?.message_id !== 'n8n-test-out:' + stage.run_id) fail('assistant_message');
return [{ json: result }];`;

const gatewayValidateCode = `${strictRequestPrelude}
if (!['omnichannel','brain','followup','reminder','create_appointment','check_availability'].includes(body.target)) fail('target');
const routes = {
  omnichannel: 'entry',
  brain: 'service',
  followup: 'automation',
  reminder: 'automation',
  create_appointment: 'agenda',
  check_availability: 'agenda',
};
return [{ json: { route: routes[body.target], request: copyJson(body) } }];`;

const gatewayResultCode = String.raw`const routed = $('Validar e rotear teste isolado').first().json;
const request = routed.request;
const result = $input.first().json;
const fail = (code) => { throw new Error('workflow_test_result_rejected:' + code); };
if (result?.schema_version !== 'lexia.workflow.test.result.v1') fail('schema_version');
if (result.run_id !== request.run_id || result.target !== request.target) fail('correlation');
if (result.status !== 'completed' || result.provider_send_attempted !== false) fail('status');
if (!Array.isArray(result.trace) || result.trace.length === 0 || result.trace.length > 98) fail('trace');
if (result.output?.simulation_engine !== 'n8n_subworkflow_lab_v2') fail('engine');
return [{ json: {
  ...result,
  trace: [
    { step: 'authenticated_webhook', status: 'passed' },
    { step: 'gateway_contract', status: 'passed' },
    ...result.trace,
  ],
} }];`;

function buildEntryWorkflow() {
  const scope = "entry";
  const names = [
    "Receber solicitação do gateway",
    "Validar e registrar entrada sintética",
    "Executar Atendimento IA",
    "Validar resultado correlacionado",
  ];
  return workflow(
    workflowSpecs.entry,
    [
      note(scope, "LEIA-ME | Entrada do laboratório", [80, 80], "## 01 Entrada omnichannel\nValida o contrato sintético, fixa o escopo confiável e registra a entrada antes de chamar o atendimento. Sem HTTP, banco, Redis ou canal real."),
      trigger(scope, names[0], [220, 360]),
      code(scope, names[1], [520, 360], entryValidateCode),
      call(scope, names[2], [840, 360], workflowSpecs.service),
      code(scope, names[3], [1160, 360], entryResultCode),
    ],
    linearConnections(names),
    "Runtime sintético executável da entrada Miranda. O candidato completo permanece versionado separadamente.",
  );
}

function buildServiceWorkflow() {
  const scope = "service";
  const names = [
    "Receber entrada ou teste direto",
    "Buscar configuração e montar contexto isolado",
    "Simular cérebro privado sem tools",
    "Espelhar preparação no CRM",
    "Executar saída segura",
  ];
  return workflow(
    workflowSpecs.service,
    [
      note(scope, "LEIA-ME | Atendimento do laboratório", [80, 80], "## 02 Atendimento IA\nUsa configuração sintética por empresa, impede mistura de contexto e simula o cérebro. O cérebro e as tools reais continuam separados e desligados."),
      trigger(scope, names[0], [220, 360]),
      code(scope, names[1], [520, 360], servicePrepareCode),
      code(scope, names[2], [840, 360], serviceBrainCode),
      call(scope, names[3], [1160, 360], workflowSpecs.crm),
      call(scope, names[4], [1480, 360], workflowSpecs.delivery),
    ],
    linearConnections(names),
    "Runtime sintético executável do contexto e cérebro Miranda, sem modelo ou tool externa.",
  );
}

function buildAgendaWorkflow() {
  const scope = "agenda";
  const names = [
    "Receber teste de agenda",
    "Validar operação e simular tool",
    "Espelhar evento de agenda no CRM",
    "Finalizar resultado de agenda",
  ];
  return workflow(
    workflowSpecs.agenda,
    [
      note(scope, "LEIA-ME | Agenda do laboratório", [80, 80], "## 03 Agenda\nDistingue consulta de disponibilidade de criação de agendamento. Não chama Google Agenda e nunca fabrica confirmação a partir de disponibilidade."),
      trigger(scope, names[0], [220, 360]),
      code(scope, names[1], [520, 360], agendaPrepareCode),
      call(scope, names[2], [840, 360], workflowSpecs.crm),
      code(scope, names[3], [1160, 360], finalizeResultCode),
    ],
    linearConnections(names),
    "Runtime sintético executável da agenda Miranda, sem Google Agenda ou tool real.",
  );
}

function buildAutomationWorkflow() {
  const scope = "automation";
  const names = [
    "Receber teste de automação",
    "Validar follow-up ou lembrete",
    "Executar saída segura compartilhada",
  ];
  return workflow(
    workflowSpecs.automation,
    [
      note(scope, "LEIA-ME | Automações do laboratório", [80, 80], "## 04 Follow-ups e lembretes\nMonta uma proposta sintética e entrega ao mesmo gate de saída. Não possui Schedule Trigger e não envia por rota própria."),
      trigger(scope, names[0], [220, 360]),
      code(scope, names[1], [540, 360], automationPrepareCode),
      call(scope, names[2], [880, 360], workflowSpecs.delivery),
    ],
    linearConnections(names),
    "Runtime sintético executável de follow-ups e lembretes, sem agendador ou envio próprio.",
  );
}

function buildCrmWorkflow() {
  const scope = "crm";
  const names = ["Receber evento interno", "Validar e espelhar evento sintético"];
  return workflow(
    workflowSpecs.crm,
    [
      note(scope, "LEIA-ME | CRM do laboratório", [80, 80], "## 05 Integração CRM\nValida a origem e representa Lead, Deal e timeline. No laboratório, o próprio Frappe é quem persiste a conversa sintética; este fluxo não chama HTTP."),
      trigger(scope, names[0], [260, 360]),
      code(scope, names[1], [620, 360], crmProjectionCode),
    ],
    linearConnections(names),
    "Runtime sintético executável do espelho CRM, sem chamada HTTP ou credencial.",
  );
}

function buildDeliveryWorkflow() {
  const scope = "delivery";
  const names = [
    "Receber plano de ações",
    "Revalidar permissão antes de cada ação",
    "Espelhar resultado de entrega no CRM",
    "Finalizar resultado protegido",
  ];
  return workflow(
    workflowSpecs.delivery,
    [
      note(scope, "LEIA-ME | Saída do laboratório", [80, 80], "## 06 Saída segura\nRevalida estado antes de cada ação, preserva ordem e exige reconciliação para resultado incerto. Todo envio externo permanece bloqueado."),
      trigger(scope, names[0], [220, 360]),
      code(scope, names[1], [540, 360], deliveryGateCode),
      call(scope, names[2], [880, 360], workflowSpecs.crm),
      code(scope, names[3], [1200, 360], finalizeResultCode),
    ],
    linearConnections(names),
    "Runtime sintético executável do gate e da saída, sem provedor real.",
  );
}

export function buildLabRuntimeWorkflows() {
  return {
    entry: buildEntryWorkflow(),
    service: buildServiceWorkflow(),
    agenda: buildAgendaWorkflow(),
    automation: buildAutomationWorkflow(),
    crm: buildCrmWorkflow(),
    delivery: buildDeliveryWorkflow(),
  };
}

export function buildGatewayWorkflow(exportedGateway) {
  const scope = "gateway";
  const originalWebhook = exportedGateway?.nodes?.find(
    (item) => item.name === "Receber teste do CRM" && item.type === "n8n-nodes-base.webhook",
  );
  if (!originalWebhook || originalWebhook.parameters?.authentication !== "headerAuth") {
    throw new Error("gateway_authenticated_webhook_missing");
  }
  const webhook = clone(originalWebhook);
  webhook.position = [220, 420];

  const validateName = "Validar e rotear teste isolado";
  const routeName = "Escolher subworkflow do laboratório";
  const entryCall = "Executar 01 Entrada Omnichannel";
  const serviceCall = "Executar 02 Atendimento IA";
  const automationCall = "Executar 04 Follow-ups e Lembretes";
  const agendaCall = "Executar 03 Agenda";
  const validateResult = "Validar resultado final protegido";
  const respond = "Responder resultado ao CRM";
  const routes = ["entry", "service", "automation", "agenda"];
  const unwrapNames = {
    entry: "Preparar contrato puro para 01 Entrada",
    service: "Preparar contrato puro para 02 Atendimento",
    automation: "Preparar contrato puro para 04 Automações",
    agenda: "Preparar contrato puro para 03 Agenda",
  };

  const routeNode = rawNode(scope, routeName, "n8n-nodes-base.switch", 3.2, [840, 420], {
    rules: {
      values: routes.map((value) => ({
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [{
            id: stableId(scope, `route:${value}`),
            leftValue: "={{ $json.route }}",
            rightValue: value,
            operator: { type: "string", operation: "equals" },
          }],
          combinator: "and",
        },
        renameOutput: true,
        outputKey: value,
      })),
    },
    options: { fallbackOutput: "none" },
  });

  const nodes = [
    note(scope, "LEIA-ME | Gateway autenticado", [60, 80], "## Gateway do Agent Test\nÚnico webhook público do laboratório. Valida o contrato fechado e chama os seis subworkflows por ID. Nenhum caminho permite envio externo.", 1600),
    webhook,
    code(scope, validateName, [520, 420], gatewayValidateCode),
    routeNode,
    ...routes.map((route, index) => code(
      scope,
      unwrapNames[route],
      [1080, 140 + index * 180],
      `const input = $input.first().json;\nif (input.route !== '${route}' || !input.request || typeof input.request !== 'object' || Array.isArray(input.request)) {\n  throw new Error('workflow_test_route_envelope_invalid:${route}');\n}\nreturn [{ json: input.request }];`,
    )),
    call(scope, entryCall, [1340, 140], workflowSpecs.entry),
    call(scope, serviceCall, [1340, 320], workflowSpecs.service),
    call(scope, automationCall, [1340, 500], workflowSpecs.automation),
    call(scope, agendaCall, [1340, 680], workflowSpecs.agenda),
    code(scope, validateResult, [1640, 420], gatewayResultCode),
    rawNode(scope, respond, "n8n-nodes-base.respondToWebhook", 1.5, [1960, 420], {
      respondWith: "json",
      responseBody: "={{ $json }}",
      options: {
        responseCode: 200,
        responseHeaders: { entries: [
          { name: "Cache-Control", value: "no-store" },
          { name: "Content-Type", value: "application/json" },
        ] },
      },
    }),
  ];
  const connections = {
    [webhook.name]: { main: [[connection(validateName)]] },
    [validateName]: { main: [[connection(routeName)]] },
    [routeName]: { main: [
      [connection(unwrapNames.entry)],
      [connection(unwrapNames.service)],
      [connection(unwrapNames.automation)],
      [connection(unwrapNames.agenda)],
    ] },
    [unwrapNames.entry]: { main: [[connection(entryCall)]] },
    [unwrapNames.service]: { main: [[connection(serviceCall)]] },
    [unwrapNames.automation]: { main: [[connection(automationCall)]] },
    [unwrapNames.agenda]: { main: [[connection(agendaCall)]] },
    // Entry has two provider webhook triggers before its subworkflow trigger,
    // therefore n8n exposes the invoked branch on output index 2.
    [entryCall]: { main: [[], [], [connection(validateResult)]] },
    [serviceCall]: { main: [[connection(validateResult)]] },
    [automationCall]: { main: [[connection(validateResult)]] },
    [agendaCall]: { main: [[connection(validateResult)]] },
    [validateResult]: { main: [[connection(respond)]] },
  };
  return {
    ...clone(exportedGateway),
    id: gatewaySpec.id,
    name: gatewaySpec.name,
    description: "Gateway autenticado do Agent Test para os seis subworkflows sintéticos do laboratório.",
    active: false,
    isArchived: false,
    nodes,
    connections,
    settings: { ...(exportedGateway.settings || {}), executionOrder: "v1" },
    staticData: null,
    pinData: {},
  };
}

export function hydrateRemoteWorkflow(template, exported) {
  if (!exported || exported.id !== template.id) {
    throw new Error(`remote_workflow_identity_mismatch:${template.id}`);
  }
  return {
    ...clone(exported),
    id: template.id,
    name: template.name,
    description: template.description,
    active: false,
    isArchived: false,
    nodes: clone(template.nodes),
    connections: clone(template.connections),
    settings: { ...(exported.settings || {}), ...clone(template.settings) },
    staticData: null,
    pinData: {},
  };
}

export function assertSanitizedWorkflowPackage(label, workflows, { allowGateway = false } = {}) {
  const values = Array.isArray(workflows) ? workflows : Object.values(workflows);
  const text = JSON.stringify(values);
  if (/\$env\b/.test(text)) throw new Error(`lab_package_contains_env:${label}`);
  if (/https?:\/\//i.test(text)) throw new Error(`lab_package_contains_url:${label}`);
  if (/service_role|api[_-]?key|bearer\s+[a-z0-9]/i.test(text)) {
    throw new Error(`lab_package_contains_secret_shape:${label}`);
  }
  for (const current of values) {
    for (const item of current.nodes || []) {
      const forbidden = [
        "n8n-nodes-base.httpRequest",
        "n8n-nodes-base.scheduleTrigger",
        "n8n-nodes-base.redis",
        "n8n-nodes-base.postgres",
      ];
      if (forbidden.includes(item.type) || item.type.startsWith("@n8n/n8n-nodes-langchain.")) {
        throw new Error(`lab_package_forbidden_node:${current.name}:${item.name}:${item.type}`);
      }
      if (item.type === "n8n-nodes-base.webhook" && !allowGateway) {
        throw new Error(`lab_package_unexpected_webhook:${current.name}:${item.name}`);
      }
      if (item.credentials && !(allowGateway && item.type === "n8n-nodes-base.webhook")) {
        throw new Error(`lab_package_unexpected_credentials:${current.name}:${item.name}`);
      }
      if (item.type === "n8n-nodes-base.executeWorkflow" && item.parameters?.source !== "database") {
        throw new Error(`lab_package_non_database_subworkflow:${current.name}:${item.name}`);
      }
    }
  }
}
