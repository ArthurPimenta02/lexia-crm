import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleForN8n } from './lib/n8n-code-bundle.mjs';
import { auditWorkflow } from './build-miranda-original-crm.mjs';
import { sql } from './lib/miranda-original-reminder-sql.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const originalNames=['Intervalo 1h','Config Lembretes','Buscar Consultas Próximas','Travas de Lembrete','Enviar Lembrete','Marcar Lembrete Enviado','Pausa Eterna (Lembrete)'];
const id=name=>createHash('sha256').update('miranda-reminder:'+name).digest('hex').slice(0,32);
export function buildReminder(source) {
  if(source.nodes?.length!==7 || originalNames.some(name=>!source.nodes.some(n=>n.name===name)))throw new Error('expected_original_seven_reminder_nodes');
  // Only the reviewed original schedule and names are carried over. No raw
  // HTTP/Redis/credential/config payload is copied into the deliverable.
  const w={name:'MIRANDA - LEMBRETES - LEXIA CRM (BASE ORIGINAL / PREVIA)',active:false,nodes:[],connections:{},settings:{executionOrder:'v1'},pinData:{}};
  const core=bundleForN8n(resolve(ROOT,'scripts/lib/miranda-original-reminder-runtime.mjs'),'Reminder');
  const add=(name,type,parameters,position,typeVersion=2)=>{const n={id:id(name),name,type,typeVersion,parameters,position};w.nodes.push(n);return n;};
  const route=(name,outputs)=>{w.connections[name]={main:outputs.map(names=>names.map(node=>({node,type:'main',index:0})))};};
  const code=(name,js,pos)=>add(name,'n8n-nodes-base.code',{mode:'runOnceForAllItems',jsCode:core+'\n'+js},pos);
  const step=(name,expr,pos)=>code(name,"if($input.all().length!==1)throw new Error('single_reminder_item_required');\nreturn [{json:"+expr+",pairedItem:{item:0}}];",pos);
  const pg=(name,query,replacement,pos)=>{const n=add(name,'n8n-nodes-base.postgres',{operation:'executeQuery',query,options:{queryReplacement:replacement}},pos,2.6);n.credentials={postgres:{name:'LEXIA - Postgres Central Lote 2 TESTE'}};n.retryOnFail=false;n.onError='continueRegularOutput';n.alwaysOutputData=true;return n;};
  const iff=(name,expr,pos)=>add(name,'n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:id(name),leftValue:'={{ '+expr+' }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},pos,2.2);
  const ref=name=>`$('${name}').item.json`;
  const cfg="$('Config Lembretes').first().json";
  const now='$now.toISO()';
  add('Intervalo 1h','n8n-nodes-base.scheduleTrigger',structuredClone(source.nodes.find(n=>n.name==='Intervalo 1h').parameters),[0,0],1.2).disabled=true;
  add('Teste Manual','n8n-nodes-base.manualTrigger',{},[0,240],1);
  const config={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',account_ref:'',test_project_ref:'',delivery_mode:'preview',delivery_workflow_ref:'',delivery_contract_reviewed:false};
  add('Config Lembretes','n8n-nodes-base.set',{assignments:{assignments:Object.entries(config).map(([name,value])=>({id:id(name),name,value,type:typeof value==='boolean'?'boolean':'string'}))},options:{}},[240,0],3.4);
  step('LEXIA | Validar configuracao',`Reminder.validateConfig(${cfg})`,[480,0]);
  pg('LEXIA | Conferir banco de teste',sql.identity,'={{ [] }}',[720,0]);
  step('LEXIA | Identidade confirmada',`Reminder.identity(${cfg},$json.identities)`,[960,0]);
  const apiIdentity=add('LEXIA | Conferir API de teste','n8n-nodes-base.supabase',{operation:'getAll',tableId:'lexia_environment_identity',returnAll:true},[960,240],1);
  apiIdentity.credentials={supabaseApi:{name:'LEXIA - Supabase Central Lote 2 TESTE'}};apiIdentity.alwaysOutputData=true;apiIdentity.retryOnFail=false;
  code('LEXIA | Identidade da API confirmada',`const c=Reminder.identity(${cfg},$input.all().map(i=>i.json));return [{json:c,pairedItem:{item:0}}];`,[1200,240]);
  pg('Buscar Consultas Próximas',sql.search,'={{ [$json.environment,$json.cliente_slug,$json.account_ref] }}',[1200,0]);
  code('LEXIA | Selecionar consultas do teste',`const c=${cfg};
return $input.all().flatMap((item,i)=>{const a=item.json;if(!a.id && !Object.keys(a).length)return [];if(a.environment!==c.environment || a.cliente_slug!==c.cliente_slug)throw new Error('reminder_candidate_list_invalid');return [{json:a,pairedItem:{item:i}}];});`,[1440,0]);
  add('Loop Consultas','n8n-nodes-base.splitInBatches',{batchSize:1,options:{}},[1680,0],3);
  pg('LEXIA | Resolver consulta e conversa',sql.resolve,`={{ [$json.id,$json.conversation_id,${cfg}.environment,${cfg}.cliente_slug,${cfg}.account_ref] }}`,[1920,0]);
  step('LEXIA | Origem confirmada',`Reminder.resolveCandidate(${ref('Loop Consultas')},$json,${cfg})`,[2160,0]);
  step('Travas de Lembrete',`Reminder.eligible($json,${now})`,[2400,0]);
  iff('LEXIA | Lembrete permitido?','$json.ready===true',[2640,0]);
  step('LEXIA | Montar pedido de lembrete',`Reminder.propose($json,${now})`,[2880,-240]);
  pg('LEXIA | Revalidar lembrete',sql.permission,'={{ [$json.conversation_id,$json.scope.environment,$json.scope.cliente_slug,$json.scope.channel,$json.scope.account_ref,$json.scope.conversation_ref,$json.captured_state.state_version,$json.captured_state.delivery_epoch,$json.appointment.id,$json.appointment.appointment_ref,$json.appointment.starts_at,$json.appointment.ends_at,$json.state.language] }}',[3120,-240]);
  step('LEXIA | Permissao atual',`Reminder.permission(${ref('LEXIA | Montar pedido de lembrete')},$json,${now})`,[3360,-240]);
  iff('LEXIA | Chamar entrega comum?',`$json.permitted===true && ${cfg}.delivery_mode==='shared_delivery'`,[3600,-240]);
  step('LEXIA | Previa sem envio',`Reminder.preview($json,${now})`,[4080,40]);
  step('LEXIA | Entrada do Omnichannel','$json.envelope',[3840,-240]);
  const send=add('Enviar Lembrete','n8n-nodes-base.executeWorkflow',{source:'database',workflowId:{__rl:true,value:`={{ ${cfg}.delivery_workflow_ref }}`,mode:'id'},workflowInputs:{mappingMode:'passThrough',value:{}},mode:'each',options:{waitForSubWorkflow:true}},[4080,-240],1.3);
  send.onError='continueRegularOutput';send.retryOnFail=false;send.alwaysOutputData=true;
  step('LEXIA | Conferir recibo',`Reminder.checkReceipt(${ref('LEXIA | Permissao atual')},$json,${now})`,[4320,-240]);
  pg('Marcar Lembrete Enviado',sql.ledger,'={{ [$json.action_id,$json.conversation_id,$json.scope.environment,$json.scope.cliente_slug] }}',[4560,-240]);
  step('LEXIA | Confirmar no livro central',`Reminder.proof(${ref('LEXIA | Conferir recibo')},$json)`,[4800,-240]);
  step('Pausa Eterna (Lembrete)','$json',[5040,-240]);
  w.nodes.at(-1).notes='Nome original conservado. Nao cria, renova nem remove pausa. Estado do agendamento pertence ao contrato central.';
  step('CRM | Preparar resultado de lembrete',`Reminder.events($json,${now},$execution.id)`,[5280,-240]);
  step('LEXIA | Resultado sem envio',"({request_id:$json.request_id,scope:$json.scope,status:$json.status,reason:$json.reason,confirmed:false,crm_delivery_pending:true})",[2880,240]);
  const main=['Intervalo 1h','Config Lembretes','LEXIA | Validar configuracao','LEXIA | Conferir banco de teste','LEXIA | Identidade confirmada','Buscar Consultas Próximas','LEXIA | Selecionar consultas do teste','Loop Consultas'];
  for(let i=1;i<main.length;i++)route(main[i-1],[[main[i]]]);route('Teste Manual',[['Config Lembretes']]);
  route('LEXIA | Identidade confirmada',[['LEXIA | Conferir API de teste']]);route('LEXIA | Conferir API de teste',[['LEXIA | Identidade da API confirmada']]);route('LEXIA | Identidade da API confirmada',[['Buscar Consultas Próximas']]);
  route('Loop Consultas',[[],['LEXIA | Resolver consulta e conversa']]);
  const resolveSteps=['LEXIA | Resolver consulta e conversa','LEXIA | Origem confirmada','Travas de Lembrete','LEXIA | Lembrete permitido?'];
  for(let i=1;i<resolveSteps.length;i++)route(resolveSteps[i-1],[[resolveSteps[i]]]);
  route('LEXIA | Lembrete permitido?',[['LEXIA | Montar pedido de lembrete'],['LEXIA | Resultado sem envio']]);
  const proposalSteps=['LEXIA | Montar pedido de lembrete','LEXIA | Revalidar lembrete','LEXIA | Permissao atual','LEXIA | Chamar entrega comum?'];
  for(let i=1;i<proposalSteps.length;i++)route(proposalSteps[i-1],[[proposalSteps[i]]]);
  route('LEXIA | Chamar entrega comum?',[['LEXIA | Entrada do Omnichannel'],['LEXIA | Previa sem envio']]);
  route('LEXIA | Entrada do Omnichannel',[['Enviar Lembrete']]);route('LEXIA | Previa sem envio',[['LEXIA | Conferir recibo']]);
  const sentSteps=['Enviar Lembrete','LEXIA | Conferir recibo','Marcar Lembrete Enviado','LEXIA | Confirmar no livro central','Pausa Eterna (Lembrete)','CRM | Preparar resultado de lembrete'];
  for(let i=1;i<sentSteps.length;i++)route(sentSteps[i-1],[[sentSteps[i]]]);
  route('CRM | Preparar resultado de lembrete',[['Loop Consultas']]);route('LEXIA | Resultado sem envio',[['Loop Consultas']]);
  for(const [name,content,pos,width,height,color] of [
    ['LEIA PRIMEIRO','## Lembrete original / entrega compartilhada\nINATIVO / PREVIEW. Schedule de 1h preservado e desligado. Somente bancos isolados. Nenhum modelo, Google ou canal e chamado aqui. Configure delivery_workflow_ref para a COPIA do Omnichannel; nao usar producao.',[0,-440],1400,240,4],
    ['REGRAS MIRANDA','## Regras originais\nConfirmado / unico / entre 2h e 24h / 7h-20h Boston, inclusive domingo / pt-en-es. Idioma do contexto da conversa, sem fallback cruzado. Somente pausa do proprio agendamento admite lembrete; demais motivos bloqueiam.',[1920,-520],1700,220,3],
    ['ENVIO E CONFIRMACAO','## Proposta nao e entrega\nEnviar Lembrete chama o Omnichannel. Marcar Lembrete Enviado confere o ledger e a mensagem central, nao escreve flag otimista no banco privado. Pausa Eterna e agora pass-through: nao altera pausa. Incerto exige reconciliacao. Eventos CRM preparados, sem transporte automatico/outbox.',[3840,-640],1800,220,6],
  ])add(name,'n8n-nodes-base.stickyNote',{content,width,height,color},pos,1);
  auditWorkflow(w);return w;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [source,output]=process.argv.slice(2);if(!source || !output)throw new Error('usage: build-miranda-original-reminder.mjs <original.json> <output.json>');
  const w=buildReminder(JSON.parse(readFileSync(source,'utf8')));
  mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(w,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(auditWorkflow(w))+'\n');
}
