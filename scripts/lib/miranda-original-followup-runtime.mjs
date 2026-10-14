// These snippets execute inside the original n8n graph, without hidden HTTP calls.
export const runtime = {
  config: `
const c = $('Config Follow-up').first().json;
if (c.environment !== 'isolated_test' || !/^[a-z0-9]{20}$/.test(c.test_project_ref || '') || !/^[a-z0-9_]+$/.test(c.cliente_slug || '')) throw new Error('configure_isolated_followup');
if (!['preview','shared_delivery'].includes(c.delivery_mode)) throw new Error('invalid_delivery_mode');
LexiaSchema.assertJsonSchemaValue({type:'string',format:'uuid'},c.account_ref,'account_ref');
if (c.delivery_mode === 'shared_delivery' && (c.delivery_contract_reviewed !== true || !c.delivery_workflow_ref)) throw new Error('shared_delivery_not_reviewed');
return [{json:c}];`,
  identity: `
const c = $('Config Follow-up').first().json;
const sql = $('LEXIA | Conferir banco de teste').first().json.identities;
const api = $input.all().map(i=>i.json).filter(i=>Object.keys(i).length);
if (!Array.isArray(sql) || sql.length !== 1 || api.length !== 1) throw new Error('disposable_identity_unavailable');
for (const m of [sql[0],api[0]]) if (m.id !== true || m.project_ref !== c.test_project_ref || m.environment !== c.environment || m.disposable !== true) throw new Error('disposable_identity_mismatch');
return [{json:c}];`,
  scope: `
const c = $('Config Follow-up').first().json;
const lead = $('Loop Follow-ups - Leads').item.json;
const rows = $json.states;
if (!lead.id && !lead.identificador) return [];
if (lead.cliente_slug !== c.cliente_slug || !['whatsapp','instagram','messenger'].includes(lead.canal) || lead.status!=='agendado') throw new Error('followup_tenant_or_channel_mismatch');
if (!Array.isArray(rows) || rows.length !== 1) throw new Error('legacy_conversation_ambiguous_or_missing');
const s=rows[0];
if (s.environment !== c.environment || s.cliente_slug !== c.cliente_slug || s.account_id !== c.account_ref || s.channel !== lead.canal || s.identificador_conversa !== lead.identificador || !s.conversation_ref) throw new Error('followup_scope_mismatch');
for(const key of ['ultima_msg_cliente_em','proxima_tentativa_em']) LexiaSchema.assertJsonSchemaValue({type:'string',format:'date-time'},lead[key],key);
if (Date.parse(lead.proxima_tentativa_em)>Date.parse($now.toISO())) throw new Error('followup_not_due');
for(const key of ['state_version','delivery_epoch','lead_message_seq']) if (!Number.isSafeInteger(s[key]) || s[key]<0) throw new Error('invalid_captured_state');
const blocked = s.blocked === true || s.projection_status !== 'current' || s.account_status !== 'active';
return [{json:{...lead,_due_at:lead.proxima_tentativa_em,scope:{environment:s.environment,cliente_slug:s.cliente_slug,channel:s.channel,account_ref:s.account_id,conversation_ref:s.conversation_ref},
  conversation_id:s.id,contacto_id:s.contacto_id,captured_state:{state_version:s.state_version,delivery_epoch:s.delivery_epoch},lead_cutoff_seq:s.lead_message_seq,
  request_id:s.request_id,action_id:s.action_id,event_ids:s.event_ids,existing_action_status:s.existing_action_status,_provider:s.provider,
  _blocked:blocked,_reason:blocked?'conversation_blocked':'',_now:$now.toISO()},pairedItem:{item:0}}];`,
  early: `
const lead=$json;
if (lead.existing_action_status) return [{json:{...lead,acao:'ja_processado'}}];
if (lead._blocked) return [{json:{...lead,acao:'bloqueado'}}];
if (lead.canal === 'whatsapp' && lead._provider !== 'fake' && $('Config Follow-up').first().json.require_contact_check === true) {
  // This result must come from the reviewed contact adapter, never from the model.
  if (typeof lead.contact_saved !== 'boolean' || lead.contact_check_verified !== true) return [{json:{...lead,acao:'bloqueado',_reason:'contact_check_unavailable'}}];
  if (lead.contact_saved) return [{json:{...lead,acao:'reagendar',status:'encerrado',motivo_trava:'contact_saved'}}];
}
return [{json:lead}];`,
  model: `
if ($('Config Follow-up').first().json.models_reviewed !== true) throw new Error('select_isolated_model_credential_and_review');
return [{json:$json,pairedItem:{item:0}}];`,
  proposal: `
const lead = $json;
const scope=lead.scope;
const content = lead.tipo_envio === 'audio' ? {type:'audio',media_ref:lead.audio_url} : {type:'text',text:lead.texto_followup};
if (content.type === 'text') {
  if (!content.text.trim()) throw new Error('empty_followup');
  if (lead.followups_anteriores.some(f=>String(f).trim()===content.text.trim())) throw new Error('repeated_followup');
  if (!LexiaLanguage.validateResponseLanguages(lead.idioma_cliente,[content.text]).allowed) throw new Error('followup_language_mismatch');
}
const req={schema_version:'lexia.automation.request.v1',request_id:lead.request_id,kind:'followup',scope,
  source_ref:'followup:'+lead.id+':'+lead.ultima_msg_cliente_em,due_at:lead._due_at,
  proposed_actions:[{schema_version:'lexia.outbound.action.v1',action_id:lead.action_id,invocation_id:lead.request_id,scope,sequence:1,kind:'followup',captured_state:lead.captured_state,content,source_ref:'followup:'+lead.id+':'+lead.ultima_msg_cliente_em}]};
LexiaSchema.assertContractSchema('automation-request',req);
return [{json:{...lead,automation_request:req,lead_cutoff_seq:lead.lead_cutoff_seq},pairedItem:{item:0}}];`,
  permission: `
const p = $('LEXIA | Montar pedido de automacao').item.json;
if (typeof $json.permitted !== 'boolean') throw new Error('permission_unavailable');
return [{json:{...p,_permitted:$json.permitted},pairedItem:{item:0}}];`,
  preview: `
const p=$json;
return [{json:{request_id:p.request_id,scope:p.scope,captured_state:p.captured_state,
  results:[{schema_version:'lexia.delivery.result.v1',action_id:p.action_id,status:'suppressed',attempted_at:$now.toISO(),reason:p._permitted?'preview_not_sent':'state_changed'}]},pairedItem:{item:0}}];`,
  receipt: `
const p=$('LEXIA | Montar pedido de automacao').item.json;
let r=$json;
if (r.error || !r.request_id) r={request_id:p.request_id,scope:p.scope,captured_state:p.captured_state,results:[{schema_version:'lexia.delivery.result.v1',action_id:p.action_id,status:'delivery_unknown',attempted_at:$now.toISO(),reason:'delivery_child_result_unavailable'}]};
LexiaSchema.assertJsonSchemaValue({type:'object',additionalProperties:false,required:['request_id','scope','captured_state','results'],properties:{request_id:{type:'string',format:'uuid'},scope:{type:'object'},captured_state:{type:'object'},results:{type:'array',minItems:1,maxItems:1,items:{$ref:'https://contracts.uselexia.invalid/omnichannel/v1/delivery-result.schema.json'}}}},r,'followup_receipt');
if (r.request_id!==p.request_id || ['environment','cliente_slug','channel','account_ref','conversation_ref'].some(k=>r.scope[k]!==p.scope[k]) || Object.keys(r.scope).length!==5 || r.captured_state.state_version!==p.captured_state.state_version || r.captured_state.delivery_epoch!==p.captured_state.delivery_epoch || Object.keys(r.captured_state).length!==2 || r.results[0].action_id!==p.action_id) throw new Error('delivery_receipt_origin_mismatch');
return [{json:{...p,receipt:r.results[0]},pairedItem:{item:0}}];`,
  proof: `
const p=$('LEXIA | Conferir recibo de entrega').item.json;
const rows=$json.actions;
if (!Array.isArray(rows) || rows.length>1) throw new Error('delivery_ledger_invalid');
const a=rows[0];
const content=p.automation_request.proposed_actions[0].content;
if (a && (a.id!==p.action_id || a.conversation_id!==p.conversation_id || a.automation_request_id!==p.request_id || a.kind!=='followup' || a.source_ref!==p.automation_request.source_ref || a.captured_state_version!==p.captured_state.state_version || a.captured_delivery_epoch!==p.captured_state.delivery_epoch || !a.content || Object.keys(a.content).length!==Object.keys(content).length || Object.keys(content).some(k=>a.content[k]!==content[k]))) throw new Error('delivery_ledger_origin_mismatch');
let status=p.receipt.status, confirmed=false;
if (status==='sent' || status==='duplicate') {
  confirmed=!!a && a.status==='sent' && !!a.provider_message_id && (!p.receipt.provider_message_id || p.receipt.provider_message_id===a.provider_message_id);
  status=confirmed?'sent':'delivery_unknown';
} else if (a?.status==='sent' && a.provider_message_id) { confirmed=true; status='sent'; }
else if (status==='failed' && a?.status!=='failed') status='delivery_unknown';
else if (a && ['claimed','delivery_unknown'].includes(a.status)) status='delivery_unknown';
const hold=(!a && ['preview_not_sent','state_changed','preflight_unavailable','source_or_projection_unavailable'].includes(p.receipt.reason)) || (a?.status==='suppressed' && a.reason==='virtual_delivered' && p.receipt.reason==='virtual_delivered');
if(confirmed) LexiaSchema.assertJsonSchemaValue({type:'string',format:'date-time'},a.concluido_em,'provider_confirmed_at');
return [{json:{...p,receipt:confirmed?{...p.receipt,attempted_at:a.concluido_em}:p.receipt,confirmed,status:hold?'pending':status,reason:confirmed?'provider_confirmed':hold?p.receipt.reason:status==='delivery_unknown'?'requires_reconciliation':p.receipt.reason || 'not_sent',provider_message_id:confirmed?a.provider_message_id:null},pairedItem:{item:0}}];`,
  outcome: `
const p=$('LEXIA | Exigir historico confirmado').item.json;
return [{json:{...p,queue_updated:$json.updated===true},pairedItem:{item:0}}];`,
  deferred: `
const p=$json;
const c=$('Config Follow-up').first().json;
const snapshot={...p};
if (p.decisao==='pular') {
  snapshot.etapa_nova=2;
  snapshot.status_novo=p.etapa>=2?'encerrado':'agendado';
  const next=Date.parse(p.ultima_msg_cliente_em)+23*3600000;
  snapshot.proxima_tentativa_nova=new Date(Math.max(next,Date.parse($now.toISO())+3600000)).toISOString();
} else {
  snapshot.etapa_nova=p.etapa;
  snapshot.status_novo=p.decisao==='encerrar'?'encerrado':p.status || 'agendado';
  snapshot.proxima_tentativa_nova=p.proxima_tentativa_em;
}
snapshot.motivo_encerramento_novo=p.motivo_juiz || p.motivo_trava || '';
snapshot._queue_mutation_allowed=c.delivery_mode==='shared_delivery';
return [{json:snapshot,pairedItem:{item:0}}];`,
  deferredResult: `
const p=$('LEXIA | Preparar mudanca da fila').item.json;
const updated=$json.updated===true;
return [{json:{...p,status:updated?(p.status_novo==='encerrado'?'cancelled':'scheduled'):'pending',reason:updated?p.motivo_encerramento_novo:'preview_or_queue_changed',queue_updated:updated},pairedItem:{item:0}}];`,
  notice: `
const p=$json;
return [{json:{...p,status:'pending',reason:p._reason || 'manual_contact_required',notification_send_attempted:false},pairedItem:{item:0}}];`,
  event: `
const p=$json;
const status=p.status || 'suppressed';
// Pre-claim holds are not terminal suppression. Phase IDs avoid conflicting
// payloads under one event ID as a paused attempt later becomes a proposal.
const key=status==='pending'?({preview_not_sent:'preview',virtual_delivered:'virtual',state_changed:'state_hold',conversation_blocked:'block_hold',contact_check_unavailable:'contact_hold',manual_contact_required:'manual_hold',preview_or_queue_changed:'queue_hold'}[p.reason] || 'pending'):status;
const event_id=p.event_ids?.[key];
if (!event_id) throw new Error('crm_event_identity_unavailable');
const event={schema_version:'lexia.crm.event.v1',event_id,idempotency_key:'lexia:crm:followup:'+event_id,correlation_id:p.request_id,
 event_type:'automation.updated',occurred_at:p.confirmed?p.receipt.attempted_at:$now.toISO(),emitted_at:$now.toISO(),sequence:status==='pending'||status==='scheduled'?1:2,
 scope:p.scope,source:{system:'workflow',authority:'workflow_execution',workflow_ref:'miranda-followup-original-crm-v1',execution_ref:String($execution.id)},
 payload:{automation_ref:p.request_id,automation_type:'followup',status,source_ref:'followup:'+p.id+':'+p.ultima_msg_cliente_em,due_at:p._due_at,reason:String(p.reason || '').slice(0,512),...(p.action_id?{action_ref:p.action_id}:{}),...(p.receipt?{attempted_at:p.receipt.attempted_at}:{})}};
LexiaSchema.assertContractSchema('crm-sync-event',event);
let message_event=null;
if (p.confirmed) {
  if (!p.message_id) throw new Error('confirmed_message_identity_required');
  const content=p.automation_request.proposed_actions[0].content;
  message_event={...event,event_id:p.event_ids.message,idempotency_key:'lexia:crm:followup:'+p.event_ids.message,event_type:'message.recorded',sequence:1,
    payload:{message_id:p.message_id,direction:'outbound',author:'ai',message_type:content.type,delivery_status:'sent',provider_message_ref:p.provider_message_id,action_id:p.action_id,
      ...(content.type==='text'?{text:content.text}:{media_ref:content.media_ref})}};
  LexiaSchema.assertContractSchema('crm-sync-event',message_event);
}
return [{json:{crm_event:event,message_event,confirmed:p.confirmed===true,preview:$('Config Follow-up').first().json.delivery_mode==='preview',queue_updated:p.queue_updated===true,
 pipeline_signal:status==='sent'?'followup_sent_confirmed':null,automation_request:p.automation_request || null},pairedItem:{item:0}}];`,
};

// SQL is shipped as node configuration only. The builder and tests never connect.
const hashUuid = expression => `(substr(${expression},1,8)||'-'||substr(${expression},9,4)||'-4'||substr(${expression},14,3)||'-8'||substr(${expression},18,3)||'-'||substr(${expression},21,12))::uuid`;
export const sql = {
  identity: 'SELECT coalesce(jsonb_agg(to_jsonb(i)),\'[]\'::jsonb) AS identities FROM public.lexia_environment_identity i;',
  scope: `WITH l AS (SELECT $1::jsonb AS data), matches AS (
SELECT s.*,a.status AS account_status,a.provider,public.lexia_omni_has_active_block(s.id,clock_timestamp()) AS blocked,
  jsonb_build_array(s.environment,s.cliente_slug,s.channel,s.account_id,s.conversation_ref,l.data->>'id',l.data->>'etapa',l.data->>'ultima_msg_cliente_em')::text AS identity
FROM public.lexia_conversation_states s JOIN public.lexia_channel_accounts a ON a.id=s.account_id CROSS JOIN l
WHERE s.environment=$2 AND s.cliente_slug=$3 AND s.channel=l.data->>'canal' AND s.identificador_conversa=l.data->>'identificador'
), resolved AS (SELECT m.*,${hashUuid("md5(identity)")} AS request_id,${hashUuid("md5(identity||':action:1')")} AS action_id,
(SELECT jsonb_object_agg(status,${hashUuid("md5(identity||':event:'||status)")}) FROM unnest(ARRAY['scheduled','pending','sent','suppressed','cancelled','failed','delivery_unknown','message','preview','virtual','state_hold','block_hold','contact_hold','manual_hold','queue_hold']) status) AS event_ids FROM matches m)
SELECT coalesce(jsonb_agg((to_jsonb(resolved)-'identity')||jsonb_build_object('existing_action_status',(SELECT o.status FROM public.lexia_outbound_actions o WHERE o.id=resolved.action_id))),'[]'::jsonb) AS states FROM resolved;`,
  history: `SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.criado_em,m.id),'[]'::jsonb) AS messages FROM (
SELECT m.* FROM public.lexia_mensagens m JOIN public.lexia_conversation_states s ON s.id=m.omni_conversation_id WHERE s.id=$1::uuid AND s.environment=$2 AND s.cliente_slug=$3
AND (m.omni_author<>'ai' OR EXISTS(SELECT 1 FROM public.lexia_outbound_actions a WHERE a.id=m.omni_action_id AND a.conversation_id=s.id AND a.status='sent' AND a.provider_message_id=m.provider_message_id))
ORDER BY m.criado_em DESC,m.id DESC LIMIT 200) m;`,
  permission: `SELECT EXISTS(SELECT 1 FROM public.lexia_conversation_states s JOIN public.lexia_channel_accounts a ON a.id=s.account_id
JOIN public.lexia_followups f ON f.id::text=$1
WHERE s.id=$2::uuid AND s.environment=$3 AND s.cliente_slug=$4 AND s.account_id=$5::uuid AND s.conversation_ref=$6
AND s.state_version=$7 AND s.delivery_epoch=$8 AND s.lead_message_seq=$9 AND s.projection_status='current'
AND a.status='active' AND NOT public.lexia_omni_has_active_block(s.id,clock_timestamp())
AND extract(isodow FROM clock_timestamp() AT TIME ZONE 'America/New_York')<>7
AND extract(hour FROM clock_timestamp() AT TIME ZONE 'America/New_York')>=7
AND extract(hour FROM clock_timestamp() AT TIME ZONE 'America/New_York')<20
AND (s.channel='whatsapp' OR clock_timestamp()<f.ultima_msg_cliente_em+interval '23 hours 30 minutes')
AND f.cliente_slug=s.cliente_slug AND f.canal=s.channel AND f.identificador=s.identificador_conversa
AND f.etapa=$10 AND f.status='agendado' AND f.ultima_msg_cliente_em=$11::timestamptz AND f.proxima_tentativa_em<=clock_timestamp()) AS permitted;`,
  ledger: "SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) AS actions FROM public.lexia_outbound_actions a WHERE a.id=$1::uuid AND a.conversation_id=$2::uuid AND a.environment=$3 AND a.cliente_slug=$4;",
  historyRecord: `WITH allowed AS (SELECT 1 WHERE $8::boolean), recorded AS (
SELECT r.* FROM allowed CROSS JOIN LATERAL public.lexia_omni_record_message($1::uuid,'ai',$2,$3::timestamptz,$4,$5,$6,'completed',$7::uuid) r
), tagged AS (UPDATE public.lexia_mensagens m SET origem='followup_agente' FROM recorded r WHERE m.id=r.out_mensagem_id AND m.omni_action_id=$7::uuid AND m.omni_conversation_id=$1::uuid RETURNING m.id)
SELECT EXISTS(SELECT 1 FROM tagged) AS history_recorded,(SELECT id FROM tagged LIMIT 1) AS message_id;`,
  updateSent: `WITH updated AS (UPDATE public.lexia_followups f SET etapa=$7,status=$8,proxima_tentativa_em=$9::timestamptz,
tentativas_enviadas=coalesce(f.tentativas_enviadas,0)+1,ultima_msg_agente_em=$10::timestamptz,motivo_juiz=$11,motivo_encerramento=$12,dia_combinado=NULL,atualizado_em=clock_timestamp()
WHERE $13::boolean AND f.id::text=$1 AND f.cliente_slug=$2 AND f.identificador=$3 AND f.canal=$4
AND f.status='agendado' AND f.etapa=$5 AND f.ultima_msg_cliente_em=$6::timestamptz
AND EXISTS(SELECT 1 FROM public.lexia_mensagens m WHERE m.omni_action_id=$14::uuid AND m.provider_message_id=$15 AND m.cliente_slug=$2)
RETURNING f.id) SELECT EXISTS(SELECT 1 FROM updated) AS updated;`,
  updateDeferred: `WITH updated AS (UPDATE public.lexia_followups f SET etapa=$7,status=$8,proxima_tentativa_em=$9::timestamptz,motivo_encerramento=$10,atualizado_em=clock_timestamp()
WHERE $11::boolean AND f.id::text=$1 AND f.cliente_slug=$2 AND f.identificador=$3 AND f.canal=$4
AND f.status='agendado' AND f.etapa=$5 AND f.ultima_msg_cliente_em=$6::timestamptz
RETURNING f.id) SELECT EXISTS(SELECT 1 FROM updated) AS updated;`,
};
