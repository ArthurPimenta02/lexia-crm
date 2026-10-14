-- Remove only the runtime rows registered by the isolated Lot 2 manifest.
-- Configuration fixtures and the installed harness schema remain available.

begin;

do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
  expected_confirmation text := 'CLEAN_LOTE2_RUNTIME:' || expected_ref;
begin
  if current_setting('lexia.lote2_runtime_cleanup_confirm', true)
    is distinct from expected_confirmation then
    raise exception 'Project-bound Lot 2 runtime cleanup confirmation is required';
  end if;
  if not exists (
    select 1 from public.lexia_environment_identity
    where id and project_ref = expected_ref
      and environment = 'isolated_test' and disposable
  ) then
    raise exception 'Disposable target identity is missing or mismatched';
  end if;
end;
$$;

create temporary table lote2_runtime_cleanup_conversations (
  id uuid primary key
) on commit drop;

insert into lote2_runtime_cleanup_conversations (id)
select s.id
from public.lexia_conversation_states s
where s.environment = 'isolated_test'
  and s.cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b')
  and s.account_id in (
    '24000000-0000-4000-8000-000000000001'::uuid,
    '24000000-0000-4000-8000-000000000002'::uuid
  )
  and s.conversation_ref = 'synthetic-runtime-conversation-shared'
union
select r.resource_id::uuid
from public.lexia_lote2_test_resources r
where r.run_id = '26000000-0000-4000-8000-000000000001'::uuid
  and r.resource_type = 'conversation'
  and r.cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');

do $$
begin
  if exists (
    select 1
    from lote2_runtime_cleanup_conversations target
    join public.lexia_conversation_states s on s.id = target.id
    where s.environment <> 'isolated_test'
      or s.cliente_slug not in ('empresa_sintetica_a', 'empresa_sintetica_b')
      or s.account_id not in (
        '24000000-0000-4000-8000-000000000001'::uuid,
        '24000000-0000-4000-8000-000000000002'::uuid
      )
      or s.conversation_ref <> 'synthetic-runtime-conversation-shared'
  ) then
    raise exception 'Runtime cleanup target escaped the synthetic manifest';
  end if;
end;
$$;

delete from public.lexia_omnichannel_projection_outbox
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_conversation_contexts
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_outbound_actions
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_automation_requests
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_appointment_events
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_inbound_buffer_entries
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_inbound_batches
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_ingress_events
where conversation_id in (select id from lote2_runtime_cleanup_conversations);

-- The production table is append-only. The isolated cleanup temporarily
-- disables only its guard inside this transaction, then restores it before
-- commit. Any failure rolls the trigger state and all deletes back together.
alter table public.lexia_conversation_state_events
  disable trigger lexia_conversation_state_events_append_only;
delete from public.lexia_conversation_state_events
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
alter table public.lexia_conversation_state_events
  enable trigger lexia_conversation_state_events_append_only;

delete from public.lexia_conversation_blocks
where conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_handoffs
where omni_conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_mensagens
where omni_conversation_id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_conversation_states
where id in (select id from lote2_runtime_cleanup_conversations);
delete from public.lexia_lote2_test_resources
where run_id = '26000000-0000-4000-8000-000000000001'::uuid;

do $$
begin
  if exists (
    select 1 from public.lexia_conversation_states
    where environment = 'isolated_test'
      and cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b')
      and conversation_ref = 'synthetic-runtime-conversation-shared'
  ) or exists (
    select 1 from public.lexia_lote2_test_resources
    where run_id = '26000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'Synthetic runtime database cleanup is incomplete';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'lexia_conversation_state_events_append_only'
      and tgenabled = 'O'
      and not tgisinternal
  ) then
    raise exception 'Append-only trigger was not restored';
  end if;
end;
$$;

commit;
