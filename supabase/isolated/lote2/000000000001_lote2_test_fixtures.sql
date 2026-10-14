-- Deterministic, synthetic-only fixtures for the disposable Lot 2 harness.

begin;

do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
  identity_row public.lexia_environment_identity%rowtype;
begin
  select * into identity_row from public.lexia_environment_identity where id;
  if not found
    or identity_row.project_ref is distinct from expected_ref
    or identity_row.environment <> 'isolated_test'
    or identity_row.disposable is not true then
    raise exception 'Disposable target identity is missing or mismatched';
  end if;
end;
$$;

insert into public.lexia_clientes (id, slug, nome, status, modo_teste)
values
  ('20000000-0000-4000-8000-000000000001', 'empresa_sintetica_a', 'Empresa Sintetica A', 'ativo', true),
  ('20000000-0000-4000-8000-000000000002', 'empresa_sintetica_b', 'Empresa Sintetica B', 'ativo', true)
on conflict do nothing;

insert into public.lexia_omnichannel_policies (
  id, environment, cliente_slug, policy_version, status, resume_mode,
  human_intervention_ms, buffer_window_ms, pause_after_appointment
)
values
  (
    '21000000-0000-4000-8000-000000000001', 'isolated_test',
    'empresa_sintetica_a', 1, 'active', 'await_new_message', 900000, 60000, true
  ),
  (
    '21000000-0000-4000-8000-000000000002', 'isolated_test',
    'empresa_sintetica_b', 1, 'active', 'answer_pending', 600000, 30000, false
  )
on conflict do nothing;

insert into public.lexia_context_agent_configs (
  id, environment, cliente_slug, config_version, status, prompt_template,
  common_schema_version, company_fields_schema, locale, timezone,
  model_policy_ref
)
values
  (
    '22000000-0000-4000-8000-000000000001', 'isolated_test',
    'empresa_sintetica_a', 'synthetic-a-v1', 'active',
    'Prompt sintetico A. Use somente fatos do pacote A.',
    'lexia.context.result.v1',
    '{"type":"object","additionalProperties":false,"required":["segmento_a"],"properties":{"segmento_a":{"type":"string"}}}'::jsonb,
    'pt-BR', 'America/Sao_Paulo', 'fake-context-model-v1'
  ),
  (
    '22000000-0000-4000-8000-000000000002', 'isolated_test',
    'empresa_sintetica_b', 'synthetic-b-v1', 'active',
    'Prompt sintetico B. Use somente fatos do pacote B.',
    'lexia.context.result.v1',
    '{"type":"object","additionalProperties":false,"required":["segmento_b"],"properties":{"segmento_b":{"type":"string"}}}'::jsonb,
    'pt-BR', 'America/Sao_Paulo', 'fake-context-model-v1'
  )
on conflict do nothing;

insert into public.lexia_brain_bindings (
  id, environment, cliente_slug, brain_ref, contract_version,
  capabilities, status
)
values
  (
    '23000000-0000-4000-8000-000000000001', 'isolated_test',
    'empresa_sintetica_a', 'fake.brain.a', 'lexia.brain.request.v1',
    array['reply', 'handoff', 'appointment.confirmed', 'appointment.cancelled'],
    'active'
  ),
  (
    '23000000-0000-4000-8000-000000000002', 'isolated_test',
    'empresa_sintetica_b', 'fake.brain.b', 'lexia.brain.request.v1',
    array['reply', 'handoff'], 'active'
  )
on conflict do nothing;

insert into public.lexia_channel_accounts (
  id, environment, cliente_slug, channel, provider, provider_account_ref,
  adapter_ref, status, delivery_owner, delivery_mode
)
values
  (
    '24000000-0000-4000-8000-000000000001', 'isolated_test',
    'empresa_sintetica_a', 'whatsapp', 'fake', 'synthetic-account-a',
    'fake-adapter-v1', 'active', 'v2', 'observe_only'
  ),
  (
    '24000000-0000-4000-8000-000000000002', 'isolated_test',
    'empresa_sintetica_b', 'whatsapp', 'fake', 'synthetic-account-b',
    'fake-adapter-v1', 'active', 'v2', 'observe_only'
  )
on conflict do nothing;

insert into public.lexia_lote2_test_resources (
  run_id, resource_type, resource_id, cliente_slug
)
values
  ('25000000-0000-4000-8000-000000000001', 'cliente', 'empresa_sintetica_a', 'empresa_sintetica_a'),
  ('25000000-0000-4000-8000-000000000001', 'cliente', 'empresa_sintetica_b', 'empresa_sintetica_b'),
  ('25000000-0000-4000-8000-000000000001', 'policy', '21000000-0000-4000-8000-000000000001', 'empresa_sintetica_a'),
  ('25000000-0000-4000-8000-000000000001', 'policy', '21000000-0000-4000-8000-000000000002', 'empresa_sintetica_b'),
  ('25000000-0000-4000-8000-000000000001', 'context_config', '22000000-0000-4000-8000-000000000001', 'empresa_sintetica_a'),
  ('25000000-0000-4000-8000-000000000001', 'context_config', '22000000-0000-4000-8000-000000000002', 'empresa_sintetica_b'),
  ('25000000-0000-4000-8000-000000000001', 'brain_binding', '23000000-0000-4000-8000-000000000001', 'empresa_sintetica_a'),
  ('25000000-0000-4000-8000-000000000001', 'brain_binding', '23000000-0000-4000-8000-000000000002', 'empresa_sintetica_b'),
  ('25000000-0000-4000-8000-000000000001', 'channel_account', '24000000-0000-4000-8000-000000000001', 'empresa_sintetica_a'),
  ('25000000-0000-4000-8000-000000000001', 'channel_account', '24000000-0000-4000-8000-000000000002', 'empresa_sintetica_b')
on conflict do nothing;

do $$
begin
  if (select count(*) from public.lexia_clientes where slug like 'empresa_sintetica_%') <> 2 then
    raise exception 'Synthetic companies are missing or unexpected';
  end if;
  if exists (
    select 1 from public.lexia_channel_accounts
    where cliente_slug in ('empresa_sintetica_a', 'empresa_sintetica_b')
      and (provider <> 'fake' or delivery_mode <> 'observe_only')
  ) then
    raise exception 'Synthetic accounts must remain fake and observe_only';
  end if;
  if (select count(*) from public.lexia_omnichannel_policies where status = 'active') <> 2
    or (select count(*) from public.lexia_context_agent_configs where status = 'active') <> 2
    or (select count(*) from public.lexia_brain_bindings where status = 'active') <> 2 then
    raise exception 'Synthetic configuration set is incomplete';
  end if;
end;
$$;

commit;
