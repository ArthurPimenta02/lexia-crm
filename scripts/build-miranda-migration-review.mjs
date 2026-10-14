import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMirandaOriginal } from './build-miranda-original-crm.mjs';
import { runtime as testRuntime } from './build-miranda-crm-agent-test.mjs';
import { buildSharedDelivery } from './build-miranda-shared-delivery.mjs';
import { buildBrain } from './build-miranda-original-brain.mjs';
import { centralMemoryBrain } from './lib/miranda-central-memory.mjs';
import { buildFollowup } from './build-miranda-original-followup.mjs';
import { buildReminder } from './build-miranda-original-reminder.mjs';
import { buildCalendarTool } from './build-miranda-original-calendar-tools.mjs';
import { bundleForN8n } from './lib/n8n-code-bundle.mjs';
import { addMigrationOperations } from './lib/miranda-migration-operations.mjs';
import { referenceFingerprint } from './lib/reference-denylist.mjs';
import { organizeMigrationCanvas, visualReference, executableFingerprint, layoutKind } from './lib/miranda-migration-layout.mjs';
import { persistentCalendarSql } from './lib/miranda-migration-sql.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const node = (w, name) => { const n = w.nodes.find(n => n.name === name); if (!n) throw Error('missing_node:' + name); return n; };
const route = (w, name, groups) => { w.connections[name] = { main: groups.map(g => g.map(node => ({ node, type: 'main', index: 0 }))) }; };
const ref = name => `$('${name}').first().json`;
const policyBundle = () => bundleForN8n(resolve(root, 'scripts/lib/miranda-migration-policy.mjs'), 'Migration');
function add(w, name, type, parameters, version = 2) {
  if (w.nodes.some(n => n.name === name)) throw Error('duplicate_node:' + name);
  const n = { id: hash(w.name + name).slice(0, 32), name, type, typeVersion: version, parameters, position: [0, 0], retryOnFail: false };
  w.nodes.push(n); return n;
}
function pg(w, name, query, args) {
  const n = add(w, name, 'n8n-nodes-base.postgres', { operation: 'executeQuery', query,
    options: { queryReplacement: `={{ ${args} }}` } }, 2.6);
  n.credentials = { postgres: { name: 'Lexia Central Postgres' } }; return n;
}
function code(w, name, source) { return add(w, name, 'n8n-nodes-base.code', { mode: 'runOnceForAllItems', jsCode: source }); }
function iff(w, name, condition) {
  return add(w, name, 'n8n-nodes-base.if', { conditions: { options: { typeValidation: 'strict', version: 2 },
    conditions: [{ id: hash(name).slice(0, 32), leftValue: `={{ ${condition} }}`, rightValue: true,
      operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, 2.2);
}
function discard(w, names) {
  const remove = new Set(names);
  w.nodes = w.nodes.filter(n => !remove.has(n.name));
  for (const name of names) delete w.connections[name];
  for (const types of Object.values(w.connections)) for (const groups of Object.values(types)) for (const edges of groups) {
    for (let i = edges.length - 1; i >= 0; i--) if (remove.has(edges[i].node)) edges.splice(i, 1);
  }
}

// Remove obsolete, disconnected executable nodes rather than leaving a second
// shadow copy on the canvas. Preserve expression references even on side exits.
export function compactWorkflow(w) {
  const keep = new Set();
  const visit = name => {
    if (keep.has(name)) return;
    keep.add(name);
    for (const groups of Object.values(w.connections[name] || {})) for (const edges of groups) for (const e of edges) visit(e.node);
    const n = w.nodes.find(n => n.name === name);
    for (const m of JSON.stringify(n?.parameters || {}).matchAll(/\$\((?:'([^']+)'|"([^"]+)")\)/g)) {
      const target = m[1] || m[2]; if (w.nodes.some(n => n.name === target)) visit(target);
    }
  };
  for (const n of w.nodes) if (n.type.includes('Trigger') || n.type === 'n8n-nodes-base.webhook') visit(n.name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [from, types] of Object.entries(w.connections)) for (const [type, groups] of Object.entries(types)) {
      if (type === 'main') continue;
      if (groups.flat().some(e => keep.has(e.node)) && !keep.has(from)) { visit(from); changed = true; }
    }
  }
  discard(w, w.nodes.filter(n => !keep.has(n.name) || n.type === 'n8n-nodes-base.stickyNote').map(n => n.name));
  return w;
}

export function layout(w, original) {
  return organizeMigrationCanvas(w, visualReference(original));
}

function consistentCredentials(w) {
  const labels = { postgres: 'Lexia Central Postgres', redis: 'Lexia Central Redis',
    openAiApi: 'Lexia OpenAI', anthropicApi: 'Lexia Anthropic', googlePalmApi: 'Lexia Gemini',
    googleCalendarOAuth2Api: 'Lexia Google Agenda Migracao' };
  for (const n of w.nodes) {
    if (n.type === 'n8n-nodes-base.scheduleTrigger') n.disabled = true;
    if(n.type==='n8n-nodes-base.postgres')n.parameters.options={...n.parameters.options,largeNumbersOutput:'numbers'};
    for (const [kind, c] of Object.entries(n.credentials || {})) {
      const privateDb = /Privado|Catalogo/.test(c.name);
      n.credentials[kind] = { name: kind === 'supabaseApi' ? privateDb ? 'Lexia Supabase Privado Miranda' : 'Lexia Supabase Central' : labels[kind] || c.name.replace(/ TESTE| HML| Lote 2/g, '') };
    }
    n.retryOnFail = false;
  }
  w.settings = { ...w.settings, executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none',
    saveManualExecutions: false, saveExecutionProgress: false, timezone: 'America/New_York' };
}
function persistentIdentity(w) {
  // Only the disposable attribute is retired, not any project/environment/
  // tenant/credential binding. Existing remote identity rows remain untouched.
  for(const n of w.nodes) if(n.parameters.jsCode) n.parameters.jsCode=n.parameters.jsCode
    .replace(/\b[A-Za-z_$][\w$]*(?:\[\d+\])?\.disposable\s*!==\s*(?:true|!0)\s*\|\|\s*/g,'')
    .replace(/\|\|\s*[A-Za-z_$][\w$]*(?:\[\d+\])?\.disposable\s*!==\s*(?:true|!0)/g,'');
  const old='ENTREGA | Conferir banco descartavel', renamed='ENTREGA | Conferir identidade central';
  const encoded=JSON.stringify(w).replaceAll(old,renamed);
  const updated=JSON.parse(encoded);Object.assign(w,updated);
  for(const n of w.nodes) if(n.type==='n8n-nodes-base.set') for(const a of n.parameters.assignments?.assignments||[]) {
    if(a.name==='test_project_ref')a.value='';
    if(a.name==='_delivery_config')a.value.test_project_ref='';
  }
}

function adaptHandoff(w) {
  const n = node(w, 'LEXIA | Registrar handoff independente');
  n.parameters.query = n.parameters.query.replace('lexia_omni_request_handoff', 'lexia_migration_handoff');
  iff(w, 'LEXIA | Handoff bloqueante?', `['alta','urgente'].includes(${ref('Validar Saída Cérebro Cliente')}.handoff.prioridade)`);
  route(w, n.name, [['LEXIA | Handoff bloqueante?']]);
  route(w, 'LEXIA | Handoff bloqueante?', [['LEXIA | Concluir lote'], ['Preparar Saída Omnichannel']]);
}
function crmTestEntry(w) {
  const schema = bundleForN8n(resolve(root,'lib/omnichannel/schema-validator.ts'),'LexiaSchema');
  node(w,'LEXIA | Adaptar teste virtual').parameters.jsCode=schema+'\n'+testRuntime.ingress;
  node(w,'LEXIA | Devolver resposta virtual').parameters.jsCode=schema+'\n'+testRuntime.result
    .replace('calendar_write_attempted:false,',"calendar_write_attempted:(brain?.tool_audit||[]).some(t=>t.operation==='appointment.create'),domain_events:brain?.domain_events||[],tool_audit:brain?.tool_audit||[],");
  node(w,'LEXIA | Chamar teste neste omnichannel').onError='continueRegularOutput';
  code(w,'LEXIA | Conferir retorno ao CRM',schema+'\n'+testRuntime.parent
    .replace("calendar_write_attempted:false}","calendar_write_attempted:req.tool_policy.calendar==='test_read_write'?null:false}")
    .replace("result.output?.calendar_write_attempted !== false", "(req.tool_policy.calendar==='test_read_write'?!(typeof result.output?.calendar_write_attempted==='boolean'||(result.status==='failed'&&result.output?.calendar_write_attempted===null)):result.output?.calendar_write_attempted !== false)"));
  route(w,'LEXIA | Chamar teste neste omnichannel',[['LEXIA | Conferir retorno ao CRM']]);
  route(w,'LEXIA | Conferir retorno ao CRM',[['LEXIA | Responder teste Frappe']]);
  node(w,'LEXIA | Webhook Teste Frappe').parameters.path='lexia-miranda-migration-agent-test';
  const record=node(w,'LEXIA | Preparar registro individual');
  record.parameters.jsCode=policyBundle()+'\n'+record.parameters.jsCode.replace(
    'const body = op.lexia_body_normalizado || {};',
    `const body = op.lexia_body_normalizado || {};
if($('Entrada Unificada').first().json.body._lexia_transport==='test'){
if($('CENTRAL DE CONTROLE').first().json.permitir_teste_plataforma!==true)throw Error('virtual_ingress_disabled');
Migration.assertVirtualScope($('Entrada Unificada').first().json.body._workflow_test_request,cfg,op);}`);
  iff(w,'CRM | Conversa virtual?',`${ref('Entrada Unificada')}.body._lexia_transport==='test'`);
  // Tests stay out of the operational inbox, including early pause/echo exits.
  const inbound=Object.entries(w.connections).filter(([from,types])=>from!=='CRM | Conversa virtual?' &&
    types.main?.flat().some(e=>e.node==='CRM | Ler espelho da conversa'));
  for(const [,types] of inbound) for(const edges of types.main) for(const edge of edges) {
    if(edge.node==='CRM | Ler espelho da conversa')edge.node='CRM | Conversa virtual?';
  }
  route(w,'CRM | Conversa virtual?',[['LEXIA | Devolver resposta virtual'],['CRM | Ler espelho da conversa']]);
}
function replyUsesSharedDelivery(w) {
  route(w,'É Teste Workflow? - Saída Genérica',[['LEXIA | Resultado virtual Frappe'],['LEXIA | Resultado virtual Frappe']]);
  const p=node(w,'Preparar Payload Cérebro');
  const facts=node(w,'LEXIA | Estado e contexto duraveis');
  facts.parameters.query=`WITH original AS (${facts.parameters.query.replace(/;\s*$/,'')}) SELECT original.*,
coalesce((SELECT jsonb_agg(jsonb_build_object('appointment_ref',a.appointment_ref,'status',a.status,'cancellation_status',a.cancellation_status,
'starts_at',a.starts_at,'ends_at',a.ends_at,'timezone',a.timezone,'attendance_status',a.attendance_status) ORDER BY a.criado_em)
FROM public.lexia_appointment_events a WHERE a.conversation_id=$1::uuid),'[]') AS appointment_facts FROM original;`;
  p.parameters.jsCode=`const items=await(async()=>{${p.parameters.jsCode}})();
const req=${ref('Entrada Unificada')}.body._workflow_test_request;
for(const i of items){const read=['test_read_only','test_read_write'].includes(req?.tool_policy?.calendar)&&${ref('CENTRAL DE CONTROLE')}.permitir_tools_teste===true;
i.json.operacao.calendar_access=read?'isolated_test':'disabled';i.json.operacao.calendar_write_allowed=read&&req.tool_policy.calendar==='test_read_write'&&${ref('CENTRAL DE CONTROLE')}.permitir_criacao_agenda_teste===true;i.json.operacao.tools_permitidas=read;
i.json.operacao.appointment_facts=${ref('LEXIA | Estado e contexto duraveis')}.appointment_facts;}
return items;`;
  node(w,'CENTRAL DE CONTROLE').parameters.assignments.assignments.push({id:'calendar-write',name:'permitir_criacao_agenda_teste',type:'boolean',value:false});
  const request=node(w,'ENTREGA | Pedido da resposta');
  request.parameters.jsCode=request.parameters.jsCode.replace(
    "req=$('Entrada Unificada').first().json.body._workflow_test_request;",
    "req=$('Entrada Unificada').first().json.body._workflow_test_request || {scope:$('Preparar Pacote de Contexto').first().json.scope};");
  const restore=node(w,'ENTREGA | Restaurar resposta virtual');
  restore.parameters.jsCode=restore.parameters.jsCode.replace(
    "$json.results[i].status==='suppressed' && $json.results[i].reason==='virtual_delivered'",
    "$('Entrada Unificada').first().json.body._lexia_transport==='test' ? ($json.results[i].status==='suppressed' && $json.results[i].reason==='virtual_delivered') : ['sent','duplicate'].includes($json.results[i].status)");
  iff(w,'ENTREGA | Concluir canal virtual?',`${ref('Entrada Unificada')}.body._lexia_transport==='test'`);
  route(w,'LEXIA | Resultado virtual revalidado',[['ENTREGA | Concluir canal virtual?']]);
  route(w,'ENTREGA | Concluir canal virtual?',[['LEXIA | Concluir lote virtual'],['LEXIA | Concluir lote']]);
}

function centralFollowup(omni,followup,source) {
  const original=source.nodes.find(n=>n.name==='Preparar Follow-up');
  if(!original)throw Error('original_followup_scheduler_missing');
  const scheduler=node(omni,'Preparar Follow-up');delete scheduler.disabled;
  scheduler.parameters={mode:'runOnceForAllItems',jsCode:original.parameters.jsCode
    .replace("if (op.modo_teste_workflow === true) return [];",'')
    .replace("const CANAIS_VALIDOS = ['instagram', 'whatsapp'];","const CANAIS_VALIDOS = ['instagram','whatsapp','messenger'];")};
  // Empty scheduling decisions must not prevent the CRM mirror from running.
  scheduler.parameters.jsCode=`const result=await(async()=>{${scheduler.parameters.jsCode}})();return [{json:{plan:result[0]?.json||null}}];`;
  pg(omni,'LEXIA | Agendar follow-up central','SELECT public.lexia_migration_schedule_followup($1::uuid,$2::jsonb) AS scheduled;',
    `[${ref('LEXIA | Registro individual confirmado')}.conversation_id,JSON.stringify($json.plan)]`);
  route(omni,'LEXIA | Concluir lote',[['Preparar Follow-up']]);route(omni,'LEXIA | Concluir lote virtual',[['Preparar Follow-up']]);
  route(omni,'Preparar Follow-up',[['LEXIA | Agendar follow-up central']]);route(omni,'LEXIA | Agendar follow-up central',[['CRM | Conversa virtual?']]);
  const q=node(followup,'Buscar Follow-ups Vencidos');q.type='n8n-nodes-base.postgres';q.typeVersion=2.6;
  q.credentials={postgres:{name:'Lexia Central Postgres'}};
  q.parameters={operation:'executeQuery',query:"SELECT * FROM public.lexia_followups WHERE environment=$1 AND cliente_slug=$2 AND account_ref=$3::uuid AND status='agendado' AND proxima_tentativa_em<=clock_timestamp() ORDER BY proxima_tentativa_em LIMIT 100;",options:{queryReplacement:`={{ [${ref('Config Follow-up')}.environment,${ref('Config Follow-up')}.cliente_slug,${ref('Config Follow-up')}.account_ref] }}`}};
  for(const n of followup.nodes)if(n.parameters.query)n.parameters.query=n.parameters.query.replace("s.identificador_conversa=l.data->>'identificador'","s.identificador_conversa=l.data->>'identificador' AND s.id=(l.data->>'conversation_id')::uuid AND s.account_id=(l.data->>'account_ref')::uuid")
    .replace('JOIN public.lexia_followups f ON f.id::text=$1','JOIN public.lexia_followups f ON f.id::text=$1 AND f.conversation_id=s.id');
  for(const n of omni.nodes)if(n.parameters.query)n.parameters.query=n.parameters.query.replace("AND f.cliente_slug=s.cliente_slug AND f.canal=s.channel", "AND f.conversation_id=s.id AND f.cliente_slug=s.cliente_slug AND f.canal=s.channel");
}

function terminalConfirmation(w) {
  const ids=node(w,'ENTREGA | IDs da resposta');
  const previous=ids.parameters.query.replace(/;\s*$/,'');
  ids.parameters.query=`WITH proposed AS (${previous}), planned AS (
SELECT public.lexia_migration_reply_plan($3::uuid,$2::uuid,proposed.actions,$4::bigint,$5::bigint) AS plan FROM proposed)
SELECT plan->'actions' AS actions,plan->'captured_state' AS captured_state,plan->>'kind' AS kind,plan->>'source_ref' AS source_ref FROM planned;`;
  ids.parameters.options.queryReplacement=`={{ [JSON.stringify($json.entregas),${ref('LEXIA | Lote autorizado')}.invocation_id,${ref('LEXIA | Registro individual confirmado')}.conversation_id,${ref('Preparar Pacote de Contexto')}.state.state_version,${ref('Preparar Pacote de Contexto')}.state.delivery_epoch] }}`;
  const req=node(w,'ENTREGA | Pedido da resposta');
  req.parameters.jsCode=req.parameters.jsCode
    .replace('$json.actions.length!==p.entregas.length',"($json.kind!=='appointment_confirmation'&&$json.actions.length!==p.entregas.length)")
    .replace('const captured_state={state_version:state.state_version,delivery_epoch:state.delivery_epoch};','const captured_state=$json.captured_state||{state_version:state.state_version,delivery_epoch:state.delivery_epoch};')
    .replace("kind:'reply',captured_state", "kind:$json.kind||'reply',...($json.source_ref?{source_ref:$json.source_ref}:{}),captured_state");
  const restore=node(w,'ENTREGA | Restaurar resposta virtual');
  restore.parameters.jsCode=restore.parameters.jsCode.replace('messages=original.entregas.filter',
    "const entries=p.actions[0].kind==='appointment_confirmation'?p.actions.map(a=>({tipo:'texto',texto:a.content.text})):original.entregas;messages=entries.filter")
    .replace('messages.length!==original.entregas.length','messages.length!==p.actions.length');
}

function automationCrmTransport(w,configName,eventNode,loopName) {
  code(w,'CRM | Envelopar eventos da automacao',`const p=$json;const events=[...(p.events||[]),p.crm_event].filter(e=>e?.event_type==='automation.updated');
if(!events.length)return [{json:{operation:'crm.enqueue',events:[]}}];return [{json:{operation:'crm.enqueue',events},pairedItem:{item:0}}];`);
  const send=add(w,'CRM | Enfileirar pelo Omnichannel','n8n-nodes-base.executeWorkflow',{source:'database',workflowId:{__rl:true,mode:'id',value:`={{ ${ref(configName)}.delivery_workflow_ref }}`},workflowInputs:{mappingMode:'passThrough',value:{}},mode:'each',options:{waitForSubWorkflow:true}},1.3);
  send.onError='continueRegularOutput';send.alwaysOutputData=true;
  route(w,eventNode,[['CRM | Envelopar eventos da automacao']]);route(w,'CRM | Envelopar eventos da automacao',[[send.name]]);route(w,send.name,[[loopName]]);
}

function mirrorSharedDelivery(w) {
  code(w,'ENTREGA | Preparar espelho confirmado',`return [{json:{operation:'crm.snapshot',conversation_id:${ref('ENTREGA | Conversa confirmada')}.conversation_id,_receipt:$json}}];`);
  const send=add(w,'ENTREGA | Atualizar CRM pelo ledger','n8n-nodes-base.executeWorkflow',{source:'database',workflowId:{__rl:true,mode:'id',value:'={{ $workflow.id }}'},workflowInputs:{mappingMode:'passThrough',value:{}},mode:'each',options:{waitForSubWorkflow:true}},1.3);
  send.onError='continueRegularOutput';send.alwaysOutputData=true;
  code(w,'ENTREGA | Preservar recibo de envio',`return [{json:${ref('ENTREGA | Preparar espelho confirmado')}._receipt}];`);
  route(w,'ENTREGA | Devolver recibo',[['ENTREGA | Preparar espelho confirmado']]);route(w,'ENTREGA | Preparar espelho confirmado',[[send.name]]);route(w,send.name,[['ENTREGA | Preservar recibo de envio']]);
}

function readOnlyBrainBranch(w) {
  const entry=node(w,'Preparar Entrada');
  entry.parameters.jsCode=`const items=await(async()=>{${entry.parameters.jsCode}})();
for(const i of items)i.json.operacao=${ref('LEXIA | Entrada e memoria isoladas')}.payload.operacao;return items;`;
  const guard=node(w,'LEXIA | Validar origem e limites');
  guard.parameters.jsCode=policyBundle()+'\n'+guard.parameters.jsCode.replace(
    "$('Config Cerebro Lexia').first().json", "Migration.calendarBrainConfig($('Config Cerebro Lexia').first().json,$input.first().json)");
  const original=node(w,'Orquestrador de Agendamento');
  const read=structuredClone(original);read.id=hash('calendar-read-only-agent').slice(0,32);read.name='Orquestrador de Agendamento (somente disponibilidade)';
  read.parameters.options.systemMessage+='\nSOMENTE LEITURA: apenas verificar_disponibilidade esta conectada. Consulte horarios reais; nao confirme reserva nem chame criar_agendamento. Explique brevemente o limite quando o lead pedir reserva.';w.nodes.push(read);
  iff(w,'LEXIA | Agenda pode escrever?',`${ref('LEXIA | Entrada e memoria isoladas')}.cfg.calendar_read_only!==true`);
  const allowed=node(w,'LEXIA | Agenda de teste autorizada?');
  w.connections[allowed.name].main[0]=[{node:'LEXIA | Agenda pode escrever?',type:'main',index:0}];
  route(w,'LEXIA | Agenda pode escrever?',[[original.name],[read.name]]);
  w.connections[read.name]=structuredClone(w.connections[original.name]);
  for(const [from,types] of Object.entries(w.connections))for(const [type,groups] of Object.entries(types))if(type!=='main'){
    for(const edges of groups)for(const e of [...edges])if(e.node===original.name&&from!=='criar_agendamento')edges.push({...e,node:read.name});
  }
}
function scopedHistory(w) {
  const n=node(w,'Buscar Histórico da Conversa');
  n.type='n8n-nodes-base.postgres';n.typeVersion=2.6;
  n.credentials={postgres:{name:'Lexia Central Postgres'}};
  n.parameters={operation:'executeQuery',query:`SELECT * FROM (SELECT m.* FROM public.lexia_mensagens m
JOIN public.lexia_conversation_states s ON s.id=m.omni_conversation_id
WHERE s.id=$1::uuid AND s.environment=$2 AND s.cliente_slug=$3 AND s.account_id=$4::uuid AND s.conversation_ref=$5
ORDER BY coalesce(m.provider_timestamp,m.criado_em) DESC,m.id DESC LIMIT 200) history
ORDER BY coalesce(provider_timestamp,criado_em),id;`,options:{queryReplacement:
    `={{ [${ref('LEXIA | Registro individual confirmado')}.conversation_id,${ref('LEXIA | Registro individual confirmado')}.environment,${ref('LEXIA | Registro individual confirmado')}.cliente_slug,${ref('LEXIA | Registro individual confirmado')}.account_ref,${ref('LEXIA | Registro individual confirmado')}.conversation_ref] }}`}};
  // Older history is represented by the separately versioned durable summary;
  // this bounded window must not grow past the brain's contract limit.
}
function pendingCancellationGate(w) {
  for(const n of w.nodes) {
    if(typeof n.parameters.query==='string')n.parameters.query=n.parameters.query
      .replaceAll("a.status='confirmed' AND a.attendance_status", "a.status='confirmed' AND a.cancellation_status IS NULL AND a.attendance_status");
    if(n.parameters.jsCode)n.parameters.jsCode=n.parameters.jsCode
      .replaceAll("a.status === 'confirmed' && a.attendance_status", "a.status === 'confirmed' && !a.cancellation_status && a.attendance_status")
      .replaceAll("a.status==='confirmed' && a.attendance_status", "a.status==='confirmed' && !a.cancellation_status && a.attendance_status");
  }
}
function removeLegacyLocks(w) {
  route(w, 'LEXIA | Enfileirar lead duravel', [['LEXIA | Checar todos os bloqueios']]);
  node(w, 'Agente desativado?').parameters.conditions.conditions[0].leftValue = '={{ $json.blocked === true }}';
  route(w, 'Wait - Texto Genérico', [['LEXIA | Revalidar legado antes da bolha']]);
  node(w, 'LEXIA | Legado permite esta bolha?').parameters.conditions.conditions[0].leftValue =
    `={{ ${ref('CENTRAL DE CONTROLE')}.permitir_envio_real===true && $json.blocked===false }}`;
  discard(w, ['Ver Pausa Manual','Ver Pausa Eterna','Ver Status Agente',
    'LEXIA | Ler pausa manual na entrega','LEXIA | Ler agendamento legado na entrega','LEXIA | Ler handoff legado na entrega']);
}
function durableCrm(w) {
  const n = node(w, 'CRM | Ler espelho da conversa');
  n.parameters.query = n.parameters.query.replaceAll('o.criado_em','o.preparado_em')
    .replace("'conversation.opened:'||s.id::text", "'conversation.opened:'||s.id::text||':'||c.atualizado_em::text");
  node(w, 'CRM | Montar eventos idempotentes').parameters.jsCode = node(w, 'CRM | Montar eventos idempotentes').parameters.jsCode
    .replaceAll('a.criado_em','a.preparado_em');
  const uuid=x=>`overlay(overlay(md5(${x}) placing '4' from 13) placing '8' from 17)::uuid`;
  n.parameters.query=n.parameters.query.replace("'event_uuid',overlay(overlay(md5('delivery:","'record_event_uuid',"+uuid("'action.record:'||o.id::text")+",'event_uuid',overlay(overlay(md5('delivery:");
  n.parameters.query=n.parameters.query.replace("to_jsonb(m)||jsonb_build_object('event_uuid'", "to_jsonb(m)||jsonb_build_object('enrichment_event_uuid',"+uuid("'enrichment:'||m.id::text||':'||coalesce(m.omni_enriched_at,m.criado_em)::text||':'||coalesce(m.media_processing_status,'not_supported')")+",'event_uuid'");
  n.parameters.query=`WITH original AS (${n.parameters.query.replace(/;\s*$/,'')}) SELECT original.*,
(SELECT p.resume_mode FROM public.lexia_omnichannel_policies p WHERE p.environment=original.state->>'environment' AND p.cliente_slug=original.state->>'cliente_slug' AND p.status='active') AS resume_mode,
coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object(
'confirmed_event_uuid',${uuid("'appointment.confirmed:'||a.id::text")},
'cancelled_event_uuid',${uuid("'appointment.cancelled:'||a.id::text")},
'attendance_event_uuid',${uuid("'attendance:'||a.id::text||':'||a.attendance_status||':'||a.attendance_recorded_at::text")})) FROM public.lexia_appointment_events a WHERE a.conversation_id=$1::uuid),'[]') AS appointments,
coalesce((SELECT jsonb_agg(to_jsonb(h)||jsonb_build_object('event_uuid',${uuid("'handoff.requested:'||h.id::text")},
'resolved_event_uuid',${uuid("'handoff.resolved:'||h.id::text")},'resumed_event_uuid',${uuid("'handoff.resumed:'||h.id::text")})) FROM public.lexia_handoffs h WHERE h.omni_conversation_id=$1::uuid),'[]') AS handoffs,
coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('event_uuid',${uuid("'automation:'||r.id::text||':'||r.status||':'||coalesce((SELECT string_agg(o.status,',' ORDER BY o.sequence) FROM public.lexia_outbound_actions o WHERE o.automation_request_id=r.id),'none')")},
'actions',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.sequence) FROM public.lexia_outbound_actions o WHERE o.automation_request_id=r.id),'[]'))) FROM public.lexia_automation_requests r WHERE r.conversation_id=$1::uuid),'[]') AS automations
FROM original;`;
  const more=bundleForN8n(resolve(root,'scripts/lib/miranda-migration-crm-events.mjs'),'CrmDomain');
  const render=node(w,'CRM | Montar eventos idempotentes');
  render.parameters.jsCode=more+`\nreturn CrmDomain.snapshotEvents($json,$now.toISO(),$execution.id).map(event=>({json:{event},pairedItem:{item:0}}));`;
  pg(w, 'CRM | Registrar outbox duravel', 'SELECT public.lexia_migration_enqueue_crm($1::uuid,$2::jsonb) AS outbox_id;',
    `[${ref('LEXIA | Registro individual confirmado')}.conversation_id,JSON.stringify($json.event)]`);
  route(w, 'CRM | Espelhar eventos em ordem', [[], ['CRM | Registrar outbox duravel']]);
  pg(w,'CRM | Reservar espelho idempotente','SELECT public.lexia_migration_claim_crm_event($1::uuid) AS claim;', '[$json.outbox_id]');
  iff(w,'CRM | Espelho reservado?','$json.claim?.acquired===true');
  route(w, 'CRM | Registrar outbox duravel', [['CRM | Reservar espelho idempotente']]);
  route(w, 'CRM | Reservar espelho idempotente', [['CRM | Espelho reservado?']]);
  route(w, 'CRM | Espelho reservado?', [['CRM | Enviar evento ao Frappe'],['CRM | Espelhar eventos em ordem']]);
  node(w, 'CRM | Enviar evento ao Frappe').parameters.jsonBody = "={{ {event:$('CRM | Reservar espelho idempotente').item.json.claim.event} }}";
  // The producer no longer loses a CRM event just because its HTTP failed.
  node(w, 'CRM | Enviar evento ao Frappe').onError = 'continueRegularOutput';
  node(w, 'CRM | Confirmar espelho').parameters.jsCode = policyBundle()+
    "\nreturn [{json:{confirmed:Migration.crmReceiptConfirmed($json,$('CRM | Reservar espelho idempotente').item.json.claim.event.event_id)},pairedItem:{item:0}}];";
  pg(w, 'CRM | Registrar resultado do espelho', "SELECT public.lexia_migration_finish_crm($1::uuid,$2::uuid,$3::boolean);",
    "[$('CRM | Reservar espelho idempotente').item.json.claim.id,$('CRM | Reservar espelho idempotente').item.json.claim.claim_token,$json.confirmed]" );
  route(w, 'CRM | Confirmar espelho', [['CRM | Registrar resultado do espelho']]);
  route(w, 'CRM | Registrar resultado do espelho', [['CRM | Espelhar eventos em ordem']]);
}
function cancellationLane(w) {
  const trigger = node(w, 'When Executed by Another Workflow');
  code(w, 'CANCELAR | Classificar entrada', "if($input.all().length!==1)throw Error('single_calendar_call_required');return [{json:{...$json,_cancel:$json.operation==='appointment.cancel'},pairedItem:{item:0}}];");
  iff(w, 'CANCELAR | Pedido do CRM?', '$json._cancel===true');
  route(w, trigger.name, [['CANCELAR | Classificar entrada']]);
  route(w, 'CANCELAR | Classificar entrada', [['CANCELAR | Pedido do CRM?']]);
  route(w, 'CANCELAR | Pedido do CRM?', [['CANCELAR | Configuracao confiavel'], ['Config Tools Lexia']]);
  const cfg = add(w, 'CANCELAR | Configuracao confiavel', 'n8n-nodes-base.set', { assignments: { assignments: [
    { id: 'calendar', name: 'calendar_id', type: 'string', value: '' },
    { id: 'enabled', name: 'cancellation_enabled', type: 'boolean', value: false }
  ] }, options: {} }, 3.4);
  code(w, 'CANCELAR | Validar comando', `const req=${ref('CANCELAR | Classificar entrada')};
if($json.cancellation_enabled!==true||!$json.calendar_id)throw Error('configure_cancel_calendar_first');
if(!/^[0-9a-f-]{36}$/i.test(req.request_id||'')||!req.conversation_id)throw Error('cancel_command_identity_required');
return [{json:{request_id:req.request_id,calendar_id:$json.calendar_id},pairedItem:{item:0}}];`);
  pg(w, 'CANCELAR | Reservar operacao', 'SELECT public.lexia_migration_claim_cancel($1::uuid,$2) AS cancel;', '[$json.request_id,$json.calendar_id]');
  iff(w, 'CANCELAR | Reserva autorizada?', '$json.cancel?.acquired===true');
  const google = name => {
    const n = add(w, name, 'n8n-nodes-base.googleCalendar', { resource: 'event', operation: name.includes('Excluir') ? 'delete' : 'get',
      calendar: { __rl: true, mode: 'id', value: `={{ ${ref('CANCELAR | Reservar operacao')}.cancel.calendar_id }}` },
      eventId: `={{ ${ref('CANCELAR | Reservar operacao')}.cancel.provider_event_id }}`, options: {} }, 1.3);
    n.credentials = { googleCalendarOAuth2Api: { name: 'Lexia Google Agenda Migracao' } };
    n.alwaysOutputData = true; n.onError = 'continueRegularOutput'; return n;
  };
  google('CANCELAR | Excluir evento mapeado'); google('CANCELAR | Verificar ausencia no Google');
  const access=google('CANCELAR | Conferir acesso a agenda');
  access.parameters.operation='getAll';delete access.parameters.eventId;
  access.parameters.returnAll=true;access.parameters.timeMin='={{ $now.toISO() }}';
  access.parameters.timeMax='={{ $now.plus({days:1}).toISO() }}';
  code(w, 'CANCELAR | Classificar comprovacao', policyBundle() +
    `\nconst c=${ref('CANCELAR | Reservar operacao')}.cancel;
const rows=$input.all().map(i=>i.json);const accessible=rows.length>0&&rows.every(r=>!r.error);
const read=${ref('CANCELAR | Verificar ausencia no Google')};const status=Migration.classifyCancellationRead(read,c.provider_event_id,accessible);
return [{json:{...c,verified:status==='succeeded',receipt:{operation:'appointment.cancel',request_id:c.request_id,appointment_ref:c.appointment_ref,calendar_id:c.calendar_id,provider_event_id:c.provider_event_id,status,absence_verified:status==='succeeded'}},pairedItem:{item:0}}];`);
  pg(w, 'CANCELAR | Confirmar ou reconciliar', 'SELECT public.lexia_migration_finish_cancel($1::uuid,$2::uuid,$3::boolean,$4::jsonb) AS status;', '[$json.request_id,$json.claim_token,$json.verified,JSON.stringify($json.receipt)]');
  code(w, 'CANCELAR | Devolver estado conhecido', `return [{json:{request_id:${ref('CANCELAR | Classificar entrada')}.request_id,status:$json.cancel?.status||'unknown',reason:'no_new_delete_attempt'},pairedItem:{item:0}}];`);
  const steps = [cfg.name,'CANCELAR | Validar comando','CANCELAR | Reservar operacao','CANCELAR | Reserva autorizada?'];
  for (let i=1;i<steps.length;i++) route(w,steps[i-1],[[steps[i]]]);
  route(w, steps.at(-1), [['CANCELAR | Excluir evento mapeado'], ['CANCELAR | Devolver estado conhecido']]);
  const effects = ['CANCELAR | Excluir evento mapeado','CANCELAR | Verificar ausencia no Google','CANCELAR | Conferir acesso a agenda','CANCELAR | Classificar comprovacao','CANCELAR | Confirmar ou reconciliar'];
  for (let i=1;i<effects.length;i++) route(w,effects[i-1],[[effects[i]]]);
}

export function auditMigration(w) {
  if (w.active !== false || Object.keys(w.pinData || {}).length) throw Error('inactive_unpinned_required');
  const names = new Set(w.nodes.map(n => n.name));
  if (names.size !== w.nodes.length) throw Error('duplicate_names');
  for (const [from,types] of Object.entries(w.connections)) {
    if (!names.has(from)) throw Error('connection_source_missing:' + from);
    for (const groups of Object.values(types)) for (const edges of groups) for (const e of edges) if (!names.has(e.node)) throw Error('connection_target_missing:' + e.node);
  }
  const positions = [];
  for (const n of w.nodes) {
    if (n.parameters.jsCode) new (Object.getPrototypeOf(async function(){}).constructor)(n.parameters.jsCode);
    for (const c of Object.values(n.credentials || {})) if (Object.keys(c).some(k=>k!=='name')) throw Error('credential_identity_leak');
    if (n.type !== 'n8n-nodes-base.stickyNote') {
      for (const p of positions) if (Math.abs(p[0]-n.position[0])<140 && Math.abs(p[1]-n.position[1])<160) throw Error('canvas_overlap:' + n.name);
      positions.push(n.position);
    }
  }
  if (/\beyJ[A-Za-z0-9_.-]{30,}|\bsk-[A-Za-z0-9_-]{16,}|\$env\.|supabase\.co|upstash\.io|helpers\.httpRequest/.test(JSON.stringify(w))) throw Error('inline_secret_destination_or_hidden_io');
  return { nodes: w.nodes.length, active: false, native_database_nodes: w.nodes.filter(n=>/postgres|supabase|redis/.test(n.type)).length };
}

export function buildMigration(sources) {
  const omniSource = sources.find(w=>w.name.includes('OMNICHANNEL'));
  const brainSource = sources.find(w=>w.name.startsWith('Cérebro'));
  if (sources.length!==6 || !omniSource || !brainSource) throw Error('six_production_sources_required');
  const omni = buildSharedDelivery(buildMirandaOriginal(omniSource));
  adaptHandoff(omni); removeLegacyLocks(omni); durableCrm(omni); crmTestEntry(omni); replyUsesSharedDelivery(omni); scopedHistory(omni);
  const brain = centralMemoryBrain(buildBrain(brainSource).workflow,root);
  node(omni,'Config Cliente Lexia').parameters.assignments.assignments.push({id:'brain-ref',name:'brain_workflow_ref',type:'string',value:''});
  node(omni,'Chamar Cérebro do Cliente').parameters.workflowId={__rl:true,mode:'id',value:`={{ ${ref('Config Cliente Lexia')}.brain_workflow_ref }}`};
  const protect=bundleForN8n(resolve(root,'scripts/lib/reference-denylist.mjs'),'References');
  code(omni,'LEXIA | Conferir cerebro importado',protect+`\nconst alias=${ref('Config Cliente Lexia')}.brain_workflow_ref;
if(!/^[A-Za-z0-9_-]{1,64}$/.test(alias)||References.referenceFingerprint(alias)===${JSON.stringify(referenceFingerprint(brainSource.id))})throw Error('select_imported_brain_not_production');return [{json:$json}];`);
  route(omni,'LEXIA | Cerebro de teste revisado?',[['LEXIA | Conferir cerebro importado'],['LEXIA | Bloquear tools reais no teste']]);
  route(omni,'LEXIA | Conferir cerebro importado',[['Chamar Cérebro do Cliente']]);
  node(brain,'Orquestrador de Agendamento').parameters.options.systemMessage+='\nPERMISSAO DE AGENDA: se operacao.calendar_write_allowed nao for true, consultar horarios e explicar no idioma do lead que este modo nao faz reservas. Nao chamar criar_agendamento nem afirmar que houve reserva. Uma consulta de disponibilidade nao confirma agendamento.';
  for(const name of ['Orquestrador de Atendimento','Orquestrador de Agendamento'])node(brain,name).parameters.text+='\nFatos atuais e autoritativos do central: {{ JSON.stringify($json.operacao.appointment_facts || []) }}. Estes fatos prevalecem sobre memoria antiga de agendamento. cancellation_status requested/claimed/unknown nao comprova cancelamento; status cancelled comprova. Nao afirme que um agendamento cancelado continua confirmado.';
  readOnlyBrainBranch(brain);
  // Keep specialists/orchestrators/writer; replace obsolete local effects with
  // one explicit proposal. State and notification delivery have one owner.
  node(brain, 'Preparar Handoff').parameters.jsCode = policyBundle() +
    `\nconst result=${ref('LEXIA | Validar continuidade e efeitos')};if(result.handoff?.necessario)Migration.handoffDecision(result.handoff.prioridade||'normal');return [{json:result,pairedItem:{item:0}}];`;
  route(brain, 'Preparar Handoff', [['Devolver Saída Cérebro']]);
  discard(brain, ['Notificar Equipe?','Notificar Samuel (uazapi)','Pausar Bot?','Pausar Conversa']);
  const followup=buildFollowup(sources.find(w=>w.name.includes('FOLLOW-UP')));
  node(followup,'Buscar Playbook de Vendas').credentials={supabaseApi:{name:'Lexia Supabase Privado Miranda'}};
  const reminder=buildReminder(sources.find(w=>w.name.includes('LEMBRETES')));
  automationCrmTransport(followup,'Config Follow-up','CRM | Preparar evento de follow-up','Loop Follow-ups - Leads');
  automationCrmTransport(reminder,'Config Lembretes','CRM | Preparar resultado de lembrete','Loop Consultas');
  const availability=buildCalendarTool(sources.find(w=>w.name==='verificar_disponibilidade'),'availability.check');
  node(availability,'Config Tools Lexia').parameters.assignments.assignments.push({id:'personal-read',name:'allow_personal_calendar_read',type:'boolean',value:false});
  const appointment=buildCalendarTool(sources.find(w=>w.name==='criar_agendamento'),'appointment.create');
  const duplicate=node(appointment,'Evento confirmado?');
  duplicate.parameters.query=duplicate.parameters.query.replace('FROM public.lexia_calendar_tool_calls WHERE','FROM public.lexia_calendar_tool_calls t WHERE')
    .replace("receipt->>'status'='succeeded';", "receipt->>'status'='succeeded' AND EXISTS(SELECT 1 FROM public.lexia_appointment_events a WHERE a.conversation_id=t.conversation_id AND a.tool_invocation_id=t.id::text AND a.status='confirmed' AND a.cancellation_status IS NULL);");
  cancellationLane(appointment);
  centralFollowup(omni,followup,omniSource);
  terminalConfirmation(omni);
  addMigrationOperations(omni,root,referenceFingerprint(sources.find(w=>w.name==='criar_agendamento').id));
  mirrorSharedDelivery(omni);
  const all = [omni,brain,followup,reminder,availability,appointment];
  const originalLayouts = [omniSource, brainSource,
    sources.find(w=>w.name.includes('FOLLOW-UP')), sources.find(w=>w.name.includes('LEMBRETES')),
    sources.find(w=>w.name==='verificar_disponibilidade'), sources.find(w=>w.name==='criar_agendamento')];
  const labels = ['OMNICHANNEL','CEREBRO','FOLLOW-UP','LEMBRETES','DISPONIBILIDADE','AGENDAMENTOS'];
  for (let i=0;i<all.length;i++) {
    const w=all[i]; w.name='LEXIA MIRANDA | '+labels[i]+' | MIGRACAO REVISAO';
    if(i===0)for(const n of w.nodes)if(n.type==='n8n-nodes-base.webhook'&&!['LEXIA | Webhook Teste Frappe','CRM | Webhook Comandos'].includes(n.name))n.disabled=true;
    // Nothing in this builder changes the deployed environment marker. Resources
    // are persistent even while current calls carry the isolated_test label.
    for(const n of w.nodes)if(n.type==='n8n-nodes-base.set')for(const a of n.parameters.assignments?.assignments||[]){
      if(a.name==='cliente_slug')a.value='miranda_skin_experts';
      if(a.name==='account_ref')a.value='';
      if(a.name==='_delivery_config'){a.value.cliente_slug='miranda_skin_experts';a.value.account_ref='';}
    }
    pendingCancellationGate(w); consistentCredentials(w); persistentIdentity(w); compactWorkflow(w); layout(w, originalLayouts[i]); auditMigration(w);
  }
  return all;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('usage: build-miranda-migration-review.mjs <extracted-local-directory> <output-directory>');
  const sources = readdirSync(input).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(resolve(input,f),'utf8')));
  const workflows=buildMigration(sources); mkdirSync(output,{recursive:true});
  const files=['01-omnichannel','02-cerebro','03-followup','04-lembretes','05-disponibilidade','06-agendamentos'];
  const manifest = { status:'review_candidate_not_integrated', production_modified:false, resources:'persistent_shared_central_operational_memory_private_catalog',
    layout: { status:'original_anchors_horizontal_extensions', reference:'tests/fixtures/miranda-layout/production-geometry.json',
      changes:'positions and sanitized section notes only', real_n8n_canvas_verified:false },
    notification_providers:{handoff:'zapi',appointment:'uazapi'},
    implemented_locally:['Original intelligence/media/buffer retained; scoped context/history and central operational memory; private catalog GET only',
      'Independent blocks, authenticated CRM commands and bound Google cancellation receipts',
      'Native Redis immutable-version snapshots before processing/delivery; periodic repair lane',
      'Claimed CRM outbox, typed appointments/handoffs/automations/media and stable action-message identity',
      'Original follow-up scheduling and central scoped queue; stop cycles on reply/booking',
      'One terminal confirmation bound to the actual create receipt; per-action final gates',
      'Durable Z-API/UAZAPI team dispatch, disabled and excluded from virtual tests',
      'Prepared native Frappe command dispatcher and factual pipeline recomputation'],
    source_hashes:sources.map(w=>({name:w.name,nodes:w.nodes.length,hash:hash(JSON.stringify(w.nodes.map(n=>n.parameters)))})),
    workflows:workflows.map((w,i)=>{
      const original=sources.find(s=>layoutKind(s)===files[i].slice(3));
      const names=new Set(original.nodes.filter(n=>n.type!=='n8n-nodes-base.stickyNote').map(n=>n.name));
      return {file:files[i]+'.inactive.json',sha256:hash(JSON.stringify(w,null,2)+'\n'),...auditMigration(w),
        layout:{preserved_original_positions:w.nodes.filter(n=>names.has(n.name)).length,executable_fingerprint:executableFingerprint(w)}};
    }),
    pending:['Install/review additive SQL dependencies without clearing existing data',
      'Install/review Frappe modules/DocTypes/configuration and connect its test target to this exact webhook',
      'Homologate native-node acknowledgments and provider notification receipts without production destinations',
      'Automatic answer_pending execution, stale claimed-batch reconciliation and durable structured campaign attribution are not complete',
      'Graduate current isolated_test contracts to staging/production with explicit cutover; no relabelling here',
      'Complete Meta signed ingress/window-aware delivery; current shared delivery supports Z-API only',
      'Configure existing native Lead/Deal Status mapping before enabling the pipeline',
      'Configure native credentials, exact accounts, operational central memory schema, read-only private catalog, prompts and imported workflow IDs',
      'Execute real n8n/Google/Frappe/Supabase/Redis interoperability tests before activation'] };
  for (let i=0;i<workflows.length;i++) writeFileSync(resolve(output,files[i]+'.inactive.json'),JSON.stringify(workflows[i],null,2)+'\n',{mode:0o600});
  const calendarSql=persistentCalendarSql(readFileSync(resolve(root,'supabase/isolated/lote2/202610120001_calendar_tools.sql'),'utf8'));
  writeFileSync(resolve(root,'supabase/review/miranda-migration/202610120001_calendar_tools_persistent.sql'),calendarSql);
  writeFileSync(resolve(output,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(JSON.stringify(manifest,null,2)+'\n');
}
