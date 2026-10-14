import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { bundleForN8n } from '../scripts/lib/n8n-code-bundle.mjs';
import { readOnlyPreflight } from '../scripts/lib/miranda-calendar-readonly-sql.mjs';

const read=p=>JSON.parse(readFileSync(p,'utf8'));
const B=new Function(bundleForN8n('scripts/lib/miranda-original-brain-runtime.mjs','Brain')+'\nreturn Brain;')();
const C=new Function(bundleForN8n('scripts/lib/miranda-calendar-tools-runtime.mjs','Calendar')+'\nreturn Calendar;')();
const w=read('n8n/miranda-original-crm/omnichannel-readonly-crm.inactive.json');
const brain=read('n8n/miranda-original-crm/brain-readonly-crm.inactive.json');
const node=name=>w.nodes.find(n=>n.name===name);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const id='11111111-1111-4111-8111-111111111111';
const request=()=>({schema_version:'lexia.workflow.test.request.v1',run_id:id,target:'omnichannel',delivery_mode:'simulate',execution_mode:'full_agent_virtual',tool_policy:{calendar:'test_read_only'},scope:{environment:'isolated_test',cliente_slug:'empresa_sintetica_a',channel:'whatsapp',account_ref:'24000000-0000-4000-8000-000000000001',conversation_ref:'test:SYNTH-LEXIA-TEST-CHAT-'+id},input:{message_id:'test-message:'+id,type:'text',text:'Quais horarios tem amanha?'},expectations:{provider_send:false,persist_synthetic_events:true,return_trace:true}});
const run=async(name,input,refs={})=>(await new AsyncFunction('$input','$json','$','$now',node(name).parameters.jsCode)({all:()=>[{json:input}],first:()=>({json:input})},input,key=>{if(!(key in refs))throw Error('unexecuted');return {first:()=>({json:refs[key]})};},{toISO:()=> '2026-10-12T12:00:00Z'}))[0].json;
test('CRM ingress accepts read-only, denies writes and still requires trusted controls',async()=>{
  const req=request(),event=await run('LEXIA | Adaptar teste virtual',{body:req});
  const op={canal:'whatsapp',lexia_session_id:req.scope.conversation_ref.slice(5),lexia_run_id:id,mensagem_id_externo:req.input.message_id,conteudo_mensagem:req.input.text,from_me:false};
  const cfg={environment:'isolated_test',cliente_slug:req.scope.cliente_slug,test_account_ref:req.scope.account_ref,test_project_ref:'abcdefghijklmnopqrst'};
  const ctrl={permitir_teste_plataforma:true,permitir_envio_real:false,permitir_tools_teste:true,permitir_notificacao_handoff:false,agenda_somente_leitura_revisada:true};
  const refs={'Entrada Unificada':event,'Normalizar Dados Operacionais':op,'Config Cliente Lexia':cfg,'CENTRAL DE CONTROLE':ctrl};
  await run('LEXIA | Validar escopo de teste',{},refs);
  await assert.rejects(()=>run('LEXIA | Validar escopo de teste',{}, {...refs,'CENTRAL DE CONTROLE':{...ctrl,agenda_somente_leitura_revisada:false}}),/not_reviewed/);
  req.tool_policy.calendar='test_read_write';await assert.rejects(()=>run('LEXIA | Adaptar teste virtual',{body:req}));
  assert.match(node('Preparar Payload Cérebro').parameters.jsCode,/calendar_write_allowed=false/);
});
test('returned read policy is bound to request and reports writes disabled',async()=>{
  const req=request(),refs={'Entrada Unificada':{body:{_workflow_test_request:req}},'LEXIA | Registro individual confirmado':{duplicate:false},'Validar Saída Cérebro Cliente':{acao:'entregar'},'LEXIA | Resultado virtual revalidado':{entregas:[],language:{expected_language:'pt',detected_languages:[]}}};
  const result=await run('LEXIA | Devolver resposta virtual',{},refs);
  assert.equal(result.output.calendar_access,'test_read_only');assert.equal(result.output.calendar_write_attempted,false);
  const parent={'LEXIA | Adaptar teste virtual':{body:{_workflow_test_request:req}}};
  assert.equal((await run('LEXIA | Validar retorno de teste CRM',result,parent)).status,'completed');
  for(const patch of [{calendar_access:'test_read_write'},{calendar_access:'disabled'},{calendar_write_attempted:true}]){
    const bad={...result,output:{...result.output,...patch}};assert.equal((await run('LEXIA | Validar retorno de teste CRM',bad,parent)).status,'failed');
  }
});
test('read-only brain exposes availability but no creation and does not require a creation alias',()=>{
  assert.equal(brain.nodes.find(n=>n.name==='criar_agendamento').disabled,true);assert.equal(brain.connections.criar_agendamento,undefined);
  const p=read('tests/fixtures/omnichannel/miranda-brain-call-a.json');Object.assign(p.operacao,{calendar_access:'isolated_test',tools_permitidas:true,calendar_write_allowed:false});
  const cfg={environment:'isolated_test',cliente_slug:p.scope.cliente_slug,account_ref:p.scope.account_ref,private_project_ref:'abcdefghijklmnopqrst',models_reviewed:true,private_data_reviewed:true,calendar_read_only:true,calendar_tools_reviewed:true,availability_workflow_ref:'isolated-availability',protected_tool_fingerprints:['00000000']};
  const ctx=B.accept([{json:p}],cfg);assert.equal(ctx.cfg.calendar_read_only,true);
  p.operacao.calendar_write_allowed=true;assert.throws(()=>B.accept([{json:p}],cfg),/read_only_calendar_required/);
  assert.throws(()=>B.captureTools(ctx,{intermediateSteps:[{action:{tool:'criar_agendamento'},observation:{}}]}),/read_only_tool_forbidden|origin_mismatch/);
});
test('read preflight keeps full scope, original calendar denylist, batch, projection, policy and pauses without writes',()=>{
  assert.doesNotMatch(readOnlyPreflight,/\b(insert|update|delete|create|alter)\b/i);
  for(const expected of ['state_version','delivery_epoch','projection_status','fencing_token','cutoff_seq','lexia_environment_identity','lexia_omnichannel_policies','lexia_conversation_blocks','jsonb_array_elements_text'])assert.ok(readOnlyPreflight.includes(expected));
  assert.match(readOnlyPreflight,/a\.environment=s\.environment/);assert.match(readOnlyPreflight,/s\.conversation_ref=i\.req/);
});
test('exact personal calendar can be read with consent but never becomes a write destination',()=>{
  const input=read('tests/fixtures/omnichannel/miranda-calendar-availability-call.json');input.lexia_call_context.calendar_write_allowed=false;
  const cfg={environment:'isolated_test',cliente_slug:input.lexia_call_context.scope.cliente_slug,account_ref:input.lexia_call_context.scope.account_ref,project_ref:'abcdefghijklmnopqrst',timezone:'America/New_York',calendar_id:'personal@example.invalid',expected_calendar_id:'personal@example.invalid',blocked_dates:[],protected_calendar_hashes:['0'.repeat(64)],calendar_reviewed:true,allow_calendar_read:true,allow_calendar_write:false,allow_personal_calendar_read:true};
  assert.equal(C.accept([{json:input}],cfg,'availability.check').config.calendar_id,cfg.calendar_id);
  for(const patch of [{allow_personal_calendar_read:false},{allow_calendar_write:true},{calendar_id:'primary'},{expected_calendar_id:'foreign@example.invalid'}])assert.throws(()=>C.accept([{json:input}],{...cfg,...patch},'availability.check'));
  const create=read('tests/fixtures/omnichannel/miranda-calendar-create-call.json');assert.throws(()=>C.accept([{json:create}],{...cfg,allow_calendar_write:true},'appointment.create'));
});
test('Frappe source validators refuse calendar writes, policy swaps and nonisolated reads',()=>{
  const path='/Users/arthurpimenta/Developer/lexia-frappe-app/lexia_crm/lexia_crm/workflow_tests.py';
  const python=`import ast, json, re, types, sys
def fail(message, error): raise error(message)
conf={'lexia_environment':'isolated_test','lexia_workflow_test_calendar_access':'test_read_only'}
env={'frappe':types.SimpleNamespace(conf=conf,throw=fail,PermissionError=PermissionError,ValidationError=ValueError),'_':lambda s:s,'WORKFLOW_TEST_CALENDAR_ACCESS':{'disabled','test_read_only','test_read_write'},'_workflow_test_mode':lambda:'remote','_workflow_test_execution_mode':lambda:'full_agent_virtual','SECRET_KEY_PATTERN':re.compile('secret')}
tree=ast.parse(open(sys.argv[1]).read());names={'_workflow_test_calendar_access','_validate_test_result','_validate_test_trace','_sanitize_result'}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'validators','exec'),env)
assert env['_workflow_test_calendar_access']()=='test_read_only'
for patch in [{'lexia_environment':'production'},{'lexia_workflow_test_calendar_access':'test_read_write'}]:
 old=conf.copy();conf.update(patch)
 try: env['_workflow_test_calendar_access']();raise AssertionError('unsafe accepted')
 except PermissionError: pass
 conf.clear();conf.update(old)
r=json.load(sys.stdin)
env['_validate_test_result'](r,r['run_id'],'omnichannel','full_agent_virtual','test_read_only')
for patch in [{'calendar_access':'disabled'},{'calendar_write_attempted':True}]:
 bad=json.loads(json.dumps(r));bad['output'].update(patch)
 try: env['_validate_test_result'](bad,bad['run_id'],'omnichannel','full_agent_virtual','test_read_only');raise AssertionError('unsafe result')
 except PermissionError: pass
print('read-only policies passed')`;
  const result={schema_version:'lexia.workflow.test.result.v1',run_id:id,target:'omnichannel',status:'completed',provider_send_attempted:false,summary:'fixture',trace:[{step:'virtual',status:'passed'}],output:{simulation_engine:'n8n_full_agent_virtual_v1',calendar_access:'test_read_only',calendar_write_attempted:false,language_policy_status:'passed'}};
  const check=spawnSync('python3',['-c',python,path],{input:JSON.stringify(result),encoding:'utf8'});assert.equal(check.status,0,check.stderr||check.error?.message);
});
