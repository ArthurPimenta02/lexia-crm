import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { auditMigration } from '../scripts/build-miranda-migration-review.mjs';
const directory='n8n/miranda-migration-review';
const files=readdirSync(directory).filter(f=>f.endsWith('.inactive.json'));
const workflows=files.map(f=>JSON.parse(readFileSync(directory+'/'+f)));
const omni=workflows[0],brain=workflows[1],booking=workflows[5];
const get=(w,name)=>w.nodes.find(n=>n.name===name);
const edges=(w,name)=>w.connections[name]?.main?.flat().map(e=>e.node)||[];
const reachable=(w,start,target)=>{
  const seen=new Set(),queue=[start];
  while(queue.length){const n=queue.shift();if(n===target)return true;if(seen.has(n))continue;seen.add(n);queue.push(...edges(w,n));}return false;
};
test('exactly six inactive sanitized exports, syntax/graph/credentials and non-overlapping node centers',()=>{
  assert.equal(files.length,6);for(const w of workflows)assert.equal(auditMigration(w).active,false);
});
test('all literal expression references exist after removing obsolete/disconnected nodes',()=>{
  for(const w of workflows){const names=new Set(w.nodes.map(n=>n.name));for(const n of w.nodes)for(const m of JSON.stringify(n.parameters).matchAll(/\$\((?:'([^']+)'|"([^"]+)")\)/g))assert.ok(names.has(m[1]||m[2]),n.name+':'+(m[1]||m[2]));}
});
test('original media, buffer, context, human audio and brain intelligence survive',()=>{
  for(const name of ['Wait','Redis_Buffer2','Transcribe a recording','Analyze image','Extract from File','Analyze video','Agente de Contexto',
    'Set Intervenção Humana','Transcrever Áudio da Intervenção','Buscar Histórico da Conversa'])assert.ok(get(omni,name),name);
  for(const name of ['Especialista em Serviços','Orquestrador de Atendimento','Orquestrador de Agendamento','Redator — Voz do Cliente','Buscar Playbook de Vendas (Cérebro)'])assert.ok(get(brain,name),name);
  assert.match(get(brain,'Orquestrador de Atendimento').parameters.options.systemMessage,/POLÍTICA DE PAGAMENTO/);
  assert.match(get(brain,'Especialista em Serviços').parameters.options.systemMessage,/PREÇOS POR VARIANTE/);
});
test('individual persistence precedes human block/media and paused lead exit',()=>{
  assert.match(get(omni,'LEXIA | Preparar registro individual').parameters.jsCode,/Migration\.assertVirtualScope/);
  assert.ok(reachable(omni,'Normalizar Dados Operacionais','LEXIA | Persistir evento e mensagem'));
  assert.ok(reachable(omni,'LEXIA | Persistir evento e mensagem','Set Intervenção Humana'));
  assert.ok(reachable(omni,'Set Intervenção Humana','Intervenção é áudio?'));
  assert.deepEqual(edges(omni,'Set Intervenção Humana'),['ESTADO | Antes de Intervenção é áudio?']);
  assert.ok(reachable(omni,'LEXIA | Enfileirar lead duravel','LEXIA | Checar todos os bloqueios'));
  assert.ok(reachable(omni,'Agente desativado?','CRM | Ler espelho da conversa'));
});
test('normal handoff returns to proposed delivery; urgent/high stop the batch',()=>{
  assert.match(get(omni,'LEXIA | Registrar handoff independente').parameters.query,/lexia_migration_handoff/);
  assert.match(get(omni,'LEXIA | Handoff bloqueante?').parameters.conditions.conditions[0].leftValue,/alta.*urgente/);
  assert.deepEqual(omni.connections['LEXIA | Handoff bloqueante?'].main[0].map(e=>e.node),['LEXIA | Concluir lote']);
  assert.deepEqual(omni.connections['LEXIA | Handoff bloqueante?'].main[1].map(e=>e.node),['Preparar Saída Omnichannel']);
  assert.equal(brain.nodes.filter(n=>/redis|httpRequest/.test(n.type)).length,0);
});
test('shared delivery takes final per-action claim, commits outcome and stops on uncertain result',()=>{
  assert.deepEqual(edges(omni,'ENTREGA | Claim exclusivo?'),['ENTREGA | Enviar ao provedor','ENTREGA | Proxima acao?']);
  assert.ok(reachable(omni,'ENTREGA | Enviar ao provedor','ENTREGA | Confirmar entrega e historico'));
  assert.equal(get(omni,'ENTREGA | Enviar ao provedor').retryOnFail,false);
  assert.match(get(omni,'ENTREGA | Classificar retorno do provedor').parameters.jsCode,/delivery_unknown|requires_reconciliation/);
  for(const w of workflows.slice(2,4))assert.ok(w.nodes.some(n=>n.type==='n8n-nodes-base.executeWorkflow'));
});
test('CRM writes durable outbox before HTTP and compares actual acknowledgment, not HTTP status alone',()=>{
  assert.deepEqual(edges(omni,'CRM | Registrar outbox duravel'),['CRM | Reservar espelho idempotente']);
  assert.ok(reachable(omni,'CRM | Reservar espelho idempotente','CRM | Enviar evento ao Frappe'));
  assert.match(get(omni,'CRM | Confirmar espelho').parameters.jsCode,/crmReceiptConfirmed/);
  assert.ok(reachable(omni,'CRM | Confirmar espelho','CRM | Registrar resultado do espelho'));
  assert.doesNotMatch(get(omni,'CRM | Ler espelho da conversa').parameters.query,/o\.criado_em/);
});
test('authenticated CRM command lane is separate from lead ingress and cancellation reads durable outcome',()=>{
  assert.equal(get(omni,'CRM | Webhook Comandos').parameters.authentication,'headerAuth');
  assert.ok(reachable(omni,'CRM | Webhook Comandos','CRM | Aplicar comando central'));
  assert.ok(reachable(omni,'CRM | Chamar Agendamentos','CRM | Conferir cancelamento duravel'));
  assert.match(get(omni,'CRM | Conferir cancelamento duravel').parameters.query,/command_receipt/);
  assert.equal(reachable(omni,'CRM | Webhook Comandos','Normalizar Dados Operacionais'),false);
});
test('projection uses native Redis, explicit tenant/account authorization and version-bound completion',()=>{
  assert.equal(get(omni,'ESTADO | Projetar Redis').type,'n8n-nodes-base.redis');
  assert.match(get(omni,'ESTADO | Ler snapshot autorizado').parameters.query,/projection_snapshot/);
  assert.match(get(omni,'ESTADO | Confirmar versao projetada').parameters.query,/complete_projection/);
  assert.ok(reachable(omni,'ESTADO | Antes de ENTREGA | Registrar plano idempotente','ENTREGA | Registrar plano idempotente'));
});
test('original follow-up scheduling preserves requested day/time, vague promises and commercial window',()=>{
  const js=get(omni,'Preparar Follow-up').parameters.jsCode;
  assert.match(js,/extrairDiaCombinado/);assert.match(js,/pedido \+ 15/);assert.match(js,/hours: 23/);
  assert.match(js,/hours: 1/);assert.match(js,/weekday === 7/);
  assert.ok(reachable(omni,'LEXIA | Concluir lote','LEXIA | Agendar follow-up central'));
  assert.equal(get(workflows[2],'Buscar Follow-ups Vencidos').type,'n8n-nodes-base.postgres');
  assert.match(get(workflows[2],'Buscar Follow-ups Vencidos').parameters.query,/account_ref=\$3/);
});
test('read-only appointment agent retains original intelligence but exposes no create tool',()=>{
  const name='Orquestrador de Agendamento (somente disponibilidade)';assert.ok(get(brain,name));
  assert.ok(Object.values(brain.connections.verificar_disponibilidade).flat(2).some(e=>e.node===name));
  assert.equal(Object.values(brain.connections.criar_agendamento).flat(2).some(e=>e.node===name),false);
  assert.match(get(brain,'LEXIA | Validar origem e limites').parameters.jsCode,/calendarBrainConfig/);
  assert.match(get(booking,'Evento confirmado?').parameters.query,/a.status='confirmed' AND a.cancellation_status IS NULL/);
  for(const w of workflows)for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.postgres'))assert.equal(n.parameters.options.largeNumbersOutput,'numbers');
});
test('test chat bypasses operational inbox; no original public webhook paths reused',()=>{
  assert.deepEqual(omni.connections['CRM | Conversa virtual?'].main[0].map(e=>e.node),['LEXIA | Devolver resposta virtual']);
  assert.match(get(omni,'LEXIA | Webhook Teste Frappe').parameters.path,/migration-agent-test/);
  for(const w of workflows)for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.scheduleTrigger'))assert.equal(n.disabled,true);
});
test('cancellation never takes a model event ID; claims mapped target, deletes and verifies absence',()=>{
  assert.match(get(booking,'CANCELAR | Reservar operacao').parameters.query,/lexia_migration_claim_cancel/);
  assert.match(get(booking,'CANCELAR | Excluir evento mapeado').parameters.eventId,/Reservar operacao.*provider_event_id/);
  assert.deepEqual(edges(booking,'CANCELAR | Excluir evento mapeado'),['CANCELAR | Verificar ausencia no Google']);
  assert.equal(get(booking,'CANCELAR | Configuracao confiavel').parameters.assignments.assignments.find(a=>a.name==='cancellation_enabled').value,false);
});
test('SQL dependencies are review-only, additive and deny browser roles',()=>{
  const sql=readFileSync('supabase/review/miranda-migration/202610120002_migration_control.sql','utf8');
  assert.doesNotMatch(sql,/^\s*(drop|truncate|delete from)\b/im);
  assert.match(sql,/revoke all on function/);assert.match(sql,/enable row level security/);
  assert.match(sql,/cancel_claim_mismatch/);assert.match(sql,/booking_receipt_origin_mismatch/);
  assert.match(sql,/s\.id,'google-cancel-request:'/);
});
test('manifest explicitly lists unfinished integration and never claims production readiness',()=>{
  const m=JSON.parse(readFileSync(directory+'/MANIFEST.json'));assert.equal(m.status,'review_candidate_not_integrated');
  assert.ok(m.pending.length>=5);assert.equal(m.notification_providers.appointment,'uazapi');
  assert.equal(m.resources,'persistent_shared_central_private_per_brain');
});
