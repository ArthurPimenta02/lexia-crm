import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { buildReminder } from '../scripts/build-miranda-original-reminder.mjs';
import { auditWorkflow } from '../scripts/build-miranda-original-crm.mjs';
import { sql } from '../scripts/lib/miranda-original-reminder-sql.mjs';
import { gate, virtual, load } from '../scripts/lib/miranda-shared-delivery-sql.mjs';

const bundle=(file,name)=>new Function(buildSync({entryPoints:[file],bundle:true,write:false,format:'iife',globalName:name,platform:'neutral',target:'es2022'}).outputFiles[0].text+';return '+name+';')();
const R=bundle('scripts/lib/miranda-original-reminder-runtime.mjs','Reminder');
const D=bundle('scripts/lib/miranda-shared-delivery.mjs','Delivery');
const w=JSON.parse(readFileSync('n8n/miranda-original-crm/reminder-original-crm.inactive.json','utf8'));
const node=name=>w.nodes.find(n=>n.name===name);
const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now='2026-10-11T16:00:00Z'; // Sunday, noon in Boston.
const scope={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',channel:'whatsapp',account_ref:uuid(1),conversation_ref:'test:synthetic-reminder-a'};
const config={...scope,test_project_ref:'abcdefghijklmnopqrst',delivery_mode:'preview',delivery_workflow_ref:'synthetic-omnichannel',delivery_contract_reviewed:false};
const appointment=()=>({id:uuid(2),conversation_id:uuid(3),environment:scope.environment,cliente_slug:scope.cliente_slug,appointment_ref:'appointment:synthetic-event-a',status:'confirmed',attendance_status:'unknown',starts_at:'2026-10-12T14:00:00Z',ends_at:'2026-10-12T15:00:00Z',timezone:'America/New_York'});
const candidate=()=>appointment();
const phases=Object.fromEntries(['sent','delivery_unknown','preview','virtual','message'].map((k,i)=>[k,uuid(10+i)]));
const state=()=>({id:uuid(3),...scope,account_id:scope.account_ref,account_status:'active',provider:'fake',identificador_conversa:'opaque-a',projection_status:'current',state_version:12,delivery_epoch:7,language:'pt',first_name:'Lead Fictício',request_id:uuid(4),action_id:uuid(5),event_ids:phases});
const query=()=>({states:[state()],appointments:[appointment()],blocks:[{status:'active',block_type:'appointment',source_ref:appointment().appointment_ref,expires_at:appointment().ends_at}],actions:[]});
const resolved=(q=query())=>R.resolveCandidate(candidate(),q,config);
const proposal=()=>R.propose(resolved(),now);
const receipt=(p=proposal(),status='sent',reason='provider_confirmed')=>({request_id:p.request_id,scope:p.scope,captured_state:p.captured_state,results:[{schema_version:'lexia.delivery.result.v1',action_id:p.action_id,status,attempted_at:now,reason,...(status==='sent'?{provider_message_id:'synthetic-provider-message'}:{})}]});
const ledger=(p=proposal(),status='sent')=>({id:p.action_id,conversation_id:p.conversation_id,invocation_id:p.request_id,automation_request_id:p.request_id,sequence:1,kind:'appointment_reminder',source_ref:p.appointment.appointment_ref,content:p.envelope.request.proposed_actions[0].content,captured_state_version:12,captured_delivery_epoch:7,lead_cutoff_seq:null,status,...(status==='sent'?{provider_message_id:'synthetic-provider-message',mensagem_id:uuid(6),concluido_em:now}:{})});
const proof=(p=proposal(),r=receipt(p),a=ledger(p),message_verified=true)=>R.proof(R.checkReceipt(p,r,now),{actions:a?[a]:[],message_verified});
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=(name,input,refs={})=>new AsyncFunction('$input','$json','$','$execution','$now',node(name).parameters.jsCode)({all:()=>[{json:input}]},input,k=>({first:()=>({json:k==='Config Lembretes'?config:refs[k]}),item:{json:refs[k]}}),{id:'synthetic-execution'},{toISO:()=>now});

test('export preserves all seven original names and hourly schedule, inactive and preview',()=>{
  auditWorkflow(w);assert.equal(w.active,false);
  for(const name of ['Intervalo 1h','Config Lembretes','Buscar Consultas Próximas','Travas de Lembrete','Enviar Lembrete','Marcar Lembrete Enviado','Pausa Eterna (Lembrete)'])assert.ok(node(name),name);
  assert.equal(node('Intervalo 1h').disabled,true);
  assert.equal(node('Intervalo 1h').parameters.rule.interval[0].field,'hours');
  assert.equal(node('Config Lembretes').parameters.assignments.assignments.find(f=>f.name==='delivery_mode').value,'preview');
});
test('no secrets, credential IDs, raw private destinations, Google or direct provider sends',()=>{
  assert.doesNotMatch(JSON.stringify(w),/api\.z-api|graph\.facebook|supabase\.co|upstash\.io|eyJ|\$env\.|helpers\.httpRequest|https?:\/\/(?!contracts\.uselexia\.invalid|json-schema\.org)/);
  assert.deepEqual(w.pinData,{});
  for(const n of w.nodes)for(const c of Object.values(n.credentials || {}))assert.deepEqual(Object.keys(c),['name']);
  assert.ok(!w.nodes.some(n=>['n8n-nodes-base.redis','n8n-nodes-base.httpRequest'].includes(n.type)));
  assert.equal(node('Enviar Lembrete').type,'n8n-nodes-base.executeWorkflow');
  assert.equal(node('Enviar Lembrete').retryOnFail,false);
});
test('native Supabase, Postgres, sequential loop and original stages remain understandable',()=>{
  assert.equal(node('Buscar Consultas Próximas').type,'n8n-nodes-base.postgres');
  assert.equal(node('LEXIA | Conferir API de teste').type,'n8n-nodes-base.supabase');
  assert.match(node('Buscar Consultas Próximas').parameters.query,/s.account_id=\$3::uuid/);
  assert.equal(node('Loop Consultas').parameters.batchSize,1);
  assert.equal(node('Marcar Lembrete Enviado').type,'n8n-nodes-base.postgres');
  const positions=new Set();for(const n of w.nodes.filter(n=>!n.type.endsWith('stickyNote'))){const key=n.position.join(',');assert.ok(!positions.has(key),n.name);positions.add(key);}
  for(const outputs of Object.values(w.connections))for(const branch of outputs.main || [])for(const link of branch)assert.equal(node(link.node).disabled,undefined,link.node);
});
test('deterministic generation whitelists only schedule and original names, not original tokens',()=>{
  const source={nodes:['Intervalo 1h','Config Lembretes','Buscar Consultas Próximas','Travas de Lembrete','Enviar Lembrete','Marcar Lembrete Enviado','Pausa Eterna (Lembrete)'].map(name=>({name,parameters:name==='Intervalo 1h'?{rule:{interval:[{field:'hours'}]}}:{token:'unsafe-secret'}}))};
  const a=buildReminder(source),b=buildReminder(source);assert.deepEqual(a,b);assert.doesNotMatch(JSON.stringify(a),/unsafe-secret/);
});
test('configuration and both database identities fail closed before appointment reads',()=>{
  R.validateConfig(config);
  for(const c of [{...config,environment:'production'},{...config,account_ref:''},{...config,test_project_ref:''},{...config,delivery_mode:'shared_delivery',delivery_contract_reviewed:false}])assert.throws(()=>R.validateConfig(c));
  const marker={id:true,disposable:true,environment:'isolated_test',project_ref:config.test_project_ref};R.identity(config,[marker]);
  for(const rows of [[],[marker,marker],[{...marker,project_ref:'another'}],[{...marker,disposable:false}]])assert.throws(()=>R.identity(config,rows));
  assert.equal(w.connections['LEXIA | Identidade confirmada'].main[0][0].node,'LEXIA | Conferir API de teste');
  assert.equal(w.connections['LEXIA | Identidade da API confirmada'].main[0][0].node,'Buscar Consultas Próximas');
});
test('same versions cannot mix company, account, conversation or appointment results',()=>{
  for(const [kind,key,value] of [['states','cliente_slug','empresa_sintetica_b'],['states','account_id',uuid(99)],['states','id',uuid(99)],['appointments','conversation_id',uuid(99)],['appointments','appointment_ref','another']]){const q=query();q[kind][0][key]=value;assert.throws(()=>resolved(q),/mismatch/);}
  for(const q of [{...query(),states:[]},{...query(),states:[state(),state()]},{...query(),blocks:undefined}])assert.throws(()=>resolved(q),/unavailable/);
});
test('confirmed appointment pause permits its own reminder without any state mutation',()=>{
  const p=resolved();const before=structuredClone(p);assert.equal(R.eligible(p,now).ready,true);assert.deepEqual(p,before);
  const requested=R.propose(p,now);assert.equal(requested.envelope.request.kind,'appointment_reminder');assert.equal(requested.envelope.request.source_ref,p.appointment.appointment_ref);
  assert.doesNotMatch(Object.values(sql).join('\n'),/UPDATE|DELETE|INSERT/);
});
test('human/manual/handoff/legacy/another appointment block even with the own appointment pause',()=>{
  for(const type of ['human_intervention','manual_pause','handoff','legacy_import','appointment']){const q=query();q.blocks.push({status:'active',block_type:type,source_ref:'other-event'});assert.equal(R.eligible(resolved(q),now).reason,'conversation_blocked');}
  const q=query();q.blocks.push({status:'active',block_type:'manual_pause',expires_at:'2026-10-11T15:00:00Z'});assert.equal(R.eligible(resolved(q),now).ready,true);
});
test('cancellation suppresses reminder with active, removed or expired appointment pause',()=>{
  for(const blocks of [query().blocks,[],[{...query().blocks[0],expires_at:'2026-10-10T12:00:00Z'}]]){const q=query();q.appointments[0].status='cancelled';q.blocks=blocks;const p=resolved(q);assert.equal(R.eligible(p,now).reason,'appointment_not_confirmed');assert.deepEqual(p.blocks,blocks);}
});
test('exact 2h and 24h included, below 2h and above 24h rejected',()=>{
  for(const [hours,allowed] of [[2,true],[24,true],[1.999,false],[24.001,false]]){const a=appointment();a.starts_at=new Date(Date.parse(now)+hours*3600000).toISOString();a.ends_at=new Date(Date.parse(a.starts_at)+3600000).toISOString();assert.equal(R.windowReason(a,now)===null,allowed);}
});
test('7am inclusive, 8pm exclusive Boston every day including Sunday',()=>{
  for(const [time,allowed] of [['2026-10-11T10:59:00Z',false],['2026-10-11T11:00:00Z',true],['2026-10-11T23:59:00Z',true],['2026-10-12T00:00:00Z',false]]){const a=appointment();a.starts_at=new Date(Date.parse(time)+10*3600000).toISOString();a.ends_at=new Date(Date.parse(time)+11*3600000).toISOString();assert.equal(R.windowReason(a,time)===null,allowed);}
});
test('real Intl timezone rules cover winter and DST, not a fixed UTC offset',()=>{
  const a={...appointment(),starts_at:'2026-12-14T16:00:00Z',ends_at:'2026-12-14T17:00:00Z'};
  assert.equal(R.windowReason(a,'2026-12-14T11:59:00Z'),'outside_reminder_hours');assert.equal(R.windowReason(a,'2026-12-14T12:00:00Z'),null);
});
test('impossible date, 24h clock, missing end and wrong timezone fail closed',()=>{
  for(const a of [{...appointment(),starts_at:'2026-02-30T12:00:00Z'},{...appointment(),starts_at:'2026-10-12T24:00:00Z'},{...appointment(),ends_at:undefined},{...appointment(),timezone:'UTC'},{...appointment(),ends_at:'2026-10-10T00:00:00Z'}])assert.equal(R.windowReason(a,now),'appointment_time_invalid');
});
test('language from scoped current history overrides booking language, no silent fallback',()=>{
  for(const [lang,expected] of [['pt','Oi'],['es','Hola'],['en','Hi']]){const q=query();q.states[0].language=lang;q.appointments[0].idioma='pt';const p=R.propose(resolved(q),now);assert.ok(p.envelope.request.proposed_actions[0].content.text.startsWith(expected));}
  const q=query();q.states[0].language=null;assert.equal(R.eligible(resolved(q),now).reason,'lead_language_unresolved');
});
test('today/tomorrow and 12h/24h rendering preserve original localized reminder intention',()=>{
  const p=resolved();assert.match(R.message(p,now),/amanhã às 10:00/);
  const q=query();q.appointments[0].starts_at='2026-10-11T20:00:00Z';q.appointments[0].ends_at='2026-10-11T21:00:00Z';q.states[0].language='en';assert.match(R.message(resolved(q),now),/today at 4:00 PM/);
});
test('telephone validates only real WhatsApp; opaque Meta contact and synthetic phone-less supported',()=>{
  const q=query();q.states[0].provider='zapi';assert.equal(R.eligible(resolved(q),now).reason,'trusted_phone_invalid');
  q.states[0].identificador_conversa='15550000001';assert.equal(R.eligible(resolved(q),now).ready,true);
  q.states[0].channel='instagram';q.states[0].identificador_conversa='opaque-meta';assert.equal(R.eligible(resolved(q),now).ready,true);
});
test('existing prepared/claimed/sent/unknown/failed/suppressed never regenerates a new reminder',()=>{
  for(const status of ['prepared','claimed','sent','delivery_unknown','failed','suppressed']){const q=query();q.actions.push({status});assert.equal(R.eligible(resolved(q),now).reason,'existing_reminder_requires_review');}
  assert.match(sql.resolve,/jsonb_build_array\('miranda-reminder-v1'/);assert.doesNotMatch(sql.resolve.split('AS identity')[0],/clock_timestamp|state_version|delivery_epoch/);
});
test('pre-send permission checks appointment/time/language/state and no other reminder',()=>{
  const p=proposal();assert.equal(R.permission(p,{permitted:true},now).permitted,true);
  for(const q of [{error:true},{permitted:false},{}])assert.equal(R.permission(p,q,now).permitted,false);
  assert.match(sql.permission,/a.starts_at=\$11::timestamptz AND a.ends_at=\$12::timestamptz/);
  assert.match(sql.permission,/s.state_version=\$7::bigint AND s.delivery_epoch=\$8::bigint/);
  assert.match(sql.permission,/NOT\(b.block_type='appointment' AND b.source_ref=a.appointment_ref\)/);
});
test('producer envelope accepted by shared Omnichannel; no recipient or lead cutoff is injected',()=>{
  const p=proposal(),c={...config,delivery_mode:'virtual'};const accepted=D.accept(p.envelope,c,now);
  assert.equal(accepted.lead_cutoff_seq,null);assert.equal(accepted.request.kind,'appointment_reminder');assert.equal(accepted.request.due_at,'2026-10-11T14:00:00.000Z');
  assert.equal(p.envelope.recipient,undefined);
  const two=structuredClone(p.envelope);two.request.proposed_actions.push({...two.request.proposed_actions[0],action_id:uuid(99),sequence:2});assert.throws(()=>D.accept(two,c,now),/single_miranda_reminder/);
});
test('shared receiver independently rejects delayed reminders and changed schedules',()=>{
  const p=proposal(),d=D.selectAction(D.resolveConversation(D.accept(p.envelope,{...config,delivery_mode:'virtual'},now),[state()]));
  const q={states:[state()],actions:[],blocks:query().blocks,source_valid:true,appointment:p.appointment};
  assert.equal(D.preflight(d,q,now).ready,true);
  for(const at of ['2026-10-12T13:00:00Z','2026-10-12T00:00:00Z'])assert.equal(D.preflight(d,q,at).results[0].reason,'appointment_not_remindable');
  assert.equal(D.preflight(d,{...q,appointment:{...p.appointment,starts_at:'2026-10-12T15:00:00Z'}},now).ready,false);
});
test('shared atomic provider and virtual gates recheck Boston window and unique source under lock',()=>{
  for(const query of [gate('appointment_reminder'),virtual('appointment_reminder')]){assert.match(query,/lexia_omni_lock_conversation/);assert.match(query,/interval '2 hours'/);assert.match(query,/interval '24 hours'/);assert.match(query,/other.status IN \('claimed','sent','delivery_unknown'\)/);assert.match(query,/a.attendance_status<>'cancelled'/);}
  assert.match(load('appointment_reminder'),/a.starts_at-interval '24 hours'/);
});
test('preview and virtual delivery do not mark a reminder as sent or change any pause',()=>{
  const p=proposal();const preview=proof(p,R.preview(p,now),null);assert.equal(preview.confirmed,false);assert.equal(preview.status,'pending');
  const row={...ledger(p,'suppressed'),reason:'virtual_delivered'};const virtual=proof(p,receipt(p,'suppressed','virtual_delivered'),row,false);assert.equal(virtual.status,'pending');assert.equal(virtual.confirmed,false);
  assert.equal(node('Pausa Eterna (Lembrete)').type,'n8n-nodes-base.code');
});
test('receipt alone cannot prove delivery without the durable sent action and correct message',()=>{
  const p=proposal();for(const [a,valid] of [[null,true],[ledger(p,'claimed'),true],[ledger(p),false],[{...ledger(p),mensagem_id:null},true]]){const out=proof(p,receipt(p),a,valid);assert.equal(out.confirmed,false);assert.equal(out.status,'delivery_unknown');}
});
test('uncertain subworkflow error never marks sent; durable confirmation can recover lost receipt',()=>{
  const p=proposal();assert.equal(proof(p,{error:'private server'},ledger(p,'claimed')).status,'delivery_unknown');
  const confirmed=proof(p,{error:'private server'},ledger(p));assert.equal(confirmed.confirmed,true);assert.equal(confirmed.status,'sent');assert.doesNotMatch(JSON.stringify(confirmed),/private server/);
});
test('ledger conflicts in source, conversation, snapshot, invocation, message content fail closed',()=>{
  const p=proposal();for(const edit of [a=>a.source_ref='other',a=>a.conversation_id=uuid(99),a=>a.captured_delivery_epoch++,a=>a.invocation_id=uuid(99),a=>a.content={type:'text',text:'Outra mensagem'},a=>a.sequence=2]){const a=structuredClone(ledger(p));edit(a);assert.throws(()=>proof(p,receipt(p),a),/origin_mismatch/);}
});
test('unmatched receipt cannot count a foreign provider response as our own delivery',()=>{
  const p=proposal(),r=receipt(p);r.scope={...scope,cliente_slug:'empresa_sintetica_b'};const result=R.checkReceipt(p,r,now);assert.equal(result.receipt.status,'delivery_unknown');assert.equal(result.receipt.provider_message_id,undefined);
});
test('confirmed CRM automation/message events retain appointment source and not a new pause',()=>{
  const p=proof();const e=R.events(p,now,'synthetic-execution');assert.equal(e.confirmed,true);assert.equal(e.crm_event.payload.automation_type,'appointment_reminder');assert.equal(e.crm_event.payload.status,'sent');assert.equal(e.crm_event.payload.source_ref,appointment().appointment_ref);assert.equal(e.message_event.payload.author,'ai');
  const preview=R.events(proof(proposal(),R.preview(proposal(),now),null),now,'synthetic-execution');assert.equal(preview.message_event,null);assert.equal(preview.crm_event.payload.status,'pending');assert.notEqual(e.crm_event.event_id,preview.crm_event.event_id);
});
test('actual bundled n8n Code transitions preserve proposal, receipt and completion pairing',async()=>{
  const p=resolved();assert.equal((await run('Travas de Lembrete',p))[0].json.ready,true);
  const proposed=(await run('LEXIA | Montar pedido de lembrete',p))[0].json;
  const sent=(await run('LEXIA | Conferir recibo',receipt(proposed),{'LEXIA | Permissao atual':proposed}))[0].json;
  const out=(await run('LEXIA | Confirmar no livro central',{actions:[ledger(proposed)],message_verified:true},{'LEXIA | Conferir recibo':sent}))[0];assert.equal(out.json.confirmed,true);assert.deepEqual(out.pairedItem,{item:0});
});
function deliveryHarness(p,mode) {
  const c={...config,delivery_mode:mode,provider_reviewed:true,zapi_base_url:'https://api.z-api.io/instances/synthetic/token/synthetic'};
  const s={...state(),provider:mode==='provider'?'zapi':'fake',provider_account_ref:'synthetic',identificador_conversa:'15550000001'};
  let row=null,calls=0;
  const deps={now:()=>now,identity:async()=>[{id:true,disposable:true,environment:config.environment,project_ref:config.test_project_ref}],resolve:async()=>[s],
    prepare:async()=>{row=ledger(p,'prepared');},load:async()=>({states:[s],actions:[row],blocks:query().blocks,source_valid:true,appointment:p.appointment}),
    virtual:async()=>{row.status='suppressed';row.reason='virtual_delivered';return {permitted:true};},
    claim:async()=>{row.status='claimed';return {out_acquired:true,out_status:'claimed',out_fencing_token:1};},
    send:async()=>{calls++;throw new Error('possible provider acceptance');},
    finish:async d=>{row.status=d.outcome.status;return {status:row.status};}};
  return {c,deps,get row(){return row;},get calls(){return calls;}};
}
test('end-to-end injected virtual reminder uses common owner without claiming real delivery',async()=>{
  const p=proposal(),h=deliveryHarness(p,'virtual');const r=await D.execute(D.accept(p.envelope,h.c,now),h.deps);
  const out=proof(p,r,h.row,false);assert.equal(h.calls,0);assert.equal(out.status,'pending');assert.equal(out.confirmed,false);
  const q=query();q.actions=[h.row];assert.equal(R.eligible(resolved(q),now).ready,false);
});
test('end-to-end possible provider acceptance remains unknown and producer does not retry it',async()=>{
  const p=proposal(),h=deliveryHarness(p,'provider');const r=await D.execute(D.accept(p.envelope,h.c,now),h.deps);
  const out=proof(p,r,h.row,false);assert.equal(h.calls,1);assert.equal(out.status,'delivery_unknown');assert.equal(out.confirmed,false);
  const q=query();q.actions=[h.row];assert.equal(R.eligible(resolved(q),now).reason,'existing_reminder_requires_review');
});
