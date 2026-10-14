-- REVIEW ONLY. Never applied automatically by a workflow or generator.
-- Requires an explicit disposable target and the existing Lot 2 baseline.
begin;
do $$
declare expected text := current_setting('lexia.target_project_ref', true);
begin
  if expected is null or expected = '' or
     (select count(*) from public.lexia_environment_identity) <> 1 or
     not exists(select 1 from public.lexia_environment_identity where
       project_ref=expected and environment='isolated_test' and disposable) then
    raise exception 'calendar_tools_disposable_identity_required';
  end if;
end;
$$;

create table public.lexia_calendar_tool_calls (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.lexia_conversation_states(id),
  calendar_id text not null check(calendar_id ~ '^[A-Za-z0-9._-]+@group\.calendar\.google\.com$'),
  operation text not null check(operation in ('availability.check','appointment.create')),
  request_key text not null unique check(request_key ~ '^[a-f0-9]{64}$'),
  request jsonb not null,
  provider_event_id text not null unique,
  status text not null default 'prepared' check(status in ('prepared','claimed','completed','unknown')),
  plan jsonb,
  claim_token uuid,
  receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);
-- Uncertainty does not expire into permission to create another event.
create unique index lexia_calendar_one_writer on public.lexia_calendar_tool_calls(calendar_id)
  where operation='appointment.create' and status in ('claimed','unknown');
alter table public.lexia_calendar_tool_calls enable row level security;
revoke all on public.lexia_calendar_tool_calls from public,anon,authenticated;
grant select,insert,update on public.lexia_calendar_tool_calls to service_role;

create function public.lexia_calendar_test_begin(p_request jsonb,p_calendar text,p_protected_hashes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; r public.lexia_calendar_tool_calls%rowtype; k text;
begin
  if jsonb_typeof(p_protected_hashes) is distinct from 'array' or jsonb_array_length(p_protected_hashes)=0 or
    exists(select 1 from jsonb_array_elements_text(p_protected_hashes) h where
      h=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.lower(pg_catalog.btrim(p_calendar)),'UTF8'),'sha256'),'hex')) then
    raise exception 'calendar_original_production_destination_forbidden';
  end if;
  if p_request->'scope'->>'environment' is distinct from 'isolated_test' or
    p_request->>'operation' not in ('availability.check','appointment.create') or
    p_calendar !~ '^[A-Za-z0-9._-]+@group\.calendar\.google\.com$' then
    raise exception 'calendar_tools_test_only';
  end if;
  select v.* into strict s from public.lexia_conversation_states v
    join public.lexia_channel_accounts a on a.id=v.account_id
    join public.lexia_clientes cl on cl.slug=v.cliente_slug and cl.status='ativo'
    where v.environment='isolated_test' and v.cliente_slug=p_request->'scope'->>'cliente_slug'
    and v.channel=p_request->'scope'->>'channel' and v.account_id=(p_request->'scope'->>'account_ref')::uuid
    and v.conversation_ref=p_request->'scope'->>'conversation_ref' and v.conversation_ref like 'test:%'
    and a.status='active' and a.provider='fake';
  k := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_request,p_calendar)::text,'UTF8'),'sha256'),'hex');
  insert into public.lexia_calendar_tool_calls(conversation_id,calendar_id,operation,request_key,request,provider_event_id)
    values(s.id,p_calendar,p_request->>'operation',k,p_request,'1e'||k)
    on conflict(request_key) do nothing;
  select * into strict r from public.lexia_calendar_tool_calls where request_key=k;
  if r.request is distinct from p_request or r.calendar_id<>p_calendar or r.conversation_id<>s.id then
    raise exception 'calendar_tools_idempotency_conflict';
  end if;
  return to_jsonb(r);
end;
$$;

create function public.lexia_calendar_test_gate(p_call uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.lexia_calendar_tool_calls%rowtype; s public.lexia_conversation_states%rowtype;
begin
  select * into strict r from public.lexia_calendar_tool_calls where id=p_call;
  s := public.lexia_omni_lock_conversation(r.conversation_id);
  if s.environment is distinct from 'isolated_test' or s.state_version is distinct from (r.request->'captured_state'->>'state_version')::bigint
    or s.delivery_epoch is distinct from (r.request->'captured_state'->>'delivery_epoch')::bigint then
    return jsonb_build_object('allowed',false,'reason','state_changed');
  end if;
  if s.projection_status<>'current' or not exists(select 1 from public.lexia_channel_accounts a
    join public.lexia_clientes cl on cl.slug=a.cliente_slug and cl.status='ativo'
    where a.id=s.account_id and a.status='active' and a.provider='fake') then
    return jsonb_build_object('allowed',false,'reason','projection_or_account_unavailable');
  end if;
  perform public.lexia_omni_active_policy(s.environment,s.cliente_slug);
  if not exists(select 1 from public.lexia_inbound_batches b where b.conversation_id=s.id
    and b.invocation_id=(r.request->>'invocation_id')::uuid and b.status='claimed'
    and b.cutoff_seq=s.lead_message_seq and b.fencing_token=s.fencing_counter) then
    return jsonb_build_object('allowed',false,'reason','batch_superseded_or_unclaimed');
  end if;
  if exists(select 1 from public.lexia_conversation_blocks b where b.conversation_id=s.id
    and b.status='active' and (b.expires_at is null or b.expires_at>clock_timestamp())) then
    return jsonb_build_object('allowed',false,'reason','conversation_blocked');
  end if;
  return jsonb_build_object('allowed',true,'reason','allowed');
end;
$$;

create function public.lexia_calendar_test_claim(p_call uuid,p_plan jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.lexia_calendar_tool_calls%rowtype; gate jsonb; reason text;
begin
  -- Lock conversation before the shared calendar lane; no lock spans HTTP.
  select * into strict r from public.lexia_calendar_tool_calls where id=p_call;
  gate := public.lexia_calendar_test_gate(p_call);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.calendar_id,0));
  select * into strict r from public.lexia_calendar_tool_calls where id=p_call for update;
  if r.status<>'prepared' or r.operation<>'appointment.create' then reason := 'already_claimed_or_completed';
  elsif gate->>'allowed'<>'true' then reason := gate->>'reason';
  elsif exists(select 1 from public.lexia_calendar_tool_calls other where other.calendar_id=r.calendar_id
    and other.id<>r.id and other.operation='appointment.create' and other.status in ('claimed','unknown')) then
    reason := 'calendar_busy_or_requires_reconciliation';
  elsif not exists(select 1 from public.lexia_calendar_tool_calls issued where
    issued.conversation_id=r.conversation_id and issued.calendar_id=r.calendar_id
    and issued.operation='availability.check' and issued.status='completed' and issued.expires_at>clock_timestamp()
    and issued.receipt->>'status'='succeeded'
    and issued.receipt->'data'->>'servico_agendado'=p_plan->>'servico_agendado'
    and issued.receipt->'data'->>'profissional'=p_plan->>'profissional'
    and (issued.receipt->'data'->>'duracao_min')::integer=(p_plan->>'duracao_min')::integer
    and coalesce(issued.receipt->'data'->>'variante','')=coalesce(p_plan->>'variante','')
    and exists(select 1 from jsonb_array_elements(coalesce(issued.receipt->'data'->'opcoes','[]'::jsonb)
      || case when issued.receipt->'data'->'horario_pedido'->>'status'='DISPONIVEL'
        then jsonb_build_array(issued.receipt->'data'->'horario_pedido') else '[]'::jsonb end) slot
      where (slot->>'inicio_iso')::timestamptz=(p_plan->>'inicio')::timestamptz
      and (slot->>'fim_iso')::timestamptz=(p_plan->>'fim')::timestamptz)) then
    reason := 'slot_not_attested_or_expired';
  end if;
  if reason is null then
    update public.lexia_calendar_tool_calls set status='claimed',plan=p_plan,claim_token=extensions.gen_random_uuid(),updated_at=clock_timestamp()
      where id=r.id returning * into r;
  end if;
  return jsonb_build_object('acquired',reason is null,'reason',coalesce(reason,'claimed'),
    'call_id',r.id,'provider_event_id',r.provider_event_id,'claim_token',case when reason is null then r.claim_token else null end);
end;
$$;

create function public.lexia_calendar_test_finish(p_call uuid,p_receipt jsonb,p_unknown boolean,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.lexia_calendar_tool_calls%rowtype;
begin
  select * into strict r from public.lexia_calendar_tool_calls where id=p_call for update;
  if p_unknown is null or p_receipt->>'status' is null or p_receipt->>'status' not in ('succeeded','failed','unknown')
    or jsonb_typeof(p_receipt->'domain_events') is distinct from 'array' then raise exception 'calendar_receipt_invalid'; end if;
  if (p_receipt->>'status'='unknown') is distinct from p_unknown then
    raise exception 'calendar_unknown_status_mismatch';
  end if;
  if p_receipt->>'schema_version' is distinct from 'lexia.tool.result.v1' or
     p_receipt->>'tool_call_id' is distinct from r.id::text or
     p_receipt->'scope' is distinct from r.request->'scope' or
     p_receipt->>'invocation_id' is distinct from r.request->>'invocation_id' or
     p_receipt->>'operation' is distinct from r.operation then raise exception 'calendar_receipt_origin_mismatch'; end if;
  if r.status='completed' or r.status='unknown' then
    if r.receipt is distinct from p_receipt then raise exception 'calendar_receipt_immutable'; end if;
    return to_jsonb(r);
  end if;
  if r.status='claimed' and r.claim_token is distinct from p_claim_token then
    raise exception 'calendar_claim_owner_mismatch';
  end if;
  if p_unknown and (r.status<>'claimed' or p_receipt->>'status'<>'unknown') then
    raise exception 'calendar_unknown_requires_claim';
  end if;
  if r.operation='appointment.create' and p_receipt->>'status'='succeeded' then
    if r.status<>'claimed' or p_receipt->'data'->>'status' is distinct from 'CRIADO' or
      p_receipt->'data'->>'appointment_ref' is distinct from ('caltest:'||r.id::text) or
      jsonb_array_length(p_receipt->'domain_events')<>1 or
      p_receipt->'domain_events'->0->>'type' is distinct from 'appointment.confirmed' or
      p_receipt->'domain_events'->0->>'event_id' is distinct from r.id::text or
      p_receipt->'domain_events'->0->>'invocation_id' is distinct from r.request->>'invocation_id' or
      p_receipt->'domain_events'->0->'appointment'->>'status' is distinct from 'confirmed' or
      p_receipt->'domain_events'->0->'appointment'->>'appointment_ref' is distinct from ('caltest:'||r.id::text) or
      p_receipt->'domain_events'->0->'appointment'->>'timezone' is distinct from 'America/New_York' or
      (p_receipt->'domain_events'->0->'appointment'->>'starts_at')::timestamptz is distinct from (r.plan->>'inicio')::timestamptz or
      (p_receipt->'domain_events'->0->'appointment'->>'ends_at')::timestamptz is distinct from (r.plan->>'fim')::timestamptz or
      p_receipt->'domain_events'->0->'appointment'->>'tool_invocation_id' is distinct from r.id::text then
      raise exception 'calendar_creation_unconfirmed';
    end if;
  elsif jsonb_array_length(p_receipt->'domain_events')<>0 then raise exception 'calendar_unconfirmed_domain_event';
  end if;
  update public.lexia_calendar_tool_calls set status=case when p_unknown then 'unknown' else 'completed' end,
    receipt=p_receipt,expires_at=case when operation='availability.check' then clock_timestamp()+interval '15 minutes' else null end,
    updated_at=clock_timestamp() where id=r.id returning * into r;
  return to_jsonb(r);
end;
$$;

revoke all on function public.lexia_calendar_test_begin(jsonb,text,jsonb),public.lexia_calendar_test_gate(uuid),
  public.lexia_calendar_test_claim(uuid,jsonb),public.lexia_calendar_test_finish(uuid,jsonb,boolean,uuid)
  from public,anon,authenticated;
grant execute on function public.lexia_calendar_test_begin(jsonb,text,jsonb),public.lexia_calendar_test_gate(uuid),
  public.lexia_calendar_test_claim(uuid,jsonb),public.lexia_calendar_test_finish(uuid,jsonb,boolean,uuid) to service_role;
commit;
