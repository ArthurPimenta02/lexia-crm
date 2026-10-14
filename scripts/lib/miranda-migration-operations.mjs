import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { bundleForN8n } from './n8n-code-bundle.mjs';

// Native nodes perform all I/O. Code snippets only validate and route data.
export function addMigrationOperations(w, root, originalAppointmentFingerprint) {
  const id = name => createHash('sha256').update('migration-ops:' + name).digest('hex').slice(0, 32);
  const get = name => w.nodes.find(n => n.name === name);
  const ref = name => `$('${name}').first().json`;
  const route = (name, groups) => { w.connections[name] = { main: groups.map(g => g.map(node => ({ node, type: 'main', index: 0 }))) }; };
  const add = (name, type, parameters, version = 2) => {
    if (get(name)) throw Error('duplicate_operation_node:' + name);
    const n = { id: id(name), name, type, typeVersion: version, parameters, position: [0, 0], retryOnFail: false };
    w.nodes.push(n); return n;
  };
  const code = (name, jsCode) => add(name, 'n8n-nodes-base.code', { mode: 'runOnceForAllItems', jsCode });
  const pg = (name, query, args) => {
    const n = add(name, 'n8n-nodes-base.postgres', { operation: 'executeQuery', query, options: { queryReplacement: `={{ ${args} }}` } }, 2.6);
    n.credentials = { postgres: { name: 'Lexia Central Postgres' } }; return n;
  };
  const iff = (name, expr) => add(name, 'n8n-nodes-base.if', { conditions: { options: { typeValidation: 'strict', version: 2 }, conditions: [{ id: id(name), leftValue: `={{ ${expr} }}`, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, 2.2);
  const call = (name, input) => add(name, 'n8n-nodes-base.executeWorkflow', { source: 'database', workflowId: { __rl: true, value: '={{ $workflow.id }}', mode: 'id' }, workflowInputs: { mappingMode: 'passThrough', value: {} }, mode: 'each', options: { waitForSubWorkflow: true }, ...input }, 1.3);
  const schema = bundleForN8n(resolve(root, 'lib/omnichannel/schema-validator.ts'), 'Schema');
  const cfg = 'OPERACAO | Configuracao';
  add(cfg, 'n8n-nodes-base.set', { assignments: { assignments: Object.entries({ environment: 'isolated_test', cliente_slug: 'miranda_skin_experts', account_refs: [], actor_user_id: '', appointment_workflow_ref: '', crm_event_endpoint: '', commands_enabled: false,
    team_notifications:{enabled:false,recipients:{samuel:'',partner:''},zapi_endpoint:'',uazapi_endpoint:'',uazapi_hosts:[]}
  }).map(([name, value]) => ({ id: id(name), name, value, type: Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value === 'boolean' ? 'boolean' : 'string' })) }, options: {} }, 3.4);
  code('OPERACAO | Selecionar tarefa', `const x=${ref('LEXIA | Evento interno individual')};
if(!['projection','crm.flush','crm.snapshot','crm.enqueue','team.dispatch'].includes(x.operation))throw Error('unsupported_internal_operation');
if(x.operation!=='crm.enqueue')Schema.assertJsonSchemaValue({type:'string',format:'uuid'},x.conversation_id,'conversation_id');
return [{json:x}];`.replace('const x=', schema + '\nconst x='));
  iff('OPERACAO | Projecao?', "$json.operation==='projection'");
  pg('ESTADO | Ler snapshot autorizado', 'SELECT public.lexia_migration_projection_snapshot($1::uuid,$2,$3,$4::jsonb) AS snapshot;', `[${ref('OPERACAO | Selecionar tarefa')}.conversation_id,${ref(cfg)}.environment,${ref(cfg)}.cliente_slug,JSON.stringify(${ref(cfg)}.account_refs)]`);
  code('ESTADO | Preparar chave versionada', `const s=$json.snapshot;if(!s?.outbox_id||!s.key||!s.value)throw Error('projection_unavailable');return [{json:s}];`);
  const redis = add('ESTADO | Projetar Redis', 'n8n-nodes-base.redis', { operation: 'set', key: '={{ $json.key }}', value: '={{ JSON.stringify($json.value) }}', keyType: 'string', expire: false }, 1);
  redis.credentials = { redis: { name: 'Lexia Central Redis' } }; redis.onError = 'continueRegularOutput';
  code('ESTADO | Classificar projecao', `const s=${ref('ESTADO | Preparar chave versionada')};return [{json:{...s,ok:!$json.error}}];`);
  pg('ESTADO | Confirmar versao projetada', "SELECT public.lexia_omni_complete_projection($1::uuid,CASE WHEN $2::boolean THEN 'done' ELSE 'failed' END);", '[$json.outbox_id,$json.ok]');
  code('ESTADO | Retornar projecao', `return [{json:{operation:'projection',conversation_id:${ref('OPERACAO | Selecionar tarefa')}.conversation_id,projected:${ref('ESTADO | Classificar projecao')}.ok}}];`);
  route(cfg, [['OPERACAO | Selecionar tarefa']]); route('OPERACAO | Selecionar tarefa', [['OPERACAO | Projecao?']]);
  iff('OPERACAO | Sincronizar CRM?', "$json.operation==='crm.flush'");
  route('OPERACAO | Projecao?', [['ESTADO | Ler snapshot autorizado'], ['OPERACAO | Sincronizar CRM?']]);
  iff('OPERACAO | Espelho completo?',"$json.operation==='crm.snapshot'");
  iff('OPERACAO | Enfileirar automacao?',"$json.operation==='crm.enqueue'");
  route('OPERACAO | Sincronizar CRM?', [['CRM | Buscar outbox pendente'], ['OPERACAO | Espelho completo?']]);
  route('OPERACAO | Espelho completo?', [['CRM | Resolver escopo do espelho'],['OPERACAO | Enfileirar automacao?']]);
  route('OPERACAO | Enfileirar automacao?', [['CRM | Validar eventos da automacao'],['EQUIPE | Ler notificacoes pendentes']]);
  pg('CRM | Resolver escopo do espelho', `SELECT s.id AS conversation_id FROM public.lexia_conversation_states s
JOIN public.lexia_channel_accounts a ON a.id=s.account_id WHERE s.id=$1::uuid AND s.environment=$2 AND s.cliente_slug=$3
AND $4::jsonb ? s.account_id::text AND a.provider<>'fake' AND s.conversation_ref NOT LIKE 'test:%';`,
    `[${ref('OPERACAO | Selecionar tarefa')}.conversation_id,${ref(cfg)}.environment,${ref(cfg)}.cliente_slug,JSON.stringify(${ref(cfg)}.account_refs)]`);
  route('CRM | Resolver escopo do espelho',[['CRM | Ler espelho da conversa']]);
  get('CRM | Ler espelho da conversa').parameters.options.queryReplacement=`={{ [(()=>{try{return $json.conversation_id||${ref('LEXIA | Registro individual confirmado')}.conversation_id}catch{throw Error('crm_conversation_required')}})()] }}`;
  get('CRM | Registrar outbox duravel').parameters.query=`SELECT public.lexia_migration_enqueue_crm((SELECT s.id FROM public.lexia_conversation_states s
WHERE s.environment=$1::jsonb->'scope'->>'environment' AND s.cliente_slug=$1::jsonb->'scope'->>'cliente_slug'
AND s.channel=$1::jsonb->'scope'->>'channel' AND s.account_id=($1::jsonb->'scope'->>'account_ref')::uuid
AND s.conversation_ref=$1::jsonb->'scope'->>'conversation_ref'),$1::jsonb) AS outbox_id;`;
  get('CRM | Registrar outbox duravel').parameters.options.queryReplacement='={{ [JSON.stringify($json.event)] }}';
  get('CRM | Enviar evento ao Frappe').parameters.url=`={{ (()=>{try{return ${ref(cfg)}.crm_event_endpoint}catch{return ${ref('Config Cliente Lexia')}.frappe_url+'/api/method/lexia_crm.api.ingest_event'}})() }}`;
  code('CRM | Validar eventos da automacao',schema+`\nconst x=${ref('OPERACAO | Selecionar tarefa')},c=${ref(cfg)};
if(!Array.isArray(x.events)||x.events.length<1||x.events.length>2)throw Error('automation_crm_events_invalid');
for(const e of x.events){Schema.assertContractSchema('crm-sync-event',e);if(e.scope.environment!==c.environment||e.scope.cliente_slug!==c.cliente_slug||!c.account_refs.includes(e.scope.account_ref))throw Error('automation_crm_scope_denied');}
if(x.events.some(e=>JSON.stringify(e.scope)!==JSON.stringify(x.events[0].scope)))throw Error('mixed_automation_crm_scope');
return [{json:{events:x.events}}];`);
  pg('CRM | Enfileirar automacao duravel','SELECT public.lexia_migration_enqueue_automation_crm($1::jsonb) AS queued;', '[JSON.stringify($json.events)]');
  route('CRM | Validar eventos da automacao',[['CRM | Enfileirar automacao duravel']]);
  const project = ['ESTADO | Ler snapshot autorizado','ESTADO | Preparar chave versionada','ESTADO | Projetar Redis','ESTADO | Classificar projecao','ESTADO | Confirmar versao projetada','ESTADO | Retornar projecao'];
  for (let i=1;i<project.length;i++) route(project[i-1], [[project[i]]]);

  // Use an immutable version key: a slow writer cannot overwrite a newer state.
  // Returning to each caller preserves its own item, including partial receipts.
  const insertProjection = (before, conversationExpression) => {
    const incoming = Object.entries(w.connections).filter(([name, types]) => name !== before && types.main?.flat().some(e => e.node === before));
    const label = 'ESTADO | Antes de ' + before;
    code(label, `return [{json:{operation:'projection',conversation_id:${conversationExpression}}}];`);
    call(label + ' - executar');
    code(label + ' - continuar', `if($json.projected!==true)throw Error('redis_projection_failed');return [{json:${ref(incoming[0]?.[0] || before)}}];`);
    // Every join has a different upstream item. Save the original at this node
    // rather than reading whichever branch happened to execute first.
    get(label).parameters.jsCode = `return [{json:{operation:'projection',conversation_id:${conversationExpression},_return:$json}}];`;
    get(label + ' - continuar').parameters.jsCode = `if($json.projected!==true)throw Error('redis_projection_failed');return [{json:${ref(label)}._return}];`;
    for (const [,types] of incoming) for (const group of types.main) for (const edge of group) if (edge.node===before) edge.node=label;
    route(label, [[label + ' - executar']]); route(label + ' - executar', [[label + ' - continuar']]); route(label + ' - continuar', [[before]]);
  };
  insertProjection('LEXIA | Checar todos os bloqueios', `${ref('LEXIA | Registro individual confirmado')}.conversation_id`);
  insertProjection('Intervenção é áudio?', `${ref('LEXIA | Registro individual confirmado')}.conversation_id`);
  insertProjection('LEXIA | Handoff bloqueante?', `${ref('LEXIA | Registro individual confirmado')}.conversation_id`);
  insertProjection('ENTREGA | Registrar plano idempotente', `${ref('ENTREGA | Conversa confirmada')}.conversation_id`);

  // The private subworkflow entry remains the only internal entry. Public
  // CRM commands have separate Header Auth and never masquerade as a lead.
  const old = 'ENTREGA | Separar atendimento e pedido';
  code('OPERACAO | Entrada interna', `return [{json:$json}];`);
  iff('OPERACAO | Tarefa interna?', "['projection','crm.flush','crm.snapshot','crm.enqueue','team.dispatch'].includes($json.operation)");
  route('LEXIA | Evento interno individual', [['OPERACAO | Entrada interna']]);
  route('OPERACAO | Entrada interna', [['OPERACAO | Tarefa interna?']]);
  route('OPERACAO | Tarefa interna?', [[cfg], [old]]);
  const hook = add('CRM | Webhook Comandos', 'n8n-nodes-base.webhook', { httpMethod: 'POST', path: 'lexia-miranda-migration-commands', authentication: 'headerAuth', responseMode: 'responseNode', options: {} }, 2.1);
  hook.credentials = { httpHeaderAuth: { name: 'Lexia CRM Command Header Auth' } };
  const commandCfg = {name:cfg};
  const references=bundleForN8n(resolve(root,'scripts/lib/reference-denylist.mjs'),'References');
  code('CRM | Validar comando autorizado', schema + '\n'+references+ `\nconst c=${ref(commandCfg.name)},e=${ref(hook.name)}.body;
Schema.assertContractSchema('crm-command',e);
if(c.commands_enabled!==true||e.scope.environment!==c.environment||e.scope.cliente_slug!==c.cliente_slug||!c.account_refs.includes(e.scope.account_ref))throw Error('crm_command_scope_denied');
Schema.assertJsonSchemaValue({type:'string',format:'uuid'},c.actor_user_id,'actor_user_id');
if(e.command_type==='appointment.cancel'&&(!/^[A-Za-z0-9_-]{1,64}$/.test(c.appointment_workflow_ref)||References.referenceFingerprint(c.appointment_workflow_ref)===${JSON.stringify(originalAppointmentFingerprint)}))throw Error('select_imported_appointment_not_production');
return [{json:{command:e,actor_user_id:c.actor_user_id}}];`);
  pg('CRM | Aplicar comando central', 'SELECT public.lexia_migration_apply_command($1::jsonb,$2::uuid) AS result;', '[JSON.stringify($json.command),$json.actor_user_id]');
  iff('CRM | Cancelamento Google solicitado?', "$json.result?.cancel_required===true");
  code('CRM | Preparar cancelamento', `const r=${ref('CRM | Aplicar comando central')}.result;return [{json:{operation:'appointment.cancel',request_id:r.command_id,conversation_id:r.conversation_id}}];`);
  const cancel = call('CRM | Chamar Agendamentos'); cancel.parameters.workflowId.value=`={{ ${ref(commandCfg.name)}.appointment_workflow_ref }}`; cancel.onError='continueRegularOutput';
  pg('CRM | Conferir cancelamento duravel', "SELECT public.lexia_migration_command_receipt($1::uuid) AS result;", `[${ref('CRM | Aplicar comando central')}.result.command_id]`);
  code('CRM | Preparar projecao do comando', `return [{json:{operation:'projection',conversation_id:$json.result.conversation_id,_result:$json.result}}];`);
  call('CRM | Projetar comando');
  code('CRM | Recibo do comando', `const r=${ref('CRM | Preparar projecao do comando')}._result;return [{json:{...r,projection_current:$json.projected===true}}];`);
  add('CRM | Responder comando', 'n8n-nodes-base.respondToWebhook', { respondWith:'json',responseBody:'={{ $json }}',options:{} },1.4);
  route(hook.name, [[commandCfg.name]]);route(commandCfg.name,[['CRM | Validar comando autorizado']]);route('CRM | Validar comando autorizado',[['CRM | Aplicar comando central']]);route('CRM | Aplicar comando central',[['CRM | Cancelamento Google solicitado?']]);
  route('CRM | Cancelamento Google solicitado?', [['CRM | Preparar cancelamento'],['CRM | Preparar projecao do comando']]);
  route('CRM | Preparar cancelamento',[['CRM | Chamar Agendamentos']]);route('CRM | Chamar Agendamentos',[['CRM | Conferir cancelamento duravel']]);route('CRM | Conferir cancelamento duravel',[['CRM | Preparar projecao do comando']]);route('CRM | Preparar projecao do comando',[['CRM | Projetar comando']]);route('CRM | Projetar comando',[['CRM | Recibo do comando']]);route('CRM | Recibo do comando',[['CRM | Responder comando']]);

  // Recovery resends immutable CRM events only, never provider actions.
  pg('CRM | Buscar outbox pendente', 'SELECT * FROM public.lexia_migration_claim_crm($1::uuid,$2,$3,$4::jsonb);', `[${ref('OPERACAO | Selecionar tarefa')}.conversation_id,${ref(cfg)}.environment,${ref(cfg)}.cliente_slug,JSON.stringify(${ref(cfg)}.account_refs)]`);
  const send = add('CRM | Recuperar evento no Frappe', 'n8n-nodes-base.httpRequest', { method:'POST',url:`={{ ${ref(cfg)}.crm_event_endpoint }}`,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ {event:$json.event} }}',options:{timeout:15000,response:{response:{fullResponse:true,neverError:true}}} },4.2);
  send.credentials={httpHeaderAuth:{name:'Lexia API Frappe'}};send.onError='continueRegularOutput';
  const policy=bundleForN8n(resolve(root,'scripts/lib/miranda-migration-policy.mjs'),'Migration');
  code('CRM | Conferir recibo recuperado',policy+`\nconst r=${ref('CRM | Buscar outbox pendente')};return [{json:{...r,confirmed:Migration.crmReceiptConfirmed($json,r.event.event_id)}}];`);
  pg('CRM | Finalizar recuperacao', 'SELECT public.lexia_migration_finish_crm($1::uuid,$2::uuid,$3::boolean);','[$json.id,$json.claim_token,$json.confirmed]');
  route('CRM | Buscar outbox pendente',[['CRM | Recuperar evento no Frappe']]);route('CRM | Recuperar evento no Frappe',[['CRM | Conferir recibo recuperado']]);route('CRM | Conferir recibo recuperado',[['CRM | Finalizar recuperacao']]);

  const team=bundleForN8n(resolve(root,'scripts/lib/miranda-team-notifications.mjs'),'Team');
  pg('EQUIPE | Ler notificacoes pendentes', `SELECT n.*,s.environment,s.cliente_slug,s.account_id AS account_ref,s.conversation_ref,a.provider
FROM public.lexia_team_notifications n JOIN public.lexia_conversation_states s ON s.id=n.conversation_id JOIN public.lexia_channel_accounts a ON a.id=s.account_id
WHERE s.id=$1::uuid AND s.environment=$2 AND s.cliente_slug=$3 AND $4::jsonb ? s.account_id::text AND n.status='pending' ORDER BY n.created_at,n.id LIMIT 100;`,
    `[${ref('OPERACAO | Selecionar tarefa')}.conversation_id,${ref(cfg)}.environment,${ref(cfg)}.cliente_slug,JSON.stringify(${ref(cfg)}.account_refs)]`).alwaysOutputData=true;
  add('EQUIPE | Uma notificacao por vez','n8n-nodes-base.splitInBatches',{batchSize:1,options:{}},3);
  code('EQUIPE | Preparar notificacao',team+`\nconst c=${ref(cfg)};const row=$json;
return [{json:row.id?Team.prepareNotification(row,{...c.team_notifications,environment:c.environment,cliente_slug:c.cliente_slug,account_refs:c.account_refs}):{ready:false,reason:'empty_queue'},pairedItem:{item:0}}];`);
  iff('EQUIPE | Destino revisado?', '$json.ready===true');
  pg('EQUIPE | Reservar notificacao','SELECT public.lexia_migration_claim_team($1::uuid,$2,$3,$4::jsonb) AS claim;',
    `[$json.id,${ref(cfg)}.environment,${ref(cfg)}.cliente_slug,JSON.stringify(${ref(cfg)}.account_refs)]`);
  iff('EQUIPE | Reserva exclusiva?','$json.claim?.acquired===true');
  iff('EQUIPE | Handoff Z-API?',"$('EQUIPE | Preparar notificacao').item.json.provider==='zapi'");
  for(const provider of ['Z-API','UAZAPI']) {
    const n=add('EQUIPE | Enviar '+provider,'n8n-nodes-base.httpRequest',{method:'POST',url:"={{ $('EQUIPE | Preparar notificacao').item.json.url }}",authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:"={{ $('EQUIPE | Preparar notificacao').item.json.body }}",options:{timeout:15000,response:{response:{fullResponse:true,neverError:true}}}},4.2);
    n.credentials={httpHeaderAuth:{name:provider==='Z-API'?'Lexia Z-API Client-Token':'Lexia UAZAPI Token'}};n.onError='continueRegularOutput';
  }
  code('EQUIPE | Classificar comprovante',team+"\nreturn [{json:Team.notificationOutcome($json,$('EQUIPE | Preparar notificacao').item.json.provider),pairedItem:{item:0}}];");
  pg('EQUIPE | Guardar resultado','SELECT public.lexia_migration_finish_team($1::uuid,$2::uuid,$3,$4);',"[$('EQUIPE | Reservar notificacao').item.json.claim.id,$('EQUIPE | Reservar notificacao').item.json.claim.claim_token,$json.status,$json.provider_message_id]");
  code('EQUIPE | Retornar tarefa',"return [{json:{operation:'team.dispatch',provider_retry_enabled:false}}];");
  route('EQUIPE | Ler notificacoes pendentes',[['EQUIPE | Uma notificacao por vez']]);route('EQUIPE | Uma notificacao por vez',[['EQUIPE | Retornar tarefa'],['EQUIPE | Preparar notificacao']]);route('EQUIPE | Preparar notificacao',[['EQUIPE | Destino revisado?']]);route('EQUIPE | Destino revisado?',[['EQUIPE | Reservar notificacao'],['EQUIPE | Uma notificacao por vez']]);route('EQUIPE | Reservar notificacao',[['EQUIPE | Reserva exclusiva?']]);route('EQUIPE | Reserva exclusiva?',[['EQUIPE | Handoff Z-API?'],['EQUIPE | Uma notificacao por vez']]);route('EQUIPE | Handoff Z-API?',[['EQUIPE | Enviar Z-API'],['EQUIPE | Enviar UAZAPI']]);route('EQUIPE | Enviar Z-API',[['EQUIPE | Classificar comprovante']]);route('EQUIPE | Enviar UAZAPI',[['EQUIPE | Classificar comprovante']]);route('EQUIPE | Classificar comprovante',[['EQUIPE | Guardar resultado']]);route('EQUIPE | Guardar resultado',[['EQUIPE | Uma notificacao por vez']]);

  // A notification failure does not prevent CRM mirroring or lead delivery;
  // the queue still records pending/claimed/unknown for separate reconciliation.
  code('EQUIPE | Preparar despacho apos lote',`return [{json:{operation:'team.dispatch',conversation_id:${ref('LEXIA | Registro individual confirmado')}.conversation_id}}];`);
  const teamCall=call('EQUIPE | Despachar neste omnichannel');teamCall.onError='continueRegularOutput';teamCall.alwaysOutputData=true;
  route('LEXIA | Agendar follow-up central',[['EQUIPE | Preparar despacho apos lote']]);route('EQUIPE | Preparar despacho apos lote',[['EQUIPE | Despachar neste omnichannel']]);route('EQUIPE | Despachar neste omnichannel',[['CRM | Conversa virtual?']]);

  // A disabled periodic lane repairs projections and CRM state independently
  // of receiving another customer message. It never retries provider actions.
  add('MANUTENCAO | Manual','n8n-nodes-base.manualTrigger',{},1);
  add('MANUTENCAO | A cada minuto','n8n-nodes-base.scheduleTrigger',{rule:{interval:[{field:'minutes',minutesInterval:1}]}},1.2).disabled=true;
  pg('MANUTENCAO | Buscar conversas pendentes', `SELECT s.id AS conversation_id FROM public.lexia_conversation_states s
WHERE s.environment=$1 AND s.cliente_slug=$2 AND $3::jsonb ? s.account_id::text AND (
s.projection_status='stale' OR EXISTS(SELECT 1 FROM public.lexia_conversation_blocks b WHERE b.conversation_id=s.id AND b.status='active' AND b.expires_at<=clock_timestamp())
OR EXISTS(SELECT 1 FROM public.lexia_crm_delivery_outbox o WHERE o.conversation_id=s.id AND o.status<>'delivered')
OR EXISTS(SELECT 1 FROM public.lexia_team_notifications t WHERE t.conversation_id=s.id AND t.status='pending')) ORDER BY s.atualizado_em LIMIT 100;`,
    `[${ref(cfg)}.environment,${ref(cfg)}.cliente_slug,JSON.stringify(${ref(cfg)}.account_refs)]`);
  add('MANUTENCAO | Uma conversa por vez','n8n-nodes-base.splitInBatches',{batchSize:1,options:{}},3);
  code('MANUTENCAO | Preparar projecao',"return [{json:{operation:'projection',conversation_id:$json.conversation_id},pairedItem:{item:0}}];");
  call('MANUTENCAO | Projetar estado');
  code('MANUTENCAO | Preparar espelho',"return [{json:{operation:'crm.snapshot',conversation_id:$('MANUTENCAO | Uma conversa por vez').item.json.conversation_id},pairedItem:{item:0}}];");
  const mirror=call('MANUTENCAO | Atualizar CRM');mirror.onError='continueRegularOutput';mirror.alwaysOutputData=true;
  code('MANUTENCAO | Preparar notificacoes',"return [{json:{operation:'team.dispatch',conversation_id:$('MANUTENCAO | Uma conversa por vez').item.json.conversation_id},pairedItem:{item:0}}];");
  const notify=call('MANUTENCAO | Despachar equipe');notify.onError='continueRegularOutput';notify.alwaysOutputData=true;
  const chain=[cfg,'MANUTENCAO | Buscar conversas pendentes','MANUTENCAO | Uma conversa por vez'];
  route('MANUTENCAO | Manual',[[chain[0]]]);route('MANUTENCAO | A cada minuto',[[chain[0]]]);
  for(let i=1;i<chain.length;i++)route(chain[i-1],[[chain[i]]]);
  route(chain.at(-1),[[],['MANUTENCAO | Preparar projecao']]);
  const tasks=['MANUTENCAO | Preparar projecao','MANUTENCAO | Projetar estado','MANUTENCAO | Preparar espelho','MANUTENCAO | Atualizar CRM','MANUTENCAO | Preparar notificacoes','MANUTENCAO | Despachar equipe','MANUTENCAO | Uma conversa por vez'];
  for(let i=1;i<tasks.length;i++)route(tasks[i-1],[[tasks[i]]]);
  code('OPERACAO | Identificar entrada de controle',`let source='maintenance';
try{$('LEXIA | Evento interno individual').first();source='task';}catch{}
try{$('CRM | Webhook Comandos').first();source='command';}catch{}
return [{json:{source}}];`);
  iff('OPERACAO | Comando autenticado?',"$json.source==='command'");
  iff('OPERACAO | Manutencao agendada?',"$json.source==='maintenance'");
  route(cfg,[['OPERACAO | Identificar entrada de controle']]);route('OPERACAO | Identificar entrada de controle',[['OPERACAO | Comando autenticado?']]);
  route('OPERACAO | Comando autenticado?',[['CRM | Validar comando autorizado'],['OPERACAO | Manutencao agendada?']]);
  route('OPERACAO | Manutencao agendada?',[['MANUTENCAO | Buscar conversas pendentes'],['OPERACAO | Selecionar tarefa']]);
}
