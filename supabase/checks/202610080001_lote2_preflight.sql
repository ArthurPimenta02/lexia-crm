-- Read-only preflight for Lot 2. Run on the exact target before
-- 202610080001_lote2_omnichannel_control_plane.sql and review every result.
-- Nothing here writes. The final block raises when a hard blocker exists.

-- 1. Target identity, for review. The marker alone is not validation: the
--    final block requires the operator to declare the authorized project and
--    environment in this session and compares them with the marker row.
--      set lexia.target_project_ref = '<project_ref>';
--      set lexia.target_environment = '<environment>';
begin transaction read only;

select to_regclass('public.lexia_environment_identity') is not null
  as has_environment_identity_marker,
  current_setting('lexia.target_project_ref', true) as declared_project_ref,
  current_setting('lexia.target_environment', true) as declared_environment;

-- 2. Lot 1 helpers that the new RLS policies and admin RPCs depend on.
select proname, prosecdef, proconfig
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('lexia_is_admin', 'lexia_user_can_access_cliente')
order by proname;

-- 3. Lot 2 objects must not exist yet.
select c.relname as already_present
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in (
    'lexia_channel_accounts',
    'lexia_omnichannel_policies',
    'lexia_context_agent_configs',
    'lexia_brain_bindings',
    'lexia_conversation_states',
    'lexia_conversation_blocks',
    'lexia_conversation_state_events',
    'lexia_ingress_events',
    'lexia_inbound_batches',
    'lexia_inbound_buffer_entries',
    'lexia_appointment_events',
    'lexia_automation_requests',
    'lexia_outbound_actions',
    'lexia_conversation_contexts',
    'lexia_omnichannel_projection_outbox'
  )
order by c.relname;

select proname as function_already_present
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname like 'lexia\_omni\_%'
order by proname;

-- 4. Columns the migration adds must not exist on the legacy tables.
select table_name, column_name as column_already_present
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'lexia_contactos' and column_name in ('omni_account_id', 'provider_contact_ref'))
    or (table_name = 'lexia_mensagens' and column_name in (
      'omni_conversation_id', 'omni_author', 'provider_message_id', 'provider_timestamp',
      'omni_action_id', 'lead_seq', 'media_kind', 'media_processing_status', 'media_error_code'
    ))
    or (table_name = 'lexia_handoffs' and column_name in (
      'omni_conversation_id', 'block_key', 'idempotency_key', 'retomado_em', 'retomado_por'
    ))
  )
order by table_name, column_name;

-- 5. Legacy columns the RPCs write. Review nullability and defaults: any NOT
--    NULL column without default that the RPCs do not fill is a blocker.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('lexia_clientes', 'lexia_contactos', 'lexia_mensagens', 'lexia_handoffs')
order by table_name, ordinal_position;

-- 6. Existing checks on values the RPCs insert ('humano', 'workflow',
--    'recebida_na_pausa', 'omnichannel_v2', 'pendente', priorities).
select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
    'public.lexia_mensagens'::regclass,
    'public.lexia_handoffs'::regclass,
    'public.lexia_contactos'::regclass
  )
  and contype in ('c', 'f', 'u', 'p')
order by table_name, conname;

-- 7. Existing triggers, RLS and grants on the legacy tables being extended.
select event_object_table as table_name, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('lexia_mensagens', 'lexia_handoffs', 'lexia_contactos')
order by table_name, trigger_name;

select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
  c.reltuples::bigint as estimated_rows
from pg_class c
where c.oid in (
  'public.lexia_mensagens'::regclass,
  'public.lexia_handoffs'::regclass,
  'public.lexia_contactos'::regclass
)
order by c.relname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('lexia_mensagens', 'lexia_handoffs', 'lexia_contactos')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- 8. Companies used by the initial policy seed (separate operation file).
select slug, status
from public.lexia_clientes
where slug in ('miranda_skin_experts', 'detail_by_cordeiro')
order by slug;

-- 9. Default privileges that would grant new objects to API roles. The
--    migration revokes them explicitly; this documents what it overrides.
select defaclrole::regrole::text as owner, defaclobjtype, defaclacl
from pg_default_acl
where defaclnamespace = 'public'::regnamespace
order by owner, defaclobjtype;

-- 10. Hard blockers.
do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
  expected_env text := nullif(current_setting('lexia.target_environment', true), '');
  identity_ref text;
  identity_env text;
begin
  if expected_ref is null or expected_env is null then
    raise exception 'lexia.target_project_ref and lexia.target_environment are required';
  end if;
  if to_regclass('public.lexia_environment_identity') is null then
    raise exception 'Target has no environment identity marker';
  end if;
  execute 'select project_ref, environment from public.lexia_environment_identity where id'
    into identity_ref, identity_env;
  if identity_ref is distinct from expected_ref or identity_env is distinct from expected_env then
    raise exception 'Target identity does not match the authorized project and environment';
  end if;
  if to_regprocedure('public.lexia_is_admin()') is null
    or to_regprocedure('public.lexia_user_can_access_cliente(text)') is null then
    raise exception 'Lot 1 access helpers are required before Lot 2';
  end if;
  if to_regprocedure('extensions.gen_random_uuid()') is null then
    raise exception 'extensions.gen_random_uuid() is required';
  end if;
  if to_regclass('public.lexia_omnichannel_policies') is not null
    or to_regclass('public.lexia_conversation_states') is not null then
    raise exception 'Lot 2 objects already exist on this target';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lexia_mensagens'
      and column_name = 'omni_conversation_id'
  ) then
    raise exception 'Lot 2 columns already exist on lexia_mensagens';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lexia_clientes'::regclass
      and contype in ('p', 'u')
      and pg_get_constraintdef(oid) ~* '\(slug\)'
  ) then
    raise exception 'lexia_clientes.slug must be unique for the new foreign keys';
  end if;
end;
$$;

commit;
