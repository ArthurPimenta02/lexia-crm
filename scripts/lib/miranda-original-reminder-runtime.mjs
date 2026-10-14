import { assertContractSchema, assertJsonSchemaValue } from '../../lib/omnichannel/schema-validator.ts';
import { validateResponseLanguages } from '../../lib/omnichannel/language-policy.ts';
import { canonical, sameScope, validateRequest, validateReceipt } from './miranda-shared-delivery.mjs';

const stamp=v=>assertJsonSchemaValue({type:'string',format:'date-time'},v,'reminder_timestamp');
const uuid=v=>assertJsonSchemaValue({type:'string',format:'uuid'},v,'reminder_id');
const hours=3600000;
const zone='America/New_York';
export function validateConfig(c) {
  if(c.environment!=='isolated_test' || !/^[a-z0-9_]{1,64}$/.test(c.cliente_slug || '') || !/^[a-z0-9]{20}$/.test(c.test_project_ref || '') || !['preview','shared_delivery'].includes(c.delivery_mode))throw new Error('configure_isolated_reminder');
  uuid(c.account_ref);
  if(c.delivery_mode==='shared_delivery' && (!c.delivery_workflow_ref || c.delivery_contract_reviewed!==true))throw new Error('reminder_delivery_not_reviewed');
  return c;
}
export function identity(c,rows) {
  if(!Array.isArray(rows) || rows.length!==1 || rows[0].id!==true || rows[0].disposable!==true || rows[0].environment!==c.environment || rows[0].project_ref!==c.test_project_ref)throw new Error('reminder_identity_mismatch');
  return c;
}
export function windowReason(a,now) {
  try {stamp(now);stamp(a.starts_at);stamp(a.ends_at);}catch{return 'appointment_time_invalid';}
  if(Date.parse(a.ends_at)<=Date.parse(a.starts_at) || a.timezone!==zone)return 'appointment_time_invalid';
  if(a.status!=='confirmed' || a.attendance_status==='cancelled')return 'appointment_not_confirmed';
  const left=(Date.parse(a.starts_at)-Date.parse(now))/hours;
  if(left>24)return 'reminder_too_early';
  if(left<2)return 'reminder_too_late';
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
  return hour<7 || hour>=20?'outside_reminder_hours':null;
}
export function resolveCandidate(row,q,c) {
  validateConfig(c);uuid(row.id);uuid(row.conversation_id);
  if(row.environment!==c.environment || row.cliente_slug!==c.cliente_slug)throw new Error('reminder_candidate_origin_mismatch');
  if(!Array.isArray(q.states) || q.states.length!==1 || !Array.isArray(q.appointments) || q.appointments.length!==1 || !Array.isArray(q.blocks) || !Array.isArray(q.actions))throw new Error('reminder_source_unavailable');
  const s=q.states[0],a=q.appointments[0];
  const scope={environment:s.environment,cliente_slug:s.cliente_slug,channel:s.channel,account_ref:s.account_id,conversation_ref:s.conversation_ref};
  if(s.id!==row.conversation_id || scope.environment!==c.environment || scope.cliente_slug!==c.cliente_slug || scope.account_ref!==c.account_ref || a.id!==row.id || a.conversation_id!==s.id || a.environment!==scope.environment || a.cliente_slug!==scope.cliente_slug || a.appointment_ref!==row.appointment_ref)throw new Error('reminder_scope_mismatch');
  uuid(s.request_id);uuid(s.action_id);
  const captured_state={state_version:s.state_version,delivery_epoch:s.delivery_epoch};
  if(!Object.values(captured_state).every(v=>Number.isSafeInteger(v)&&v>=0))throw new Error('reminder_state_invalid');
  return {scope,conversation_id:s.id,appointment:a,state:s,blocks:q.blocks,existing_actions:q.actions,request_id:s.request_id,action_id:s.action_id,event_ids:s.event_ids,captured_state};
}
export function eligible(p,now) {
  const reason=windowReason(p.appointment,now);
  if(reason)return {...p,ready:false,status:'pending',reason};
  if(p.state.account_status!=='active' || p.state.projection_status!=='current')return {...p,ready:false,status:'pending',reason:'state_unavailable'};
  if(p.existing_actions.length)return {...p,ready:false,status:'pending',reason:'existing_reminder_requires_review'};
  if(p.blocks.some(b=>b.status==='active' && (!b.expires_at || Date.parse(b.expires_at)>Date.parse(now)) && !(b.block_type==='appointment' && b.source_ref===p.appointment.appointment_ref)))return {...p,ready:false,status:'pending',reason:'conversation_blocked'};
  if(!['pt','en','es'].includes(p.state.language?.split('-')[0]))return {...p,ready:false,status:'pending',reason:'lead_language_unresolved'};
  // Meta has no telephone requirement. Fake accounts never reach a provider.
  if(p.scope.channel==='whatsapp' && p.state.provider!=='fake' && !/^\+?\d{10,16}$/.test(p.state.identificador_conversa || ''))return {...p,ready:false,status:'pending',reason:'trusted_phone_invalid'};
  return {...p,ready:true};
}
export function message(p,now) {
  const lang=p.state.language.split('-')[0];
  const start=new Date(p.appointment.starts_at);
  const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const today=day(start)===day(now);
  const time=new Intl.DateTimeFormat(lang==='en'?'en-US':'pt-BR',{timeZone:zone,hour:'numeric',minute:'2-digit',hour12:lang==='en'}).format(start);
  const first=String(p.state.first_name || '').trim().split(/\s+/)[0].slice(0,80);
  // The central appointment contract has no attested service/name fields.
  // Do not substitute the latest conversation interest for the booked service.
  let text;
  if(lang==='pt')text='Oi'+(first?' '+first:'')+'! Aqui é a Carol, da Miranda Skin Experts. Passando para lembrar da sua consulta '+(today?'hoje':'amanhã')+' às '+time+'. Você pode me responder por aqui confirmando sua presença, por favor? Se tiver qualquer imprevisto, me avisa que a gente remarca.';
  else if(lang==='es')text='Hola'+(first?' '+first:'')+'! Soy Carol, de Miranda Skin Experts. Te escribo para recordarte tu cita '+(today?'hoy':'mañana')+' a las '+time+'. ¿Me respondes por aquí confirmando tu asistencia, por favor? Si surge cualquier imprevisto, avísame y lo reagendamos.';
  else text='Hi'+(first?' '+first:'')+'! It\'s Carol from Miranda Skin Experts. Just a friendly reminder of your appointment '+(today?'today':'tomorrow')+' at '+time+'. Could you reply here to confirm you\'re coming, please? If anything comes up, just let me know and we can reschedule.';
  if(!validateResponseLanguages(lang,[text]).allowed)throw new Error('reminder_language_mismatch');
  return text;
}
export function propose(p,now) {
  const checked=eligible(p,now);if(!checked.ready)throw new Error('reminder_not_eligible:'+checked.reason);
  const due_at=new Date(Date.parse(p.appointment.starts_at)-24*hours).toISOString();
  const action={schema_version:'lexia.outbound.action.v1',action_id:p.action_id,invocation_id:p.request_id,scope:p.scope,sequence:1,kind:'appointment_reminder',source_ref:p.appointment.appointment_ref,captured_state:p.captured_state,content:{type:'text',text:message(p,now)}};
  const envelope={schema_version:'lexia.automation.delivery.request.v1',request:{schema_version:'lexia.automation.request.v1',request_id:p.request_id,kind:'appointment_reminder',scope:p.scope,source_ref:p.appointment.appointment_ref,due_at,proposed_actions:[action]}};
  validateRequest(envelope);
  return {...p,envelope,now};
}
export function permission(p,q,now) {
  if(q.error || q.permitted!==true)return {...p,permitted:false,reason:'reminder_permission_changed'};
  return {...p,permitted:windowReason(p.appointment,now)===null};
}
export function preview(p,now) {
  return {request_id:p.request_id,scope:p.scope,captured_state:p.captured_state,results:[{schema_version:'lexia.delivery.result.v1',action_id:p.action_id,status:'suppressed',attempted_at:now,reason:p.permitted===false?'reminder_permission_changed':'preview_not_sent'}]};
}
export function checkReceipt(p,input,now) {
  try {
    validateReceipt(input);
    if(input.request_id!==p.request_id || !sameScope(input.scope,p.scope) || canonical(input.captured_state)!==canonical(p.captured_state) || input.results.length!==1 || input.results[0].action_id!==p.action_id)throw new Error('receipt_origin');
    return {...p,receipt:input.results[0]};
  }catch{
    return {...p,receipt:{schema_version:'lexia.delivery.result.v1',action_id:p.action_id,status:'delivery_unknown',attempted_at:now,reason:'reminder_receipt_unavailable'}};
  }
}
export function proof(p,q) {
  if(q.error || !Array.isArray(q.actions) || q.actions.length>1)return {...p,confirmed:false,status:'delivery_unknown',reason:'reminder_ledger_unavailable'};
  const a=q.actions[0],action=p.envelope.request.proposed_actions[0];
  if(a && (a.id!==p.action_id || a.conversation_id!==p.conversation_id || a.automation_request_id!==p.request_id || a.invocation_id!==p.request_id || a.sequence!==1 || a.kind!=='appointment_reminder' || a.source_ref!==action.source_ref || a.captured_state_version!==p.captured_state.state_version || a.captured_delivery_epoch!==p.captured_state.delivery_epoch || canonical(a.content)!==canonical(action.content) || a.lead_cutoff_seq!==null))throw new Error('reminder_ledger_origin_mismatch');
  const confirmed=!!a && a.status==='sent' && typeof a.provider_message_id==='string' && !!a.provider_message_id && !!a.mensagem_id && (!p.receipt.provider_message_id || p.receipt.provider_message_id===a.provider_message_id) && q.message_verified===true;
  if(confirmed)stamp(a.concluido_em);
  const virtual=a?.status==='suppressed' && a.reason==='virtual_delivered' && p.receipt.reason==='virtual_delivered';
  const pending=virtual || (!a && ['preview_not_sent','reminder_permission_changed'].includes(p.receipt.reason));
  const unknown=!confirmed && (['sent','duplicate','delivery_unknown'].includes(p.receipt.status) || ['sent','claimed','delivery_unknown'].includes(a?.status));
  return {...p,confirmed,status:confirmed?'sent':unknown?'delivery_unknown':pending?'pending':p.receipt.status==='failed'&&a?.status==='failed'?'failed':'suppressed',reason:confirmed?'provider_confirmed':unknown?'requires_reconciliation':p.receipt.reason || 'not_sent',provider_message_id:confirmed?a.provider_message_id:null,message_id:confirmed?a.mensagem_id:null,confirmed_at:confirmed?a.concluido_em:null};
}
export function events(p,now,execution) {
  const phase=p.confirmed?'sent':p.status==='delivery_unknown'?'delivery_unknown':p.reason==='virtual_delivered'?'virtual':'preview';
  const event_id=p.event_ids?.[phase];uuid(event_id);
  const event={schema_version:'lexia.crm.event.v1',event_id,idempotency_key:'lexia:crm:reminder:'+event_id,correlation_id:p.request_id,event_type:'automation.updated',occurred_at:p.confirmed?p.confirmed_at:now,emitted_at:now,sequence:p.confirmed?2:1,scope:p.scope,source:{system:'workflow',authority:'workflow_execution',workflow_ref:'miranda-reminder-original-crm-v1',execution_ref:String(execution)},payload:{automation_ref:p.request_id,automation_type:'appointment_reminder',status:p.status,source_ref:p.appointment.appointment_ref,due_at:p.envelope.request.due_at,reason:p.reason,action_ref:p.action_id,attempted_at:p.receipt.attempted_at}};
  assertContractSchema('crm-sync-event',event);
  let message_event=null;
  if(p.confirmed) {
    message_event={...event,event_id:p.event_ids.message,idempotency_key:'lexia:crm:reminder:'+p.event_ids.message,event_type:'message.recorded',sequence:1,payload:{message_id:p.message_id,direction:'outbound',author:'ai',message_type:'text',text:p.envelope.request.proposed_actions[0].content.text,delivery_status:'sent',provider_message_ref:p.provider_message_id,action_id:p.action_id}};
    assertContractSchema('crm-sync-event',message_event);
  }
  return {request_id:p.request_id,scope:p.scope,status:p.status,reason:p.reason,confirmed:p.confirmed,crm_event:event,message_event,crm_delivery_pending:true};
}

