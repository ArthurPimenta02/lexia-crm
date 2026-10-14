// Configuration only: no SQL executes while building or importing this module.
const hashUuid=x=>`(substr(${x},1,8)||'-'||substr(${x},9,4)||'-4'||substr(${x},14,3)||'-8'||substr(${x},18,3)||'-'||substr(${x},21,12))::uuid`;
export const sql={
  identity:"SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) AS identities FROM public.lexia_environment_identity i;",
  search:`SELECT a.* FROM public.lexia_appointment_events a JOIN public.lexia_conversation_states s ON s.id=a.conversation_id
WHERE a.environment=$1 AND a.cliente_slug=$2 AND s.account_id=$3::uuid AND a.status='confirmed'
AND a.starts_at BETWEEN clock_timestamp()+interval '2 hours' AND clock_timestamp()+interval '24 hours' ORDER BY a.starts_at,a.id;`,
  resolve:`WITH candidate AS (SELECT a.*,s.account_id,s.channel,s.conversation_ref,
jsonb_build_array('miranda-reminder-v1',s.environment,s.cliente_slug,s.channel,s.account_id,s.conversation_ref,a.appointment_ref)::text AS identity
FROM public.lexia_appointment_events a JOIN public.lexia_conversation_states s ON s.id=a.conversation_id
WHERE a.id=$1::uuid AND a.conversation_id=$2::uuid AND a.environment=$3 AND a.cliente_slug=$4 AND s.account_id=$5::uuid),
ids AS (SELECT c.*,${hashUuid('md5(identity)')} AS request_id,${hashUuid("md5(identity||':action:1')")} AS action_id,
(SELECT jsonb_object_agg(phase,${hashUuid("md5(identity||':event:'||phase)")}) FROM unnest(ARRAY['sent','delivery_unknown','preview','virtual','message']) phase) AS event_ids FROM candidate c)
SELECT (SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('account_status',acc.status,'provider',acc.provider,'language',ctx.operational_context->>'language','first_name',to_jsonb(contact)->>'nome','request_id',i.request_id,'action_id',i.action_id,'event_ids',i.event_ids)),'[]'::jsonb)
FROM ids i JOIN public.lexia_conversation_states s ON s.id=i.conversation_id JOIN public.lexia_channel_accounts acc ON acc.id=s.account_id
LEFT JOIN public.lexia_conversation_contexts ctx ON ctx.conversation_id=s.id LEFT JOIN public.lexia_contactos contact ON contact.id=s.contacto_id AND contact.cliente_slug=s.cliente_slug) AS states,
(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM ids i JOIN public.lexia_appointment_events a ON a.id=i.id) AS appointments,
(SELECT coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) FROM ids i JOIN public.lexia_conversation_blocks b ON b.conversation_id=i.conversation_id) AS blocks,
(SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM ids i JOIN public.lexia_outbound_actions o ON o.conversation_id=i.conversation_id AND o.kind='appointment_reminder' AND o.source_ref=i.appointment_ref) AS actions;`,
  permission:`SELECT EXISTS(SELECT 1 FROM public.lexia_conversation_states s JOIN public.lexia_channel_accounts acc ON acc.id=s.account_id
JOIN public.lexia_appointment_events a ON a.conversation_id=s.id JOIN public.lexia_conversation_contexts ctx ON ctx.conversation_id=s.id
WHERE s.id=$1::uuid AND s.environment=$2 AND s.cliente_slug=$3 AND s.channel=$4 AND s.account_id=$5::uuid AND s.conversation_ref=$6
AND s.state_version=$7::bigint AND s.delivery_epoch=$8::bigint AND s.projection_status='current' AND acc.status='active'
AND a.id=$9::uuid AND a.appointment_ref=$10 AND a.status='confirmed' AND a.attendance_status<>'cancelled' AND a.starts_at=$11::timestamptz AND a.ends_at=$12::timestamptz
AND a.timezone='America/New_York' AND a.starts_at BETWEEN clock_timestamp()+interval '2 hours' AND clock_timestamp()+interval '24 hours'
AND extract(hour FROM clock_timestamp() AT TIME ZONE 'America/New_York') BETWEEN 7 AND 19
AND ctx.operational_context->>'language'=$13
AND NOT EXISTS(SELECT 1 FROM public.lexia_conversation_blocks b WHERE b.conversation_id=s.id AND b.status='active' AND (b.expires_at IS NULL OR b.expires_at>clock_timestamp()) AND NOT(b.block_type='appointment' AND b.source_ref=a.appointment_ref))
AND NOT EXISTS(SELECT 1 FROM public.lexia_outbound_actions o WHERE o.conversation_id=s.id AND o.kind='appointment_reminder' AND o.source_ref=a.appointment_ref)) AS permitted;`,
  ledger:`SELECT (SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM public.lexia_outbound_actions o WHERE o.id=$1::uuid AND o.conversation_id=$2::uuid AND o.environment=$3 AND o.cliente_slug=$4) AS actions,
EXISTS(SELECT 1 FROM public.lexia_outbound_actions o JOIN public.lexia_mensagens m ON m.id=o.mensagem_id
WHERE o.id=$1::uuid AND o.conversation_id=$2::uuid AND o.environment=$3 AND o.cliente_slug=$4 AND o.status='sent'
AND m.omni_conversation_id=o.conversation_id AND m.cliente_slug=o.cliente_slug AND m.omni_author='ai' AND m.omni_action_id=o.id AND m.provider_message_id=o.provider_message_id) AS message_verified;`,
};
