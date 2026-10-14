import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleForN8n } from './lib/n8n-code-bundle.mjs';
import { auditWorkflow } from './build-miranda-original-crm.mjs';
import { sql, load, gate, virtual } from './lib/miranda-shared-delivery-sql.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const id=name=>createHash('sha256').update('miranda-shared:'+name).digest('hex').slice(0,32);
const bundle=(file,name)=>bundleForN8n(resolve(ROOT,file),name);
const uuidSql=hash=>`(substr(${hash},1,8)||'-'||substr(${hash},9,4)||'-4'||substr(${hash},14,3)||'-8'||substr(${hash},18,3)||'-'||substr(${hash},21,12))::uuid`;

export function buildSharedDelivery(source) {
  const w=structuredClone(source);
  w.name='MIRANDA - OMNICHANNEL - LEXIA CRM (BASE ORIGINAL / ENTREGA COMUM)';w.active=false;
  delete w.id;delete w.versionId;delete w.activeVersionId;delete w.pinData;
  const node=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw new Error('missing_node:'+name);return n;};
  const add=(name,type,parameters,position,typeVersion=2)=>{if(w.nodes.some(n=>n.name===name))throw new Error('duplicate_node');const n={id:id(name),name,type,typeVersion,parameters,position};w.nodes.push(n);return n;};
  const route=(name,outputs)=>{w.connections[name]={main:outputs.map(names=>names.map(n=>({node:n,type:'main',index:0})))};};
  const core=bundle('scripts/lib/miranda-shared-delivery.mjs','SharedDelivery');
  const code=(name,js,pos)=>add(name,'n8n-nodes-base.code',{mode:'runOnceForAllItems',jsCode:js},pos);
  const transition=(name,expression,pos)=>code(name,core+'\nif($input.all().length!==1)throw new Error("single_delivery_item_required");\nconst p='+expression+';return [{json:p,pairedItem:{item:0}}];',pos);
  const pg=(name,query,replacement,pos)=>{const n=add(name,'n8n-nodes-base.postgres',{operation:'executeQuery',query,options:{queryReplacement:replacement}},pos,2.6);n.credentials={postgres:{name:'LEXIA - Postgres Central Lote 2 TESTE'}};n.retryOnFail=false;n.onError='continueRegularOutput';n.alwaysOutputData=true;return n;};
  const iff=(name,expr,pos)=>add(name,'n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:id(name),leftValue:'={{ '+expr+' }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},pos,2.2);
  const ref=name=>`$('${name}').item.json`;
  const now='$now.toISO()';
  const sqlChoice=fn=>'={{ '+JSON.stringify(['reply','followup','appointment_reminder','appointment_confirmation'].map(kind=>fn(kind)))+'[({reply:0,followup:1,appointment_reminder:2,appointment_confirmation:3})[$json.request.kind]] }}';
  code('ENTREGA | Separar atendimento e pedido',`if($input.all().length!==1)throw new Error('single_internal_item_required');
const supported=['lexia.followup.delivery.request.v1','lexia.automation.delivery.request.v1','lexia.delivery.plan.request.v1'];
return [{json:{...$json,_shared_delivery:supported.includes($json.schema_version)},pairedItem:{item:0}}];`,[-8624,-3376]);
  iff('ENTREGA | Pedido de envio?','$json._shared_delivery===true',[-8368,-3376]);
  route('LEXIA | Evento interno individual',[['ENTREGA | Separar atendimento e pedido']]);
  route('ENTREGA | Separar atendimento e pedido',[['ENTREGA | Pedido de envio?']]);
  route('ENTREGA | Pedido de envio?',[['Config Entrega Compartilhada'],['Entrada Unificada']]);
  const config={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',account_ref:'24000000-0000-4000-8000-000000000001',test_project_ref:'gaofupndxgitonfmvpzi',delivery_mode:'virtual',provider_reviewed:false,zapi_base_url:'',media_bindings:{},media_hosts:[]};
  add('Config Entrega Compartilhada','n8n-nodes-base.set',{assignments:{assignments:[{id:id('cfg'),name:'_delivery_config',type:'object',value:config}]},includeOtherFields:true,options:{}},[-8112,-3376],3.4);
  transition('ENTREGA | Validar contrato e origem',`SharedDelivery.accept(Object.fromEntries(Object.entries($json).filter(([k])=>!['_shared_delivery','_delivery_config'].includes(k))),$json._delivery_config,${now})`,[-7856,-3376]);
  pg('ENTREGA | Conferir banco descartavel',sql.identity,'={{ [] }}',[-7600,-3376]);
  transition('ENTREGA | Identidade confirmada',`SharedDelivery.verifyIdentity(${ref('ENTREGA | Validar contrato e origem')},$json.identities)`,[-7344,-3376]);
  pg('ENTREGA | Resolver conversa confiavel',sql.resolve,'={{ [$json.scope.environment,$json.scope.cliente_slug,$json.scope.channel,$json.scope.account_ref,$json.scope.conversation_ref] }}',[-7088,-3376]);
  transition('ENTREGA | Conversa confirmada',`SharedDelivery.resolveConversation(${ref('ENTREGA | Identidade confirmada')},$json.states)`,[-6832,-3376]);
  pg('ENTREGA | Registrar plano idempotente',sql.prepare,'={{ [$json.conversation_id,JSON.stringify($json)] }}',[-6576,-3376]);
  transition('ENTREGA | Plano confirmado',`$json.action_count===${ref('ENTREGA | Conversa confirmada')}.actions.length?${ref('ENTREGA | Conversa confirmada')}:SharedDelivery.stop(SharedDelivery.selectAction(${ref('ENTREGA | Conversa confirmada')}),'suppressed','prepare_unavailable',${now})`,[-6320,-3376]);
  iff('ENTREGA | Plano registrado?','$json.results.length===0',[-6064,-3376]);
  transition('ENTREGA | Selecionar acao',`SharedDelivery.selectAction($json)`,[-5808,-3376]);
  pg('ENTREGA | Ler estado antes da acao',sqlChoice(load),'={{ [$json.conversation_id,$json.request.request_id,JSON.stringify($json)] }}',[-5552,-3376]);
  transition('ENTREGA | Revalidar antes da acao',`SharedDelivery.preflight(${ref('ENTREGA | Selecionar acao')},$json,${now})`,[-5296,-3376]);
  iff('ENTREGA | Acao permitida?','$json.ready===true',[-5040,-3376]);
  iff('ENTREGA | Canal virtual?','$json.config.delivery_mode==="virtual"',[-4784,-3376]);
  pg('ENTREGA | Entrega virtual atomica',sqlChoice(virtual),'={{ [$json.conversation_id,$json.current.action_id,JSON.stringify($json)] }}',[-4528,-3632]);
  transition('ENTREGA | Confirmar virtual',`SharedDelivery.virtualCommitted(${ref('ENTREGA | Revalidar antes da acao')},$json,${now})`,[-4272,-3632]);
  pg('ENTREGA | Claim atomico por acao',sqlChoice(gate),'={{ [$json.conversation_id,$json.current.action_id,JSON.stringify($json),String($execution.id)] }}',[-4528,-3120]);
  transition('ENTREGA | Conferir claim',`SharedDelivery.claimOutcome(${ref('ENTREGA | Revalidar antes da acao')},$json,${now})`,[-4272,-3120]);
  iff('ENTREGA | Claim exclusivo?','$json.claimed===true',[-4016,-3120]);
  const send=add('ENTREGA | Enviar ao provedor','n8n-nodes-base.httpRequest',{method:'POST',url:'={{ $json.provider_request.url }}',authentication:'genericCredentialType',genericAuthType:'httpCustomAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.provider_request.body) }}',options:{timeout:30000,response:{response:{fullResponse:true,neverError:true,responseFormat:'json'}}}},[-3760,-3120],4.4);
  send.credentials={httpCustomAuth:{name:'LEXIA - Z-API TESTE Client-Token'}};send.retryOnFail=false;send.onError='continueRegularOutput';send.alwaysOutputData=true;
  transition('ENTREGA | Classificar retorno do provedor',`SharedDelivery.classifyProvider(${ref('ENTREGA | Conferir claim')},$json,${now})`,[-3504,-3120]);
  pg('ENTREGA | Confirmar entrega e historico',sql.finish,'={{ [$json.conversation_id,$json.current.action_id,String($execution.id),$json.claim.out_fencing_token,$json.outcome.provider_message_id||null,$json.outcome.status,$json.outcome.reason,JSON.stringify($json.current.content),$json.current.kind] }}',[-3248,-3120]);
  transition('ENTREGA | Resultado confirmado',`SharedDelivery.committed(${ref('ENTREGA | Classificar retorno do provedor')},$json,${now})`,[-2992,-3120]);
  iff('ENTREGA | Proxima acao?','$json.continue===true',[-2736,-3376]);
  transition('ENTREGA | Devolver recibo',`SharedDelivery.receipt($json)`,[-2480,-3376]);
  const linear=['Config Entrega Compartilhada','ENTREGA | Validar contrato e origem','ENTREGA | Conferir banco descartavel','ENTREGA | Identidade confirmada','ENTREGA | Resolver conversa confiavel','ENTREGA | Conversa confirmada','ENTREGA | Registrar plano idempotente','ENTREGA | Plano confirmado','ENTREGA | Plano registrado?'];
  for(let i=1;i<linear.length;i++)route(linear[i-1],[[linear[i]]]);
  route('ENTREGA | Plano registrado?',[['ENTREGA | Selecionar acao'],['ENTREGA | Devolver recibo']]);
  route('ENTREGA | Selecionar acao',[['ENTREGA | Ler estado antes da acao']]);route('ENTREGA | Ler estado antes da acao',[['ENTREGA | Revalidar antes da acao']]);
  route('ENTREGA | Revalidar antes da acao',[['ENTREGA | Acao permitida?']]);route('ENTREGA | Acao permitida?',[['ENTREGA | Canal virtual?'],['ENTREGA | Proxima acao?']]);
  route('ENTREGA | Canal virtual?',[['ENTREGA | Entrega virtual atomica'],['ENTREGA | Claim atomico por acao']]);
  route('ENTREGA | Entrega virtual atomica',[['ENTREGA | Confirmar virtual']]);route('ENTREGA | Confirmar virtual',[['ENTREGA | Proxima acao?']]);
  route('ENTREGA | Claim atomico por acao',[['ENTREGA | Conferir claim']]);route('ENTREGA | Conferir claim',[['ENTREGA | Claim exclusivo?']]);
  route('ENTREGA | Claim exclusivo?',[['ENTREGA | Enviar ao provedor'],['ENTREGA | Proxima acao?']]);route('ENTREGA | Enviar ao provedor',[['ENTREGA | Classificar retorno do provedor']]);
  route('ENTREGA | Classificar retorno do provedor',[['ENTREGA | Confirmar entrega e historico']]);route('ENTREGA | Confirmar entrega e historico',[['ENTREGA | Resultado confirmado']]);
  route('ENTREGA | Resultado confirmado',[['ENTREGA | Proxima acao?']]);route('ENTREGA | Proxima acao?',[['ENTREGA | Selecionar acao'],['ENTREGA | Devolver recibo']]);

  // Chat replies call the very same lane; buffer/media/brain are not replaced.
  pg('ENTREGA | IDs da resposta',`SELECT coalesce(jsonb_agg(jsonb_build_object('action_id',${uuidSql("md5(jsonb_build_array($2::text,e.n)::text)")},'sequence',e.n,'content',jsonb_build_object('type','text','text',e.v->>'texto')) ORDER BY e.n),'[]'::jsonb) AS actions FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY e(v,n);`,'={{ [JSON.stringify($json.entregas),$("LEXIA | Lote autorizado").first().json.invocation_id] }}',[7184,-1712]);
  code('ENTREGA | Pedido da resposta',core+`\nconst p=$('LEXIA | Resultado virtual Frappe').first().json,req=$('Entrada Unificada').first().json.body._workflow_test_request;
const state=$('Preparar Pacote de Contexto').first().json.state,call=$('LEXIA | Lote autorizado').first().json;
if(!Array.isArray($json.actions)||$json.actions.length!==p.entregas.length)throw new Error('reply_plan_unavailable');
const captured_state={state_version:state.state_version,delivery_epoch:state.delivery_epoch};
const out={schema_version:'lexia.delivery.plan.request.v1',request_id:call.invocation_id,scope:req.scope,captured_state,lead_cutoff_seq:call.out_cutoff_seq,
actions:$json.actions.map(a=>({...a,schema_version:'lexia.outbound.action.v1',invocation_id:call.invocation_id,scope:req.scope,kind:'reply',captured_state}))};
SharedDelivery.validateRequest(out);return [{json:out,pairedItem:{item:0}}];`,[7440,-1712]);
  const call=add('ENTREGA | Chamar envio neste omnichannel','n8n-nodes-base.executeWorkflow',{workflowId:{__rl:true,mode:'id',value:'={{ $workflow.id }}'},workflowInputs:{mappingMode:'passThrough',value:{}},options:{waitForSubWorkflow:true}},[7696,-1712],1.3);
  call.onError='continueRegularOutput';call.alwaysOutputData=true;call.retryOnFail=false;
  code('ENTREGA | Restaurar resposta virtual',core+`\nconst original=$('LEXIA | Resultado virtual Frappe').first().json,p=$('ENTREGA | Pedido da resposta').first().json;
let messages=[],reason=original.reason,deliveryResults=[];
try {SharedDelivery.validateReceipt($json);deliveryResults=$json.results.map(r=>({action_id:r.action_id,status:r.status,reason:r.reason||''}));
if($json.request_id!==p.request_id || JSON.stringify($json.captured_state)!==JSON.stringify(p.captured_state) || ['environment','cliente_slug','channel','account_ref','conversation_ref'].some(k=>$json.scope[k]!==p.scope[k]) || $json.results.length!==p.actions.length || $json.results.some((r,i)=>r.action_id!==p.actions[i].action_id))throw new Error('reply_receipt_mismatch');
messages=original.entregas.filter((e,i)=>$json.results[i].status==='suppressed' && $json.results[i].reason==='virtual_delivered');
if(messages.length!==original.entregas.length)reason='shared_delivery_interrupted';
}catch{reason='shared_delivery_result_unavailable';}
return [{json:{...original,entregas:messages,reason,delivery_results:deliveryResults},pairedItem:{item:0}}];`,[7952,-1712]);
  iff('ENTREGA | Resposta virtual tem acoes?','$json.entregas.length>0',[6928,-1456]);
  route('LEXIA | Resultado virtual Frappe',[['ENTREGA | Resposta virtual tem acoes?']]);
  route('ENTREGA | Resposta virtual tem acoes?',[['ENTREGA | IDs da resposta'],['LEXIA | Resultado virtual revalidado']]);
  route('ENTREGA | IDs da resposta',[['ENTREGA | Pedido da resposta']]);route('ENTREGA | Pedido da resposta',[['ENTREGA | Chamar envio neste omnichannel']]);route('ENTREGA | Chamar envio neste omnichannel',[['ENTREGA | Restaurar resposta virtual']]);
  route('ENTREGA | Restaurar resposta virtual',[['LEXIA | Resultado virtual revalidado']]);
  node('LEXIA | Resultado virtual revalidado').parameters.jsCode='return [{json:$json,pairedItem:{item:0}}];';
  for(const name of ['LEXIA | Persistir resposta no canal virtual','LEXIA | Identificar historico virtual','LEXIA | Restaurar revalidacao virtual','LEXIA | Claim antes de cada envio','LEXIA | Claim autorizado?','Enviar Mensagem Cliente - Texto Genérico','LEXIA | Enviar whatsapp','LEXIA | Enviar instagram','LEXIA | Enviar messenger','LEXIA | Classificar resultado de envio','Guardar Mensagem Enviada - Texto Genérico']) {
    node(name).disabled=true;delete w.connections[name];
  }
  route('LEXIA | Legado permite esta bolha?',[['LEXIA | Encerrar resposta bloqueada'],['LEXIA | Encerrar resposta bloqueada']]);
  add('ENTREGA | GUIA','n8n-nodes-base.stickyNote',{content:'## Entrega compartilhada no Omnichannel\nRespostas, follow-ups e lembretes entram aqui. Nenhum modelo e chamado nesta faixa. Estado duravel e gate atomico por acao; progresso confirmado nao e repetido. Incerto exige reconciliacao.\n\nPadrao VIRTUAL: somente conta fake, conversa test:, mensagens system/teste_workflow. Nunca significa envio de follow-up real. Provider exige revisao, conta Z-API de teste, media bindings e credencial exclusiva. Meta e novos tipos falham fechado ate adaptador revisado.\n\nConfig Entrega Compartilhada e confiavel: nao herdar configuracao de payload. Sem importacao, SQL ou servicos nesta rodada. Leia ENTREGA_COMPARTILHADA.md.',width:6600,height:1200,color:4},[-8672,-3936],1);
  node('LEXIA | ENTREGA E CRM').parameters.content='## Entrega compartilhada\nResposta do chat chama a faixa ENTREGA do mesmo Omnichannel. Follow-up e lembrete entram por Execute Workflow privado, nao por webhook publico. Estado, origem e idioma sao revalidados por acao. O padrao virtual nao comprova envio real.\n\nVeja ENTREGA_COMPARTILHADA.md e LEMBRETES.md: Z-API de teste preparada, Meta bloqueado ate revisao. Lembrete unico / 2h-24h / 7h-20h Boston; somente pausa do proprio evento permite. Produtor original adaptado localmente; runtime, outbox/recovery e pipeline pendentes. Nenhum SQL/node foi executado no n8n nesta rodada.';
  auditWorkflow(w);return w;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [sourcePath,outputPath]=process.argv.slice(2);
  if(!sourcePath || !outputPath)throw new Error('usage: build-miranda-shared-delivery.mjs <omnichannel-test.json> <output.json>');
  const w=buildSharedDelivery(JSON.parse(readFileSync(sourcePath,'utf8')));
  mkdirSync(dirname(resolve(outputPath)),{recursive:true});writeFileSync(outputPath,JSON.stringify(w,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(auditWorkflow(w))+'\n');
}
