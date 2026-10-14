-- Read-only verification of the freshly installed Lot 2 isolated harness.

begin transaction read only;

do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
begin
  if not exists (
    select 1 from public.lexia_environment_identity
    where id and project_ref = expected_ref
      and environment = 'isolated_test' and disposable
  ) then
    raise exception 'Disposable target identity is missing or mismatched';
  end if;
  if (select count(*) from public.lexia_clientes) <> 2
    or (select count(*) from public.lexia_clientes where slug in (
      'empresa_sintetica_a', 'empresa_sintetica_b'
    )) <> 2 then
    raise exception 'Only the two manifest companies are allowed';
  end if;
  if exists (
    select 1 from public.lexia_channel_accounts
    where environment <> 'isolated_test'
      or provider <> 'fake'
      or delivery_mode <> 'observe_only'
  ) then
    raise exception 'A channel account can deliver or is not synthetic';
  end if;
  if exists (select 1 from public.lexia_conversation_states)
    or exists (select 1 from public.lexia_mensagens)
    or exists (select 1 from public.lexia_handoffs)
    or exists (select 1 from public.lexia_outbound_actions) then
    raise exception 'Operational rows exist before the isolated test run';
  end if;
  if exists (select 1 from auth.users) then
    raise exception 'Auth users exist before the isolated test run';
  end if;
end;
$$;

select
  (select count(*) from public.lexia_clientes) as synthetic_companies,
  (select count(*) from public.lexia_channel_accounts) as fake_accounts,
  (select count(*) from public.lexia_omnichannel_policies where status = 'active') as active_policies,
  (select count(*) from public.lexia_context_agent_configs where status = 'active') as active_context_configs,
  (select count(*) from public.lexia_brain_bindings where status = 'active') as active_brains;

commit;
