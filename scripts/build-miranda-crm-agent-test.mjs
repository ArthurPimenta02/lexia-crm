import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleForN8n } from './lib/n8n-code-bundle.mjs';
import { auditWorkflow } from './build-miranda-original-crm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = (name) => createHash('sha256').update('crm-agent-test:' + name).digest('hex').slice(0, 32);
const bundle = (file, globalName) => bundleForN8n(resolve(ROOT, file),globalName);

export const runtime = {
  ingress: `
if ($input.all().length !== 1) throw new Error('single_test_request_required');
const req = $json.body;
LexiaSchema.assertContractSchema('workflow-test-request', req);
if (req.target !== 'omnichannel' || req.execution_mode !== 'full_agent_virtual' || req.scope.environment !== 'isolated_test' || !['disabled','test_read_only'].includes(req.tool_policy.calendar)) throw new Error('isolated_virtual_test_required');
if (req.input.message_id !== 'test-message:' + req.run_id) throw new Error('test_message_run_mismatch');
const session = req.scope.conversation_ref.slice(5);
LexiaSchema.assertJsonSchemaValue({type:'string',format:'uuid'}, session.replace(/^SYNTH-LEXIA-TEST-CHAT-/, ''), 'test_conversation');
if (!req.input.text.trim()) throw new Error('empty_test_message');
const timestamp = typeof $now.toISO === 'function' ? $now.toISO() : String($now);
LexiaSchema.assertJsonSchemaValue({type:'string',format:'date-time'}, timestamp, 'received_at');
return [{json:{body:{_workflow_test_request:req,_lexia_transport:'test',_canal:req.scope.channel,
  _provider_timestamp:timestamp,_sender_id:req.scope.conversation_ref,lexia_modo_teste:true,
  lexia_session_id:session,lexia_run_id:req.run_id,lexia_message_id:req.input.message_id,lexia_mensagem:req.input.text,
  message:{type:'text',messageType:'Conversation',text:req.input.text,id:req.input.message_id,fromMe:false}}},pairedItem:{item:0}}];`,
  guard: `
if ($input.all().length !== 1) throw new Error('single_test_event_required');
const body = $('Entrada Unificada').first().json.body;
const req = body?._workflow_test_request;
LexiaSchema.assertContractSchema('workflow-test-request', req);
const cfg = $('Config Cliente Lexia').first().json;
const control = $('CENTRAL DE CONTROLE').first().json;
const op = $('Normalizar Dados Operacionais').first().json;
if (body._lexia_transport !== 'test' || req.execution_mode !== 'full_agent_virtual' || req.target !== 'omnichannel' || !['disabled','test_read_only'].includes(req.tool_policy.calendar)) throw new Error('test_only_workflow');
if (cfg.environment !== 'isolated_test' || req.scope.environment !== cfg.environment || req.scope.cliente_slug !== cfg.cliente_slug || req.scope.account_ref !== cfg.test_account_ref || req.scope.channel !== op.canal) throw new Error('trusted_test_scope_mismatch');
if (req.input.message_id !== 'test-message:' + req.run_id || op.lexia_session_id !== req.scope.conversation_ref.slice(5) || op.lexia_run_id !== req.run_id || op.mensagem_id_externo !== req.input.message_id || op.conteudo_mensagem !== req.input.text || op.from_me !== false) throw new Error('test_event_origin_mismatch');
if (control.permitir_teste_plataforma !== true || control.permitir_envio_real !== false || control.permitir_notificacao_handoff !== false) throw new Error('unsafe_test_controls');
if (req.tool_policy.calendar==='test_read_only' && (control.agenda_somente_leitura_revisada!==true || control.permitir_tools_teste!==true)) throw new Error('read_only_calendar_not_reviewed');
if (control.permitir_tools_teste!==false && control.agenda_somente_leitura_revisada!==true) throw new Error('unsafe_test_controls');
if (!/^[a-z0-9]{20}$/.test(cfg.test_project_ref || '')) throw new Error('configure_disposable_project_ref');
return [{json:op,pairedItem:{item:0}}];`,
  identity: `
const cfg = $('Config Cliente Lexia').first().json;
const sql = $('LEXIA | Conferir banco descartavel').first().json.identities;
const api = $input.all().map(i => i.json).filter(i => Object.keys(i).length);
if (!Array.isArray(sql) || sql.length !== 1 || api.length !== 1) throw new Error('disposable_identity_unavailable');
for (const marker of [sql[0], api[0]]) if (marker.id !== true || marker.project_ref !== cfg.test_project_ref || marker.environment !== 'isolated_test' || marker.disposable !== true) throw new Error('disposable_identity_mismatch');
return [{json:$('LEXIA | Validar escopo de teste').first().json,pairedItem:{item:0}}];`,
  virtual: `
const p = $('Preparar Saída Omnichannel').first().json;
const packet = $('Preparar Pacote de Contexto').first().json;
if (!Array.isArray(p.entregas) || p.entregas.length > 20) throw new Error('virtual_actions_invalid');
for (const action of p.entregas) if (action.tipo !== 'texto' || typeof action.texto !== 'string' || !action.texto.trim() || action.texto.length > 4000) throw new Error('virtual_text_actions_required');
const expected = packet.expected_language || $('Preparar Contexto Activo').first().json.dados.idioma;
if (!['pt','en','es'].includes(expected)) throw new Error('lead_language_unresolved');
const language = LexiaLanguage.validateResponseLanguages(expected, p.entregas.map(e => e.texto));
return [{json:{...p,entregas:language.allowed?p.entregas:[],language,
  status:language.allowed?'completed':'blocked',reason:language.allowed?null:'response_language_mismatch'},pairedItem:{item:0}}];`,
  revalidate: `
const base = $('LEXIA | Resultado virtual Frappe').first().json;
if (typeof $json.permitted !== 'boolean') throw new Error('virtual_permission_result_invalid');
return [{json:$json.permitted?base:{...base,entregas:[],reason:base.reason || 'state_changed'},pairedItem:{item:0}}];`,
  result: `
const req = $('Entrada Unificada').first().json.body._workflow_test_request;
const read = name => {try { return $(name).first().json; } catch { return null; }};
const v = read('LEXIA | Resultado virtual revalidado');
const packet = read('Preparar Pacote de Contexto');
const reg = read('LEXIA | Registro individual confirmado');
const brain = read('Validar Saída Cérebro Cliente');
const blocks = $json.blocks || [];
const reason = v?.reason || (reg?.duplicate?'duplicate':blocks.some(b => b.status === 'active' && (!b.expires_at || Date.parse(b.expires_at)>Date.now()))?'conversation_paused':brain?.acao === 'handoff'?'handoff':'no_automatic_action');
const blocked = reason === 'response_language_mismatch';
const deliveries = v?.entregas || [];
const result = {schema_version:'lexia.workflow.test.result.v1',run_id:req.run_id,target:'omnichannel',
  status:blocked?'blocked':'completed',provider_send_attempted:false,
  summary:blocked?'Resposta retida: idioma diferente do solicitado.':deliveries.length?'Resposta do cerebro entregue somente ao chat de teste.':'Mensagem registrada; nenhuma resposta automatica liberada.',
  ...(blocked?{error_code:reason}:{}),
  trace:[{step:'ingress',status:'passed'},{step:'persistence',status:'passed'},
    {step:'context_and_brain',status:brain?'passed':'simulated',reason:brain?'isolated_brain_path':reason},
    {step:'virtual_delivery',status:blocked?'blocked':deliveries.length?'passed':'simulated',reason}],
  output:{simulation_engine:'n8n_full_agent_virtual_v1',calendar_access:req.tool_policy.calendar,calendar_write_attempted:false,
    delivery_results:v?.delivery_results || [],assistant_messages:deliveries.map((e,i)=>({message_id:'virtual:'+req.run_id+':'+(i+1),type:'text',text:e.texto,sequence:i+1})),
    expected_language:v?.language?.expected_language || packet?.expected_language || 'pt',response_languages:v?.language?.detected_languages || [],
    language_policy_status:blocked?'blocked':'passed',reason,scope:req.scope}};
LexiaSchema.assertContractSchema('workflow-test-result', result);
return [{json:result,pairedItem:{item:0}}];`,
  parent: `
const req = $('LEXIA | Adaptar teste virtual').first().json.body._workflow_test_request;
const fail = () => ({schema_version:'lexia.workflow.test.result.v1',run_id:req.run_id,target:'omnichannel',status:'failed',
  provider_send_attempted:false,summary:'O teste falhou. Confira a execucao filha no n8n; nao repita um envio incerto.',error_code:'agent_execution_failed',
  trace:[{step:'omnichannel',status:'failed',reason:'see_child_execution'}],
  output:{simulation_engine:'n8n_full_agent_virtual_v1',assistant_messages:[],calendar_access:req.tool_policy.calendar,calendar_write_attempted:false}});
let result;
try {
  if ($input.all().length !== 1) throw new Error('single_result_required');
  result = $input.first().json;
  LexiaSchema.assertContractSchema('workflow-test-result', result);
  if (result.run_id !== req.run_id || result.target !== req.target || result.output?.simulation_engine !== 'n8n_full_agent_virtual_v1' || result.output?.calendar_access !== req.tool_policy.calendar || result.output?.calendar_write_attempted !== false) throw new Error('test_result_origin_mismatch');
  if (!result.output.scope || ['environment','cliente_slug','channel','account_ref','conversation_ref'].some(k => result.output.scope[k] !== req.scope[k])) throw new Error('test_result_scope_mismatch');
  if (result.status === 'blocked' && result.error_code !== 'response_language_mismatch') throw new Error('unsupported_block');
  if (result.status === 'completed' && result.output.language_policy_status !== 'passed') throw new Error('language_not_validated');
  const messages = result.output.assistant_messages;
  if (!Array.isArray(messages) || messages.length > 20) throw new Error('invalid_virtual_messages');
  for (const [i,m] of messages.entries()) if (Object.keys(m).some(k=>!['message_id','type','text','sequence'].includes(k)) || m.type !== 'text' || typeof m.text !== 'string' || !m.text.trim() || m.text.length>4000 || m.sequence !== i+1 || m.message_id !== 'virtual:'+req.run_id+':'+(i+1)) throw new Error('invalid_virtual_message');
  if (result.status !== 'completed' && messages.length) throw new Error('messages_on_failed_result');
} catch { result = fail(); }
LexiaSchema.assertContractSchema('workflow-test-result', result);
return [{json:result,pairedItem:{item:0}}];`,
};

export function prepareCrmAgentTest(source,{calendarReadOnly=false}={}) {
  const w = structuredClone(source);
  const node = name => {const n=w.nodes.find(n=>n.name===name);if(!n)throw new Error('missing_original_node:'+name);return n;};
  const route = (from, outputs) => {w.connections[from]={main:outputs.map(names=>names.map(name=>({node:name,type:'main',index:0})))};};
  const add = (name,type,parameters,position,typeVersion=2) => {const n={id:id(name),name,type,typeVersion,parameters,position};w.nodes.push(n);return n;};
  const schema = bundle('lib/omnichannel/schema-validator.ts','LexiaSchema');
  const language = bundle('lib/omnichannel/language-policy.ts','LexiaLanguage');
  const code = (name, js, prelude='') => {node(name).parameters={mode:'runOnceForAllItems',jsCode:prelude+'\n'+js};};
  const set = (name,key,value,type='string') => {
    const fields=node(name).parameters.assignments.assignments;
    const field=fields.find(f=>f.name===key);
    if(field)field.value=value;else fields.push({id:id(key),name:key,value,type});
  };
  delete w.id;delete w.versionId;delete w.activeVersionId;delete w.meta;delete w.pinData;
  w.active=false;w.name='MIRANDA SKIN EXPERT - OMNICHANNEL - LEXIA CRM TESTE (BASE ORIGINAL)';
  for(const n of w.nodes) {
    for(const cred of Object.values(n.credentials || {})) delete cred.id;
    if(n.type==='n8n-nodes-base.postgres')n.credentials={postgres:{name:'LEXIA - Postgres Central Lote 2 TESTE'}};
    if(n.type==='n8n-nodes-base.webhook' && n.name!=='LEXIA | Webhook Teste Frappe') {n.disabled=true;delete w.connections[n.name];delete n.credentials;}
    if(n.type==='n8n-nodes-base.httpRequest' && /(?:Enviar|Send|send|Notificar)/.test(n.name)) {n.disabled=true;delete n.credentials;}
  }
  node('LEXIA | Webhook Teste Frappe').credentials={httpHeaderAuth:{name:'LEXIA - Agent Test Frappe'}};
  node('LEXIA | Webhook Teste Frappe').parameters.path='lexia-miranda-crm-agent-test-original-v2';
  delete node('LEXIA | Webhook Teste Frappe').webhookId;
  set('Config Cliente Lexia','cliente_slug','empresa_sintetica_a');
  set('Config Cliente Lexia','test_account_ref','24000000-0000-4000-8000-000000000001');
  set('Config Cliente Lexia','test_project_ref','gaofupndxgitonfmvpzi');
  set('Config Cliente Lexia','environment','isolated_test');
  set('Config Cliente Lexia','workflow_template_version','miranda_original_crm_test_v2');
  for(const key of ['permitir_envio_real','permitir_tools_teste','permitir_notificacao_handoff'])set('CENTRAL DE CONTROLE',key,false,'boolean');
  set('CENTRAL DE CONTROLE','agenda_somente_leitura_revisada',calendarReadOnly,'boolean');
  set('CENTRAL DE CONTROLE','permitir_tools_teste',calendarReadOnly,'boolean');
  set('CENTRAL DE CONTROLE','cerebro_teste_revisado',false,'boolean');
  code('LEXIA | Adaptar teste virtual',runtime.ingress,schema);
  const call=node('LEXIA | Chamar teste neste omnichannel');
  call.onError='continueRegularOutput';call.alwaysOutputData=true;call.retryOnFail=false;
  add('LEXIA | Validar retorno de teste CRM','n8n-nodes-base.code',{mode:'runOnceForAllItems',jsCode:schema+'\n'+runtime.parent},[-9664,-2016]);
  node('LEXIA | Responder teste Frappe').position=[-9408,-2016];
  node('Sticky Note1').parameters.width=1550;
  route(call.name,[['LEXIA | Validar retorno de teste CRM']]);
  route('LEXIA | Validar retorno de teste CRM',[['LEXIA | Responder teste Frappe']]);
  add('LEXIA | Validar escopo de teste','n8n-nodes-base.code',{mode:'runOnceForAllItems',jsCode:schema+'\n'+runtime.guard},[-8832,-2000]);
  const pg=add('LEXIA | Conferir banco descartavel','n8n-nodes-base.postgres',{operation:'executeQuery',query:"SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) AS identities FROM public.lexia_environment_identity i;",options:{}},[-8576,-2000],2.6);
  pg.credentials={postgres:{name:'LEXIA - Postgres Central Lote 2 TESTE'}};
  const api=add('LEXIA | Conferir API descartavel','n8n-nodes-base.supabase',{operation:'getAll',tableId:'lexia_environment_identity',returnAll:true},[-8320,-2000],1);
  api.credentials=structuredClone(node('LEXIA | Configuracao de contexto').credentials);api.alwaysOutputData=true;
  add('LEXIA | Identidade de teste confirmada','n8n-nodes-base.code',{mode:'runOnceForAllItems',jsCode:runtime.identity},[-8064,-2000]);
  node('Sticky Note2').parameters.height=650;
  route('Normalizar Dados Operacionais',[['LEXIA | Validar escopo de teste']]);
  route('LEXIA | Validar escopo de teste',[['LEXIA | Conferir banco descartavel']]);
  route('LEXIA | Conferir banco descartavel',[['LEXIA | Conferir API descartavel']]);
  route('LEXIA | Conferir API descartavel',[['LEXIA | Identidade de teste confirmada']]);
  route('LEXIA | Identidade de teste confirmada',[['LEXIA | Preparar registro individual']]);
  const record=node('LEXIA | Preparar registro individual');
  record.parameters.jsCode=record.parameters.jsCode.replace("telefone:op.canal === 'whatsapp' ? String(op.telefone || '') : ''", "telefone:transport !== 'test' && op.canal === 'whatsapp' ? String(op.telefone || '') : ''");
  const packet=node('Preparar Pacote de Contexto');
  packet.parameters.jsCode=language+'\nif($("CENTRAL DE CONTROLE").first().json.cerebro_teste_revisado!==true)throw new Error("review_isolated_brain_before_model");\nconst items = await (async()=>{'+packet.parameters.jsCode+'})();\nconst prev = $("LEXIA | Estado e contexto duraveis").first().json.context?.operational_context?.language?.split("-")[0];\nfor(const i of items) {i.json.expected_language=LexiaLanguage.resolveLeadLanguage(i.json.mensagem_actual,["pt","en","es"].includes(prev)?prev:null);}\nreturn items;';
  const context=node('Preparar Contexto Activo');
  context.parameters.jsCode='const items=await(async()=>{'+context.parameters.jsCode+'})();\nconst expected=$("Preparar Pacote de Contexto").first().json.expected_language;\nfor(const i of items){if(expected){i.json.dados.idioma=expected;i.json.operational_context.language=expected;}}\nreturn items;';
  const payload=node('Preparar Payload Cérebro');
  payload.parameters.jsCode='const items=await(async()=>{'+payload.parameters.jsCode+'})();\nconst req=$("Entrada Unificada").first().json.body._workflow_test_request;const control=$("CENTRAL DE CONTROLE").first().json;const readOnly=req.tool_policy.calendar==="test_read_only"&&control.agenda_somente_leitura_revisada===true&&control.permitir_tools_teste===true;\nfor(const i of items){i.json.operacao.calendar_access=readOnly?"isolated_test":"disabled";i.json.operacao.tools_permitidas=readOnly;i.json.operacao.calendar_write_allowed=false;}\nreturn items;';
  node('Chamar Cérebro do Cliente').parameters.workflowInputs={mappingMode:'defineBelow',value:{payload:'={{ $json }}'},matchingColumns:['payload'],schema:[{id:'payload',displayName:'payload',required:false,defaultMatch:false,display:true,canBeUsedToMatch:true,removed:false}],attemptToConvertTypes:false,convertFieldsToString:true};
  code('LEXIA | Resultado virtual Frappe',runtime.virtual,language);
  const persist=node('LEXIA | Persistir resposta no canal virtual');
  persist.parameters.options.queryReplacement=persist.parameters.options.queryReplacement.replace('$("Preparar Saída Omnichannel").first().json.entregas','$("LEXIA | Resultado virtual Frappe").first().json.entregas');
  code('LEXIA | Resultado virtual revalidado',runtime.revalidate);
  code('LEXIA | Devolver resposta virtual',runtime.result,schema);
  // Test chat projects the response in Frappe itself, never in the operational inbox.
  route('CRM | Ler espelho da conversa',[['LEXIA | Devolver resposta virtual']]);
  for(const name of ['CRM | Montar eventos idempotentes','CRM | Espelhar eventos em ordem','CRM | Enviar evento ao Frappe','CRM | Confirmar espelho'])node(name).disabled=true;
  route('É Teste Workflow? - Saída Genérica',[['LEXIA | Resultado virtual Frappe'],['LEXIA | Bloquear tools reais no teste']]);
  node('LEXIA | CONFIGURAR ANTES DO TESTE').parameters.content='## Copia exclusiva para Agent Test do Frappe\nPreserva os ramos originais, buffer, historico e contexto. Entrada/retorno seguem workflow-test-request/result.v1. WhatsApp, Meta e espelho operacional estao desligados nesta copia.\n\n1. Selecione Postgres Central Lote 2 TESTE, nunca o Postgres Miranda de producao. Supabase e Postgres precisam apontar ao mesmo projeto descartavel (test_project_ref). A identidade e conferida antes de gravar.\n2. Config Cliente Lexia usa tenant e conta sinteticos do manifesto; confira os mesmos valores no servidor Frappe. Prompt/politica/conta devem existir no banco de teste.\n3. Selecione cerebro isolado, com tools reais removidas/desligadas. Depois revise e marque cerebro_teste_revisado. Envio, tools e handoff externo continuam desligados.\n4. Credencial Agent Test Frappe: header Authorization, valor Bearer + token exclusivo igual ao configurado no servidor CRM. Segredos apenas em credenciais.\n5. Publique somente esta copia e configure a URL de producao deste webhook no target omnichannel do CRM. Este trabalho nao importa/publica nada.';
  node('LEXIA | VERIFICACAO LOCAL').parameters.content='## Limites de verificacao\nValidacao local: contrato, escopo, idioma, retorno de erro, bloqueio de provedores e sintaxe dos nodes. Consulte README e testes para resultados desta rodada.\n\nNenhum node foi executado no n8n. Nenhum SQL, servico ou modelo foi chamado nesta rodada. Credenciais por nome, selecao do cerebro e configuracao server-side do Frappe exigem conferencia. O teste de texto nao verifica midia nem agendamento real. Follow-up e pipeline ficam para a proxima etapa.';
  node('LEXIA | ENTREGA E CRM').parameters.content='## Canal virtual, sem envio real\nO cerebro recebe historico e contexto versionado. Resposta passa pelo filtro de idioma e pela revalidacao de estado antes do registro virtual. Frappe recebe o envelope de teste e projeta as bolhas na area Agent Test, separada das conversas reais.\n\nFalha de credencial, SQL, modelo ou cerebro retorna failed, sem expor dados brutos. Timeout do transporte pode ocorrer apos processamento: nao significa que nada foi gravado; nao repetir automaticamente com outro run_id.\n\nOs ramos de entrega real e espelho operacional foram conservados como referencia, mas desconectados/desligados. Follow-ups, agenda, lembretes e pipeline nao sao habilitados por este arquivo.';
  if(calendarReadOnly){
    w.name='MIRANDA - OMNICHANNEL CRM - AGENDA SOMENTE LEITURA';
    node('LEXIA | CONFIGURAR ANTES DO TESTE').parameters.content='## Agent Test / disponibilidade real de teste\nImportar como COPIA, nunca substituir Miranda ativa. CRM autoriza test_read_only; CENTRAL DE CONTROLE permite somente tools de leitura. calendar_write_allowed permanece false. Selecione cerebro SOMENTE LEITURA e a nova disponibilidade. Configure Postgres/Supabase/Redis HML, modelos e memoria isolada; revise cerebro_teste_revisado. Webhook usa Agent Test Frappe. Canais, notificacoes e criacao de agenda permanecem bloqueados. Leia AGENDA_SOMENTE_LEITURA.md.';
  }
  auditWorkflow(w);
  return w;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [sourcePath,outputPath]=process.argv.slice(2);
  if(!sourcePath||!outputPath)throw new Error('usage: build-miranda-crm-agent-test.mjs <source.json> <output.json>');
  const w=prepareCrmAgentTest(JSON.parse(readFileSync(sourcePath,'utf8')));
  mkdirSync(dirname(resolve(outputPath)),{recursive:true});writeFileSync(outputPath,JSON.stringify(w,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(auditWorkflow(w))+'\n');
}
