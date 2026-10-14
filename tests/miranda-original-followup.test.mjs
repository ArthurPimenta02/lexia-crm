import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { auditWorkflow } from '../scripts/build-miranda-original-crm.mjs';
import { sql } from '../scripts/lib/miranda-original-followup-runtime.mjs';

// n8n supplies Luxon. This deterministic clock double covers the API used by
// the original code; importing/running Luxon inside n8n is still a runtime check.
class Clock {
  constructor(ms,zone='UTC') {this.ms=ms;this.zone=zone;this.isValid=Number.isFinite(ms);}
  valueOf(){return this.ms;}
  toISO(){return new Date(this.ms).toISOString();}
  setZone(zone){return new Clock(this.ms,zone);}
  get parts(){return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:this.zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',minute:'2-digit',second:'2-digit',weekday:'short'}).formatToParts(this.ms).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
  get hour(){return Number(this.parts.hour);}
  get weekday(){return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(this.parts.weekday)+1;}
  plus({hours=0,minutes=0,days=0}){return new Clock(this.ms+hours*3600000+minutes*60000+days*86400000,this.zone);}
  set({hour=this.hour,minute=0,second=0,millisecond=0}) {const p=this.parts;return new Clock(this.ms+(hour-Number(p.hour))*3600000+(minute-Number(p.minute))*60000+(second-Number(p.second))*1000+millisecond,this.zone);}
  startOf(){return this.set({hour:0});}
  endOf(){return this.set({hour:23,minute:59,second:59,millisecond:999});}
  diff(other){return {hours:(this.ms-other.ms)/3600000};}
  toFormat(){const p=this.parts;return p.day+'/'+p.month+'/'+p.year;}
}
const DateTime={fromISO:(value,opts={})=>new Clock(Date.parse(value),opts.zone || 'UTC')};

const w=JSON.parse(readFileSync(new URL('../n8n/miranda-original-crm/followup-original-crm.inactive.json',import.meta.url)));
const node=name=>w.nodes.find(n=>n.name===name);
const targets=name=>(w.connections[name]?.main || []).flat().map(l=>l.node);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const date='2026-10-12T16:00:00Z';
const uuid='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const account='24000000-0000-4000-8000-000000000001';
const scope={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',channel:'instagram',account_ref:account,conversation_ref:'synthetic-conversation-a'};
const config={environment:'isolated_test',cliente_slug:scope.cliente_slug,account_ref:account,test_project_ref:'abcdefghijklmnopqrst',delivery_mode:'preview',require_contact_check:true,audios_followup:{},models_reviewed:true};
const events=Object.fromEntries(['scheduled','pending','sent','suppressed','cancelled','failed','delivery_unknown','message','preview','virtual','state_hold','block_hold','contact_hold','manual_hold','queue_hold'].map((status,i)=>[status,`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const lead=()=>({id:'synthetic-followup-1',cliente_slug:scope.cliente_slug,identificador:'opaque-a',canal:'instagram',etapa:1,status:'agendado',tentativas_enviadas:0,
  ultima_msg_cliente_em:'2026-10-12T14:00:00Z',proxima_tentativa_em:'2026-10-12T15:00:00Z',_due_at:'2026-10-12T15:00:00Z',
  conversation_id:uuid,scope:{...scope},captured_state:{state_version:12,delivery_epoch:7},request_id:uuid,action_id:other,event_ids:events,lead_cutoff_seq:1,
  followups_anteriores:[],idioma_cliente:'pt',tipo_envio:'texto',texto_followup:'Ficou alguma dúvida sobre o tratamento? Estou por aqui.',etapa_nova:2,proxima_tentativa_nova:'2026-10-13T13:00:00Z',status_novo:'agendado'});
const run=(name,input={},refs={},now=date)=>new AsyncFunction('$input','$json','$','$execution','$now','DateTime',node(name).parameters.jsCode)(
  {first:()=>({json:input}),all:()=>[{json:input}]},input,
  key=>{const r=key==='Config Follow-up'?config:refs[key];if(r===undefined)throw new Error('missing_reference:'+key);return {first:()=>({json:r}),item:{json:r},all:()=>[{json:r}]};},
  {id:'synthetic-execution'},DateTime.fromISO(now),DateTime);
const one=async(...args)=>(await run(...args))[0].json;
async function proposal(l=lead()) { return one('LEXIA | Montar pedido de automacao',l); }
const receipt=(p,status='sent')=>({request_id:p.request_id,scope:{...p.scope},captured_state:{...p.captured_state},results:[{schema_version:'lexia.delivery.result.v1',action_id:p.action_id,status,attempted_at:date,...(status==='sent'?{provider_message_id:'synthetic-provider-1'}:{})}]});
const action=(p,status='sent')=>({id:p.action_id,conversation_id:p.conversation_id,automation_request_id:p.request_id,kind:'followup',source_ref:p.automation_request.source_ref,
  captured_state_version:p.captured_state.state_version,captured_delivery_epoch:p.captured_state.delivery_epoch,content:{text:p.texto_followup,type:'text'},status,
  provider_message_id:status==='sent'?'synthetic-provider-1':null,concluido_em:date});
async function proof(p,r,rows=[]) {const checked=await one('LEXIA | Conferir recibo de entrega',r,{'LEXIA | Montar pedido de automacao':p});return one('LEXIA | Confirmar entrega no livro central',{actions:rows},{'LEXIA | Conferir recibo de entrega':checked});}

test('inactive export preserves all original 28 familiar node names and original intelligence',()=>{
  assert.equal(w.active,false);auditWorkflow(w);
  for(const name of ['Schedule Trigger','Config Follow-up','Buscar Follow-ups Vencidos','Travas de Follow-up','Rotear por Ação','Loop Follow-ups - Leads','Buscar Histórico Follow-up','Buscar Playbook de Vendas','Montar Análise do Juiz','Juiz de Follow-up','OpenAI Chat Model','Validar Decisão do Juiz','Rotear Decisão do Juiz','Redator de Follow-up','OpenAI Chat Model1','Preparar Envio Follow-up','Registrar Eco Follow-up','Enviar Follow-up','Guardar Follow-up no Histórico','Atualizar Após Envio','Pular Etapa','Encerrar Follow-up','Reagendar Follow-up','Preparar Aviso Samuel','Buscar Perfil do Lead','Montar Link do Aviso','Enviar Aviso Samuel','Atualizar Após Aviso']) assert.ok(node(name),name);
  assert.match(node('Juiz de Follow-up').parameters.messages.messageValues[0].message,/EU TE AVISO/);
  assert.match(node('Redator de Follow-up').parameters.messages.messageValues[0].message,/PLAYBOOK/);
  assert.equal(node('Schedule Trigger').disabled,true);
});
test('no provider endpoints, credential IDs, inline tokens, environment secrets or hidden HTTP',()=>{
  const raw=JSON.stringify(w);
  assert.doesNotMatch(raw,/api\.z-api|graph\.facebook|supabase\.co|upstash\.io|eyJ|\$env\.|helpers\.httpRequest|https?:\/\/(?!contracts\.uselexia\.invalid|json-schema\.org)/);
  for(const n of w.nodes) for(const cred of Object.values(n.credentials || {})) assert.deepEqual(Object.keys(cred),['name']);
  assert.equal(node('Enviar Follow-up').type,'n8n-nodes-base.executeWorkflow');
  assert.equal(node('Registrar Eco Follow-up').type,'n8n-nodes-base.code');
  assert.equal(node('CRM | Enviar evento ao Frappe').disabled,true);
});
test('identical positions never overlap nodes; main commercial stages remain left-to-right',()=>{
  const positions=new Set();for(const n of w.nodes.filter(n=>!n.type.endsWith('stickyNote'))) {const key=n.position.join(',');assert.ok(!positions.has(key),n.name);positions.add(key);}
  for(const names of [['Buscar Histórico Follow-up','Buscar Playbook de Vendas','Montar Análise do Juiz','Juiz de Follow-up','Validar Decisão do Juiz'],['Redator de Follow-up','Preparar Envio Follow-up','Registrar Eco Follow-up','Enviar Follow-up','Guardar Follow-up no Histórico','Atualizar Após Envio']]) for(let i=1;i<names.length;i++)assert.ok(node(names[i]).position[0]>node(names[i-1]).position[0]);
});
test('native DB identity preflight and pauses precede model execution',()=>{
  assert.equal(node('LEXIA | Conferir API de teste').type,'n8n-nodes-base.supabase');
  assert.equal(node('LEXIA | Ler escopo e pausas').type,'n8n-nodes-base.postgres');
  assert.deepEqual(targets('LEXIA | Bloquear antes da IA'),['LEXIA | Rotear bloqueio']);
  assert.deepEqual(w.connections['LEXIA | Rotear bloqueio'].main[0].map(l=>l.node),['Preparar Aviso Samuel']);
  assert.deepEqual(targets('LEXIA | Liberar modelos isolados'),['Buscar Histórico Follow-up']);
});
test('missing config, privileged delivery flag and unreviewed models fail closed',async()=>{
  const configCode=node('LEXIA | Validar configuracao').parameters.jsCode;
  const execute=c=>new AsyncFunction('$input','$json','$','$execution','$now',configCode)({}, {},()=>({first:()=>({json:c})}),{},DateTime.fromISO(date));
  await execute(config);
  for(const c of [{...config,account_ref:''},{...config,test_project_ref:''},{...config,environment:'production'},{...config,delivery_mode:'shared_delivery',delivery_contract_reviewed:false}])await assert.rejects(execute(c));
  const modelCode=node('LEXIA | Liberar modelos isolados').parameters.jsCode;
  await assert.rejects(new AsyncFunction('$json','$',modelCode)({},()=>({first:()=>({json:{models_reviewed:false}})})),/isolated_model/);
});
test('Supabase API and Postgres require matching disposable identity before reading the queue',async()=>{
  const marker={id:true,project_ref:config.test_project_ref,environment:'isolated_test',disposable:true};
  await one('LEXIA | Identidade de teste',marker,{'LEXIA | Conferir banco de teste':{identities:[marker]}});
  for(const m of [{...marker,environment:'production'},{...marker,project_ref:'other'},{...marker,disposable:false}])await assert.rejects(run('LEXIA | Identidade de teste',m,{'LEXIA | Conferir banco de teste':{identities:[marker]}}),/identity_mismatch/);
});
test('all independent blocks, stale projection and inactive account suppress early',async()=>{
  for(const reason of ['human_intervention','manual_pause','handoff','appointment']){
    const r=await one('LEXIA | Bloquear antes da IA',{...lead(),_blocked:true,_reason:reason});assert.equal(r.acao,'bloqueado');
  }
  assert.match(sql.scope,/has_active_block/);assert.match(sql.permission,/projection_status='current'/);
  assert.doesNotMatch(sql.scope+sql.permission+sql.updateSent+sql.updateDeferred,/DELETE|conversation_blocks SET|UPDATE public.lexia_conversation_states/);
});
test('unknown or previously claimed/sent action never regenerates or resends',async()=>{
  for(const status of ['prepared','claimed','sent','failed','delivery_unknown','suppressed']) assert.equal((await one('LEXIA | Bloquear antes da IA',{...lead(),existing_action_status:status})).acao,'ja_processado');
  assert.equal(node('Enviar Follow-up').retryOnFail,false);assert.equal(node('Enviar Follow-up').onError,'continueRegularOutput');
});
test('WhatsApp saved-contact rule fails closed, while fake account needs no provider lookup',async()=>{
  const l={...lead(),canal:'whatsapp',_provider:'zapi'};
  assert.equal((await one('LEXIA | Bloquear antes da IA',l))._reason,'contact_check_unavailable');
  assert.equal((await one('LEXIA | Bloquear antes da IA',{...l,contact_saved:true,contact_check_verified:true})).status,'encerrado');
  assert.equal((await one('LEXIA | Bloquear antes da IA',{...l,_provider:'fake'})).acao,undefined);
});
test('source resolution rejects conversation, account, environment and tenant swaps, including ambiguous legacy IDs',async()=>{
  const l=lead();const s={id:uuid,environment:scope.environment,cliente_slug:scope.cliente_slug,account_id:account,channel:scope.channel,conversation_ref:scope.conversation_ref,identificador_conversa:l.identificador,state_version:12,delivery_epoch:7,lead_message_seq:1,blocked:false,projection_status:'current',account_status:'active',request_id:uuid,action_id:other,event_ids:events};
  const refs={'Loop Follow-ups - Leads':l};const good=await one('LEXIA | Validar origem do lead',{states:[s]},refs);assert.deepEqual(good.scope,scope);
  for(const key of ['environment','cliente_slug','account_id','channel','identificador_conversa']) await assert.rejects(run('LEXIA | Validar origem do lead',{states:[{...s,[key]:'wrong'}]},refs),/scope_mismatch/);
  for(const rows of [[],[s,s]])await assert.rejects(run('LEXIA | Validar origem do lead',{states:rows},refs),/ambiguous_or_missing/);
});
test('historical native query uses central scoped conversation, never phone as tenant identity',()=>{
  assert.match(sql.history,/s.id=\$1::uuid AND s.environment=\$2 AND s.cliente_slug=\$3/);
  assert.match(sql.history,/m.omni_conversation_id/);
  assert.equal(node('Loop Follow-ups - Leads').parameters.batchSize,1);
});
test('original business hours, maximum two stages and closed Meta window remain enforced',async()=>{
  assert.equal((await one('Travas de Follow-up',lead())).acao,'enviar_lead');
  assert.equal((await one('Travas de Follow-up',{...lead(),etapa:3,dia_combinado:'2026-10-12'})).status,'encerrado');
  assert.equal((await one('Travas de Follow-up',{...lead(),tentativas_enviadas:2})).status,'encerrado');
  assert.equal((await one('Travas de Follow-up',{...lead(),ultima_msg_cliente_em:'2026-10-10T14:00:00Z'})).status,'encerrado');
  assert.equal((await one('Travas de Follow-up',{...lead(),dia_combinado:'2026-10-12',ultima_msg_cliente_em:'2026-10-10T14:00:00Z'})).acao,'notificar_samuel');
  assert.equal((await one('Travas de Follow-up',lead(),{},'2026-10-12T10:00:00Z')).acao,'reagendar');
});
test('invalid Judge no longer falls back to send; valid playbook and promise exception survive',async()=>{
  const l={...lead(),playbook_rows:[],dia_combinado:''};
  for(const text of ['not JSON','{"decisao":"enviar"}','{"decisao":"unknown","motivo":"x","angulo":"","situacao_playbook":""}'])await assert.rejects(run('Validar Decisão do Juiz',{text},{'Montar Análise do Juiz':l}),/judge_result_invalid/);
  const r=await one('Validar Decisão do Juiz',{text:JSON.stringify({decisao:'pular',motivo:'eu te aviso',angulo:'',situacao_playbook:''})},{'Montar Análise do Juiz':l});assert.equal(r.decisao,'pular');
});
test('history isolation, human authorship and explicit change of language survive original analysis',async()=>{
  const l=lead();const messages=[{id:'a',criado_em:'2026-10-12T14:00:00Z',omni_conversation_id:uuid,cliente_slug:scope.cliente_slug,direccao:'recebida',conteudo:'Gostaria de ser atendido em espanol'},
    {id:'b',criado_em:'2026-10-12T14:01:00Z',omni_conversation_id:uuid,cliente_slug:scope.cliente_slug,direccao:'enviada',origem:'humano',conteudo:'Mensagem da equipe'}];
  const refs={'LEXIA | Validar origem do lead':l,'Buscar Histórico Follow-up':{messages}};
  const a=await one('Montar Análise do Juiz',{},refs);assert.equal(a.idioma_cliente,'es');assert.match(a.transcricao,/EQUIPE \(humano/);
  await assert.rejects(run('Montar Análise do Juiz',{}, {...refs,'Buscar Histórico Follow-up':{messages:[{...messages[0],omni_conversation_id:other}]}}),/history_scope_mismatch/);
});
test('writer empty, wrong language or exhausted repetition fails closed',async()=>{
  const l={...lead(),idioma_cliente:'es'};
  await assert.rejects(run('Preparar Envio Follow-up',{text:''},{'Validar Decisão do Juiz':l,'Montar Análise do Juiz':l}),/empty_writer_response/);
  await assert.rejects(proposal({...l,texto_followup:'Olá, gostaria de agendar sua avaliação amanhã?'}),/language_mismatch/);
  const p=await proposal({...l,texto_followup:'Hola, ¿qué horario prefieres para tu cita?'});assert.equal(p.automation_request.proposed_actions[0].kind,'followup');
  await assert.rejects(proposal({...l,followups_anteriores:[l.texto_followup]}),/repeated_followup/);
  const similar={...lead(),nome_contacto:'',followups_anteriores:['Sem pressa nenhuma. Quer que eu veja outros dias e horários pra você?','Oi, uma pergunta rápida. Tem algo te segurando em que eu possa ajudar?','Como ficar melhor pra você. Prefere de manhã ou de tarde?']};
  await assert.rejects(run('Preparar Envio Follow-up',{text:similar.followups_anteriores[0]},{'Validar Decisão do Juiz':similar,'Montar Análise do Juiz':similar}),/repetition_unresolved/);
});
test('permission revalidation compares versions, epoch, lead cutoff, queue stage and all blocks',async()=>{
  const p=await proposal();
  const r=await one('LEXIA | Aplicar permissao atual',{permitted:false},{'LEXIA | Montar pedido de automacao':p});assert.equal(r._permitted,false);
  const preview=await one('LEXIA | Previa sem envio',r);assert.equal(preview.results[0].reason,'state_changed');
  for(const fragment of ['s.state_version=$7','s.delivery_epoch=$8','s.lead_message_seq=$9','f.etapa=$10','has_active_block','ultima_msg_cliente_em=$11'])assert.ok(sql.permission.includes(fragment),fragment);
});
test('preview never counts a sent attempt, invents a timeline message or converts a pipeline stage',async()=>{
  const p=await proposal();const r=await one('LEXIA | Previa sem envio',{...p,_permitted:true});const verified=await proof(p,r);
  assert.equal(verified.confirmed,false);assert.equal(verified.status,'pending');
  const event=await one('CRM | Preparar evento de follow-up',verified);assert.equal(event.pipeline_signal,null);assert.equal(event.message_event,null);assert.equal(event.crm_event.payload.status,'pending');
  const virtualReceipt=receipt(p,'suppressed');virtualReceipt.results[0].reason='virtual_delivered';
  const virtualLedger={...action(p,'suppressed'),reason:'virtual_delivered'};
  const v=await proof(p,virtualReceipt,[virtualLedger]);assert.equal(v.status,'pending');assert.equal(v.confirmed,false);
  const ve=await one('CRM | Preparar evento de follow-up',v);assert.equal(ve.pipeline_signal,null);assert.notEqual(ve.crm_event.event_id,event.crm_event.event_id);
  assert.match(sql.updateSent,/WHERE \$13::boolean/);
  assert.deepEqual(w.connections['LEXIA | Pode registrar envio?'].main[1].map(l=>l.node),['CRM | Preparar evento de follow-up']);
  assert.deepEqual(w.connections['LEXIA | Pode alterar fila?'].main[1].map(l=>l.node),['LEXIA | Previa da fila']);
});
test('preclaim pauses remain pending and do not permanently terminate the automation; phase events have distinct IDs',async()=>{
  const p=await proposal();
  const paused=await one('Preparar Aviso Samuel',{...p,_reason:'conversation_blocked'});
  const a=await one('CRM | Preparar evento de follow-up',paused);assert.equal(a.crm_event.payload.status,'pending');
  const r=await one('LEXIA | Previa sem envio',{...p,_permitted:true});const b=await one('CRM | Preparar evento de follow-up',await proof(p,r));
  assert.notEqual(a.crm_event.event_id,b.crm_event.event_id);assert.equal(a.crm_event.payload.automation_ref,b.crm_event.payload.automation_ref);
});
test('receipt scope/version/action swaps cannot establish delivery',async()=>{
  const p=await proposal();for(const edit of [r=>{r.scope.conversation_ref='other';},r=>{r.scope.cliente_slug='empresa_sintetica_b';},r=>{r.captured_state.delivery_epoch++;},r=>{r.results[0].action_id=uuid;},r=>{r.request_id=other;}]) {
    const r=receipt(p);edit(r);await assert.rejects(proof(p,r,[action(p)]),/origin_mismatch/);
  }
});
test('sent or duplicate response without durable provider proof becomes uncertain',async()=>{
  const p=await proposal();for(const status of ['sent','duplicate']){const r=await proof(p,receipt(p,status));assert.equal(r.status,'delivery_unknown');assert.equal(r.confirmed,false);}
});
test('possible acceptance then exception requires reconciliation and never a safe automatic retry',async()=>{
  const p=await proposal();for(const rows of [[],[action(p,'claimed')],[action(p,'delivery_unknown')]]) {
    const r=await proof(p,{error:{message:'private diagnostic'}},rows);assert.equal(r.status,'delivery_unknown');assert.equal(r.confirmed,false);
    const e=await one('CRM | Preparar evento de follow-up',r);assert.equal(e.pipeline_signal,null);assert.equal(e.crm_event.payload.reason,'requires_reconciliation');assert.doesNotMatch(JSON.stringify(e),/private diagnostic/);
  }
});
test('exception after acknowledged durable send preserves progress and truthful CRM timeline',async()=>{
  const p=await proposal();const r=await proof(p,{error:{message:'response lost'}},[action(p)]);
  assert.equal(r.status,'sent');assert.equal(r.confirmed,true);
  const e=await one('CRM | Preparar evento de follow-up',{...r,message_id:uuid,queue_updated:true});
  assert.equal(e.pipeline_signal,'followup_sent_confirmed');assert.equal(e.message_event.payload.provider_message_ref,'synthetic-provider-1');assert.equal(e.message_event.payload.delivery_status,'sent');
  assert.equal(e.crm_event.payload.automation_ref,p.request_id);assert.equal(e.crm_event.payload.source_ref,p.automation_request.source_ref);
});
test('ledger mismatches fail closed; JSON key ordering is not an origin mismatch',async()=>{
  const p=await proposal();await proof(p,receipt(p),[action(p)]);
  for(const key of ['id','conversation_id','automation_request_id','kind','source_ref','captured_state_version','captured_delivery_epoch'])await assert.rejects(proof(p,receipt(p),[{...action(p),[key]:'wrong'}]),/ledger_origin_mismatch/);
});
test('queue update is compare-and-swap; concurrent callbacks increment only the original stage',()=>{
  for(const fragment of ['f.id::text=$1','f.cliente_slug=$2','f.identificador=$3','f.canal=$4',"f.status='agendado'",'f.etapa=$5','f.ultima_msg_cliente_em=$6','omni_action_id=$14','dia_combinado=NULL'])assert.ok(sql.updateSent.includes(fragment),fragment);
  assert.match(sql.updateDeferred,/WHERE \$11::boolean/);
  assert.doesNotMatch(sql.updateDeferred,/tentativas_enviadas=/);
});
test('skip stage two closes instead of creating an unsupported third attempt; preview leaves queue unchanged',async()=>{
  const p=await one('LEXIA | Preparar mudanca da fila',{...lead(),etapa:2,decisao:'pular'});assert.equal(p.status_novo,'encerrado');assert.equal(p.etapa_nova,2);assert.equal(p._queue_mutation_allowed,false);
});
test('stable attempt encoding contains full scope and unambiguous tuple, not mutable due_at or raw concatenation',()=>{
  assert.match(sql.scope,/jsonb_build_array\(s.environment,s.cliente_slug,s.channel,s.account_id,s.conversation_ref/);
  assert.match(sql.scope,/l.data->>'etapa',l.data->>'ultima_msg_cliente_em'/);
  assert.doesNotMatch(sql.scope,/proxima_tentativa_em.*identity/);
});
test('prepared image contract stays future work; configured audio remains contextual and language-bound',async()=>{
  const code=node('Preparar Envio Follow-up').parameters.jsCode;
  assert.match(code,/const temaAudio = temaDetectado/);assert.match(code,/AUDIOS_FOLLOWUP\[temaAudio\]\[idiomaLead\]/);assert.match(code,/!temDiaCombinado/);assert.match(code,/!jaRecebeuAudio/);
  const p=await proposal({...lead(),tipo_envio:'audio',audio_url:'synthetic-audio:laser:pt'});assert.equal(p.automation_request.proposed_actions[0].content.media_ref,'synthetic-audio:laser:pt');
});
