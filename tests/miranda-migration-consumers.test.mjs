import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bundleForN8n } from '../scripts/lib/n8n-code-bundle.mjs';
import { resolve } from 'node:path';
const {domainEvents}=new Function(bundleForN8n(resolve('scripts/lib/miranda-migration-crm-events.mjs'),'CrmDomain')+';return CrmDomain;')();
const {snapshotEvents}=new Function(bundleForN8n(resolve('scripts/lib/miranda-migration-crm-events.mjs'),'CrmDomain')+';return CrmDomain;')();
const D=new Function(bundleForN8n(resolve('scripts/lib/miranda-shared-delivery.mjs'),'Delivery')+';return Delivery;')();

const id=n=>`27000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now='2026-10-12T12:00:00Z';
const snapshot=()=>({state:{id:id(1),environment:'isolated_test',cliente_slug:'empresa_sintetica_a',channel:'whatsapp',account_id:id(2),conversation_ref:'test:example'},appointments:[],handoffs:[],automations:[]});
test('confirmed appointment, cancellation and attendance emit separate typed facts in order',()=>{
  const s=snapshot();s.appointments=[{confirmed_event_uuid:id(3),cancelled_event_uuid:id(4),attendance_event_uuid:id(5),appointment_ref:'appointment:1',tool_invocation_id:id(6),starts_at:'2026-10-14T12:00:00Z',ends_at:'2026-10-14T13:00:00Z',timezone:'America/New_York',paused_until_end:true,status:'cancelled',attendance_status:'cancelled',criado_em:now,atualizado_em:now}];
  const e=domainEvents(s,now,'local');assert.deepEqual(e.map(e=>e.event_type),['appointment.confirmed','appointment.cancelled']);
  assert.deepEqual(e[0].scope,e[1].scope);assert.notEqual(e[0].event_id,e[1].event_id);
});
test('accepted automation without provider proof never becomes sent',()=>{
  const s=snapshot();s.automations=[{id:id(3),event_uuid:id(4),kind:'followup',source_ref:'followup:1',due_at:now,recebido_em:now,status:'accepted',actions:[{id:id(5),status:'delivery_unknown'}]}];
  assert.equal(domainEvents(s,now,'local')[0].payload.status,'delivery_unknown');
  s.automations[0].actions=[];assert.equal(domainEvents(s,now,'local')[0].payload.status,'pending');
});
test('confirmed automation supplies stable action identity and provider acknowledgment time',()=>{
  const s=snapshot();s.automations=[{id:id(3),event_uuid:id(4),kind:'appointment_reminder',source_ref:'appointment:1',due_at:now,recebido_em:now,status:'accepted',actions:[{id:id(5),status:'sent',provider_message_id:'provider-example',concluido_em:now}]}];
  const e=domainEvents(s,now,'local')[0];assert.equal(e.payload.status,'sent');assert.equal(e.payload.action_ref,id(5));assert.equal(e.occurred_at,now);
});
test('normal handoff emits a notification fact without inventing a block',()=>{
  const s=snapshot();s.handoffs=[{id:id(3),event_uuid:id(4),block_key:'handoff:example',motivo:'example',resumo:'example',prioridade:'normal',criado_em:now}];
  const e=domainEvents(s,now,'local')[0];assert.equal(e.payload.priority,'normal');assert.equal(e.payload.central_handoff_id,id(3));assert.equal(e.payload.block_id,undefined);
});
test('SQL consumers use version keys and scoped locks, never reset uncertain provider actions',()=>{
  const sql=readFileSync('supabase/review/miranda-migration/202610120003_runtime_consumers.sql','utf8');
  assert.match(sql,/snapshot:'\|\|s.state_version/);assert.match(sql,/projection_scope_denied/);
  assert.match(sql,/crm_command_retry_conflict/);assert.match(sql,/cancel_required/);
  assert.match(sql,/crm_outbox_claim_mismatch/);assert.match(sql,/foreign key\(conversation_id,environment,cliente_slug\)/);
  assert.doesNotMatch(sql,/update public.lexia_outbound_actions/i);
});
test('projection exception cannot be converted to permission at return to the sender',async()=>{
  const w=JSON.parse(readFileSync('n8n/miranda-migration-review/01-omnichannel.inactive.json'));
  const n=w.nodes.find(n=>n.name==='ESTADO | Antes de ENTREGA | Registrar plano idempotente - continuar');
  const run=new (Object.getPrototypeOf(async function(){}).constructor)('$json','$',n.parameters.jsCode);
  await assert.rejects(()=>run({projected:false},()=>({first:()=>({json:{_return:{important:'confirmed-progress'}}})})),/redis_projection_failed/);
  const out=await run({projected:true},()=>({first:()=>({json:{_return:{important:'confirmed-progress'}}})}));assert.equal(out[0].json.important,'confirmed-progress');
});
test('unknown proposal and reconciled sent result use one stable CRM message identity',()=>{
  const s=snapshot();s.contact={id:id(6),nome:'Fictional lead'};s.resume_mode='await_new_message';s.state.criado_em=now;s.state.event_uuid=id(7);
  s.actions=[{id:id(8),record_event_uuid:id(9),event_uuid:id(10),content:{type:'text',text:'Mensagem ficticia'},status:'delivery_unknown',preparado_em:now,reivindicado_em:now,concluido_em:now}];
  const first=snapshotEvents(s,now,'local');s.actions[0].status='sent';s.actions[0].provider_message_id='fictional-provider-id';s.actions[0].event_uuid=id(11);
  const second=snapshotEvents(s,now,'local');const record=x=>x.find(e=>e.event_type==='message.recorded');
  assert.deepEqual(record(first).payload,record(second).payload);assert.equal(record(first).payload.delivery_status,'preparing');
  assert.equal(second.find(e=>e.event_type==='message.delivery.updated').payload.message_id,id(8));
});
test('media enrichment never changes the original recorded message and failed human audio remains human',()=>{
  const s=snapshot();s.contact={id:id(6),nome:'Fictional'};s.resume_mode='await_new_message';s.state.criado_em=now;s.state.event_uuid=id(7);
  s.messages=[{id:id(8),event_uuid:id(9),enrichment_event_uuid:id(10),omni_author:'human_agent',tipo:'audio',media_kind:'audio',media_processing_status:'failed',omni_original_content:'Original audio',conteudo:'Unavailable',criado_em:now}];
  const first=snapshotEvents(s,now,'local');s.messages[0].conteudo='Fictional transcription';s.messages[0].media_processing_status='completed';s.messages[0].enrichment_event_uuid=id(11);
  const second=snapshotEvents(s,now,'local');
  assert.deepEqual(first.find(e=>e.event_type==='message.recorded').payload,second.find(e=>e.event_type==='message.recorded').payload);
  assert.equal(first.find(e=>e.event_type==='message.recorded').payload.author,'human_agent');
  assert.equal(second.find(e=>e.event_type==='message.enrichment.updated').payload.content,'Fictional transcription');
});
test('central blocks use the same logical identity as appointment and handoff handlers',()=>{
  const s=snapshot();s.contact={id:id(6),nome:'Fictional'};s.resume_mode='await_new_message';s.state.criado_em=now;s.state.event_uuid=id(7);
  s.blocks=[{id:id(8),event_uuid:id(9),block_key:'appointment:synthetic',block_type:'appointment',source_ref:'synthetic',status:'active',criado_em:now,atualizado_em:now,expires_at:'2026-10-13T12:00:00Z'}];
  assert.equal(snapshotEvents(s,now,'local').find(e=>e.event_type==='block.upserted').payload.block_id,'appointment:synthetic');
});
test('compiled identity check accepts persistent resources but still rejects a different project',async()=>{
  const w=JSON.parse(readFileSync('n8n/miranda-migration-review/01-omnichannel.inactive.json'));
  const js=w.nodes.find(n=>n.name==='ENTREGA | Identidade confirmada').parameters.jsCode;
  const run=new (Object.getPrototypeOf(async function(){}).constructor)('$input','$json','$now','$',js);
  const p={config:{environment:'isolated_test',test_project_ref:'abcdefghijklmnopqrst'}};
  const get=()=>({item:{json:p}}),input={all:()=>[{}]};
  const q={identities:[{id:true,disposable:false,environment:'isolated_test',project_ref:p.config.test_project_ref}]};
  assert.equal((await run(input,q,{toISO:()=>now},get))[0].json.config.test_project_ref,p.config.test_project_ref);
  q.identities[0].project_ref='different';await assert.rejects(()=>run(input,q,{toISO:()=>now},get),/identity/);
});
test('control routing preserves closed delivery envelopes instead of leaking internal routing fields',async()=>{
  const w=JSON.parse(readFileSync('n8n/miranda-migration-review/01-omnichannel.inactive.json'));
  const js=w.nodes.find(n=>n.name==='OPERACAO | Entrada interna').parameters.jsCode;
  const run=new (Object.getPrototypeOf(async function(){}).constructor)('$json',js);
  const input={schema_version:'lexia.delivery.plan.request.v1',request_id:id(1)};
  assert.deepEqual((await run(input))[0].json,input);
});
test('terminal confirmation is singular, source-bound, and cannot bypass another pause',()=>{
  const scope={...snapshot().state,account_ref:id(2)};delete scope.id;delete scope.account_id;
  const state={state_version:13,delivery_epoch:8},cfg={environment:scope.environment,cliente_slug:scope.cliente_slug,account_ref:scope.account_ref,test_project_ref:'abcdefghijklmnopqrst',delivery_mode:'virtual'};
  const action={schema_version:'lexia.outbound.action.v1',action_id:id(3),invocation_id:id(4),scope,sequence:1,kind:'appointment_confirmation',captured_state:state,source_ref:'appointment:example',content:{type:'text',text:'Agendamento confirmado.'}};
  const request={schema_version:'lexia.delivery.plan.request.v1',request_id:id(4),scope,captured_state:state,lead_cutoff_seq:1,actions:[action]};
  const p=D.selectAction({...D.accept(request,cfg,now),conversation_id:id(1)});
  const q={states:[{id:id(1),...scope,account_id:id(2),...state,lead_message_seq:1,projection_status:'current',account_status:'active',language:'pt'}],actions:[],source_valid:true,blocks:[{block_type:'appointment',source_ref:action.source_ref,status:'active'}]};
  assert.equal(D.preflight(p,q,now).ready,true);
  q.blocks.push({block_type:'manual_pause',source_ref:'manual',status:'active'});assert.equal(D.preflight(p,q,now).ready,false);
  assert.throws(()=>D.accept({...request,actions:[action,{...action,action_id:id(5),sequence:2}]},cfg,now),/single_bound/);
});
test('terminal confirmation SQL binds operation, original captured state, invocation and exact receipt text',()=>{
  const sql=readFileSync('supabase/review/miranda-migration/202610120003_runtime_consumers.sql','utf8');
  assert.match(sql,/confirmation_request_state_mismatch/);assert.match(sql,/t.request->'captured_state'=state/);
  assert.match(sql,/request->>'invocation_id'=p_invocation::text/);assert.match(sql,/operation='appointment.create'/);
  assert.match(sql,/s.state_version=p_version\+/);assert.match(sql,/confirmacao_texto/);
  const cancel=readFileSync('supabase/review/miranda-migration/202610120002_migration_control.sql','utf8');
  assert.match(cancel,/cancel_receipt_origin_mismatch/);assert.match(cancel,/cancel_receipt_proof_required/);
  assert.match(cancel,/r.appointment_ref,b.tool_call_id::text/);
});
