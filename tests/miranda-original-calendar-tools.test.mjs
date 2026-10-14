import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { DateTime, Settings } from 'luxon';
import { bundleForN8n } from '../scripts/lib/n8n-code-bundle.mjs';
import { buildCalendarTool, buildReadOnlyAvailability, validateCalendarExport } from '../scripts/build-miranda-original-calendar-tools.mjs';
import { referenceFingerprint } from '../scripts/lib/reference-denylist.mjs';

const clone=v=>JSON.parse(JSON.stringify(v)),read=p=>JSON.parse(readFileSync(p));
const C=new Function(bundleForN8n('scripts/lib/miranda-calendar-tools-runtime.mjs','Calendar')+'\nreturn Calendar;')();
const B=new Function(bundleForN8n('scripts/lib/miranda-original-brain-runtime.mjs','Brain')+'\nreturn Brain;')();
const availability=read('tests/fixtures/omnichannel/miranda-calendar-availability-call.json');
const creation=read('tests/fixtures/omnichannel/miranda-calendar-create-call.json');
const catalog=read('tests/fixtures/omnichannel/miranda-calendar-catalog.json');
const aw=read('n8n/miranda-original-crm/availability-original-crm.inactive.json'),cw=read('n8n/miranda-original-crm/create-appointment-original-crm.inactive.json');
const now='2026-10-11T16:00:00Z';Settings.now=()=>Date.parse(now);
const config={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',account_ref:availability.lexia_call_context.scope.account_ref,project_ref:'abcdefghijklmnopqrst',timezone:'America/New_York',calendar_id:'synthetic-only@group.calendar.google.com',expected_calendar_id:'synthetic-only@group.calendar.google.com',protected_calendar_hashes:[createHash('sha256').update('synthetic-protected@group.calendar.google.com').digest('hex')],calendar_reviewed:true,allow_calendar_read:true,allow_calendar_write:true,blocked_dates:['2026-09-05']};
function started(input=creation){const p=C.accept([{json:clone(input)}],config,input.lexia_call_context.operation);const key=createHash('sha256').update(JSON.stringify(p.request)).digest('hex');return C.started(p,[{call:{id:'74000000-0000-4000-8000-000000000020',conversation_id:'74000000-0000-4000-8000-000000000021',request:p.request,request_key:key,calendar_id:config.calendar_id,provider_event_id:'1e'+key,status:'prepared',created_at:now}}]);}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const lookup=(map,name)=>({first:()=>({json:map.get(name)[0]}),all:()=>map.get(name).map(json=>({json}))});
const evalExpr=(expression,json,map)=>typeof expression==='string'&&expression.startsWith('={{')?new Function('$json','$',`return (${expression.slice(3,-2)});`)(json,name=>lookup(map,name)):expression;
async function run(w,input,options={}){
  const values=new Map(),trace=[],state={reads:0,writes:0,commits:0},opts={events:[],...options};let name='When Executed by Another Workflow',rows=[clone(input)],loops=0;
  while(name){if(++loops>90)throw Error('graph_loop');trace.push(name);const n=w.nodes.find(n=>n.name===name);assert.ok(n);assert.notEqual(n.disabled,true,name);let output=rows,index=0;
    if(n.type==='n8n-nodes-base.set')output=[{...clone(config),...(opts.readOnly?{allow_calendar_write:false}:{})}];
    else if(n.type==='n8n-nodes-base.code')output=(await new AsyncFunction('$input','$json','$','DateTime','$now',n.parameters.jsCode)({all:()=>rows.map(json=>({json})),first:()=>({json:rows[0]})},rows[0],key=>lookup(values,key),DateTime,DateTime.fromISO(now))).map(x=>x.json);
    else if(n.type==='n8n-nodes-base.if'){const c=n.parameters.conditions.conditions[0],v=evalExpr(c.leftValue,rows[0],values);const yes=c.operator.type==='boolean'?v===true:c.operator.operation==='equals'?v===c.rightValue:!!v;index=yes?0:1;}
    else if(n.type==='n8n-nodes-base.supabase')output=clone(catalog);
    else if(n.type==='n8n-nodes-base.postgres'){
      const q=n.parameters.query;
      if(q.startsWith('WITH input AS')){
        const p=values.get('LEXIA | Validar chamada de teste')[0];const key=createHash('sha256').update(JSON.stringify(p.request)).digest('hex');
        output=[{identities:[{environment:'isolated_test',disposable:true,project_ref:opts.wrongIdentity?'wrong':config.project_ref}],gate:{allowed:!opts.blocked,reason:opts.blocked?'conversation_blocked':'allowed'},call:{id:'74000000-0000-4000-8000-000000000020',request:p.request,request_key:key,calendar_id:config.calendar_id,provider_event_id:'1e'+key,status:'prepared',created_at:now}}];
      }
      else if(q.includes('lexia_environment_identity'))output=[{identities:[{environment:'isolated_test',disposable:true,project_ref:config.project_ref}]}];
      else if(q.includes('lexia_calendar_test_begin')){const p=values.get('LEXIA | Identidade confirmada')[0];const key=createHash('sha256').update(JSON.stringify(p.request)).digest('hex');state.call={id:'74000000-0000-4000-8000-000000000020',conversation_id:'74000000-0000-4000-8000-000000000021',request:p.request,request_key:key,provider_event_id:'1e'+key,calendar_id:config.calendar_id,status:opts.replay?'claimed':'prepared',created_at:now};output=[{call:clone(state.call)}];}
      else if(q.includes('lexia_calendar_test_gate')){const allowed=!(opts.blocked||opts.interventionAfterClaim&&name==='LEXIA | Revalidar antes do Google');output=[{gate:{allowed,reason:allowed?'allowed':'conversation_blocked'}}];}
      else if(q.includes('lexia_calendar_test_claim')){const acquired=!opts.claimRejected;state.call.status=acquired?'claimed':'prepared';output=[{claim:{acquired,reason:acquired?'claimed':opts.claimRejected,call_id:state.call.id,provider_event_id:state.call.provider_event_id,claim_token:acquired?'74000000-0000-4000-8000-000000000022':null}}];}
      else if(q.includes('lexia_calendar_test_finish')){if(opts.commitThrows)throw Error('synthetic_commit_failure');const p=values.get('LEXIA | Preparar recibo final')[0];state.commits++;state.call.status=p.unknown?'unknown':'completed';state.call.receipt=clone(p.receipt);output=[{call:clone(state.call)}];}
      else if(q.includes("receipt->'data'->'agendamento'"))output=opts.bookings?.map(booking=>({booking}))||[{}];
      else throw Error('unhandled_query');
    }else if(n.type==='n8n-nodes-base.googleCalendar'){
      if(n.parameters.operation==='getAll'){state.reads++;output=opts.readError?[{error:{message:'synthetic'}}]:opts.events.length?clone(opts.events):[{}];}
      else{state.writes++;if(opts.sendError)output=[{error:{message:'possible acceptance'}}];else{const p=rows[0];output=[{id:p.call.provider_event_id,status:'confirmed',summary:C.summary(p),description:C.marker(p),start:{dateTime:p.plan.inicio},end:{dateTime:p.plan.fim}}];}}
    }
    values.set(name,clone(output));const links=w.connections[name]?.main?.[index]||[];assert.ok(links.length<=1,name);name=links[0]?.node;rows=output;
  }return {result:rows[0],trace,state,values};
}
test('exports preserve all original names with native data/calendar nodes and no direct provider effects',()=>{
  for(const w of [aw,cw]){validateCalendarExport(w);assert.equal(w.active,false);assert.deepEqual(w.pinData,{});for(const n of w.nodes)for(const c of Object.values(n.credentials||{}))assert.deepEqual(Object.keys(c),['name']);}
  assert.equal(aw.nodes.length,26);assert.equal(cw.nodes.length,55);
  assert.equal(cw.nodes.find(n=>n.name==='Create an event').type,'n8n-nodes-base.googleCalendar');assert.equal(cw.nodes.find(n=>n.name==='Create a row').type,'n8n-nodes-base.postgres');
  assert.doesNotMatch(JSON.stringify([aw,cw]),/supabase\.co|uazapi\.com|upstash\.io|eyJ[A-Za-z0-9_.-]{30,}|UAZAPI_TOKEN/);
});
test('read-only availability preserves original rules with no writer ledger or calendar write node',async()=>{
  const w=read('n8n/miranda-original-crm/availability-readonly-crm.inactive.json'),input=clone(availability);input.lexia_call_context.calendar_write_allowed=false;
  assert.equal(w.nodes.length,17);validateCalendarExport(w);
  for(const name of ['Get many rows','Resolver Serviço e Janela','Status OK?','Get many events','Calcular Slots','Saída Erro'])assert.ok(w.nodes.some(x=>x.name===name));
  const path='/Users/arthurpimenta/Downloads/Miranda Workflows/verificar_disponibilidade.json';if(existsSync(path))assert.deepEqual(buildReadOnlyAvailability(read(path)),w);
  for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.postgres'))assert.doesNotMatch(n.parameters.query,/\b(insert|update|delete|create|alter)\b/i);
  assert.ok(!w.nodes.some(n=>n.name==='LEXIA | Criacao incerta?'));
  const result=await run(w,input,{readOnly:true});assert.equal(result.result.data.status,'OK');assert.equal(result.state.reads,1);assert.equal(result.state.writes,0);assert.equal(result.state.commits,0);assert.deepEqual(result.result.domain_events,[]);
  const blocked=await run(w,input,{readOnly:true,blocked:true});assert.equal(blocked.state.reads,0);assert.equal(blocked.result.status,'failed');
  await assert.rejects(()=>run(w,input,{readOnly:true,wrongIdentity:true}),/identity_mismatch/);
  await assert.rejects(()=>run(w,{...input,lexia_call_context:{...input.lexia_call_context,calendar_write_allowed:true}},{readOnly:true}),/read_only_calendar_required/);
  const fail=await run(w,input,{readOnly:true,readError:true});assert.equal(fail.result.status,'failed');
});
test('generation is deterministic against the local originals without copying inline notification secrets',()=>{
  const dir='/Users/arthurpimenta/Downloads/Miranda Workflows/';if(!existsSync(dir+'criar_agendamento.json'))return;
  assert.deepEqual(buildCalendarTool(read(dir+'verificar_disponibilidade.json'),'availability.check'),aw);assert.deepEqual(buildCalendarTool(read(dir+'criar_agendamento.json'),'appointment.create'),cw);
});
test('test scope, operation, state, flags, account and mixed calls are rejected before IO',()=>{
  for(const fn of [x=>x.lexia_call_context.scope.environment='production',x=>x.lexia_call_context.scope.cliente_slug='foreign',x=>delete x.lexia_call_context.captured_state,x=>x.lexia_call_context.operation='availability.check',x=>x.lexia_call_context.tools_permitidas=false,x=>x.calendar_id='payload-destination']){const p=clone(creation);fn(p);assert.throws(()=>C.accept([{json:p}],config,'appointment.create'));}
  assert.throws(()=>C.accept([{json:creation},{json:creation}],config,'appointment.create'));assert.throws(()=>C.accept([{json:creation}],{...config,allow_calendar_write:false},'appointment.create'));
});
test('primary and unreviewed calendars cannot be guessed or enabled by the caller',()=>{
  for(const patch of [{calendar_id:'primary'},{calendar_id:'person@example.invalid'},{expected_calendar_id:'other@group.calendar.google.com'},{calendar_reviewed:false},{project_ref:''}])assert.throws(()=>C.accept([{json:creation}],{...config,...patch},'appointment.create'));
});
test('original production calendar is protected by a nonreusable fingerprint, not copied as a destination',()=>{
  for(const w of [aw,cw]){const fields=w.nodes.find(n=>n.name==='Config Tools Lexia').parameters.assignments.assignments;const hashes=fields.find(f=>f.name==='protected_calendar_hashes').value;assert.equal(hashes.length,1);assert.match(hashes[0],/^[0-9a-f]{64}$/);assert.equal(fields.find(f=>f.name==='calendar_id').value,'');}
  const sql=readFileSync('supabase/isolated/lote2/202610120001_calendar_tools.sql','utf8');assert.match(sql,/calendar_original_production_destination_forbidden/);
  assert.throws(()=>C.accept([{json:creation}],{...config,protected_calendar_hashes:[]},'appointment.create'));
});
test('read-only caller permission cannot become a calendar write even with enabled tool configuration',()=>{
  const p=clone(creation);p.lexia_call_context.calendar_write_allowed=false;assert.throws(()=>C.accept([{json:p}],config,'appointment.create'),/write_not_authorized/);
});
test('date-times are strict and impossible preferred dates or clock 24 are rejected',()=>{
  for(const iso of ['2026-02-30T12:00:00Z','2026-10-13T24:00:00-04:00']){const p=clone(creation);p.inicio_iso=iso;assert.throws(()=>C.accept([{json:p}],config,'appointment.create'));}
  for(const patch of [{data_preferida:'2026-02-30'},{horario_preferido:'24:00'},{horario_preferido:'23 PM'},{horario_preferido:'0 AM'}])assert.throws(()=>C.accept([{json:{...availability,...patch}}],config,'availability.check'));
});
test('identity, cache and origin bind tenant, calendar, call and immutable request',()=>{
  const p=started();assert.throws(()=>C.identity(p,[{identities:[{disposable:true,environment:'production',project_ref:config.project_ref}]}]));
  assert.throws(()=>C.started(p,[{call:{...p.call,calendar_id:'other'}}]));assert.throws(()=>C.started(p,[{call:{...p.call,request:{}}}]));
  const r=C.refusal(p,'synthetic',now);assert.deepEqual(C.cached({...p,call:{...p.call,receipt:r}}),r);assert.throws(()=>C.cached({...p,call:{...p.call,receipt:{...r,invocation_id:availability.lexia_call_context.invocation_id}}}));
});
test('pauses block availability before catalog, Google or expensive processing',async()=>{
  const r=await run(aw,availability,{blocked:true});assert.equal(r.state.reads,0);assert.equal(r.result.status,'failed');assert.ok(!r.trace.includes('Get many rows'));
});
test('pauses block booking before any Google call',async()=>{
  const r=await run(cw,creation,{blocked:true});assert.equal(r.state.writes,0);assert.equal(r.state.reads,0);assert.equal(r.result.data.status,'BLOQUEADO');
});
test('original availability returns genuine scoped options but never a booking event',async()=>{
  const r=await run(aw,availability);assert.equal(r.result.status,'succeeded');assert.equal(r.result.data.status,'OK');assert.equal(r.result.data.horario_pedido.status,'DISPONIVEL');assert.deepEqual(r.result.domain_events,[]);assert.equal(r.state.reads,1);assert.equal(r.state.writes,0);assert.equal(r.state.commits,1);
});
test('original successful creation returns the attested interval and localized template only after durable receipt',async()=>{
  const r=await run(cw,creation);assert.equal(r.result.status,'succeeded');assert.equal(r.result.data.status,'CRIADO');assert.equal(r.state.writes,1);assert.equal(r.state.commits,1);assert.equal(r.result.domain_events[0].appointment.ends_at,'2026-10-13T16:00:00.000-04:00');assert.match(r.result.data.confirmacao_texto,/Agendamento confirmado/);assert.doesNotMatch(JSON.stringify(r.result),/group\.calendar\.google\.com|LEXIA_TEST_CALL/);
});
test('the new receipts are accepted by the original-CRM brain engine validation',async()=>{
  const r=await run(cw,creation);const input=read('tests/fixtures/omnichannel/miranda-brain-call-a.json');input.invocation_id=creation.lexia_call_context.invocation_id;input.scope=creation.lexia_call_context.scope;input.operacao.tools_permitidas=true;input.operacao.calendar_access='isolated_test';
  const cfg={environment:'isolated_test',cliente_slug:input.scope.cliente_slug,account_ref:input.scope.account_ref,private_project_ref:config.project_ref,models_reviewed:true,private_data_reviewed:true,calendar_tools_reviewed:true,protected_tool_fingerprints:['00000000'],availability_workflow_ref:'isolated-availability',create_appointment_workflow_ref:'isolated-create'};
  const p=B.restoreMemory(B.accept([{json:input}],cfg),[]);const out=B.captureTools(p,{output:JSON.stringify({modulo:'agendamento'}),intermediateSteps:[{action:{tool:'criar_agendamento',toolInput:{inicio_iso:creation.inicio_iso}},observation:JSON.stringify(r.result)}]});assert.equal(out.domain_events.length,1);assert.equal(out.templates[0],r.result.data.confirmacao_texto);
});
test('brain rejects linking a known original production tool before any tool execution',()=>{
  const p=read('tests/fixtures/omnichannel/miranda-brain-call-a.json');p.operacao.tools_permitidas=true;p.operacao.calendar_access='isolated_test';
  const cfg={environment:'isolated_test',cliente_slug:p.scope.cliente_slug,account_ref:p.scope.account_ref,private_project_ref:config.project_ref,models_reviewed:true,private_data_reviewed:true,calendar_tools_reviewed:true,availability_workflow_ref:'synthetic-protected-original',create_appointment_workflow_ref:'isolated-create',protected_tool_fingerprints:[referenceFingerprint('synthetic-protected-original')]};
  assert.throws(()=>B.accept([{json:p}],cfg),/production_tool_forbidden/);
});
test('brain passes state and confirmation provenance from confirmed history, never from model arguments',()=>{
  const p=read('tests/fixtures/omnichannel/miranda-brain-call-a.json');p.historico=[{autor:'agente_ia',direccao:'enviada',status:'sent',conteudo:'Quer manter os dois agendamentos?',criado_em:now},{autor:'agente_ia',direccao:'enviada',status:'suppressed',conteudo:'Proposta nao entregue.',criado_em:now}];p.operacao.calendar_access='isolated_test';p.operacao.tools_permitidas=true;p.operacao.calendar_write_allowed=false;
  const ctx={payload:p,scope:p.scope};const c=B.calendarContext(ctx,'appointment.create');assert.deepEqual(c.captured_state,p.captured_state);assert.equal(c.confirmation.last_delivered_assistant_message,'Quer manter os dois agendamentos?');assert.equal(c.confirmation.keep_both_confirmed,true);assert.equal(c.calendar_write_allowed,false);
});
test('confirmation language follows pt/en/es without changing the original laser preparation',async()=>{
  for(const [idioma,word]of [['pt','Agendamento confirmado'],['en','Appointment confirmed'],['es','Cita confirmada']]){const r=await run(cw,{...creation,idioma});assert.match(r.result.data.confirmacao_texto,new RegExp(word));}
  const x=clone(creation);Object.assign(x,{servico:'Depilação a Laser',variante:'area_pequena'});x.lexia_call_context.confirmation.last_delivered_assistant_message='Confirma Depilação a Laser com Bruna em 13/10 às 3:30 PM? Nome: Joana Exemplo. Telefone: 12025550123.';const r=await run(cw,x);assert.match(r.result.data.confirmacao_texto,/Raspe a área/);
});
test('variants require the client choice and multi-area duration rules survive',async()=>{
  const missing=await run(aw,{...availability,servico:'Massagem Relaxante'});assert.equal(missing.result.data.status,'VARIANTE_NECESSARIA');assert.equal(missing.state.reads,0);
  for(const [variante,duration]of [['area_pequena + area_media',75],['3 areas pequenas',60],['corpo_inteiro',150]]){const r=await run(aw,{...availability,servico:'Depilação a Laser',variante,variante_confirmada:'sim'});assert.equal(r.result.data.duracao_min,duration);}
  const massage=await run(aw,{...availability,servico:'Massagem Relaxante',variante:'90 min',variante_confirmada:'sim'});assert.equal(massage.result.data.duracao_min,90);
});
test('evaluation-required service is redirected, missing evaluation cannot silently book treatment',async()=>{
  const r=await run(aw,{...availability,servico:'Tratamento Ficticio'});assert.equal(r.result.data.servico_agendado,'Consulta de Avaliação');assert.throws(()=>C.catalog(catalog.filter(r=>r.nome!=='Consulta de Avaliação')));
});
test('Sunday, blocked days, late Tuesday finish and Saturday-before-10 retain Miranda rules',async()=>{
  const a=await run(aw,{...availability,data_preferida:'2026-10-18',horario_preferido:''});assert.ok(a.result.data.opcoes.every(s=>DateTime.fromISO(s.inicio_iso).weekday!==7));
  const early=await run(aw,{...availability,data_preferida:'2026-10-17',horario_preferido:'9:00 AM'});assert.equal(early.result.data.horario_pedido.status,'ENCAMINHAR_EQUIPE');
  const sunday=await run(cw,{...creation,inicio_iso:'2026-10-18T15:30:00-04:00'});assert.equal(sunday.result.status,'failed');assert.equal(sunday.state.writes,0);
  assert.equal(C.validAlternative({inicio_iso:'2026-10-13T19:00:00-04:00'},{...started(),plan:{profissional:'Samuel',duracao_min:60}},DateTime),false);
  assert.equal(C.validAlternative({inicio_iso:'2026-10-14T19:00:00-04:00'},{...started(),plan:{profissional:'Samuel',duracao_min:60}},DateTime),true);
});
test('malformed Google events and failed reads cannot become empty free calendars',async()=>{
  const r=await run(aw,availability,{readError:true});assert.equal(r.result.status,'failed');assert.deepEqual(r.result.domain_events,[]);
  assert.throws(()=>C.events([{id:'broken',summary:'Samuel - broken'}]));assert.throws(()=>C.events([{start:{dateTime:'2026-02-30T12:00:00Z'},end:{dateTime:'2026-03-01T12:00:00Z'}}]));
});
test('all-day and unknown-owner busy events block both professionals; transparent/cancelled do not',async()=>{
  const busy={summary:'Personal appointment',start:{dateTime:'2026-10-13T15:30:00-04:00'},end:{dateTime:'2026-10-13T16:00:00-04:00'}};
  const r=await run(cw,creation,{events:[busy]});assert.equal(r.result.data.status,'CONFLITO');assert.equal(r.state.writes,0);
  const free=await run(cw,creation,{events:[{...busy,transparency:'transparent'}]});assert.equal(free.state.writes,1);
  assert.deepEqual(C.events([{...busy,status:'cancelled'}]),[]);
  const allDay=await run(aw,availability,{events:[{summary:'All day',start:{date:'2026-10-13'},end:{date:'2026-10-14'}}]});assert.equal(allDay.result.data.horario_pedido.status,'INDISPONIVEL');
});
test('15 minute buffer and professional separation remain in the original calculations',async()=>{
  const event={summary:'Samuel - Existing',start:{dateTime:'2026-10-13T16:00:00-04:00'},end:{dateTime:'2026-10-13T16:30:00-04:00'}};
  assert.equal((await run(cw,creation,{events:[event]})).state.writes,0);
  const bruna={...event,summary:'Bruna - Existing'};assert.equal((await run(cw,creation,{events:[bruna]})).state.writes,1);
});
test('conflict alternatives are filtered by Samuel rules and use AM/PM, not the old invalid morning options',async()=>{
  const event={summary:'Samuel - Existing',start:{dateTime:creation.inicio_iso},end:{dateTime:'2026-10-13T16:00:00-04:00'}};
  const r=await run(cw,creation,{events:[event]});assert.equal(r.result.data.status,'CONFLITO');assert.ok(r.result.data.novas_opcoes.length>0);assert.ok(r.result.data.novas_opcoes.every(s=>C.validAlternative(s,{...started(),plan:{profissional:'Samuel',duracao_min:30}},DateTime)));assert.ok(r.result.data.novas_opcoes.every(s=>/AM|PM/.test(s.rotulo)));
});
test('a known future duplicate does not create another booking or silently bypass business confirmation',async()=>{
  const r=await run(cw,creation,{bookings:[{servico:'Consulta de Avaliação',profissional:'Samuel',telefone:creation.telefone,inicio:'2026-10-15T15:30:00-04:00'}]});assert.equal(r.result.data.status,'JA_AGENDADO');assert.equal(r.state.reads,0);assert.equal(r.state.writes,0);assert.equal(r.result.status,'failed');
  const x=clone(creation);x.ignorar_duplicado='sim';await assert.rejects(()=>run(cw,x),/second_booking/);
});
test('a caller cannot create without delivered recap, exact picked date/name/phone or explicit OK',async()=>{
  for(const fn of [x=>x.lexia_call_context.confirmation.latest_lead_message='quero saber os horarios',x=>x.lexia_call_context.confirmation.last_delivered_assistant_message='Confirma?',x=>x.nome='Outra Pessoa',x=>x.telefone='12025550124']){const x=clone(creation);fn(x);await assert.rejects(()=>run(cw,x),/confirmation|recap/);}
});
test('natural explicit confirmations accept punctuation in three languages but not hesitation or a changed request',async()=>{
  for(const text of ['Sim, pode agendar! Obrigada.','Yes, go ahead! Thanks.','Sí, por favor! Gracias.']){const p=clone(creation);p.lexia_call_context.confirmation.latest_lead_message=text;assert.equal((await run(cw,p)).state.writes,1);}
  for(const text of ['sim?','sim, mas nao agora','sim, mas quero outro horario']){const p=clone(creation);p.lexia_call_context.confirmation.latest_lead_message=text;await assert.rejects(()=>run(cw,p),/explicit_confirmation/);}
});
test('a second booking is accepted only after explicit keep-both permission and an earlier delivered recap',async()=>{
  const p=clone(creation);p.ignorar_duplicado='sim';const c=p.lexia_call_context.confirmation;c.delivered_assistant_messages=[c.last_delivered_assistant_message];c.last_delivered_assistant_message='Quer manter os dois agendamentos?';c.keep_both_confirmed=true;
  const r=await run(cw,p,{bookings:[{servico:'Consulta de Avaliação',profissional:'Samuel',telefone:p.telefone,inicio:'2026-10-15T15:30:00-04:00'}]});assert.equal(r.result.data.status,'CRIADO');assert.equal(r.state.writes,1);
});
test('tool schema rejects availability-as-confirmation, malformed times and cancelled creation status',async()=>{
  const r=(await run(cw,creation)).result;
  assert.throws(()=>C.receipt({...started(),operation:'availability.check'},r.data,now,'succeeded',r.domain_events));
  assert.throws(()=>C.receipt({...started(),operation:'availability.check'},r.data,now,'succeeded',[]));
  for(const change of [e=>delete e.appointment.ends_at,e=>e.appointment.status='cancelled',e=>e.appointment.ends_at='2026-02-30T12:00:00Z']){const d=clone(r.domain_events);change(d[0]);assert.throws(()=>C.receipt(started(),r.data,now,'succeeded',d));}
});
test('unknown/replayed calls never return to Create an event',async()=>{
  const replay=await run(cw,creation,{replay:true});assert.equal(replay.result.status,'unknown');assert.equal(replay.state.writes,0);assert.equal(replay.state.reads,0);
  const unknown=await run(cw,creation,{sendError:true});assert.equal(unknown.result.status,'unknown');assert.equal(unknown.state.writes,1);assert.deepEqual(unknown.result.domain_events,[]);assert.equal(unknown.state.call.status,'unknown');
});
test('a concurrent non-owner cannot release or overwrite another execution claim',async()=>{
  const r=await run(cw,creation,{claimRejected:'already_claimed_or_completed'});assert.equal(r.result.status,'unknown');assert.equal(r.state.writes,0);assert.equal(r.state.commits,0);assert.ok(r.trace.includes('LEXIA | Devolver sem mudar claim alheio'));
});
test('intervention after claim but before Google is revalidated and creates no event',async()=>{
  const r=await run(cw,creation,{interventionAfterClaim:true});assert.equal(r.result.status,'failed');assert.equal(r.state.writes,0);assert.ok(r.trace.includes('LEXIA | Revalidar antes do Google'));
});
test('writer reservation precedes fresh duplicate and Google reads, preventing stale pre-claim conflict checks',async()=>{
  const r=await run(cw,creation);assert.ok(r.trace.indexOf('LEXIA | Claim confirmado')<r.trace.indexOf('Evento confirmado?'));assert.ok(r.trace.indexOf('LEXIA | Claim confirmado')<r.trace.indexOf('Get many events'));assert.ok(r.trace.indexOf('Get many events')<r.trace.indexOf('Create an event'));
  const blocked=await run(cw,creation,{claimRejected:'calendar_busy_or_requires_reconciliation'});assert.equal(blocked.state.reads,0);assert.equal(blocked.state.writes,0);
});
test('possible acceptance followed by database failure is not reported as a safe retry',async()=>{
  await assert.rejects(()=>run(cw,creation,{commitThrows:true}),/commit_failure/);
  const p=started();assert.throws(()=>C.committed(p,C.refusal(p,'x',now),[]),/no_auto_retry/);
});
test('forged/wrong/missing Google receipt IDs, dates, markers or invites require reconciliation',()=>{
  const p={...started(),plan:{inicio:creation.inicio_iso,fim:'2026-10-13T16:00:00-04:00',profissional:'Samuel',servico_agendado:'Consulta de Avaliação'}};
  const e={id:p.call.provider_event_id,status:'confirmed',summary:C.summary(p),description:C.marker(p),start:{dateTime:p.plan.inicio},end:{dateTime:p.plan.fim}};
  assert.ok(C.created(p,e,now));for(const change of [x=>x.id='other',x=>x.description='other',x=>x.status='cancelled',x=>x.attendees=[{email:'person@example.invalid'}],x=>x.end.dateTime='2026-10-13T17:00:00-04:00']){const x=clone(e);change(x);assert.throws(()=>C.created(p,x,now),/reconciliation/);}
});
test('new Google event is private, identified deterministically, without guests, emails or default reminders',()=>{
  const n=cw.nodes.find(n=>n.name==='Create an event');assert.equal(n.parameters.additionalFields.sendUpdates,'none');assert.equal(n.parameters.additionalFields.visibility,'private');assert.equal(n.parameters.useDefaultReminders,false);assert.equal(n.parameters.additionalFields.attendees,undefined);assert.match(n.parameters.additionalFields.id,/provider_event_id/);assert.equal(n.retryOnFail,false);
});
test('SQL is an unapplied isolated artifact with RLS, parameterization, claim ownership and no uncertainty expiry',()=>{
  const sql=readFileSync('supabase/isolated/lote2/202610120001_calendar_tools.sql','utf8');assert.match(sql,/disposable_identity_required/);assert.match(sql,/enable row level security/);assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/calendar_claim_owner_mismatch/);assert.match(sql,/b\.cutoff_seq=s\.lead_message_seq/);assert.match(sql,/slot_not_attested_or_expired/);assert.doesNotMatch(sql,/delete from|drop table|delivery_unknown|create table public\.agendamentos_miranda/);
  for(const n of [...aw.nodes,...cw.nodes].filter(n=>n.type==='n8n-nodes-base.postgres'))assert.doesNotMatch(n.parameters.query,/\$json|\{\{/);
});
test('source external-effect names remain only as disconnected disabled reference nodes',()=>{
  for(const name of ['Pausa Eterna WhatsApp','Notificar Samuel (uazapi)','Notificar Sócio','Encerrar Follow-up do Lead']){const n=cw.nodes.find(n=>n.name===name);assert.equal(n.disabled,true);assert.equal(n.type,'n8n-nodes-base.code');assert.equal(n.credentials,undefined);assert.ok(!Object.values(cw.connections).some(types=>Object.values(types).flat(2).some(e=>e.node===name)));}
});
test('new native graph nodes have stable distinct centers',()=>{
  for(const w of [aw,cw]){const centers=w.nodes.filter(n=>n.type!=='n8n-nodes-base.stickyNote').map(n=>JSON.stringify(n.position));assert.equal(new Set(centers).size,centers.length);}
});
