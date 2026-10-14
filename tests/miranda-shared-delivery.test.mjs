import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { auditWorkflow } from '../scripts/build-miranda-original-crm.mjs';
import { buildSharedDelivery } from '../scripts/build-miranda-shared-delivery.mjs';
import { sql, gate, virtual, load } from '../scripts/lib/miranda-shared-delivery-sql.mjs';

const bundled=buildSync({entryPoints:['scripts/lib/miranda-shared-delivery.mjs'],bundle:true,write:false,format:'iife',globalName:'Delivery',platform:'neutral',target:'es2022'}).outputFiles[0].text;
const D=new Function(bundled+'; return Delivery;')();
const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now='2026-10-12T16:00:00Z';
const scope={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',channel:'whatsapp',account_ref:uuid(1),conversation_ref:'test:synthetic-conversation-a'};
const captured_state={state_version:12,delivery_epoch:7};
const cfg={environment:'isolated_test',cliente_slug:scope.cliente_slug,account_ref:scope.account_ref,test_project_ref:'abcdefghijklmnopqrst',delivery_mode:'virtual',provider_reviewed:false};
const action=(n=1)=>({schema_version:'lexia.outbound.action.v1',action_id:uuid(20+n),invocation_id:uuid(2),scope:{...scope},sequence:n,kind:'reply',captured_state:{...captured_state},content:{type:'text',text:'Qual horário fica melhor para você?'}});
const reply=(count=1)=>({schema_version:'lexia.delivery.plan.request.v1',request_id:uuid(2),scope:{...scope},captured_state:{...captured_state},lead_cutoff_seq:3,actions:Array.from({length:count},(_,i)=>action(i+1))});
const automation=(kind='followup',count=1)=>{
  const ref=kind==='followup'?'followup:synthetic-followup:2026-10-12T14:00:00Z':'appointment:synthetic-event';
  return {schema_version:'lexia.automation.delivery.request.v1',request:{schema_version:'lexia.automation.request.v1',request_id:uuid(2),kind,scope:{...scope},source_ref:ref,due_at:kind==='followup'?'2026-10-12T15:00:00Z':now,proposed_actions:Array.from({length:count},(_,i)=>({...action(i+1),kind,source_ref:ref}))},...(kind==='followup'?{lead_cutoff_seq:3}:{})};
};
const conversation=(provider='fake')=>({id:uuid(3),...scope,account_id:scope.account_ref,account_status:'active',provider,provider_account_ref:'synthetic',identificador_conversa:'15550000001',state_version:12,delivery_epoch:7,lead_message_seq:3,projection_status:'current',language:'pt'});
const ledger=(a,p,status='prepared')=>({id:a.action_id,conversation_id:uuid(3),invocation_id:p.request.request_id,automation_request_id:p.request.kind==='reply'?null:p.request.request_id,sequence:a.sequence,kind:a.kind,source_ref:a.source_ref || null,captured_state_version:12,captured_delivery_epoch:7,lead_cutoff_seq:p.lead_cutoff_seq,content:structuredClone(a.content),status,...(status==='sent'?{provider_message_id:'synthetic:'+a.action_id,concluido_em:now}:{})});
const accepted=(input=reply(),config=cfg)=>D.accept(input,config,now);
const scoped=(input=reply(),config=cfg)=>D.resolveConversation(accepted(input,config),[conversation(config.delivery_mode==='provider'?'zapi':'fake')]);
const selected=(input=reply(),config=cfg)=>D.selectAction(scoped(input,config));
const query=(p,edit={})=>({states:[conversation(p.config.delivery_mode==='provider'?'zapi':'fake')],actions:p.actions.map(a=>ledger(a,p)),blocks:[],source_valid:true,...(p.request.kind==='appointment_reminder'?{appointment:{appointment_ref:p.request.source_ref,status:'confirmed',starts_at:'2026-10-13T16:00:00Z',ends_at:'2026-10-13T17:00:00Z',timezone:'America/New_York'}}:{}),...edit});
const providerCfg={...cfg,delivery_mode:'provider',provider_reviewed:true,zapi_base_url:'https://api.z-api.io/instances/synthetic/token/synthetic',media_bindings:{},media_hosts:['media.invalid']};

function adapters(config=providerCfg) {
  const book=new Map();const state=conversation(config.delivery_mode==='provider'?'zapi':'fake');let calls=0;
  const deps={
    now:()=>now,identity:async()=>[{id:true,project_ref:cfg.test_project_ref,environment:'isolated_test',disposable:true}],resolve:async()=>[state],
    prepare:async p=>{for(const a of p.actions){if(!book.has(a.action_id))book.set(a.action_id,ledger(a,p));}D.assertLedger({...p,conversation_id:state.id},[...book.values()]);},
    load:async p=>query(p,{states:[{...state}],actions:[...book.values()]}),
    claim:async p=>{const a=book.get(p.current.action_id);if(a.status!=='prepared')return {out_acquired:false,out_status:a.status};a.status='claimed';return {out_acquired:true,out_status:'claimed',out_fencing_token:1};},
    send:async p=>{calls++;return {statusCode:200,body:{messageId:'synthetic:'+p.current.action_id}};},
    finish:async p=>{Object.assign(book.get(p.current.action_id),{status:p.outcome.status,provider_message_id:p.outcome.provider_message_id,concluido_em:now});return {status:p.outcome.status};},
    virtual:async p=>{Object.assign(book.get(p.current.action_id),{status:'suppressed',reason:'virtual_delivered',concluido_em:now});return {permitted:true};},
  };
  return {deps,book,state,get calls(){return calls;}};
}

test('closed schemas accept replies, follow-ups and reminders, and reject unrecognized effects',()=>{
  for(const input of [reply(),automation(),automation('appointment_reminder')])assert.ok(accepted(input));
  for(const edit of [x=>x.extra=true,x=>x.actions[0].content.type='video',x=>x.actions[0].kind='arbitrary',x=>x.actions[0].content.text='',x=>x.actions[0].content.extra='x']){const p=reply();edit(p);assert.throws(()=>accepted(p));}
});
test('configuration is not inherited from a request and production is refused',()=>{
  assert.throws(()=>accepted({...reply(),_delivery_config:providerCfg}));
  for(const c of [{...cfg,environment:'production'},{...cfg,test_project_ref:''},{...providerCfg,provider_reviewed:false},{...cfg,account_ref:''}])assert.throws(()=>accepted(reply(),c));
});
test('versioned synthetic examples validate independently for both companies',()=>{
  for(const file of ['shared-delivery-followup-a.json','shared-delivery-reminder-b.json']) {
    const input=JSON.parse(readFileSync('contracts/omnichannel/v1/examples/'+file,'utf8'));
    const c={...cfg,cliente_slug:input.request.scope.cliente_slug,account_ref:input.request.scope.account_ref};
    assert.ok(D.accept(input,c,now));
    assert.throws(()=>D.accept(input,{...c,cliente_slug:'wrong_company'},now),/scope/);
  }
});
test('tenant/account/conversation isolation includes identical captured versions',()=>{
  for(const [key,value] of [['cliente_slug','empresa_sintetica_b'],['account_ref',uuid(9)],['conversation_ref','test:other-conversation'],['channel','instagram']]) {
    const r=reply();r.actions[0].scope[key]=value;assert.throws(()=>accepted(r),/origin/);
    const c=conversation();c[key==='account_ref'?'account_id':key]=value;assert.throws(()=>D.resolveConversation(accepted(reply()),[c]),/origin/);
  }
});
test('identity markers and missing/ambiguous conversations reject before effects',()=>{
  const p=accepted();for(const rows of [[],[{id:true,project_ref:'other',environment:'isolated_test',disposable:true}]])assert.throws(()=>D.verifyIdentity(p,rows));
  for(const rows of [[],[conversation(),conversation()]])assert.throws(()=>D.resolveConversation(p,rows));
});
test('mixed invocations, individual state swaps, duplicate IDs and noncontiguous ordering fail',()=>{
  for(const edit of [r=>r.actions[1].invocation_id=uuid(99),r=>r.actions[1].captured_state.delivery_epoch++,r=>r.actions[1].action_id=r.actions[0].action_id,r=>r.actions[1].sequence=3,r=>r.captured_state.state_version++]){const r=reply(2);edit(r);assert.throws(()=>accepted(r));}
});
test('late/future schedules, missing follow-up cutoff and forged sources are not sendable',()=>{
  for(const edit of [r=>r.request.due_at='2026-02-30T12:00:00Z',r=>r.request.due_at='2026-10-13T16:00:00Z',r=>delete r.lead_cutoff_seq,r=>r.request.source_ref='free text']){const r=automation();edit(r);assert.throws(()=>accepted(r));}
  assert.throws(()=>accepted({...automation('appointment_reminder'),lead_cutoff_seq:3}));
});
test('all simultaneous pauses block; only a reminder of the same confirmed appointment is exempt',()=>{
  const p=selected();for(const type of ['human_intervention','manual_pause','handoff','appointment','legacy_import'])assert.equal(D.preflight(p,query(p,{blocks:[{status:'active',block_type:type,source_ref:'other'}]}),now).results[0].reason,'blocked');
  const r=selected(automation('appointment_reminder'));
  const b={status:'active',block_type:'appointment',source_ref:r.request.source_ref};
  assert.equal(D.preflight(r,query(r,{blocks:[b]}),now).ready,true);
  assert.equal(D.preflight(r,query(r,{blocks:[b,{status:'active',block_type:'manual_pause'}]}),now).ready,false);
  assert.equal(D.preflight(r,query(r,{blocks:[{...b,source_ref:'another'}]}),now).results[0].reason,'blocked');
});
test('cancelled/missing/started appointments suppress reminders without altering their pauses',()=>{
  const p=selected(automation('appointment_reminder'));
  for(const appointment of [null,{appointment_ref:p.request.source_ref,status:'cancelled',starts_at:'2026-10-13T16:00:00Z'},{appointment_ref:p.request.source_ref,status:'confirmed',starts_at:'2026-10-12T15:00:00Z'}])assert.equal(D.preflight(p,query(p,{appointment}),now).results[0].reason,'appointment_not_remindable');
});
test('stale versions/epoch/new lead messages and failed projection prevent preparation from becoming delivery',()=>{
  const p=selected();for(const edit of [{state_version:13},{delivery_epoch:8},{lead_message_seq:4},{projection_status:'pending'},{account_status:'inactive'}])assert.equal(D.preflight(p,query(p,{states:[{...conversation(),...edit}]}),now).continue,false);
  assert.equal(D.preflight(p,query(p,{source_valid:false}),now).results[0].reason,'source_or_projection_unavailable');
});
test('missing blocks/state query and preflight SQL errors fail closed',()=>{
  const p=selected();for(const q of [{error:true},query(p,{blocks:undefined}),query(p,{states:[]})])assert.equal(D.preflight(p,q,now).results[0].reason,'preflight_unavailable');
});
test('durable ID conflicts include content, sources, cutoff, state, request, kind and scope',()=>{
  const p=selected();for(const edit of [r=>r.content.text='different',r=>r.source_ref='other',r=>r.captured_delivery_epoch++,r=>r.automation_request_id=uuid(9),r=>r.conversation_id=uuid(9),r=>r.kind='followup',r=>r.lead_cutoff_seq++]){const row=ledger(p.current,p);edit(row);assert.throws(()=>D.assertLedger(p,[row]),/conflict/);}
  D.assertLedger(p,[{...ledger(p.current,p),content:{text:p.current.content.text,type:'text'}}]);
});
test('language revalidation uses current conversation context and never accepts another company fallback',()=>{
  const p=selected();for(const language of ['en','es',undefined])assert.equal(D.preflight(p,query(p,{states:[{...conversation(),language}]}),now).results[0].reason,'response_language_mismatch');
});
test('virtual mode refuses actual recipients/accounts and never claims provider delivery',async()=>{
  assert.throws(()=>D.resolveConversation(accepted(),[conversation('zapi')]),/synthetic/);
  const h=adapters(cfg);h.deps.claim=()=>{throw new Error('must not claim');};h.deps.send=()=>{throw new Error('must not send');};
  const r=await D.execute(accepted(reply(2)),h.deps);assert.ok(r.results.every(r=>r.status==='suppressed' && r.reason==='virtual_delivered'));assert.equal(h.calls,0);
});
test('virtual retry is idempotent without counting a follow-up sent',async()=>{
  const h=adapters(cfg),p=accepted(automation());await D.execute(p,h.deps);
  h.deps.virtual=()=>{throw new Error('duplicate must not write again');};
  const r=await D.execute(p,h.deps);assert.equal(r.results[0].reason,'virtual_delivered');assert.equal(r.results[0].status,'suppressed');assert.equal(h.calls,0);
});
test('all replies, follow-ups and reminders traverse the same native delivery transitions',async()=>{
  for(const input of [reply(2),automation(),automation('appointment_reminder')]){const h=adapters();const r=await D.execute(accepted(input,providerCfg),h.deps);assert.ok(r.results.every(r=>r.status==='sent'));assert.equal(h.calls,input.actions?.length || 1);}
});
test('intervention between actions preserves first sent and suppresses remainder',async()=>{
  const h=adapters();const finish=h.deps.finish;h.deps.finish=async p=>{const r=await finish(p);h.state.delivery_epoch++;return r;};
  const r=await D.execute(accepted(reply(3),providerCfg),h.deps);assert.equal(r.results[0].status,'sent');assert.equal(r.results[1].reason,'state_changed');assert.equal(r.results[2].reason,'previous_action_not_confirmed');assert.equal(h.calls,1);
});
test('preflight exception after first message preserves progress without calling provider again',async()=>{
  const h=adapters();const load=h.deps.load;let n=0;h.deps.load=async p=>{if(n++)throw new Error('private connection details');return load(p);};
  const r=await D.execute(accepted(reply(2),providerCfg),h.deps);assert.equal(r.results[0].status,'sent');assert.equal(r.results[1].reason,'preflight_unavailable');assert.equal(h.calls,1);assert.doesNotMatch(JSON.stringify(r),/private/);
});
test('possible acceptance then send exception is unknown and no following action starts',async()=>{
  const h=adapters();let calls=0;h.deps.send=async()=>{calls++;throw new Error('provider may have accepted');};
  const p=accepted(reply(2),providerCfg),r=await D.execute(p,h.deps);assert.equal(r.results[0].status,'delivery_unknown');assert.equal(r.results[1].reason,'previous_action_not_confirmed');
  const again=await D.execute(p,h.deps);assert.equal(again.results[0].status,'delivery_unknown');assert.equal(calls,1);
});
test('provider accepted but database commit throws: ledger remains claimed and cannot be resent',async()=>{
  const h=adapters();h.deps.finish=async()=>{throw new Error('DB unavailable');};const p=accepted(reply(2),providerCfg);
  const r=await D.execute(p,h.deps);assert.equal(r.results[0].reason,'delivery_commit_unavailable');assert.equal(h.book.get(p.actions[0].action_id).status,'claimed');
  await D.execute(p,h.deps);assert.equal(h.calls,1);
});
test('lost receipt after durable sent is recovered from ledger, without resending confirmed actions',async()=>{
  const h=adapters();const finish=h.deps.finish;h.deps.finish=async p=>{await finish(p);throw new Error('receipt lost');};const p=accepted(reply(2),providerCfg);
  const r=await D.execute(p,h.deps);assert.equal(r.results[0].status,'delivery_unknown');
  h.deps.finish=finish;const recovered=await D.execute(p,h.deps);assert.equal(recovered.results[0].status,'duplicate');assert.equal(recovered.results[1].status,'sent');assert.equal(h.calls,2);
});
test('only one concurrent claim sends a given action',async()=>{
  const h=adapters(),p=accepted(reply(),providerCfg);const results=await Promise.all([D.execute(p,h.deps),D.execute(p,h.deps)]);
  assert.equal(h.calls,1);assert.ok(results.some(r=>r.results[0].status==='sent'));assert.ok(results.some(r=>['duplicate','delivery_unknown','suppressed'].includes(r.results[0].status)));
});
test('malformed/ambiguous HTTP responses cannot become definitive safe failure',()=>{
  const p=selected(reply(),providerCfg);
  for(const response of [{error:true},{statusCode:504,body:{}},{statusCode:400,body:{messageId:'x'}},{statusCode:200,body:{id:'other-contract'}},{statusCode:200,body:{messageId:''}}])assert.equal(D.classifyProvider(p,response,now).outcome.status,'delivery_unknown');
  assert.equal(D.classifyProvider(p,{statusCode:200,body:{messageId:'synthetic'}},now).outcome.status,'sent');
});
test('claim failures/invalid fencing never call providers',()=>{
  const p=selected(reply(),providerCfg);for(const q of [{error:true},{out_acquired:true,out_status:'claimed',out_fencing_token:0},{out_acquired:false,out_status:'claimed'},{out_acquired:false,out_status:'delivery_unknown'}])assert.equal(D.claimOutcome(p,q,now).results[0].status,'delivery_unknown');
});
test('provider instance and recipient come from the bound account/conversation, not caller destinations',()=>{
  const p=selected(reply(),providerCfg);
  assert.throws(()=>D.buildProviderRequest({...p,provider_account_ref:'other-instance'}),/binding/);
  assert.throws(()=>D.buildProviderRequest({...p,recipient:'https://untrusted.invalid'}),/recipient/);
  assert.throws(()=>accepted({...reply(),recipient:'15559999999'},providerCfg));
});
test('ordered image/caption/audio bindings are account+conversation+language bound',async()=>{
  const config={...providerCfg,media_bindings:{'image:test':{scope:{...scope},type:'image',language:'pt',url:'https://media.invalid/image.png'},'audio:test':{scope:{...scope},type:'audio',language:'pt',url:'https://media.invalid/audio.mp3'}}};
  const r=reply(3);r.actions[1].content={type:'image',media_ref:'image:test',caption:'Esse é o resultado do tratamento.'};r.actions[2].content={type:'audio',media_ref:'audio:test'};
  const h=adapters();const seen=[];h.deps.send=async p=>{seen.push(p.provider_request);return {statusCode:200,body:{messageId:'synthetic:'+p.current.action_id}};};
  const receipt=await D.execute(accepted(r,config),h.deps);assert.ok(receipt.results.every(r=>r.status==='sent'));assert.match(seen[1].url,/send-image$/);assert.equal(seen[1].body.caption,r.actions[1].content.caption);assert.match(seen[2].url,/send-audio$/);
  const p=selected(r,config);p.current=r.actions[1];p.expected_language='pt';
  for(const binding of [{...config.media_bindings['image:test'],scope:{...scope,cliente_slug:'empresa_sintetica_b'}},{...config.media_bindings['image:test'],language:'es'},{...config.media_bindings['image:test'],url:'https://untrusted.invalid/file'}])assert.throws(()=>D.buildProviderRequest({...p,config:{...config,media_bindings:{'image:test':binding}}}));
});
test('SQL gates lock before checking pauses/source/version; claims and commits use existing native RPCs',()=>{
  for(const kind of ['reply','followup','appointment_reminder']) {
    assert.match(gate(kind),/lexia_omni_lock_conversation/);assert.match(gate(kind),/lexia_omni_claim_outbound_action/);assert.match(gate(kind),/projection_status='current'/);
    assert.match(virtual(kind),/provider='fake'/);assert.match(virtual(kind),/state_version=/);assert.match(virtual(kind),/delivery_epoch=/);assert.match(virtual(kind),/conversation_blocks/);
  }
  assert.match(gate('followup'),/f.status='agendado'/);assert.match(gate('followup'),/f.ultima_msg_cliente_em=/);assert.match(gate('followup'),/23 hours 30 minutes/);
  assert.doesNotMatch(load('reply')+gate('appointment_reminder'),/lexia_followups/);
  assert.match(gate('reply'),/lexia_inbound_batches/);assert.match(gate('reply'),/b.status='claimed'/);assert.match(virtual('reply'),/previous.sequence<o.sequence/);
  assert.match(sql.prepare,/o.content=a->'content'/);assert.match(sql.prepare,/r.due_at<>/);assert.match(sql.prepare,/CASE WHEN.*IN \('reply','appointment_confirmation'\) THEN 'accepted'/);
  assert.match(sql.finish,/eligible AS MATERIALIZED/);assert.match(sql.finish,/lexia_omni_finish_outbound_action/);assert.doesNotMatch(sql.finish,/lembrete_agendamento/);
});

const original=JSON.parse(readFileSync('n8n/miranda-original-crm/omnichannel-crm-agent-test.inactive.json','utf8'));
const w=JSON.parse(readFileSync('n8n/miranda-original-crm/omnichannel-shared-delivery.inactive.json','utf8'));
const node=name=>w.nodes.find(n=>n.name===name);
const targets=name=>(w.connections[name]?.main || []).flat().map(l=>l.node);
test('export is deterministic/inactive and retains all original nodes, buffer, media and intelligence',()=>{
  const fresh=buildSharedDelivery(original);
  assert.equal(w.active,false);auditWorkflow(w);auditWorkflow(fresh);assert.deepEqual(buildSharedDelivery(original),fresh);
  // The previous export is an archived revision. Compare every non-runtime
  // parameter; current runtime/SQL have additional terminal-confirmation gates.
  const structure=workflow=>{const copy=structuredClone(workflow);for(const n of copy.nodes){delete n.parameters.jsCode;delete n.parameters.query;}return copy;};
  assert.deepEqual(structure(fresh),structure(w));
  for(const n of original.nodes)assert.ok(node(n.name),n.name);
  for(const name of ['Agente de Contexto','Preparar Pacote de Contexto','Chamar Cérebro do Cliente','Redis_Buffer2'])assert.deepEqual(node(name).parameters,original.nodes.find(n=>n.name===name).parameters);
});
test('delivery is private Execute Workflow; chat and automations share one owner, old send lanes disconnected',()=>{
  assert.deepEqual(targets('LEXIA | Evento interno individual'),['ENTREGA | Separar atendimento e pedido']);
  assert.deepEqual(targets('ENTREGA | Pedido de envio?'),['Config Entrega Compartilhada','Entrada Unificada']);
  assert.deepEqual(targets('LEXIA | Resultado virtual Frappe'),['ENTREGA | Resposta virtual tem acoes?']);
  assert.equal(node('ENTREGA | Chamar envio neste omnichannel').parameters.workflowId.value,'={{ $workflow.id }}');
  for(const name of ['LEXIA | Enviar whatsapp','LEXIA | Enviar instagram','LEXIA | Enviar messenger','LEXIA | Persistir resposta no canal virtual'])assert.equal(node(name).disabled,true);
  assert.deepEqual(targets('ENTREGA | Proxima acao?'),['ENTREGA | Selecionar acao','ENTREGA | Devolver recibo']);
});
test('virtual defaults, named credentials only, no raw tokens/hidden HTTP or automatic retries',()=>{
  const config=node('Config Entrega Compartilhada').parameters.assignments.assignments[0].value;
  assert.equal(config.delivery_mode,'virtual');assert.equal(config.provider_reviewed,false);assert.equal(config.zapi_base_url,'');
  for(const n of w.nodes)for(const c of Object.values(n.credentials || {}))assert.deepEqual(Object.keys(c),['name']);
  for(const n of w.nodes.filter(n=>n.name.startsWith('ENTREGA |') && ['n8n-nodes-base.postgres','n8n-nodes-base.httpRequest','n8n-nodes-base.executeWorkflow'].includes(n.type)))assert.equal(n.retryOnFail,false);
  const raw=JSON.stringify(w);assert.doesNotMatch(raw,/eyJ[A-Za-z0-9]|gQAAAA|\$env\.|helpers\.httpRequest|BEGIN PRIVATE/);
});
test('native graph transition code executes with n8n doubles, preserving paired progress',async()=>{
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const p=accepted(reply(2));const refs={'ENTREGA | Conversa confirmada':scoped(reply(2))};
  const run=async(name,input)=>new AsyncFunction('$input','$json','$','$now',node(name).parameters.jsCode)({all:()=>[{json:input}]},input,key=>({item:{json:refs[key]}}),{toISO:()=>now});
  const out=await run('ENTREGA | Selecionar acao',p);assert.equal(out[0].json.current.sequence,1);assert.deepEqual(out[0].pairedItem,{item:0});
  const prepared=await run('ENTREGA | Plano confirmado',{action_count:2});assert.equal(prepared[0].json.actions.length,2);
  const failed=await run('ENTREGA | Plano confirmado',{error:true});assert.equal(failed[0].json.results[0].reason,'prepare_unavailable');
});
test('active new nodes have unique positions and ordered delivery stages',()=>{
  const positions=new Set();for(const n of w.nodes.filter(n=>n.name.startsWith('ENTREGA |') && !n.type.endsWith('stickyNote'))){const key=n.position.join(',');assert.ok(!positions.has(key),n.name);positions.add(key);}
  for(const names of [['ENTREGA | Selecionar acao','ENTREGA | Ler estado antes da acao','ENTREGA | Revalidar antes da acao','ENTREGA | Acao permitida?'],['ENTREGA | Claim atomico por acao','ENTREGA | Conferir claim','ENTREGA | Claim exclusivo?','ENTREGA | Enviar ao provedor','ENTREGA | Classificar retorno do provedor','ENTREGA | Confirmar entrega e historico']])for(let i=1;i<names.length;i++)assert.ok(node(names[i]).position[0]>node(names[i-1]).position[0]);
});
test('no active connection points at a disabled old delivery node',()=>{
  for(const [name,links] of Object.entries(w.connections))if(!node(name).disabled)for(const edge of Object.values(links).flat(2))assert.notEqual(node(edge.node).disabled,true,name+' -> '+edge.node);
});
