import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handoffDecision, requestCancellation, confirmCancellation, reminderAllowed,
  reduceFollowupCycle, classifyCancellationRead, crmReceiptConfirmed, assertVirtualScope, calendarBrainConfig } from '../scripts/lib/miranda-migration-policy.mjs';
const appointment = { appointment_ref:'synthetic-appointment', calendar_id:'synthetic@group.calendar.google.com',
  provider_event_id:'synthetic-event', status:'confirmed', ends_at:'2026-10-12T18:00:00Z' };
const scope={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',channel:'whatsapp',account_ref:'24000000-0000-4000-8000-000000000001',conversation_ref:'synthetic-conversation'};
const cycle = () => ({scope,cycle_ref:'synthetic-cycle',conversation_id:'synthetic-conversation',event_ids:[],status:'scheduled'});
const event = (type, data={}) => ({scope,type,cycle_ref:'synthetic-cycle',conversation_id:'synthetic-conversation',event_id:type,occurred_at:'2026-10-12T12:00:00Z',...data});
test('virtual ingress is bound to trusted configuration and original message BEFORE persistence',()=>{
  const cfg={environment:scope.environment,cliente_slug:scope.cliente_slug,test_account_ref:scope.account_ref};
  const op={canal:scope.channel,lexia_session_id:'synthetic-session',lexia_run_id:'synthetic-run',mensagem_id_externo:'synthetic-message',conteudo_mensagem:'Synthetic text'};
  const req={scope:{...scope,conversation_ref:'test:synthetic-session'},run_id:op.lexia_run_id,input:{message_id:op.mensagem_id_externo,text:op.conteudo_mensagem}};
  assert.doesNotThrow(()=>assertVirtualScope(req,cfg,op));
  for(const patch of [{cliente_slug:'empresa_sintetica_b'},{account_ref:'other'},{channel:'instagram'},{conversation_ref:'test:other'},{environment:'production'}])assert.throws(()=>assertVirtualScope({...req,scope:{...req.scope,...patch}},cfg,op));
  assert.throws(()=>assertVirtualScope({...req,input:{...req.input,text:'other'}},cfg,op));
});
test('normal/low handoff only notifies; high/urgent require resolution AND resume with no TTL',()=>{
  for(const p of ['normal','baixa'])assert.equal(handoffDecision(p).block,false);
  for(const p of ['alta','urgente']) {const r=handoffDecision(p);assert.equal(r.block,true);assert.equal(r.expires_at,null);assert.equal(r.requires_resolution_and_resume,true);}
  assert.throws(()=>handoffDecision('arbitrary'));
});
test('cancellation intent blocks reminders without claiming Google already cancelled',()=>{
  const a=requestCancellation(appointment,'synthetic-request');assert.equal(a.status,'confirmed');
  assert.equal(a.ends_at,appointment.ends_at);assert.equal(reminderAllowed(a,[],'2026-10-12T12:00:00Z'),false);
  assert.deepEqual(requestCancellation(a,'synthetic-request'),a);assert.throws(()=>requestCancellation(a,'other'));
});
test('cancellation after ended/expired block never recreates the block or changes deadline',()=>{
  for(const status of ['ended','expired']) {
    const a=requestCancellation({...appointment,block:{status,expires_at:appointment.ends_at}},'synthetic-request');
    const done=confirmCancellation(a,{operation:'appointment.cancel',request_id:'synthetic-request',appointment_ref:a.appointment_ref,
      calendar_id:a.calendar_id,provider_event_id:a.provider_event_id,status:'succeeded',absence_verified:true});
    assert.equal(done.status,'cancelled');assert.deepEqual(done.block,a.block);assert.equal(done.ends_at,a.ends_at);
  }
});
test('availability, another request/calendar/event, and uncertain cancellation are never confirmation',()=>{
  const a=requestCancellation(appointment,'synthetic-request');
  const r={operation:'appointment.cancel',request_id:'synthetic-request',appointment_ref:a.appointment_ref,calendar_id:a.calendar_id,provider_event_id:a.provider_event_id,status:'succeeded',absence_verified:true};
  for(const patch of [{operation:'availability.check'},{request_id:'other'},{calendar_id:'other'},{provider_event_id:'other'},{absence_verified:false}])assert.throws(()=>confirmCancellation(a,{...r,...patch}));
  const unknown=confirmCancellation(a,{...r,status:'unknown',absence_verified:false});assert.equal(unknown.status,'confirmed');assert.equal(unknown.cancellation_status,'unknown');
});
test('only exact own appointment block can be bypassed by its reminder',()=>{
  const own={block_type:'appointment',source_ref:appointment.appointment_ref,status:'active',expires_at:appointment.ends_at};
  assert.equal(reminderAllowed(appointment,[own],'2026-10-12T12:00:00Z'),true);
  for(const b of [{...own,source_ref:'other'},...['manual_pause','human_intervention','handoff'].map(block_type=>({...own,block_type}))])assert.equal(reminderAllowed(appointment,[own,b],'2026-10-12T12:00:00Z'),false);
});
test('404/410 require verified calendar access; cancelled must match mapped event',()=>{
  for(const v of [{error:{httpCode:'404'}},{statusCode:410},{id:'synthetic-event',status:'cancelled'}])assert.equal(classifyCancellationRead(v,'synthetic-event',true),'succeeded');
  for(const v of [{},{error:{httpCode:403}},{error:{message:'not found'}},{error:{httpCode:504}},{id:'other',status:'cancelled'}])assert.equal(classifyCancellationRead(v,'synthetic-event',true),'unknown');
  assert.equal(classifyCancellationRead({error:{httpCode:404}},'synthetic-event',false),'unknown');
});
test('recovery and conversion require confirmed send, subsequent lead reply and actual create receipt',()=>{
  const sent=reduceFollowupCycle(cycle(),event('sent',{action_id:'synthetic-action',provider_message_id:'synthetic-message'}));
  const replied=reduceFollowupCycle(sent,event('lead_replied',{occurred_at:'2026-10-12T12:01:00Z',author:'lead',provider_message_id:'synthetic-reply'}));
  assert.equal(replied.status,'recovered');
  const converted=reduceFollowupCycle(replied,event('appointment_confirmed',{occurred_at:'2026-10-12T12:02:00Z',operation:'appointment.create',tool_status:'succeeded',appointment_ref:'synthetic-booking'}));
  assert.equal(converted.status,'converted');assert.deepEqual(reduceFollowupCycle(converted,event('sent',{action_id:'synthetic-action',provider_message_id:'synthetic-message'})),converted);
  assert.throws(()=>reduceFollowupCycle(converted,event('sent',{})),/retry_conflict/);
});
test('replaying uncertain cancellation never reopens permission to attempt deletion',()=>{
  const a={...appointment,cancellation_request_id:'synthetic-request',cancellation_status:'unknown'};
  assert.equal(requestCancellation(a,'synthetic-request').cancellation_status,'unknown');
  assert.equal(requestCancellation({...appointment,status:'cancelled'},'synthetic-request').cancellation_status,'requested');
});
test('late earlier reply and later new reply cannot downgrade a converted follow-up',()=>{
  let c=reduceFollowupCycle(cycle(),event('sent',{action_id:'a',provider_message_id:'p'}));
  c=reduceFollowupCycle(c,event('lead_replied',{occurred_at:'2026-10-12T12:01:00Z',author:'lead',provider_message_id:'reply'}));
  c=reduceFollowupCycle(c,event('appointment_confirmed',{occurred_at:'2026-10-12T12:02:00Z',operation:'appointment.create',tool_status:'succeeded',appointment_ref:'booking'}));
  for(const [id,at]of [['old','2026-10-12T11:59:00Z'],['new','2026-10-12T12:03:00Z']]) {
    c=reduceFollowupCycle(c,event('lead_replied',{event_id:id,occurred_at:at,author:'lead',provider_message_id:id}));assert.equal(c.status,'converted');
  }
});
test('delayed events cannot fake recovery or downgrade converted pipeline',()=>{
  const reply=event('lead_replied',{occurred_at:'2026-10-12T12:01:00Z',author:'lead',provider_message_id:'synthetic-reply'});
  const booking=event('appointment_confirmed',{occurred_at:'2026-10-12T12:02:00Z',operation:'appointment.create',tool_status:'succeeded',appointment_ref:'synthetic-booking'});
  const sent=event('sent',{action_id:'synthetic-action',provider_message_id:'synthetic-message'});
  const delayed=reduceFollowupCycle(reduceFollowupCycle(reduceFollowupCycle(cycle(),booking),reply),sent);
  assert.equal(delayed.status,'converted');
  const old=reduceFollowupCycle(reduceFollowupCycle(cycle(),sent),{...reply,occurred_at:'2026-10-12T11:59:00Z'});assert.equal(old.status,'sent');
});
test('pipeline refuses another tenant/conversation and proposal without effect proof',()=>{
  for(const e of [event('sent'),event('sent',{action_id:'a',provider_message_id:'p',conversation_id:'other'}),
    event('sent',{action_id:'a',provider_message_id:'p',scope:{...scope,cliente_slug:'empresa_sintetica_b'}}),
    event('lead_replied',{author:'ai',provider_message_id:'p'}),event('appointment_confirmed',{operation:'availability.check',tool_status:'succeeded',appointment_ref:'a'})])assert.throws(()=>reduceFollowupCycle(cycle(),e));
});
test('HTTP success alone does not acknowledge the CRM outbox; receipt must match the event',()=>{
  for(const status of ['applied','duplicate'])assert.equal(crmReceiptConfirmed({statusCode:200,body:{message:{event_id:'synthetic-event',status}}},'synthetic-event'),true);
  for(const response of [{statusCode:200,body:{message:{event_id:'other',status:'applied'}}},
    {statusCode:200,body:{message:{event_id:'synthetic-event',status:'failed'}}},
    {statusCode:200,body:{message:'OK'}},{error:{},statusCode:200},{}])assert.equal(crmReceiptConfirmed(response,'synthetic-event'),false);
});
test('calendar read-only configuration is derived from the authenticated operation, not a model request',()=>{
  const c={calendar_read_only:false};
  assert.equal(calendarBrainConfig(c,{operacao:{calendar_write_allowed:false}}).calendar_read_only,true);
  assert.equal(calendarBrainConfig(c,{payload:JSON.stringify({operacao:{calendar_write_allowed:true}})}).calendar_read_only,false);
  assert.equal(calendarBrainConfig({calendar_read_only:true},{operacao:{calendar_write_allowed:true}}).calendar_read_only,true);
});
