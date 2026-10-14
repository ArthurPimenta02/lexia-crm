import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { bundleForN8n } from './lib/n8n-code-bundle.mjs';
import { readOnlyPreflight } from './lib/miranda-calendar-readonly-sql.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const clone=v=>JSON.parse(JSON.stringify(v));
const id=name=>createHash('sha256').update('miranda-original-calendar:'+name).digest('hex').slice(0,32);
const script=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,removeComments:true}}).outputText;
const get=name=>`$('${name}').first().json`;
const rowCode='$input.all().map(i=>i.json)';
const allowedOriginalCode=new Set(['Resolver Serviço e Janela','Calcular Slots','Validar Pedido','Checar Conflito','Montar Confirmação','Checar Duplicidade']);
export function buildCalendarTool(source,operation) {
  const availability=operation==='availability.check';
  if(!['availability.check','appointment.create'].includes(operation)||source.nodes.length!==(availability?7:24))throw Error('unexpected_original_calendar_workflow');
  const expected=availability?['Resolver Serviço e Janela','Calcular Slots']:['Validar Pedido','Checar Conflito','Montar Confirmação','Checar Duplicidade'];
  if(expected.some(name=>!source.nodes.some(n=>n.name===name)))throw Error('missing_original_calendar_logic');
  const core=bundleForN8n(resolve(root,'scripts/lib/miranda-calendar-tools-runtime.mjs'),'Calendar');
  const w={name:availability?'MIRANDA - VERIFICAR DISPONIBILIDADE - LEXIA CRM TESTE':'MIRANDA - CRIAR AGENDAMENTO - LEXIA CRM TESTE',active:false,nodes:[],connections:{},settings:{executionOrder:'v1',timezone:'America/New_York',callerPolicy:'workflowsFromSameOwner',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},pinData:{}};
  // Only six business-code blocks are copied. Notification configuration is never copied.
  for(const old of source.nodes){
    const n={id:id(operation+old.name),name:old.name,type:old.type,typeVersion:old.typeVersion,parameters:{},position:[0,0]};
    if(allowedOriginalCode.has(old.name)){n.parameters={mode:'runOnceForAllItems',jsCode:script(old.parameters.jsCode)};}
    else if(['n8n-nodes-base.if','n8n-nodes-base.noOp'].includes(old.type))n.parameters=clone(old.parameters);
    else if(old.name==='Get many rows'){n.parameters={resource:'row',operation:'getAll',tableId:'servicos_miranda',returnAll:true,filters:{conditions:[{keyName:'ativo',condition:'eq',keyValue:'true'}]}};n.credentials={supabaseApi:{name:'LEXIA - Catalogo Miranda Somente Leitura'}};n.alwaysOutputData=true;}
    else if(old.name==='Get many events'){n.parameters={resource:'event',operation:'getAll',calendar:{__rl:true,mode:'id',value:`={{ ${get('Config Tools Lexia')}.calendar_id }}`},returnAll:true,timeMin:'={{ $json.timeMin }}',timeMax:'={{ $json.timeMax }}',options:{orderBy:'startTime',recurringEventHandling:'expand',timeZone:{__rl:true,mode:'id',value:'America/New_York'}}};n.credentials={googleCalendarOAuth2Api:{name:'LEXIA - Google Agenda Pessoal TESTE'}};n.alwaysOutputData=true;n.onError='continueRegularOutput';}
    else {n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={mode:'runOnceForAllItems',jsCode:"return [{json:{...$json,delegated_to:'omnichannel'},pairedItem:{item:0}}];"};n.notes='Nome original preservado, sem envio, pausa eterna ou escrita no banco privado de producao.';}
    n.retryOnFail=false;w.nodes.push(n);
  }
  const node=name=>w.nodes.find(n=>n.name===name);
  const add=(name,type,parameters,position,version=2)=>{const n={id:id(operation+name),name,type,typeVersion:version,parameters,position,retryOnFail:false};w.nodes.push(n);return n;};
  const code=(name,body,position)=>add(name,'n8n-nodes-base.code',{mode:'runOnceForAllItems',jsCode:core+'\n'+body},position);
  const pg=(name,query,params,position)=>{const n=add(name,'n8n-nodes-base.postgres',{operation:'executeQuery',query,options:{queryReplacement:`={{ ${params} }}`}},position,2.6);n.credentials={postgres:{name:'Lexia HML Central Postgres'}};n.alwaysOutputData=true;return n;};
  const route=(name,outputs)=>w.connections[name]={main:outputs.map(names=>names.map(node=>({node,type:'main',index:0})))};
  const iff=(name,condition,position)=>add(name,'n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id:id(name),leftValue:`={{ ${condition} }}`,rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},position,2.2);
  const originalCalendar=source.nodes.find(n=>n.name==='Get many events').parameters.calendar.value;
  if(typeof originalCalendar!=='string'||originalCalendar.startsWith('='))throw Error('original_calendar_identity_missing');
  const config={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',account_ref:'24000000-0000-4000-8000-000000000001',project_ref:'',timezone:'America/New_York',calendar_id:'',expected_calendar_id:'',protected_calendar_hashes:[createHash('sha256').update(originalCalendar.trim().toLowerCase()).digest('hex')],calendar_reviewed:false,allow_calendar_read:false,allow_calendar_write:false,blocked_dates:['2026-09-05']};
  add('Config Tools Lexia','n8n-nodes-base.set',{assignments:{assignments:Object.entries(config).map(([name,value])=>({id:id(name),name,value,type:Array.isArray(value)?'array':typeof value==='boolean'?'boolean':'string'}))},includeOtherFields:false,options:{}},[260,0],3.4);
  const trigger=node('When Executed by Another Workflow');trigger.type='n8n-nodes-base.executeWorkflowTrigger';trigger.typeVersion=1.1;trigger.parameters={inputSource:'passthrough'};trigger.position=[0,0];
  code('LEXIA | Validar chamada de teste',`return [{json:Calendar.accept($('When Executed by Another Workflow').all(),${get('Config Tools Lexia')},'${operation}'),pairedItem:{item:0}}];`,[520,0]);
  pg('LEXIA | Conferir banco de teste',"SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) AS identities FROM public.lexia_environment_identity i;",'[]',[780,0]);
  code('LEXIA | Identidade confirmada',`return [{json:Calendar.identity(${get('LEXIA | Validar chamada de teste')},${rowCode}),pairedItem:{item:0}}];`,[1040,0]);
  pg('LEXIA | Registrar chamada idempotente','SELECT public.lexia_calendar_test_begin($1::jsonb,$2,$3::jsonb) AS call;',`[JSON.stringify($json.request),$json.config.calendar_id,JSON.stringify($json.config.protected_calendar_hashes)]`,[1300,0]);
  code('LEXIA | Chamada registrada',`return [{json:Calendar.started(${get('LEXIA | Identidade confirmada')},${rowCode}),pairedItem:{item:0}}];`,[1560,0]);
  iff('LEXIA | Resultado ja confirmado?','$json.cached===true',[1820,0]);
  code('LEXIA | Devolver resultado conhecido',`return [{json:Calendar.cached($json),pairedItem:{item:0}}];`,[2080,-500]);
  iff('LEXIA | Criacao incerta?','$json.uncertain===true',[2080,0]);
  code('LEXIA | Devolver pendencia de reconciliacao',`return [{json:Calendar.uncertain($json,$now.toISO()),pairedItem:{item:0}}];`,[2340,-500]);
  pg('LEXIA | Conferir pausas e versao','SELECT public.lexia_calendar_test_gate($1::uuid) AS gate;',`[$json.call.id]`,[2340,0]);
  code('LEXIA | Permissao conferida',`return [{json:Calendar.permission(${get('LEXIA | Chamada registrada')},${rowCode}),pairedItem:{item:0}}];`,[2600,0]);
  iff('LEXIA | Pode consultar?','$json.allowed===true',[2860,0]);
  code('LEXIA | Recusa antes de processamento',`return [{json:{ctx:$json,receipt:Calendar.refusal($json,$json.reason,$now.toISO()),unknown:false},pairedItem:{item:0}}];`,[3120,-500]);
  const start=['When Executed by Another Workflow','Config Tools Lexia','LEXIA | Validar chamada de teste','LEXIA | Conferir banco de teste','LEXIA | Identidade confirmada','LEXIA | Registrar chamada idempotente','LEXIA | Chamada registrada','LEXIA | Resultado ja confirmado?'];
  for(let i=1;i<start.length;i++)route(start[i-1],[[start[i]]]);
  route(start.at(-1),[['LEXIA | Devolver resultado conhecido'],['LEXIA | Criacao incerta?']]);
  route('LEXIA | Criacao incerta?',[['LEXIA | Devolver pendencia de reconciliacao'],['LEXIA | Conferir pausas e versao']]);
  route('LEXIA | Conferir pausas e versao',[['LEXIA | Permissao conferida']]);route('LEXIA | Permissao conferida',[['LEXIA | Pode consultar?']]);
  route('LEXIA | Pode consultar?',[['Get many rows'],['LEXIA | Recusa antes de processamento']]);node('Get many rows').position=[3120,0];
  const prepared=availability?'Resolver Serviço e Janela':'Validar Pedido';
  let business=node(prepared).parameters.jsCode;
  const c=get('LEXIA | Permissao conferida');
  node(prepared).parameters.jsCode=core+`\nconst p=${c};const rows=Calendar.catalog(${rowCode});const values=await(async($input)=>{${business}})({all:()=>rows.map(json=>({json}))});let ctx=Calendar.plan(p,values[0].json);if('${operation}'==='appointment.create'&&ctx.plan.status==='OK'&&!Calendar.validAlternative({inicio_iso:ctx.plan.inicio},ctx,DateTime))ctx=Calendar.plan(p,{status:'ERRO',mensagem:'Horario bloqueado ou fora das regras da clinica.'});return [{json:{...ctx.plan,ctx},pairedItem:{item:0}}];`;
  node(prepared).position=[3380,0];route('Get many rows',[[prepared]]);
  const ok=availability?'Status OK?':'Validação OK?';node(ok).position=[3640,0];route(prepared,[[ok]]);
  // All exit branches produce the same typed receipt, never raw NoOp data.
  const receipt=get('LEXIA | Preparar recibo final');
  code('LEXIA | Preparar recibo final',`if($json.receipt)return $input.all();const ctx=$json.ctx;const data={...$json};delete data.ctx;const status='${availability}'==='true'&&['OK','SEM_DISPONIBILIDADE'].includes(data.status)?'succeeded':'failed';return [{json:{ctx,receipt:Calendar.receipt(ctx,data,$now.toISO(),status),unknown:false},pairedItem:{item:0}}];`,[availability?4680:7280,0]);
  pg('LEXIA | Confirmar recibo duravel','SELECT public.lexia_calendar_test_finish($1::uuid,$2::jsonb,$3::boolean,$4::uuid) AS call;',`[${receipt}.ctx.call.id,JSON.stringify(${receipt}.receipt),${receipt}.unknown,${receipt}.ctx.ownership_token||null]`,[availability?4940:7540,0]);
  code('LEXIA | Devolver contrato ao cerebro',`const p=${receipt};return [{json:Calendar.committed(p.ctx,p.receipt,${rowCode}),pairedItem:{item:0}}];`,[availability?5200:7800,0]);
  route('LEXIA | Preparar recibo final',[['LEXIA | Confirmar recibo duravel']]);route('LEXIA | Confirmar recibo duravel',[['LEXIA | Devolver contrato ao cerebro']]);route('LEXIA | Recusa antes de processamento',[['LEXIA | Preparar recibo final']]);
  const errors=availability?['Saída Erro']:['Saída Erro','Saída Erro1','Saída Erro2'];
  for(const [i,name]of errors.entries()){node(name).position=[3900+i*260,-750];route(name,[['LEXIA | Preparar recibo final']]);}
  const google=node('Get many events');google.position=[availability?3900:4680,0];
  if(availability){
    route(ok,[['Get many events'],['Saída Erro']]);
    business=node('Calcular Slots').parameters.jsCode.replace(/const DIAS_BLOQUEADOS = \[[\s\S]*?\];/,`const DIAS_BLOQUEADOS = ${get('Config Tools Lexia')}.blocked_dates;`);
    node('Calcular Slots').parameters.jsCode=core+`\nconst ctx=${get(prepared)}.ctx;let out;try{const rows=Calendar.events(${rowCode});const values=await(async($input)=>{${business}})({all:()=>rows.map(json=>({json}))});out=Calendar.calendarData(ctx,values[0].json);}catch{out={status:'ERRO',reason:'calendar_read_or_result_failed',mensagem:'Nao foi possivel confirmar a disponibilidade. Nao invente horarios.'};}return [{json:{...out,ctx},pairedItem:{item:0}}];`;
    node('Calcular Slots').position=[4160,0];route('Get many events',[['Calcular Slots']]);route('Calcular Slots',[['LEXIA | Preparar recibo final']]);
  }else{
    code('LEXIA | Conferir OK e recapitulativo',`const ctx=Calendar.confirmation($json.ctx,DateTime);return [{json:{...ctx.plan,ctx},pairedItem:{item:0}}];`,[3900,0]);
    const dup=node('Evento confirmado?');dup.type='n8n-nodes-base.postgres';dup.typeVersion=2.6;dup.credentials={postgres:{name:'Lexia HML Central Postgres'}};dup.alwaysOutputData=true;
    dup.parameters={operation:'executeQuery',query:"SELECT receipt->'data'->'agendamento' AS booking FROM public.lexia_calendar_tool_calls WHERE conversation_id=$1::uuid AND calendar_id=$2 AND operation='appointment.create' AND status='completed' AND receipt->>'status'='succeeded';",options:{queryReplacement:`={{ [${get('LEXIA | Conferir OK e recapitulativo')}.ctx.call.conversation_id,${get('Config Tools Lexia')}.calendar_id] }}`}};dup.position=[4160,0];
    business=node('Checar Duplicidade').parameters.jsCode.replace("'HH:mm'","'h:mm a'");
    node('Checar Duplicidade').parameters.jsCode=core+`\nconst ctx=${get('LEXIA | Claim confirmado')};const rows=${rowCode}.filter(r=>r.booking).map(r=>({...r.booking,servico:r.booking.servico,nome_cliente:r.booking.nome}));const values=await(async($input)=>{${business}})({all:()=>rows.map(json=>({json}))});return values.map(v=>({json:{...v.json,ctx},pairedItem:{item:0}}));`;
    node('Checar Duplicidade').position=[4420,0];node('Sem duplicado?').position=[4680,350];
    route(ok,[['LEXIA | Conferir OK e recapitulativo'],['Saída Erro']]);route('LEXIA | Conferir OK e recapitulativo',[['LEXIA | Reservar criacao unica']]);route('Evento confirmado?',[['Checar Duplicidade']]);route('Checar Duplicidade',[['Sem duplicado?']]);route('Sem duplicado?',[['Get many events'],['Saída Erro2']]);
    google.position=[4940,0];
    business=node('Checar Conflito').parameters.jsCode.replace("'HH:mm'","'h:mm a'");
    if(!business.includes('if (livre(t, f))'))throw Error('original_conflict_loop_missing');
    business=business.replace('if (livre(t, f))','if (livre(t, f) && Calendar.validAlternative({inicio_iso:t.toISO()},ctx,DateTime))');
    node('Checar Conflito').parameters.jsCode=core+`\nconst ctx=${get('LEXIA | Claim confirmado')};let out;try{const rows=Calendar.events(${rowCode});const values=await(async($input)=>{${business}})({all:()=>rows.map(json=>({json}))});out=values[0].json;if(out.novas_opcoes){out.novas_opcoes=out.novas_opcoes.filter(s=>Calendar.validAlternative(s,ctx,DateTime));out.mensagem+=' Antes de criar qualquer alternativa, chame verificar_disponibilidade novamente para atestar o horario escolhido.';}}catch{out={status:'ERRO',reason:'calendar_read_failed',mensagem:'Nao foi possivel confirmar se o horario esta livre.'};}return [{json:{...out,ctx},pairedItem:{item:0}}];`;
    node('Checar Conflito').position=[5200,0];node('Livre?').position=[5460,0];route('Get many events',[['Checar Conflito']]);route('Checar Conflito',[['Livre?']]);
    pg('LEXIA | Reservar criacao unica','SELECT public.lexia_calendar_test_claim($1::uuid,$2::jsonb) AS claim;',`[$json.ctx.call.id,JSON.stringify($json.ctx.plan)]`,[5720,0]);
    code('LEXIA | Claim confirmado',`return [{json:Calendar.claimed(${get('LEXIA | Conferir OK e recapitulativo')}.ctx,${rowCode}),pairedItem:{item:0}}];`,[5980,0]);
    iff('LEXIA | Criacao autorizada?','$json.acquired===true',[6240,0]);
    code('LEXIA | Recusa de claim',`const busy=$json.reason==='already_claimed_or_completed';return [{json:{ctx:$json,receipt:busy?Calendar.uncertain($json,$now.toISO()):Calendar.refusal($json,$json.reason,$now.toISO()),unknown:false,no_commit:busy},pairedItem:{item:0}}];`,[6500,-500]);
    pg('LEXIA | Revalidar antes do Google','SELECT public.lexia_calendar_test_gate($1::uuid) AS gate;',`[$json.call.id]`,[6500,0]);
    code('LEXIA | Gate final confirmado',`return [{json:Calendar.permission(${get('LEXIA | Claim confirmado')},${rowCode}),pairedItem:{item:0}}];`,[6760,0]);
    iff('LEXIA | Pode criar agora?','$json.allowed===true',[7020,0]);
    route('Livre?',[['LEXIA | Revalidar antes do Google'],['Saída Erro1']]);route('LEXIA | Reservar criacao unica',[['LEXIA | Claim confirmado']]);route('LEXIA | Claim confirmado',[['LEXIA | Criacao autorizada?']]);route('LEXIA | Criacao autorizada?',[['Evento confirmado?'],['LEXIA | Recusa de claim']]);route('LEXIA | Recusa de claim',[['LEXIA | Preparar recibo final']]);route('LEXIA | Revalidar antes do Google',[['LEXIA | Gate final confirmado']]);route('LEXIA | Gate final confirmado',[['LEXIA | Pode criar agora?']]);
    route('LEXIA | Pode criar agora?',[['Create an event'],['LEXIA | Recusa antes de processamento']]);
    const create=node('Create an event');create.type='n8n-nodes-base.googleCalendar';create.typeVersion=1.3;create.credentials={googleCalendarOAuth2Api:{name:'LEXIA - Google Agenda Pessoal TESTE'}};create.alwaysOutputData=true;create.onError='continueRegularOutput';create.position=[7280,350];
    create.parameters={resource:'event',operation:'create',calendar:{__rl:true,mode:'id',value:`={{ ${get('Config Tools Lexia')}.calendar_id }}`},start:'={{ $json.plan.inicio }}',end:'={{ $json.plan.fim }}',useDefaultReminders:false,remindersUi:{remindersValues:[]},additionalFields:{id:'={{ $json.call.provider_event_id }}',summary:"={{ $json.plan.profissional + ' - [LEXIA TESTE] ' + $json.plan.servico_agendado }}",description:"={{ 'LEXIA_TEST_CALL=' + $json.call.id }}",sendUpdates:'none',visibility:'private'}};
    code('LEXIA | Conferir evento criado',`const p=${get('LEXIA | Gate final confirmado')};let ctx;try{ctx=Calendar.created(p,$input.first().json,$now.toISO());return [{json:{ctx,confirmed:true},pairedItem:{item:0}}];}catch{return [{json:{ctx:p,confirmed:false,receipt:Calendar.uncertain(p,$now.toISO()),unknown:true},pairedItem:{item:0}}];}`, [7540,350]);
    iff('LEXIA | Google confirmou?','$json.confirmed===true',[7800,350]);route('Create an event',[['LEXIA | Conferir evento criado']]);route('LEXIA | Conferir evento criado',[['LEXIA | Google confirmou?']]);
    business=node('Montar Confirmação').parameters.jsCode;
    node('Montar Confirmação').parameters.jsCode=core+`\nconst ctx=${get('LEXIA | Conferir evento criado')}.ctx;const values=await(async()=>{${business}})();return [{json:{ctx,receipt:Calendar.complete(ctx,values[0].json,$now.toISO()),unknown:false},pairedItem:{item:0}}];`;
    node('Montar Confirmação').position=[8060,350];route('LEXIA | Google confirmou?',[['Montar Confirmação'],['LEXIA | Preparar recibo final']]);route('Montar Confirmação',[['LEXIA | Preparar recibo final']]);
    const persist=node('Create a row');persist.type='n8n-nodes-base.postgres';persist.typeVersion=2.6;persist.parameters=clone(node('LEXIA | Confirmar recibo duravel').parameters);persist.credentials={postgres:{name:'Lexia HML Central Postgres'}};persist.alwaysOutputData=true;persist.notes='Grava somente ledger HML. Nunca agendamentos_miranda_skin de producao.';persist.position=[9100,350];
    iff('LEXIA | Recusa de chamada em andamento?','$json.no_commit===true',[9100,650]);
    code('LEXIA | Devolver sem mudar claim alheio',`return [{json:$json.receipt,pairedItem:{item:0}}];`,[9360,900]);
    route('LEXIA | Preparar recibo final',[['LEXIA | Recusa de chamada em andamento?']]);route('LEXIA | Recusa de chamada em andamento?',[['LEXIA | Devolver sem mudar claim alheio'],['Create a row']]);route('Create a row',[['LEXIA | Devolver contrato ao cerebro']]);node('LEXIA | Confirmar recibo duravel').disabled=true;
    node('LEXIA | Preparar recibo final').position=[8840,350];node('LEXIA | Devolver contrato ao cerebro').position=[9360,350];
    // Keep old operational names visible as a disconnected reference band.
    const side=['Agendado via WhatsApp?','Pausa Eterna WhatsApp','Encerrar Follow-up do Lead','Preparar Notificação Marcação','Enviar notificação?','Notificar Samuel (uazapi)','Notificar Sócio?','Notificar Sócio'];
    for(const [i,name]of side.entries()){node(name).disabled=true;node(name).position=[3380+i*260,1250];}
    for(const [name,x]of Object.entries({'LEXIA | Reservar criacao unica':4160,'LEXIA | Claim confirmado':4420,'LEXIA | Criacao autorizada?':4680,'Evento confirmado?':4940,'Checar Duplicidade':5200,'Sem duplicado?':5460,'Get many events':5720,'Checar Conflito':5980,'Livre?':6240}))node(name).position=[x,0];
  }
  add('LEIA ANTES DE TESTAR','n8n-nodes-base.stickyNote',{content:'## Copia original / calendario pessoal ISOLADO\nINATIVO. Configure somente um calendario secundario Lexia Testes e credenciais HML. ID/flags vazios bloqueiam. Schema de ledger em arquivo para revisao, NAO aplicado. Leia TOOLS_AGENDA.md. Nunca use Miranda de producao.',width:2200,height:260,color:4},[0,-900],1);
  add('REGRAS E LIMITES','n8n-nodes-base.stickyNote',{content:'## Regras originais preservadas\nBoston, variantes/areas, avaliacao, grade, buffer de 15 min, janela Samuel e domingo. Criacao exige recapitulativo entregue, OK do lead e slot atestado. IDs fixos, claim duravel e gate antes do Google. Resultado incerto nao reenvia. Eventos retornam ao mestre; CRM/pausas/lembretes exigem consumo pelo Omnichannel.',width:2300,height:260,color:6},[2600,-1400],1);
  validateCalendarExport(w);return w;
}
export function validateCalendarExport(w) {
  if(w.active!==false||Object.keys(w.pinData||{}).length)throw Error('calendar_export_inactive_required');
  const names=new Set(w.nodes.map(n=>n.name));if(names.size!==w.nodes.length)throw Error('calendar_duplicate_name');
  for(const [name,types]of Object.entries(w.connections)){if(!names.has(name))throw Error('calendar_missing_connection');for(const outputs of Object.values(types))for(const links of outputs)for(const link of links)if(!names.has(link.node))throw Error('calendar_missing_target');}
  for(const n of w.nodes){if(n.parameters.jsCode)new Function(n.parameters.jsCode);for(const c of Object.values(n.credentials||{}))if(Object.keys(c).some(k=>k!=='name'))throw Error('calendar_credential_id_forbidden');if(['n8n-nodes-base.httpRequest','n8n-nodes-base.redis','n8n-nodes-base.webhook','n8n-nodes-base.scheduleTrigger'].includes(n.type))throw Error('calendar_unexpected_external_effect');}
  if(/\beyJ[A-Za-z0-9_.-]{30,}|\bsk-[A-Za-z0-9_-]{16,}|uazapi_token|UAZAPI_TOKEN|numero_socio|agendamentos_miranda_skin|helpers\.httpRequest|\$env\./.test(JSON.stringify(w).replace(/Nunca agendamentos_miranda_skin de producao\./g,'')))throw Error('calendar_secret_or_production_destination');
}
export function buildReadOnlyAvailability(source) {
  const w=buildCalendarTool(source,'availability.check');
  w.name='MIRANDA - DISPONIBILIDADE CRM - SOMENTE LEITURA';
  w.nodes.find(n=>n.name==='Config Tools Lexia').parameters.assignments.assignments.push({id:id('allow_personal_calendar_read'),name:'allow_personal_calendar_read',type:'boolean',value:true});
  const remove=new Set(['LEXIA | Conferir banco de teste','LEXIA | Identidade confirmada',
    'LEXIA | Registrar chamada idempotente','LEXIA | Chamada registrada','LEXIA | Resultado ja confirmado?',
    'LEXIA | Devolver resultado conhecido','LEXIA | Criacao incerta?',
    'LEXIA | Devolver pendencia de reconciliacao','LEXIA | Confirmar recibo duravel']);
  w.nodes=w.nodes.filter(n=>!remove.has(n.name));
  w.connections={};
  const node=name=>w.nodes.find(n=>n.name===name);
  const route=(name,outputs)=>w.connections[name]={main:outputs.map(names=>names.map(node=>({node,type:'main',index:0})))};
  const core=bundleForN8n(resolve(root,'scripts/lib/miranda-calendar-tools-runtime.mjs'),'Calendar');
  node('LEXIA | Validar chamada de teste').parameters.jsCode=core+`\nconst p=Calendar.accept($('When Executed by Another Workflow').all(),${get('Config Tools Lexia')},'availability.check');if(p.config.allow_calendar_write!==false||p.input.lexia_call_context.calendar_write_allowed!==false)throw Error('read_only_calendar_required');return [{json:p,pairedItem:{item:0}}];`;
  node('LEXIA | Conferir pausas e versao').parameters={operation:'executeQuery',query:readOnlyPreflight,options:{queryReplacement:'={{ [JSON.stringify($json.request),$json.config.calendar_id,JSON.stringify($json.config.protected_calendar_hashes)] }}'}};
  node('LEXIA | Permissao conferida').parameters.jsCode=core+`\nconst rows=${rowCode};const p=Calendar.identity(${get('LEXIA | Validar chamada de teste')},rows);return [{json:Calendar.permission(Calendar.started(p,rows),rows),pairedItem:{item:0}}];`;
  node('LEXIA | Devolver contrato ao cerebro').parameters.jsCode=`return [{json:${get('LEXIA | Preparar recibo final')}.receipt,pairedItem:{item:0}}];`;
  const line=['When Executed by Another Workflow','Config Tools Lexia','LEXIA | Validar chamada de teste','LEXIA | Conferir pausas e versao','LEXIA | Permissao conferida','LEXIA | Pode consultar?'];
  for(let i=1;i<line.length;i++)route(line[i-1],[[line[i]]]);
  route(line.at(-1),[['Get many rows'],['LEXIA | Recusa antes de processamento']]);
  route('Get many rows',[['Resolver Serviço e Janela']]);route('Resolver Serviço e Janela',[['Status OK?']]);
  route('Status OK?',[['Get many events'],['Saída Erro']]);route('Get many events',[['Calcular Slots']]);
  for(const name of ['Calcular Slots','Saída Erro','LEXIA | Recusa antes de processamento'])route(name,[['LEXIA | Preparar recibo final']]);
  route('LEXIA | Preparar recibo final',[['LEXIA | Devolver contrato ao cerebro']]);
  const main=[...line,'Get many rows','Resolver Serviço e Janela','Status OK?','Get many events','Calcular Slots','LEXIA | Preparar recibo final','LEXIA | Devolver contrato ao cerebro'];
  main.forEach((name,i)=>{node(name).position=[i*260,0];});
  node('Saída Erro').position=[2080,350];node('LEXIA | Recusa antes de processamento').position=[1300,350];
  node('REGRAS E LIMITES').parameters.content='## Disponibilidade SOMENTE LEITURA\nRegras originais preservadas. Consulta nunca cria, cancela ou reserva eventos. Identidade, escopo, pausas, versao e lote conferidos antes do catalogo/Google. Recibo correlacionado ao pedido; repeticao de leitura nao cria efeitos. Auditoria segue no resultado do cerebro. Sem novo schema/ledger de escrita. Este recibo NAO autoriza criacao futura: a fase de agendamento exige consulta atestada pelo ledger.';
  validateCalendarExport(w);return w;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [availability,creation,out]=process.argv.slice(2);if(!availability||!creation||!out)throw Error('usage: build-miranda-original-calendar-tools.mjs <availability-original.json> <creation-original.json> <output-dir>');
  mkdirSync(out,{recursive:true});for(const [input,operation,name]of [[availability,'availability.check','availability-original-crm.inactive.json'],[creation,'appointment.create','create-appointment-original-crm.inactive.json']]){const w=buildCalendarTool(JSON.parse(readFileSync(input,'utf8')),operation);writeFileSync(resolve(out,name),JSON.stringify(w,null,2)+'\n',{mode:0o600});process.stdout.write(JSON.stringify({file:name,nodes:w.nodes.length,active:false})+'\n');}
}
