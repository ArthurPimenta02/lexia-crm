-- Initial post-appointment policies (operation, not migration).
--
-- Run only after the migration and verify succeeded on the same target and
-- after explicit approval for that environment. These are initial settings,
-- not fixed rules: later changes go through lexia_omni_set_appointment_pause,
-- which only an active Lexia admin session can call.
--
-- Required psql variables (no defaults on purpose; a missing variable makes
-- psql fail before any write):
--   lexia_target_project_ref       project ref authorized for this run
--   lexia_environment              local | isolated_test | staging | production
--   detail_resume_mode             await_new_message | answer_pending
--   detail_human_intervention_ms   integer, from the Detail workflow inventory
--   detail_buffer_window_ms        integer, from the Detail workflow inventory
--
-- Miranda values come from the current export: 15 min human intervention
-- (900000 ms), 60 s buffer (60000 ms), await_new_message, pause enabled.
-- Detail starts with the pause disabled; its timing values are still pending
-- the Detail workflow export and must be supplied explicitly.
--
-- Example:
--   psql "$LEXIA_DB_OPERATION_URL" -v ON_ERROR_STOP=1 \
--     -v lexia_target_project_ref=<project_ref> \
--     -v lexia_environment=isolated_test \
--     -v detail_resume_mode=await_new_message \
--     -v detail_human_intervention_ms=<confirmed> \
--     -v detail_buffer_window_ms=<confirmed> \
--     -f supabase/operations/202610080002_lote2_seed_initial_policies.sql

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

-- An already active policy makes the unique index fail: the seed never
-- overwrites a policy chosen later on the platform.
insert into public.lexia_omnichannel_policies (
  environment,
  cliente_slug,
  policy_version,
  status,
  resume_mode,
  human_intervention_ms,
  buffer_window_ms,
  pause_after_appointment
) values
  (:'lexia_environment', 'miranda_skin_experts', 1, 'active',
    'await_new_message', 900000, 60000, true),
  (:'lexia_environment', 'detail_by_cordeiro', 1, 'active',
    :'detail_resume_mode', :detail_human_intervention_ms, :detail_buffer_window_ms, false);

select environment, cliente_slug, policy_version, pause_after_appointment
from public.lexia_omnichannel_policies
where environment = :'lexia_environment'
  and cliente_slug in ('miranda_skin_experts', 'detail_by_cordeiro')
  and status = 'active'
order by cliente_slug;

commit;
