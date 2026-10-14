-- REVIEW ONLY, never run by the builders. Requires the Lot 2 baseline.
-- Persistent/additive: no cleanup, DROP, TRUNCATE or environment relabelling.
begin;

alter table public.lexia_handoffs add column if not exists blocking boolean not null default true;
alter table public.lexia_handoffs add column request_summary text;
create function public.lexia_migration_preserve_handoff_request()
returns trigger language plpgsql set search_path='' as $$
begin new.request_summary:=new.resumo;return new;end;
$$;
create trigger lexia_migration_handoff_request before insert on public.lexia_handoffs
  for each row execute function public.lexia_migration_preserve_handoff_request();
alter table public.lexia_appointment_events add column if not exists cancellation_status text;
alter table public.lexia_appointment_events add column if not exists cancellation_request_id uuid;
alter table public.lexia_appointment_events add constraint lexia_cancellation_status_check
  check(cancellation_status is null or cancellation_status in ('requested','claimed','unknown','confirmed'));

-- The wrapper keeps the old RPC contract but distinguishes notification-only
-- handoffs. An advisory conversation lock serializes both branches and retries.
create function public.lexia_migration_handoff(p_conversation uuid,p_key text,p_ref text,
  p_reason text,p_summary text,p_priority text,p_at timestamptz)
returns table(out_handoff_id uuid,out_duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; existing public.lexia_handoffs%rowtype; ticket uuid;
begin
  perform public.lexia_omni_require(p_priority in ('low','normal','high'),'invalid_handoff_priority');
  perform public.lexia_omni_require(p_key is not null and p_ref is not null and p_at is not null,'handoff_identity_required');
  s := public.lexia_omni_lock_conversation(p_conversation);
  select * into existing from public.lexia_handoffs where omni_conversation_id=s.id and idempotency_key=p_key;
  if found then
    perform public.lexia_omni_require(existing.blocking=(p_priority='high') and existing.motivo=left(p_reason,500)
      and coalesce(existing.request_summary,existing.resumo)=left(p_summary,4000), 'handoff_retry_conflict');
    return query select existing.id,true; return;
  end if;
  if p_priority='high' then
    return query select * from public.lexia_omni_request_handoff(s.id,p_key,p_ref,p_reason,p_summary,p_priority,p_at);
    return;
  end if;
  insert into public.lexia_handoffs(cliente_slug,nome_contacto,telefone,motivo,prioridade,resumo,status,
    origem,omni_conversation_id,block_key,idempotency_key,blocking)
  select s.cliente_slug,c.nome,c.telefone,left(p_reason,500),case when p_priority='low' then 'baixa' else 'normal' end,
    left(p_summary,4000),'pendente','omnichannel_v2',s.id,'handoff:'||p_ref,p_key,false
  from (select 1) anchor left join public.lexia_contactos c on c.id=s.contacto_id returning id into ticket;
  perform public.lexia_omni_commit_transition(s.id,'handoff.request:'||p_key,'handoff.request',
    jsonb_build_object('handoff_id',ticket,'handoff_ref',p_ref,'blocking',false),p_at,null,false);
  return query select ticket,false;
end;
$$;

create table public.lexia_google_appointment_bindings (
  conversation_id uuid not null references public.lexia_conversation_states(id),
  appointment_ref text not null,
  calendar_id text not null,
  provider_event_id text not null,
  tool_call_id uuid not null,
  primary key(conversation_id,appointment_ref),
  foreign key(conversation_id,appointment_ref) references public.lexia_appointment_events(conversation_id,appointment_ref),
  unique(calendar_id,provider_event_id)
);
create table public.lexia_google_cancellations (
  request_id uuid primary key,
  conversation_id uuid not null,
  appointment_ref text not null,
  status text not null default 'requested' check(status in ('requested','claimed','unknown','confirmed')),
  claim_token uuid,
  receipt jsonb,
  requested_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(conversation_id,appointment_ref) references public.lexia_google_appointment_bindings(conversation_id,appointment_ref),
  unique(conversation_id,appointment_ref)
);

create function public.lexia_migration_request_cancel(p_conversation uuid,p_appointment text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; a public.lexia_appointment_events%rowtype; r public.lexia_google_cancellations%rowtype;
begin
  s := public.lexia_omni_lock_conversation(p_conversation);
  select * into strict a from public.lexia_appointment_events where conversation_id=s.id and appointment_ref=p_appointment for update;
  insert into public.lexia_google_cancellations(request_id,conversation_id,appointment_ref)
    values(p_request,s.id,p_appointment) on conflict(conversation_id,appointment_ref) do nothing;
  select * into strict r from public.lexia_google_cancellations where conversation_id=s.id and appointment_ref=p_appointment;
  perform public.lexia_omni_require(r.request_id=p_request,'cancel_request_conflict');
  update public.lexia_appointment_events set cancellation_status=r.status,
    cancellation_request_id=p_request,atualizado_em=clock_timestamp() where id=a.id;
  if not public.lexia_omni_command_seen(s.id,'google-cancel-request:'||p_request) then
    perform public.lexia_omni_commit_transition(s.id,'google-cancel-request:'||p_request,'appointment.cancel',
      jsonb_build_object('appointment_ref',p_appointment,'cancel_requested',true),clock_timestamp(),null,true);
  end if;
  -- Never insert or reopen a conversation block here.
  return to_jsonb(r);
end;
$$;

create function public.lexia_migration_claim_cancel(p_request uuid,p_calendar text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.lexia_google_cancellations%rowtype; b public.lexia_google_appointment_bindings%rowtype; token uuid;
begin
  select * into strict r from public.lexia_google_cancellations where request_id=p_request;
  perform public.lexia_omni_lock_conversation(r.conversation_id);
  select * into strict r from public.lexia_google_cancellations where request_id=p_request for update;
  select * into strict b from public.lexia_google_appointment_bindings where conversation_id=r.conversation_id and appointment_ref=r.appointment_ref;
  perform public.lexia_omni_require(b.calendar_id=p_calendar,'cancel_calendar_mismatch');
  if r.status<>'requested' then return jsonb_build_object('acquired',false,'status',r.status,'request_id',p_request); end if;
  token := extensions.gen_random_uuid();
  update public.lexia_google_cancellations set status='claimed',claim_token=token,updated_at=clock_timestamp() where request_id=p_request;
  update public.lexia_appointment_events set cancellation_status='claimed' where conversation_id=r.conversation_id and appointment_ref=r.appointment_ref;
  return to_jsonb(b)||jsonb_build_object('acquired',true,'request_id',p_request,'claim_token',token);
end;
$$;

create function public.lexia_migration_finish_cancel(p_request uuid,p_token uuid,p_verified boolean,p_receipt jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare r public.lexia_google_cancellations%rowtype; b public.lexia_google_appointment_bindings%rowtype; result text;
begin
  select * into strict r from public.lexia_google_cancellations where request_id=p_request;
  perform public.lexia_omni_lock_conversation(r.conversation_id);
  select * into strict r from public.lexia_google_cancellations where request_id=p_request for update;
  if r.status in ('unknown','confirmed') and r.claim_token=p_token and r.receipt=p_receipt then return r.status; end if;
  perform public.lexia_omni_require(r.status='claimed' and r.claim_token=p_token,'cancel_claim_mismatch');
  select * into strict b from public.lexia_google_appointment_bindings where conversation_id=r.conversation_id and appointment_ref=r.appointment_ref;
  perform public.lexia_omni_require(p_receipt->>'operation'='appointment.cancel'
    and p_receipt->>'request_id'=p_request::text and p_receipt->>'appointment_ref'=r.appointment_ref
    and p_receipt->>'calendar_id'=b.calendar_id and p_receipt->>'provider_event_id'=b.provider_event_id,
    'cancel_receipt_origin_mismatch');
  perform public.lexia_omni_require(not p_verified or (p_receipt->>'status'='succeeded'
    and p_receipt->'absence_verified'='true'::jsonb),'cancel_receipt_proof_required');
  result := case when p_verified then 'confirmed' else 'unknown' end;
  update public.lexia_google_cancellations set status=result,receipt=p_receipt,updated_at=clock_timestamp() where request_id=p_request;
  update public.lexia_appointment_events set cancellation_status=result where conversation_id=r.conversation_id and appointment_ref=r.appointment_ref;
  if p_verified then
    perform public.lexia_omni_cancel_appointment(r.conversation_id,'google-cancel:'||p_request,r.appointment_ref,b.tool_call_id::text,clock_timestamp());
  end if;
  return result;
end;
$$;

-- Enforce cancellation-pending at the same final claim that checks every pause.
alter function public.lexia_omni_claim_outbound_action(uuid,text) rename to lexia_omni_claim_outbound_action_before_google_cancel;
create function public.lexia_omni_claim_outbound_action(p_action uuid,p_claimant text)
returns table(out_acquired boolean,out_status text,out_reason text,out_fencing_token bigint)
language plpgsql security definer set search_path='' as $$
declare a public.lexia_outbound_actions%rowtype;
begin
  select * into strict a from public.lexia_outbound_actions where id=p_action;
  perform public.lexia_omni_lock_conversation(a.conversation_id);
  if a.kind in ('appointment_reminder','appointment_confirmation') and exists(select 1 from public.lexia_appointment_events e
    where e.conversation_id=a.conversation_id and e.appointment_ref=a.source_ref and e.cancellation_status is not null) then
    if a.status='prepared' then perform public.lexia_omni_suppress_plan(a.id,'appointment_cancellation_pending'); end if;
    return query select false,'suppressed'::text,'appointment_cancellation_pending'::text,null::bigint; return;
  end if;
  return query select * from public.lexia_omni_claim_outbound_action_before_google_cancel(p_action,p_claimant);
end;
$$;

-- Transport outbox, independent of Redis's projection outbox. Store typed CRM
-- envelopes only; no credentials or private tool responses belong here.
create table public.lexia_crm_delivery_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.lexia_conversation_states(id),
  event_id uuid not null unique,
  event jsonb not null check(jsonb_typeof(event)='object'),
  status text not null default 'pending' check(status in ('pending','claimed','delivered','unknown')),
  claim_token uuid,
  created_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz
);
create function public.lexia_migration_enqueue_crm(p_conversation uuid,p_event jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; r public.lexia_crm_delivery_outbox%rowtype;
begin
  s := public.lexia_omni_lock_conversation(p_conversation);
  perform public.lexia_omni_require(p_event->>'schema_version'='lexia.crm.event.v1'
    and p_event->'scope'->>'environment'=s.environment and p_event->'scope'->>'cliente_slug'=s.cliente_slug
    and p_event->'scope'->>'channel'=s.channel and p_event->'scope'->>'account_ref'=s.account_id::text
    and p_event->'scope'->>'conversation_ref'=s.conversation_ref,'crm_outbox_scope_mismatch');
  insert into public.lexia_crm_delivery_outbox(conversation_id,event_id,event)
    values(s.id,(p_event->>'event_id')::uuid,p_event) on conflict(event_id) do nothing;
  select * into strict r from public.lexia_crm_delivery_outbox where event_id=(p_event->>'event_id')::uuid;
  perform public.lexia_omni_require(r.conversation_id=s.id
    and r.event->'scope'=p_event->'scope' and r.event->'payload'=p_event->'payload'
    and r.event->>'event_type'=p_event->>'event_type'
    and r.event->>'idempotency_key'=p_event->>'idempotency_key','crm_outbox_retry_conflict');
  return r.id;
end;
$$;

-- Receipt belongs to a persisted calendar call, not to text emitted by a model.
-- This dependency requires the reviewed calendar-tool ledger installed first.
create function public.lexia_migration_project_booking()
returns trigger language plpgsql security definer set search_path='' as $$
declare e jsonb; a jsonb; s public.lexia_conversation_states%rowtype;
begin
  if new.status<>'completed' or new.operation<>'appointment.create' or new.receipt->>'status'<>'succeeded' then return new; end if;
  perform public.lexia_omni_require(new.receipt->>'operation'='appointment.create'
    and new.receipt->>'tool_call_id'=new.id::text
    and new.receipt->>'invocation_id'=new.request->>'invocation_id'
    and new.receipt->'scope'=new.request->'scope'
    and jsonb_array_length(new.receipt->'domain_events')=1,'booking_receipt_origin_mismatch');
  e := new.receipt->'domain_events'->0; a := e->'appointment';
  s := public.lexia_omni_lock_conversation(new.conversation_id);
  perform public.lexia_omni_require(e->>'type'='appointment.confirmed' and a->>'status'='confirmed'
    and a->>'tool_invocation_id'=new.id::text and a->>'appointment_ref'='caltest:'||new.id::text
    and (a->>'starts_at')::timestamptz=(new.plan->>'inicio')::timestamptz
    and (a->>'ends_at')::timestamptz=(new.plan->>'fim')::timestamptz,'booking_effect_mismatch');
  perform public.lexia_omni_confirm_appointment(s.id,'calendar:'||new.id,a->>'appointment_ref',
    (a->>'starts_at')::timestamptz,(a->>'ends_at')::timestamptz,a->>'timezone',new.id::text,(e->>'occurred_at')::timestamptz);
  insert into public.lexia_google_appointment_bindings(conversation_id,appointment_ref,calendar_id,provider_event_id,tool_call_id)
    values(s.id,a->>'appointment_ref',new.calendar_id,new.provider_event_id,new.id) on conflict(conversation_id,appointment_ref) do nothing;
  return new;
end;
$$;
create trigger lexia_migration_booking_confirmed after update of status on public.lexia_calendar_tool_calls
  for each row when (new.status='completed') execute function public.lexia_migration_project_booking();

do $$ declare t text; f record; begin
  foreach t in array array['lexia_google_appointment_bindings','lexia_google_cancellations','lexia_crm_delivery_outbox'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'lexia_migration_%' or p.proname in
      ('lexia_omni_claim_outbound_action','lexia_omni_claim_outbound_action_before_google_cancel')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
