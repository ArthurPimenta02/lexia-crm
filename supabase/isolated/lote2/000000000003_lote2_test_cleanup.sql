-- Delete only rows belonging to the synthetic Lot 2 manifest.
-- The harness schema and migration remain installed for inspection.

begin;

do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
  expected_confirmation text := 'CLEAN_LOTE2_SYNTHETIC_DATA:' || expected_ref;
begin
  if current_setting('lexia.lote2_cleanup_confirm', true) is distinct from expected_confirmation then
    raise exception 'Project-bound Lot 2 cleanup confirmation is required';
  end if;
  if not exists (
    select 1 from public.lexia_environment_identity
    where id and project_ref = expected_ref
      and environment = 'isolated_test' and disposable
  ) then
    raise exception 'Disposable target identity is missing or mismatched';
  end if;
  if exists (
    select 1 from public.lexia_lote2_test_resources
    where cliente_slug is not null
      and cliente_slug not in ('empresa_sintetica_a', 'empresa_sintetica_b')
  ) then
    raise exception 'Manifest contains a non-synthetic tenant';
  end if;
end;
$$;

delete from public.lexia_omnichannel_projection_outbox
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_conversation_contexts
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_outbound_actions
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_automation_requests
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_appointment_events
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_inbound_buffer_entries
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_inbound_batches
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_ingress_events
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');

-- The append-only guard is disabled only inside this cleanup transaction.
-- Any failure rolls both its state and all deletes back together.
alter table public.lexia_conversation_state_events
  disable trigger lexia_conversation_state_events_append_only;
delete from public.lexia_conversation_state_events
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
alter table public.lexia_conversation_state_events
  enable trigger lexia_conversation_state_events_append_only;

delete from public.lexia_conversation_blocks
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_handoffs
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_mensagens
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
update public.lexia_conversation_states
set contacto_id = null
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_conversation_states
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_contactos
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_brain_bindings
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_context_agent_configs
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_omnichannel_policies
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_channel_accounts
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_usuarios_clientes
where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b');
delete from public.lexia_lote2_test_resources
where run_id = '25000000-0000-4000-8000-000000000001';
delete from public.lexia_clientes
where slug in ('empresa_sintetica_a', 'empresa_sintetica_b');

do $$
begin
  if exists (
    select 1 from public.lexia_clientes
    where slug in ('empresa_sintetica_a', 'empresa_sintetica_b')
  ) or exists (
    select 1 from public.lexia_lote2_test_resources
    where run_id = '25000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Synthetic database cleanup is incomplete';
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
