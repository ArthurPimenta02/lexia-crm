// Pure rules shared by the migration review and its regression tests. No I/O.
const copy = value => JSON.parse(JSON.stringify(value));
const fail = code => { throw new Error(code); };
export function assertVirtualScope(request, config, operational) {
  const expected={environment:config.environment,cliente_slug:config.cliente_slug,account_ref:config.test_account_ref,
    channel:operational.canal,conversation_ref:'test:'+operational.lexia_session_id};
  if (!request?.scope || Object.keys(expected).some(k=>request.scope[k]!==expected[k]) ||
      request.run_id!==operational.lexia_run_id || request.input?.message_id!==operational.mensagem_id_externo ||
      request.input?.text!==operational.conteudo_mensagem) fail('virtual_ingress_scope_mismatch');
}
export function handoffDecision(priority) {
  if (!['baixa', 'normal', 'alta', 'urgente'].includes(priority)) fail('invalid_handoff_priority');
  return { notify: true, block: ['alta', 'urgente'].includes(priority), expires_at: null,
    notification_provider: 'zapi', requires_resolution_and_resume: ['alta', 'urgente'].includes(priority) };
}
export function requestCancellation(appointment, requestId) {
  if (!requestId || !appointment.appointment_ref) fail('cancellation_identity_required');
  if (appointment.cancellation_request_id && appointment.cancellation_request_id !== requestId) {
    fail('cancellation_already_pending');
  }
  // No mutation of the independent appointment block, including after expiry.
  return { ...copy(appointment), cancellation_request_id: requestId,
    cancellation_status: appointment.cancellation_status || 'requested' };
}
export function confirmCancellation(appointment, receipt) {
  if (receipt.operation !== 'appointment.cancel' || receipt.request_id !== appointment.cancellation_request_id ||
      receipt.appointment_ref !== appointment.appointment_ref || receipt.calendar_id !== appointment.calendar_id ||
      receipt.provider_event_id !== appointment.provider_event_id) fail('cancellation_receipt_origin_mismatch');
  if (receipt.status === 'unknown') return { ...copy(appointment), cancellation_status: 'unknown' };
  if (receipt.status !== 'succeeded' || receipt.absence_verified !== true) fail('cancellation_not_confirmed');
  return { ...copy(appointment), status: 'cancelled', cancellation_status: 'confirmed' };
}
export function reminderAllowed(appointment, blocks, now) {
  if (appointment.status !== 'confirmed' || ['requested', 'claimed', 'unknown', 'confirmed'].includes(appointment.cancellation_status)) return false;
  return !blocks.some(b => b.status === 'active' && (!b.expires_at || Date.parse(b.expires_at) > Date.parse(now)) &&
    !(b.block_type === 'appointment' && b.source_ref === appointment.appointment_ref));
}
export function reduceFollowupCycle(cycle, event) {
  const next = copy(cycle);
  const fields=['environment','cliente_slug','channel','account_ref','conversation_ref'];
  if (!event.scope || !next.scope || fields.some(k=>!next.scope[k]||event.scope[k]!==next.scope[k]) ||
      event.cycle_ref !== next.cycle_ref || event.conversation_id !== next.conversation_id) fail('followup_cycle_origin_mismatch');
  const identity = value => JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])));
  next.event_payloads ||= {};
  if (next.event_ids.includes(event.event_id)) {
    if(next.event_payloads[event.event_id]!==identity(event))fail('followup_event_retry_conflict');
    return next;
  }
  next.reply_events ||= [];
  next.appointment_events ||= [];
  if (event.type === 'sent') {
    if (!event.action_id || !event.provider_message_id) fail('followup_delivery_proof_required');
    if (next.sent_at && next.sent_at !== event.occurred_at) fail('followup_delivery_conflict');
    next.sent_at = event.occurred_at;
  } else if (event.type === 'lead_replied') {
    if (event.author !== 'lead' || !event.provider_message_id) fail('lead_reply_proof_required');
    next.reply_events.push({at:event.occurred_at,message_id:event.provider_message_id});
  } else if (event.type === 'appointment_confirmed') {
    if (event.operation !== 'appointment.create' || event.tool_status !== 'succeeded' || !event.appointment_ref) fail('followup_conversion_proof_required');
    next.appointment_events.push({at:event.occurred_at,appointment_ref:event.appointment_ref});
  } else fail('unsupported_followup_event');
  // Recompute from facts, so a delayed delivery receipt cannot move a converted
  // lead backwards, and a delayed earlier lead message cannot count as recovery.
  const reply = next.sent_at && next.reply_events.filter(r=>Date.parse(r.at)>Date.parse(next.sent_at)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0];
  const appointment = reply && next.appointment_events.filter(a=>Date.parse(a.at)>=Date.parse(reply.at)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0];
  next.lead_reply_at = reply?.at || null;
  next.appointment_at = appointment?.at || null;
  next.appointment_ref = appointment?.appointment_ref || null;
  const recovered = !!reply, converted = !!appointment;
  next.status = converted ? 'converted' : recovered ? 'recovered' : next.sent_at ? 'sent' : 'scheduled';
  next.event_ids.push(event.event_id);
  next.event_payloads[event.event_id]=identity(event);
  return next;
}
export function classifyCancellationRead(response, expectedEventId, calendarAccessVerified = false) {
  if (response?.status === 'cancelled' && response.id === expectedEventId && expectedEventId) return 'succeeded';
  // A timeout, permission error or generic "not found" string is not proof.
  const code = response?.error?.httpCode ?? response?.error?.statusCode ?? response?.statusCode;
  // Google can also hide a calendar behind 404 when credentials lack access.
  return calendarAccessVerified && [404, 410, '404', '410'].includes(code) ? 'succeeded' : 'unknown';
}
export function crmReceiptConfirmed(response, eventId) {
  const receipt = response?.body?.message;
  return !response?.error && response.statusCode>=200 && response.statusCode<300 &&
    receipt?.event_id===eventId && ['applied','duplicate'].includes(receipt.status);
}
export function calendarBrainConfig(config, value) {
  let payload=value?.payload??value;
  if(typeof payload==='string')payload=JSON.parse(payload);
  if(payload?.payload){payload=typeof payload.payload==='string'?JSON.parse(payload.payload):payload.payload;}
  return {...config,calendar_read_only:config.calendar_read_only===true||payload?.operacao?.calendar_write_allowed!==true};
}
