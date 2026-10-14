import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { auditWorkflow, runtime, sql } from '../scripts/build-miranda-original-crm.mjs';

const workflow = JSON.parse(readFileSync(new URL('../n8n/miranda-original-crm/omnichannel-original-crm.inactive.json', import.meta.url)));
const node = name => workflow.nodes.find(n => n.name === name);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const date = '2026-10-11T12:00:00Z';
const scope = { environment: 'isolated_test', cliente_slug: 'empresa_sintetica_a', channel: 'whatsapp', account_ref: id, conversation_ref: 'fixture-a' };
const run = (name, input, refs = {}) => new AsyncFunction('$input', '$json', '$', '$execution', '$now', node(name).parameters.jsCode)(
  { first: () => ({ json: input }), all: () => [{ json: input }] }, input,
  name => ({ first: () => ({ json: refs[name] }), item: { json: refs[name] } }),
  { id: 'synthetic-execution' }, date,
);
const targets = name => (workflow.connections[name]?.main || []).flat().map(x => x.node);

test('inactive, syntactically valid, names preserved, no inline secrets', () => {
  const result = auditWorkflow(workflow);
  assert.equal(result.originalNames, 148);
  assert.equal(workflow.id, undefined);
  assert.equal(workflow.active, false);
  for (const n of workflow.nodes) for (const credential of Object.values(n.credentials || {})) {
    assert.equal(credential.id, undefined);
    assert.equal(typeof credential.name, 'string');
  }
});

test('every active connection has an active destination and nonoverlapping node centers', () => {
  const positions = new Set();
  for (const n of workflow.nodes.filter(n => !n.disabled && n.type !== 'n8n-nodes-base.stickyNote')) {
    const key = JSON.stringify(n.position);
    assert.ok(!positions.has(key), n.name);
    positions.add(key);
    for (const t of targets(n.name)) assert.ok(!node(t).disabled, `${n.name}: ${t}`);
  }
});

test('individual durable ingestion precedes pause and all original media branches remain', () => {
  assert.deepEqual(targets('Normalizar Dados Operacionais'), ['LEXIA | Preparar registro individual']);
  assert.deepEqual(targets('LEXIA | Preparar registro individual'), ['LEXIA | Persistir evento e mensagem']);
  assert.deepEqual(targets('Set Intervenção Humana'), ['Intervenção é áudio?']);
  assert.deepEqual(targets('LEXIA | Gravar transcricao humana'), ['CRM | Ler espelho da conversa']);
  for (const name of ['Texto', 'Audio', 'Imagem', 'PDF', 'Imagem1', 'Transcribe a recording', 'Analyze image', 'Extract from File', 'Analyze video']) assert.equal(node(name).disabled, undefined, name);
  assert.match(sql.ingest, /lexia_omni_record_message/);
  assert.match(sql.ingest, /provider_account_ref/);
  assert.match(sql.human, /record_human_intervention/);
});

test('media failure retains the original identity and does not touch pauses', async () => {
  const [item] = await run('LEXIA | Normalizar resultado de midia', { error: 'timeout' }, {
    'LEXIA | Registro individual confirmado': { message_id: id, conversation_id: other, author: 'human_agent', media_kind: 'audio', text: '' },
  });
  assert.equal(item.json.message_id, id);
  assert.equal(item.json.author, 'human_agent');
  assert.equal(item.json.media_status, 'failed');
  assert.doesNotMatch(runtime.media, /delete|DEL|end_block/i);
});

test('Meta media echo is preserved; caption does not erase media type', async () => {
  const [event] = await run('Normalizar Entrada Meta Omnichannel', { body: { object: 'instagram', entry: [{ id: 'synthetic-page', messaging: [{ timestamp: Date.parse(date), sender: { id: 'synthetic-page' }, recipient: { id: 'synthetic-lead' }, message: { is_echo: true, mid: 'echo-a', text: 'caption', attachments: [{ type: 'image', payload: { url: 'https://media.invalid/image.jpg' } }] } }] }] } });
  assert.equal(event.json.body._lexia_transport, 'meta');
  assert.equal(event.json.body.message.fromMe, true);
  assert.equal(event.json.body.message.type, 'image');
  assert.equal(event.json.body._sender_id, 'synthetic-lead');
});

test('Meta normalizer never calls HTTP or global mutable memory', () => {
  assert.doesNotMatch(node('Normalizar Entrada Meta Omnichannel').parameters.jsCode, /this\.helpers\.httpRequest|\$getWorkflowStaticData/);
});

const result = {
  schema_version: 'lexia.context.result.v1', scope, context_call_id: id, config_version: 'fixture-v1', source_message_ids: [other],
  operational_context: { summary: 'Fictitious request', language: 'en', intent: 'scheduling', topic: { current: 'evaluation', changed: false, resumed_previous: false }, confidence: 0.9, missing_information: [], contact_updates: {}, scheduling_intent: {} },
  company_fields: { service: 'synthetic evaluation' },
};
const contextPacket = { scope, context_call_id: id, config_version: 'fixture-v1', source_message_ids: [other], company_fields_schema: { type: 'object', properties: { service: { type: 'string' } }, required: ['service'], additionalProperties: false } };

test('context validates complete schema and binds tenant, conversation, call and source messages', async () => {
  const [valid] = await run('Preparar Contexto Activo', { output: JSON.stringify(result) }, { 'Preparar Pacote de Contexto': contextPacket });
  assert.equal(valid.json.dados.idioma, 'en');
  for (const changed of [
    { ...result, scope: { ...scope, cliente_slug: 'empresa_sintetica_b' } },
    { ...result, scope: { ...scope, conversation_ref: 'fixture-b' } },
    { ...result, context_call_id: other },
    { ...result, source_message_ids: [id] },
    { ...result, company_fields: { service: 42 } },
    { ...result, operational_context: { ...result.operational_context, extra: true } },
  ]) await assert.rejects(run('Preparar Contexto Activo', { output: JSON.stringify(changed) }, { 'Preparar Pacote de Contexto': contextPacket }));
});

test('missing config never falls back; unsupported recursive schemas are rejected initially', async () => {
  await assert.rejects(run('LEXIA | Validar configuracao unica', {}), /context_config_unavailable/);
  await assert.rejects(run('LEXIA | Validar configuracao unica', { prompt_template: 'synthetic', company_fields_schema: { $defs: { recursive: { $ref: '#/$defs/recursive' } }, not: { $ref: '#/$defs/recursive' } } }), /recurs|cycle|recursive/i);
});

test('history rejects mixed conversations even for the same configuration version', async () => {
  const refs = {
    'LEXIA | Registro individual confirmado': { ...scope, conversation_id: id },
    'LEXIA | Lote autorizado': { invocation_id: id, out_mensagem_ids: [other] },
    'Agrupar Histórico': { data: [{ id: other, omni_conversation_id: other, cliente_slug: scope.cliente_slug }] },
    'LEXIA | Configuracao de contexto': { ...scope, prompt_template: 'synthetic', config_version: 'fixture-v1', status: 'active' },
    'LEXIA | Estado e contexto duraveis': {},
  };
  await assert.rejects(run('Preparar Pacote de Contexto', {}, refs), /history_scope_mismatch/);
});

test('uncertain sends stop without retry and retain the action identity', async () => {
  const refs = { 'Loop Over Items - Entregas': { entregas: { action_id: id, tipo: 'texto' } }, 'LEXIA | Claim antes de cada envio': { out_fencing_token: 5 } };
  for (const response of [{ error: 'socket closed after possible acceptance' }, { statusCode: 200, body: {} }, { statusCode: 504 }]) {
    const [r] = await run('LEXIA | Classificar resultado de envio', response, refs);
    assert.equal(r.json.status, 'delivery_unknown');
    assert.equal(r.json.delivery.action_id, id);
  }
  const [confirmed] = await run('LEXIA | Classificar resultado de envio', { statusCode: 200, body: { messageId: 'synthetic-msg' } }, refs);
  assert.equal(confirmed.json.status, 'sent');
  for (const name of ['LEXIA | Enviar whatsapp', 'LEXIA | Enviar instagram', 'LEXIA | Enviar messenger']) assert.equal(node(name).retryOnFail, false);
});

test('every real send is after claim; partial delivery stops on uncertainty', () => {
  assert.deepEqual(targets('LEXIA | Claim autorizado?'), ['Enviar Mensagem Cliente - Texto Genérico', 'LEXIA | Encerrar resposta bloqueada']);
  assert.deepEqual(targets('LEXIA | Entrega confirmada?'), ['Loop Over Items - Entregas', 'LEXIA | Concluir lote']);
  assert.deepEqual(targets('Loop Over Items - Entregas'), ['LEXIA | Concluir lote', 'Wait - Texto Genérico']);
  assert.match(sql.gate, /claim_outbound_action/);
  assert.match(sql.finish, /finish_outbound_action/);
});

test('virtual replies are durably recorded, explicitly tagged and state-revalidated', () => {
  assert.match(sql.virtual, /state_version=\$4/);
  assert.match(sql.virtual, /delivery_epoch=\$5/);
  assert.match(sql.virtual, /provider='fake'/);
  assert.match(node('LEXIA | Identificar historico virtual').parameters.query, /origem='teste_workflow'/);
  assert.match(runtime.payloadTail, /m\.origem==='teste_workflow'\?'agente_ia'/);
  assert.deepEqual(targets('LEXIA | Resultado virtual Frappe'), ['LEXIA | Persistir resposta no canal virtual']);
});

test('brain proposals cannot confirm appointments; operational facts are schema-limited', async () => {
  const [r] = await run('LEXIA | Validar fatos operacionais do cerebro', { contexto_para_guardar: { dados: { service: 'new synthetic interest', agendamento: { status: 'confirmed' }, memoria_privada: 'private' } } }, {
    'Preparar Pacote de Contexto': contextPacket, 'Preparar Contexto Activo': result,
  });
  assert.deepEqual(r.json.company_fields, { service: 'new synthetic interest' });
  assert.doesNotMatch(node('Fundir Contexto Pós-Cérebro').parameters.jsCode, /if \(\/confirmad/);
  assert.match(node('LEXIA | Registrar handoff independente').parameters.query, /request_handoff/);
});

test('CRM mirror produces valid contract events with closed blocks and confirmed deliveries', async () => {
  const q = {
    state: { id, criado_em: date, event_uuid: id }, contact: { id, nome: 'Synthetic contact' },
    messages: [{ id: other, provider_message_id: 'synthetic-message', omni_author: 'ai', tipo: 'texto', conteudo: 'Fictitious reply', provider_timestamp: date, event_uuid: other }],
    blocks: [{ id: other, block_type: 'manual_pause', source_ref: 'synthetic-pause', status: 'resolved', criado_em: date, atualizado_em: date, event_uuid: other }],
    actions: [{ id: id, status: 'delivery_unknown', criado_em: date, event_uuid: id }],
  };
  const events = await run('CRM | Montar eventos idempotentes', q, { 'LEXIA | Registro individual confirmado': { ...scope, resume_mode: 'await_new_message', nome: 'Synthetic contact' } });
  assert.equal(events.length, 4);
  assert.equal(events[1].json.event.source.authority, 'workflow_execution');
  assert.equal(events[2].json.event.payload.status, 'resolved');
  assert.equal(events[3].json.event.payload.delivery_status, 'delivery_unknown');
});
