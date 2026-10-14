-- REVIEW ONLY. Durable notifications are independent of lead deliveries.
begin;
create table public.lexia_team_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.lexia_conversation_states(id),
  kind text not null check(kind in ('handoff','appointment')),
  source_ref text not null,
  recipient_ref text not null check(recipient_ref in ('samuel','partner')),
  payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','claimed','sent','unknown')),
  claim_token uuid,
  provider_message_id text,
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id,kind,source_ref,recipient_ref)
);
create function public.lexia_migration_enqueue_team()
returns trigger language plpgsql security definer set search_path='' as $$
declare conversation uuid; kind text; source text; payload jsonb; t public.lexia_calendar_tool_calls%rowtype;
begin
  if tg_table_name='lexia_handoffs' then
    conversation:=new.omni_conversation_id;kind:='handoff';source:=new.id::text;
    payload:=jsonb_build_object('priority',new.prioridade,'reason',new.motivo,'summary',new.resumo);
  else
    conversation:=new.conversation_id;kind:='appointment';source:=new.appointment_ref;
    select * into t from public.lexia_calendar_tool_calls where id::text=new.tool_invocation_id
      and conversation_id=conversation and operation='appointment.create' and status='completed' and receipt->>'status'='succeeded';
    if not found then return new;end if;
    payload:=jsonb_build_object('starts_at',new.starts_at,'ends_at',new.ends_at,'timezone',new.timezone,
      'service',t.receipt->'data'->'agendamento'->>'servico','professional',t.receipt->'data'->'agendamento'->>'profissional',
      'display_name',t.receipt->'data'->'agendamento'->>'nome');
  end if;
  insert into public.lexia_team_notifications(conversation_id,kind,source_ref,recipient_ref,payload)
    values(conversation,kind,source,'samuel',payload) on conflict do nothing;
  if kind='appointment' then
    insert into public.lexia_team_notifications(conversation_id,kind,source_ref,recipient_ref,payload)
      values(conversation,kind,source,'partner',payload) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger lexia_migration_handoff_team after insert on public.lexia_handoffs
  for each row when(new.omni_conversation_id is not null) execute function public.lexia_migration_enqueue_team();
create trigger lexia_migration_appointment_team after insert on public.lexia_appointment_events
  for each row when(new.status='confirmed') execute function public.lexia_migration_enqueue_team();

create function public.lexia_migration_claim_team(p_id uuid,p_environment text,p_tenant text,p_accounts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.lexia_team_notifications%rowtype; s public.lexia_conversation_states%rowtype; token uuid;
begin
  select * into strict r from public.lexia_team_notifications where id=p_id;
  s:=public.lexia_omni_lock_conversation(r.conversation_id);
  perform public.lexia_omni_require(s.environment=p_environment and s.cliente_slug=p_tenant
    and p_accounts ? s.account_id::text and s.conversation_ref not like 'test:%'
    and exists(select 1 from public.lexia_channel_accounts a where a.id=s.account_id and a.status='active' and a.provider<>'fake'),
    'team_notification_scope_denied');
  select * into strict r from public.lexia_team_notifications where id=p_id for update;
  if r.status<>'pending' then return jsonb_build_object('acquired',false,'status',r.status);end if;
  if r.kind='appointment' and not exists(select 1 from public.lexia_appointment_events a
    where a.conversation_id=s.id and a.appointment_ref=r.source_ref and a.status='confirmed' and a.cancellation_status is null) then
    return jsonb_build_object('acquired',false,'status','appointment_no_longer_confirmed');end if;
  token:=extensions.gen_random_uuid();
  update public.lexia_team_notifications set status='claimed',claim_token=token where id=p_id;
  return jsonb_build_object('acquired',true,'id',p_id,'claim_token',token);
end;
$$;
create function public.lexia_migration_finish_team(p_id uuid,p_token uuid,p_status text,p_provider_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.lexia_omni_require(p_status in ('sent','unknown') and (p_status<>'sent' or nullif(p_provider_id,'') is not null),'team_receipt_required');
  update public.lexia_team_notifications set status=p_status,provider_message_id=p_provider_id
    where id=p_id and claim_token=p_token and status='claimed';
  perform public.lexia_omni_require(found,'team_claim_mismatch');
end;
$$;
alter table public.lexia_team_notifications enable row level security;
revoke all on public.lexia_team_notifications from public,anon,authenticated;
grant select,insert,update on public.lexia_team_notifications to service_role;
do $$ declare f record;begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('lexia_migration_enqueue_team','lexia_migration_claim_team','lexia_migration_finish_team') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
