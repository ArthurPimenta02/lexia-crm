-- Read-only gate before the CRM appointment-cancellation follow-up.

begin transaction read only;

do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
  expected_env text := nullif(current_setting('lexia.target_environment', true), '');
  identity_ref text;
  identity_env text;
  identity_disposable boolean;
begin
  if expected_ref is null or expected_env is null then
    raise exception 'Target identity must be declared before the CRM follow-up preflight';
  end if;
  select project_ref, environment, disposable
    into identity_ref, identity_env, identity_disposable
  from public.lexia_environment_identity
  where id;
  if identity_ref is distinct from expected_ref
    or identity_env is distinct from expected_env
    or identity_disposable is not true then
    raise exception 'CRM follow-up target identity mismatch';
  end if;

  if to_regclass('public.lexia_appointment_events') is null
    or to_regclass('public.lexia_conversation_states') is null
    or to_regclass('public.lexia_channel_accounts') is null then
    raise exception 'Lot 2 control-plane schema is incomplete';
  end if;
  if to_regprocedure(
    'public.lexia_omni_cancel_appointment_from_crm(uuid,text,text,timestamptz,uuid)'
  ) is not null then
    raise exception 'CRM appointment cancellation follow-up is already installed';
  end if;

  if (select count(*) from public.lexia_clientes) <> 2
    or exists (
      select 1 from public.lexia_clientes
      where slug not in ('empresa_sintetica_a', 'empresa_sintetica_b')
    ) then
    raise exception 'Unexpected client rows exist in the disposable Lot 2 project';
  end if;
  if (select count(*) from public.lexia_channel_accounts) <> 2
    or exists (
      select 1
      from public.lexia_channel_accounts
      where id not in (
        '24000000-0000-4000-8000-000000000001'::uuid,
        '24000000-0000-4000-8000-000000000002'::uuid
      )
        or environment <> 'isolated_test'
        or provider <> 'fake'
        or delivery_mode <> 'observe_only'
    ) then
    raise exception 'Unexpected account rows exist in the disposable Lot 2 project';
  end if;
  if exists (select 1 from public.lexia_conversation_states) then
    raise exception 'Synthetic runtime residue must be cleaned before the CRM follow-up';
  end if;
  if (select count(*) from public.lexia_lote2_test_resources) <> 10
    or exists (
      select 1
      from public.lexia_lote2_test_resources
      where run_id <> '25000000-0000-4000-8000-000000000001'::uuid
        or (resource_type, resource_id) not in (
          ('cliente', 'empresa_sintetica_a'),
          ('cliente', 'empresa_sintetica_b'),
          ('policy', '21000000-0000-4000-8000-000000000001'),
          ('policy', '21000000-0000-4000-8000-000000000002'),
          ('context_config', '22000000-0000-4000-8000-000000000001'),
          ('context_config', '22000000-0000-4000-8000-000000000002'),
          ('brain_binding', '23000000-0000-4000-8000-000000000001'),
          ('brain_binding', '23000000-0000-4000-8000-000000000002'),
          ('channel_account', '24000000-0000-4000-8000-000000000001'),
          ('channel_account', '24000000-0000-4000-8000-000000000002')
        )
    ) then
    raise exception 'Unexpected manifest resource exists before the CRM follow-up';
  end if;
end;
$$;

commit;
