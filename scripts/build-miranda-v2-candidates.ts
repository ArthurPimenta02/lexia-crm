import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import {
  scanPackage,
  type N8nWorkflow as SourceWorkflow,
} from "./build-miranda-v2-review-package";
import {
  CANDIDATE_PREFIX,
  appendClone,
  cloneNode,
  code,
  copyConnections,
  ifNode,
  removeConnection,
  redisProjection,
  responseBody,
  rest,
  rpc,
  subworkflow,
  switchNode,
  trigger,
  uuidExpression,
  workflow,
  type CandidateWorkflow,
} from "./lib/miranda-v2-builder";
import { consolidateMirandaWorkflows } from "./lib/miranda-v2-consolidator";

type SourceSet = {
  omnichannel: SourceWorkflow;
  brain: SourceWorkflow;
  followup: SourceWorkflow;
  reminder: SourceWorkflow;
  createAppointment: SourceWorkflow;
  availability: SourceWorkflow;
};

const OUTPUT_DIR = "n8n/miranda-v2-candidate";

function findJsonFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory() && entry !== "__MACOSX") files.push(...findJsonFiles(path));
    if (stat.isFile() && entry.endsWith(".json") && !entry.startsWith("._")) files.push(path);
  }
  return files;
}

function resolveSource(source: string) {
  const absolute = resolve(source);
  if (!existsSync(absolute)) throw new Error(`Source does not exist: ${absolute}`);
  if (statSync(absolute).isDirectory()) return absolute;
  if (!absolute.toLowerCase().endsWith(".zip")) throw new Error("Source must be a directory or ZIP.");
  const temporary = mkdtempSync(join(tmpdir(), "lexia-miranda-v2-source-"));
  execFileSync("unzip", ["-q", absolute, "-d", temporary], { stdio: "ignore" });
  return temporary;
}

function loadSources(root: string): SourceSet {
  const values = findJsonFiles(root).map((path) =>
    JSON.parse(readFileSync(path, "utf8")) as SourceWorkflow,
  );
  const one = (predicate: (value: SourceWorkflow) => boolean, label: string) => {
    const matches = values.filter(predicate);
    if (matches.length !== 1) throw new Error(`Expected one ${label}; found ${matches.length}.`);
    return matches[0]!;
  };
  return {
    omnichannel: one(
      (value) => value.name.includes("MIRANDA SKIN EXPERT") && value.name.includes("OMNICHANNEL"),
      "Miranda omnichannel workflow",
    ),
    brain: one(
      (value) => value.name.includes("Cérebro") && value.name.includes("MIRANDA"),
      "Miranda brain workflow",
    ),
    followup: one(
      (value) => value.name.includes("FOLLOW-UP") && value.name.includes("MIRANDA"),
      "Miranda follow-up workflow",
    ),
    reminder: one(
      (value) => value.name.includes("LEMBRETES") && value.name.includes("MIRANDA"),
      "Miranda reminder workflow",
    ),
    createAppointment: one(
      (value) => value.name.trim() === "criar_agendamento",
      "appointment tool",
    ),
    availability: one(
      (value) => value.name.trim() === "verificar_disponibilidade",
      "availability tool",
    ),
  };
}

function buildCrmSync() {
  const w = workflow("07 CRM SYNC V2");
  const receive = trigger(w);
  const validate = code(w, "Validar eventos CRM", `
const input = $input.first().json;
if (!Array.isArray(input.events) || input.events.length === 0 || input.events.length > 50) throw new Error('crm_events_invalid');
const events = [...input.events].sort((a, b) => Number(a.sequence) - Number(b.sequence));
for (let index = 0; index < events.length; index++) {
  const event = events[index];
  if (event?.schema_version !== 'lexia.crm.event.v1') throw new Error('crm_event_contract_invalid');
  if (index > 0 && Number(event.sequence) <= Number(events[index - 1].sequence)) throw new Error('crm_event_sequence_invalid');
}
return events.map((event) => ({ json: { event, passthrough: input.passthrough || {} } }));`);
  const loop = w.add("Espelhar em ordem", "n8n-nodes-base.splitInBatches", 3, {
    batchSize: 1,
    options: {},
  });
  const send = w.add(
    "Enviar evento autenticado ao Frappe",
    "n8n-nodes-base.httpRequest",
    4.2,
    {
      method: "POST",
      url: "={{ $env.LEXIA_FRAPPE_CRM_URL + '/api/method/lexia_crm.api.ingest_event' }}",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ { event: $json.event } }}",
      options: {
        response: {
          response: {
            fullResponse: true,
            neverError: true,
            responseFormat: "json",
          },
        },
        timeout: 12000,
      },
    },
    { retryOnFail: false, onError: "stopWorkflow" },
  );
  const requireApplied = code(w, "Exigir confirmação do espelho", `
const response = $input.first().json;
const status = Number(response.statusCode || 0);
const body = response.body?.message || response.body || {};
if (status < 200 || status >= 300) throw new Error('crm_mirror_http_failed');
if (!['applied','duplicate'].includes(body.status)) throw new Error('crm_mirror_not_applied');
return [{ json: { mirrored: true } }];`);
  const done = code(w, "Espelho CRM concluído", `
const input = $('Validar eventos CRM').first().json;
return [{ json: { crm_mirrored: true, passthrough: input.passthrough || {} } }];`);
  w.connect(receive, validate);
  w.connect(validate, loop);
  w.connect(loop, done, 0);
  w.connect(loop, send, 1);
  w.connect(send, requireApplied);
  w.connect(requireApplied, loop);
  return w.done();
}

function buildProviderSend() {
  const w = workflow("08 PROVIDER SEND ÚNICO V2");
  const receive = trigger(w);
  const validate = code(w, "Validar autorização de envio", `
const input = $input.first().json;
if (!input.action?.action_id || !input.claimant || !Number.isInteger(Number(input.fencing_token))) throw new Error('provider_claim_required');
if (input.delivery_mode !== 'deliver') throw new Error('provider_delivery_mode_denied');
if (!['whatsapp','instagram','messenger'].includes(input.action.scope?.channel)) throw new Error('provider_channel_invalid');
if (!['text','image','audio'].includes(input.action.content?.type)) throw new Error('provider_content_invalid');
return [{ json: input }];`);
  const route = switchNode(w, "Rotear provedor", "$json.action.scope.channel", [
    "whatsapp",
    "instagram",
    "messenger",
  ]);
  const request = (name: string, url: string) =>
    w.add(
      name,
      "n8n-nodes-base.httpRequest",
      4.2,
      {
        method: "POST",
        url,
        authentication: "genericCredentialType",
        genericAuthType: "httpCustomAuth",
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ { action_id: $json.action.action_id, conversation_ref: $json.action.scope.conversation_ref, content: $json.action.content } }}",
        options: {
          response: {
            response: {
              fullResponse: true,
              neverError: true,
              responseFormat: "json",
            },
          },
          timeout: 12000,
        },
      },
      { retryOnFail: false, onError: "continueErrorOutput" },
    );
  const zapi = request("Enviar Z-API", "={{ $env.LEXIA_ZAPI_SEND_URL }}");
  const meta = request("Enviar Meta", "={{ $env.LEXIA_META_SEND_URL }}");
  const normalize = code(w, "Classificar resultado sem retry cego", `
const response = $input.first().json || {};
const statusCode = Number(response.statusCode || 0);
const body = response.body || response;
const providerId = String(body.message_id || body.messageId || body.id || '').trim();
if (statusCode >= 200 && statusCode < 300 && providerId) return [{ json: { status: 'sent', provider_message_id: providerId } }];
if ([400,401,403,404,409,422].includes(statusCode)) return [{ json: { status: 'failed', reason: 'provider_rejected_' + statusCode } }];
return [{ json: { status: 'delivery_unknown', reason: 'provider_result_ambiguous', automatic_retry_allowed: false } }];`);
  const transportError = code(w, "Tratar exceção como resultado incerto", `
return [{ json: { status: 'delivery_unknown', reason: 'provider_transport_exception', automatic_retry_allowed: false } }];`);
  w.connect(receive, validate);
  w.connect(validate, route);
  w.connect(route, zapi, 0);
  w.connect(route, meta, 1);
  w.connect(route, meta, 2);
  w.connect(zapi, normalize, 0);
  w.connect(zapi, transportError, 1);
  w.connect(meta, normalize, 0);
  w.connect(meta, transportError, 1);
  return w.done();
}

function buildIngress() {
  const w = workflow("01 INGRESSO DURÁVEL V2");
  const receive = trigger(w);
  const validate = code(w, "Validar envelope do adaptador", `
const input = $input.first().json;
const event = input.event;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!uuid.test(String(input.trusted_account_id || ''))) throw new Error('trusted_account_required');
if (event?.schema_version !== 'lexia.ingress.event.v1' || event.event_type !== 'message') throw new Error('ingress_contract_invalid');
if (!uuid.test(String(event.event_id || '')) || !uuid.test(String(event.correlation_id || ''))) throw new Error('ingress_ids_invalid');
if (!event.message || !['lead','human_agent'].includes(event.message.author)) throw new Error('ingress_author_invalid');
if (!['meta','zapi','fake'].includes(event.provider)) throw new Error('ingress_provider_invalid');
return [{ json: { trusted_account_id: input.trusted_account_id, event, echo_candidate: input.echo_candidate === true, trusted_media_download_url: input.trusted_media_download_url || null, delivery_mode: input.delivery_mode || 'observe_only' } }];`);
  const account = rest(
    w,
    "Carregar conta confiável",
    "'/rest/v1/lexia_channel_accounts?id=eq.' + encodeURIComponent($json.trusted_account_id) + '&select=id,environment,cliente_slug,channel,provider,status,delivery_owner,delivery_mode'",
  );
  const bind = code(w, "Vincular escopo à integração", `
const prepared = $('Validar envelope do adaptador').first().json;
const rows = ${responseBody("Carregar conta confiável")};
if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== 'active') throw new Error('trusted_account_unavailable');
const account = rows[0];
if (prepared.event.provider !== account.provider && prepared.event.provider !== 'fake') throw new Error('provider_account_mismatch');
const event = JSON.parse(JSON.stringify(prepared.event));
const conversationRef = String(event.scope?.conversation_ref || '').slice(0, 256);
if (!conversationRef) throw new Error('conversation_ref_required');
event.scope = { environment: account.environment, cliente_slug: account.cliente_slug, channel: account.channel, account_ref: account.id, conversation_ref: conversationRef };
event.message.scope = event.scope;
return [{ json: { ...prepared, event, account, rpc_body: { p_account_id: account.id, p_conversation_ref: conversationRef, p_identificador_conversa: conversationRef } } }];`);
  const resolveConversation = rpc(w, "Resolver conversa central", "lexia_omni_resolve_conversation");
  const prepareEcho = code(w, "Preparar verificação de eco", `
const input = $('Vincular escopo à integração').first().json;
const value = ${responseBody("Resolver conversa central")};
const conversationId = typeof value === 'string' ? value.replace(/^\"|\"$/g, '') : value;
if (!conversationId) throw new Error('conversation_not_resolved');
return [{ json: { ...input, conversation_id: conversationId } }];`);
  const knownAction = rest(
    w,
    "Procurar ação de saída pelo ID do provedor",
    "'/rest/v1/lexia_outbound_actions?conversation_id=eq.' + encodeURIComponent($json.conversation_id) + '&provider_message_id=eq.' + encodeURIComponent($json.event.provider_event_id) + '&status=in.(sent,delivery_unknown)&select=id,status&limit=2'",
  );
  const classify = code(w, "Classificar eco ou intervenção humana", `
const input = $('Preparar verificação de eco').first().json;
const rows = ${responseBody("Procurar ação de saída pelo ID do provedor")};
if (!Array.isArray(rows)) throw new Error('echo_lookup_invalid');
if (input.echo_candidate && rows.length > 1) throw new Error('provider_message_id_not_unique');
const automaticEcho = input.echo_candidate && rows.length === 1;
if (input.echo_candidate && !automaticEcho) input.event.message.author = 'human_agent';
return [{ json: { ...input, automatic_echo: automaticEcho, matched_action_id: automaticEcho ? rows[0].id : null, rpc_body: {
  p_account_id: input.account.id, p_provider_event_id: input.event.provider_event_id,
  p_event_type: input.event.event_type, p_occurred_at: input.event.occurred_at,
  p_conversation_id: input.conversation_id,
} } }];`);
  const registerIngress = rpc(w, "Deduplicar evento antes de efeitos", "lexia_omni_register_ingress");
  const evaluate = code(w, "Avaliar deduplicação e eco", `
const input = $('Classificar eco ou intervenção humana').first().json;
const rows = ${responseBody("Deduplicar evento antes de efeitos")};
const result = Array.isArray(rows) ? rows[0] : rows;
if (!result) throw new Error('ingress_result_missing');
const route = result.out_duplicate === true ? 'duplicate' : input.automatic_echo ? 'automatic_echo' : 'persist';
return [{ json: { ...input, route } }];`);
  const route = switchNode(w, "Rotear evento identificado", "$json.route", [
    "persist",
    "automatic_echo",
    "duplicate",
  ]);
  const prepareMessage = code(w, "Preparar mensagem canônica", `
const input = $input.first().json;
const message = input.event.message;
return [{ json: { ...input, rpc_body: {
  p_conversation_id: input.conversation_id, p_author: message.author,
  p_provider_message_id: message.message_id, p_provider_timestamp: message.occurred_at,
  p_tipo: message.media?.kind || 'text', p_conteudo: message.text || message.media?.caption || null,
  p_media_kind: message.media?.kind || 'text', p_media_processing_status: message.media?.processing_status || 'completed', p_action_id: null,
} } }];`);
  const record = rpc(w, "Persistir mensagem antes de pausa buffer ou mídia", "lexia_omni_record_message");
  const prepareState = code(w, "Preparar mutação de estado", `
const input = $('Preparar mensagem canônica').first().json;
const rows = ${responseBody("Persistir mensagem antes de pausa buffer ou mídia")};
const result = Array.isArray(rows) ? rows[0] : rows;
if (!result?.out_mensagem_id) throw new Error('message_not_persisted');
const author = input.event.message.author;
return [{ json: { ...input, mensagem_id: result.out_mensagem_id,
  rpc_name: author === 'human_agent' ? 'lexia_omni_record_human_intervention' : 'lexia_omni_record_lead_message',
  rpc_body: author === 'human_agent' ? {
    p_conversation_id: input.conversation_id, p_command_id: 'human:' + input.event.provider_event_id,
    p_mensagem_id: result.out_mensagem_id, p_occurred_at: input.event.occurred_at,
  } : {
    p_conversation_id: input.conversation_id, p_command_id: 'lead:' + input.event.provider_event_id,
    p_mensagem_id: result.out_mensagem_id, p_occurred_at: input.event.occurred_at,
  },
} }];`);
  const mutate = rpc(w, "Aplicar pausa ou buffer atomicamente");
  const prepareStateProjection = code(w, "Preparar projeção Redis do estado", `
const input = $('Preparar mutação de estado').first().json;
const stateRows = ${responseBody("Aplicar pausa ou buffer atomicamente")};
const state = Array.isArray(stateRows) ? stateRows[0] : stateRows;
if (!state || !input.conversation_id) throw new Error('state_projection_input_missing');
const scope = input.event.scope;
const key = ['lexia','omni','v2',scope.environment,scope.cliente_slug,scope.channel,scope.account_ref,'{' + input.conversation_id + '}','state'].join(':');
return [{ json: { ...input, state_result: state, redis_projection_key: key,
  redis_projection_value: JSON.stringify({ schema_version: 'lexia.redis.state.v1', projected_at: new Date().toISOString(),
    conversation_id: input.conversation_id, state }) } }];`);
  const projectState = redisProjection(
    w,
    "Projetar estado no Redis compartilhado",
    "$json.redis_projection_key",
    "$json.redis_projection_value",
    604800,
  );
  const buildEvents = code(w, "Montar espelho CRM após persistência", `
const input = $('Preparar mutação de estado').first().json;
const stateRows = ${responseBody("Aplicar pausa ou buffer atomicamente")};
const state = Array.isArray(stateRows) ? stateRows[0] : stateRows;
const message = input.event.message;
const scope = input.event.scope;
const makeUuid = (seed) => ${uuidExpression("seed")};
const sourceProvider = { system: 'provider', authority: 'provider_event', workflow_ref: 'miranda-v2-ingress', execution_ref: $execution.id, provider_ref: input.event.provider };
const base = (eventType, sequence, payload, source = sourceProvider) => ({
  schema_version: 'lexia.crm.event.v1', event_id: makeUuid(input.event.event_id + ':' + eventType),
  idempotency_key: input.event.provider_event_id + ':' + eventType, correlation_id: input.event.correlation_id,
  causation_id: input.event.event_id, event_type: eventType, occurred_at: input.event.occurred_at,
  emitted_at: new Date().toISOString(), sequence, scope, source, payload,
});
const contactRef = input.event.contact?.provider_contact_ref || scope.conversation_ref;
const displayName = input.event.contact?.display_name || 'Contato sem nome';
const events = [
  base('contact.upserted', 10, { contact_ref: contactRef, display_name: displayName, ...(input.event.contact?.phone ? { phone: input.event.contact.phone } : {}) }),
  base('conversation.opened', 20, { contact_ref: contactRef, display_name: displayName, resume_mode: 'await_new_message' }),
  base('message.recorded', 30, { message_id: message.message_id, provider_message_ref: message.message_id,
    direction: message.direction, author: message.author, message_type: message.media?.kind || 'text', delivery_status: 'received',
    ...(message.text ? { text: message.text } : {}), ...(message.media?.caption ? { caption: message.media.caption } : {}),
    ...(message.media?.provider_media_ref ? { media_ref: message.media.provider_media_ref } : {}),
    transcription_status: message.media?.kind === 'audio' ? 'pending' : 'not_applicable' }),
];
if (message.ad_origin) events.push(base('attribution.captured', 40, {
  source_type: message.ad_origin.source_type || 'unknown', captured_at: input.event.occurred_at,
  ...(message.ad_origin.campaign_ref ? { campaign_ref: message.ad_origin.campaign_ref } : {}),
  ...(message.ad_origin.adset_ref ? { adset_ref: message.ad_origin.adset_ref } : {}),
  ...(message.ad_origin.ad_ref ? { ad_ref: message.ad_origin.ad_ref } : {}),
  ...(message.ad_origin.fbclid ? { fbclid: message.ad_origin.fbclid } : {}),
}));
if (message.author === 'human_agent') events.push(base('block.upserted', 50, {
  block_id: 'human_intervention', block_type: 'human_intervention', source_ref: message.message_id,
  reason: 'human_message', starts_at: input.event.occurred_at, ...(state?.out_expires_at ? { expires_at: state.out_expires_at } : {}),
  effects: { replies: true, followups: true, reminders: true },
}, { system: 'workflow', authority: 'workflow_execution', workflow_ref: 'miranda-v2-ingress', execution_ref: $execution.id }));
return [{ json: { events, passthrough: { ...input, route: message.author === 'human_agent' ? 'human_intervention' : (state?.out_disposition === 'pending' ? 'pending' : 'process'), lead_seq: state?.out_lead_seq || null, state_result: state } } }];`);
  const sync = subworkflow(w, "Criar Lead Deal timeline no CRM", "07 CRM SYNC V2");
  const finish = code(w, "Retornar ingresso persistido", `
const input = $input.first().json;
if (input.crm_mirrored !== true) throw new Error('crm_mirror_required');
return [{ json: input.passthrough }];`);
  const echoResult = code(w, "Ignorar eco automático já registrado", `
const input = $input.first().json;
return [{ json: { ...input, route: 'automatic_echo', duplicate: true, provider_send_attempted: false } }];`);
  const duplicateResult = code(w, "Retornar evento duplicado", `
const input = $input.first().json;
return [{ json: { ...input, route: 'duplicate', duplicate: true, provider_send_attempted: false } }];`);

  w.connect(receive, validate);
  w.connect(validate, account);
  w.connect(account, bind);
  w.connect(bind, resolveConversation);
  w.connect(resolveConversation, prepareEcho);
  w.connect(prepareEcho, knownAction);
  w.connect(knownAction, classify);
  w.connect(classify, registerIngress);
  w.connect(registerIngress, evaluate);
  w.connect(evaluate, route);
  w.connect(route, prepareMessage, 0);
  w.connect(route, echoResult, 1);
  w.connect(route, duplicateResult, 2);
  w.connect(route, duplicateResult, 3);
  w.connect(prepareMessage, record);
  w.connect(record, prepareState);
  w.connect(prepareState, mutate);
  w.connect(mutate, prepareStateProjection);
  w.connect(prepareStateProjection, projectState);
  w.connect(projectState, buildEvents);
  w.connect(buildEvents, sync);
  w.connect(sync, finish);
  return w.done();
}

function buildMedia(sources: SourceSet) {
  const w = workflow("02 MÍDIA APÓS BLOQUEIO V2");
  const receive = trigger(w);
  const validate = code(w, "Validar mídia de mensagem persistida", `
const input = $input.first().json;
if (!input.mensagem_id || !input.event?.message) throw new Error('persisted_message_required');
const media = input.event.message.media || { kind: 'text', processing_status: 'completed' };
const kind = media.kind || 'text';
if (!['text','audio','image','pdf','video'].includes(kind)) throw new Error('media_kind_not_supported');
if (kind !== 'text') {
  const rawUrl = String(input.trusted_media_download_url || '');
  const allowed = String($env.LEXIA_MEDIA_ALLOWED_HOSTS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  let parsed;
  try { parsed = new URL(rawUrl); } catch (_) { throw new Error('trusted_media_url_invalid'); }
  if (parsed.protocol !== 'https:' || !allowed.includes(parsed.hostname.toLowerCase())) throw new Error('trusted_media_host_denied');
}
return [{ json: { ...input, media_kind: kind } }];`);
  const isText = ifNode(w, "É texto?", "$json.media_kind === 'text'");
  const text = code(w, "Texto não exige processamento", `
const input = $('Validar mídia de mensagem persistida').first().json;
return [{ json: { ...input, media_result: { status: 'completed', content: input.event.message.text || '' } } }];`);
  const download = w.add(
    "Baixar mídia por URL confiável",
    "n8n-nodes-base.httpRequest",
    4.2,
    {
      method: "GET",
      url: "={{ $json.trusted_media_download_url }}",
      authentication: "genericCredentialType",
      genericAuthType: "httpCustomAuth",
      options: {
        response: { response: { responseFormat: "file", outputPropertyName: "data" } },
        timeout: 20000,
      },
    },
    { retryOnFail: false, onError: "continueErrorOutput" },
  );
  const kind = switchNode(w, "Rotear processamento de mídia", "$('Validar mídia de mensagem persistida').first().json.media_kind", [
    "audio",
    "image",
    "pdf",
    "video",
  ]);
  const audio = appendClone(w, sources.omnichannel, "Transcribe a recording", "Transcrever áudio");
  const image = appendClone(w, sources.omnichannel, "Analyze image", "Analisar imagem");
  const pdf = appendClone(w, sources.omnichannel, "Extract from File", "Extrair PDF");
  const video = appendClone(w, sources.omnichannel, "Analyze video", "Analisar vídeo");
  for (const name of [audio, image, pdf, video]) {
    w.node(name).retryOnFail = false;
    w.node(name).onError = "continueErrorOutput";
  }
  const success = code(w, "Normalizar mídia processada", `
const input = $('Validar mídia de mensagem persistida').first().json;
const output = $input.first().json || {};
const content = String(output.text || output.output || output.content || output.data || '').slice(0, 20000);
return [{ json: { ...input, media_result: content ? { status: 'completed', content } : { status: 'failed', reason: 'empty_media_result' } } }];`);
  const failure = code(w, "Preservar mensagem em falha de mídia", `
const input = $('Validar mídia de mensagem persistida').first().json;
return [{ json: { ...input, media_result: { status: 'failed', reason: 'media_processing_failed' } } }];`);
  const updateInput = code(w, "Preparar atualização sem tocar na pausa", `
const input = $input.first().json;
return [{ json: { ...input, rpc_body: { p_mensagem_id: input.mensagem_id, p_media_processing_status: input.media_result.status, p_media_error_code: input.media_result.reason || null } } }];`);
  const update = rpc(w, "Atualizar somente estado da mídia", "lexia_omni_update_media_status");
  const crm = code(w, "Espelhar enriquecimento da mensagem", `
const input = $('Preparar atualização sem tocar na pausa').first().json;
const kindMap = { audio: 'transcription', image: 'image_analysis', pdf: 'pdf_text', video: 'video_analysis' };
if (input.media_kind === 'text') return [{ json: { events: [], passthrough: input, skip_crm: true } }];
const event = {
  schema_version: 'lexia.crm.event.v1', event_id: ${uuidExpression("input.event.message.message_id + ':enrichment:' + input.media_result.status")},
  idempotency_key: input.event.message.message_id + ':enrichment:' + input.media_result.status,
  correlation_id: input.event.correlation_id, event_type: 'message.enrichment.updated',
  occurred_at: new Date().toISOString(), emitted_at: new Date().toISOString(), sequence: 60,
  scope: input.event.scope,
  source: { system: 'workflow', authority: 'workflow_execution', workflow_ref: 'miranda-v2-media', execution_ref: $execution.id },
  payload: { message_id: input.event.message.message_id, enrichment_kind: kindMap[input.media_kind], status: input.media_result.status,
    attempted_at: new Date().toISOString(), ...(input.media_result.content ? { content: input.media_result.content } : {}),
    ...(input.event.message.media?.provider_media_ref ? { media_ref: input.event.message.media.provider_media_ref } : {}),
    ...(input.media_result.reason ? { reason: input.media_result.reason } : {}) },
};
return [{ json: { events: [event], passthrough: input, skip_crm: false } }];`);
  const needsCrm = ifNode(w, "Enriquecimento precisa de espelho?", "$json.skip_crm !== true");
  const sync = subworkflow(w, "Espelhar enriquecimento no CRM", "07 CRM SYNC V2");
  const finish = code(w, "Retornar resultado da mídia", `
const input = $input.first().json;
const passthrough = input.passthrough || input;
if (input.skip_crm !== true && input.crm_mirrored !== true) throw new Error('crm_media_not_mirrored');
return [{ json: passthrough }];`);

  w.connect(receive, validate);
  w.connect(validate, isText);
  w.connect(isText, text, 0);
  w.connect(isText, download, 1);
  w.connect(download, kind, 0);
  w.connect(download, failure, 1);
  w.connect(kind, audio, 0);
  w.connect(kind, image, 1);
  w.connect(kind, pdf, 2);
  w.connect(kind, video, 3);
  w.connect(kind, failure, 4);
  for (const name of [audio, image, pdf, video]) {
    w.connect(name, success, 0);
    w.connect(name, failure, 1);
  }
  w.connect(text, updateInput);
  w.connect(success, updateInput);
  w.connect(failure, updateInput);
  w.connect(updateInput, update);
  w.connect(update, crm);
  w.connect(crm, needsCrm);
  w.connect(needsCrm, sync, 0);
  w.connect(needsCrm, finish, 1);
  w.connect(sync, finish);
  return w.done();
}

function buildDeliveryGate() {
  const w = workflow("06 DELIVERY GATE V2");
  const receive = trigger(w);
  const validate = code(w, "Validar plano ordenado", `
const input = $input.first().json;
if (!input.conversation_id || !input.invocation_id || !input.correlation_id || !Array.isArray(input.actions) || input.actions.length === 0) throw new Error('delivery_plan_invalid');
const actions = [...input.actions].sort((a, b) => Number(a.sequence) - Number(b.sequence));
const scope = JSON.stringify(actions[0].scope);
for (let index = 0; index < actions.length; index++) {
  const action = actions[index];
  if (action.schema_version !== 'lexia.outbound.action.v1' || action.invocation_id !== input.invocation_id) throw new Error('delivery_action_contract_invalid');
  if (action.sequence !== index + 1 || JSON.stringify(action.scope) !== scope) throw new Error('delivery_action_order_or_scope_invalid');
  if (!['text','image','audio'].includes(action.content?.type)) throw new Error('delivery_content_invalid');
}
return [{ json: { ...input, actions, claimant: input.claimant || ('n8n:' + $execution.id), rpc_body: {
  p_conversation_id: input.conversation_id, p_invocation_id: input.invocation_id,
  p_lead_cutoff_seq: input.lead_cutoff_seq ?? null, p_automation_request_id: input.automation_request_id ?? null,
  p_actions: actions,
} } }];`);
  const prepare = rpc(w, "Persistir plano antes do envio", "lexia_omni_prepare_outbound_actions");
  const split = code(w, "Separar ações sem perder o plano", `
const plan = $('Validar plano ordenado').first().json;
const prepared = Number(${responseBody("Persistir plano antes do envio")});
if (prepared !== plan.actions.length) throw new Error('delivery_prepare_count_mismatch');
return plan.actions.map((action) => ({ json: { action, plan } }));`);
  const loop = w.add("Enviar uma ação por vez", "n8n-nodes-base.splitInBatches", 3, {
    batchSize: 1,
    options: {},
  });
  const claimInput = code(w, "Preparar claim individual", `
const input = $input.first().json;
return [{ json: { ...input, rpc_body: { p_action_id: input.action.action_id, p_claimant: input.plan.claimant } } }];`);
  const claim = rpc(w, "Revalidar permissão imediatamente antes do envio", "lexia_omni_claim_outbound_action");
  const evaluate = code(w, "Avaliar gate atual", `
const input = $('Preparar claim individual').item.json;
const rows = ${responseBody("Revalidar permissão imediatamente antes do envio")};
const result = Array.isArray(rows) ? rows[0] : rows;
if (!result) throw new Error('delivery_claim_missing');
return [{ json: { ...input, claim: result, authorized: result.out_acquired === true } }];`);
  const authorized = ifNode(w, "Ação ainda autorizada?", "$json.authorized === true");
  const messageInput = code(w, "Registrar mensagem em preparação", `
const input = $input.first().json;
const action = input.action;
return [{ json: { ...input, rpc_body: {
  p_conversation_id: input.plan.conversation_id, p_author: 'ai', p_provider_message_id: 'prepared:' + action.action_id,
  p_provider_timestamp: new Date().toISOString(), p_tipo: action.content.type,
  p_conteudo: action.content.type === 'text' ? action.content.text : (action.content.caption || null),
  p_media_kind: action.content.type, p_media_processing_status: 'completed', p_action_id: action.action_id,
} } }];`);
  const record = rpc(w, "Persistir mensagem de saída preparada", "lexia_omni_record_message");
  const preparingEvent = code(w, "Espelhar ação preparada no CRM", `
const input = $('Registrar mensagem em preparação').item.json;
const rows = ${responseBody("Persistir mensagem de saída preparada")};
const result = Array.isArray(rows) ? rows[0] : rows;
if (!result?.out_mensagem_id) throw new Error('outbound_message_not_recorded');
const action = input.action;
const event = { schema_version: 'lexia.crm.event.v1', event_id: ${uuidExpression("action.action_id + ':crm:preparing'")},
  idempotency_key: action.action_id + ':preparing', correlation_id: input.plan.correlation_id,
  event_type: 'message.recorded', occurred_at: new Date().toISOString(), emitted_at: new Date().toISOString(), sequence: action.sequence * 10,
  scope: action.scope, source: { system: 'workflow', authority: 'workflow_execution', workflow_ref: 'miranda-v2-delivery', execution_ref: $execution.id },
  payload: { message_id: action.action_id, direction: 'outbound', author: 'ai', message_type: action.content.type,
    delivery_status: 'preparing', action_id: action.action_id,
    ...(action.content.type === 'text' ? { text: action.content.text } : { media_ref: action.content.media_ref, ...(action.content.caption ? { caption: action.content.caption } : {}) }) },
};
return [{ json: { events: [event], passthrough: { ...input, mensagem_id: result.out_mensagem_id } } }];`);
  const syncPreparing = subworkflow(w, "Espelhar preparação antes do provedor", "07 CRM SYNC V2");
  const sendInput = code(w, "Preparar único caminho de envio", `
const input = $input.first().json;
if (input.crm_mirrored !== true) throw new Error('crm_preparing_not_mirrored');
const current = input.passthrough;
return [{ json: { action: current.action, claimant: current.plan.claimant,
  fencing_token: Number(current.claim.out_fencing_token), delivery_mode: current.plan.delivery_mode,
  mensagem_id: current.mensagem_id } }];`);
  const provider = subworkflow(w, "Enviar pelo adaptador único", "08 PROVIDER SEND ÚNICO V2");
  const finishInput = code(w, "Preparar resultado da tentativa", `
const delivery = $input.first().json;
const original = $('Preparar único caminho de envio').item.json;
if (!['sent','failed','delivery_unknown'].includes(delivery.status)) throw new Error('delivery_result_invalid');
return [{ json: { ...original, delivery, rpc_body: {
  p_action_id: original.action.action_id, p_claimant: original.claimant, p_fencing_token: original.fencing_token,
  p_status: delivery.status, p_provider_message_id: delivery.provider_message_id || null,
  p_reason: delivery.reason || null, p_mensagem_id: original.mensagem_id,
} } }];`);
  const finishLedger = rpc(w, "Concluir ação no ledger", "lexia_omni_finish_outbound_action");
  const deliveryEvent = code(w, "Espelhar resultado confirmado ou incerto", `
const input = $('Preparar resultado da tentativa').item.json;
const result = String(${responseBody("Concluir ação no ledger")}).replace(/^\"|\"$/g, '');
if (!['sent','failed','delivery_unknown','duplicate'].includes(result)) throw new Error('delivery_finish_failed');
const action = input.action;
const event = { schema_version: 'lexia.crm.event.v1', event_id: ${uuidExpression("action.action_id + ':crm:' + input.delivery.status")},
  idempotency_key: action.action_id + ':' + input.delivery.status, correlation_id: $('Validar plano ordenado').first().json.correlation_id,
  event_type: 'message.delivery.updated', occurred_at: new Date().toISOString(), emitted_at: new Date().toISOString(), sequence: action.sequence * 10 + 1,
  scope: action.scope, source: { system: 'provider', authority: 'provider_result', workflow_ref: 'miranda-v2-provider-send', execution_ref: $execution.id },
  payload: { message_id: action.action_id, delivery_status: input.delivery.status, attempted_at: new Date().toISOString(),
    ...(input.delivery.provider_message_id ? { provider_message_ref: input.delivery.provider_message_id } : {}),
    ...(input.delivery.reason ? { reason: input.delivery.reason } : {}) },
};
return [{ json: { events: [event], passthrough: { ...input, continue_plan: input.delivery.status === 'sent' } } }];`);
  const syncResult = subworkflow(w, "Espelhar resultado antes de continuar", "07 CRM SYNC V2");
  const continuePlan = ifNode(w, "Entrega foi confirmada?", "$json.passthrough.continue_plan === true");
  const blocked = code(w, "Parar plano suprimido", `
const input = $('Avaliar gate atual').item.json;
return [{ json: { status: input.claim.out_status || 'suppressed', reason: input.claim.out_reason || 'not_acquired', action_id: input.action.action_id, provider_send_attempted: false, partial_progress_preserved: true, automatic_retry_allowed: false } }];`);
  const uncertain = code(w, "Parar plano após falha ou incerteza", `
const input = $input.first().json.passthrough;
return [{ json: { status: input.delivery.status, reason: input.delivery.reason || null, action_id: input.action.action_id, provider_send_attempted: true, partial_progress_preserved: true, automatic_retry_allowed: false } }];`);
  const completed = code(w, "Plano concluído sem duplicar", `
const plan = $('Validar plano ordenado').first().json;
return [{ json: { status: 'sent', invocation_id: plan.invocation_id, action_count: plan.actions.length, provider_send_attempted: plan.actions.length > 0, partial_progress_preserved: true } }];`);

  w.connect(receive, validate);
  w.connect(validate, prepare);
  w.connect(prepare, split);
  w.connect(split, loop);
  w.connect(loop, completed, 0);
  w.connect(loop, claimInput, 1);
  w.connect(claimInput, claim);
  w.connect(claim, evaluate);
  w.connect(evaluate, authorized);
  w.connect(authorized, messageInput, 0);
  w.connect(authorized, blocked, 1);
  w.connect(messageInput, record);
  w.connect(record, preparingEvent);
  w.connect(preparingEvent, syncPreparing);
  w.connect(syncPreparing, sendInput);
  w.connect(sendInput, provider);
  w.connect(provider, finishInput);
  w.connect(finishInput, finishLedger);
  w.connect(finishLedger, deliveryEvent);
  w.connect(deliveryEvent, syncResult);
  w.connect(syncResult, continuePlan);
  w.connect(continuePlan, loop, 0);
  w.connect(continuePlan, uncertain, 1);
  return w.done();
}

function buildApplyBrainResult() {
  const w = workflow("04 APLICAR RESULTADO DO CÉREBRO V2");
  const receive = trigger(w);
  const validate = code(w, "Validar resultado e atestados", `
const input = $input.first().json;
const request = input.request;
const result = input.result;
if (request?.schema_version !== 'lexia.brain.request.v1' || result?.schema_version !== 'lexia.brain.result.v1') throw new Error('brain_contract_invalid');
if (result.invocation_id !== request.invocation_id) throw new Error('brain_invocation_mismatch');
if (Number(result.captured_state?.state_version) !== Number(request.state.state_version) || Number(result.captured_state?.delivery_epoch) !== Number(request.state.delivery_epoch)) throw new Error('brain_captured_state_mismatch');
if (!Array.isArray(result.actions) || !Array.isArray(result.domain_events) || !Array.isArray(result.tool_audit)) throw new Error('brain_result_arrays_required');
const requestScope = JSON.stringify(request.scope);
for (const action of result.actions) {
  if (action.invocation_id !== request.invocation_id || JSON.stringify(action.scope) !== requestScope) throw new Error('brain_action_origin_mismatch');
  if (Number(action.captured_state?.state_version) !== Number(request.state.state_version) || Number(action.captured_state?.delivery_epoch) !== Number(request.state.delivery_epoch)) throw new Error('brain_action_state_mismatch');
}
for (const event of result.domain_events) {
  if (event.invocation_id !== request.invocation_id) throw new Error('domain_event_invocation_mismatch');
  if (event.type === 'appointment.confirmed' || event.type === 'appointment.cancelled') {
    const expectedOperation = event.type === 'appointment.confirmed' ? 'appointment.create' : 'appointment.cancel';
    const proof = result.tool_audit.find((audit) => audit.invocation_id === event.appointment?.tool_invocation_id && audit.operation === expectedOperation && audit.result === 'succeeded' && audit.appointment_ref === event.appointment?.appointment_ref);
    if (!proof) throw new Error('appointment_event_not_attested');
    if (event.type === 'appointment.confirmed' && (!event.appointment.starts_at || !event.appointment.ends_at || event.appointment.status !== 'confirmed')) throw new Error('appointment_confirmation_invalid');
    if (event.type === 'appointment.cancelled' && event.appointment.status !== 'cancelled') throw new Error('appointment_cancellation_invalid');
  }
}
return [{ json: input }];`);
  const expand = code(w, "Preparar comandos de domínio", `
const input = $('Validar resultado e atestados').first().json;
const commands = input.result.domain_events.map((event, index) => {
  if (event.type === 'handoff.requested') return { index, event, rpc_name: 'lexia_omni_request_handoff', rpc_body: {
    p_conversation_id: input.conversation_id, p_idempotency_key: event.idempotency_key,
    p_handoff_ref: event.handoff.handoff_ref, p_motivo: event.handoff.reason,
    p_resumo: event.handoff.summary, p_prioridade: event.handoff.priority, p_occurred_at: event.occurred_at,
  } };
  if (event.type === 'appointment.confirmed') return { index, event, rpc_name: 'lexia_omni_confirm_appointment', rpc_body: {
    p_conversation_id: input.conversation_id, p_idempotency_key: event.idempotency_key,
    p_appointment_ref: event.appointment.appointment_ref, p_starts_at: event.appointment.starts_at,
    p_ends_at: event.appointment.ends_at, p_timezone: event.appointment.timezone,
    p_tool_invocation_id: event.appointment.tool_invocation_id, p_occurred_at: event.occurred_at,
  } };
  if (event.type === 'appointment.cancelled') return { index, event, rpc_name: 'lexia_omni_cancel_appointment', rpc_body: {
    p_conversation_id: input.conversation_id, p_idempotency_key: event.idempotency_key,
    p_appointment_ref: event.appointment.appointment_ref,
    p_tool_invocation_id: event.appointment.tool_invocation_id, p_occurred_at: event.occurred_at,
  } };
  throw new Error('domain_event_not_supported');
});
if (commands.length === 0) return [{ json: { no_domain_events: true, original: input } }];
return commands.map((command) => ({ json: { ...command, no_domain_events: false, original: input } }));`);
  const domainRoute = ifNode(w, "Existem eventos de domínio?", "$json.no_domain_events !== true");
  const loop = w.add("Aplicar eventos em ordem", "n8n-nodes-base.splitInBatches", 3, {
    batchSize: 1,
    options: {},
  });
  const apply = rpc(w, "Aplicar evento no central");
  const mirror = code(w, "Montar evento de domínio para CRM", `
const input = $('Aplicar eventos em ordem').item.json;
const domain = input.event;
const scope = input.original.request.scope;
let eventType, payload, source;
if (domain.type === 'handoff.requested') {
  const rows = ${responseBody("Aplicar evento no central")};
  const result = Array.isArray(rows) ? rows[0] : rows;
  if (!result?.out_handoff_id) throw new Error('central_handoff_id_missing');
  eventType = 'handoff.requested'; payload = { handoff_ref: domain.handoff.handoff_ref, central_handoff_id: result.out_handoff_id, reason: domain.handoff.reason, summary: domain.handoff.summary, priority: domain.handoff.priority, requested_at: domain.occurred_at };
  source = { system: 'brain', authority: 'brain_result', workflow_ref: 'miranda-v2-brain', execution_ref: $execution.id };
} else if (domain.type === 'appointment.confirmed') {
  eventType = 'appointment.confirmed'; payload = { appointment_ref: domain.appointment.appointment_ref, tool_invocation_id: domain.appointment.tool_invocation_id, starts_at: domain.appointment.starts_at, ends_at: domain.appointment.ends_at, timezone: domain.appointment.timezone, pause_until_end: true };
  source = { system: 'tool', authority: 'tool_result', workflow_ref: 'miranda-v2-appointment', execution_ref: $execution.id };
} else {
  eventType = 'appointment.cancelled'; payload = { appointment_ref: domain.appointment.appointment_ref, tool_invocation_id: domain.appointment.tool_invocation_id, cancelled_at: domain.occurred_at };
  source = { system: 'tool', authority: 'tool_result', workflow_ref: 'miranda-v2-appointment', execution_ref: $execution.id };
}
const event = { schema_version: 'lexia.crm.event.v1', event_id: domain.event_id,
  idempotency_key: domain.idempotency_key + ':crm', correlation_id: input.original.request.correlation_id,
  event_type: eventType, occurred_at: domain.occurred_at, emitted_at: new Date().toISOString(), sequence: 100 + input.index,
  scope, source, payload };
return [{ json: { events: [event], passthrough: input } }];`);
  const sync = subworkflow(w, "Espelhar domínio no CRM", "07 CRM SYNC V2");
  const requireSync = code(w, "Confirmar domínio espelhado", `
const input = $input.first().json;
if (input.crm_mirrored !== true) throw new Error('crm_domain_not_mirrored');
return [{ json: input.passthrough }];`);
  const freshnessInput = code(w, "Preparar revalidação do lote", `
const input = $('Validar resultado e atestados').first().json;
return [{ json: input }];`);
  const freshState = rest(
    w,
    "Carregar sequência mais recente antes da resposta",
    "'/rest/v1/lexia_conversation_states?id=eq.' + encodeURIComponent($json.conversation_id) + '&environment=eq.' + encodeURIComponent($json.request.scope.environment) + '&cliente_slug=eq.' + encodeURIComponent($json.request.scope.cliente_slug) + '&select=id,lead_message_seq&limit=1'",
  );
  const evaluateFreshness = code(w, "Comparar lote com a conversa atual", `
const input = $('Preparar revalidação do lote').first().json;
const rows = ${responseBody("Carregar sequência mais recente antes da resposta")};
if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== input.conversation_id) throw new Error('conversation_freshness_unavailable');
const currentLeadSeq = Number(rows[0].lead_message_seq || 0);
const cutoff = Number(input.lead_cutoff_seq || 0);
if (!Number.isSafeInteger(currentLeadSeq) || !Number.isSafeInteger(cutoff) || cutoff < 1) throw new Error('conversation_freshness_invalid');
return [{ json: { ...input, current_lead_seq: currentLeadSeq, superseded_by_new_message: currentLeadSeq > cutoff } }];`);
  const stillCurrent = ifNode(
    w,
    "Lote ainda representa a última mensagem?",
    "$json.superseded_by_new_message !== true",
  );
  const staleResult = code(w, "Descartar resposta obsoleta antes de exibir", `
const input = $input.first().json;
return [{ json: { ...input, skip_delivery: true,
  delivery_result: { status: 'superseded_by_new_message', reason: 'superseded_by_new_message',
    provider_send_attempted: false, partial_progress_preserved: true, automatic_retry_allowed: false },
  language_policy: { status: 'not_evaluated', reason: 'superseded_by_new_message', checked_action_count: 0 },
} }];`);
  const prepareMemory = code(w, "Validar e fundir memória proposta pelo cérebro", `
const input = $('Validar resultado e atestados').first().json;
const request = input.request;
const result = input.result;
const patch = result.context_patch && typeof result.context_patch === 'object' && !Array.isArray(result.context_patch) ? result.context_patch : {};
// Persist only lead facts and tool-backed state here. Questions proposed by the
// brain become history only after the corresponding outbound action is recorded.
const allowed = new Set(['queixa_principal','area_regiao','servico_interesse','temperatura','pendencia','agendamento','idioma']);
const clean = {};
for (const [key, value] of Object.entries(patch)) if (allowed.has(key)) clean[key] = value;
if (clean.agendamento !== undefined && (!clean.agendamento || typeof clean.agendamento !== 'object' || Array.isArray(clean.agendamento))) throw new Error('brain_context_appointment_invalid');
if (clean.agendamento) {
  const allowedAppointment = new Set(['servico','variante','slot_escolhido','nome','telefone','email']);
  clean.agendamento = Object.fromEntries(Object.entries(clean.agendamento).filter(([key]) => allowedAppointment.has(key)));
}
const mergeMemory = (previous, next, path = []) => {
  if (next === null || next === undefined) return previous;
  if (typeof next === 'string' && next.trim() === '' && path.at(-1) !== 'pendencia') return previous ?? next;
  if (Array.isArray(next)) return next.length ? next.slice(-10) : (Array.isArray(previous) ? previous : next);
  if (typeof next !== 'object') return next;
  if (Object.keys(next).length === 0) return previous && typeof previous === 'object' ? previous : next;
  const output = { ...((previous && typeof previous === 'object' && !Array.isArray(previous)) ? previous : {}) };
  for (const [key, value] of Object.entries(next)) output[key] = mergeMemory(output[key], value, [...path, key]);
  return output;
};
const companyFields = mergeMemory(request.company_fields || {}, clean);
const confirmed = result.domain_events.find((event) => event.type === 'appointment.confirmed');
if (confirmed) {
  companyFields.ultimo_agendamento = {
    ...(companyFields.agendamento || {}), status: 'confirmed', appointment_ref: confirmed.appointment.appointment_ref,
    starts_at: confirmed.appointment.starts_at, ends_at: confirmed.appointment.ends_at, timezone: confirmed.appointment.timezone,
  };
  companyFields.agendamento = {};
}
const cancelled = result.domain_events.find((event) => event.type === 'appointment.cancelled');
if (cancelled && companyFields.ultimo_agendamento?.appointment_ref === cancelled.appointment.appointment_ref) companyFields.ultimo_agendamento.status = 'cancelled';
const languageMap = { pt: 'pt-BR', en: 'en', es: 'es' };
const operationalContext = { ...(request.operational_context || {}) };
if (typeof clean.idioma === 'string' && languageMap[clean.idioma]) operationalContext.language = languageMap[clean.idioma];
const expectedVersion = Number(request.policy?.context_version);
const sourceIds = request.policy?.source_central_message_ids;
if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error('brain_context_version_invalid');
if (!Array.isArray(sourceIds) || sourceIds.length === 0) throw new Error('brain_context_sources_invalid');
const contextCallId = ${uuidExpression("request.invocation_id + ':brain-context'")};
return [{ json: { ...input, merged_context: { operational_context: operationalContext, company_fields: companyFields }, rpc_body: {
  p_conversation_id: input.conversation_id, p_expected_context_version: expectedVersion,
  p_context_call_id: contextCallId, p_config_version: request.policy.context_config_version,
  p_source_message_ids: sourceIds, p_operational_context: operationalContext, p_company_fields: companyFields,
} } }];`);
  const storeMemory = rpc(w, "Persistir memória versionada do cérebro", "lexia_omni_store_context");
  const prepareMemoryProjection = code(w, "Preparar projeção Redis da memória", `
const input = $('Validar e fundir memória proposta pelo cérebro').first().json;
const contextVersion = Number(${responseBody("Persistir memória versionada do cérebro")});
if (!Number.isInteger(contextVersion) || contextVersion < 1) throw new Error('brain_memory_projection_version_invalid');
const scope = input.request.scope;
const key = ['lexia','omni','v2',scope.environment,scope.cliente_slug,scope.channel,scope.account_ref,'{' + input.conversation_id + '}','context'].join(':');
return [{ json: { ...input, stored_context_version: contextVersion, redis_projection_key: key,
  redis_projection_value: JSON.stringify({ schema_version: 'lexia.redis.context.v1', projected_at: new Date().toISOString(),
    conversation_id: input.conversation_id, context_version: contextVersion,
    operational_context: input.merged_context.operational_context, company_fields: input.merged_context.company_fields }) } }];`);
  const projectMemory = redisProjection(
    w,
    "Projetar memória do cérebro no Redis",
    "$json.redis_projection_key",
    "$json.redis_projection_value",
    604800,
  );
  const prepareActions = code(w, "Preparar ações após efeitos de domínio", `
const input = $('Validar resultado e atestados').first().json;
const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const words = {
  pt: new Set(['oi','ola','voce','voces','gostaria','quero','queria','preciso','tratamento','tratamentos','pele','corpo','preco','valor','quanto','onde','quando','agendar','marcar','avaliacao','amanha','obrigado','obrigada','horario','horarios','disponibilidade','tenho','posso','bom','boa','tarde','noite','dia','sim','nao','tambem']),
  en: new Set(['hello','hi','hey','you','your','would','like','want','need','treatment','treatments','skin','body','price','cost','much','where','when','appointment','book','schedule','tomorrow','thanks','thank','available','availability','time','times','have','can','please','morning','afternoon','evening','yes','also','what','which','how']),
  es: new Set(['hola','usted','ustedes','quisiera','quiero','necesito','tratamiento','tratamientos','piel','cuerpo','precio','cuanto','donde','cuando','cita','agendar','reservar','manana','gracias','horario','horarios','disponibilidad','tengo','puedo','buenos','buenas','tardes','noches','si','tambien','que','cual','como','favor']),
};
const localeLanguage = (value) => {
  const normalized = normalize(value);
  if (normalized.startsWith('pt') || normalized.includes('portugues')) return 'pt';
  if (normalized.startsWith('en') || normalized.includes('ingles') || normalized.includes('english')) return 'en';
  if (normalized.startsWith('es') || normalized.includes('espanhol') || normalized.includes('espanol') || normalized.includes('spanish')) return 'es';
  return '';
};
const explicitLanguageRequest = (text) => {
  const normalized = normalize(text);
  if (/\\b((in|speak) english|(em|en) (ingles|english)|english please)\\b/.test(normalized)) return 'en';
  if (/\\b((en|em) (espanol|espanhol)|(in|speak) spanish|habla(?:r|s)? espanol|espanol por favor)\\b/.test(normalized)) return 'es';
  if (/\\b((em|en) portugues|(in|speak) portuguese|fala(?:r)? portugues|portugues por favor)\\b/.test(normalized)) return 'pt';
  return '';
};
const detect = (text) => {
  const raw = String(text || '');
  const tokens = normalize(raw).split(' ').filter(Boolean);
  const unique = { oi: 'pt', ola: 'pt', hello: 'en', hi: 'en', hola: 'es' };
  if (tokens.length === 1 && unique[tokens[0]]) return unique[tokens[0]];
  const score = { pt: 0, en: 0, es: 0 };
  if (/[çãõ]/i.test(raw)) score.pt += 3;
  if (/[¿¡ñ]/i.test(raw)) score.es += 3;
  for (const token of tokens) for (const language of ['pt','en','es']) if (words[language].has(token)) score[language] += 1;
  const ranked = ['pt','en','es'].sort((left, right) => score[right] - score[left]);
  return score[ranked[0]] >= 2 && score[ranked[0]] - score[ranked[1]] >= 1 ? ranked[0] : '';
};
const briefingLanguage = localeLanguage($('Preparar Briefing').first().json.idioma);
const leadMessages = input.request.messages.filter((message) => message.author === 'lead');
const latestLead = leadMessages.at(-1);
const latestLeadText = latestLead?.text || latestLead?.media?.caption || '';
const expectedLanguage = explicitLanguageRequest(latestLeadText) || detect(latestLeadText) || briefingLanguage || localeLanguage(input.request.operational_context?.language) || 'pt';
const responseTexts = input.result.actions.flatMap((action) => {
  if (action.content?.type === 'text') return [String(action.content.text || '')];
  if (action.content?.caption) return [String(action.content.caption)];
  return [];
}).filter(Boolean);
const detectedLanguages = responseTexts.map(detect);
const mismatch = detectedLanguages.some((language) => language && language !== expectedLanguage);
const languagePolicy = {
  status: mismatch ? 'blocked' : 'passed',
  expected_language: expectedLanguage,
  detected_languages: detectedLanguages.map((language) => language || null),
  checked_action_count: responseTexts.length,
};
if (input.result.actions.length === 0) return [{ json: { ...input, language_policy: languagePolicy, skip_delivery: true, delivery_result: { status: input.result.decision === 'handoff' ? 'handoff' : 'no_reply', provider_send_attempted: false } } }];
if (mismatch) return [{ json: { ...input, language_policy: languagePolicy, skip_delivery: true, delivery_result: { status: 'suppressed', reason: 'response_language_mismatch', provider_send_attempted: false } } }];
return [{ json: { ...input, language_policy: languagePolicy, skip_delivery: false, actions: input.result.actions, invocation_id: input.request.invocation_id,
  correlation_id: input.request.correlation_id, delivery_mode: input.delivery_mode,
  lead_cutoff_seq: input.lead_cutoff_seq, claimant: 'brain:' + input.request.invocation_id } }];`);
  const hasActions = ifNode(w, "Há ações para entregar?", "$json.skip_delivery !== true");
  const delivery = subworkflow(w, "Entregar pelo gate compartilhado", "06 DELIVERY GATE V2");
  const deliveryResult = code(w, "Preservar resultado da entrega", `
const original = $('Preparar ações após efeitos de domínio').first().json;
return [{ json: { ...original, delivery_result: $input.first().json } }];`);
  const finishBatch = code(w, "Encerrar lote conforme resultado", `
const input = $input.first().json;
const status = input.delivery_result?.status;
const superseded = ['state_changed','superseded_by_new_message'].includes(status) || input.delivery_result?.reason === 'state_changed' || input.delivery_result?.reason === 'superseded_by_new_message';
return [{ json: { ...input, rpc_name: superseded ? 'lexia_omni_supersede_inbound_batch' : 'lexia_omni_complete_inbound_batch', rpc_body: {
  p_batch_id: input.batch_id, p_fencing_token: input.batch_fencing_token, p_invocation_id: input.request.invocation_id,
} } }];`);
  const close = rpc(w, "Concluir ou superseder lote");
  const done = code(w, "Retornar resultado do cérebro", `
const input = $('Encerrar lote conforme resultado').first().json;
const languageBlocked = input.language_policy?.status === 'blocked';
const superseded = input.delivery_result?.status === 'superseded_by_new_message' || input.delivery_result?.reason === 'superseded_by_new_message';
const textActions = languageBlocked || superseded ? [] : (input.result?.actions || []).filter((action) => action.content?.type === 'text' && String(action.content.text || '').trim());
const assistantMessages = textActions.map((action) => ({
  message_id: action.action_id,
  type: 'text',
  text: String(action.content.text).trim(),
  sequence: Number(action.sequence),
}));
return [{ json: {
  status: input.delivery_result?.status || input.result.decision,
  reason: input.delivery_result?.reason || null,
  invocation_id: input.request.invocation_id,
  provider_send_attempted: input.delivery_result?.provider_send_attempted === true,
  workflow_test: input.workflow_test || null,
  assistant_messages: assistantMessages,
  language_policy: input.language_policy || null,
  reprocess_required: superseded,
} }];`);

  w.connect(receive, validate);
  w.connect(validate, expand);
  w.connect(expand, domainRoute);
  w.connect(domainRoute, loop, 0);
  w.connect(domainRoute, freshnessInput, 1);
  w.connect(loop, freshnessInput, 0);
  w.connect(loop, apply, 1);
  w.connect(apply, mirror);
  w.connect(mirror, sync);
  w.connect(sync, requireSync);
  w.connect(requireSync, loop);
  w.connect(freshnessInput, freshState);
  w.connect(freshState, evaluateFreshness);
  w.connect(evaluateFreshness, stillCurrent);
  w.connect(stillCurrent, prepareMemory, 0);
  w.connect(stillCurrent, staleResult, 1);
  w.connect(staleResult, finishBatch);
  w.connect(prepareMemory, storeMemory);
  w.connect(storeMemory, prepareMemoryProjection);
  w.connect(prepareMemoryProjection, projectMemory);
  w.connect(projectMemory, prepareActions);
  w.connect(prepareActions, hasActions);
  w.connect(hasActions, delivery, 0);
  w.connect(hasActions, finishBatch, 1);
  w.connect(delivery, deliveryResult);
  w.connect(deliveryResult, finishBatch);
  w.connect(finishBatch, close);
  w.connect(close, done);
  return w.done();
}

function buildContextAndBrain(sources: SourceSet) {
  const w = workflow("03 CONTEXTO E CÉREBRO V2");
  const receive = trigger(w);
  const prepare = code(w, "Validar lote e escopo", `
const input = $input.first().json;
if (!input.conversation_id || !input.batch_id || !Array.isArray(input.mensagem_ids) || input.mensagem_ids.length === 0) throw new Error('claimed_batch_required');
if (!input.event?.scope) throw new Error('trusted_scope_required');
return [{ json: { ...input, scope: input.event.scope, message_filter: input.mensagem_ids.join(',') } }];`);
  const config = rest(
    w,
    "Buscar único prompt da empresa",
    "'/rest/v1/lexia_context_agent_configs?environment=eq.' + encodeURIComponent($json.scope.environment) + '&cliente_slug=eq.' + encodeURIComponent($json.scope.cliente_slug) + '&status=eq.active&select=environment,cliente_slug,config_version,prompt_template,common_schema_version,company_fields_schema,locale,timezone,model_policy_ref&limit=2'",
  );
  const messagesInput = code(w, "Preparar histórico do lote", `
const items = $('Validar lote e escopo').all();
if (items.length !== 1) throw new Error('context_input_cardinality_invalid');
return [{ json: items[0].json }];`);
  const messages = rest(
    w,
    "Carregar mensagens pela conversa",
    "'/rest/v1/lexia_mensagens?omni_conversation_id=eq.' + encodeURIComponent($json.conversation_id) + '&cliente_slug=eq.' + encodeURIComponent($json.scope.cliente_slug) + '&or=(lead_seq.is.null,lead_seq.lte.' + encodeURIComponent($json.lead_cutoff_seq) + ')&select=id,cliente_slug,provider_message_id,provider_timestamp,omni_author,direccao,tipo,conteudo,media_kind,media_processing_status,media_error_code,lead_seq,criado_em,omni_action_id&order=provider_timestamp.desc.nullslast,criado_em.desc,id.desc&limit=30'",
  );
  const outboundHistoryInput = code(w, "Preparar histórico de saídas confirmadas", `
const items = $('Validar lote e escopo').all();
if (items.length !== 1) throw new Error('context_input_cardinality_invalid');
return [{ json: items[0].json }];`);
  const outboundHistory = rest(
    w,
    "Carregar saídas confirmadas e virtuais",
    "'/rest/v1/lexia_outbound_actions?conversation_id=eq.' + encodeURIComponent($json.conversation_id) + '&environment=eq.' + encodeURIComponent($json.scope.environment) + '&cliente_slug=eq.' + encodeURIComponent($json.scope.cliente_slug) + '&status=in.(sent,suppressed)&or=(lead_cutoff_seq.is.null,lead_cutoff_seq.lt.' + encodeURIComponent($json.lead_cutoff_seq) + ')&select=id,conversation_id,environment,cliente_slug,invocation_id,sequence,kind,content,status,reason,provider_message_id,mensagem_id,preparado_em,concluido_em,lead_cutoff_seq&order=preparado_em.asc,sequence.asc&limit=60'",
  );
  const stateInput = code(w, "Preparar snapshot da conversa", `
const items = $('Validar lote e escopo').all();
if (items.length !== 1) throw new Error('context_input_cardinality_invalid');
return [{ json: items[0].json }];`);
  const state = rest(
    w,
    "Carregar estado e versão atuais",
    "'/rest/v1/lexia_conversation_states?id=eq.' + encodeURIComponent($json.conversation_id) + '&select=id,state_version,delivery_epoch,lead_message_seq,contacto_id,environment,cliente_slug,channel,account_id,conversation_ref&limit=1'",
  );
  const contextVersionInput = code(w, "Preparar versão atual do contexto", `
const items = $('Validar lote e escopo').all();
if (items.length !== 1) throw new Error('context_input_cardinality_invalid');
return [{ json: items[0].json }];`);
  const currentContext = rest(
    w,
    "Carregar última versão de contexto",
    "'/rest/v1/lexia_conversation_contexts?conversation_id=eq.' + encodeURIComponent($json.conversation_id) + '&environment=eq.' + encodeURIComponent($json.scope.environment) + '&cliente_slug=eq.' + encodeURIComponent($json.scope.cliente_slug) + '&select=conversation_id,environment,cliente_slug,context_version,config_version,context_call_id,source_message_ids,operational_context,company_fields,criado_em&order=context_version.desc&limit=1'",
  );
  const assemble = code(w, "Montar item isolado por empresa", `
const inputItems = $('Validar lote e escopo').all();
if (inputItems.length !== 1) throw new Error('context_input_cardinality_invalid');
const input = inputItems[0].json;
const configs = ${responseBody("Buscar único prompt da empresa")};
const rows = ${responseBody("Carregar mensagens pela conversa")};
const outboundActions = ${responseBody("Carregar saídas confirmadas e virtuais")};
const states = ${responseBody("Carregar estado e versão atuais")};
const contexts = ${responseBody("Carregar última versão de contexto")};
if (!Array.isArray(configs) || configs.length !== 1) throw new Error('context_config_unavailable');
if (!Array.isArray(rows)) throw new Error('conversation_history_unavailable');
if (!Array.isArray(outboundActions)) throw new Error('outbound_history_unavailable');
if (!Array.isArray(states) || states.length !== 1) throw new Error('conversation_state_unavailable');
if (!Array.isArray(contexts) || contexts.length > 1) throw new Error('context_version_unavailable');
const config = configs[0], snapshot = states[0];
if (config.environment !== input.scope.environment || config.cliente_slug !== input.scope.cliente_slug) throw new Error('context_config_scope_mismatch');
if (snapshot.environment !== input.scope.environment || snapshot.cliente_slug !== input.scope.cliente_slug || snapshot.account_id !== input.scope.account_ref) throw new Error('conversation_scope_mismatch');
if (rows.some((row) => row.cliente_slug !== input.scope.cliente_slug)) throw new Error('mixed_company_history');
if (outboundActions.some((action) => action.conversation_id !== input.conversation_id || action.environment !== input.scope.environment || action.cliente_slug !== input.scope.cliente_slug)) throw new Error('mixed_company_outbound_history');
const contextVersion = contexts.length === 0 ? 0 : Number(contexts[0].context_version);
if (!Number.isInteger(contextVersion) || contextVersion < 0) throw new Error('context_version_invalid');
if (contexts.length === 1 && (contexts[0].conversation_id !== input.conversation_id || contexts[0].environment !== input.scope.environment || contexts[0].cliente_slug !== input.scope.cliente_slug)) throw new Error('context_version_scope_mismatch');
const batchIds = new Set(input.mensagem_ids.map(String));
const batchRows = rows.filter((row) => batchIds.has(String(row.id)));
if (new Set(batchRows.map((row) => String(row.id))).size !== batchIds.size) throw new Error('batch_history_incomplete');
const chronologicalRows = [...rows].sort((left, right) => {
  const leftTime = Date.parse(left.provider_timestamp || left.criado_em || '') || 0;
  const rightTime = Date.parse(right.provider_timestamp || right.criado_em || '') || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  const leftSeq = Number(left.lead_seq || 0), rightSeq = Number(right.lead_seq || 0);
  if (leftSeq !== rightSeq) return leftSeq - rightSeq;
  return String(left.id).localeCompare(String(right.id));
});
const historyMessages = chronologicalRows.map((row) => ({
  schema_version: 'lexia.message.v1', central_message_id: row.id,
  event_id: batchIds.has(String(row.id)) ? input.event.event_id : row.id,
  provider_event_id: row.provider_message_id || row.id,
  message_id: row.provider_message_id || row.id, scope: input.scope,
  author: row.omni_author || (row.direccao === 'recebida' ? 'lead' : 'ai'),
  direction: row.direccao === 'recebida' ? 'inbound' : 'outbound', occurred_at: row.provider_timestamp || row.criado_em,
  ...(row.conteudo ? { text: row.conteudo } : {}),
  ...(row.omni_action_id ? { action_id: row.omni_action_id } : {}),
  media: { kind: row.media_kind || 'text', processing_status: row.media_processing_status || 'completed', ...(row.media_error_code ? { error_code: row.media_error_code } : {}) },
}));
const sourceMessages = historyMessages.filter((message) => batchIds.has(String(message.central_message_id)));
if (sourceMessages.length !== batchIds.size) throw new Error('batch_history_incomplete');
const representedActionIds = new Set(historyMessages.map((message) => String(message.action_id || '')).filter(Boolean));
// In observe-only the delivery gate suppresses the first action and marks the
// remaining actions as plan_interrupted. Agent Test nevertheless renders the
// complete proposed response. Treat that remainder as virtual speech only
// when the same invocation contains the authoritative observe_only marker.
// A real plan interrupted by a pause, state change or provider result remains
// absent from history because it was never shown to the lead.
const observeOnlyInvocations = new Set(outboundActions.filter((action) =>
  action.status === 'suppressed' && action.reason === 'observe_only' && action.invocation_id
).map((action) => String(action.invocation_id)));
const actionMessages = outboundActions.filter((action) => {
  const virtualSpeech = action.status === 'suppressed' && (
    action.reason === 'observe_only' ||
    (action.reason === 'plan_interrupted' && observeOnlyInvocations.has(String(action.invocation_id || '')))
  );
  const confirmed = action.status === 'sent' || virtualSpeech;
  return confirmed && !representedActionIds.has(String(action.id)) && action.content && typeof action.content === 'object';
}).map((action) => {
  const content = action.content || {};
  const type = ['text','image','audio','video','pdf'].includes(content.type) ? content.type : 'text';
  return {
    schema_version: 'lexia.message.v1', central_message_id: action.id, event_id: action.id,
    provider_event_id: action.provider_message_id || 'virtual:' + action.id,
    message_id: action.provider_message_id || 'virtual:' + action.id, scope: input.scope,
    author: 'ai', direction: 'outbound', occurred_at: action.concluido_em || action.preparado_em,
    ...(content.text ? { text: String(content.text) } : {}), action_id: action.id,
    media: { kind: type, processing_status: 'completed', ...(content.caption ? { caption: String(content.caption) } : {}),
      ...(content.media_ref ? { provider_media_ref: String(content.media_ref) } : {}) },
  };
});
historyMessages.push(...actionMessages);
historyMessages.sort((left, right) => {
  const leftTime = Date.parse(left.occurred_at || '') || 0;
  const rightTime = Date.parse(right.occurred_at || '') || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(left.central_message_id).localeCompare(String(right.central_message_id));
});
if (historyMessages.some((message) => JSON.stringify(message.scope) !== JSON.stringify(input.scope))) throw new Error('mixed_company_history');
const previousContext = contexts.length === 1 ? {
  context_version: contextVersion, config_version: contexts[0].config_version,
  context_call_id: contexts[0].context_call_id, source_message_ids: contexts[0].source_message_ids || [],
  operational_context: contexts[0].operational_context || {}, company_fields: contexts[0].company_fields || {},
} : null;
return [{ json: { ...input, context_config: config, state: snapshot, context_version: contextVersion,
  source_messages: sourceMessages, history_messages: historyMessages, previous_context: previousContext,
  context_call_id: ${uuidExpression("input.batch_id + ':context'")}, invocation_id: ${uuidExpression("input.batch_id + ':brain'")} } }];`);
  const genericSet = w.add("Set genérico do agente de contexto", "n8n-nodes-base.set", 3.4, {
    assignments: {
      assignments: [
        { id: "scope", name: "scope", type: "object", value: "={{ $json.scope }}" },
        { id: "context_call_id", name: "context_call_id", type: "string", value: "={{ $json.context_call_id }}" },
        { id: "config_version", name: "config_version", type: "string", value: "={{ $json.context_config.config_version }}" },
        { id: "prompt_template", name: "prompt_template", type: "string", value: "={{ $json.context_config.prompt_template }}" },
        { id: "company_fields_schema", name: "company_fields_schema", type: "object", value: "={{ $json.context_config.company_fields_schema }}" },
        { id: "source_messages", name: "source_messages", type: "array", value: "={{ $json.source_messages }}" },
        { id: "history_messages", name: "history_messages", type: "array", value: "={{ $json.history_messages }}" },
        { id: "previous_context", name: "previous_context", type: "object", value: "={{ $json.previous_context || {} }}" },
      ],
    },
    includeOtherFields: true,
    options: {},
  });
  const agent = w.add("Agente de contexto compartilhado", "@n8n/n8n-nodes-langchain.agent", 3.1, {
    promptType: "define",
    text: "={{ JSON.stringify({ schema_version: 'lexia.context.input.v1', scope: $json.scope, context_call_id: $json.context_call_id, source_messages: $json.source_messages, history_messages: $json.history_messages, previous_context: $json.previous_context, company_fields_schema: $json.company_fields_schema }) }}",
    hasOutputParser: false,
    options: {
      systemMessage:
        "={{ $json.prompt_template + '\\n\\nReconstrua o contexto usando previous_context, o histórico cronológico e as mensagens do lote atual. Preserve fatos já confirmados que não tenham sido corrigidos pelo lead. Não misture conversas ou empresas. Retorne somente JSON puro, sem markdown e sem uma chave output externa. A raiz deve ter EXATAMENTE duas chaves irmãs: operational_context e company_fields. operational_context deve conter exatamente summary, language, intent, topic, confidence, missing_information, contact_updates e scheduling_intent. summary, language e intent são strings. topic é um objeto com exatamente current como string, changed como booleano e resumed_previous como booleano. confidence é obrigatoriamente um número entre 0 e 1, nunca uma palavra. missing_information é uma lista de strings. contact_updates e scheduling_intent são objetos JSON, mesmo quando vazios, nunca listas ou strings. Nunca coloque company_fields dentro de operational_context. company_fields é um objeto e deve obedecer exatamente aos campos e tipos do company_fields_schema recebido.' }}",
    },
  });
  const model = cloneNode(sources.omnichannel, "OpenAI Chat Model", "Modelo compartilhado de contexto");
  const modelName = w.add(model.name, model.type, model.typeVersion, model.parameters);
  const validateContext = code(w, "Validar origem e conteúdo do contexto", `
const preparedItems = $('Set genérico do agente de contexto').all();
const resultItems = $input.all();
if (preparedItems.length !== 1 || resultItems.length !== 1) throw new Error('context_agent_cardinality_invalid');
const prepared = preparedItems[0].json;
let raw = resultItems[0].json.output ?? resultItems[0].json;
const parseJson = (value) => {
  if (typeof value !== 'string') return value;
  const clean = value.replace(/\x60\x60\x60(?:json)?/gi, '').trim();
  try { return JSON.parse(clean); } catch (_) { throw new Error('context_result_not_json'); }
};
raw = parseJson(raw);
// n8n agents sometimes wrap their JSON in an extra output key even when the
// prompt forbids it. Unwrap that single known transport envelope, then repair
// only the one unambiguous structural mistake observed in HML. Content still
// passes every strict allowlist and company schema check below.
if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 1 && 'output' in raw) raw = parseJson(raw.output);
if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('context_result_object_required');
if (raw.operational_context && typeof raw.operational_context === 'object' && !Array.isArray(raw.operational_context) &&
    raw.company_fields === undefined && raw.operational_context.company_fields !== undefined) {
  const { company_fields, ...operational_context } = raw.operational_context;
  raw = { ...raw, operational_context, company_fields };
}
const allowedRoot = new Set(['operational_context','company_fields']);
for (const key of allowedRoot) if (!(key in raw)) throw new Error('context_result_missing_' + key);
for (const key of Object.keys(raw)) if (!allowedRoot.has(key)) throw new Error('context_result_extra_root_' + key);
const common = raw.operational_context;
const allowedCommon = new Set(['summary','language','intent','topic','confidence','missing_information','contact_updates','scheduling_intent']);
for (const key of allowedCommon) if (!(key in common)) throw new Error('context_result_missing_' + key);
for (const key of Object.keys(common)) if (!allowedCommon.has(key)) throw new Error('context_result_extra_' + key);
if (typeof common.summary !== 'string' || typeof common.language !== 'string' || typeof common.intent !== 'string') throw new Error('context_result_type_invalid');
if (!common.topic || typeof common.topic.current !== 'string' || typeof common.topic.changed !== 'boolean' || typeof common.topic.resumed_previous !== 'boolean') throw new Error('context_topic_invalid');
if (typeof common.confidence !== 'number' || common.confidence < 0 || common.confidence > 1) throw new Error('context_confidence_invalid');
if (!Array.isArray(common.missing_information) || !common.contact_updates || !common.scheduling_intent) throw new Error('context_collections_invalid');
const schema = prepared.company_fields_schema;
if (!schema || schema.type !== 'object' || schema.$ref || schema.definitions || schema.$defs) throw new Error('company_schema_not_supported');
const fields = raw.company_fields;
if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('company_fields_object_required');
const properties = schema.properties || {};
for (const required of schema.required || []) if (!(required in fields)) throw new Error('company_field_required_' + required);
if (schema.additionalProperties === false) for (const key of Object.keys(fields)) if (!(key in properties)) throw new Error('company_field_extra_' + key);
for (const [key, value] of Object.entries(fields)) {
  const rule = properties[key];
  if (!rule || rule.$ref || ['anyOf','oneOf','not'].some((name) => name in rule)) throw new Error('company_field_rule_not_supported_' + key);
  if (rule.type === 'string' && typeof value !== 'string') throw new Error('company_field_type_' + key);
  if (rule.type === 'boolean' && typeof value !== 'boolean') throw new Error('company_field_type_' + key);
  if (rule.type === 'number' && typeof value !== 'number') throw new Error('company_field_type_' + key);
  if (Array.isArray(rule.enum) && !rule.enum.includes(value)) throw new Error('company_field_enum_' + key);
}
const mergeMemory = (previous, next, path = []) => {
  if (next === null || next === undefined) return previous;
  if (typeof next === 'string' && next.trim() === '' && path.at(-1) !== 'pendencia') return previous ?? next;
  if (Array.isArray(next)) return next.length ? next : (Array.isArray(previous) ? previous : next);
  if (typeof next !== 'object') return next;
  const output = { ...((previous && typeof previous === 'object' && !Array.isArray(previous)) ? previous : {}) };
  for (const [key, value] of Object.entries(next)) output[key] = mergeMemory(output[key], value, [...path, key]);
  return output;
};
const mergedCommon = mergeMemory(prepared.previous_context?.operational_context || {}, common);
const mergedFields = mergeMemory(prepared.previous_context?.company_fields || {}, fields);
const result = { schema_version: 'lexia.context.result.v1', scope: prepared.scope,
  context_call_id: prepared.context_call_id, config_version: prepared.context_config.config_version,
  source_message_ids: prepared.source_messages.map((message) => message.message_id), operational_context: mergedCommon, company_fields: mergedFields };
return [{ json: { ...prepared, context_result: result, rpc_body: {
  p_conversation_id: prepared.conversation_id, p_expected_context_version: Number(prepared.context_version),
  p_context_call_id: prepared.context_call_id, p_config_version: prepared.context_config.config_version,
  p_source_message_ids: prepared.mensagem_ids, p_operational_context: result.operational_context, p_company_fields: result.company_fields,
} } }];`);
  const store = rpc(w, "Persistir resumo e fatos versionados", "lexia_omni_store_context");
  const storeOptions = w.node(store).parameters.options as { timeout: number };
  // An aborted durable write can still mean the server committed it, so retries
  // remain disabled. Context conflicts are prevented with the context ledger's
  // own monotonic version rather than by stretching this timeout.
  storeOptions.timeout = 12000;
  const prepareContextProjection = code(w, "Preparar projeção Redis do contexto", `
const input = $('Validar origem e conteúdo do contexto').first().json;
const contextVersion = Number(${responseBody("Persistir resumo e fatos versionados")});
if (!Number.isInteger(contextVersion) || contextVersion < 1) throw new Error('context_projection_version_invalid');
const scope = input.scope;
const key = ['lexia','omni','v2',scope.environment,scope.cliente_slug,scope.channel,scope.account_ref,'{' + input.conversation_id + '}','context'].join(':');
return [{ json: { ...input, stored_context_version: contextVersion, redis_projection_key: key,
  redis_projection_value: JSON.stringify({ schema_version: 'lexia.redis.context.v1', projected_at: new Date().toISOString(),
    conversation_id: input.conversation_id, context_version: contextVersion, context_call_id: input.context_call_id,
    source_message_ids: input.context_result.source_message_ids, operational_context: input.context_result.operational_context,
    company_fields: input.context_result.company_fields }) } }];`);
  const projectContext = redisProjection(
    w,
    "Projetar contexto no Redis compartilhado",
    "$json.redis_projection_key",
    "$json.redis_projection_value",
    604800,
  );
  const brainRequest = code(w, "Montar Brain Request vinculado", `
const contextItems = $('Validar origem e conteúdo do contexto').all();
if (contextItems.length !== 1) throw new Error('context_result_cardinality_invalid');
const input = contextItems[0].json;
const contextVersion = Number(${responseBody("Persistir resumo e fatos versionados")});
const request = { schema_version: 'lexia.brain.request.v1', invocation_id: input.invocation_id,
  correlation_id: input.event.correlation_id, scope: input.scope,
  state: { state_version: Number(input.state.state_version), delivery_epoch: Number(input.state.delivery_epoch) },
  messages: input.history_messages, contact: input.event.contact || {},
  operational_context: input.context_result.operational_context, company_fields: input.context_result.company_fields,
  policy: { resume_mode: 'await_new_message', context_version: contextVersion,
    context_config_version: input.context_config.config_version,
    source_message_ids: input.source_messages.map((message) => message.message_id),
    source_central_message_ids: input.mensagem_ids },
  capabilities: ['handoff.requested','appointment.confirmed','appointment.cancelled'] };
return [{ json: { request, execution_context: { conversation_id: input.conversation_id, batch_id: input.batch_id,
  batch_fencing_token: input.batch_fencing_token, lead_cutoff_seq: input.lead_cutoff_seq, delivery_mode: input.delivery_mode,
  context_version: contextVersion, context_config_version: input.context_config.config_version,
  source_central_message_ids: input.mensagem_ids, workflow_test: input.workflow_test || null } } }];`);
  const brain = subworkflow(w, "Chamar cérebro privado sem credencial de envio", "10 CÉREBRO PRIVADO V2");
  const applyInput = code(w, "Vincular resultado à solicitação", `
const callItems = $('Montar Brain Request vinculado').all();
const resultItems = $input.all();
if (callItems.length !== 1 || resultItems.length !== 1) throw new Error('brain_result_cardinality_invalid');
const call = callItems[0].json;
const result = resultItems[0].json.result || resultItems[0].json;
return [{ json: { ...call.execution_context, request: call.request, result } }];`);
  const apply = subworkflow(w, "Aplicar resultado e efeitos", "04 APLICAR RESULTADO DO CÉREBRO V2");

  w.connect(receive, prepare);
  w.connect(prepare, config);
  w.connect(config, messagesInput);
  w.connect(messagesInput, messages);
  w.connect(messages, outboundHistoryInput);
  w.connect(outboundHistoryInput, outboundHistory);
  w.connect(outboundHistory, stateInput);
  w.connect(stateInput, state);
  w.connect(state, contextVersionInput);
  w.connect(contextVersionInput, currentContext);
  w.connect(currentContext, assemble);
  w.connect(assemble, genericSet);
  w.connect(genericSet, agent);
  w.connect(modelName, agent, 0, "ai_languageModel");
  w.connect(agent, validateContext);
  w.connect(validateContext, store);
  w.connect(store, prepareContextProjection);
  w.connect(prepareContextProjection, projectContext);
  w.connect(projectContext, brainRequest);
  w.connect(brainRequest, brain);
  w.connect(brain, applyInput);
  w.connect(applyInput, apply);
  return w.done();
}

function buildBrain(sources: SourceSet) {
  const source = sources.brain;
  const excluded = new Set([
    "Preparar Handoff",
    "Notificar Equipe?",
    "Notificar Samuel (uazapi)",
    "Pausar Bot?",
    "Pausar Conversa",
    "Devolver Saída Cérebro",
  ]);
  const kept = new Set(source.nodes.map((node) => node.name).filter((name) => !excluded.has(name)));
  const w = workflow("10 CÉREBRO PRIVADO V2");
  for (const node of source.nodes) if (kept.has(node.name)) appendClone(w, source, node.name);
  copyConnections(w, source, kept);
  removeConnection(w, "When Executed by Another Workflow", "Preparar Entrada");
  removeConnection(w, "Validar Saída Cérebro", "Preparar Handoff");

  const validate = code(w, "Validar Brain Request V2", `
const wrapper = $input.first().json;
const request = wrapper.request || wrapper;
if (request?.schema_version !== 'lexia.brain.request.v1' || !request.scope || !request.state || !Array.isArray(request.messages)) throw new Error('brain_request_invalid');
const scope = JSON.stringify(request.scope);
if (request.messages.some((message) => JSON.stringify(message.scope) !== scope)) throw new Error('brain_request_mixed_scope');
const sourceMessageIds = new Set(Array.isArray(request.policy?.source_message_ids) ? request.policy.source_message_ids.map(String) : []);
const currentMessages = request.messages.filter((message) => sourceMessageIds.has(String(message.message_id)));
if (sourceMessageIds.size === 0 || currentMessages.length !== sourceMessageIds.size) throw new Error('brain_request_source_messages_invalid');
const currentLeadMessages = currentMessages.filter((message) => message.author === 'lead');
const currentMessage = currentLeadMessages.at(-1) || currentMessages.at(-1);
if (!currentMessage) throw new Error('brain_request_current_message_missing');
const historico = request.messages.map((message) => ({
  autor: message.author === 'lead' ? 'cliente' : message.author === 'human_agent' ? 'equipe_humana' : 'agente_ia',
  direccao: message.direction === 'inbound' ? 'recebida' : 'enviada', origem: message.author === 'human_agent' ? 'humano' : 'workflow',
  tipo: message.media?.kind || 'texto', conteudo: message.text || message.media?.extracted_text || message.media?.caption || '', criado_em: message.occurred_at,
}));
return [{ json: { request, payload: { cliente: { slug: request.scope.cliente_slug, canal: request.scope.channel },
  contacto: request.contact, mensagem: { actual: currentMessage.text || currentMessage.media?.extracted_text || currentMessage.media?.caption || '', tipo: currentMessage.media?.kind || 'texto' },
  historico, contexto: { tipo_assunto: request.operational_context.intent, confianca: request.operational_context.confidence,
    resumo: request.operational_context.summary, dados: request.company_fields },
  intervencao_humana: { houve: historico.some((message) => message.autor === 'equipe_humana') },
  operacao: { modo_teste: wrapper.delivery_mode === 'simulate', invocation_id: request.invocation_id } } } }];`);
  const emit = code(w, "Emitir Brain Result sem efeitos diretos", `
const request = $('Validar Brain Request V2').first().json.request;
const output = $input.first().json || {};
const uuid = (seed) => ${uuidExpression("seed")};
const audits = Array.isArray(output.operacoes?.tool_audit) ? output.operacoes.tool_audit.filter((audit) => audit && ['availability.check','appointment.create','appointment.cancel','other'].includes(audit.operation) && ['succeeded','failed'].includes(audit.result)) : [];
const events = Array.isArray(output.operacoes?.domain_events) ? output.operacoes.domain_events.filter((event) => {
  if (!event || event.schema_version !== 'lexia.domain.event.v1' || event.invocation_id !== request.invocation_id) return false;
  if (event.type === 'appointment.confirmed' || event.type === 'appointment.cancelled') {
    const operation = event.type === 'appointment.confirmed' ? 'appointment.create' : 'appointment.cancel';
    return audits.some((audit) => audit.invocation_id === event.appointment?.tool_invocation_id && audit.operation === operation && audit.result === 'succeeded' && audit.appointment_ref === event.appointment?.appointment_ref);
  }
  return event.type === 'handoff.requested';
}) : [];
const handoff = output.handoff || {};
if (handoff.necessario === true) {
  const handoffRef = uuid(request.invocation_id + ':handoff');
  events.push({ schema_version: 'lexia.domain.event.v1', event_id: uuid(handoffRef + ':event'), invocation_id: request.invocation_id,
    idempotency_key: 'handoff:' + request.invocation_id, type: 'handoff.requested', occurred_at: new Date().toISOString(),
    handoff: { handoff_ref: handoffRef, reason: String(handoff.motivo || 'human_assistance'), summary: String(handoff.resumo_para_equipa || ''),
      priority: ['low','normal','high'].includes(handoff.prioridade) ? handoff.prioridade : 'normal' } });
}
const deliveries = Array.isArray(output.entregas) ? output.entregas : [];
const actions = deliveries.map((delivery, index) => {
  const rawType = String(delivery.tipo || delivery.type || 'text').toLowerCase();
  const type = rawType === 'imagem' ? 'image' : rawType === 'audio' || rawType === 'áudio' ? 'audio' : 'text';
  const content = type === 'text' ? { type, text: String(delivery.texto || delivery.text || '').trim() }
    : { type, media_ref: String(delivery.media_ref || delivery.url || ''), ...(delivery.legenda ? { caption: String(delivery.legenda) } : {}) };
  return { schema_version: 'lexia.outbound.action.v1', action_id: uuid(request.invocation_id + ':action:' + (index + 1)),
    invocation_id: request.invocation_id, scope: request.scope, sequence: index + 1,
    kind: delivery.kind === 'appointment_confirmation' ? 'appointment_confirmation' : 'reply',
    captured_state: request.state, content, ...(delivery.appointment_ref ? { source_ref: String(delivery.appointment_ref) } : {}) };
}).filter((action) => action.content.type === 'text' ? Boolean(action.content.text) : Boolean(action.content.media_ref));
const result = { schema_version: 'lexia.brain.result.v1', invocation_id: request.invocation_id, captured_state: request.state,
  decision: handoff.necessario === true ? 'handoff' : actions.length ? 'reply' : 'no_reply',
  actions, context_patch: output.contexto_actualizado || {}, domain_events: events, tool_audit: audits };
return [{ json: { result } }];`);

  w.connect("When Executed by Another Workflow", validate);
  w.connect(validate, "Preparar Entrada");
  w.connect("Validar Saída Cérebro", emit);

  for (const nodeName of ["verificar_disponibilidade", "criar_agendamento"]) {
    const node = w.nodes.find((value) => value.name === nodeName);
    if (!node) continue;
    node.parameters.workflowId = {
      __rl: true,
      mode: "list",
      value: "",
      cachedResultName:
        nodeName === "verificar_disponibilidade"
          ? `${CANDIDATE_PREFIX} - 12 VERIFICAR DISPONIBILIDADE V2`
          : `${CANDIDATE_PREFIX} - 11 CRIAR AGENDAMENTO V2`,
    };
    const workflowInputs = (node.parameters.workflowInputs ?? {}) as Record<string, unknown>;
    const values = { ...((workflowInputs.value ?? {}) as Record<string, unknown>) };
    for (const unsafe of ["uazapi_base_url", "uazapi_token", "numero_equipe", "telefone_conversa", "canal"]) delete values[unsafe];
    values.invocation_id = "={{ $('Validar Brain Request V2').first().json.request.invocation_id }}";
    values.tool_invocation_id = `={{ $('Validar Brain Request V2').first().json.request.invocation_id + ':${nodeName === "criar_agendamento" ? "appointment:create" : "availability:check"}' }}`;
    values.scope = "={{ $('Validar Brain Request V2').first().json.request.scope }}";
    const schema = Array.isArray(workflowInputs.schema)
      ? (workflowInputs.schema as Array<Record<string, unknown>>).filter(
          (field) => !["uazapi_base_url", "uazapi_token", "numero_equipe", "telefone_conversa", "canal"].includes(String(field.id)),
        )
      : [];
    for (const [id, type] of [["invocation_id", "string"], ["tool_invocation_id", "string"], ["scope", "object"]] as const) {
      if (!schema.some((field) => field.id === id)) schema.push({ id, displayName: id, required: true, defaultMatch: false, display: true, canBeUsedToMatch: true, type, removed: false });
    }
    node.parameters.workflowInputs = { ...workflowInputs, mappingMode: "defineBelow", value: values, schema };
  }
  const schedulingAgent = w.nodes.find((node) => node.name === "Orquestrador de Agendamento");
  if (schedulingAgent) {
    const options = (schedulingAgent.parameters.options ?? {}) as Record<string, unknown>;
    options.systemMessage = `${String(options.systemMessage ?? "")}\n\nCONTRATO LEXIA V2: preserve integralmente tool_audit e domain_events devolvidos pelas tools. verificar_disponibilidade nunca comprova criação de agendamento. Não invente referências, horários, timezone ou sucesso de tool. O cérebro propõe ações; ele nunca envia, pausa Redis ou notifica diretamente.`;
    schedulingAgent.parameters.options = options;
  }
  const redactor = w.nodes.find((node) => node.name === "Redator — Voz do Cliente");
  if (redactor) {
    const options = (redactor.parameters.options ?? {}) as Record<string, unknown>;
    options.systemMessage = `${String(options.systemMessage ?? "")}\n\nCONVERSA LEXIA V2: depois que já existir qualquer mensagem da Carol no histórico, nunca volte a se apresentar, nunca reinicie com uma saudação e nunca repita fatos já enviados. Considere também saídas virtuais do laboratório como falas anteriores da Carol. Se a mensagem mais recente do lead respondeu uma pergunta anterior, reconheça a informação e avance; não faça a mesma pergunta com outras palavras nem traduzida para outro idioma. Em turnos normais, prefira um único balão de até 180 caracteres e no máximo duas frases curtas. Faça no máximo uma pergunta por resposta. Dois balões só são aceitáveis quando separam uma confirmação oficial, endereço, horários reais ou outro conteúdo que não caiba com clareza em um balão curto.`;
    redactor.parameters.options = options;
  }
  const finalOutput = w.nodes.find((node) => node.name === "Montar Saída Final");
  if (finalOutput) {
    const original = String(finalOutput.parameters.jsCode ?? "");
    const marker = `const jaFalamosAntes = (pacote.historico || []).some(h =>
  ((h.direccao || h.direcao) === 'enviada')
);`;
    if (!original.includes(marker)) throw new Error("Miranda output first-interaction guard not found.");
    finalOutput.parameters.jsCode = original.replace(marker, `${marker}
// O histórico central é a autoridade para saber se a Carol já falou. Em turnos
// posteriores, remove reapresentações e respostas quase idênticas antes de
// criar ações de saída. A trava é determinística e independe do modelo.
if (jaFalamosAntes) {
  const identidadeCarol = /\\b(?:sou|soy|i\\s*(?:'m|am))\\b[^.!?]{0,100}\\bcarol\\b|\\bcarol\\b[^.!?]{0,80}\\bmiranda skin experts\\b/i;
  const anteriores = (pacote.historico || []).filter((item) => (item.direccao || item.direcao) === 'enviada')
    .slice(-8).map((item) => String(item.conteudo || '')).filter(Boolean);
  const frasesAnteriores = anteriores.flatMap((mensagem) => String(mensagem).split(/(?<=[.!?])\\s+|\\n+/))
    .map((frase) => frase.trim()).filter(Boolean);
  const saudacaoReiniciada = /^(?:[¡¿]?\\s*)?(?:ol[áa]+|oi+|hola+|hello|hi|hey+|bom dia|boa tarde|boa noite|good (?:morning|afternoon|evening)|buen(?:os d[ií]as|as tardes|as noches)|tudo bem|todo bien|how are you)(?:[,.!¿?¡\\s]+(?:tudo bem|todo bien|how are you))?[,.!¿?¡\\s]*$/i;
  mensagens = mensagens.map((mensagem) => String(mensagem).split(/(?<=[.!?])\\s+|\\n+/)
    .map((frase) => frase.trim()).filter((frase, index) => frase && !identidadeCarol.test(frase) &&
      !(index === 0 && saudacaoReiniciada.test(frase)) && !frasesAnteriores.some((anterior) => saoParecidas(anterior, frase)))
    .join(' ').trim()).filter(Boolean);
  mensagens = mensagens.filter((mensagem) => !anteriores.some((anterior) => saoParecidas(anterior, mensagem)));
}
let perguntaMantida = false;
mensagens = mensagens.map((mensagem) => String(mensagem).split(/(?<=[.!?])\\s+|\\n+/).map((frase) => frase.trim()).filter((frase) => {
  if (!frase.includes('?')) return true;
  if (perguntaMantida) return false;
  perguntaMantida = true;
  return true;
}).join(' ').trim()).filter(Boolean);`);
  }
  return w.done();
}

function patchPrivateCalendarNode(node: ReturnType<typeof cloneNode>) {
  if (node.type !== "n8n-nodes-base.googleCalendar") return;
  node.parameters.calendar = {
    __rl: true,
    mode: "id",
    value: "={{ $env.LEXIA_MIRANDA_CALENDAR_ID }}",
  };
  const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  if ("location" in additional) additional.location = "={{ $env.LEXIA_MIRANDA_LOCATION_LABEL || '' }}";
  node.parameters.additionalFields = additional;
}

function buildAvailability(sources: SourceSet) {
  const source = sources.availability;
  const w = workflow("12 VERIFICAR DISPONIBILIDADE V2");
  const kept = new Set(source.nodes.map((node) => node.name));
  for (const sourceNode of source.nodes) {
    const node = cloneNode(source, sourceNode.name);
    patchPrivateCalendarNode(node);
    w.add(node.name, node.type, node.typeVersion, node.parameters, { retryOnFail: false, onError: node.onError });
  }
  copyConnections(w, source, kept);
  w.node("When Executed by Another Workflow").parameters = { inputSource: "passthrough" };
  removeConnection(w, "When Executed by Another Workflow", "Get many rows");
  const validate = code(w, "Validar solicitação de disponibilidade", `
const input = $input.first().json;
if (!input.servico || !input.invocation_id || !input.tool_invocation_id) throw new Error('availability_request_invalid');
return [{ json: input }];`);
  const success = code(w, "Emitir disponibilidade sem confirmar agendamento", `
const input = $('Validar solicitação de disponibilidade').first().json;
return [{ json: { status: 'OK', availability: $input.all().map((item) => item.json),
  tool_audit: [{ invocation_id: input.tool_invocation_id, operation: 'availability.check', result: 'succeeded' }], domain_events: [] } }];`);
  const failed = code(w, "Emitir falha de disponibilidade", `
const input = $('Validar solicitação de disponibilidade').first().json;
return [{ json: { status: 'ERRO', message: $input.first().json.mensagem || 'availability_failed',
  tool_audit: [{ invocation_id: input.tool_invocation_id, operation: 'availability.check', result: 'failed' }], domain_events: [] } }];`);
  w.connect("When Executed by Another Workflow", validate);
  w.connect(validate, "Get many rows");
  w.connect("Calcular Slots", success);
  w.connect("Saída Erro", failed);
  return w.done();
}

function buildAppointment(sources: SourceSet) {
  const source = sources.createAppointment;
  const keepNames = [
    "When Executed by Another Workflow",
    "Get many rows",
    "Validar Pedido",
    "Validação OK?",
    "Evento confirmado?",
    "Checar Duplicidade",
    "Sem duplicado?",
    "Get many events",
    "Checar Conflito",
    "Livre?",
    "Create an event",
    "Create a row",
    "Saída Erro",
    "Saída Erro1",
    "Saída Erro2",
  ];
  const kept = new Set(keepNames);
  const w = workflow("11 CRIAR AGENDAMENTO V2");
  for (const sourceNode of source.nodes) {
    if (!kept.has(sourceNode.name)) continue;
    const node = cloneNode(source, sourceNode.name);
    patchPrivateCalendarNode(node);
    const continueError = ["Create an event", "Create a row"].includes(node.name);
    w.add(node.name, node.type, node.typeVersion, node.parameters, {
      retryOnFail: false,
      onError: continueError ? "continueErrorOutput" : node.onError,
    });
  }
  copyConnections(w, source, kept);
  w.node("When Executed by Another Workflow").parameters = { inputSource: "passthrough" };
  removeConnection(w, "When Executed by Another Workflow", "Get many rows");
  const validate = code(w, "Validar contrato de criação", `
const input = $input.first().json;
for (const field of ['servico','inicio_iso','nome','telefone','idioma','invocation_id','tool_invocation_id']) if (!String(input[field] || '').trim()) throw new Error('appointment_request_missing_' + field);
if (!input.scope || input.scope.cliente_slug !== 'miranda_skin_experts') throw new Error('appointment_scope_invalid');
return [{ json: input }];`);
  const success = code(w, "Emitir agendamento atestado", `
const request = $('Validar contrato de criação').first().json;
const calendar = $('Create an event').first().json;
const cfg = $('Checar Conflito').first().json;
const appointmentRef = String(calendar.id || '').trim();
if (!appointmentRef || !cfg.inicio || !cfg.fim) throw new Error('appointment_effect_not_confirmed');
const eventId = ${uuidExpression("request.tool_invocation_id + ':appointment:confirmed'")};
const domain = { schema_version: 'lexia.domain.event.v1', event_id: eventId, invocation_id: request.invocation_id,
  idempotency_key: 'appointment:' + appointmentRef + ':confirmed', type: 'appointment.confirmed', occurred_at: new Date().toISOString(),
  appointment: { appointment_ref: appointmentRef, status: 'confirmed', starts_at: cfg.inicio, ends_at: cfg.fim,
    timezone: $env.LEXIA_MIRANDA_TIMEZONE || 'America/New_York', tool_invocation_id: request.tool_invocation_id } };
return [{ json: { status: 'CRIADO', appointment_ref: appointmentRef, starts_at: cfg.inicio, ends_at: cfg.fim,
  confirmation_text: 'Agendamento confirmado.',
  tool_audit: [{ invocation_id: request.tool_invocation_id, operation: 'appointment.create', result: 'succeeded', appointment_ref: appointmentRef }],
  domain_events: [domain] } }];`);
  const failed = code(w, "Emitir falha sem evento confirmado", `
const request = $('Validar contrato de criação').first().json;
const value = $input.first().json || {};
return [{ json: { status: value.status || 'ERRO', message: value.mensagem || 'appointment_creation_failed', reconciliation_required: Boolean(value.error),
  tool_audit: [{ invocation_id: request.tool_invocation_id, operation: 'appointment.create', result: 'failed' }], domain_events: [] } }];`);
  w.connect("When Executed by Another Workflow", validate);
  w.connect(validate, "Get many rows");
  w.connect("Create a row", success, 0);
  w.connect("Create a row", failed, 1);
  w.connect("Create an event", failed, 1);
  w.connect("Saída Erro", failed);
  w.connect("Saída Erro1", failed);
  w.connect("Saída Erro2", failed);
  return w.done();
}

function buildMaster() {
  const w = workflow("00 MESTRE OMNICHANNEL V2");
  const receive = trigger(w);
  const ingress = subworkflow(w, "Persistir antes de decidir", "01 INGRESSO DURÁVEL V2");
  const route = switchNode(w, "Rotear mensagem já persistida", "$json.route", [
    "process",
    "human_intervention",
    "pending",
    "automatic_echo",
    "duplicate",
  ]);
  const mediaLead = subworkflow(w, "Processar mídia do lead", "02 MÍDIA APÓS BLOQUEIO V2");
  const mediaHuman = subworkflow(w, "Processar mídia humana depois da pausa", "02 MÍDIA APÓS BLOQUEIO V2");
  const humanStop = code(w, "Encerrar intervenção antes da IA", `
const input = $input.first().json;
return [{ json: { status: 'blocked_by_human_intervention', message_persisted: true, media_status: input.media_result?.status || 'not_applicable', provider_send_attempted: false } }];`);
  const policy = rest(
    w,
    "Carregar janela de buffer da empresa",
    "'/rest/v1/lexia_omnichannel_policies?environment=eq.' + encodeURIComponent($json.event.scope.environment) + '&cliente_slug=eq.' + encodeURIComponent($json.event.scope.cliente_slug) + '&status=eq.active&select=buffer_window_ms,resume_mode&limit=2'",
  );
  const waitInput = code(w, "Validar política antes do buffer", `
const input = $('Processar mídia do lead').first().json;
const rows = ${responseBody("Carregar janela de buffer da empresa")};
if (!Array.isArray(rows) || rows.length !== 1) throw new Error('omnichannel_policy_unavailable');
return [{ json: { ...input, buffer_window_seconds: Math.max(1, Math.ceil(Number(rows[0].buffer_window_ms) / 1000)), resume_mode: rows[0].resume_mode } }];`);
  const wait = w.add("Aguardar janela configurada", "n8n-nodes-base.wait", 1.1, {
    amount: "={{ $json.buffer_window_seconds }}",
    unit: "seconds",
  });
  const claimInput = code(w, "Preparar claim atômico", `
const input = $input.first().json;
return [{ json: { ...input, rpc_body: { p_conversation_id: input.conversation_id, p_candidate_seq: input.lead_seq } } }];`);
  const claim = rpc(w, "Reivindicar lote sem GET DEL", "lexia_omni_claim_inbound_batch");
  const evaluate = code(w, "Avaliar lote reivindicado", `
const input = $('Preparar claim atômico').first().json;
const rows = ${responseBody("Reivindicar lote sem GET DEL")};
const result = Array.isArray(rows) ? rows[0] : rows;
if (!result) throw new Error('batch_claim_result_missing');
return [{ json: { ...input, claimed: result.out_claimed === true, claim_reason: result.out_reason || null,
  batch_id: result.out_batch_id, batch_fencing_token: Number(result.out_fencing_token || 0),
  lead_cutoff_seq: Number(result.out_cutoff_seq || 0), mensagem_ids: result.out_mensagem_ids || [],
  superseded_invocation_ids: result.out_superseded_invocation_ids || [], claim_attempts: 1 } }];`);
  const claimed = ifNode(w, "Lote ainda permitido?", "$json.claimed === true");
  const retryWindow = ifNode(
    w,
    "Claim deve aguardar?",
    "$json.claimed !== true && ['window_open','batch_in_progress','newer_message_waiting'].includes($json.claim_reason) && Number($json.claim_attempts || 1) < 60",
  );
  const readinessWait = w.add(
    "Aguardar liberação ou novo debounce",
    "n8n-nodes-base.wait",
    1.1,
    {
      amount: 1,
      unit: "seconds",
    },
  );
  const retryState = rest(
    w,
    "Carregar sequência para nova tentativa",
    "'/rest/v1/lexia_conversation_states?id=eq.' + encodeURIComponent($json.conversation_id) + '&environment=eq.' + encodeURIComponent($json.event.scope.environment) + '&cliente_slug=eq.' + encodeURIComponent($json.event.scope.cliente_slug) + '&select=id,lead_message_seq&limit=1'",
  );
  const retryInput = code(w, "Preparar nova tentativa de claim", `
const input = $('Aguardar liberação ou novo debounce').item.json;
const rows = ${responseBody("Carregar sequência para nova tentativa")};
if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== input.conversation_id) throw new Error('batch_retry_state_unavailable');
const candidateSeq = Number(rows[0].lead_message_seq || 0);
if (!Number.isSafeInteger(candidateSeq) || candidateSeq < 1) throw new Error('batch_retry_sequence_invalid');
return [{ json: { ...input, claim_attempts: Number(input.claim_attempts || 1) + 1,
  rpc_body: { p_conversation_id: input.conversation_id, p_candidate_seq: candidateSeq } } }];`);
  const readinessClaim = rpc(
    w,
    "Reivindicar lote após prontidão",
    "lexia_omni_claim_inbound_batch",
  );
  const readinessEvaluate = code(w, "Avaliar lote após prontidão", `
const input = $('Preparar nova tentativa de claim').item.json;
const rows = ${responseBody("Reivindicar lote após prontidão")};
const result = Array.isArray(rows) ? rows[0] : rows;
if (!result) throw new Error('batch_readiness_claim_result_missing');
return [{ json: { ...input, claimed: result.out_claimed === true, claim_reason: result.out_reason || null,
  batch_id: result.out_batch_id, batch_fencing_token: Number(result.out_fencing_token || 0),
  lead_cutoff_seq: Number(result.out_cutoff_seq || 0), mensagem_ids: result.out_mensagem_ids || [],
  superseded_invocation_ids: result.out_superseded_invocation_ids || [] } }];`);
  const readinessClaimed = ifNode(
    w,
    "Lote permitido após prontidão?",
    "$json.claimed === true",
  );
  const context = subworkflow(w, "Executar contexto e cérebro", "03 CONTEXTO E CÉREBRO V2");
  const stop = code(w, "Encerrar sem efeito automático", `
const input = $input.first().json;
const retryable = ['window_open','batch_in_progress','newer_message_waiting'].includes(input.claim_reason);
const status = retryable && Number(input.claim_attempts || 1) >= 60 ? 'buffer_retry_exhausted' : (input.claim_reason || input.route || 'not_processed');
return [{ json: { status, reason: input.claim_reason || null, message_persisted: input.duplicate !== true, provider_send_attempted: false } }];`);

  w.connect(receive, ingress);
  w.connect(ingress, route);
  w.connect(route, mediaLead, 0);
  w.connect(route, mediaHuman, 1);
  w.connect(route, stop, 2);
  w.connect(route, stop, 3);
  w.connect(route, stop, 4);
  w.connect(route, stop, 5);
  w.connect(mediaHuman, humanStop);
  w.connect(mediaLead, policy);
  w.connect(policy, waitInput);
  w.connect(waitInput, wait);
  w.connect(wait, claimInput);
  w.connect(claimInput, claim);
  w.connect(claim, evaluate);
  w.connect(evaluate, claimed);
  w.connect(claimed, context, 0);
  w.connect(claimed, retryWindow, 1);
  w.connect(retryWindow, readinessWait, 0);
  w.connect(retryWindow, stop, 1);
  w.connect(readinessWait, retryState);
  w.connect(retryState, retryInput);
  w.connect(retryInput, readinessClaim);
  w.connect(readinessClaim, readinessEvaluate);
  w.connect(readinessEvaluate, readinessClaimed);
  w.connect(readinessClaimed, context, 0);
  w.connect(readinessClaimed, retryWindow, 1);
  return w.done();
}

function buildAdapters() {
  const w = workflow("00A ADAPTADORES CONFIÁVEIS V2");
  const zapiWebhook = w.add("Webhook interno Z-API", "n8n-nodes-base.webhook", 2, {
    httpMethod: "POST",
    path: "lexia-v2-miranda-zapi",
    authentication: "headerAuth",
    responseMode: "onReceived",
    options: {},
  });
  const metaWebhook = w.add("Webhook interno Meta", "n8n-nodes-base.webhook", 2, {
    httpMethod: "POST",
    path: "lexia-v2-miranda-meta",
    authentication: "headerAuth",
    responseMode: "onReceived",
    options: {},
  });
  const testWebhook = w.add("Webhook de teste da plataforma", "n8n-nodes-base.webhook", 2, {
    httpMethod: "POST",
    path: "lexia-v2-test-miranda-omnichannel",
    authentication: "headerAuth",
    responseMode: "responseNode",
    options: {},
  });
  const zapi = code(w, "Normalizar Z-API sem confiar no tenant", `
const raw = $input.first().json.body || $input.first().json;
if (String(raw.type || '') !== 'ReceivedCallback' || raw.notification || raw.isGroup === true || raw.isNewsletter === true || raw.isStatusReply === true || raw.broadcast === true || raw.isEdit === true) return [];
const phone = String(raw.phone || '').replace(/[^0-9]/g, '');
if (!phone || String(raw.phone || '').endsWith('@lid')) return [];
let kind = 'text', mediaRef = '', mime = '', caption = '', text = String(raw.text?.message || '');
if (raw.image) { kind = 'image'; mediaRef = String(raw.image.imageUrl || ''); mime = String(raw.image.mimeType || ''); caption = String(raw.image.caption || ''); }
else if (raw.audio) { kind = 'audio'; mediaRef = String(raw.audio.audioUrl || ''); mime = String(raw.audio.mimeType || ''); }
else if (raw.video) { kind = 'video'; mediaRef = String(raw.video.videoUrl || ''); mime = String(raw.video.mimeType || ''); caption = String(raw.video.caption || ''); }
else if (raw.document) { kind = 'pdf'; mediaRef = String(raw.document.documentUrl || ''); mime = String(raw.document.mimeType || ''); caption = String(raw.document.title || raw.document.fileName || ''); }
if (!text && !mediaRef && !caption) return [];
const occurredAt = raw.momment ? new Date(Number(raw.momment)).toISOString() : new Date().toISOString();
const providerId = String(raw.messageId || ''); if (!providerId) return [];
const eventId = ${uuidExpression("providerId + ':zapi:event'")};
const correlationId = ${uuidExpression("providerId + ':zapi:correlation'")};
const echoCandidate = raw.fromMe === true;
const event = { schema_version: 'lexia.ingress.event.v1', event_id: eventId, provider_event_id: providerId, correlation_id: correlationId,
  scope: { environment: 'local', cliente_slug: 'untrusted', channel: 'whatsapp', account_ref: '00000000-0000-4000-8000-000000000000', conversation_ref: phone },
  provider: 'zapi', event_type: 'message', occurred_at: occurredAt,
  message: { schema_version: 'lexia.message.v1', event_id: eventId, provider_event_id: providerId, message_id: providerId, scope: {},
    author: echoCandidate ? 'human_agent' : 'lead', direction: echoCandidate ? 'outbound' : 'inbound', occurred_at: occurredAt,
    ...(text ? { text } : {}), media: { kind, provider_media_ref: mediaRef || undefined, mime_type: mime || undefined, caption: caption || undefined, processing_status: kind === 'text' ? 'completed' : 'pending' },
    ...(raw.externalAdReply ? { ad_origin: { source_type: 'click_to_whatsapp', campaign_ref: raw.externalAdReply.campaignId ? String(raw.externalAdReply.campaignId) : undefined, adset_ref: raw.externalAdReply.adsetId ? String(raw.externalAdReply.adsetId) : undefined, ad_ref: raw.externalAdReply.sourceId ? String(raw.externalAdReply.sourceId) : undefined } } : {}) },
  contact: { provider_contact_ref: phone, display_name: String(raw.chatName || raw.senderName || 'Contato sem nome'), phone }, capability_refs: [] };
return [{ json: { trusted_account_id: $env.LEXIA_MIRANDA_ZAPI_ACCOUNT_ID, echo_candidate: echoCandidate, trusted_media_download_url: mediaRef || null, event, delivery_mode: $env.LEXIA_DELIVERY_MODE || 'observe_only' } }];`);
  const meta = code(w, "Normalizar Meta sem token inline", `
const raw = $input.first().json.body || $input.first().json;
const channel = raw.object === 'instagram' ? 'instagram' : 'messenger';
const account = channel === 'instagram' ? $env.LEXIA_MIRANDA_INSTAGRAM_ACCOUNT_ID : $env.LEXIA_MIRANDA_MESSENGER_ACCOUNT_ID;
if (!account) throw new Error('meta_account_binding_missing');
const output = [];
for (const entry of Array.isArray(raw.entry) ? raw.entry : []) {
  for (const messaging of Array.isArray(entry?.messaging) ? entry.messaging : []) {
    const message = messaging.message || null, postback = messaging.postback || null;
    if (!message && !postback) continue;
    if (message?.reaction || message?.is_deleted === true || message?.is_unsupported === true) continue;
    const sender = String(messaging.sender?.id || ''), recipient = String(messaging.recipient?.id || '');
    if (!sender || !recipient) continue;
    const echoCandidate = message?.is_echo === true;
    const conversationRef = echoCandidate ? recipient : sender;
    const providerId = String(message?.mid || postback?.mid || ['postback', sender, messaging.timestamp || '', postback?.payload || ''].join(':'));
    if (!providerId) continue;
    const attachment = message?.attachments?.[0] || null;
    const attachmentType = String(attachment?.type || '');
    const kind = attachmentType === 'image' ? 'image' : attachmentType === 'audio' ? 'audio' : attachmentType === 'video' ? 'video' : attachmentType === 'file' ? 'pdf' : 'text';
    const mediaRef = String(attachment?.payload?.url || ''), text = String(postback?.title || message?.text || '').trim();
    if (!text && !mediaRef) continue;
    const occurredAt = new Date(Number(messaging.timestamp || Date.now())).toISOString();
    const eventId = ${uuidExpression("providerId + ':meta:event'")};
    const correlationId = ${uuidExpression("providerId + ':meta:correlation'")};
    const referral = messaging.referral || message?.referral || null;
    const event = { schema_version: 'lexia.ingress.event.v1', event_id: eventId, provider_event_id: providerId, correlation_id: correlationId,
      scope: { environment: 'local', cliente_slug: 'untrusted', channel, account_ref: '00000000-0000-4000-8000-000000000000', conversation_ref: conversationRef },
      provider: 'meta', event_type: 'message', occurred_at: occurredAt,
      message: { schema_version: 'lexia.message.v1', event_id: eventId, provider_event_id: providerId, message_id: providerId, scope: {},
        author: echoCandidate ? 'human_agent' : 'lead', direction: echoCandidate ? 'outbound' : 'inbound', occurred_at: occurredAt,
        ...(text ? { text } : {}), media: { kind, provider_media_ref: mediaRef || undefined, processing_status: kind === 'text' ? 'completed' : 'pending' },
        ...(referral ? { ad_origin: { source_type: 'meta_ad', campaign_ref: referral.campaign_id ? String(referral.campaign_id) : undefined, adset_ref: referral.adset_id ? String(referral.adset_id) : undefined, ad_ref: referral.ad_id ? String(referral.ad_id) : undefined, fbclid: referral.fbclid ? String(referral.fbclid) : undefined } } : {}) },
      contact: { provider_contact_ref: conversationRef, display_name: 'Contato Meta' }, capability_refs: [] };
    output.push({ json: { trusted_account_id: account, echo_candidate: echoCandidate, trusted_media_download_url: mediaRef || null, event, delivery_mode: $env.LEXIA_DELIVERY_MODE || 'observe_only' } });
  }
}
return output;`);
  const test = code(w, "Validar teste sintético", `
const body = $input.first().json.body || $input.first().json;
if (body.schema_version !== 'lexia.workflow.test.request.v1' || body.delivery_mode !== 'simulate') throw new Error('workflow_test_contract_invalid');
if (!['isolated_test','staging'].includes(body.scope?.environment) || body.expectations?.provider_send !== false) throw new Error('workflow_test_environment_denied');
const occurredAt = new Date().toISOString();
const eventId = ${uuidExpression("body.run_id + ':test:event'")};
return [{ json: { trusted_account_id: body.scope.account_ref, delivery_mode: 'observe_only', echo_candidate: false, event: {
  schema_version: 'lexia.ingress.event.v1', event_id: eventId, provider_event_id: body.input.message_id, correlation_id: body.run_id,
  scope: body.scope, provider: 'fake', event_type: 'message', occurred_at: occurredAt,
  message: { schema_version: 'lexia.message.v1', event_id: eventId, provider_event_id: body.input.message_id, message_id: body.input.message_id,
    scope: body.scope, author: 'lead', direction: 'inbound', occurred_at: occurredAt, text: body.input.text, media: { kind: 'text', processing_status: 'completed' } },
  contact: { provider_contact_ref: body.scope.conversation_ref, display_name: 'Lead sintético' }, capability_refs: [] },
  workflow_test: { run_id: body.run_id, target: body.target } } }];`);
  const masterZapi = subworkflow(w, "Executar mestre Z-API", "00 MESTRE OMNICHANNEL V2");
  const masterMeta = subworkflow(w, "Executar mestre Meta", "00 MESTRE OMNICHANNEL V2");
  const masterTest = subworkflow(w, "Executar mestre em simulação", "00 MESTRE OMNICHANNEL V2");
  const response = w.add("Responder teste", "n8n-nodes-base.respondToWebhook", 1.4, {
    respondWith: "json",
    responseBody: "={{ { schema_version: 'lexia.workflow.test.result.v1', run_id: $('Validar teste sintético').first().json.workflow_test.run_id, target: 'omnichannel', status: 'completed', provider_send_attempted: false, summary: 'Execução sintética concluída sem provedor real.', output: $json } }}",
    options: {},
  });
  w.connect(zapiWebhook, zapi);
  w.connect(metaWebhook, meta);
  w.connect(testWebhook, test);
  w.connect(zapi, masterZapi);
  w.connect(meta, masterMeta);
  w.connect(test, masterTest);
  w.connect(masterTest, response);
  return w.done();
}

function buildAutomationGateway() {
  const w = workflow("09 AUTOMAÇÕES PELO GATE V2");
  const receive = trigger(w);
  const validate = code(w, "Validar pedido de automação", `
const input = $input.first().json;
const request = input.request || input;
if (request?.schema_version !== 'lexia.automation.request.v1' || !['appointment_reminder','followup'].includes(request.kind)) throw new Error('automation_contract_invalid');
if (!request.request_id || !request.conversation_id || !request.scope || !Array.isArray(request.proposed_actions) || request.proposed_actions.length === 0) throw new Error('automation_fields_invalid');
return [{ json: { request, delivery_mode: input.delivery_mode || 'observe_only', rpc_body: {
  p_request_id: request.request_id, p_conversation_id: request.conversation_id, p_kind: request.kind,
  p_source_ref: request.source_ref, p_due_at: request.due_at,
} } }];`);
  const register = rpc(w, "Registrar automação idempotente", "lexia_omni_register_automation_request");
  const evaluate = code(w, "Avaliar pedido e montar evento CRM", `
const input = $('Validar pedido de automação').first().json;
const rows = ${responseBody("Registrar automação idempotente")};
const result = Array.isArray(rows) ? rows[0] : rows;
if (!result) throw new Error('automation_result_missing');
const event = { schema_version: 'lexia.crm.event.v1', event_id: ${uuidExpression("input.request.request_id + ':crm:registered'")},
  idempotency_key: input.request.request_id + ':registered', correlation_id: input.request.correlation_id,
  event_type: 'automation.updated', occurred_at: new Date().toISOString(), emitted_at: new Date().toISOString(), sequence: 10,
  scope: input.request.scope, source: { system: 'workflow', authority: 'workflow_execution', workflow_ref: 'miranda-v2-automation', execution_ref: $execution.id },
  payload: { automation_ref: input.request.request_id, automation_type: input.request.kind, status: result.out_status,
    source_ref: input.request.source_ref, due_at: input.request.due_at, ...(result.out_reason ? { reason: result.out_reason } : {}) } };
return [{ json: { events: [event], passthrough: { ...input, registration: result, accepted: result.out_status === 'accepted' } } }];`);
  const syncRegistered = subworkflow(w, "Espelhar automação no CRM", "07 CRM SYNC V2");
  const accepted = ifNode(w, "Automação aceita?", "$json.passthrough.accepted === true");
  const deliveryInput = code(w, "Montar plano da automação", `
const input = $input.first().json.passthrough;
const request = input.request;
const actions = request.proposed_actions.map((action, index) => ({ ...action, sequence: index + 1,
  invocation_id: request.request_id, scope: request.scope, kind: request.kind, source_ref: request.source_ref }));
return [{ json: { conversation_id: request.conversation_id, invocation_id: request.request_id,
  correlation_id: request.correlation_id, automation_request_id: request.request_id,
  actions, delivery_mode: input.delivery_mode, claimant: 'automation:' + request.request_id } }];`);
  const delivery = subworkflow(w, "Entregar automação pelo gate", "06 DELIVERY GATE V2");
  const finalEvent = code(w, "Espelhar resultado da automação", `
const input = $('Validar pedido de automação').first().json;
const delivery = $input.first().json;
const statusMap = { sent: 'sent', failed: 'failed', delivery_unknown: 'delivery_unknown' };
const status = statusMap[delivery.status] || 'suppressed';
const event = { schema_version: 'lexia.crm.event.v1', event_id: ${uuidExpression("input.request.request_id + ':crm:' + status")},
  idempotency_key: input.request.request_id + ':' + status, correlation_id: input.request.correlation_id,
  event_type: 'automation.updated', occurred_at: new Date().toISOString(), emitted_at: new Date().toISOString(), sequence: 20,
  scope: input.request.scope, source: { system: 'workflow', authority: 'workflow_execution', workflow_ref: 'miranda-v2-automation', execution_ref: $execution.id },
  payload: { automation_ref: input.request.request_id, automation_type: input.request.kind, status,
    source_ref: input.request.source_ref, due_at: input.request.due_at, attempted_at: new Date().toISOString(),
    ...(delivery.reason ? { reason: delivery.reason } : {}) } };
return [{ json: { events: [event], passthrough: { request_id: input.request.request_id, status, reason: delivery.reason || null, action_ids: input.request.proposed_actions.map((action) => action.action_id) } } }];`);
  const syncFinal = subworkflow(w, "Espelhar conclusão da automação", "07 CRM SYNC V2");
  const rejected = code(w, "Retornar automação rejeitada ou duplicada", `
const input = $input.first().json.passthrough;
return [{ json: { request_id: input.request.request_id, status: input.registration.out_status, reason: input.registration.out_reason || null, action_ids: [] } }];`);
  const finish = code(w, "Retornar resultado da automação", `
const input = $input.first().json;
if (input.crm_mirrored !== true) throw new Error('crm_automation_not_mirrored');
return [{ json: input.passthrough }];`);

  w.connect(receive, validate);
  w.connect(validate, register);
  w.connect(register, evaluate);
  w.connect(evaluate, syncRegistered);
  w.connect(syncRegistered, accepted);
  w.connect(accepted, deliveryInput, 0);
  w.connect(accepted, rejected, 1);
  w.connect(deliveryInput, delivery);
  w.connect(delivery, finalEvent);
  w.connect(finalEvent, syncFinal);
  w.connect(syncFinal, finish);
  return w.done();
}

function buildFollowup(sources: SourceSet) {
  const source = sources.followup;
  const excluded = new Set([
    "Registrar Eco Follow-up",
    "Enviar Follow-up",
    "Guardar Follow-up no Histórico",
    "Preparar Aviso Samuel",
    "Buscar Perfil do Lead",
    "Montar Link do Aviso",
    "Enviar Aviso Samuel",
    "Atualizar Após Aviso",
  ]);
  const kept = new Set(source.nodes.map((node) => node.name).filter((name) => !excluded.has(name)));
  const w = workflow("13 FOLLOW-UP SEPARADO V2");
  for (const sourceNode of source.nodes) if (kept.has(sourceNode.name)) appendClone(w, source, sourceNode.name);
  copyConnections(w, source, kept);
  w.node("Config Follow-up").parameters = {
    assignments: {
      assignments: [
        { id: "cliente_slug", name: "cliente_slug", type: "string", value: "miranda_skin_experts" },
        { id: "timezone", name: "timezone", type: "string", value: "America/New_York" },
      ],
    },
    options: {},
  };
  const prepareFollowup = w.node("Preparar Envio Follow-up");
  prepareFollowup.parameters.jsCode = String(prepareFollowup.parameters.jsCode ?? "").replace(
    /https:\/\/redacted\.example\.invalid\/removed/g,
    "asset://miranda/followup/default",
  );
  removeConnection(w, "Preparar Envio Follow-up", "Registrar Eco Follow-up");
  removeConnection(w, "Rotear por Ação", "Preparar Aviso Samuel");

  const resolveInput = code(w, "Preparar escopo do follow-up", `
const row = $input.first().json;
const accountId = row.canal === 'whatsapp' ? $env.LEXIA_MIRANDA_ZAPI_ACCOUNT_ID : $env.LEXIA_MIRANDA_INSTAGRAM_ACCOUNT_ID;
if (!row.identificador || !accountId) throw new Error('followup_scope_unavailable');
return [{ json: { row, account_id: accountId, conversation_ref: String(row.identificador) } }];`);
  const conversation = rest(
    w,
    "Resolver conversa do follow-up",
    "'/rest/v1/lexia_conversation_states?account_id=eq.' + encodeURIComponent($json.account_id) + '&conversation_ref=eq.' + encodeURIComponent($json.conversation_ref) + '&select=id,environment,cliente_slug,channel,account_id,conversation_ref,state_version,delivery_epoch&limit=2'",
  );
  const request = code(w, "Montar pedido idempotente de follow-up", `
const input = $('Preparar escopo do follow-up').first().json;
const rows = ${responseBody("Resolver conversa do follow-up")};
if (!Array.isArray(rows) || rows.length !== 1) throw new Error('followup_conversation_not_unique');
const state = rows[0], row = input.row;
const requestId = ${uuidExpression("String(row.id) + ':' + String(row.etapa) + ':' + String(row.proxima_tentativa_em)")};
const actionId = ${uuidExpression("requestId + ':action:1'")};
let content;
if (row.followup_media_ref && row.followup_media_type === 'image') content = { type: 'image', media_ref: String(row.followup_media_ref), ...(row.texto_followup ? { caption: String(row.texto_followup) } : {}) };
else if (row.tipo_envio === 'audio') content = { type: 'audio', media_ref: 'asset://miranda/followup/' + String(row.tema_audio || 'default') };
else content = { type: 'text', text: String(row.texto_followup || '').trim() };
if (content.type === 'text' && !content.text) throw new Error('followup_text_required');
const scope = { environment: state.environment, cliente_slug: state.cliente_slug, channel: state.channel, account_ref: state.account_id, conversation_ref: state.conversation_ref };
return [{ json: { request: { schema_version: 'lexia.automation.request.v1', request_id: requestId,
  correlation_id: ${uuidExpression("requestId + ':correlation'")}, kind: 'followup', conversation_id: state.id, scope,
  source_ref: 'followup:' + row.id + ':' + row.etapa, due_at: row.proxima_tentativa_em,
  proposed_actions: [{ schema_version: 'lexia.outbound.action.v1', action_id: actionId, invocation_id: requestId,
    scope, sequence: 1, kind: 'followup', source_ref: 'followup:' + row.id,
    captured_state: { state_version: Number(state.state_version), delivery_epoch: Number(state.delivery_epoch) }, content }] },
  delivery_mode: $env.LEXIA_DELIVERY_MODE || 'observe_only', source_row: row } }];`);
  const gateway = subworkflow(w, "Enviar follow-up pelo gate comum", "09 AUTOMAÇÕES PELO GATE V2");
  const outcome = code(w, "Classificar resultado do follow-up", `
const request = $('Montar pedido idempotente de follow-up').first().json;
const result = $input.first().json;
return [{ json: { ...request.source_row, automation_result: result, sent: result.status === 'sent',
  status: result.status === 'suppressed' ? 'agendado' : request.source_row.status,
  proxima_tentativa_em: result.status === 'suppressed' ? $now.plus({ minutes: 15 }).toISO() : request.source_row.proxima_tentativa_em,
  motivo_trava: result.reason || '' } }];`);
  const sent = switchNode(w, "Classificar entrega do follow-up", "$json.automation_result.status", [
    "sent",
    "suppressed",
    "failed",
    "delivery_unknown",
  ]);
  const preserve = code(w, "Preservar tentativa não confirmada", `
return [{ json: { status: $json.automation_result?.status || 'suppressed', reason: $json.automation_result?.reason || null, automatic_retry_allowed: false } }];`);

  const handoffInput = code(w, "Converter aviso manual em handoff", `
const row = $input.first().json;
const accountId = row.canal === 'whatsapp' ? $env.LEXIA_MIRANDA_ZAPI_ACCOUNT_ID : $env.LEXIA_MIRANDA_INSTAGRAM_ACCOUNT_ID;
return [{ json: { row, account_id: accountId, conversation_ref: String(row.identificador) } }];`);
  const handoffConversation = rest(
    w,
    "Resolver conversa para handoff de follow-up",
    "'/rest/v1/lexia_conversation_states?account_id=eq.' + encodeURIComponent($json.account_id) + '&conversation_ref=eq.' + encodeURIComponent($json.conversation_ref) + '&select=id,environment,cliente_slug,channel,account_id,conversation_ref&limit=2'",
  );
  const handoffCommand = code(w, "Preparar pendência durável de follow-up", `
const input = $('Converter aviso manual em handoff').first().json;
const rows = ${responseBody("Resolver conversa para handoff de follow-up")};
if (!Array.isArray(rows) || rows.length !== 1) throw new Error('followup_handoff_conversation_not_unique');
const state = rows[0], ref = ${uuidExpression("String(input.row.id) + ':followup:handoff'")};
return [{ json: { ...input, state, handoff_ref: ref, rpc_body: { p_conversation_id: state.id,
  p_idempotency_key: 'followup-handoff:' + input.row.id, p_handoff_ref: ref,
  p_motivo: 'followup_requires_manual_contact', p_resumo: String(input.row.motivo_trava || 'Contato manual necessário'),
  p_prioridade: 'normal', p_occurred_at: new Date().toISOString() } } }];`);
  const handoffRpc = rpc(w, "Criar handoff sem enviar aviso paralelo", "lexia_omni_request_handoff");
  const handoffEvent = code(w, "Espelhar handoff de follow-up", `
const input = $('Preparar pendência durável de follow-up').first().json;
const rows = ${responseBody("Criar handoff sem enviar aviso paralelo")};
const result = Array.isArray(rows) ? rows[0] : rows;
if (!result?.out_handoff_id) throw new Error('central_handoff_id_missing');
const event = { schema_version: 'lexia.crm.event.v1', event_id: ${uuidExpression("input.handoff_ref + ':crm'")},
  idempotency_key: 'followup-handoff:' + input.row.id + ':crm', correlation_id: ${uuidExpression("input.handoff_ref + ':correlation'")},
  event_type: 'handoff.requested', occurred_at: new Date().toISOString(), emitted_at: new Date().toISOString(), sequence: 1,
  scope: { environment: input.state.environment, cliente_slug: input.state.cliente_slug, channel: input.state.channel, account_ref: input.state.account_id, conversation_ref: input.state.conversation_ref },
  source: { system: 'workflow', authority: 'workflow_execution', workflow_ref: 'miranda-v2-followup', execution_ref: $execution.id },
  payload: { handoff_ref: input.handoff_ref, central_handoff_id: result.out_handoff_id, reason: 'followup_requires_manual_contact', summary: String(input.row.motivo_trava || 'Contato manual necessário'), priority: 'normal', requested_at: new Date().toISOString() } };
return [{ json: { events: [event], passthrough: input.row } }];`);
  const syncHandoff = subworkflow(w, "Espelhar pendência no CRM", "07 CRM SYNC V2");

  w.connect("Preparar Envio Follow-up", resolveInput);
  w.connect(resolveInput, conversation);
  w.connect(conversation, request);
  w.connect(request, gateway);
  w.connect(gateway, outcome);
  w.connect(outcome, sent);
  w.connect(sent, "Atualizar Após Envio", 0);
  w.connect(sent, "Reagendar Follow-up", 1);
  w.connect(sent, preserve, 2);
  w.connect(sent, preserve, 3);
  w.connect(sent, preserve, 4);
  w.connect("Reagendar Follow-up", "Loop Follow-ups - Leads");
  w.connect(preserve, "Loop Follow-ups - Leads");
  w.connect("Rotear por Ação", handoffInput, 1);
  w.connect(handoffInput, handoffConversation);
  w.connect(handoffConversation, handoffCommand);
  w.connect(handoffCommand, handoffRpc);
  w.connect(handoffRpc, handoffEvent);
  w.connect(handoffEvent, syncHandoff);
  w.connect(syncHandoff, "Loop Follow-ups - Leads");
  return w.done();
}

function buildReminder(sources: SourceSet) {
  const source = sources.reminder;
  const excluded = new Set(["Enviar Lembrete", "Pausa Eterna (Lembrete)"]);
  const kept = new Set(source.nodes.map((node) => node.name).filter((name) => !excluded.has(name)));
  const w = workflow("14 LEMBRETES SEPARADOS V2");
  for (const sourceNode of source.nodes) if (kept.has(sourceNode.name)) appendClone(w, source, sourceNode.name);
  copyConnections(w, source, kept);
  w.node("Config Lembretes").parameters = {
    assignments: {
      assignments: [
        { id: "cliente_slug", name: "cliente_slug", type: "string", value: "miranda_skin_experts" },
        { id: "timezone", name: "timezone", type: "string", value: "America/New_York" },
      ],
    },
    options: {},
  };
  removeConnection(w, "Travas de Lembrete", "Enviar Lembrete");
  const scopeInput = code(w, "Preparar escopo do lembrete", `
const row = $input.first().json;
if (!row.event_id || !row.telefone) throw new Error('reminder_source_invalid');
return [{ json: { row, account_id: $env.LEXIA_MIRANDA_ZAPI_ACCOUNT_ID, conversation_ref: String(row.telefone).replace(/[^0-9]/g, '') } }];`);
  const conversation = rest(
    w,
    "Resolver conversa do lembrete",
    "'/rest/v1/lexia_conversation_states?account_id=eq.' + encodeURIComponent($json.account_id) + '&conversation_ref=eq.' + encodeURIComponent($json.conversation_ref) + '&select=id,environment,cliente_slug,channel,account_id,conversation_ref,state_version,delivery_epoch&limit=2'",
  );
  const request = code(w, "Montar lembrete idempotente", `
const input = $('Preparar escopo do lembrete').first().json;
const rows = ${responseBody("Resolver conversa do lembrete")};
if (!Array.isArray(rows) || rows.length !== 1) throw new Error('reminder_conversation_not_unique');
const state = rows[0], row = input.row;
const requestId = ${uuidExpression("String(row.event_id) + ':reminder:' + String(row.inicio)")};
const actionId = ${uuidExpression("requestId + ':action:1'")};
const scope = { environment: state.environment, cliente_slug: state.cliente_slug, channel: state.channel, account_ref: state.account_id, conversation_ref: state.conversation_ref };
return [{ json: { request: { schema_version: 'lexia.automation.request.v1', request_id: requestId,
  correlation_id: ${uuidExpression("requestId + ':correlation'")}, kind: 'appointment_reminder', conversation_id: state.id, scope,
  source_ref: String(row.event_id), due_at: new Date().toISOString(), proposed_actions: [{ schema_version: 'lexia.outbound.action.v1',
    action_id: actionId, invocation_id: requestId, scope, sequence: 1, kind: 'appointment_reminder', source_ref: String(row.event_id),
    captured_state: { state_version: Number(state.state_version), delivery_epoch: Number(state.delivery_epoch) },
    content: { type: 'text', text: String(row.mensagem) } }] },
  delivery_mode: $env.LEXIA_DELIVERY_MODE || 'observe_only', source_row: row } }];`);
  const gateway = subworkflow(w, "Enviar lembrete pelo gate comum", "09 AUTOMAÇÕES PELO GATE V2");
  const outcome = code(w, "Classificar resultado do lembrete", `
const source = $('Montar lembrete idempotente').first().json;
const result = $input.first().json;
return [{ json: { ...source.source_row, automation_result: result, sent: result.status === 'sent' } }];`);
  const sent = ifNode(w, "Lembrete confirmado pelo provedor?", "$json.sent === true");
  const preserve = code(w, "Preservar lembrete não confirmado", `
return [{ json: { status: $json.automation_result?.status || 'suppressed', reason: $json.automation_result?.reason || null, automatic_retry_allowed: false } }];`);
  w.connect("Travas de Lembrete", scopeInput);
  w.connect(scopeInput, conversation);
  w.connect(conversation, request);
  w.connect(request, gateway);
  w.connect(gateway, outcome);
  w.connect(outcome, sent);
  w.connect(sent, "Marcar Lembrete Enviado", 0);
  w.connect(sent, preserve, 1);
  return w.done();
}

function buildCrmCommands() {
  const w = workflow("15 COMANDOS DO CRM V2");
  const webhook = w.add("Webhook autenticado do Frappe", "n8n-nodes-base.webhook", 2, {
    httpMethod: "POST",
    path: "lexia-v2-miranda-crm-command",
    authentication: "headerAuth",
    responseMode: "responseNode",
    options: {},
  });
  const validate = code(w, "Validar comando sem confiar no tenant", `
const input = $input.first().json.body || $input.first().json;
const types = ['manual_pause.start','manual_pause.end','handoff.resolve','handoff.resume','appointment.cancel','appointment.attendance.update'];
if (input?.schema_version !== 'lexia.crm.command.v1' || !types.includes(input.command_type)) throw new Error('crm_command_invalid');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateTime = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?(?:Z|[+-](\\d{2}):(\\d{2}))$/;
const validDateTime = (value) => {
  if (typeof value !== 'string') return false;
  const match = dateTime.exec(value); if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59;
};
const exactKeys = (value, allowed, code) => {
  if (!isObject(value)) throw new Error(code + '_object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(code + '_extra_' + key);
};
exactKeys(input, ['schema_version','command_id','correlation_id','command_type','occurred_at','scope','payload'], 'crm_command');
if (!uuid.test(String(input.command_id || '')) || !uuid.test(String(input.correlation_id || '')) || !validDateTime(input.occurred_at)) throw new Error('crm_command_fields_invalid');
exactKeys(input.scope, ['environment','cliente_slug','channel','account_ref','conversation_ref'], 'crm_command_scope');
if (!['local','isolated_test','staging','production'].includes(input.scope.environment)
  || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(input.scope.cliente_slug || ''))
  || !['whatsapp','instagram','messenger'].includes(input.scope.channel)
  || !uuid.test(String(input.scope.account_ref || ''))
  || typeof input.scope.conversation_ref !== 'string' || input.scope.conversation_ref.length < 1 || input.scope.conversation_ref.length > 256) throw new Error('crm_command_scope_invalid');
const rules = {
  'manual_pause.start': { required: ['pause_ref'], optional: ['reason','expires_at'] },
  'manual_pause.end': { required: ['pause_ref'], optional: ['reason'] },
  'handoff.resolve': { required: ['handoff_id','resolution'], optional: ['notes'] },
  'handoff.resume': { required: ['handoff_id'], optional: [] },
  'appointment.cancel': { required: ['appointment_ref'], optional: [] },
  'appointment.attendance.update': { required: ['appointment_ref','attendance_status'], optional: [] },
};
const rule = rules[input.command_type];
exactKeys(input.payload, [...rule.required, ...rule.optional], 'crm_command_payload');
for (const key of rule.required) if (!(key in input.payload)) throw new Error('crm_command_payload_required_' + key);
const bounded = (value, min, max) => typeof value === 'string' && value.length >= min && value.length <= max;
if ('pause_ref' in input.payload && !bounded(input.payload.pause_ref, 1, 128)) throw new Error('crm_command_pause_ref_invalid');
if ('reason' in input.payload && !bounded(input.payload.reason, 0, 256)) throw new Error('crm_command_reason_invalid');
if ('expires_at' in input.payload && !validDateTime(input.payload.expires_at)) throw new Error('crm_command_expiry_invalid');
if ('handoff_id' in input.payload && !uuid.test(String(input.payload.handoff_id || ''))) throw new Error('crm_command_handoff_id_invalid');
if ('resolution' in input.payload && !['resolved','lost'].includes(input.payload.resolution)) throw new Error('crm_command_resolution_invalid');
if ('notes' in input.payload && !bounded(input.payload.notes, 0, 4000)) throw new Error('crm_command_notes_invalid');
if ('appointment_ref' in input.payload && !bounded(input.payload.appointment_ref, 1, 240)) throw new Error('crm_command_appointment_ref_invalid');
if ('attendance_status' in input.payload && !['attended','no_show'].includes(input.payload.attendance_status)) throw new Error('crm_command_attendance_invalid');
const accountMap = { whatsapp: $env.LEXIA_MIRANDA_ZAPI_ACCOUNT_ID, instagram: $env.LEXIA_MIRANDA_INSTAGRAM_ACCOUNT_ID, messenger: $env.LEXIA_MIRANDA_MESSENGER_ACCOUNT_ID };
const accountId = accountMap[input.scope.channel];
if (!accountId || (input.scope.account_ref && input.scope.account_ref !== accountId)) throw new Error('crm_command_account_denied');
return [{ json: { command: input, trusted_account_id: accountId } }];`);
  const account = rest(
    w,
    "Carregar vínculo confiável do comando",
    "'/rest/v1/lexia_channel_accounts?id=eq.' + encodeURIComponent($json.trusted_account_id) + '&status=eq.active&select=id,environment,cliente_slug,channel,provider&limit=2'",
  );
  const resolveInput = code(w, "Resolver escopo real do comando", `
const input = $('Validar comando sem confiar no tenant').first().json;
const rows = ${responseBody("Carregar vínculo confiável do comando")};
if (!Array.isArray(rows) || rows.length !== 1) throw new Error('crm_command_account_unavailable');
const account = rows[0];
if (input.command.scope.environment !== account.environment || input.command.scope.cliente_slug !== account.cliente_slug || input.command.scope.channel !== account.channel) throw new Error('crm_command_scope_mismatch');
return [{ json: { ...input, account, rpc_body: { p_account_id: account.id, p_conversation_ref: input.command.scope.conversation_ref, p_identificador_conversa: input.command.scope.conversation_ref } } }];`);
  const resolveConversation = rpc(w, "Resolver conversa do comando", "lexia_omni_resolve_conversation");
  const commandInput = code(w, "Mapear comando para RPC restrita", `
const input = $('Resolver escopo real do comando').first().json;
const value = ${responseBody("Resolver conversa do comando")};
const conversationId = typeof value === 'string' ? value.replace(/^\"|\"$/g, '') : value;
const command = input.command, payload = command.payload || {}, common = { p_conversation_id: conversationId, p_occurred_at: command.occurred_at, p_actor: null };
let rpcName, rpcBody;
if (command.command_type === 'manual_pause.start') { rpcName = 'lexia_omni_start_manual_pause'; rpcBody = { ...common, p_command_id: command.command_id, p_pause_ref: payload.pause_ref, p_expires_at: payload.expires_at || null }; }
else if (command.command_type === 'manual_pause.end') { rpcName = 'lexia_omni_end_block'; rpcBody = { ...common, p_command_id: command.command_id, p_block_key: 'manual:' + payload.pause_ref, p_reason: payload.reason || 'crm_manual_resume' }; }
else if (command.command_type === 'handoff.resolve') { rpcName = 'lexia_omni_resolve_handoff'; rpcBody = { ...common, p_command_id: command.command_id, p_handoff_id: payload.handoff_id, p_resolution: payload.resolution, p_notes: payload.notes || null }; }
else if (command.command_type === 'handoff.resume') { rpcName = 'lexia_omni_resume_handoff'; rpcBody = { ...common, p_command_id: command.command_id, p_handoff_id: payload.handoff_id }; }
else if (command.command_type === 'appointment.cancel') { rpcName = 'lexia_omni_cancel_appointment_from_crm'; rpcBody = { ...common, p_command_id: command.command_id, p_appointment_ref: payload.appointment_ref }; }
else { rpcName = 'lexia_omni_update_appointment_attendance'; rpcBody = { ...common, p_command_id: command.command_id, p_appointment_ref: payload.appointment_ref, p_attendance_status: payload.attendance_status }; }
return [{ json: { ...input, conversation_id: conversationId, rpc_name: rpcName, rpc_body: rpcBody } }];`);
  const apply = rpc(w, "Aplicar comando no central");
  const prepareCommandProjection = code(w, "Preparar projeção Redis do comando", `
const input = $('Mapear comando para RPC restrita').first().json;
const result = ${responseBody("Aplicar comando no central")};
if (!input.conversation_id || !input.account?.id) throw new Error('command_projection_input_missing');
const scope = { environment: input.account.environment, cliente_slug: input.account.cliente_slug,
  channel: input.account.channel, account_ref: input.account.id, conversation_ref: input.command.scope.conversation_ref };
const key = ['lexia','omni','v2',scope.environment,scope.cliente_slug,scope.channel,scope.account_ref,'{' + input.conversation_id + '}','state'].join(':');
return [{ json: { ...input, command_result: result, redis_projection_key: key,
  redis_projection_value: JSON.stringify({ schema_version: 'lexia.redis.command-result.v1', projected_at: new Date().toISOString(),
    conversation_id: input.conversation_id, command_id: input.command.command_id, command_type: input.command.command_type,
    result }) } }];`);
  const projectCommand = redisProjection(
    w,
    "Projetar comando no Redis compartilhado",
    "$json.redis_projection_key",
    "$json.redis_projection_value",
    604800,
  );
  const event = code(w, "Espelhar comando aceito no CRM", `
const input = $('Mapear comando para RPC restrita').first().json;
const command = input.command, payload = command.payload || {};
let eventType, eventPayload;
if (command.command_type === 'manual_pause.start') { eventType = 'block.upserted'; eventPayload = { block_id: payload.pause_ref, block_type: 'manual_pause', source_ref: payload.pause_ref, reason: payload.reason || 'manual_pause', starts_at: command.occurred_at, ...(payload.expires_at ? { expires_at: payload.expires_at } : {}), effects: { replies: true, followups: true, reminders: true } }; }
else if (command.command_type === 'manual_pause.end') { eventType = 'block.closed'; eventPayload = { block_id: payload.pause_ref, status: 'resolved', resolved_at: command.occurred_at }; }
else if (command.command_type === 'handoff.resolve') { eventType = 'handoff.resolved'; eventPayload = { handoff_ref: payload.handoff_id, resolution: payload.resolution, resolved_at: command.occurred_at, ...(payload.notes ? { notes: payload.notes } : {}) }; }
else if (command.command_type === 'handoff.resume') { eventType = 'handoff.resumed'; eventPayload = { handoff_ref: payload.handoff_id, resumed_at: command.occurred_at }; }
else if (command.command_type === 'appointment.cancel') { eventType = 'appointment.cancelled'; eventPayload = { appointment_ref: payload.appointment_ref, tool_invocation_id: 'crm:' + command.command_id, cancelled_at: command.occurred_at }; }
else { eventType = 'appointment.attendance.updated'; eventPayload = { appointment_ref: payload.appointment_ref, attendance_status: payload.attendance_status, recorded_at: command.occurred_at }; }
const crmEvent = { schema_version: 'lexia.crm.event.v1', event_id: ${uuidExpression("command.command_id + ':crm:event'")},
  idempotency_key: command.command_id + ':crm', correlation_id: command.correlation_id, event_type: eventType,
  occurred_at: command.occurred_at, emitted_at: new Date().toISOString(), sequence: 1,
  scope: { environment: input.account.environment, cliente_slug: input.account.cliente_slug, channel: input.account.channel, account_ref: input.account.id, conversation_ref: command.scope.conversation_ref },
  source: { system: 'crm', authority: 'crm_user', workflow_ref: 'miranda-v2-crm-command', execution_ref: $execution.id }, payload: eventPayload };
return [{ json: { events: [crmEvent], passthrough: { command_id: command.command_id, status: 'applied', command_type: command.command_type } } }];`);
  const sync = subworkflow(w, "Confirmar estado no CRM", "07 CRM SYNC V2");
  const response = w.add("Responder comando", "n8n-nodes-base.respondToWebhook", 1.4, {
    respondWith: "json",
    responseBody: "={{ $json.passthrough }}",
    options: {},
  });
  w.connect(webhook, validate);
  w.connect(validate, account);
  w.connect(account, resolveInput);
  w.connect(resolveInput, resolveConversation);
  w.connect(resolveConversation, commandInput);
  w.connect(commandInput, apply);
  w.connect(apply, prepareCommandProjection);
  w.connect(prepareCommandProjection, projectCommand);
  w.connect(projectCommand, event);
  w.connect(event, sync);
  w.connect(sync, response);
  return w.done();
}

export function buildCandidateWorkflows(sources: SourceSet) {
  const parts = [
    ["00a-adapters-v2.inactive.json", buildAdapters()],
    ["00-master-omnichannel-v2.inactive.json", buildMaster()],
    ["01-ingress-durable-v2.inactive.json", buildIngress()],
    ["02-media-after-block-v2.inactive.json", buildMedia(sources)],
    ["03-context-and-brain-v2.inactive.json", buildContextAndBrain(sources)],
    ["04-apply-brain-result-v2.inactive.json", buildApplyBrainResult()],
    ["06-delivery-gate-v2.inactive.json", buildDeliveryGate()],
    ["07-crm-sync-v2.inactive.json", buildCrmSync()],
    ["08-provider-send-only-v2.inactive.json", buildProviderSend()],
    ["09-automation-gateway-v2.inactive.json", buildAutomationGateway()],
    ["10-private-brain-v2.inactive.json", buildBrain(sources)],
    ["11-create-appointment-v2.inactive.json", buildAppointment(sources)],
    ["12-check-availability-v2.inactive.json", buildAvailability(sources)],
    ["13-followup-v2.inactive.json", buildFollowup(sources)],
    ["14-reminders-v2.inactive.json", buildReminder(sources)],
    ["15-crm-commands-v2.inactive.json", buildCrmCommands()],
  ] as Array<[string, CandidateWorkflow]>;
  return consolidateMirandaWorkflows(parts);
}

function readme(totalNodes: number) {
  return `# Miranda V2 - seis workflows candidatos e inativos\n\n` +
    `Os 16 blocos técnicos da primeira revisão foram consolidados em seis canvases compreensíveis. Todos permanecem com \`active: false\`, sem credenciais e sem destinos reais embutidos. Importar não significa publicar: cada integração ainda precisa ser ligada e validada em laboratório.\n\n` +
    `## O que é cada workflow\n\n` +
    `1. **Entrada Omnichannel:** recebe Z-API, Meta e o teste da plataforma; identifica a conta confiável, deduplica, registra a mensagem, aplica a pausa humana antes de mídia/IA e forma o lote do lead.\n` +
    `2. **Atendimento IA:** monta contexto isolado, usa o prompt da empresa, chama o cérebro privado e aplica handoff/agendamento antes de propor respostas.\n` +
    `3. **Agenda:** reúne consulta de disponibilidade e criação de agendamento, mantendo operações e provas de tool separadas.\n` +
    `4. **Follow-ups e Lembretes:** mantém os dois agendadores separados no mesmo canvas e obriga ambos a passar pelo ledger e pelo gate de saída.\n` +
    `5. **Integração CRM:** espelha Lead, Deal e timeline no Frappe e recebe comandos autenticados de pausa, retomada, handoff, cancelamento e comparecimento.\n` +
    `6. **Saída Segura:** é o único dono do envio ao provedor; revalida cada ação, registra progresso parcial e interrompe resultados incertos para reconciliação.\n\n` +
    `## Ordem de importação em laboratório\n\n` +
    `1. Integração CRM.\n` +
    `2. Saída Segura.\n` +
    `3. Agenda.\n` +
    `4. Atendimento IA.\n` +
    `5. Follow-ups e Lembretes.\n` +
    `6. Entrada Omnichannel por último.\n\n` +
    `Os nós Execute Workflow são vinculados pelos nomes exibidos após a importação. Credenciais devem ser criadas e associadas manualmente no laboratório. URLs, tokens, IDs de conta, calendário, ativos de mídia e allowlists ficam somente em credenciais ou variáveis do ambiente isolado.\n\n` +
    `## Garantias estruturais locais\n\n` +
    `- a mensagem é deduplicada e persistida antes de pausa, buffer, mídia ou IA;\n` +
    `- intervenção humana cria/renova o bloqueio antes de transcrição;\n` +
    `- apenas Provider Send possui um caminho de rede de saída;\n` +
    `- cada ação passa novamente pelo claim transacional imediatamente antes do envio;\n` +
    `- resultado incerto vira delivery_unknown e nunca autoriza retry cego;\n` +
    `- português, inglês e espanhol são resolvidos pelo turno do lead, impostos ao redator e revalidados antes do plano de entrega;\n` +
    `- follow-ups e lembretes entram pelo mesmo ledger/gate;\n` +
    `- agendamento só emite appointment.confirmed depois do Calendar e do registro privado;\n` +
    `- cancelamento, comparecimento/no-show, pausa e handoff chegam por comandos autenticados do CRM;\n` +
    `- o Frappe é espelho/cockpit; o Supabase central permanece a autoridade durável.\n\n` +
    `## Validação HML\n\n` +
    `Cópias privadas hidratadas dos seis workflows foram publicadas no laboratório. O pacote local atual tem ${totalNodes} nodes; as cópias HML acrescentam adaptadores exclusivos do laboratório. Webhooks de canal e schedules estão desligados, Calendar está desabilitado e a entrega permanece observe_only. O Agent Test percorreu Entrada, buffer, Atendimento real, CRM e Saída em português, inglês e espanhol e terminou sempre suprimido sem executar provider. Os arquivos deste diretório continuam inativos e sem credenciais; o deployment HML não foi versionado.\n\n` +
    `## Ainda depende de integração real\n\n` +
    `Assinaturas e payloads reais dos provedores, efeitos reais de canais, permissões finais, campos das tabelas privadas e respostas operacionais do Calendar ainda precisam de validação própria. O Agent Test usa o gateway dos seis workflows HML completos, com canal virtual. Estes exports não estão prontos para produção e os workflows operacionais originais da Miranda não foram alterados.\n`;
}

export function buildCandidatePackage(source: string, outputDirectory: string) {
  const sourceRoot = resolveSource(source);
  const output = resolve(outputDirectory);
  if (existsSync(output)) {
    const marker = join(output, "MANIFEST.json");
    if (!existsSync(marker)) throw new Error(`Refusing to overwrite unmarked output: ${output}`);
    const existing = JSON.parse(readFileSync(marker, "utf8")) as {
      schema_version?: string;
      workflows?: Array<{ file?: string }>;
    };
    if (
      ![
        "lexia.miranda.v2.candidate.manifest.v1",
        "lexia.miranda.v2.candidate.manifest.v2",
      ].includes(existing.schema_version ?? "")
    ) {
      throw new Error(`Refusing to overwrite output with another identity: ${output}`);
    }
    for (const entry of existing.workflows ?? []) {
      if (!entry.file?.endsWith(".inactive.json")) continue;
      const stale = join(output, entry.file);
      if (existsSync(stale)) unlinkSync(stale);
    }
  }
  const sources = loadSources(sourceRoot);
  const workflows = buildCandidateWorkflows(sources);
  mkdirSync(output, { recursive: true });
  const manifestEntries = workflows.map(([file, value]) => {
    writeFileSync(join(output, file), `${JSON.stringify(value, null, 2)}\n`);
    const serialized = JSON.stringify(value);
    return {
      file,
      name: value.name,
      nodes: value.nodes.length,
      sha256: createHash("sha256").update(serialized).digest("hex"),
      active: false,
    };
  });
  const manifest = {
    schema_version: "lexia.miranda.v2.candidate.manifest.v2",
    generated_at: new Date().toISOString(),
    status: "inactive_local_candidate",
    provisional_contracts: [
      "provider ingress payloads",
      "provider send responses",
      "private brain output",
      "calendar and private Supabase node responses",
      "Frappe command authentication transport",
    ],
    guarantees: {
      original_exports_included: false,
      credentials_included: false,
      real_destinations_included: false,
      workflows_active: false,
      consolidated_workflow_count: 6,
      internal_capability_blocks_preserved: 16,
      provider_send_single_owner: true,
      delivery_unknown_requires_reconciliation: true,
      followup_image_contract_ready: true,
    },
    workflows: manifestEntries,
  };
  writeFileSync(join(output, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(output, "README.md"),
    readme(manifestEntries.reduce((total, entry) => total + entry.nodes, 0)),
  );
  const scan = scanPackage(output);
  const report = {
    schema_version: "lexia.sanitization.report.v1",
    scanned_at: new Date().toISOString(),
    secret_findings: scan.findings,
    disallowed_paths: scan.disallowed,
    passed: scan.findings.length === 0 && scan.disallowed.length === 0,
  };
  writeFileSync(join(output, "SANITIZATION_REPORT.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) {
    const details = [
      ...scan.findings.map(({ file, type }) => `${file}:${type}`),
      ...scan.disallowed.map((file) => `${file}:disallowed`),
    ].join(", ");
    throw new Error(`Candidate package failed sanitization: ${details}`);
  }
  return { output, manifest, report };
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = argument("--source");
  const output = argument("--output") ?? OUTPUT_DIR;
  if (!source) throw new Error("Usage: --source <zip-or-directory> [--output <new-directory>]");
  const result = buildCandidatePackage(source, output);
  process.stdout.write(`${result.output}\n`);
}
