-- Add the two state-event types already emitted by the Lot 2 RPCs.
-- This follow-up is required only for targets where the first Lot 2 migration
-- was applied before the isolated runtime harness found the mismatch.

begin;

do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
  expected_env text := nullif(current_setting('lexia.target_environment', true), '');
  identity_ref text;
  identity_env text;
  identity_disposable boolean;
begin
  if expected_ref is null or expected_env is null then
    raise exception 'Target identity must be declared before the Lot 2 follow-up';
  end if;
  select project_ref, environment, disposable
    into identity_ref, identity_env, identity_disposable
  from public.lexia_environment_identity
  where id;
  if identity_ref is distinct from expected_ref
    or identity_env is distinct from expected_env then
    raise exception 'Target identity mismatch';
  end if;
  if expected_env = 'isolated_test' and identity_disposable is not true then
    raise exception 'Isolated target must be disposable';
  end if;
end;
$$;

alter table public.lexia_conversation_state_events
  drop constraint lexia_conversation_state_events_command_type_check;

alter table public.lexia_conversation_state_events
  add constraint lexia_conversation_state_events_command_type_check
  check (command_type in (
    'lead_message.record',
    'pending.release',
    'human_intervention.record',
    'manual_pause.start',
    'block.end',
    'blocks.expire',
    'handoff.request',
    'handoff.resolve',
    'handoff.resume',
    'appointment.confirm',
    'appointment.cancel',
    'appointment.attendance.update',
    'context.store'
  ));

commit;
