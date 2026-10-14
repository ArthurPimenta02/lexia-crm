// A calendar read has no writer claim. This preflight uses only the existing HML baseline.
export const readOnlyPreflight = `WITH input AS (
  SELECT $1::jsonb AS req, $2::text AS calendar,
    encode(extensions.digest(convert_to(jsonb_build_array($1::jsonb,$2::text)::text,'UTF8'),'sha256'),'hex') AS key
), scoped AS (
  SELECT s.* FROM public.lexia_conversation_states s
  JOIN public.lexia_channel_accounts a ON a.id=s.account_id AND a.environment=s.environment
    AND a.cliente_slug=s.cliente_slug AND a.channel=s.channel AND a.status='active' AND a.provider='fake'
  JOIN public.lexia_clientes cl ON cl.slug=s.cliente_slug AND cl.status='ativo'
  CROSS JOIN input i
  WHERE s.environment='isolated_test' AND s.environment=i.req->'scope'->>'environment'
    AND s.cliente_slug=i.req->'scope'->>'cliente_slug' AND s.channel=i.req->'scope'->>'channel'
    AND s.account_id=(i.req->'scope'->>'account_ref')::uuid
    AND s.conversation_ref=i.req->'scope'->>'conversation_ref' AND s.conversation_ref LIKE 'test:%'
), permission AS (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text($3::jsonb) h
      WHERE h=encode(extensions.digest(convert_to(lower(btrim(i.calendar)),'UTF8'),'sha256'),'hex'))
      THEN 'original_calendar_forbidden'
    WHEN (SELECT count(*) FROM scoped)<>1 THEN 'scope_unavailable'
    WHEN NOT EXISTS (SELECT 1 FROM scoped s WHERE s.projection_status='current'
      AND s.state_version=(i.req->'captured_state'->>'state_version')::bigint
      AND s.delivery_epoch=(i.req->'captured_state'->>'delivery_epoch')::bigint) THEN 'state_changed'
    WHEN (SELECT count(*) FROM public.lexia_omnichannel_policies p JOIN scoped s
      ON p.environment=s.environment AND p.cliente_slug=s.cliente_slug WHERE p.status='active')<>1
      THEN 'policy_unavailable'
    WHEN NOT EXISTS (SELECT 1 FROM public.lexia_inbound_batches b JOIN scoped s ON b.conversation_id=s.id
      WHERE b.invocation_id=(i.req->>'invocation_id')::uuid AND b.status='claimed'
        AND b.cutoff_seq=s.lead_message_seq AND b.fencing_token=s.fencing_counter)
      THEN 'batch_superseded_or_unclaimed'
    WHEN EXISTS (SELECT 1 FROM public.lexia_conversation_blocks b JOIN scoped s ON b.conversation_id=s.id
      WHERE b.status='active' AND (b.expires_at IS NULL OR b.expires_at>clock_timestamp())) THEN 'conversation_blocked'
    ELSE 'allowed' END AS reason FROM input i
)
SELECT (SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) FROM public.lexia_environment_identity e) AS identities,
  jsonb_build_object('allowed',p.reason='allowed','reason',p.reason) AS gate,
  jsonb_build_object('id',(substr(i.key,1,8)||'-'||substr(i.key,9,4)||'-4'||substr(i.key,14,3)||'-8'||substr(i.key,18,3)||'-'||substr(i.key,21,12))::uuid,
    'request',i.req,'calendar_id',i.calendar,'request_key',i.key,'provider_event_id','1e'||i.key,
    'status','prepared','created_at',clock_timestamp()) AS call
FROM input i CROSS JOIN permission p;`;
