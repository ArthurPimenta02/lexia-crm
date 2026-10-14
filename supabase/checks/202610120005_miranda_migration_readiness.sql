-- READ ONLY. No installation, seeds, cleanup or RPC effects.
-- Intended central only. Missing objects are reported, not automatically created.
begin read only;
do $$
begin
  if (select count(*) from public.lexia_environment_identity) <> 1 or
     not exists(select 1 from public.lexia_environment_identity
       where project_ref='gaofupndxgitonfmvpzi' and environment='isolated_test') then
    raise exception 'miranda_readiness_central_identity_mismatch';
  end if;
end;
$$;
with required(name) as (values
  ('lexia_calendar_tool_calls'),('lexia_crm_delivery_outbox'),
  ('lexia_migration_crm_commands'),('lexia_followups'),('lexia_team_notifications'))
select name as required_table, to_regclass('public.'||name) is not null as installed
from required order by name;
with required(name) as (values
  ('lexia_migration_handoff'),('lexia_migration_projection_snapshot'),
  ('lexia_migration_reply_plan'),('lexia_migration_schedule_followup'),
  ('lexia_migration_enqueue_crm'),('lexia_migration_claim_crm_event'),
  ('lexia_migration_claim_team'))
select r.name as required_function, exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=r.name) as installed
from required r order by r.name;
select 'miranda_skin_experts' as target_tenant,
  exists(select 1 from public.lexia_channel_accounts where environment='isolated_test'
    and cliente_slug='miranda_skin_experts' and provider='fake' and status='active') as virtual_account_installed,
  (select count(*) from public.lexia_context_agent_configs where environment='isolated_test'
    and cliente_slug='miranda_skin_experts' and status='active') as active_context_configs,
  exists(select 1 from public.lexia_omnichannel_policies where environment='isolated_test'
    and cliente_slug='miranda_skin_experts' and status='active' and resume_mode='await_new_message'
    and human_intervention_ms=900000) as approved_policy_installed;
rollback;
