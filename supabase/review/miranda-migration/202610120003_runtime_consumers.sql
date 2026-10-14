-- LOCAL REVIEW ONLY. Requires 001/002 and the existing Lot 2 baseline.
-- No bootstrap, cleanup, environment relabelling or provider retry here.
begin;

alter table public.lexia_mensagens add column omni_original_content text;
alter table public.lexia_mensagens add column omni_enriched_at timestamptz;
create function public.lexia_migration_message_original()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then new.omni_original_content:=new.conteudo;
  elsif new.conteudo is distinct from old.conteudo or new.media_processing_status is distinct from old.media_processing_status then
    new.omni_original_content:=old.omni_original_content;
    new.omni_enriched_at:=clock_timestamp();
  end if;
  return new;
end;
$$;
create trigger lexia_migration_preserve_original before insert or update of conteudo,media_processing_status on public.lexia_mensagens
  for each row execute function public.lexia_migration_message_original();

create table public.lexia_migration_crm_commands (
  id uuid primary key,
  conversation_id uuid not null references public.lexia_conversation_states(id),
  actor_user_id uuid not null references auth.users(id),
  command jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

create table public.lexia_followups (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.lexia_conversation_states(id),
  environment text not null,
  cliente_slug text not null,
  account_ref uuid not null references public.lexia_channel_accounts(id),
  canal text not null,
  identificador text not null,
  sender_id text not null default '',
  nome_contacto text not null default '',
  etapa integer not null check(etapa between 1 and 2),
  status text not null check(status in ('agendado','encerrado')),
  ultima_msg_cliente_em timestamptz not null,
  ultima_msg_agente_em timestamptz,
  proxima_tentativa_em timestamptz not null,
  tentativas_enviadas integer not null default 0 check(tentativas_enviadas between 0 and 2),
  motivo_juiz text not null default '',
  motivo_encerramento text not null default '',
  dia_combinado timestamptz,
  tema_audio text,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  unique(conversation_id,ultima_msg_cliente_em),
  foreign key(conversation_id,environment,cliente_slug) references public.lexia_conversation_states(id,environment,cliente_slug)
);

create function public.lexia_migration_schedule_followup(p_conversation uuid,p_plan jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; last_lead timestamptz;
begin
  if p_plan is null or p_plan='null'::jsonb then return false;end if;
  s:=public.lexia_omni_lock_conversation(p_conversation);
  perform public.lexia_omni_require(p_plan->>'cliente_slug'=s.cliente_slug and p_plan->>'canal'=s.channel
    and p_plan->>'identificador'=s.identificador_conversa,'followup_schedule_scope_mismatch');
  select max(coalesce(m.provider_timestamp,m.criado_em)) into last_lead from public.lexia_mensagens m
    where m.omni_conversation_id=s.id and m.omni_author='lead';
  if last_lead is null or public.lexia_omni_has_active_block(s.id,clock_timestamp()) then return false;end if;
  -- Do not restart a cycle from an unconfirmed answer or an older batch.
  if not exists(select 1 from public.lexia_inbound_batches b join public.lexia_outbound_actions a on a.invocation_id=b.invocation_id
    and a.conversation_id=b.conversation_id where b.conversation_id=s.id and b.cutoff_seq=s.lead_message_seq and b.status='completed'
    and (a.status='sent' or (s.environment='isolated_test' and s.conversation_ref like 'test:%'
      and a.status='suppressed' and a.reason='virtual_delivered'))) then return false;end if;
  update public.lexia_followups set status='encerrado',motivo_encerramento='lead_replied',atualizado_em=clock_timestamp()
    where conversation_id=s.id and status='agendado' and ultima_msg_cliente_em<last_lead;
  insert into public.lexia_followups(conversation_id,environment,cliente_slug,account_ref,canal,identificador,
    sender_id,nome_contacto,etapa,status,ultima_msg_cliente_em,proxima_tentativa_em,dia_combinado,tema_audio)
  values(s.id,s.environment,s.cliente_slug,s.account_id,s.channel,s.identificador_conversa,
    coalesce(p_plan->>'sender_id',''),coalesce(p_plan->>'nome_contacto',''),(p_plan->>'etapa')::integer,
    'agendado',last_lead,(p_plan->>'proxima_tentativa_em')::timestamptz,(p_plan->>'dia_combinado')::timestamptz,p_plan->>'tema_audio')
    on conflict(conversation_id,ultima_msg_cliente_em) do nothing;
  return found;
end;
$$;

create function public.lexia_migration_close_followup()
returns trigger language plpgsql security definer set search_path='' as $$
declare conversation uuid; at timestamptz;
begin
  if tg_table_name='lexia_mensagens' then
    conversation:=new.omni_conversation_id;at:=coalesce(new.provider_timestamp,new.criado_em);
    if conversation is null or new.omni_author<>'lead' then return new;end if;
    perform public.lexia_omni_lock_conversation(conversation);
    update public.lexia_followups set status='encerrado',motivo_encerramento='lead_replied',atualizado_em=clock_timestamp()
      where conversation_id=conversation and status='agendado' and ultima_msg_cliente_em<at;
  else
    conversation:=new.conversation_id;
    perform public.lexia_omni_lock_conversation(conversation);
    update public.lexia_followups set status='encerrado',motivo_encerramento='appointment_confirmed',atualizado_em=clock_timestamp()
      where conversation_id=conversation and status='agendado';
  end if;
  return new;
end;
$$;
create trigger lexia_migration_reply_closes_cycle after insert on public.lexia_mensagens
  for each row when(new.omni_author='lead') execute function public.lexia_migration_close_followup();
create trigger lexia_migration_booking_closes_cycle after insert on public.lexia_appointment_events
  for each row when(new.status='confirmed') execute function public.lexia_migration_close_followup();

-- The only state rebase admitted is the pause produced by this invocation's
-- confirmed create operation. Other changes keep the old snapshot and fail
-- the ordinary gate. Confirmation content comes from the attested receipt.
create function public.lexia_migration_reply_plan(p_conversation uuid,p_invocation uuid,p_actions jsonb,p_version bigint,p_epoch bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; t public.lexia_calendar_tool_calls%rowtype;
  a public.lexia_appointment_events%rowtype; count_calls integer; state jsonb;
begin
  s:=public.lexia_omni_lock_conversation(p_conversation);
  state:=jsonb_build_object('state_version',p_version,'delivery_epoch',p_epoch);
  select count(*) into count_calls from public.lexia_calendar_tool_calls
    where conversation_id=s.id and request->>'invocation_id'=p_invocation::text and operation='appointment.create'
    and status='completed' and receipt->>'status'='succeeded';
  if count_calls=0 then return jsonb_build_object('kind','reply','actions',p_actions,'captured_state',state);end if;
  perform public.lexia_omni_require(count_calls=1,'multiple_terminal_bookings');
  select * into strict t from public.lexia_calendar_tool_calls where conversation_id=s.id
    and request->>'invocation_id'=p_invocation::text and operation='appointment.create' and status='completed' and receipt->>'status'='succeeded';
  select * into strict a from public.lexia_appointment_events where conversation_id=s.id and tool_invocation_id=t.id::text;
  perform public.lexia_omni_require(t.request->'captured_state'=state,'confirmation_request_state_mismatch');
  if s.state_version=p_version+(case when a.paused_until_end then 1 else 0 end)
    and s.delivery_epoch=p_epoch+(case when a.paused_until_end then 1 else 0 end) then
    state:=jsonb_build_object('state_version',s.state_version,'delivery_epoch',s.delivery_epoch);
  end if;
  perform public.lexia_omni_require(length(t.receipt->'data'->>'confirmacao_texto') between 1 and 4000,'confirmation_text_limit');
  return jsonb_build_object('kind','appointment_confirmation','source_ref',a.appointment_ref,'captured_state',state,
    'actions',jsonb_build_array(jsonb_build_object('action_id',p_actions->0->>'action_id','sequence',1,
      'content',jsonb_build_object('type','text','text',t.receipt->'data'->>'confirmacao_texto'))));
end;
$$;

create function public.lexia_migration_apply_command(p_command jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; previous public.lexia_migration_crm_commands%rowtype;
  key text; payload jsonb; result jsonb; cancel jsonb;
begin
  perform public.lexia_omni_require(p_command->>'schema_version'='lexia.crm.command.v1','command_contract_required');
  select * into strict s from public.lexia_conversation_states
    where environment=p_command->'scope'->>'environment' and cliente_slug=p_command->'scope'->>'cliente_slug'
    and channel=p_command->'scope'->>'channel' and account_id=(p_command->'scope'->>'account_ref')::uuid
    and conversation_ref=p_command->'scope'->>'conversation_ref';
  s:=public.lexia_omni_lock_conversation(s.id);
  select * into previous from public.lexia_migration_crm_commands where id=(p_command->>'command_id')::uuid;
  if found then
    perform public.lexia_omni_require(previous.command=p_command and previous.actor_user_id=p_actor
      and previous.conversation_id=s.id,'crm_command_retry_conflict');
    return public.lexia_migration_command_receipt(previous.id);
  end if;
  key:='crm:'||(p_command->>'command_id');payload:=p_command->'payload';
  case p_command->>'command_type'
    when 'manual_pause.start' then
      perform public.lexia_omni_start_manual_pause(s.id,key,payload->>'pause_ref',
        (p_command->>'occurred_at')::timestamptz,(payload->>'expires_at')::timestamptz,p_actor);
    when 'manual_pause.end' then
      perform public.lexia_omni_end_block(s.id,key,'manual:'||(payload->>'pause_ref'),
        (p_command->>'occurred_at')::timestamptz,p_actor,payload->>'reason');
    when 'handoff.resolve' then
      perform public.lexia_omni_resolve_handoff(s.id,key,(payload->>'handoff_id')::uuid,
        payload->>'resolution',payload->>'notes',(p_command->>'occurred_at')::timestamptz,p_actor);
    when 'handoff.resume' then
      perform public.lexia_omni_resume_handoff(s.id,key,(payload->>'handoff_id')::uuid,(p_command->>'occurred_at')::timestamptz,p_actor);
    when 'appointment.attendance.update' then
      perform public.lexia_omni_update_appointment_attendance(s.id,key,payload->>'appointment_ref',
        payload->>'attendance_status',(p_command->>'occurred_at')::timestamptz,p_actor);
    when 'appointment.cancel' then
      cancel:=public.lexia_migration_request_cancel(s.id,payload->>'appointment_ref',(p_command->>'command_id')::uuid);
    else raise exception 'unsupported_crm_command' using errcode='22023';
  end case;
  result:=jsonb_build_object('command_id',p_command->>'command_id','conversation_id',s.id,
    'status',case when cancel is null then 'applied' else 'delivery_unknown' end,
    'cancel_required',cancel is not null and cancel->>'status'='requested');
  insert into public.lexia_migration_crm_commands(id,conversation_id,actor_user_id,command,result)
    values((p_command->>'command_id')::uuid,s.id,p_actor,p_command,result);
  return result;
end;
$$;

create function public.lexia_migration_command_receipt(p_command uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.lexia_migration_crm_commands%rowtype; c public.lexia_google_cancellations%rowtype;
begin
  select * into strict r from public.lexia_migration_crm_commands where id=p_command;
  if r.command->>'command_type'<>'appointment.cancel' then return r.result;end if;
  select * into strict c from public.lexia_google_cancellations where request_id=p_command and conversation_id=r.conversation_id;
  return r.result||jsonb_build_object('status',case when c.status='confirmed' then 'applied' else 'delivery_unknown' end,
    'cancel_required',c.status='requested','cancellation_status',c.status);
end;
$$;

-- A version-specific key cannot be overwritten by a late writer. The central
-- completion RPC compares versions before marking the projection current.
create function public.lexia_migration_projection_snapshot(p_conversation uuid,p_environment text,p_tenant text,p_accounts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; o uuid; blocks jsonb;
begin
  s:=public.lexia_omni_lock_conversation(p_conversation);
  perform public.lexia_omni_require(s.environment=p_environment and s.cliente_slug=p_tenant
    and p_accounts ? s.account_id::text,'projection_scope_denied');
  perform public.lexia_omni_expire_blocks(s.id,'expire:'||s.id||':'||s.state_version);
  select * into strict s from public.lexia_conversation_states where id=p_conversation;
  select id into o from public.lexia_omnichannel_projection_outbox
    where conversation_id=s.id and state_version=s.state_version order by criado_em desc limit 1;
  if o is null then
    insert into public.lexia_omnichannel_projection_outbox(conversation_id,environment,cliente_slug,state_version)
      values(s.id,s.environment,s.cliente_slug,s.state_version) returning id into o;
  end if;
  select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) into blocks
    from public.lexia_conversation_blocks b where conversation_id=s.id;
  return jsonb_build_object('outbox_id',o,'key','lexia:omni:v2:'||s.environment||':'||s.cliente_slug||':'||s.channel||':'||s.account_id||':{'||s.id||'}:snapshot:'||s.state_version,
    'value',jsonb_build_object('state_version',s.state_version,'delivery_epoch',s.delivery_epoch,'blocks',blocks));
end;
$$;

-- Only one event at a time per conversation. CRM retries are safe because its
-- ingestion ledger compares immutable event identity; this never retries sends.
alter table public.lexia_crm_delivery_outbox add column claimed_at timestamptz;
create function public.lexia_migration_claim_crm_event(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.lexia_crm_delivery_outbox%rowtype; token uuid;
begin
  select * into strict r from public.lexia_crm_delivery_outbox where id=p_id;
  perform public.lexia_omni_lock_conversation(r.conversation_id);
  select * into strict r from public.lexia_crm_delivery_outbox where id=p_id for update;
  if r.status='delivered' or (r.status='claimed' and r.claimed_at>clock_timestamp()-interval '2 minutes') then
    return jsonb_build_object('acquired',false,'status',r.status);end if;
  if exists(select 1 from public.lexia_crm_delivery_outbox o where o.conversation_id=r.conversation_id
    and o.status<>'delivered' and (o.created_at,o.id)<(r.created_at,r.id)) then
    return jsonb_build_object('acquired',false,'status','waiting_previous_event');end if;
  token:=extensions.gen_random_uuid();
  update public.lexia_crm_delivery_outbox set status='claimed',claim_token=token,claimed_at=clock_timestamp() where id=p_id;
  return jsonb_build_object('acquired',true,'id',r.id,'claim_token',token,'event',r.event);
end;
$$;
create function public.lexia_migration_claim_crm(p_conversation uuid,p_environment text,p_tenant text,p_accounts jsonb)
returns table(id uuid,claim_token uuid,event jsonb)
language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; r public.lexia_crm_delivery_outbox%rowtype; token uuid;
begin
  s:=public.lexia_omni_lock_conversation(p_conversation);
  perform public.lexia_omni_require(s.environment=p_environment and s.cliente_slug=p_tenant
    and p_accounts ? s.account_id::text,'crm_recovery_scope_denied');
  select * into r from public.lexia_crm_delivery_outbox o where o.conversation_id=s.id and o.status<>'delivered'
    order by o.created_at,o.id limit 1 for update;
  if not found or (r.status='claimed' and r.claimed_at>clock_timestamp()-interval '2 minutes') then return;end if;
  token:=extensions.gen_random_uuid();
  update public.lexia_crm_delivery_outbox o set status='claimed',claim_token=token,claimed_at=clock_timestamp() where o.id=r.id;
  return query select r.id,token,r.event;
end;
$$;
create function public.lexia_migration_finish_crm(p_id uuid,p_token uuid,p_confirmed boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.lexia_crm_delivery_outbox set status=case when p_confirmed then 'delivered' else 'unknown' end,
    delivered_at=case when p_confirmed then clock_timestamp() else null end
    where id=p_id and claim_token=p_token and status='claimed';
  perform public.lexia_omni_require(found,'crm_outbox_claim_mismatch');
end;
$$;

create function public.lexia_migration_enqueue_automation_crm(p_events jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; e jsonb; scope jsonb; count_events integer:=0;
begin
  perform public.lexia_omni_require(jsonb_typeof(p_events)='array' and jsonb_array_length(p_events) between 1 and 2,'automation_crm_event_limit');
  scope:=p_events->0->'scope';
  select * into strict s from public.lexia_conversation_states where environment=scope->>'environment' and cliente_slug=scope->>'cliente_slug'
    and channel=scope->>'channel' and account_id=(scope->>'account_ref')::uuid and conversation_ref=scope->>'conversation_ref';
  s:=public.lexia_omni_lock_conversation(s.id);
  -- Virtual tests have their own chat/results and do not leak into Conversations.
  if s.conversation_ref like 'test:%' or exists(select 1 from public.lexia_channel_accounts a where a.id=s.account_id and a.provider='fake') then return 0;end if;
  for e in select value from jsonb_array_elements(p_events) loop
    perform public.lexia_omni_require(e->'scope'=scope and e->>'event_type' in ('message.recorded','automation.updated'),'automation_crm_scope_or_type');
    perform public.lexia_migration_enqueue_crm(s.id,e);count_events:=count_events+1;
  end loop;
  return count_events;
end;
$$;

alter table public.lexia_migration_crm_commands enable row level security;
revoke all on public.lexia_migration_crm_commands from public,anon,authenticated;
grant select,insert,update on public.lexia_migration_crm_commands to service_role;
alter table public.lexia_followups enable row level security;
revoke all on public.lexia_followups from public,anon,authenticated;
grant select,insert,update on public.lexia_followups to service_role;
do $$ declare f record;begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'lexia_migration_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
