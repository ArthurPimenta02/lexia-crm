import { assertContractSchema } from '../../lib/omnichannel/schema-validator.ts';

// Records originate in the central ledger, not in free-form model output.
export function domainEvents(snapshot, now, execution) {
  const s=snapshot.state;
  if(!s?.id)throw Error('crm_snapshot_required');
  const scope={environment:s.environment,cliente_slug:s.cliente_slug,channel:s.channel,account_ref:s.account_id,conversation_ref:s.conversation_ref};
  const events=[];
  const emit=(row,type,payload,at,authority='system_reconciliation',system='system')=>{
    const event={schema_version:'lexia.crm.event.v1',event_id:row.event_uuid,idempotency_key:'migration:'+row.event_uuid,
      correlation_id:s.id,event_type:type,occurred_at:at,emitted_at:now,sequence:0,scope,
      source:{system,authority,workflow_ref:'miranda-migration',execution_ref:String(execution)},payload};
    assertContractSchema('crm-sync-event',event);events.push(event);
  };
  for(const a of snapshot.appointments||[]) {
    emit({...a,event_uuid:a.confirmed_event_uuid},'appointment.confirmed',{appointment_ref:a.appointment_ref,
      tool_invocation_id:a.tool_invocation_id,starts_at:a.starts_at,ends_at:a.ends_at,timezone:a.timezone,pause_until_end:a.paused_until_end},a.criado_em);
    if(a.status==='cancelled')emit({...a,event_uuid:a.cancelled_event_uuid},'appointment.cancelled',{
      appointment_ref:a.appointment_ref,tool_invocation_id:a.tool_invocation_id,cancelled_at:a.atualizado_em},a.atualizado_em);
    if(['attended','no_show'].includes(a.attendance_status))emit({...a,event_uuid:a.attendance_event_uuid},'appointment.attendance.updated',{
      appointment_ref:a.appointment_ref,attendance_status:a.attendance_status,recorded_at:a.attendance_recorded_at},a.attendance_recorded_at);
  }
  for(const h of snapshot.handoffs||[]) {
    const handoff_ref=h.block_key.slice('handoff:'.length);
    emit(h,'handoff.requested',{
    handoff_ref,central_handoff_id:h.id,reason:h.motivo,summary:h.request_summary??h.resumo??'',
    priority:h.prioridade==='alta'||h.prioridade==='urgente'?'high':h.prioridade==='baixa'?'low':'normal',requested_at:h.criado_em},h.criado_em,'workflow_execution','workflow');
    if(h.omni_resolved_at)emit({...h,event_uuid:h.resolved_event_uuid},'handoff.resolved',{
      handoff_ref,resolution:h.omni_resolution,resolved_at:h.omni_resolved_at},h.omni_resolved_at);
    if(h.retomado_em)emit({...h,event_uuid:h.resumed_event_uuid},'handoff.resumed',{
      handoff_ref,resumed_at:h.retomado_em},h.retomado_em);
  }
  for(const a of snapshot.automations||[]) {
    // Accepted requests are pending, not evidence of delivery. Confirmed
    // actions alone supply the sent phase and provider time.
    const sent=a.actions?.find(x=>x.status==='sent'&&x.provider_message_id);
    const uncertain=a.actions?.find(x=>['claimed','delivery_unknown'].includes(x.status));
    const status=sent?'sent':uncertain?'delivery_unknown':a.status==='accepted'?'pending':a.status==='suppressed'?'suppressed':'cancelled';
    emit(a,'automation.updated',{automation_ref:a.id,automation_type:a.kind,status,source_ref:a.source_ref,due_at:a.due_at,
      ...(sent?{action_ref:sent.id,attempted_at:sent.concluido_em}:{}),...(uncertain?{reason:'requires_reconciliation'}:{})},sent?.concluido_em||a.recebido_em);
  }
  return events;
}

export function snapshotEvents(q,now,execution) {
  const s=q.state;
  if(!s?.id||!q.contact?.id)throw Error('crm_snapshot_identity_required');
  const scope={environment:s.environment,cliente_slug:s.cliente_slug,channel:s.channel,account_ref:s.account_id,conversation_ref:s.conversation_ref};
  const out=[];
  const emit=(row,type,payload,at)=>{
    const event={schema_version:'lexia.crm.event.v1',event_id:row.event_uuid,idempotency_key:'migration:'+row.event_uuid,
      correlation_id:s.id,event_type:type,occurred_at:at,emitted_at:now,sequence:out.length,scope,
      source:{system:'system',authority:'system_reconciliation',workflow_ref:'miranda-migration',execution_ref:String(execution)},payload};
    assertContractSchema('crm-sync-event',event);out.push(event);
  };
  emit(s,'conversation.opened',{contact_ref:q.contact.id,display_name:q.contact.nome||'Lead',resume_mode:q.resume_mode},s.criado_em);
  const mediaType={texto:'text',audio:'audio',imagem:'image',documento:'pdf',video:'video',text:'text',image:'image',pdf:'pdf'};
  for(const m of q.messages||[]) {
    if(['ai','system'].includes(m.omni_author))continue;
    const payload={message_id:m.id,direction:m.omni_author==='lead'?'inbound':'outbound',author:m.omni_author,
      message_type:mediaType[m.tipo]||'event',delivery_status:'received',...(m.provider_message_id?{provider_message_ref:m.provider_message_id}:{})};
    const original=m.omni_original_content??m.conteudo;
    if(original)payload.text=original;
    emit(m,'message.recorded',payload,m.provider_timestamp||m.criado_em);
    if(m.media_kind&&m.media_kind!=='text')emit({...m,event_uuid:m.enrichment_event_uuid},'message.enrichment.updated',{
      message_id:m.id,enrichment_kind:{audio:'transcription',image:'image_analysis',pdf:'pdf_text',video:'video_analysis'}[m.media_kind],
      status:m.media_processing_status||'not_supported',attempted_at:m.omni_enriched_at||m.criado_em,
      ...(m.media_processing_status==='completed'?{content:m.conteudo}:{}),...(m.media_processing_status==='failed'?{reason:'media_processing_failed'}:{})},m.omni_enriched_at||m.criado_em);
  }
  for(const a of q.actions||[]) {
    const content=a.content,type=content.type;
    // Stable proposal identity survives unknown -> sent reconciliation. Only
    // the separate provider-result event advances its delivery status.
    emit({...a,event_uuid:a.record_event_uuid},'message.recorded',{message_id:a.id,direction:'outbound',author:'ai',message_type:type,
      delivery_status:'preparing',action_id:a.id,...(type==='text'?{text:content.text}:{media_ref:content.media_ref,...(content.caption?{caption:content.caption}:{})})},a.preparado_em);
    if(['sent','delivery_unknown','suppressed','failed'].includes(a.status))emit(a,'message.delivery.updated',{
      message_id:a.id,delivery_status:a.status,attempted_at:a.reivindicado_em||a.preparado_em,
      ...(a.provider_message_id?{provider_message_ref:a.provider_message_id}:{}),...(a.reason?{reason:a.reason}:{})},a.concluido_em||a.preparado_em);
  }
  for(const b of q.blocks||[]) {
    if(!['human_intervention','manual_pause','handoff','appointment'].includes(b.block_type))continue;
    const active=b.status==='active'&&(!b.expires_at||Date.parse(b.expires_at)>Date.parse(now));
    if(active)emit(b,'block.upserted',{block_id:b.block_key,block_type:b.block_type,source_ref:b.source_ref,reason:b.block_type,
      starts_at:b.criado_em,...(b.expires_at?{expires_at:b.expires_at}:{}),effects:{replies:true,followups:true,reminders:b.block_type!=='appointment'}},b.atualizado_em);
    else emit(b,'block.closed',{block_id:b.block_key,status:b.status==='active'?'expired':b.status,resolved_at:b.atualizado_em},b.atualizado_em);
  }
  return [...out,...domainEvents(q,now,execution)];
}
