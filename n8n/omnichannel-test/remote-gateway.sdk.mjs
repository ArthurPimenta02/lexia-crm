import {
  expr,
  newCredential,
  node,
  switchCase,
  trigger,
  workflow,
} from "@n8n/workflow-sdk";

// Fonte legível do gateway. O artefato implantável é gerado por
// scripts/build-miranda-v2-lab-deployment.mjs para preservar a credencial
// remota sem copiar seu valor para o repositório.
const targets = {
  entry: {
    id: "d-HaAJRDGtlnBoKX",
    name: "LEXIA HML - MIRANDA - 01 ENTRADA OMNICHANNEL",
  },
  service: {
    id: "vYKPApDzqyBUx3Xo",
    name: "LEXIA HML - MIRANDA - 02 ATENDIMENTO IA",
  },
  agenda: {
    id: "ybR0Ijc0HDRUNBsZ",
    name: "LEXIA HML - MIRANDA - 03 AGENDA",
  },
  automation: {
    id: "kh_MnrJlDH3KmyzI",
    name: "LEXIA HML - MIRANDA - 04 FOLLOW-UPS E LEMBRETES",
  },
};

const webhook = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    name: "Receber teste do CRM",
    position: [220, 420],
    parameters: {
      httpMethod: "POST",
      path: "lexia-crm-agent-test-v1",
      authentication: "headerAuth",
      responseMode: "responseNode",
      options: { allowedOrigins: "" },
    },
    credentials: {
      httpHeaderAuth: newCredential("Lexia CRM Agent Test Header Auth"),
    },
  },
});

const validateAndRoute = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Validar e rotear teste isolado",
    position: [520, 420],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: `const envelope = $input.first().json;
const body = envelope && typeof envelope === 'object' && envelope.body ? envelope.body : envelope;
const fail = (code) => { throw new Error('workflow_test_rejected:' + code); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed, code) => {
  if (!isObject(value)) fail(code);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(code + '_field_' + key);
};
const copyJson = (value) => JSON.parse(JSON.stringify(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chatConversation = /^test:SYNTH-LEXIA-TEST-CHAT-([0-9a-f-]{36})$/i;
exactKeys(body, ['schema_version','run_id','target','delivery_mode','execution_mode','tool_policy','scope','input','expectations'], 'top_level');
if (body.schema_version !== 'lexia.workflow.test.request.v1' || !uuid.test(String(body.run_id || ''))) fail('identity');
if (!['omnichannel','brain','followup','reminder','create_appointment','check_availability'].includes(body.target)) fail('target');
if (body.delivery_mode !== 'simulate') fail('delivery_mode');
if (!['safe_simulation','full_agent_virtual'].includes(body.execution_mode)) fail('execution_mode');
if (body.execution_mode === 'full_agent_virtual' && body.target !== 'omnichannel') fail('full_mode_target');
exactKeys(body.tool_policy, ['calendar'], 'tool_policy');
if (!['disabled','test_read_only','test_read_write'].includes(body.tool_policy.calendar)) fail('calendar_policy');
if (body.execution_mode === 'safe_simulation' && body.tool_policy.calendar !== 'disabled') fail('safe_simulation_calendar');
exactKeys(body.scope, ['environment','cliente_slug','channel','account_ref','conversation_ref'], 'scope');
if (body.scope.environment !== 'isolated_test' || body.scope.cliente_slug !== 'empresa_sintetica_a') fail('scope_owner');
if (!['whatsapp','instagram','messenger'].includes(body.scope.channel) || !uuid.test(String(body.scope.account_ref || ''))) fail('scope');
const chatMatch = chatConversation.exec(String(body.scope.conversation_ref || ''));
if (body.scope.conversation_ref !== 'test:' + body.run_id && !(chatMatch && uuid.test(chatMatch[1]))) fail('conversation_ref');
exactKeys(body.input, ['message_id','type','text'], 'input');
if (body.input.message_id !== 'test-message:' + body.run_id || body.input.type !== 'text') fail('message');
if (typeof body.input.text !== 'string' || !body.input.text.trim() || body.input.text.length > 4000) fail('message_text');
exactKeys(body.expectations, ['provider_send','persist_synthetic_events','return_trace'], 'expectations');
if (body.expectations.provider_send !== false || body.expectations.persist_synthetic_events !== true || body.expectations.return_trace !== true) fail('expectations');
const routes = {
  omnichannel: 'entry', brain: 'service', followup: 'automation', reminder: 'automation',
  create_appointment: 'agenda', check_availability: 'agenda',
};
return [{ json: { route: routes[body.target], request: copyJson(body) } }];`,
    },
  },
});

const route = switchCase({
  version: 3.2,
  config: {
    name: "Escolher subworkflow do laboratório",
    position: [840, 420],
    parameters: {
      rules: {
        values: ["entry", "service", "automation", "agenda"].map((value) => ({
          conditions: {
            options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
            conditions: [{
              leftValue: expr("{{ $json.route }}"),
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
    },
  },
});

function call(name, target, position) {
  return node({
    type: "n8n-nodes-base.executeWorkflow",
    version: 1.1,
    config: {
      name,
      position,
      parameters: {
        source: "database",
        workflowId: {
          __rl: true,
          mode: "list",
          value: target.id,
          cachedResultName: target.name,
        },
        options: { waitForSubWorkflow: true },
      },
    },
  });
}

function unwrap(name, expectedRoute, position) {
  return node({
    type: "n8n-nodes-base.code",
    version: 2,
    config: {
      name,
      position,
      parameters: {
        mode: "runOnceForAllItems",
        language: "javaScript",
        jsCode: `const input = $input.first().json;
if (input.route !== '${expectedRoute}' || !input.request || typeof input.request !== 'object' || Array.isArray(input.request)) {
  throw new Error('workflow_test_route_envelope_invalid:${expectedRoute}');
}
return [{ json: input.request }];`,
      },
    },
  });
}

const unwrapEntry = unwrap("Preparar contrato puro para 01 Entrada", "entry", [1080, 140]);
const unwrapService = unwrap("Preparar contrato puro para 02 Atendimento", "service", [1080, 320]);
const unwrapAutomation = unwrap("Preparar contrato puro para 04 Automações", "automation", [1080, 500]);
const unwrapAgenda = unwrap("Preparar contrato puro para 03 Agenda", "agenda", [1080, 680]);
const executeEntry = call("Executar 01 Entrada Omnichannel", targets.entry, [1340, 140]);
const executeService = call("Executar 02 Atendimento IA", targets.service, [1340, 320]);
const executeAutomation = call("Executar 04 Follow-ups e Lembretes", targets.automation, [1340, 500]);
const executeAgenda = call("Executar 03 Agenda", targets.agenda, [1340, 680]);

const validateResult = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Validar resultado final protegido",
    position: [1640, 420],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: `const request = $('Validar e rotear teste isolado').first().json.request;
const result = $input.first().json;
const fail = (code) => { throw new Error('workflow_test_result_rejected:' + code); };
if (result?.schema_version !== 'lexia.workflow.test.result.v1') fail('schema_version');
if (result.run_id !== request.run_id || result.target !== request.target) fail('correlation');
if (result.provider_send_attempted !== false) fail('provider_send_attempted');
if (!['completed','blocked'].includes(result.status)) fail('status');
if (!Array.isArray(result.trace) || !result.trace.length || result.trace.length > 98) fail('trace');
if (request.execution_mode === 'full_agent_virtual') {
  if (result.output?.simulation_engine !== 'n8n_full_agent_virtual_v1') fail('engine');
  if (result.status === 'blocked' && result.error_code !== 'response_language_mismatch') fail('blocked_reason');
  if (result.status === 'completed' && result.output?.language_policy_status !== 'passed') fail('language_policy');
} else {
  if (result.status !== 'completed') fail('safe_status');
  const safeEngines = ['n8n_candidate_chain_v1','n8n_subworkflow_lab_v2'];
  if (!safeEngines.includes(result.output?.simulation_engine)) fail('engine');
}
return [{ json: {
  ...result,
  trace: [
    { step: 'authenticated_webhook', status: 'passed' },
    { step: 'gateway_contract', status: 'passed' },
    ...result.trace,
  ],
} }];`,
    },
  },
});

const respond = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    name: "Responder resultado ao CRM",
    position: [1960, 420],
    parameters: {
      respondWith: "json",
      responseBody: expr("{{ $json }}"),
      options: {
        responseCode: 200,
        responseHeaders: { entries: [
          { name: "Cache-Control", value: "no-store" },
          { name: "Content-Type", value: "application/json" },
        ] },
      },
    },
  },
});

export default workflow(
  "lexia-crm-agent-test-gateway-v2",
  "LEXIA LAB - MIRANDA - GATEWAY TESTE CRM",
)
  .add(webhook)
  .to(validateAndRoute)
  .to(
    route
      // Entry contains provider webhooks plus the subworkflow trigger. n8n returns
      // the invoked subworkflow branch on output 2 of Execute Workflow.
      .onCase(0, unwrapEntry.to(executeEntry.output(2).to(validateResult.to(respond))))
      .onCase(1, unwrapService.to(executeService.to(validateResult)))
      .onCase(2, unwrapAutomation.to(executeAutomation.to(validateResult)))
      .onCase(3, unwrapAgenda.to(executeAgenda.to(validateResult))),
  );
