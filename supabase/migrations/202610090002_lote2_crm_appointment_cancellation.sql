-- Adds the CRM-specific appointment cancellation path found during the
-- isolated Frappe integration review. It intentionally preserves the tool
-- invocation that originally confirmed the appointment.

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
    raise exception 'Target identity must be declared before the Lot 2 CRM follow-up';
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

create or replace function public.lexia_omni_cancel_appointment_from_crm(
  p_conversation_id uuid,
  p_command_id text,
  p_appointment_ref text,
  p_occurred_at timestamptz,
  p_actor uuid
)
returns table (out_state_version bigint, out_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  appointment_row public.lexia_appointment_events%rowtype;
  new_version bigint;
  changed boolean;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  perform public.lexia_omni_require(p_appointment_ref is not null, 'appointment_ref_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);
  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return query select conversation_row.state_version, true;
    return;
  end if;

  select * into appointment_row
  from public.lexia_appointment_events
  where conversation_id = p_conversation_id and appointment_ref = p_appointment_ref
  for update;
  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  changed := appointment_row.status <> 'cancelled';
  update public.lexia_appointment_events
  set status = 'cancelled',
      cancelled_idempotency_key = coalesce(cancelled_idempotency_key, p_command_id),
      attendance_status = 'cancelled',
      attendance_recorded_at = coalesce(attendance_recorded_at, p_occurred_at),
      attendance_recorded_by = coalesce(attendance_recorded_by, p_actor),
      atualizado_em = clock_timestamp()
  where id = appointment_row.id;

  update public.lexia_conversation_blocks
  set atualizado_em = greatest(atualizado_em, p_occurred_at)
  where conversation_id = p_conversation_id
    and block_key = 'appointment:' || p_appointment_ref
    and status = 'active';

  new_version := public.lexia_omni_commit_transition(
    p_conversation_id, p_command_id, 'appointment.cancel',
    jsonb_build_object('appointment_ref', p_appointment_ref, 'source', 'crm'),
    p_occurred_at, p_actor, changed
  );
  return query select new_version, false;
end;
$$;

revoke all on function public.lexia_omni_cancel_appointment_from_crm(uuid, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.lexia_omni_cancel_appointment_from_crm(uuid, text, text, timestamptz, uuid)
  to service_role;

commit;
