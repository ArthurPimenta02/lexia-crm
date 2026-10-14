import { assertContractSchema, assertJsonSchemaValue } from '../../lib/omnichannel/schema-validator.ts';
import toolResultSchema from '../../contracts/omnichannel/v1/tool-result.schema.json';

const clone=v=>JSON.parse(JSON.stringify(v));
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const scopeFields=['environment','cliente_slug','channel','account_ref','conversation_ref'];
const sameScope=(a,b)=>a&&b&&scopeFields.every(k=>a[k]===b[k]);
const time=v=>assertJsonSchemaValue({type:'string',format:'date-time'},v,'calendar_time');
const uuid=v=>assertJsonSchemaValue({type:'string',format:'uuid'},v,'calendar_id');
const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
const canonical=v=>JSON.stringify(Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
const argsFor={
  'availability.check':['servico','variante','variante_confirmada','data_preferida','periodo_preferido','horario_preferido'],
  'appointment.create':['servico','variante','inicio_iso','nome','telefone','email','resumo_queixa','idioma','ignorar_duplicado','canal','telefone_conversa'],
};
export function accept(items,cfg,operation) {
  if(items.length!==1||!object(items[0].json))throw Error('calendar_one_call_required');
  const input=clone(items[0].json),c=input.lexia_call_context,s=c?.scope;
  if(Object.keys(input).some(k=>![...argsFor[operation],'lexia_call_context'].includes(k)))throw Error('calendar_unexpected_input');
  if(!object(c)||!sameScope(s,{...s,environment:'isolated_test',cliente_slug:cfg.cliente_slug,account_ref:cfg.account_ref})||cfg.environment!=='isolated_test'||c.operation!==operation||!['whatsapp','instagram','messenger'].includes(s.channel)||!s.conversation_ref?.startsWith('test:'))throw Error('calendar_scope_mismatch');
  if(Object.keys(s).some(k=>!scopeFields.includes(k))||!/^[a-z0-9_]{1,64}$/.test(s.cliente_slug)||s.conversation_ref.length>256)throw Error('calendar_scope_invalid');
  uuid(s.account_ref);uuid(c.invocation_id);
  if(!object(c.captured_state)||!['state_version','delivery_epoch'].every(k=>Number.isSafeInteger(c.captured_state[k])&&c.captured_state[k]>=0))throw Error('calendar_captured_state_required');
  if(c.calendar_access!=='isolated_test'||c.tools_permitidas!==true)throw Error('calendar_caller_permission_required');
  if(cfg.calendar_reviewed!==true||cfg.allow_calendar_read!==true||!/^[a-z0-9]{20}$/.test(cfg.project_ref||'')||cfg.timezone!=='America/New_York')throw Error('calendar_configuration_not_reviewed');
  if(!Array.isArray(cfg.blocked_dates)||cfg.blocked_dates.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)))throw Error('calendar_blocked_dates_invalid');
  for(const d of cfg.blocked_dates)time(d+'T12:00:00Z');
  if(!Array.isArray(cfg.protected_calendar_hashes)||!cfg.protected_calendar_hashes.length||cfg.protected_calendar_hashes.some(h=>typeof h!=='string'||!/^[0-9a-f]{64}$/.test(h)))throw Error('calendar_protected_identity_required');
  // Explicit personal IDs may be read, never written; ambiguous "primary" is not accepted.
  const secondary=typeof cfg.calendar_id==='string'&&/^[A-Za-z0-9._-]+@group\.calendar\.google\.com$/.test(cfg.calendar_id);
  const personalRead=operation==='availability.check'&&cfg.allow_personal_calendar_read===true&&cfg.allow_calendar_write===false&&c.calendar_write_allowed===false&&typeof cfg.calendar_id==='string'&&/^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cfg.calendar_id);
  if((!secondary&&!personalRead)||cfg.calendar_id!==cfg.expected_calendar_id)throw Error('calendar_secondary_test_calendar_required');
  if(operation==='appointment.create'&&(cfg.allow_calendar_write!==true||c.calendar_write_allowed!==true))throw Error('calendar_write_not_authorized');
  if(typeof input.servico!=='string'||!input.servico.trim()||input.servico.length>256||canonical(input).length>30000)throw Error('calendar_input_limit');
  for(const [k,v]of Object.entries(input))if(k!=='lexia_call_context'&&(typeof v!=='string'||v.length>(k==='resumo_queixa'?2000:512)))throw Error('calendar_argument_invalid');
  if(input.data_preferida){const value=input.data_preferida;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('calendar_date_invalid');time(value+'T12:00:00Z');}
  if(input.horario_preferido&&!/^(?:[01]?\d|2[0-3])(?::[0-5]\d|h[0-5]\d)?\s*(?:am|pm)?$/i.test(input.horario_preferido))throw Error('calendar_clock_invalid');
  if(input.horario_preferido&&/(am|pm)$/i.test(input.horario_preferido)&&! /^(?:[1-9]|1[0-2])(?::[0-5]\d|h[0-5]\d)?\s*(?:am|pm)$/i.test(input.horario_preferido))throw Error('calendar_clock_invalid');
  if(operation==='appointment.create'){time(input.inicio_iso);if(!['pt','en','es'].includes(input.idioma))throw Error('calendar_language_required');}
  const args=Object.fromEntries(argsFor[operation].map(k=>[k,input[k]||'']));
  return {input,config:clone(cfg),request:{scope:clone(s),invocation_id:c.invocation_id,captured_state:clone(c.captured_state),operation,args,confirmation:operation==='appointment.create'?c.confirmation||null:null},scope:clone(s),operation};
}
export function identity(p,rows) {
  if(rows.length!==1||!Array.isArray(rows[0].identities)||rows[0].identities.length!==1)throw Error('calendar_identity_ambiguous');
  const i=rows[0].identities[0];if(i.environment!=='isolated_test'||i.disposable!==true||i.project_ref!==p.config.project_ref)throw Error('calendar_identity_mismatch');return p;
}
export function started(p,rows) {
  const call=rows[0]?.call;
  if(rows.length!==1||!object(call)||canonical(call.request)!==canonical(p.request)||call.calendar_id!==p.config.calendar_id||!/^[0-9a-f]{64}$/.test(call.request_key||''))throw Error('calendar_call_origin_mismatch');
  uuid(call.id);time(call.created_at);
  if(call.provider_event_id!=='1e'+call.request_key)throw Error('calendar_event_id_mismatch');
  return {...p,call, cached:call.status==='completed', uncertain:['claimed','unknown'].includes(call.status)};
}
export function cached(p) {
  if(!object(p.call.receipt)||!sameScope(p.call.receipt.scope,p.scope)||p.call.receipt.invocation_id!==p.request.invocation_id||p.call.receipt.operation!==p.operation||p.call.receipt.tool_call_id!==p.call.id)throw Error('calendar_cached_receipt_mismatch');return clone(p.call.receipt);
}
export function receipt(p,data,now,status,events=[]) {
  time(now);const result={schema_version:'lexia.tool.result.v1',scope:clone(p.scope),invocation_id:p.request.invocation_id,operation:p.operation,tool_call_id:p.call.id,status,data:clone(data),domain_events:clone(events)};
  for(const e of events)assertContractSchema('domain-event',e);
  if((p.operation==='availability.check'||status!=='succeeded')&&events.length)throw Error('calendar_unconfirmed_event');
  assertJsonSchemaValue(toolResultSchema,result,'calendar_tool_receipt');return result;
}
export function permission(p,rows) {
  if(rows.length!==1||typeof rows[0].gate?.allowed!=='boolean')throw Error('calendar_permission_unconfirmed');
  return {...p,allowed:rows[0].gate.allowed,reason:String(rows[0].gate.reason||'calendar_blocked')};
}
export function refusal(p,code,now) {return receipt(p,{status:'BLOQUEADO',reason:code,mensagem:'Operacao nao autorizada. Nao tente contornar esta protecao.'},now,'failed');}
export function uncertain(p,now) {return receipt(p,{status:'INCERTO',reason:'requires_reconciliation',mensagem:'O resultado da criacao precisa ser conferido. Nao crie outro evento nem confirme ao cliente.'},now,'unknown');}
export function catalog(rows) {
  rows=rows.filter(r=>Object.keys(r).length);
  for(const r of rows){if(!object(r)||typeof r.nome!=='string'||!['Samuel','Bruna'].includes(r.profissional)||![true,'true'].includes(r.ativo))throw Error('calendar_catalog_invalid');
    let variants=r.duracao_variantes;if(typeof variants==='string'&&variants)try{variants=JSON.parse(variants);}catch{throw Error('calendar_catalog_variants_invalid');}
    if(variants&&(!object(variants)||Object.values(variants).some(v=>!Number.isFinite(Number(v))||Number(v)<=0||Number(v)>480)))throw Error('calendar_catalog_variants_invalid');
    if([true,'true'].includes(r.requer_avaliacao)&&!rows.some(x=>normalize(x.nome)==='consulta de avaliacao'))throw Error('calendar_evaluation_missing');
  }return rows;
}
export function plan(p,value) {
  if(!object(value)||typeof value.status!=='string')throw Error('calendar_original_output_invalid');
  if(value.status==='OK'&&(!['Samuel','Bruna'].includes(value.profissional)||!Number.isFinite(value.duracao_min)||value.duracao_min<=0||value.duracao_min>480))throw Error('calendar_original_duration_invalid');
  if(value.timeMin){time(value.timeMin);time(value.timeMax);if(Date.parse(value.timeMax)<=Date.parse(value.timeMin))throw Error('calendar_window_invalid');}
  if(p.operation==='appointment.create'&&value.status==='OK'){time(value.inicio);time(value.fim);if(Date.parse(value.fim)-Date.parse(value.inicio)!==value.duracao_min*60000)throw Error('calendar_duration_mismatch');}
  return {...p,plan:clone(value)};
}
export function events(rows) {
  if(rows.length===1&&object(rows[0])&&!Object.keys(rows[0]).length)return [];
  if(rows.length>2000)throw Error('calendar_event_limit');
  const result=[];
  for(const e of rows){if(e.error)throw Error('calendar_read_failed');if(e.status==='cancelled'||e.transparency==='transparent')continue;
    if(!object(e.start)||!object(e.end)||e.recurrence&&!e.recurringEventId)throw Error('calendar_event_incomplete');
    const a=e.start.dateTime||e.start.date+'T00:00:00Z',b=e.end.dateTime||e.end.date+'T00:00:00Z';time(a);time(b);if(Date.parse(b)<=Date.parse(a))throw Error('calendar_event_interval_invalid');
    result.push(clone(e));
  }return result;
}
export function calendarData(p,value) {
  if(!object(value)||!Array.isArray(value.opcoes)&&value.status==='OK')throw Error('calendar_slots_invalid');
  for(const s of [...(value.opcoes||[]),...(value.horario_pedido?.status==='DISPONIVEL'?[value.horario_pedido]:[])]){time(s.inicio_iso);time(s.fim_iso);if(Date.parse(s.fim_iso)<=Date.parse(s.inicio_iso))throw Error('calendar_slot_interval_invalid');}
  return value;
}
export function confirmation(p,DT) {
  if(p.plan.status!=='OK')return p;
  const c=p.request.confirmation;
  const yes=/^(?:sim|sim pode (?:agendar|confirmar)|pode (?:agendar|confirmar)|confirmo|ok|okay|yes|yes please|yes go ahead|go ahead|si|si por favor|si puedes confirmar|puedes confirmar)(?: (?:obrigad[oa]|thanks|gracias))?$/;
  const answer=normalize(c?.latest_lead_message).replace(/[,.!¡¿]/g,' ').replace(/\s+/g,' ').trim();
  if(!object(c)||!yes.test(answer))throw Error('calendar_explicit_confirmation_required');
  const last=String(c.last_delivered_assistant_message||''),dt=DT.fromISO(p.plan.inicio,{setZone:true}).setZone('America/New_York');
  const names=normalize(p.plan.nome).split(' '),telephone=p.plan.telefone.replace(/\D/g,'');
  const services=[p.plan.servico_agendado,p.plan.servico_nome_en,p.plan.servico_nome_es].filter(Boolean).map(normalize);
  const recap=raw=>{const text=normalize(raw),digits=String(raw).replace(/\D/g,'');return names.every(n=>text.includes(n))&&digits.includes(telephone)&&services.some(s=>text.includes(s))&&text.includes(normalize(p.plan.profissional))&&text.includes(dt.toFormat('dd/MM'))&&text.includes(normalize(dt.toFormat('h:mm a')));};
  if(!recap(last)&&!(p.input.ignorar_duplicado==='sim'&&c.keep_both_confirmed===true&&Array.isArray(c.delivered_assistant_messages)&&c.delivered_assistant_messages.some(recap)))throw Error('calendar_delivered_recap_required');
  if(p.input.ignorar_duplicado==='sim'&&c.keep_both_confirmed!==true)throw Error('calendar_second_booking_confirmation_required');return p;
}
export function claimed(p,rows) {
  const c=rows[0]?.claim;if(rows.length!==1||!object(c)||typeof c.acquired!=='boolean'||c.call_id!==p.call.id||c.provider_event_id!==p.call.provider_event_id)throw Error('calendar_claim_unconfirmed');
  if(c.acquired)uuid(c.claim_token);
  return {...p,acquired:c.acquired,ownership_token:c.acquired?c.claim_token:null,reason:c.reason||'claim_denied'};
}
export function created(p,event,now) {
  if(!object(event)||event.error||event.id!==p.call.provider_event_id||event.status!=='confirmed'||event.attendees?.length||event.recurrence?.length||event.description!==marker(p)||event.summary!==summary(p))throw Error('calendar_creation_requires_reconciliation');
  time(event.start?.dateTime);time(event.end?.dateTime);
  if(Date.parse(event.start.dateTime)!==Date.parse(p.plan.inicio)||Date.parse(event.end.dateTime)!==Date.parse(p.plan.fim))throw Error('calendar_creation_requires_reconciliation');
  return {...p,provider_event:clone(event),created_at:now};
}
export const marker=p=>'LEXIA_TEST_CALL='+p.call.id;
export const summary=p=>p.plan.profissional+' - [LEXIA TESTE] '+p.plan.servico_agendado;
export function complete(p,legacy,now) {
  if(legacy.status!=='CRIADO'||typeof legacy.confirmacao_texto!=='string'||!legacy.confirmacao_texto.trim())throw Error('calendar_confirmation_invalid');
  const appointment_ref='caltest:'+p.call.id;
  const domain={schema_version:'lexia.domain.event.v1',event_id:p.call.id,invocation_id:p.request.invocation_id,idempotency_key:'calendar-test:'+p.call.id,type:'appointment.confirmed',occurred_at:now,
    appointment:{appointment_ref,starts_at:p.plan.inicio,ends_at:p.plan.fim,timezone:'America/New_York',tool_invocation_id:p.call.id,status:'confirmed'}};
  const data={...clone(legacy),event_id:undefined,appointment_ref,agendamento:{servico:p.plan.servico_agendado,profissional:p.plan.profissional,nome:p.plan.nome,telefone:p.plan.telefone,inicio:p.plan.inicio,fim:p.plan.fim,variante:p.plan.variante,idioma:p.plan.idioma}};
  delete data.event_id;return receipt(p,data,now,'succeeded',[domain]);
}
export function committed(p,expected,rows) {
  const call=rows[0]?.call;if(rows.length!==1||call?.id!==p.call.id||!['completed','unknown'].includes(call.status)||canonical(call.receipt)!==canonical(expected))throw Error('calendar_commit_unconfirmed_no_auto_retry');return expected;
}
export function validAlternative(slot,p,DT) {
  const start=DT.fromISO(slot.inicio_iso,{setZone:true}).setZone('America/New_York'),end=start.plus({minutes:p.plan.duracao_min});
  if(!start.isValid||start.weekday===7||p.config.blocked_dates.includes(start.toISODate()))return false;
  const samuel=p.plan.profissional==='Samuel'&&start.toISODate()>='2026-08-27'&&start.weekday<=5;
  const minutes=start.hour*60+start.minute,min=samuel?930:600,max=samuel?1140:1200,endMax=samuel&&[2,4].includes(start.weekday)?1170:1200;
  return minutes>=min&&minutes<=max&&start.minute%30===0&&start.second===0&&start.millisecond===0&&end<=start.startOf('day').plus({minutes:endMax});
}
