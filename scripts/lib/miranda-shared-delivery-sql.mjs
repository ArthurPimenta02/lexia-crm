// Node configuration only. No connection is opened by this module.
const identity="SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) AS identities FROM public.lexia_environment_identity i;";
const resolve=`SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('account_status',a.status,'provider',a.provider,'provider_account_ref',a.provider_account_ref)),'[]'::jsonb) AS states
FROM public.lexia_conversation_states s JOIN public.lexia_channel_accounts a ON a.id=s.account_id
WHERE s.environment=$1 AND s.cliente_slug=$2 AND s.channel=$3 AND s.account_id=$4::uuid AND s.conversation_ref=$5;`;
const followupSource=`EXISTS(SELECT 1 FROM public.lexia_followups f WHERE f.id::text=$3::jsonb->'followup'->>'id'
AND f.cliente_slug=s.cliente_slug AND f.canal=s.channel AND f.identificador=s.identificador_conversa
AND f.status='agendado' AND f.etapa BETWEEN 1 AND 2 AND coalesce(f.tentativas_enviadas,0)<2
AND f.ultima_msg_cliente_em=($3::jsonb->'followup'->>'last_lead_at')::timestamptz
AND f.proxima_tentativa_em=($3::jsonb->'request'->>'due_at')::timestamptz AND f.proxima_tentativa_em<=clock_timestamp())
AND extract(isodow FROM clock_timestamp() AT TIME ZONE 'America/New_York')<>7
AND extract(hour FROM clock_timestamp() AT TIME ZONE 'America/New_York') BETWEEN 7 AND 19
AND (s.channel='whatsapp' OR clock_timestamp()-($3::jsonb->'followup'->>'last_lead_at')::timestamptz<interval '23 hours 30 minutes')`;
const source=kind=>kind==='followup'?followupSource:kind==='appointment_reminder'?`EXISTS(SELECT 1 FROM public.lexia_appointment_events a WHERE a.conversation_id=s.id AND a.appointment_ref=$3::jsonb->'request'->>'source_ref'
AND a.status='confirmed' AND a.attendance_status<>'cancelled' AND a.timezone='America/New_York'
AND a.starts_at BETWEEN clock_timestamp()+interval '2 hours' AND clock_timestamp()+interval '24 hours'
AND ($3::jsonb->'request'->>'due_at')::timestamptz=a.starts_at-interval '24 hours')
AND extract(hour FROM clock_timestamp() AT TIME ZONE 'America/New_York') BETWEEN 7 AND 19
AND NOT EXISTS(SELECT 1 FROM public.lexia_outbound_actions other WHERE other.conversation_id=s.id AND other.kind='appointment_reminder'
AND other.source_ref=$3::jsonb->'request'->>'source_ref' AND other.id<>($3::jsonb->'current'->>'action_id')::uuid AND other.status IN ('claimed','sent','delivery_unknown'))`:
`EXISTS(SELECT 1 FROM public.lexia_inbound_batches b WHERE b.id=($3::jsonb->'request'->>'request_id')::uuid AND b.conversation_id=s.id AND b.status='claimed' AND b.cutoff_seq=($3::jsonb->>'lead_cutoff_seq')::bigint)
AND ($3::jsonb->'request'->>'kind'<>'appointment_confirmation' OR EXISTS(
SELECT 1 FROM public.lexia_calendar_tool_calls t JOIN public.lexia_appointment_events a
ON a.conversation_id=t.conversation_id AND a.tool_invocation_id=t.id::text
WHERE t.conversation_id=s.id AND t.request->>'invocation_id'=$3::jsonb->'request'->>'request_id'
AND t.operation='appointment.create' AND t.status='completed' AND t.receipt->>'status'='succeeded'
AND a.appointment_ref=$3::jsonb->'request'->>'source_ref' AND a.status='confirmed' AND a.cancellation_status IS NULL
AND t.receipt->'data'->>'confirmacao_texto'=$3::jsonb->'current'->'content'->>'text'
AND (a.confirmation_action_id IS NULL OR a.confirmation_action_id=($3::jsonb->'current'->>'action_id')::uuid)))`;
export const load=kind=>`SELECT
(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('account_status',a.status,'language',c.operational_context->>'language')),'[]'::jsonb)
 FROM public.lexia_conversation_states s JOIN public.lexia_channel_accounts a ON a.id=s.account_id
 LEFT JOIN LATERAL (SELECT x.* FROM public.lexia_conversation_contexts x WHERE x.conversation_id=s.id ORDER BY x.context_version DESC LIMIT 1) c ON true WHERE s.id=$1::uuid) AS states,
(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.sequence),'[]'::jsonb) FROM public.lexia_outbound_actions o WHERE o.conversation_id=$1::uuid AND o.invocation_id=$2::uuid) AS actions,
(SELECT coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) FROM public.lexia_conversation_blocks b WHERE b.conversation_id=$1::uuid) AS blocks,
(SELECT to_jsonb(a) FROM public.lexia_appointment_events a WHERE a.conversation_id=$1::uuid AND a.appointment_ref=$3::jsonb->'request'->>'source_ref') AS appointment,
(SELECT ${source(kind)} FROM public.lexia_conversation_states s WHERE s.id=$1::uuid) AS source_valid;`;

const prepare=`WITH locked AS MATERIALIZED (SELECT s.* FROM public.lexia_omni_lock_conversation($1::uuid) s),
checked AS MATERIALIZED (SELECT public.lexia_omni_require(
 NOT EXISTS(SELECT 1 FROM public.lexia_outbound_actions o WHERE (o.id IN (SELECT (a->>'action_id')::uuid FROM jsonb_array_elements($2::jsonb->'actions') a) OR (o.conversation_id=$1::uuid AND o.invocation_id=($2::jsonb->'request'->>'request_id')::uuid))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2::jsonb->'actions') a WHERE o.id=(a->>'action_id')::uuid
 AND o.conversation_id=$1::uuid AND o.invocation_id=(a->>'invocation_id')::uuid AND o.sequence=(a->>'sequence')::integer
 AND o.kind=a->>'kind' AND o.source_ref IS NOT DISTINCT FROM a->>'source_ref' AND o.content=a->'content'
 AND o.captured_state_version=(a->'captured_state'->>'state_version')::bigint AND o.captured_delivery_epoch=(a->'captured_state'->>'delivery_epoch')::bigint
 AND o.lead_cutoff_seq IS NOT DISTINCT FROM ($2::jsonb->>'lead_cutoff_seq')::bigint
 AND o.automation_request_id IS NOT DISTINCT FROM (CASE WHEN $2::jsonb->'request'->>'kind' IN ('reply','appointment_confirmation') THEN NULL ELSE ($2::jsonb->'request'->>'request_id')::uuid END)))
 AND NOT EXISTS(SELECT 1 FROM public.lexia_automation_requests r WHERE r.id=($2::jsonb->'request'->>'request_id')::uuid
 AND (r.conversation_id<>$1::uuid OR r.kind<>$2::jsonb->'request'->>'kind' OR r.source_ref<>$2::jsonb->'request'->>'source_ref' OR r.due_at<>($2::jsonb->'request'->>'due_at')::timestamptz)),
 'shared_delivery_idempotency_conflict') AS ok FROM locked),
registered AS MATERIALIZED (SELECT CASE WHEN $2::jsonb->'request'->>'kind' IN ('reply','appointment_confirmation') THEN 'accepted' ELSE
(SELECT out_status FROM public.lexia_omni_register_automation_request(
($2::jsonb->'request'->>'request_id')::uuid,$1::uuid,$2::jsonb->'request'->>'kind',$2::jsonb->'request'->>'source_ref',($2::jsonb->'request'->>'due_at')::timestamptz)) END AS status FROM checked),
prepared AS MATERIALIZED (SELECT public.lexia_omni_prepare_outbound_actions($1::uuid,($2::jsonb->'request'->>'request_id')::uuid,($2::jsonb->>'lead_cutoff_seq')::bigint,
CASE WHEN $2::jsonb->'request'->>'kind' IN ('reply','appointment_confirmation') THEN NULL ELSE ($2::jsonb->'request'->>'request_id')::uuid END,$2::jsonb->'actions') AS action_count
FROM registered WHERE status='accepted')
SELECT coalesce((SELECT action_count FROM prepared),0) AS action_count;`;

// The conversation lock is taken before time/source/projection checks and claim.
// The existing RPC applies all blocks, captured versions, ordering and fencing.
export const gate=kind=>`WITH s AS MATERIALIZED (SELECT * FROM public.lexia_omni_lock_conversation($1::uuid)),
allowed AS MATERIALIZED (SELECT s.id FROM s WHERE s.projection_status='current' AND ${source(kind)}),
claimed AS MATERIALIZED (SELECT g.* FROM allowed CROSS JOIN LATERAL public.lexia_omni_claim_outbound_action($2::uuid,$4) g)
SELECT * FROM claimed UNION ALL SELECT false,'prepared','source_or_projection_unavailable',NULL::bigint WHERE NOT EXISTS(SELECT 1 FROM allowed);`;

export const virtual=kind=>`WITH s AS MATERIALIZED (SELECT * FROM public.lexia_omni_lock_conversation($1::uuid)),
allowed AS MATERIALIZED (SELECT s.id FROM s JOIN public.lexia_channel_accounts a ON a.id=s.account_id
WHERE s.environment='isolated_test' AND s.conversation_ref LIKE 'test:%' AND a.provider='fake' AND a.status='active'
AND s.state_version=($3::jsonb->'captured_state'->>'state_version')::bigint AND s.delivery_epoch=($3::jsonb->'captured_state'->>'delivery_epoch')::bigint
AND s.projection_status='current' AND (($3::jsonb->>'lead_cutoff_seq') IS NULL OR s.lead_message_seq=($3::jsonb->>'lead_cutoff_seq')::bigint)
AND ${source(kind)} AND NOT EXISTS(SELECT 1 FROM public.lexia_conversation_blocks b WHERE b.conversation_id=s.id AND b.status='active'
AND (b.expires_at IS NULL OR b.expires_at>clock_timestamp()) AND NOT(b.block_type='appointment' AND $3::jsonb->'request'->>'kind' IN ('appointment_reminder','appointment_confirmation') AND b.source_ref=$3::jsonb->'request'->>'source_ref'))),
action AS MATERIALIZED (SELECT o.* FROM public.lexia_outbound_actions o,allowed WHERE o.id=$2::uuid AND o.conversation_id=allowed.id
AND (o.status='prepared' OR (o.status='suppressed' AND o.reason='virtual_delivered'))
AND NOT EXISTS(SELECT 1 FROM public.lexia_outbound_actions previous WHERE previous.conversation_id=o.conversation_id AND previous.invocation_id=o.invocation_id AND previous.sequence<o.sequence
AND NOT(previous.status='suppressed' AND previous.reason='virtual_delivered')) FOR UPDATE OF o),
recorded AS MATERIALIZED (SELECT m.* FROM action CROSS JOIN LATERAL public.lexia_migration_record_virtual(action.id) m),
tagged AS (SELECT out_mensagem_id AS id FROM recorded),
checkpoint AS (UPDATE public.lexia_outbound_actions SET status='suppressed',reason='virtual_delivered',concluido_em=clock_timestamp()
 WHERE id=$2::uuid AND status='prepared' AND EXISTS(SELECT 1 FROM tagged) RETURNING id)
SELECT EXISTS(SELECT 1 FROM tagged) AS permitted,(SELECT out_mensagem_id FROM recorded LIMIT 1) AS message_id,(SELECT count(*) FROM checkpoint) AS checkpointed;`;

const finish=`WITH eligible AS MATERIALIZED (SELECT $1::uuid AS conversation_id WHERE $6='sent'),
recorded AS MATERIALIZED (SELECT m.* FROM eligible CROSS JOIN LATERAL public.lexia_omni_record_message(eligible.conversation_id,'ai',$5,clock_timestamp(),
CASE $8::jsonb->>'type' WHEN 'text' THEN 'texto' WHEN 'image' THEN 'imagem' ELSE 'audio' END,
coalesce($8::jsonb->>'text',$8::jsonb->>'caption',$8::jsonb->>'media_ref'),$8::jsonb->>'type','completed',$2::uuid) m),
tagged AS (UPDATE public.lexia_mensagens SET origem=CASE $9 WHEN 'followup' THEN 'followup_agente' ELSE 'workflow' END
WHERE id IN (SELECT out_mensagem_id FROM recorded) RETURNING id)
SELECT public.lexia_omni_finish_outbound_action($2::uuid,$3,$4::bigint,$6,$5,$7,(SELECT id FROM tagged LIMIT 1)) AS status;`;
export const sql={identity,resolve,prepare,finish};
