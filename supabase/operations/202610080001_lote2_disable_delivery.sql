-- Operational rollback for Lot 2 delivery (non-destructive).
--
-- Returns every v2 account of one environment to observe_only with the v1
-- workflow as delivery owner. v2 tables, blocks, handoffs, appointments,
-- deduplication records and sent actions are kept for a later return. The
-- legacy bridge must keep v1 paused while any compatible v2 block is active.
--
-- Required psql variables: lexia_target_project_ref, lexia_environment
--   psql "$LEXIA_DB_OPERATION_URL" -v ON_ERROR_STOP=1 \
--     -v lexia_target_project_ref=<project_ref> \
--     -v lexia_environment=staging \
--     -f supabase/operations/202610080001_lote2_disable_delivery.sql

\set ON_ERROR_STOP on

begin;

-- Target identity: declared project and environment must match the marker,
-- and the psql variable must name the same environment.
select set_config('lexia.target_project_ref', :'lexia_target_project_ref', true);
select set_config('lexia.target_environment', :'lexia_environment', true);

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
end;
$$;

update public.lexia_channel_accounts
set delivery_mode = 'observe_only', delivery_owner = 'v1', atualizado_em = now()
where environment = :'lexia_environment'
  and (delivery_mode <> 'observe_only' or delivery_owner <> 'v1');

-- Claimed actions may already be at the provider: they stay claimed for
-- reconciliation and are never retried blindly.
select id, cliente_slug, status, reivindicado_em
from public.lexia_outbound_actions
where environment = :'lexia_environment'
  and status in ('claimed', 'delivery_unknown')
order by reivindicado_em;

select cliente_slug, channel, delivery_owner, delivery_mode
from public.lexia_channel_accounts
where environment = :'lexia_environment'
order by cliente_slug, channel;

commit;
