import { assertContractSchema, assertJsonSchemaValue } from '../../lib/omnichannel/schema-validator.ts';
import { detectLanguage, resolveLeadLanguage, validateResponseLanguages } from '../../lib/omnichannel/language-policy.ts';
import { referenceFingerprint } from './reference-denylist.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const keys = ['environment','cliente_slug','channel','account_ref','conversation_ref'];
const sameScope = (a,b) => !!a && !!b && keys.every(k=>a[k]===b[k]);
const uuid = value => assertJsonSchemaValue({type:'string',format:'uuid'},value,'brain_id');
const time = value => assertJsonSchemaValue({type:'string',format:'date-time'},value,'brain_time');
const object = value => value && typeof value==='object' && !Array.isArray(value);
const assistantSent = m => m.autor==='agente_ia'&&m.direccao==='enviada'&&(!m.status||['sent','delivered','read','virtual_delivered'].includes(m.status));
const confirmedQuestions = (history,prior=[]) => [...new Set([...prior,...history.filter(assistantSent).flatMap(m=>m.conteudo.match(/[^.!?\n]+\?/g)||[]).map(q=>q.trim())])].slice(-20);
const canonical = value => JSON.stringify(normalize(value));
function normalize(value) {
  return Array.isArray(value)?value.map(normalize):object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])])):value;
}
export function parse(value) {
  if(object(value))return clone(value);
  if(typeof value!=='string')throw new Error('brain_json_required');
  const text=value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const result=JSON.parse(text);
  if(!object(result))throw new Error('brain_json_object_required');
  return result;
}
export function scopeKey(scope) {return JSON.stringify(keys.map(k=>scope[k]));}
export function requestIdentity(p) {
  return canonical({scope:p.scope,invocation_id:p.invocation_id,captured_state:p.captured_state,mensagem:p.mensagem,historico:p.historico,contexto:p.contexto,operacao:p.operacao});
}
export function accept(items,cfg) {
  if(items.length!==1)throw new Error('one_brain_conversation_per_call');
  let p=items[0].json.payload??items[0].json;
  if(typeof p==='string')p=parse(p);
  if(p?.payload)p=parse(p.payload);
  if(!object(p)||!object(p.scope)||!object(p.contexto)||!object(p.contexto.dados)||!object(p.mensagem)||!object(p.contacto))throw new Error('brain_envelope_invalid');
  const s=p.scope;
  if(cfg.environment!=='isolated_test'||s.environment!==cfg.environment||s.cliente_slug!==cfg.cliente_slug||s.account_ref!==cfg.account_ref||p.cliente?.slug!==s.cliente_slug||p.cliente?.canal!==s.channel)throw new Error('brain_trusted_scope_mismatch');
  if(!/^[a-z0-9_]{1,64}$/.test(s.cliente_slug)||!['whatsapp','instagram','messenger'].includes(s.channel)||typeof s.conversation_ref!=='string'||!s.conversation_ref.startsWith('test:')||s.conversation_ref.length>256)throw new Error('brain_test_scope_required');
  uuid(s.account_ref);uuid(p.invocation_id);
  if(!object(p.captured_state)||!['state_version','delivery_epoch'].every(k=>Number.isSafeInteger(p.captured_state[k])&&p.captured_state[k]>=0))throw new Error('brain_state_invalid');
  if(p.operacao?.modo_teste!==true||p.operacao.permitir_envio_real!==false||p.operacao.permitir_notificacao_handoff!==false)throw new Error('brain_external_effects_forbidden');
  const central=cfg.memory_backend==='central';
  if(cfg.models_reviewed!==true||cfg.private_data_reviewed!==true||!/^[a-z0-9]{20}$/.test((central?cfg.central_project_ref:cfg.private_project_ref)||'')||(central&&cfg.catalog_read_only!==true))throw new Error('configure_isolated_brain_models_and_private_data');
  if(cfg.calendar_read_only===true&&p.operacao.calendar_write_allowed!==false)throw new Error('brain_read_only_calendar_required');
  const toolRefs=cfg.calendar_read_only===true?[cfg.availability_workflow_ref]:[cfg.availability_workflow_ref,cfg.create_appointment_workflow_ref];
  if(cfg.calendar_tools_reviewed===true&&p.operacao.tools_permitidas===true&&toolRefs.some(ref=>!/^[a-zA-Z0-9_-]{1,64}$/.test(ref||'')))throw new Error('configure_reviewed_isolated_calendar_tools');
  if(cfg.calendar_tools_reviewed===true&&p.operacao.tools_permitidas===true){
    if(!Array.isArray(cfg.protected_tool_fingerprints)||!cfg.protected_tool_fingerprints.length||cfg.protected_tool_fingerprints.some(x=>typeof x!=='string'||!/^[0-9a-f]{8}$/.test(x)))throw new Error('brain_protected_tools_required');
    if(toolRefs.some(x=>cfg.protected_tool_fingerprints.includes(referenceFingerprint(x))))throw new Error('brain_original_production_tool_forbidden');
  }
  if(!['string'].includes(typeof p.mensagem.actual)||p.mensagem.actual.length>20000||!Array.isArray(p.historico)||p.historico.length>200||canonical(p).length>150000)throw new Error('brain_input_limit');
  for(const m of p.historico) {
    if(!object(m)||!['cliente','agente_ia','equipe_humana','sistema'].includes(m.autor)||typeof m.conteudo!=='string'||m.conteudo.length>20000)throw new Error('brain_history_invalid');
    if(m.scope&&!sameScope(m.scope,s))throw new Error('brain_history_scope_mismatch');
    if(m.criado_em)time(m.criado_em);
  }
  const op=p.operacao||{};
  if(['uazapi_token','uazapi_base_url','numero_equipe','service_role','password'].some(k=>op[k]))throw new Error('brain_secret_or_destination_in_payload');
  p=clone(p);
  p.historico.sort((a,b)=>a.criado_em&&b.criado_em?Date.parse(a.criado_em)-Date.parse(b.criado_em):0);
  return {payload:p,scope:clone(s),memory_key:scopeKey(s),request_identity:requestIdentity(p),cfg:clone(cfg)};
}
export function privateIdentity(ctx,rows) {
  if(ctx.cfg.memory_backend==='central') {
    if(rows.length!==1||rows[0].environment!==ctx.scope.environment||rows[0].project_ref!==ctx.cfg.central_project_ref||rows[0].authorized!==true)throw new Error('brain_central_identity_mismatch');
    return ctx;
  }
  if(rows.length!==1||rows[0].disposable!==true||rows[0].environment!==ctx.cfg.environment||rows[0].project_ref!==ctx.cfg.private_project_ref||rows[0].cliente_slug!==ctx.scope.cliente_slug)throw new Error('brain_private_project_identity_mismatch');
  return ctx;
}
export function restoreMemory(ctx,rows) {
  rows=rows.filter(r=>object(r)&&Object.keys(r).length);
  if(rows.length>1)throw new Error('brain_memory_ambiguous');
  const row=rows[0];
  if(row&&(!sameScope(row.scope_json,ctx.scope)||row.memory_key!==ctx.memory_key||!Number.isSafeInteger(row.version)||row.version<1||!object(row.context_json)))throw new Error('brain_memory_origin_invalid');
  if(row?.last_invocation_id===ctx.payload.invocation_id) {
    if(row.last_request_identity!==ctx.request_identity||!object(row.cached_result))throw new Error('brain_invocation_id_conflict');
    if(!sameScope(row.cached_result.scope,ctx.scope)||canonical(row.cached_result.captured_state)!==canonical(ctx.payload.captured_state))throw new Error('brain_cached_result_origin_mismatch');
    return {...ctx,memory:row,cached:true,result:clone(row.cached_result)};
  }
  const p=clone(ctx.payload);
  const previous=row?.context_json||{};
  for(const facts of [previous,p.contexto.dados])if(facts.perguntas_feitas!==undefined&&(!Array.isArray(facts.perguntas_feitas)||facts.perguntas_feitas.some(v=>typeof v!=='string')))throw new Error('brain_memory_questions_invalid');
  // A new operational snapshot may refine private facts, but not erase a draft.
  p.contexto.dados=merge(previous,p.contexto.dados||{});
  p.historico=ctx.payload.historico.filter(m=>m.autor!=='agente_ia'||assistantSent(m));
  if(['pt','en','es'].includes(previous.idioma))p.contexto.dados.idioma=previous.idioma;
  p.contexto.dados.perguntas_feitas=confirmedQuestions(p.historico,previous.perguntas_feitas||[]);
  p.contexto.dados.idioma=leadLanguage(p);
  p.contexto.dados.apresentacao_ja_enviada=previous.apresentacao_ja_enviada===true||p.contexto.dados.apresentacao_ja_enviada===true||p.historico.some(m=>assistantSent(m)&&intro(m.conteudo));
  if(ctx.payload.anuncio)p.contexto.dados.origem_anuncio=clone(ctx.payload.anuncio);
  p._lexia={scope:clone(ctx.scope),invocation_id:p.invocation_id,captured_state:clone(p.captured_state)};
  return {...ctx,payload:p,memory:row||null,cached:false};
}
function merge(a,b) {
  const result=clone(a||{});
  for(const [key,value] of Object.entries(b||{})) {
    if(value===null||value===undefined||value==='')continue;
    if(Array.isArray(value)&&!value.length)continue;
    result[key]=object(value)?merge(result[key],value):clone(value);
  }
  return result;
}
function leadText(text) {
  const captions=[...String(text||'').matchAll(/<MensagemUsuario>([\s\S]*?)<\/MensagemUsuario>/gi)].map(m=>m[1]);
  return String(text||'').replace(/<Contexto(Imagem|PDF|Video|Documento|Arquivo)>[\s\S]*?<\/Contexto\1>/gi,' ').replace(/<Contexto(Imagem|PDF|Video|Documento|Arquivo)>[\s\S]*$/gi,' ').replace(/\[(?:Imagem|PDF|Video)\][^\n]*(?:\nMidia original:[^\n]*)?/gi,' ').replace(/\nMidia original:[^\n]*/gi,' ')+captions.join('\n');
}
export function leadLanguage(p) {
  const text=leadText(p.mensagem.actual),lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const single=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const choice={english:'en',ingles:'en',espanol:'es',espanhol:'es',spanish:'es',portugues:'pt',portuguese:'pt'}[single];
  let prior=String(p.contexto.dados?.idioma||'').split('-')[0];
  if(!['pt','en','es'].includes(prior))prior=null;
  const latest=lines.at(-1)||text,detection=detectLanguage(latest);
  const unambiguousShort=detection.language&&detection.scores[detection.language]>=2&&Object.entries(detection.scores).every(([language,score])=>language===detection.language||score===0);
  let language=choice||(unambiguousShort?detection.language:resolveLeadLanguage(latest,prior));
  if(!language)language=resolveLeadLanguage(text,prior);
  if(!language)for(const h of [...p.historico].reverse()) {
    if(h.autor!=='cliente')continue;
    language=resolveLeadLanguage(leadText(h.conteudo));if(language)break;
  }
  if(!language)throw new Error('brain_lead_language_unresolved');
  return language;
}
export function prepareEntry(original,ctx) {
  const e=clone(original),p=ctx.payload;
  e.cliente={...e.cliente,slug:p.scope.cliente_slug,canal:p.scope.channel};
  e.historico=p.historico.filter(m=>m.autor!=='sistema').map(m=>({...m}));
  e.contexto.dados={...p.contexto.dados,...e.contexto.dados,idioma:leadLanguage(p)};
  e._lexia=clone(p._lexia);
  e._lexia.tool_context=calendarContext(ctx,'');
  const human=e.historico.filter(m=>m.autor==='equipe_humana').at(-1);
  if(human)e.contexto.dados.intervencao_humana='As mensagens da equipe prevalecem sobre resumos antigos. Continue do ponto ja combinado; isto nao comprova criacao de um novo evento na agenda.';
  return e;
}
export function calendarContext(ctx,operation) {
  const p=ctx.payload,messages=p.historico.filter(assistantSent).slice(-6).map(m=>m.conteudo),last=messages.at(-1)||'';
  return {scope:clone(ctx.scope),invocation_id:p.invocation_id,captured_state:clone(p.captured_state),operation,
    calendar_access:p.operacao.calendar_access,tools_permitidas:p.operacao.tools_permitidas===true,calendar_write_allowed:p.operacao.calendar_write_allowed===true,
    confirmation:{latest_lead_message:p.mensagem.actual,last_delivered_assistant_message:last,delivered_assistant_messages:messages,
      keep_both_confirmed:/\b(dois|duas|two|both|dos)\b/i.test(last)&&/agendament|sessoes|sessões|appointments|bookings|citas/i.test(last)}};
}
export function captureTools(ctx,agent) {
  const events=[],audit=[],templates=[],appointments=[];
  for(const step of agent.intermediateSteps||[]) {
    const name=step.action?.tool;
    if(!['verificar_disponibilidade','criar_agendamento'].includes(name))continue;
    let result;
    try{
      result=typeof step.observation==='string'?JSON.parse(step.observation):clone(step.observation);
      if(Array.isArray(result)){if(result.length!==1)throw new Error('ambiguous');result=result[0];}
      if(result?.json)result=result.json;
      if(!object(result))throw new Error('invalid');
    }catch{throw new Error('brain_tool_receipt_invalid');}
    const operation=name==='criar_agendamento'?'appointment.create':'availability.check';
    if(operation==='appointment.create'&&ctx.cfg.calendar_read_only===true)throw new Error('brain_read_only_tool_forbidden');
    if(result.schema_version!=='lexia.tool.result.v1'||!sameScope(result.scope,ctx.scope)||result.invocation_id!==ctx.payload.invocation_id||result.operation!==operation||typeof result.tool_call_id!=='string'||!result.tool_call_id||!['succeeded','failed','unknown'].includes(result.status))throw new Error('brain_tool_receipt_origin_mismatch');
    if(!ctx.cfg.calendar_tools_reviewed||ctx.payload.operacao.tools_permitidas!==true||ctx.payload.operacao.calendar_access!=='isolated_test')throw new Error('brain_calendar_not_authorized');
    const domain=result.domain_events||[];
    if(operation==='availability.check'&&domain.length)throw new Error('availability_does_not_confirm_appointment');
    if(result.status!=='succeeded'&&domain.length)throw new Error('unconfirmed_tool_event');
    if(operation==='appointment.create'&&result.status==='succeeded') {
      if(result.data?.status!=='CRIADO'||typeof result.data.confirmacao_texto!=='string'||!result.data.confirmacao_texto.trim()||domain.length!==1)throw new Error('brain_creation_receipt_incomplete');
      const event=domain[0];assertContractSchema('domain-event',event);
      if(event.type!=='appointment.confirmed'||event.invocation_id!==ctx.payload.invocation_id||event.appointment.tool_invocation_id!==result.tool_call_id||event.appointment.appointment_ref!==result.data.appointment_ref||event.appointment.timezone!=='America/New_York'||Date.parse(event.appointment.ends_at)<=Date.parse(event.appointment.starts_at))throw new Error('brain_creation_event_mismatch');
      if(step.action.toolInput?.inicio_iso&&Date.parse(step.action.toolInput.inicio_iso)!==Date.parse(event.appointment.starts_at))throw new Error('brain_tool_slot_mismatch');
      events.push(clone(event));templates.push(result.data.confirmacao_texto.trim());
      const fields=result.data.agendamento||{};
      appointments.push({...clone(event.appointment),servico:String(fields.servico||step.action.toolInput?.servico||''),profissional:String(fields.profissional||''),nome:String(fields.nome||step.action.toolInput?.nome||''),slot_escolhido:new Intl.DateTimeFormat('pt-BR',{timeZone:'America/New_York',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(event.appointment.starts_at))+' '+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(event.appointment.starts_at))});
    }
    if(result.status==='unknown')throw new Error('brain_tool_requires_reconciliation');
    audit.push({tool_name:name,invocation_id:result.tool_call_id,operation,result:result.status==='succeeded'?'succeeded':'failed',...(result.data?.appointment_ref?{appointment_ref:result.data.appointment_ref}:{})});
  }
  if(new Set(events.map(e=>e.idempotency_key)).size!==events.length)throw new Error('brain_duplicate_tool_effect');
  // Model-authored domain_events/tool_audit are deliberately never consulted.
  const output=parse(agent.output);
  if(typeof output.notas_para_redator==='string')output.notas_para_redator=[output.notas_para_redator];
  return {...ctx,agent:{...clone(agent),output:JSON.stringify(output)},domain_events:events,tool_audit:audit,templates,appointments};
}
export function briefing(original,ctx) {
  const out=clone(original),b=out.briefing;
  out.idioma=leadLanguage(ctx.payload);out.historico=ctx.payload.historico.filter(m=>m.autor!=='sistema');
  b.notas_para_redator=Array.isArray(b.notas_para_redator)?b.notas_para_redator:[String(b.notas_para_redator||'')];
  b.notas_para_redator.push('Idioma obrigatorio: '+out.idioma+'. Preserve a conversa; nao repita apresentacao, perguntas respondidas nem fatos ja enviados. Nenhuma mudanca de idioma reinicia o atendimento.');
  const template=String(b.mensagem_template||'').trim();
  if(template&&!ctx.templates.includes(template))throw new Error('brain_template_without_tool_receipt');
  b._lexia_templates=clone(ctx.templates);
  out._lexia=clone(ctx.payload._lexia);
  return out;
}
const normalized=s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const intro=s=>/\b(?:sou|soy|i\s+am|i['’]m|im|my name is|me llamo|meu nome [eé])\s+(?:a\s+)?carol\b/i.test(String(s));
function parts(text,max) {
  const output=[];let rest=String(text).trim();
  while(rest.length>max) {
    const head=rest.slice(0,max+1);
    const cut=Math.max(head.lastIndexOf('. ')+1,head.lastIndexOf('? ')+1,head.lastIndexOf('! ')+1,head.lastIndexOf('\n'));
    const at=cut>max/3?cut:head.lastIndexOf(' ');
    if(at<=0)throw new Error('brain_unbreakable_output');
    output.push(rest.slice(0,at).trim());rest=rest.slice(at).trim();
  }
  if(rest)output.push(rest);return output;
}
export function finalize(original,ctx,briefingValue,now) {
  time(now);const out=clone(original),p=ctx.payload;
  if(!Array.isArray(out.entregas)||out.entregas.length>20)throw new Error('brain_delivery_invalid');
  const expected=leadLanguage(p);
  const previous=p.historico.filter(assistantSent).map(m=>m.conteudo);
  const seen=p.contexto.dados.apresentacao_ja_enviada===true||previous.some(intro);
  const identityQuestion=/\b(robo|robot|bot|inteligencia artificial|artificial intelligence|assistente digital|eres humano|are you human|quem (fala|e voce)|qual (e )?(o )?seu nome|what is your name|who are you|como te llamas|quien eres)\b/i.test(normalized(p.mensagem.actual));
  const repeatRequested=/\b(repita|repetir|repeat|repite|recuerdame|me lembra|recapitul|confirmar os dados)\b/i.test(normalized(p.mensagem.actual));
  const sentKeys=new Set(previous.map(normalized));
  const entries=[];
  for(const e of out.entregas) {
    if(e.tipo==='texto') {
      if(typeof e.texto!=='string'||e.texto.length>4000)throw new Error('brain_text_invalid');
      let text=e.texto.trim();
      if(seen&&!identityQuestion&&intro(text))text=text.replace(/\b(?:sou|soy|i\s+am|i['’]m|im|my name is|me llamo|meu nome [eé])\s+(?:a\s+)?carol[^.!?]*[.!?]?\s*/gi,'').replace(/^[¡¿]?\s*(?:ola|olá|oi|hola|hi|hello)[^.!?]{0,35}[.!?]\s*/i,'').trim();
      if(!text)continue;
      if(!repeatRequested&&normalized(text).split(' ').length>=6&&sentKeys.has(normalized(text)))continue;
      if(/\b(te (chamo|ligo|aviso|retorno)|vou (te )?(ligar|retornar)|i ll (call|contact|message|get back)|te (llamo|aviso)|voy a (llamarte|contactarte))\b/i.test(normalized(text)))throw new Error('brain_future_return_not_confirmed');
      if(!validateResponseLanguages(expected,[text]).allowed)throw new Error('brain_response_language_mismatch');
      const verifiedTemplate=ctx.templates.some(t=>normalized(t)===normalized(text));
      if(verifiedTemplate){entries.push({tipo:'texto',texto:text});continue;}
      // Keep information intact while removing the original long WhatsApp balloon.
      for(const part of parts(text,250))entries.push({tipo:'texto',texto:part});
    }else if(e.tipo==='imagem') {
      const u=new URL(e.url);
      if(u.protocol!=='https:'||u.username||u.password||/lookaside\.fbsbx\.com|ig_messaging_cdn/.test(u.hostname)||p.historico.some(m=>m.autor==='cliente'&&m.conteudo.includes(e.url)))throw new Error('brain_client_image_echo_forbidden');
      if(e.legenda&&!validateResponseLanguages(expected,[e.legenda]).allowed)throw new Error('brain_caption_language_mismatch');
      entries.push({tipo:'imagem',url:e.url,legenda:String(e.legenda||'')});
    }else throw new Error('brain_delivery_type_unsupported');
  }
  if(entries.filter(e=>e.tipo==='texto').length>4)throw new Error('brain_response_too_many_balloons');
  const priority={media:'normal',medium:'normal',normal:'normal',baixa:'baixa',alta:'alta',urgente:'urgente'}[out.handoff?.prioridade||'normal'];
  if(!priority)throw new Error('brain_handoff_priority_invalid');
  const approvedKeys=new Set(['queixa_principal','area_regiao','servico_interesse','temperatura','pendencia','agendamento','perguntas_feitas','idioma','apresentacao_ja_enviada']);
  const patch={};for(const [k,v]of Object.entries(briefingValue.briefing.contexto_actualizado||{}))if(approvedKeys.has(k))patch[k]=clone(v);
  patch.idioma=expected;
  if(ctx.domain_events.length)patch.agendamento={};
  // Intros are only committed after actual delivery, never on a proposed response.
  patch.apresentacao_ja_enviada=seen;
  return {acao:entries.length?'entregar':'sem_resposta',modulo:String(out.modulo||'geral'),entregas:entries,
    handoff:{necessario:out.handoff?.necessario===true,motivo:String(out.handoff?.motivo||''),prioridade:priority,resumo_para_equipa:String(out.handoff?.resumo_para_equipa||'').slice(0,4000),mensagem_para_cliente:''},
    followup:out.followup||{necessario:false,motivo:'',data_sugerida:''},operacoes:out.operacoes||{},contexto_actualizado:patch,erro:String(out.erro||''),
    scope:clone(ctx.scope),invocation_id:p.invocation_id,captured_state:clone(p.captured_state),domain_events:clone(ctx.domain_events),tool_audit:clone(ctx.tool_audit)};
}
export function memoryWrite(ctx,result,now) {
  time(now);
  const fields=merge(ctx.payload.contexto.dados,result.contexto_actualizado);
  fields.perguntas_feitas=confirmedQuestions(ctx.payload.historico,ctx.memory?.context_json.perguntas_feitas||[]);
  if(Object.hasOwn(result.contexto_actualizado,'pendencia'))fields.pendencia=result.contexto_actualizado.pendencia;
  if(ctx.domain_events.length) {
    fields.agendamento={};fields.ultimo_agendamento=clone(ctx.appointments.at(-1));
  }
  const operational=ctx.cfg.memory_backend==='central'?operationalMemory(fields):fields;
  return {memory_key:ctx.memory_key,scope_json:clone(ctx.scope),context_json:operational,version:(ctx.memory?.version||0)+1,
    last_invocation_id:ctx.payload.invocation_id,last_request_identity:ctx.request_identity,cached_result:clone(result),updated_at:now};
}
export function operationalMemory(fields) {
  const allowed=new Set(['idioma','apresentacao_ja_enviada','perguntas_feitas','queixa_principal','area_regiao','servico_interesse','temperatura','pendencia','agendamento','ultimo_agendamento','origem_anuncio','saude_relevante','primeira_visita','possivel_intercorrencia','promocao_mencionada']);
  const result=Object.fromEntries(Object.entries(fields).filter(([k])=>allowed.has(k)));
  // Private prompts, tool responses and provider IDs are never central memory.
  const forbidden=/^(?:password|senha|token|secret|service_role|credentials?|prompt|system_prompt|raciocinio|reasoning|tool_state|raw_response|provider_event_id|calendar_id|google_event_id)$/i;
  function check(value,depth=0) {
    if(depth>12)throw Error('brain_operational_memory_depth');
    if(Array.isArray(value))value.forEach(v=>check(v,depth+1));
    else if(object(value))for(const [key,v]of Object.entries(value)){if(forbidden.test(key))throw Error('brain_private_data_in_operational_memory');check(v,depth+1);}
  }
  check(result);if(canonical(result).length>30000)throw Error('brain_operational_memory_limit');
  return clone(result);
}
export function fallback(language) {
  return {pt:'Vou encaminhar essa duvida para a equipe.',en:"I'll pass this question to our team.",es:'Voy a pasar esta duda al equipo.'}[language]||'Vou encaminhar essa duvida para a equipe.';
}
export function memoryCommitted(ctx,expected,rows) {
  if(rows.length!==1||!sameScope(rows[0].scope_json,ctx.scope)||rows[0].memory_key!==expected.memory_key||rows[0].version!==expected.version||rows[0].last_invocation_id!==expected.last_invocation_id||rows[0].last_request_identity!==expected.last_request_identity||canonical(rows[0].cached_result)!==canonical(expected.cached_result))throw new Error('brain_memory_commit_unconfirmed_no_auto_retry');
  return expected.cached_result;
}
