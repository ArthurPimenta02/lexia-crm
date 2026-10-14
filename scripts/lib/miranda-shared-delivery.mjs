import { assertContractSchema, assertJsonSchemaValue } from '../../lib/omnichannel/schema-validator.ts';
import { validateResponseLanguages } from '../../lib/omnichannel/language-policy.ts';
import requestSchema from '../../contracts/omnichannel/v1/shared-delivery-request.schema.json' with {type:'json'};
import resultSchema from '../../contracts/omnichannel/v1/shared-delivery-result.schema.json' with {type:'json'};

export const validateRequest=value=>assertJsonSchemaValue(requestSchema,value,'shared-delivery-request');
export const validateReceipt=value=>assertJsonSchemaValue(resultSchema,value,'shared-delivery-result');

const scopeKeys=['environment','cliente_slug','channel','account_ref','conversation_ref'];
export const sameScope=(a,b)=>!!a && !!b && scopeKeys.every(k=>a[k]===b[k]);
export const canonical=value=>JSON.stringify(normalize(value));
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])]));
  return value;
}
const integer=v=>Number.isSafeInteger(v) && v>=0;
const uuid=v=>assertJsonSchemaValue({type:'string',format:'uuid'},v,'id');
const timestamp=v=>assertJsonSchemaValue({type:'string',format:'date-time'},v,'timestamp');
const closed=(v,keys)=>{if(!v || typeof v!=='object' || Array.isArray(v) || Object.keys(v).some(k=>!keys.includes(k)))throw new Error('unexpected_delivery_field');};

// This receiver is the Miranda test copy. New companies must bind their own
// reviewed reminder policy, not inherit these original Boston rules.
export function reminderWindowAllowed(a,now,dueAt) {
  try {timestamp(now);timestamp(a.starts_at);timestamp(a.ends_at);timestamp(dueAt);}catch{return false;}
  const start=Date.parse(a.starts_at),at=Date.parse(now),hours=(start-at)/3600000;
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
  return a.status==='confirmed' && a.attendance_status!=='cancelled' && a.timezone==='America/New_York' && Date.parse(a.ends_at)>start && Date.parse(dueAt)===start-24*3600000 && hours>=2 && hours<=24 && hour>=7 && hour<20;
}

// All entry points converge here. Configuration is local/trusted, never part of
// the caller's request. New kinds require a schema and a durable gate first.
export function accept(input,config,now) {
  timestamp(now);
  validateRequest(input);
  if(config.environment!=='isolated_test' || !/^[a-z0-9]{20}$/.test(config.test_project_ref || '') || !['virtual','provider'].includes(config.delivery_mode))throw new Error('configure_isolated_delivery');
  uuid(config.account_ref);
  if(config.delivery_mode==='provider' && config.provider_reviewed!==true)throw new Error('provider_delivery_not_reviewed');
  let request,cutoff;
  if(['lexia.followup.delivery.request.v1','lexia.automation.delivery.request.v1'].includes(input.schema_version)) {
    closed(input,['schema_version','request','lead_cutoff_seq']);
    assertContractSchema('automation-request',input.request);
    request=input.request;cutoff=input.lead_cutoff_seq ?? null;
    if(Date.parse(request.due_at)>Date.parse(now))throw new Error('automation_not_due');
  } else if(input.schema_version==='lexia.delivery.plan.request.v1') {
    closed(input,['schema_version','request_id','scope','captured_state','actions','lead_cutoff_seq']);
    uuid(input.request_id);
    const terminal=input.actions?.[0]?.kind==='appointment_confirmation';
    request={request_id:input.request_id,scope:input.scope,proposed_actions:input.actions,kind:terminal?'appointment_confirmation':'reply',...(terminal?{source_ref:input.actions[0].source_ref}:{})};
    cutoff=input.lead_cutoff_seq;
  } else throw new Error('unsupported_delivery_contract');
  if(!request.scope || request.scope.environment!==config.environment || request.scope.cliente_slug!==config.cliente_slug || request.scope.account_ref!==config.account_ref)throw new Error('trusted_delivery_scope_mismatch');
  if(request.kind==='appointment_reminder' ? cutoff!==null : !integer(cutoff))throw new Error('delivery_cutoff_invalid');
  const actions=request.proposed_actions;
  if(!Array.isArray(actions) || !actions.length || actions.length>20)throw new Error('delivery_plan_size');
  if(request.kind==='appointment_reminder' && actions.length!==1)throw new Error('single_miranda_reminder_required');
  if(request.kind==='appointment_confirmation' && (actions.length!==1||!request.source_ref||actions[0].content.type!=='text'))throw new Error('single_bound_confirmation_required');
  const ids=new Set();
  const state=actions[0].captured_state;
  for(const [i,a] of actions.entries()) {
    assertContractSchema('outbound-action',a);
    if(!sameScope(request.scope,a.scope) || a.invocation_id!==request.request_id || a.sequence!==i+1 || ids.has(a.action_id) || canonical(a.captured_state)!==canonical(state))throw new Error('delivery_action_origin_mismatch');
    if(a.kind!==request.kind || (request.kind!=='reply' && a.source_ref!==request.source_ref))throw new Error('delivery_kind_or_source_mismatch');
    if(!integer(state.state_version) || !integer(state.delivery_epoch))throw new Error('delivery_state_invalid');
    if(a.content.type==='text' && (!a.content.text.trim() || a.content.text.length>4000))throw new Error('provider_text_limit');
    if(a.content.caption?.length>4000)throw new Error('provider_caption_limit');
    ids.add(a.action_id);
  }
  if(input.captured_state && canonical(input.captured_state)!==canonical(state))throw new Error('delivery_captured_state_mismatch');
  let followup=null;
  if(request.kind==='followup') {
    const m=/^followup:(.+):(\d{4}-\d{2}-\d{2}T.+)$/.exec(request.source_ref);
    if(!m)throw new Error('followup_source_invalid');timestamp(m[2]);followup={id:m[1],last_lead_at:m[2]};
  }
  // These envelopes contain contract-validated JSON, not runtime objects.
  const cloneJson=value=>JSON.parse(JSON.stringify(value));
  return {request:cloneJson(request),scope:cloneJson(request.scope),captured_state:cloneJson(state),actions:cloneJson(actions),lead_cutoff_seq:cutoff,followup,config:cloneJson(config),index:0,results:[],continue:true};
}

export function verifyIdentity(p,rows) {
  if(!Array.isArray(rows) || rows.length!==1 || rows[0].id!==true || rows[0].disposable!==true || rows[0].environment!==p.config.environment || rows[0].project_ref!==p.config.test_project_ref)throw new Error('delivery_identity_mismatch');
  return p;
}
export function resolveConversation(p,rows) {
  if(!Array.isArray(rows) || rows.length!==1)throw new Error('delivery_conversation_unavailable');
  const s=rows[0];
  if(!sameScope(p.scope,{...s,account_ref:s.account_id}) || s.account_status!=='active')throw new Error('delivery_conversation_origin_mismatch');
  if(p.config.delivery_mode==='virtual' && (s.provider!=='fake' || !p.scope.conversation_ref.startsWith('test:')))throw new Error('synthetic_virtual_conversation_required');
  if(p.config.delivery_mode==='provider' && (s.provider!=='zapi' || p.scope.channel!=='whatsapp'))throw new Error('unreviewed_provider_adapter');
  // A future Meta adapter must also attest its policy/window; no generic HTTP escape.
  return {...p,conversation_id:s.id,provider:s.provider,provider_account_ref:s.provider_account_ref,recipient:s.identificador_conversa};
}
export function selectAction(p) {return {...p,current:p.actions[p.index],continue:false,ready:false,claimed:false};}
export function assertLedger(p,rows) {
  if(!Array.isArray(rows) || rows.length>p.actions.length)throw new Error('delivery_ledger_invalid');
  for(const row of rows) {
    const a=p.actions.find(a=>a.action_id===row.id);
    if(!a || row.conversation_id!==p.conversation_id || row.invocation_id!==p.request.request_id || row.automation_request_id!==(['reply','appointment_confirmation'].includes(p.request.kind)?null:p.request.request_id) || row.sequence!==a.sequence || row.kind!==a.kind || (row.source_ref ?? null)!==(a.source_ref ?? null) || row.captured_state_version!==a.captured_state.state_version || row.captured_delivery_epoch!==a.captured_state.delivery_epoch || (row.lead_cutoff_seq ?? null)!==p.lead_cutoff_seq || canonical(row.content)!==canonical(a.content))throw new Error('delivery_idempotency_conflict');
  }
  return rows;
}
function result(p,status,reason,now,providerId) {
  const r={schema_version:'lexia.delivery.result.v1',action_id:p.current.action_id,status,attempted_at:now,reason,...(providerId?{provider_message_id:providerId}:{})};
  assertContractSchema('delivery-result',r);return r;
}
export function stop(p,status,reason,now) {return {...p,continue:false,results:[...p.results,result(p,status,reason,now)]};}
export function preflight(p,query,now) {
  if(query.error || !Array.isArray(query.states) || query.states.length!==1 || !Array.isArray(query.blocks))return stop(p,'suppressed','preflight_unavailable',now);
  assertLedger(p,query.actions);
  const s=query.states[0],a=p.current;
  if(!sameScope(p.scope,{...s,account_ref:s.account_id}) || s.id!==p.conversation_id)throw new Error('preflight_origin_mismatch');
  const old=query.actions.find(row=>row.id===a.action_id);
  if(old && old.status!=='prepared') {
    if(p.config.delivery_mode==='virtual' && old.status==='suppressed' && old.reason==='virtual_delivered')return {...stop(p,'suppressed','virtual_delivered',old.concluido_em || now),continue:p.index+1<p.actions.length,index:p.index+1};
    if(old.status==='sent' && old.provider_message_id)return {...stop(p,'duplicate','already_confirmed',old.concluido_em || now,old.provider_message_id),continue:p.index+1<p.actions.length,index:p.index+1};
    if(old.status==='claimed' || old.status==='delivery_unknown')return stop(p,'delivery_unknown','requires_reconciliation',now);
    return stop(p,old.status==='failed'?'failed':'suppressed',old.reason || 'terminal_action',now);
  }
  if(s.state_version!==p.captured_state.state_version || s.delivery_epoch!==p.captured_state.delivery_epoch)return stop(p,'suppressed','state_changed',now);
  if(p.lead_cutoff_seq!==null && s.lead_message_seq!==p.lead_cutoff_seq)return stop(p,'suppressed','superseded_by_new_message',now);
  if(s.projection_status!=='current' || s.account_status!=='active' || query.source_valid!==true)return stop(p,'suppressed','source_or_projection_unavailable',now);
  if((query.blocks || []).some(b=>b.status==='active' && (!b.expires_at || Date.parse(b.expires_at)>Date.parse(now)) && !(b.block_type==='appointment' && ['appointment_reminder','appointment_confirmation'].includes(a.kind) && b.source_ref===a.source_ref)))return stop(p,'suppressed','blocked',now);
  if(a.kind==='appointment_reminder' && (!query.appointment || query.appointment.appointment_ref!==a.source_ref || !reminderWindowAllowed(query.appointment,now,p.request.due_at)))return stop(p,'suppressed','appointment_not_remindable',now);
  const texts=a.content.type==='text'?[a.content.text]:a.content.caption?[a.content.caption]:[];
  const language=s.language?.split('-')[0];
  if(texts.length && (!['pt','en','es'].includes(language) || !validateResponseLanguages(language,texts).allowed))return stop(p,'suppressed','response_language_mismatch',now);
  let provider_request=null;
  if(p.config.delivery_mode==='provider')provider_request=buildProviderRequest({...p,expected_language:language});
  return {...p,ready:true,provider_request,expected_language:language};
}
export function buildProviderRequest(p) {
  const c=p.config,a=p.current;
  if(p.provider!=='zapi' || p.scope.channel!=='whatsapp')throw new Error('unreviewed_provider_adapter');
  const base=new URL(c.zapi_base_url);
  if(base.protocol!=='https:' || base.hostname!=='api.z-api.io' || base.username || base.password || base.search || base.hash || !/^\/instances\/[^/]+\/token\/[^/]+\/?$/.test(base.pathname))throw new Error('configure_trusted_zapi_endpoint');
  if(base.pathname.split('/')[2]!==p.provider_account_ref)throw new Error('provider_account_binding_mismatch');
  if(!/^\+?\d{8,16}$/.test(p.recipient))throw new Error('trusted_recipient_invalid');
  const data={phone:p.recipient};let suffix;
  if(a.content.type==='text') {suffix='send-text';data.message=a.content.text;}
  else {
    const binding=c.media_bindings?.[a.content.media_ref];
    if(!binding || !sameScope(binding.scope,p.scope) || binding.type!==a.content.type || !['pt','en','es'].includes(binding.language) || binding.language!==p.expected_language)throw new Error('media_binding_unavailable');
    const url=new URL(binding.url);
    if(url.protocol!=='https:' || url.username || url.password || !Array.isArray(c.media_hosts) || !c.media_hosts.includes(url.hostname))throw new Error('media_host_not_allowed');
    if(a.content.type==='image') {suffix='send-image';data.image=url.href;if(a.content.caption)data.caption=a.content.caption;}
    else {suffix='send-audio';data.audio=url.href;}
  }
  return {url:base.href.replace(/\/$/,'')+'/'+suffix,body:data};
}
export function classifyProvider(p,response,now) {
  // A transport exception/HTTP code is not evidence that nothing was accepted.
  const body=response.body;
  const providerId=body?.messageId;
  const confirmed=!response.error && Number.isInteger(response.statusCode) && response.statusCode>=200 && response.statusCode<300 && typeof providerId==='string' && providerId.trim() && providerId.length<=256;
  return {...p,outcome:result(p,confirmed?'sent':'delivery_unknown',confirmed?'provider_confirmed':'requires_reconciliation',now,confirmed?providerId:undefined)};
}
export function claimOutcome(p,r,now) {
  if(r.error || typeof r.out_acquired!=='boolean')return stop(p,'delivery_unknown','claim_result_unavailable',now);
  if(r.out_acquired===true) {
    if(r.out_status!=='claimed' || !integer(r.out_fencing_token) || r.out_fencing_token<1)return stop(p,'delivery_unknown','claim_result_invalid',now);
    return {...p,claimed:true,claim:r};
  }
  return stop(p,['claimed','delivery_unknown'].includes(r.out_status)?'delivery_unknown':'suppressed',r.out_reason || 'not_acquired',now);
}
export function committed(p,q,now) {
  if(q.error || !['sent','delivery_unknown','duplicate'].includes(q.status))return stop(p,'delivery_unknown','delivery_commit_unavailable',now);
  if(p.outcome.status==='sent' && ['sent','duplicate'].includes(q.status))return {...p,results:[...p.results,p.outcome],index:p.index+1,continue:p.index+1<p.actions.length};
  return stop(p,'delivery_unknown','requires_reconciliation',now);
}
export function virtualCommitted(p,q,now) {
  if(q.error || q.permitted!==true)return stop(p,'suppressed','virtual_gate_not_permitted',now);
  return {...p,results:[...p.results,result(p,'suppressed','virtual_delivered',now)],index:p.index+1,continue:p.index+1<p.actions.length};
}
export function receipt(p) {
  // Unstarted successors are explicit, never silently considered delivered.
  const results=[...p.results];
  for(const a of p.actions)if(!results.some(r=>r.action_id===a.action_id))results.push({schema_version:'lexia.delivery.result.v1',action_id:a.action_id,status:'suppressed',attempted_at:results.at(-1)?.attempted_at || '1970-01-01T00:00:00Z',reason:'previous_action_not_confirmed'});
  const r={request_id:p.request.request_id,scope:p.scope,captured_state:p.captured_state,results};
  validateReceipt(r);return r;
}

// Runs the same transitions without n8n, against injected adapters only.
export async function execute(p,deps) {
  try {verifyIdentity(p,await deps.identity());p=resolveConversation(p,await deps.resolve(p));await deps.prepare(p);}catch{return receipt(stop(selectAction(p),'suppressed','prepare_unavailable',deps.now()));}
  do {
    p=selectAction(p);let q;
    try{q=await deps.load(p);p=preflight(p,q,deps.now());}catch{p=stop(p,'suppressed','preflight_unavailable',deps.now());break;}
    if(!p.ready){if(p.continue)continue;break;}
    if(p.config.delivery_mode==='virtual') {
      try{q=await deps.virtual(p);}catch{q={error:true};}
      p=virtualCommitted(p,q,deps.now());
    }else {
      try{q=await deps.claim(p);}catch{q={error:true};}
      p=claimOutcome(p,q,deps.now());if(!p.claimed)break;
      try{q=await deps.send(p);}catch{q={error:true};}
      p=classifyProvider(p,q,deps.now());
      try{q=await deps.finish(p);}catch{q={error:true};}
      p=committed(p,q,deps.now());
    }
  }while(p.continue);
  return receipt(p);
}
