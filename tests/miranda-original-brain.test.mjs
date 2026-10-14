import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { bundleForN8n, replaceN8nBundles } from '../scripts/lib/n8n-code-bundle.mjs';
import { buildBrain, validateBrainExport } from '../scripts/build-miranda-original-brain.mjs';

const B=new Function(bundleForN8n('scripts/lib/miranda-original-brain-runtime.mjs','Brain')+'\nreturn Brain;')();
const clone=v=>JSON.parse(JSON.stringify(v));
const a=JSON.parse(readFileSync('tests/fixtures/omnichannel/miranda-brain-call-a.json'));
const b=JSON.parse(readFileSync('tests/fixtures/omnichannel/miranda-brain-call-b.json'));
const w=JSON.parse(readFileSync('n8n/miranda-original-crm/brain-original-crm.inactive.json'));
const node=name=>w.nodes.find(n=>n.name===name);
const now='2026-10-11T16:00:00Z';
const config=p=>({environment:'isolated_test',cliente_slug:p.scope.cliente_slug,account_ref:p.scope.account_ref,private_project_ref:'abcdefghijklmnopqrst',models_reviewed:true,private_data_reviewed:true,calendar_tools_reviewed:false,protected_tool_fingerprints:['00000000'],availability_workflow_ref:'test-availability',create_appointment_workflow_ref:'test-create'});
const accept=(p=clone(a),cfg=config(p))=>B.accept([{json:{payload:p}}],cfg);
const ready=(p=clone(a),row)=>B.restoreMemory(accept(p),row?[row]:[]);
const brief=extra=>({modulo:'atendimento',objectivo:'Responder a duvida atual',factos:['A consulta custa US$ 40.'],pergunta_a_fazer:'',notas_para_redator:'Uma resposta curta.',handoff:{necessario:false,prioridade:'normal'},contexto_actualizado:{},...extra});
const captured=(ctx=ready(),output=brief(),steps=[])=>B.captureTools(ctx,{output:JSON.stringify(output),intermediateSteps:steps});
const nativeResult=(text='A consulta custa US$ 40.')=>({acao:'entregar',modulo:'atendimento',entregas:[{tipo:'texto',texto:text}],handoff:{necessario:false,prioridade:'normal'}});
const shaped=(ctx=ready(),text)=>{const c=captured(ctx);return B.finalize(nativeResult(text),c,B.briefing({briefing:brief()},c),now);};
const memory=(ctx=ready(),text)=>B.memoryWrite(captured(ctx),shaped(ctx,text),now);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=(name,input,refs={})=>new AsyncFunction('$input','$json','$','$now',node(name).parameters.jsCode)({first:()=>({json:input}),all:()=>[{json:input}]},input,n=>({first:()=>({json:refs[n]}),all:()=>[{json:refs[n]}]}),{toISO:()=>now});

test('all thirty original names and the complete specialist/orchestrator/writer structure survive',()=>{
  validateBrainExport(w);assert.equal(w.active,false);assert.equal(w.nodes.length,51);
  for(const name of ['Especialista em Serviços','Orquestrador de Atendimento','Orquestrador de Agendamento','Agente Indefinido','Redator — Voz do Cliente','Preparar Briefing','Montar Saída Final','Pausar Conversa','Notificar Samuel (uazapi)'])assert.ok(node(name),name);
  for(const name of ['Orquestrador de Atendimento','Orquestrador de Agendamento'])assert.match(node(name).parameters.options.systemMessage,/POLÍTICA DE PAGAMENTO/);
  assert.match(node('Especialista em Serviços').parameters.options.systemMessage,/PREÇOS POR VARIANTE/);
  assert.match(node('Orquestrador de Atendimento').parameters.options.systemMessage,/INTERCORRÊNCIA|Intercorrência|intercorrência/);
});
test('original graph and application code agree with the provided reference independent of compiler formatting',()=>{
  const path='/Users/arthurpimenta/Downloads/Miranda Workflows/Cérebro — MIRANDA SKIN EXPERT.json';
  if(!existsSync(path))return;
  const withoutCompilerFormatting=workflow=>({...workflow,nodes:workflow.nodes.map(n=>({...n,parameters:{...n.parameters,...(n.parameters.jsCode?{jsCode:replaceN8nBundles(n.parameters.jsCode,{Brain:'var Brain = {};'} )}:{})}}))});
  assert.deepEqual(withoutCompilerFormatting(buildBrain(JSON.parse(readFileSync(path))).workflow),withoutCompilerFormatting(w));
});
test('no production IDs, credentials, endpoints, HTTP/Redis sends or model calls hidden in Code',()=>{
  for(const n of w.nodes)for(const c of Object.values(n.credentials||{}))assert.deepEqual(Object.keys(c),['name']);
  assert.doesNotMatch(JSON.stringify(w),/supabase\.co|upstash\.io|uazapi\.com|api\.z-api|eyJ[A-Za-z0-9_.-]{30}|sk-[A-Za-z0-9_-]{16}|helpers\.httpRequest|\$env\./);
  assert.equal(node('Pausar Conversa').type,'n8n-nodes-base.code');assert.equal(node('Notificar Samuel (uazapi)').type,'n8n-nodes-base.code');
  for(const name of ['criar_agendamento','verificar_disponibilidade'])assert.doesNotMatch(JSON.stringify(node(name).parameters),/uazapi_token|numero_equipe/);
  assert.match(node('criar_agendamento').parameters.workflowInputs.value.ignorar_duplicado,/APENAS se o cliente confirmou/);
});
test('review controls, test scope, account and tenant reject before private data/models',()=>{
  for(const change of [p=>p.scope.environment='production',p=>p.cliente.slug='other',p=>p.operacao.permitir_envio_real=true,p=>p.operacao.uazapi_token='synthetic-forbidden']){
    const p=clone(a);change(p);assert.throws(()=>accept(p));
  }
  assert.throws(()=>accept(a,{...config(a),models_reviewed:false}),/configure/);
  assert.throws(()=>accept(a,{...config(a),private_data_reviewed:false}),/configure/);
});
test('mixed conversations in one agent call and foreign history are rejected',()=>{
  assert.throws(()=>B.accept([{json:a},{json:b}],config(a)),/one_brain/);
  const p=clone(a);p.historico=[{autor:'cliente',conteudo:'hello',scope:b.scope}];assert.throws(()=>accept(p),/history_scope/);
});
test('identity is private-project and tenant bound, not a credential name',()=>{
  const c=accept();const marker={disposable:true,environment:c.cfg.environment,project_ref:c.cfg.private_project_ref,cliente_slug:c.scope.cliente_slug};
  assert.equal(B.privateIdentity(c,[marker]),c);
  for(const rows of [[],[marker,marker],[{...marker,cliente_slug:b.scope.cliente_slug}],[{...marker,project_ref:'bad'}]])assert.throws(()=>B.privateIdentity(c,rows));
});
test('scoped JSON memory keys cannot collide with separators and equal conversation names',()=>{
  assert.notEqual(B.scopeKey(a.scope),B.scopeKey(b.scope));
  assert.notEqual(B.scopeKey({...a.scope,conversation_ref:'test:x|y'}),B.scopeKey({...a.scope,account_ref:b.scope.account_ref,conversation_ref:'test:y'}));
});
test('memory cannot cross account, company or conversation even with the same captured state',()=>{
  const m=memory();
  assert.throws(()=>B.restoreMemory(accept(b),[m]),/origin/);
  assert.throws(()=>B.restoreMemory(accept(),[m,m]),/ambiguous/);
  assert.throws(()=>B.restoreMemory(accept(),[{error:'synthetic'}]),/origin/);
});
test('a duplicate invocation returns the known proposal without another model/tool round',()=>{
  const m=memory();const restored=ready(clone(a),m);assert.equal(restored.cached,true);assert.deepEqual(restored.result,m.cached_result);
  const p=clone(a);p.mensagem.actual='Outra mensagem';assert.throws(()=>ready(p,m),/invocation_id_conflict/);
  const s=clone(a);s.captured_state.delivery_epoch++;assert.throws(()=>ready(s,m),/invocation_id_conflict/);
});
test('private memory preserves draft, questions and explicit language through an ambiguous next message',()=>{
  const c=ready();const m=memory(c);m.context_json={idioma:'es',agendamento:{slot_escolhido:'synthetic-slot'},perguntas_feitas:['Pergunta ficticia?']};
  const p=clone(a);p.invocation_id='71000000-0000-4000-8000-000000000003';p.mensagem.actual='ok';p.contexto.dados.idioma='pt';
  const out=ready(p,m);assert.equal(out.payload.contexto.dados.idioma,'es');assert.equal(out.payload.contexto.dados.agendamento.slot_escolhido,'synthetic-slot');assert.equal(out.payload.contexto.dados.perguntas_feitas.length,1);
});
test('pt/en/es and the explicit misspelled espanol request are resolved before the writer',()=>{
  for(const [text,lang]of [['Gostaria de ser atendido em espanol','es'],['English','en'],['Quisiera reservar una cita','es'],['Where are you located?','en'],['Buenas tardes','es']]){const p=clone(a);p.mensagem.actual=text;assert.equal(B.leadLanguage(p),lang);}
  const p=clone(b);p.mensagem.actual='<ContextoImagem>Descricao gerada em portugues sobre a pele.</ContextoImagem>';assert.equal(B.leadLanguage(p),'en');
});
test('authorship and history older than thirty messages reach the original entry unchanged',async()=>{
  const p=clone(a);p.historico=Array.from({length:50},(_,i)=>({autor:i===0?'equipe_humana':'cliente',direccao:i===0?'enviada':'recebida',conteudo:'Fato ficticio '+i,criado_em:now}));
  const c=ready(p);const result=await run('Preparar Entrada',{}, {'LEXIA | Entrada e memoria isoladas':c});
  assert.equal(result[0].json.historico.length,50);assert.equal(result[0].json.historico[0].autor,'equipe_humana');assert.match(result[0].json.contexto.dados.intervencao_humana,/prevalecem/);
});
test('history uses chronological instants, not lexical dates across different timezone offsets',()=>{
  const p=clone(a);p.historico=[{autor:'cliente',direccao:'recebida',conteudo:'Mais tarde.',criado_em:'2026-10-11T11:00:00-04:00'},{autor:'cliente',direccao:'recebida',conteudo:'Mais cedo.',criado_em:'2026-10-11T12:00:00Z'}];
  assert.deepEqual(ready(p).payload.historico.map(m=>m.conteudo),['Mais cedo.','Mais tarde.']);
});
test('the original scheduling-in-progress route survives a side question',async()=>{
  const p=clone(a);p.contexto.dados.agendamento={slot_escolhido:'synthetic-slot'};const c=ready(p);
  const r=await run('Preparar Entrada',{}, {'LEXIA | Entrada e memoria isoladas':c});assert.equal(r[0].json.tipo_assunto,'agendamento');
});
test('a string note from the original prompt is no longer silently lost',async()=>{
  const c=captured();const entry=(await run('Preparar Entrada',{}, {'LEXIA | Entrada e memoria isoladas':c}))[0].json;
  const out=await run('Preparar Briefing',{}, {'LEXIA | Resultado e tools atestadas':c,'Preparar Entrada':entry});
  assert.ok(out[0].json.briefing.notas_para_redator.includes('Uma resposta curta.'));
});
test('changing language does not insert Carol introduction again',()=>{
  const p=clone(a);p.mensagem.actual='Gostaria de ser atendido em espanol';p.historico=[{autor:'agente_ia',conteudo:'Sou a Carol da Miranda.',direccao:'enviada',criado_em:now}];
  const r=shaped(ready(p),'Hola! Soy Carol, de Miranda Skin Experts. Claro, podemos continuar en español.');
  assert.doesNotMatch(r.entregas.map(e=>e.texto).join(' '),/soy carol/i);assert.match(r.entregas[0].texto,/español/);
});
test('curly apostrophes and alternate multilingual introductions do not bypass continuity',()=>{
  for(const [message,text]of [['English','I’m Carol from Miranda. We can continue in English.'],['English','My name is Carol. We can continue in English.'],['em espanol','Me llamo Carol. Podemos continuar en español.'],['em portugues','Meu nome é Carol. Como posso ajudar agora?']]){
    const p=clone(a);p.mensagem.actual=message;p.historico=[{autor:'agente_ia',conteudo:'Sou a Carol da Miranda.',direccao:'enviada',criado_em:now}];
    const r=shaped(ready(p),text);assert.ok(r.entregas.length);assert.doesNotMatch(r.entregas.map(e=>e.texto).join(' '),/carol/i);
  }
});
test('a suppressed introduction is not committed as if it had been delivered',()=>{
  const c=ready();const r=shaped(c,'Sou a Carol da Miranda.');assert.equal(B.memoryWrite(captured(c),r,now).context_json.apresentacao_ja_enviada,false);
});
test('proposed questions and suppressed history never become confirmed conversation progress',()=>{
  const p=clone(a);p.contexto.dados.perguntas_feitas=['Pergunta ainda nao entregue?'];p.historico=[{autor:'agente_ia',direccao:'enviada',status:'suppressed',conteudo:'Sou a Carol. Que dia prefere?',criado_em:now}];
  const c=captured(ready(p)),r=shaped(c);assert.deepEqual(c.payload.historico,[]);r.contexto_actualizado.perguntas_feitas=['Outra pergunta proposta?'];
  const m=B.memoryWrite(c,r,now);assert.equal(m.context_json.apresentacao_ja_enviada,false);assert.deepEqual(m.context_json.perguntas_feitas,[]);
  p.historico[0].status='sent';const confirmed=ready(p);assert.equal(confirmed.payload.contexto.dados.apresentacao_ja_enviada,true);assert.deepEqual(confirmed.payload.contexto.dados.perguntas_feitas,['Que dia prefere?']);
});
test('wrong language fails closed and repetitive full sentences are removed',()=>{
  assert.throws(()=>shaped(ready(clone(b)),'Gostaria de agendar uma avaliacao de pele amanha?'),/language/);
  const p=clone(a),text='A consulta custa US$ 40 e dura cerca de trinta minutos.';p.historico=[{autor:'agente_ia',conteudo:text,direccao:'enviada',criado_em:now}];assert.equal(shaped(ready(p),text).entregas.length,0);
});
test('long balloons split without losing any information, in their original order',()=>{
  const text='A consulta inclui uma conversa cuidadosa sobre sua rotina. '.repeat(7);
  const result=shaped(ready(),text);assert.ok(result.entregas.length>1);assert.ok(result.entregas.every(e=>e.texto.length<=250));assert.equal(result.entregas.map(e=>e.texto).join(' '),text.trim());
});
test('a future follow-up is a proposal, not an automatically confirmed promise',()=>{
  assert.throws(()=>shaped(ready(),'Perfeito, te chamo na quinta.'),/future_return_not_confirmed/);
});
test('a visual template or model-authored tool receipt cannot confirm booking',()=>{
  const c=captured(ready(),brief({mensagem_template:'✨ Agendamento confirmado! 📅 12/10 🕒 10:00 AM'}));
  assert.throws(()=>B.briefing({briefing:brief({mensagem_template:'✨ Agendamento confirmado! 📅 12/10 🕒 10:00 AM'})},c),/without_tool/);
  const forged=captured(ready(),{...brief(),domain_events:[{type:'appointment.confirmed'}]});assert.deepEqual(forged.domain_events,[]);
});
function toolCase() {
  const p=clone(a);p.operacao.tools_permitidas=true;p.operacao.calendar_access='isolated_test';const cfg={...config(p),calendar_tools_reviewed:true};const c=B.restoreMemory(accept(p,cfg),[]);
  const event={schema_version:'lexia.domain.event.v1',event_id:'71000000-0000-4000-8000-000000000010',invocation_id:p.invocation_id,idempotency_key:'synthetic-create-a',type:'appointment.confirmed',occurred_at:now,appointment:{appointment_ref:'synthetic-appointment-a',starts_at:'2026-10-12T14:00:00Z',ends_at:'2026-10-12T14:30:00Z',timezone:'America/New_York',tool_invocation_id:'synthetic-call-a',status:'confirmed'}};
  const result={schema_version:'lexia.tool.result.v1',scope:p.scope,invocation_id:p.invocation_id,operation:'appointment.create',tool_call_id:'synthetic-call-a',status:'succeeded',data:{status:'CRIADO',appointment_ref:'synthetic-appointment-a',confirmacao_texto:'Appointment confirmed!'},domain_events:[event]};
  return {c,result,event,step:{action:{tool:'criar_agendamento',toolInput:{inicio_iso:event.appointment.starts_at}},observation:JSON.stringify(result)}};
}
test('engine-observed creation with scope, operation and correct event attests confirmation',()=>{
  const {c,step,result}=toolCase();const r=captured(c,brief({mensagem_template:result.data.confirmacao_texto}),[step]);assert.equal(r.domain_events.length,1);assert.equal(r.tool_audit[0].operation,'appointment.create');
  assert.equal(B.briefing({briefing:brief({mensagem_template:result.data.confirmacao_texto})},r).briefing._lexia_templates.length,1);
});
test('tool scope, invocation, appointment reference, operation, end time and picked slot must agree',()=>{
  for(const change of [r=>r.scope=b.scope,r=>r.invocation_id=b.invocation_id,r=>r.data.appointment_ref='other',r=>r.operation='availability.check',r=>delete r.domain_events[0].appointment.ends_at,r=>r.domain_events[0].appointment.status='cancelled']){
    const {c,result,step}=toolCase();change(result);step.observation=JSON.stringify(result);assert.throws(()=>captured(c,brief(),[step]));
  }
  const {c,step}=toolCase();step.action.toolInput.inicio_iso='2026-10-12T15:00:00Z';assert.throws(()=>captured(c,brief(),[step]),/slot/);
});
test('unknown tool results are never converted into safe retry or appointment confirmation',()=>{
  const {c,result,step}=toolCase();result.status='unknown';result.domain_events=[];step.observation=JSON.stringify(result);assert.throws(()=>captured(c,brief(),[step]),/requires_reconciliation/);
});
test('native workflow item-array tool observations remain supported without arbitrary first-item selection',()=>{
  const {c,result,step}=toolCase();step.observation=JSON.stringify([{json:result}]);assert.equal(captured(c,brief(),[step]).domain_events.length,1);
  step.observation=JSON.stringify([{json:result},{json:result}]);assert.throws(()=>captured(c,brief(),[step]),/receipt_invalid/);
});
test('memory update requires version CAS and a confirmed native database response',()=>{
  const c=captured(),r=shaped(c),m=B.memoryWrite(c,r,now);assert.deepEqual(B.memoryCommitted(c,m,[m]),r);
  for(const rows of [[],[m,m],[{...m,version:9}],[{...m,scope_json:b.scope}],[{error:'synthetic'}]])assert.throws(()=>B.memoryCommitted(c,m,rows),/unconfirmed/);
  assert.equal(node('LEXIA | Atualizar memoria por versao').parameters.matchType,'allFilters');assert.equal(node('LEXIA | Atualizar memoria por versao').parameters.filters.conditions.length,2);
});
test('private progression clears only its own draft after an attested creation',()=>{
  const {c,result,step}=toolCase();const t=captured(c,brief(),[step]);const r=B.finalize(nativeResult('Tudo certo.'),t,B.briefing({briefing:brief()},t),now);const m=B.memoryWrite(t,r,now);
  assert.deepEqual(m.context_json.agendamento,{});assert.equal(m.context_json.ultimo_agendamento.appointment_ref,result.data.appointment_ref);assert.match(m.context_json.ultimo_agendamento.slot_escolhido,/AM/);
});
test('original price hallucination guard and confirmation guard still execute in the actual Code',async()=>{
  const c=captured(),entry=(await run('Preparar Entrada',{}, {'LEXIA | Entrada e memoria isoladas':c}))[0].json;
  const pack=B.briefing({briefing:brief(),mensagem_actual:a.mensagem.actual,historico:[],idioma:'pt'},c);
  const out=await run('Montar Saída Final',{output:JSON.stringify({mensagens:['A consulta custa US$ 999.']})},{'Preparar Briefing':pack,'Preparar Entrada':entry});
  const parsed=JSON.parse(out[0].json.output);assert.doesNotMatch(JSON.stringify(parsed.entregas),/999/);assert.equal(parsed.handoff.necessario,true);
});
test('no-calendar route does not reach the production calendar tools',()=>{
  const links=w.connections['LEXIA | Agenda de teste autorizada?'].main;assert.equal(links[1][0].node,'Agendamento sem agenda conectada');
  for(const name of ['criar_agendamento','verificar_disponibilidade'])assert.equal(w.connections[name].ai_tool[0].some(e=>e.node==='Agendamento sem agenda conectada'),false);
});
test('all nodes keep stable nonoverlapping centers and direct side effects are delegated',async()=>{
  const centers=w.nodes.filter(n=>n.type!=='n8n-nodes-base.stickyNote').map(n=>JSON.stringify(n.position));assert.equal(new Set(centers).size,centers.length);
  const h=await run('Preparar Handoff',{handoff:{necessario:true,prioridade:'urgente'}});assert.equal(h[0].json.enviar,'nao');assert.equal(h[0].json.pausar,'nao');
});
