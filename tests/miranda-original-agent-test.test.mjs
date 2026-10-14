import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { auditWorkflow } from '../scripts/build-miranda-original-crm.mjs';
import { prepareCrmAgentTest } from '../scripts/build-miranda-crm-agent-test.mjs';

const source=JSON.parse(readFileSync(new URL('../n8n/miranda-original-crm/omnichannel-original-crm.inactive.json',import.meta.url)));
const workflow=JSON.parse(readFileSync(new URL('../n8n/miranda-original-crm/omnichannel-crm-agent-test.inactive.json',import.meta.url)));
const node=name=>workflow.nodes.find(n=>n.name===name);
const targets=name=>(workflow.connections[name]?.main || []).flat().map(l=>l.node);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const uuid='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const date='2026-10-11T12:00:00Z';
const scope={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',channel:'whatsapp',account_ref:'24000000-0000-4000-8000-000000000001',conversation_ref:'test:SYNTH-LEXIA-TEST-CHAT-'+uuid};
const request=()=>({schema_version:'lexia.workflow.test.request.v1',run_id:uuid,target:'omnichannel',delivery_mode:'simulate',execution_mode:'full_agent_virtual',tool_policy:{calendar:'disabled'},scope:{...scope},input:{message_id:'test-message:'+uuid,type:'text',text:'Gostaria de ser atendido em espanol'},expectations:{provider_send:false,persist_synthetic_events:true,return_trace:true}});
const run=(name,input={},refs={},inputs=[input])=>new AsyncFunction('$input','$json','$','$execution','$now',node(name).parameters.jsCode)(
  {first:()=>({json:input}),all:()=>inputs.map(json=>({json}))},input,
  name=>{if(!Object.hasOwn(refs,name))throw new Error('node_not_executed:'+name);return {first:()=>({json:refs[name]}),item:{json:refs[name]}};},
  {id:'synthetic-execution'},date,
);
const one=async(...args)=>(await run(...args))[0].json;
const config={environment:'isolated_test',cliente_slug:scope.cliente_slug,test_account_ref:scope.account_ref,test_project_ref:'gaofupndxgitonfmvpzi'};
const controls={permitir_teste_plataforma:true,permitir_envio_real:false,permitir_tools_teste:false,permitir_notificacao_handoff:false};
const marker={id:true,project_ref:config.test_project_ref,environment:'isolated_test',disposable:true};
async function operational(req=request()) {
  const event=await one('LEXIA | Adaptar teste virtual',{body:req});
  const body=event.body;
  return {event,op:{canal:req.scope.channel,lexia_session_id:body.lexia_session_id,lexia_run_id:req.run_id,
    mensagem_id_externo:req.input.message_id,conteudo_mensagem:req.input.text,from_me:false,
    lexia_body_normalizado:body,sender_id:body._sender_id,tipo_mensagem:'texto',telefone:body._sender_id,recebido_em:date}};
}
function guardRefs(event,op,cfg=config,control=controls) {return {'Entrada Unificada':event,'Normalizar Dados Operacionais':op,'Config Cliente Lexia':cfg,'CENTRAL DE CONTROLE':control};}
const virtualRefs=(actions,language='es')=>({'Preparar Saída Omnichannel':{entregas:actions},'Preparar Pacote de Contexto':{expected_language:language}});
const resultRefs=(req,v)=>({'Entrada Unificada':{body:{_workflow_test_request:req}},'LEXIA | Registro individual confirmado':{duplicate:false},...(v?{'LEXIA | Resultado virtual revalidado':v,'Preparar Pacote de Contexto':{expected_language:'es'},'Validar Saída Cérebro Cliente':{acao:'entregar'}}:{})});

test('CRM-shaped request becomes a stable conversation and correlated message',async()=>{
  const a=await one('LEXIA | Adaptar teste virtual',{body:request()});
  const bReq=request();bReq.run_id=other;bReq.input.message_id='test-message:'+other;
  const b=await one('LEXIA | Adaptar teste virtual',{body:bReq});
  assert.equal(a.body.lexia_session_id,b.body.lexia_session_id);
  assert.notEqual(a.body.lexia_message_id,b.body.lexia_message_id);
  const {op}=await operational();
  const recorded=await one('LEXIA | Preparar registro individual',{}, {'Normalizar Dados Operacionais':op,'Config Cliente Lexia':config});
  assert.equal(recorded.conversation_ref,scope.conversation_ref);
  assert.equal(recorded.telefone,'');
  assert.equal(recorded.provider,'fake');
});

test('different CRM conversations do not inherit a previous session',async()=>{
  const a=await one('LEXIA | Adaptar teste virtual',{body:request()});
  const req=request();req.scope.conversation_ref='test:SYNTH-LEXIA-TEST-CHAT-'+other;
  const b=await one('LEXIA | Adaptar teste virtual',{body:req});
  assert.notEqual(a.body._sender_id,b.body._sender_id);
  assert.notEqual(a.body.lexia_session_id,b.body.lexia_session_id);
});

test('strict ingress rejects legacy fields, invalid correlations and mixed items',async()=>{
  for(const edit of [r=>{r.session_id='wrong';},r=>{r.input.message_id='test-message:'+other;},r=>{r.input.text=' ';},r=>{r.scope.conversation_ref='test:'+'-'.repeat(36);},r=>{r.input.type='audio';}]) {
    const req=request();edit(req);await assert.rejects(run('LEXIA | Adaptar teste virtual',{body:req}));
  }
  await assert.rejects(run('LEXIA | Adaptar teste virtual',{body:request()},{},[{body:request()},{body:request()}]),/single_test_request/);
});

test('test mode never permits a calendar, provider delivery or nonisolated target',async()=>{
  for(const edit of [r=>{r.scope.environment='staging';},r=>{r.tool_policy.calendar='test_read_write';},r=>{r.execution_mode='safe_simulation';},r=>{r.target='brain';},r=>{r.expectations.provider_send=true;}]){
    const req=request();edit(req);await assert.rejects(run('LEXIA | Adaptar teste virtual',{body:req}));
  }
});

test('trusted config rejects tenant/account/channel swaps before any write',async()=>{
  const {event,op}=await operational();
  await one('LEXIA | Validar escopo de teste',{},guardRefs(event,op));
  for(const cfg of [{...config,cliente_slug:'empresa_sintetica_b'},{...config,test_account_ref:other},{...config,environment:'production'}])await assert.rejects(run('LEXIA | Validar escopo de teste',{},guardRefs(event,op,cfg)),/trusted_test_scope/);
  await assert.rejects(run('LEXIA | Validar escopo de teste',{},guardRefs(event,{...op,canal:'instagram'})),/trusted_test_scope/);
  await assert.rejects(run('LEXIA | Validar escopo de teste',{},guardRefs(event,{...op,lexia_session_id:'wrong'})),/test_event_origin/);
});

test('unsafe flags fail closed, independently from the reviewed brain flag',async()=>{
  const {event,op}=await operational();
  for(const field of ['permitir_envio_real','permitir_tools_teste','permitir_notificacao_handoff'])await assert.rejects(run('LEXIA | Validar escopo de teste',{},guardRefs(event,op,config,{...controls,[field]:true})),/unsafe_test_controls/);
  await assert.rejects(run('LEXIA | Validar escopo de teste',{},guardRefs(event,op,{...config,test_project_ref:''})),/configure_disposable/);
});

test('Postgres and native Supabase must attest the same disposable identity',async()=>{
  const refs={'Config Cliente Lexia':config,'LEXIA | Conferir banco descartavel':{identities:[marker]},'LEXIA | Validar escopo de teste':{synthetic:true}};
  assert.deepEqual(await one('LEXIA | Identidade de teste confirmada',marker,refs),{synthetic:true});
  for(const bad of [{...marker,project_ref:'differentprojectrefxx'},{...marker,environment:'production'},{...marker,disposable:false},{}])await assert.rejects(run('LEXIA | Identidade de teste confirmada',bad,refs),/identity/);
  await assert.rejects(run('LEXIA | Identidade de teste confirmada',marker,{...refs,'LEXIA | Conferir banco descartavel':{identities:[]}}),/identity/);
  await assert.rejects(run('LEXIA | Identidade de teste confirmada',marker,refs,[marker,marker]),/identity/);
});

test('preflight reads happen before durable ingestion and original processing remains',()=>{
  assert.deepEqual(targets('Normalizar Dados Operacionais'),['LEXIA | Validar escopo de teste']);
  assert.deepEqual(targets('LEXIA | Identidade de teste confirmada'),['LEXIA | Preparar registro individual']);
  assert.match(node('LEXIA | Conferir banco descartavel').parameters.query,/^SELECT/);
  assert.equal(node('LEXIA | Conferir API descartavel').type,'n8n-nodes-base.supabase');
  for(const name of ['Audio','Imagem','PDF','Analyze video','Redis_Buffer2','Buscar Histórico da Conversa','Preparar Contexto Activo','Chamar Cérebro do Cliente'])assert.ok(node(name),name);
  assert.deepEqual(targets('Set Intervenção Humana'),['Intervenção é áudio?']);
});

test('language filter blocks the wrong response before its virtual persistence',async()=>{
  const good=await one('LEXIA | Resultado virtual Frappe',{},virtualRefs([{tipo:'texto',texto:'Hola, quiero ayudarte. ¿Qué horario prefieres?'}]));
  assert.equal(good.status,'completed');assert.equal(good.entregas.length,1);
  const bad=await one('LEXIA | Resultado virtual Frappe',{},virtualRefs([{tipo:'texto',texto:'Olá, gostaria de agendar sua avaliação amanhã?'}]));
  assert.equal(bad.status,'blocked');assert.deepEqual(bad.entregas,[]);
  assert.match(node('LEXIA | Persistir resposta no canal virtual').parameters.options.queryReplacement,/Resultado virtual Frappe/);
});

test('virtual text validates size and rejects media not supported by CRM chat',async()=>{
  for(const actions of [[{tipo:'imagem',url:'https://media.invalid/test.png'}],[{tipo:'texto',texto:''}],[{tipo:'texto',texto:'x'.repeat(4001)}],Array.from({length:21},()=>({tipo:'texto',texto:'Hola'}))])await assert.rejects(run('LEXIA | Resultado virtual Frappe',{},virtualRefs(actions)),/virtual/);
});

test('permission changed during preparation suppresses all virtual responses',async()=>{
  const base=await one('LEXIA | Resultado virtual Frappe',{},virtualRefs([{tipo:'texto',texto:'Hola'}]));
  const denied=await one('LEXIA | Resultado virtual revalidado',{permitted:false},{'LEXIA | Resultado virtual Frappe':base});
  assert.equal(denied.reason,'state_changed');assert.deepEqual(denied.entregas,[]);
  await assert.rejects(run('LEXIA | Resultado virtual revalidado',{},{'LEXIA | Resultado virtual Frappe':base}),/permission_result/);
  const sql=node('LEXIA | Persistir resposta no canal virtual').parameters.query;
  assert.match(sql,/state_version=\$4/);assert.match(sql,/delivery_epoch=\$5/);assert.match(sql,/has_active_block/);
});

test('completed and language-blocked responses match the real Frappe envelope',async()=>{
  for(const text of ['Hola, quiero ayudarte. ¿Qué horario prefieres?','Olá, gostaria de agendar sua avaliação amanhã?']) {
    const v=await one('LEXIA | Resultado virtual Frappe',{},virtualRefs([{tipo:'texto',texto:text}]));
    const r=await one('LEXIA | Devolver resposta virtual',{},resultRefs(request(),v));
    const verified=await one('LEXIA | Validar retorno de teste CRM',r,{'LEXIA | Adaptar teste virtual':{body:{_workflow_test_request:request()}}});
    assert.deepEqual(verified,r);
    assert.equal(r.provider_send_attempted,false);
    assert.equal(r.output.simulation_engine,'n8n_full_agent_virtual_v1');
    assert.equal(r.output.assistant_messages.length,v.entregas.length);
    assert.equal(r.output.expected_language,'es');
    if(v.status==='blocked')assert.equal(r.error_code,'response_language_mismatch');
  }
});

test('pause, duplicate and handoff finish without a provider or operational mirror call',async()=>{
  for(const [refs,input,reason] of [
    [resultRefs(request()),{blocks:[{status:'active',expires_at:null}]},'conversation_paused'],
    [{...resultRefs(request()),'LEXIA | Registro individual confirmado':{duplicate:true}}, {}, 'duplicate'],
    [{...resultRefs(request()),'Validar Saída Cérebro Cliente':{acao:'handoff'}},{},'handoff'],
  ]) {
    const r=await one('LEXIA | Devolver resposta virtual',input,refs);
    assert.equal(r.status,'completed');assert.equal(r.output.reason,reason);assert.deepEqual(r.output.assistant_messages,[]);
  }
  assert.deepEqual(targets('CRM | Ler espelho da conversa'),['LEXIA | Devolver resposta virtual']);
  assert.equal(node('CRM | Enviar evento ao Frappe').disabled,true);
});

test('child exception is returned as a sanitized failure, never as successful simulation',async()=>{
  const r=await one('LEXIA | Validar retorno de teste CRM',{error:{message:'private diagnostic or possible acceptance'}},{'LEXIA | Adaptar teste virtual':{body:{_workflow_test_request:request()}}});
  assert.equal(r.status,'failed');assert.equal(r.error_code,'agent_execution_failed');
  assert.deepEqual(r.output.assistant_messages,[]);assert.doesNotMatch(JSON.stringify(r),/private diagnostic/);
  assert.equal(node('LEXIA | Chamar teste neste omnichannel').onError,'continueRegularOutput');
  assert.equal(node('LEXIA | Chamar teste neste omnichannel').retryOnFail,false);
});

test('parent rejects swapped run/scope and malformed assistant outputs',async()=>{
  const v=await one('LEXIA | Resultado virtual Frappe',{},virtualRefs([{tipo:'texto',texto:'Hola'}]));
  const good=await one('LEXIA | Devolver resposta virtual',{},resultRefs(request(),v));
  for(const change of [r=>{r.run_id=other;},r=>{r.output.scope.conversation_ref='test:'+other;},r=>{r.output.scope.cliente_slug='empresa_sintetica_b';},r=>{r.output.assistant_messages[0].sequence=8;},r=>{r.output.assistant_messages[0].unexpected=true;},r=>{r.output.language_policy_status='blocked';}]) {
    const bad=structuredClone(good);change(bad);
    assert.equal((await one('LEXIA | Validar retorno de teste CRM',bad,{'LEXIA | Adaptar teste virtual':{body:{_workflow_test_request:request()}}})).status,'failed');
  }
});

test('history and prior context remain attached; explicit language request wins',async()=>{
  const refs={
    'CENTRAL DE CONTROLE':{cerebro_teste_revisado:true},
    'LEXIA | Registro individual confirmado':{...scope,conversation_id:uuid},
    'LEXIA | Lote autorizado':{invocation_id:uuid,out_mensagem_ids:[other]},
    'Agrupar Histórico':{data:[{id:other,omni_conversation_id:uuid,cliente_slug:scope.cliente_slug,conteudo:request().input.text}]},
    'LEXIA | Configuracao de contexto':{...scope,prompt_template:'synthetic context prompt',config_version:'test-v1',status:'active',company_fields_schema:{type:'object'}},
    'LEXIA | Estado e contexto duraveis':{context:{context_version:3,operational_context:{language:'pt',summary:'Lead requested skin evaluation'},company_fields:{service:'evaluation'}},state:{state_version:2,delivery_epoch:1}},
    'Unificar Contacto':{id:uuid},
  };
  const p=await one('Preparar Pacote de Contexto',{},refs);
  assert.equal(p.expected_language,'es');assert.equal(p.context_version,3);assert.equal(p.historico_mensagens.length,1);
  assert.equal(JSON.parse(p.contexto_activo).resumo_contexto,'Lead requested skin evaluation');
  refs['Agrupar Histórico'].data[0].conteudo='40';
  refs['LEXIA | Estado e contexto duraveis'].context.operational_context.language='es';
  assert.equal((await one('Preparar Pacote de Contexto',{},refs)).expected_language,'es');
  refs['Agrupar Histórico'].data[0].omni_conversation_id=other;
  await assert.rejects(run('Preparar Pacote de Contexto',{},refs),/history_scope_mismatch/);
  refs['CENTRAL DE CONTROLE'].cerebro_teste_revisado=false;
  await assert.rejects(run('Preparar Pacote de Contexto',{},refs),/review_isolated_brain_before_model/);
});

test('inactive export preserves every source node and refuses production credentials',()=>{
  auditWorkflow(workflow);
  for(const original of source.nodes)assert.ok(node(original.name),original.name);
  for(const n of workflow.nodes)for(const c of Object.values(n.credentials || {}))assert.equal(c.id,undefined);
  for(const n of workflow.nodes.filter(n=>n.type==='n8n-nodes-base.postgres'))assert.equal(n.credentials.postgres.name,'LEXIA - Postgres Central Lote 2 TESTE');
  const rebuilt=prepareCrmAgentTest(source);assert.equal(rebuilt.nodes.length,workflow.nodes.length);
  for(const n of workflow.nodes.filter(n=>n.type==='n8n-nodes-base.webhook'))if(n.name!=='LEXIA | Webhook Teste Frappe')assert.equal(n.disabled,true,n.name);
  assert.equal(node('LEXIA | Webhook Teste Frappe').credentials.httpHeaderAuth.name,'LEXIA - Agent Test Frappe');
});

test('test paths cannot reach providers; node centers do not overlap',()=>{
  const visited=new Set();const queue=['LEXIA | Webhook Teste Frappe','LEXIA | Evento interno individual'];
  while(queue.length){const name=queue.shift();if(visited.has(name))continue;visited.add(name);const n=node(name);assert.ok(!n.disabled,name);for(const t of targets(name))queue.push(t);}
  for(const name of ['LEXIA | Enviar whatsapp','LEXIA | Enviar instagram','LEXIA | Enviar messenger','CRM | Enviar evento ao Frappe'])assert.ok(!visited.has(name),name);
  const seen=new Set();
  for(const n of workflow.nodes.filter(n=>!n.disabled&&!n.type.includes('stickyNote'))){const p=JSON.stringify(n.position);assert.ok(!seen.has(p),n.name);seen.add(p);}
  const fields=node('CENTRAL DE CONTROLE').parameters.assignments.assignments;
  assert.equal(fields.find(f=>f.name==='cerebro_teste_revisado').value,false);
  assert.equal(node('Chamar Cérebro do Cliente').parameters.workflowInputs.value.payload,'={{ $json }}');
});

test('the original native Set expressions retain the adapted CRM envelope',async()=>{
  const event=await one('LEXIA | Adaptar teste virtual',{body:request()});
  const refs={'Entrada Unificada':event,'Config Cliente Lexia':config,'CENTRAL DE CONTROLE':controls};
  const op={};
  for(const f of node('Normalizar Dados Operacionais').parameters.assignments.assignments) {
    op[f.name]=typeof f.value==='string'&&f.value.startsWith('={{')
      ?await new AsyncFunction('$','$now','return ('+f.value.trim().slice(3,-2)+');')(name=>({first:()=>({json:refs[name]})}),date)
      :f.value;
  }
  await one('LEXIA | Validar escopo de teste',{},guardRefs(event,op));
  assert.equal(op.modo_teste_workflow,true);
  assert.equal(op.deve_enviar_resposta_real,false);
  assert.equal(op.lexia_body_normalizado._workflow_test_request.run_id,uuid);
});

const frappeSource=fileURLToPath(new URL('../../lexia-frappe-app/lexia_crm/lexia_crm/',import.meta.url));
test('real Frappe pure validators accept generated envelopes (no Frappe service)',{skip:!existsSync(frappeSource+'workflow_tests.py')},async()=>{
  const v=await one('LEXIA | Resultado virtual Frappe',{},virtualRefs([{tipo:'texto',texto:'Hola, quiero ayudarte. ¿Qué horario prefieres?'}]));
  const completed=await one('LEXIA | Devolver resposta virtual',{},resultRefs(request(),v));
  const badLanguage=await one('LEXIA | Resultado virtual Frappe',{},virtualRefs([{tipo:'texto',texto:'Olá, gostaria de agendar sua avaliação amanhã?'}]));
  const blocked=await one('LEXIA | Devolver resposta virtual',{},resultRefs(request(),badLanguage));
  const failed=await one('LEXIA | Validar retorno de teste CRM',{error:'fixture'}, {'LEXIA | Adaptar teste virtual':{body:{_workflow_test_request:request()}}});
  // Extract only pure validation functions; do not import Frappe or its database runtime.
  const python=`import ast, json, re, sys, types
def fail(message, error): raise error(message)
env={'frappe':types.SimpleNamespace(throw=fail,ValidationError=ValueError,PermissionError=PermissionError),'_':lambda s:s,'SECRET_KEY_PATTERN':re.compile(r'token|secret|password|senha|authorization|credential|api[_-]?key',re.I),'MAX_MESSAGE_LENGTH':4000}
for file, names in [('workflow_tests.py',{'_sanitize_result','_validate_test_trace','_validate_test_result'}),('workflow_test_chat.py',{'_assistant_message'})]:
    with open(sys.argv[1]+file) as source: parsed=ast.parse(source.read())
    functions=[n for n in parsed.body if isinstance(n,ast.FunctionDef) and n.name in names]
    assert len(functions)==len(names)
    exec(compile(ast.Module(body=functions,type_ignores=[]),file,'exec'),env)
for result in json.load(sys.stdin):
    env['_validate_test_result'](result,result['run_id'],'omnichannel','full_agent_virtual')
    for message in result['output']['assistant_messages']: env['_assistant_message'](message)
print('3 envelopes accepted by Frappe source validators')`;
  const check=spawnSync('python3',['-c',python,frappeSource],{input:JSON.stringify([completed,blocked,failed]),encoding:'utf8'});
  assert.equal(check.status,0,check.stderr || check.error?.message);
  assert.match(check.stdout,/3 envelopes accepted/);
});
