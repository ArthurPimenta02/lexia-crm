-- Read-only verification after 202610080001_lote2_omnichannel_control_plane.sql.
-- The final block raises when an approved invariant is missing.

begin transaction read only;

select c.relname, c.relrowsecurity as rls_enabled
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in (
    'lexia_channel_accounts', 'lexia_omnichannel_policies', 'lexia_context_agent_configs',
    'lexia_brain_bindings', 'lexia_conversation_states', 'lexia_conversation_blocks',
    'lexia_conversation_state_events', 'lexia_ingress_events', 'lexia_inbound_batches',
    'lexia_inbound_buffer_entries', 'lexia_appointment_events', 'lexia_automation_requests',
    'lexia_outbound_actions', 'lexia_conversation_contexts', 'lexia_omnichannel_projection_outbox'
  )
order by c.relname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like any (array[
    'lexia\_channel\_accounts', 'lexia\_omnichannel\_%', 'lexia\_context\_agent\_configs',
    'lexia\_brain\_bindings', 'lexia\_conversation\_%', 'lexia\_ingress\_events',
    'lexia\_inbound\_%', 'lexia\_appointment\_events', 'lexia\_automation\_requests',
    'lexia\_outbound\_actions'
  ])
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
    'lexia_omnichannel_policies', 'lexia_conversation_states',
    'lexia_conversation_blocks', 'lexia_appointment_events'
  )
order by table_name, column_name;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'lexia_omnichannel_policies', 'lexia_conversation_states',
    'lexia_conversation_blocks', 'lexia_appointment_events'
  )
order by tablename, policyname;

select p.proname, p.prosecdef, p.proconfig,
  array(
    select a.grantee::regrole::text
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.privilege_type = 'EXECUTE'
    order by 1
  ) as execute_grantees
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname like 'lexia\_omni\_%'
order by p.proname;

select indexrelid::regclass::text as index_name, pg_get_indexdef(indexrelid) as definition
from pg_index
where indexrelid in (
  to_regclass('public.lexia_omnichannel_policies_active_key'),
  to_regclass('public.lexia_context_agent_configs_active_key'),
  to_regclass('public.lexia_inbound_batches_one_claimed_key'),
  to_regclass('public.lexia_outbound_actions_one_confirmation_key'),
  to_regclass('public.lexia_mensagens_omni_provider_key'),
  to_regclass('public.lexia_handoffs_omni_idempotency_key')
)
order by index_name;

select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'lexia_omnichannel_policies'
  and column_name = 'pause_after_appointment';

select table_name, column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'lexia_handoffs'
      and column_name in ('omni_resolution', 'omni_resolved_at', 'omni_resolved_by'))
    or (table_name = 'lexia_appointment_events'
      and column_name in ('attendance_status', 'attendance_recorded_at', 'attendance_recorded_by'))
  )
order by table_name, column_name;

do $$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array[
    'lexia_channel_accounts', 'lexia_omnichannel_policies', 'lexia_context_agent_configs',
    'lexia_brain_bindings', 'lexia_conversation_states', 'lexia_conversation_blocks',
    'lexia_conversation_state_events', 'lexia_ingress_events', 'lexia_inbound_batches',
    'lexia_inbound_buffer_entries', 'lexia_appointment_events', 'lexia_automation_requests',
    'lexia_outbound_actions', 'lexia_conversation_contexts', 'lexia_omnichannel_projection_outbox'
  ]) t
  where not exists (
    select 1 from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relname = t and c.relrowsecurity
  );
  if missing is not null then
    raise exception 'Missing table or RLS: %', missing;
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      and table_name in (
        'lexia_channel_accounts', 'lexia_omnichannel_policies', 'lexia_context_agent_configs',
        'lexia_brain_bindings', 'lexia_conversation_states', 'lexia_conversation_blocks',
        'lexia_conversation_state_events', 'lexia_ingress_events', 'lexia_inbound_batches',
        'lexia_inbound_buffer_entries', 'lexia_appointment_events', 'lexia_automation_requests',
        'lexia_outbound_actions', 'lexia_conversation_contexts',
        'lexia_omnichannel_projection_outbox'
      )
  ) then
    raise exception 'API roles must not write Lot 2 tables directly';
  end if;

  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and table_name in ('lexia_context_agent_configs', 'lexia_brain_bindings',
        'lexia_outbound_actions', 'lexia_channel_accounts')
  ) then
    raise exception 'Prompts, brain bindings, accounts and action content are server-only';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lexia_omnichannel_policies'
      and column_name = 'pause_after_appointment'
      and (is_nullable <> 'NO' or column_default is not null)
  ) then
    raise exception 'pause_after_appointment must be NOT NULL without default';
  end if;

  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'lexia\_omni\_%'
      and p.proname not like 'lexia\_omni\_guard\_%'
      and (not p.prosecdef or not coalesce(p.proconfig, '{}') @> array['search_path=""'])
  ) then
    raise exception 'Lot 2 RPCs must be security definer with an empty search_path';
  end if;

  if exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'lexia\_omni\_%'
      and a.privilege_type = 'EXECUTE'
      and (
        a.grantee = 0
        or a.grantee = 'anon'::regrole
        or (a.grantee = 'authenticated'::regrole
          and p.proname not in ('lexia_omni_create_policy', 'lexia_omni_set_appointment_pause'))
      )
  ) then
    raise exception 'Only the admin policy RPCs may be executable by authenticated';
  end if;

  if exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('lexia_omni_create_policy', 'lexia_omni_set_appointment_pause')
      and a.privilege_type = 'EXECUTE'
      and a.grantee = 'service_role'::regrole
  ) then
    raise exception 'Policy RPCs require an authenticated Lexia admin session';
  end if;

  if (
    select count(distinct p.proname)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'lexia_omni_resolve_handoff',
        'lexia_omni_cancel_appointment_from_crm',
        'lexia_omni_update_appointment_attendance'
      )
  ) <> 3 then
    raise exception 'CRM handoff, cancellation and attendance RPCs are required';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'lexia_handoffs'
          and column_name in ('omni_resolution', 'omni_resolved_at', 'omni_resolved_by'))
        or (table_name = 'lexia_appointment_events'
          and column_name in ('attendance_status', 'attendance_recorded_at', 'attendance_recorded_by'))
      )
  ) <> 6 then
    raise exception 'CRM handoff resolution or appointment attendance columns are missing';
  end if;
end;
$$;

commit;
