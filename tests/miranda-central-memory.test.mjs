import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundleForN8n } from '../scripts/lib/n8n-code-bundle.mjs';
import { centralMemoryBrain } from '../scripts/lib/miranda-central-memory.mjs';
import { contextAgentPrompt } from '../scripts/build-miranda-original-crm.mjs';
import { load, virtual } from '../scripts/lib/miranda-shared-delivery-sql.mjs';
const B=new Function(bundleForN8n('scripts/lib/miranda-original-brain-runtime.mjs','Brain')+'return Brain;')();
const fixture=JSON.parse(readFileSync('tests/fixtures/omnichannel/miranda-brain-call-a.json'));
const config={memory_backend:'central',central_project_ref:'abcdefghijklmnopqrst',catalog_read_only:true,environment:fixture.scope.environment,cliente_slug:fixture.scope.cliente_slug,account_ref:fixture.scope.account_ref,models_reviewed:true,private_data_reviewed:true,calendar_tools_reviewed:false};
test('central memory requires explicit central identity, not a fake private database',()=>{
  const ctx=B.accept([{json:fixture}],config);
  assert.equal(B.privateIdentity(ctx,[{project_ref:config.central_project_ref,environment:config.environment,authorized:true}]),ctx);
  assert.throws(()=>B.privateIdentity(ctx,[{project_ref:'other',environment:config.environment,authorized:true}]));
  assert.throws(()=>B.accept([{json:fixture}],{...config,catalog_read_only:false}));
});
test('operational central memory excludes raw private fields and rejects nested provider state',()=>{
  assert.deepEqual(B.operationalMemory({idioma:'es',system_prompt:'private',tool_state:{raw:'private'},perguntas_feitas:['Pregunta?']}),{idioma:'es',perguntas_feitas:['Pregunta?']});
  assert.throws(()=>B.operationalMemory({agendamento:{calendar_id:'private'}}),/private_data/);
});
test('memory overlay preserves original intelligence, graph and geometry; private catalog is GET only',()=>{
  const w=JSON.parse(readFileSync('n8n/miranda-migration-review/02-cerebro.inactive.json'));
  const out=centralMemoryBrain(w,process.cwd());
  assert.deepEqual(out.connections,w.connections);
  for(const n of out.nodes)assert.deepEqual(n.position,w.nodes.find(x=>x.name===n.name).position);
  for(const name of ['Especialista em Serviços','Orquestrador de Atendimento','Redator — Voz do Cliente'])assert.deepEqual(out.nodes.find(n=>n.name===name).parameters,w.nodes.find(n=>n.name===name).parameters);
  const catalog=out.nodes.filter(n=>n.type.startsWith('n8n-nodes-base.supabase'));
  assert.equal(catalog.length,6);assert.ok(catalog.every(n=>n.parameters.operation==='getAll'));
  assert.equal(out.nodes.filter(n=>n.type==='n8n-nodes-base.postgres').length,4);
});
test('central memory restore rejects foreign conversation/tenant and stale cached state',()=>{
  const ctx=B.accept([{json:fixture}],config);
  const row={memory_key:ctx.memory_key,scope_json:ctx.scope,version:1,context_json:{idioma:'pt'},last_invocation_id:fixture.invocation_id,last_request_identity:ctx.request_identity,cached_result:{scope:ctx.scope,captured_state:fixture.captured_state}};
  assert.equal(B.restoreMemory(ctx,[row]).cached,true);
  assert.throws(()=>B.restoreMemory(ctx,[{...row,scope_json:{...ctx.scope,conversation_ref:'test:other'}}]));
  assert.throws(()=>B.restoreMemory(ctx,[{...row,scope_json:{...ctx.scope,cliente_slug:'other'}}]));
  assert.throws(()=>B.restoreMemory(ctx,[{...row,cached_result:{...row.cached_result,captured_state:{state_version:999,delivery_epoch:999}}}]));
});
test('ingress echo join can reference both earlier tables without comma-join precedence',()=>{
  const w=JSON.parse(readFileSync('n8n/miranda-migration-review/01-omnichannel.inactive.json'));
  const sql=w.nodes.find(n=>n.name==='LEXIA | Persistir evento e mensagem').parameters.query;
  assert.match(sql,/FROM e CROSS JOIN p LEFT JOIN public.lexia_outbound_actions/);
  assert.doesNotMatch(sql,/FROM e,p LEFT JOIN/);
  assert.match(sql,/r\.out_duplicate AS ingress_duplicate/);
  assert.doesNotMatch(w.nodes.find(n=>n.name==='Buscar Contacto').parameters.query,/telefone,canal/);
});
test('context prompt is complete and its expression has only one closing delimiter',()=>{
  const expression=contextAgentPrompt();assert.equal(expression.match(/}}/g).length,1);
  const p={prompt_template:'synthetic',scope:fixture.scope,context_call_id:fixture.invocation_id,config_version:'same-version',source_message_ids:['synthetic-message']};
  const output=new Function('$','return ('+expression.slice(3,-2)+')')(()=>({first:()=>({json:p})}));
  assert.match(output,/"schema_version":"lexia.context.result.v1"/);assert.match(output,/"scheduling_intent"/);
});
test('delivery selects the latest summary and virtual persistence uses an atomic receipt function',()=>{
  for(const kind of ['reply','followup','appointment_reminder','appointment_confirmation']) {
    assert.match(load(kind),/LEFT JOIN LATERAL[\s\S]*ORDER BY x.context_version DESC LIMIT 1/);
    assert.match(virtual(kind),/lexia_migration_record_virtual\(action.id\)/);
    assert.doesNotMatch(virtual(kind),/tagged AS \(UPDATE public.lexia_mensagens/);
  }
  const sql=readFileSync('supabase/review/miranda-migration/202610120007_virtual_message_receipt.sql','utf8');
  assert.match(sql,/s\.environment='isolated_test'/);assert.match(sql,/a\.captured_state_version/);
  assert.match(sql,/revoke all[\s\S]*from public,anon,authenticated/);
  const origins=readFileSync('supabase/review/miranda-migration/202610120008_message_origins.sql','utf8');
  for(const origin of ['workflow','humano','recebida_na_pausa','teste_workflow','followup_agente'])assert.ok(origins.includes("'"+origin+"'"));
  assert.ok(origins.indexOf('validate constraint')<origins.indexOf('drop constraint'));
});
