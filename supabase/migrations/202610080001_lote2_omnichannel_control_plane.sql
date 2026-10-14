-- Lot 2 - omnichannel control plane (additive).
--
-- Review gate: this file is prepared for review only. Do not apply it before
-- running supabase/checks/202610080001_lote2_preflight.sql on the exact
-- target, reviewing its output and obtaining explicit approval. The first
-- target must be a disposable isolated project, never staging or production.
--
-- Scope of this migration:
-- - creates the durable v2 tables, all scoped by environment and company;
-- - adds nullable v2 columns to lexia_contactos, lexia_mensagens and
--   lexia_handoffs without changing the legacy contract;
-- - writes only through security definer RPCs executable by service_role;
-- - the post-appointment policy can be created or changed only by an active
--   Lexia admin JWT, enforced here with lexia_is_admin();
-- - company users read only their own policy, blocks and appointments;
-- - delivery stays observe_only until a separate operation switches an
--   account to delivery_owner = 'v2'.
--
-- The legacy workflows and lib/redis/agent-locks.ts keep working unchanged:
-- nothing here is read by them.

begin;

-- Target identity: the operator must declare, in this session, the exact
-- authorized project and environment, and they must match the marker row.
-- The existence of a marker alone is not accepted as validation.
--   set lexia.target_project_ref = '<project_ref>';
--   set lexia.target_environment = '<environment>';
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

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------

create table public.lexia_channel_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  environment text not null
    check (environment in ('local', 'isolated_test', 'staging', 'production')),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  provider text not null check (provider in ('meta', 'zapi', 'fake')),
  provider_account_ref text not null
    check (char_length(provider_account_ref) between 1 and 256),
  adapter_ref text not null check (char_length(adapter_ref) between 1 and 128),
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  delivery_owner text not null default 'v1' check (delivery_owner in ('v1', 'v2')),
  delivery_mode text not null default 'observe_only'
    check (delivery_mode in ('observe_only', 'deliver')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint lexia_channel_accounts_provider_key
    unique (environment, provider, provider_account_ref),
  constraint lexia_channel_accounts_scope_key
    unique (id, environment, cliente_slug, channel),
  constraint lexia_channel_accounts_fake_check
    check (provider <> 'fake' or environment in ('local', 'isolated_test')),
  constraint lexia_channel_accounts_delivery_check
    check (delivery_mode = 'observe_only' or delivery_owner = 'v2')
);

create table public.lexia_omnichannel_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  environment text not null
    check (environment in ('local', 'isolated_test', 'staging', 'production')),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  policy_version integer not null check (policy_version >= 1),
  status text not null check (status in ('active', 'superseded')),
  resume_mode text not null check (resume_mode in ('await_new_message', 'answer_pending')),
  human_intervention_ms integer not null
    check (human_intervention_ms between 1000 and 604800000),
  buffer_window_ms integer not null check (buffer_window_ms between 1000 and 600000),
  -- Explicit per-company choice. No default on purpose: a new company must
  -- choose, and the same rule applies to WhatsApp, Instagram and Messenger.
  pause_after_appointment boolean not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  substituido_em timestamptz,
  constraint lexia_omnichannel_policies_version_key
    unique (environment, cliente_slug, policy_version)
);

create unique index lexia_omnichannel_policies_active_key
  on public.lexia_omnichannel_policies (environment, cliente_slug)
  where status = 'active';

create table public.lexia_context_agent_configs (
  id uuid primary key default extensions.gen_random_uuid(),
  environment text not null
    check (environment in ('local', 'isolated_test', 'staging', 'production')),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  config_version text not null check (char_length(config_version) between 1 and 64),
  status text not null check (status in ('active', 'inactive')),
  prompt_template text not null check (char_length(prompt_template) between 1 and 20000),
  common_schema_version text not null check (common_schema_version = 'lexia.context.result.v1'),
  company_fields_schema jsonb not null check (jsonb_typeof(company_fields_schema) = 'object'),
  locale text not null check (char_length(locale) between 2 and 16),
  timezone text not null check (char_length(timezone) between 1 and 64),
  model_policy_ref text not null check (char_length(model_policy_ref) between 1 and 64),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint lexia_context_agent_configs_version_key
    unique (environment, cliente_slug, config_version)
);

create unique index lexia_context_agent_configs_active_key
  on public.lexia_context_agent_configs (environment, cliente_slug)
  where status = 'active';

create table public.lexia_brain_bindings (
  id uuid primary key default extensions.gen_random_uuid(),
  environment text not null
    check (environment in ('local', 'isolated_test', 'staging', 'production')),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  brain_ref text not null check (brain_ref ~ '^[a-z0-9_.-]{1,64}$'),
  contract_version text not null check (contract_version = 'lexia.brain.request.v1'),
  capabilities text[] not null default '{}'::text[],
  status text not null check (status in ('active', 'inactive')),
  criado_em timestamptz not null default now()
);

create unique index lexia_brain_bindings_active_key
  on public.lexia_brain_bindings (environment, cliente_slug)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Conversation state
-- ---------------------------------------------------------------------------

create table public.lexia_conversation_states (
  id uuid primary key default extensions.gen_random_uuid(),
  environment text not null
    check (environment in ('local', 'isolated_test', 'staging', 'production')),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  account_id uuid not null,
  conversation_ref text not null check (char_length(conversation_ref) between 1 and 256),
  -- Legacy-compatible identifier used by lexia_contactos and lexia_mensagens.
  identificador_conversa text not null
    check (char_length(identificador_conversa) between 1 and 256),
  contacto_id uuid references public.lexia_contactos(id) on delete set null,
  state_version bigint not null default 0 check (state_version >= 0),
  delivery_epoch bigint not null default 0 check (delivery_epoch >= 0),
  lead_message_seq bigint not null default 0 check (lead_message_seq >= 0),
  fencing_counter bigint not null default 0 check (fencing_counter >= 0),
  projection_status text not null default 'stale'
    check (projection_status in ('current', 'stale')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint lexia_conversation_states_account_fkey
    foreign key (account_id, environment, cliente_slug, channel)
    references public.lexia_channel_accounts (id, environment, cliente_slug, channel),
  constraint lexia_conversation_states_scope_key
    unique (environment, cliente_slug, channel, account_id, conversation_ref),
  constraint lexia_conversation_states_tenant_key unique (id, environment, cliente_slug),
  constraint lexia_conversation_states_slug_key unique (id, cliente_slug)
);

create table public.lexia_conversation_blocks (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  block_key text not null
    check (block_key ~ '^(human_intervention|(manual|handoff|appointment|legacy_import):.{1,240})$'),
  block_type text not null
    check (block_type in ('human_intervention', 'manual_pause', 'handoff', 'appointment', 'legacy_import')),
  status text not null check (status in ('active', 'ended', 'expired')),
  source_ref text not null check (char_length(source_ref) between 1 and 256),
  expires_at timestamptz,
  encerrado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null,
  atualizado_em timestamptz not null,
  constraint lexia_conversation_blocks_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug),
  constraint lexia_conversation_blocks_key unique (conversation_id, block_key),
  constraint lexia_conversation_blocks_type_check check (
    (block_type = 'human_intervention' and block_key = 'human_intervention')
    or (block_type = 'manual_pause' and block_key like 'manual:%')
    or (block_type = 'handoff' and block_key like 'handoff:%' and expires_at is null)
    or (block_type = 'appointment' and block_key like 'appointment:%' and expires_at is not null)
    or (block_type = 'legacy_import' and block_key like 'legacy_import:%')
  )
);

create index lexia_conversation_blocks_active_idx
  on public.lexia_conversation_blocks (conversation_id)
  where status = 'active';

create index lexia_conversation_blocks_expiry_idx
  on public.lexia_conversation_blocks (expires_at)
  where status = 'active' and expires_at is not null;

create table public.lexia_conversation_state_events (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  command_id text not null check (char_length(command_id) between 1 and 300),
  command_type text not null check (command_type in (
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
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  state_version_after bigint not null,
  occurred_at timestamptz not null,
  registrado_em timestamptz not null default now(),
  constraint lexia_conversation_state_events_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug),
  constraint lexia_conversation_state_events_command_key unique (conversation_id, command_id)
);

create table public.lexia_ingress_events (
  id uuid primary key default extensions.gen_random_uuid(),
  environment text not null,
  cliente_slug text not null,
  channel text not null,
  account_id uuid not null,
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 256),
  event_type text not null check (event_type in (
    'message', 'message_edit', 'message_delete', 'reaction', 'postback', 'unsupported'
  )),
  conversation_id uuid references public.lexia_conversation_states(id) on delete restrict,
  occurred_at timestamptz not null,
  recebido_em timestamptz not null default now(),
  constraint lexia_ingress_events_account_fkey
    foreign key (account_id, environment, cliente_slug, channel)
    references public.lexia_channel_accounts (id, environment, cliente_slug, channel),
  constraint lexia_ingress_events_provider_key unique (account_id, provider_event_id)
);

-- ---------------------------------------------------------------------------
-- Additive columns on legacy tables (all nullable, legacy rows untouched)
-- ---------------------------------------------------------------------------

alter table public.lexia_contactos
  add column omni_account_id uuid references public.lexia_channel_accounts(id) on delete restrict,
  add column provider_contact_ref text check (char_length(provider_contact_ref) <= 256);

alter table public.lexia_mensagens
  add column omni_conversation_id uuid,
  add column omni_author text check (omni_author in ('lead', 'human_agent', 'ai', 'system')),
  add column provider_message_id text check (char_length(provider_message_id) <= 256),
  add column provider_timestamp timestamptz,
  add column omni_action_id uuid,
  add column lead_seq bigint check (lead_seq > 0),
  add column media_kind text check (media_kind in ('text', 'audio', 'image', 'pdf', 'video')),
  add column media_processing_status text
    check (media_processing_status in ('pending', 'completed', 'failed', 'not_supported')),
  add column media_error_code text check (char_length(media_error_code) <= 64),
  add constraint lexia_mensagens_omni_conversation_fkey
    foreign key (omni_conversation_id, cliente_slug)
    references public.lexia_conversation_states (id, cliente_slug);

create unique index lexia_mensagens_omni_provider_key
  on public.lexia_mensagens (omni_conversation_id, provider_message_id)
  where omni_conversation_id is not null and provider_message_id is not null;

create unique index lexia_mensagens_omni_lead_seq_key
  on public.lexia_mensagens (omni_conversation_id, lead_seq)
  where omni_conversation_id is not null and lead_seq is not null;

alter table public.lexia_handoffs
  add column omni_conversation_id uuid,
  add column block_key text check (block_key like 'handoff:%'),
  add column idempotency_key text check (char_length(idempotency_key) between 1 and 256),
  add column omni_resolution text check (omni_resolution in ('resolved', 'lost')),
  add column omni_resolved_at timestamptz,
  add column omni_resolved_by uuid references auth.users(id) on delete set null,
  add column retomado_em timestamptz,
  add column retomado_por uuid references auth.users(id) on delete set null,
  add constraint lexia_handoffs_omni_conversation_fkey
    foreign key (omni_conversation_id, cliente_slug)
    references public.lexia_conversation_states (id, cliente_slug);

create unique index lexia_handoffs_omni_idempotency_key
  on public.lexia_handoffs (omni_conversation_id, idempotency_key)
  where omni_conversation_id is not null and idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Buffer, appointments, actions, automations, context, projection
-- ---------------------------------------------------------------------------

create table public.lexia_inbound_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  fencing_token bigint not null check (fencing_token > 0),
  cutoff_seq bigint not null check (cutoff_seq > 0),
  status text not null check (status in ('claimed', 'completed', 'superseded')),
  invocation_id uuid,
  superseded_invocation_ids uuid[] not null default '{}'::uuid[],
  carried_into uuid references public.lexia_inbound_batches(id) on delete restrict,
  reivindicado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  constraint lexia_inbound_batches_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug),
  constraint lexia_inbound_batches_fencing_key unique (conversation_id, fencing_token),
  constraint lexia_inbound_batches_superseded_check
    check (status <> 'superseded' or invocation_id is not null)
);

create unique index lexia_inbound_batches_one_claimed_key
  on public.lexia_inbound_batches (conversation_id)
  where status = 'claimed';

create table public.lexia_inbound_buffer_entries (
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  mensagem_id uuid not null references public.lexia_mensagens(id) on delete restrict,
  lead_seq bigint not null check (lead_seq > 0),
  disposition text not null check (disposition in ('buffered', 'pending')),
  batch_id uuid references public.lexia_inbound_batches(id) on delete restrict,
  enfileirado_em timestamptz not null default now(),
  primary key (conversation_id, mensagem_id),
  constraint lexia_inbound_buffer_entries_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug),
  constraint lexia_inbound_buffer_entries_seq_key unique (conversation_id, lead_seq),
  constraint lexia_inbound_buffer_entries_pending_check
    check (disposition = 'buffered' or batch_id is null)
);

create index lexia_inbound_buffer_entries_open_idx
  on public.lexia_inbound_buffer_entries (conversation_id, lead_seq desc)
  where batch_id is null;

create table public.lexia_appointment_events (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  appointment_ref text not null check (char_length(appointment_ref) between 1 and 240),
  status text not null check (status in ('confirmed', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  tool_invocation_id text not null check (char_length(tool_invocation_id) between 1 and 256),
  confirmed_idempotency_key text not null,
  cancelled_idempotency_key text,
  attendance_status text not null default 'unknown'
    check (attendance_status in ('unknown', 'attended', 'no_show', 'cancelled')),
  attendance_recorded_at timestamptz,
  attendance_recorded_by uuid references auth.users(id) on delete set null,
  -- Captured from the company policy when the appointment was confirmed.
  paused_until_end boolean not null,
  policy_version integer not null,
  confirmation_action_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint lexia_appointment_events_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug),
  constraint lexia_appointment_events_ref_key unique (conversation_id, appointment_ref),
  constraint lexia_appointment_events_interval_check check (ends_at > starts_at)
);

create table public.lexia_automation_requests (
  id uuid primary key,
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  kind text not null check (kind in ('appointment_reminder', 'followup')),
  source_ref text not null check (char_length(source_ref) between 1 and 256),
  due_at timestamptz not null,
  status text not null check (status in ('accepted', 'suppressed', 'duplicate', 'rejected')),
  reason text check (char_length(reason) <= 64),
  recebido_em timestamptz not null default now(),
  constraint lexia_automation_requests_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug)
);

create table public.lexia_outbound_actions (
  id uuid primary key,
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  invocation_id uuid not null,
  automation_request_id uuid references public.lexia_automation_requests(id) on delete restrict,
  sequence integer not null check (sequence >= 1),
  kind text not null
    check (kind in ('reply', 'followup', 'appointment_reminder', 'appointment_confirmation')),
  source_ref text check (char_length(source_ref) <= 256),
  captured_state_version bigint not null,
  captured_delivery_epoch bigint not null,
  lead_cutoff_seq bigint check (lead_cutoff_seq >= 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status text not null default 'prepared' check (status in (
    'prepared', 'claimed', 'sent', 'failed', 'delivery_unknown', 'suppressed'
  )),
  reason text check (char_length(reason) <= 64),
  attempts integer not null default 0 check (attempts >= 0),
  claim_fencing bigint,
  claimed_by text check (char_length(claimed_by) between 1 and 128),
  provider_message_id text check (char_length(provider_message_id) <= 256),
  mensagem_id uuid references public.lexia_mensagens(id) on delete set null,
  preparado_em timestamptz not null default now(),
  reivindicado_em timestamptz,
  concluido_em timestamptz,
  constraint lexia_outbound_actions_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug),
  constraint lexia_outbound_actions_sequence_key unique (conversation_id, invocation_id, sequence),
  constraint lexia_outbound_actions_source_check check (
    kind not in ('appointment_reminder', 'appointment_confirmation') or source_ref is not null
  ),
  constraint lexia_outbound_actions_sent_check
    check (status <> 'sent' or provider_message_id is not null),
  constraint lexia_outbound_actions_claim_check check (
    (status in ('claimed', 'sent', 'failed', 'delivery_unknown'))
      = (claim_fencing is not null and claimed_by is not null)
    or status = 'suppressed'
  )
);

-- One confirmation per appointment while it is claimed, sent or uncertain.
create unique index lexia_outbound_actions_one_confirmation_key
  on public.lexia_outbound_actions (conversation_id, source_ref)
  where kind = 'appointment_confirmation'
    and status in ('claimed', 'sent', 'delivery_unknown');

create table public.lexia_conversation_contexts (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  context_version bigint not null check (context_version >= 1),
  config_version text not null,
  context_call_id uuid not null,
  source_message_ids uuid[] not null check (cardinality(source_message_ids) > 0),
  operational_context jsonb not null check (jsonb_typeof(operational_context) = 'object'),
  company_fields jsonb not null check (jsonb_typeof(company_fields) = 'object'),
  criado_em timestamptz not null default now(),
  constraint lexia_conversation_contexts_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug),
  constraint lexia_conversation_contexts_version_key unique (conversation_id, context_version),
  constraint lexia_conversation_contexts_call_key unique (conversation_id, context_call_id)
);

create table public.lexia_omnichannel_projection_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null,
  environment text not null,
  cliente_slug text not null,
  state_version bigint not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  criado_em timestamptz not null default now(),
  processado_em timestamptz,
  constraint lexia_omnichannel_projection_outbox_conversation_fkey
    foreign key (conversation_id, environment, cliente_slug)
    references public.lexia_conversation_states (id, environment, cliente_slug)
);

create index lexia_omnichannel_projection_outbox_pending_idx
  on public.lexia_omnichannel_projection_outbox (criado_em)
  where status <> 'done';

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create or replace function public.lexia_omni_guard_policy_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'omnichannel policies are append-only' using errcode = '42501';
  end if;
  if old.status = 'active'
    and new.status = 'superseded'
    and new.substituido_em is not null
    and (to_jsonb(new) - 'status' - 'substituido_em')
      = (to_jsonb(old) - 'status' - 'substituido_em') then
    return new;
  end if;
  raise exception 'omnichannel policy versions are immutable' using errcode = '42501';
end;
$$;

create trigger lexia_omnichannel_policies_guard
before update or delete on public.lexia_omnichannel_policies
for each row execute function public.lexia_omni_guard_policy_update();

create or replace function public.lexia_omni_guard_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger lexia_conversation_state_events_append_only
before update or delete on public.lexia_conversation_state_events
for each row execute function public.lexia_omni_guard_append_only();

create or replace function public.lexia_omni_guard_outbound_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if (old.status = 'prepared' and new.status in ('claimed', 'suppressed'))
    or (old.status = 'claimed' and new.status in ('sent', 'failed', 'delivery_unknown'))
    or (old.status = 'failed' and new.status = 'prepared')
    or (old.status = 'delivery_unknown' and new.status in ('sent', 'failed')) then
    return new;
  end if;
  raise exception 'invalid outbound status transition % -> %', old.status, new.status
    using errcode = '23514';
end;
$$;

create trigger lexia_outbound_actions_status_guard
before update on public.lexia_outbound_actions
for each row execute function public.lexia_omni_guard_outbound_status();

-- Company users may still update legacy columns of handoffs and messages
-- through existing flows; the v2 columns are writable only by the RPCs.
create or replace function public.lexia_omni_guard_legacy_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Nested IFs keep each table's field references in separate expressions,
  -- which PL/pgSQL plans only when the branch runs.
  if tg_table_name = 'lexia_mensagens' then
    if tg_op = 'INSERT' then
      if new.omni_conversation_id is not null or new.omni_author is not null
        or new.provider_message_id is not null or new.provider_timestamp is not null
        or new.omni_action_id is not null or new.lead_seq is not null
        or new.media_kind is not null or new.media_processing_status is not null
        or new.media_error_code is not null then
        raise exception 'v2 message columns are server-only' using errcode = '42501';
      end if;
    elsif new.omni_conversation_id is distinct from old.omni_conversation_id
      or new.omni_author is distinct from old.omni_author
      or new.provider_message_id is distinct from old.provider_message_id
      or new.provider_timestamp is distinct from old.provider_timestamp
      or new.omni_action_id is distinct from old.omni_action_id
      or new.lead_seq is distinct from old.lead_seq
      or new.media_kind is distinct from old.media_kind
      or new.media_processing_status is distinct from old.media_processing_status
      or new.media_error_code is distinct from old.media_error_code then
      raise exception 'v2 message columns are server-only' using errcode = '42501';
    end if;
  elsif tg_table_name = 'lexia_handoffs' then
    if tg_op = 'INSERT' then
      if new.omni_conversation_id is not null or new.block_key is not null
        or new.idempotency_key is not null or new.omni_resolution is not null
        or new.omni_resolved_at is not null or new.omni_resolved_by is not null
        or new.retomado_em is not null
        or new.retomado_por is not null then
        raise exception 'v2 handoff columns are server-only' using errcode = '42501';
      end if;
    elsif new.omni_conversation_id is distinct from old.omni_conversation_id
      or new.block_key is distinct from old.block_key
      or new.idempotency_key is distinct from old.idempotency_key
      or new.omni_resolution is distinct from old.omni_resolution
      or new.omni_resolved_at is distinct from old.omni_resolved_at
      or new.omni_resolved_by is distinct from old.omni_resolved_by
      or new.retomado_em is distinct from old.retomado_em
      or new.retomado_por is distinct from old.retomado_por then
      raise exception 'v2 handoff columns are server-only' using errcode = '42501';
    end if;
  elsif tg_table_name = 'lexia_contactos' then
    if tg_op = 'INSERT' then
      if new.omni_account_id is not null or new.provider_contact_ref is not null then
        raise exception 'v2 contact columns are server-only' using errcode = '42501';
      end if;
    elsif new.omni_account_id is distinct from old.omni_account_id
      or new.provider_contact_ref is distinct from old.provider_contact_ref then
      raise exception 'v2 contact columns are server-only' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger lexia_mensagens_omni_columns_guard
before insert or update on public.lexia_mensagens
for each row execute function public.lexia_omni_guard_legacy_columns();

create trigger lexia_handoffs_omni_columns_guard
before insert or update on public.lexia_handoffs
for each row execute function public.lexia_omni_guard_legacy_columns();

create trigger lexia_contactos_omni_columns_guard
before insert or update on public.lexia_contactos
for each row execute function public.lexia_omni_guard_legacy_columns();

-- ---------------------------------------------------------------------------
-- Internal helpers (callable only from the RPCs below)
-- ---------------------------------------------------------------------------

-- Rejects a call before any write when a condition is false or NULL.
create or replace function public.lexia_omni_require(p_condition boolean, p_code text)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_condition is not true then
    raise exception '%', p_code using errcode = '22023';
  end if;
end;
$$;

create or replace function public.lexia_omni_lock_conversation(p_conversation_id uuid)
returns public.lexia_conversation_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
begin
  -- The row lock is the per-conversation lease: interventions, state
  -- commands, batch claims and delivery claims are serialized here.
  select * into conversation_row
  from public.lexia_conversation_states
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'omni_conversation_not_found' using errcode = 'P0002';
  end if;
  return conversation_row;
end;
$$;

create or replace function public.lexia_omni_command_seen(
  p_conversation_id uuid,
  p_command_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lexia_conversation_state_events e
    where e.conversation_id = p_conversation_id
      and e.command_id = p_command_id
  );
$$;

create or replace function public.lexia_omni_active_policy(
  p_environment text,
  p_cliente_slug text
)
returns public.lexia_omnichannel_policies
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  policy_row public.lexia_omnichannel_policies%rowtype;
begin
  select * into policy_row
  from public.lexia_omnichannel_policies p
  where p.environment = p_environment
    and p.cliente_slug = p_cliente_slug
    and p.status = 'active';

  if not found then
    raise exception 'omnichannel_policy_unavailable' using errcode = 'P0002';
  end if;
  return policy_row;
end;
$$;

create or replace function public.lexia_omni_commit_transition(
  p_conversation_id uuid,
  p_command_id text,
  p_command_type text,
  p_payload jsonb,
  p_occurred_at timestamptz,
  p_actor uuid,
  p_bump boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
begin
  if p_bump then
    update public.lexia_conversation_states
    set
      state_version = state_version + 1,
      delivery_epoch = delivery_epoch + 1,
      projection_status = 'stale',
      atualizado_em = clock_timestamp()
    where id = p_conversation_id
    returning * into conversation_row;
  else
    select * into conversation_row
    from public.lexia_conversation_states
    where id = p_conversation_id;
  end if;

  insert into public.lexia_conversation_state_events (
    conversation_id, environment, cliente_slug, command_id, command_type,
    actor_user_id, payload, state_version_after, occurred_at
  ) values (
    p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
    p_command_id, p_command_type, p_actor, coalesce(p_payload, '{}'::jsonb),
    conversation_row.state_version, p_occurred_at
  );

  if p_bump then
    insert into public.lexia_omnichannel_projection_outbox (
      conversation_id, environment, cliente_slug, state_version
    ) values (
      p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
      conversation_row.state_version
    );
  end if;

  return conversation_row.state_version;
end;
$$;

create or replace function public.lexia_omni_suppress_plan(
  p_action_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_row public.lexia_outbound_actions%rowtype;
begin
  update public.lexia_outbound_actions
  set status = 'suppressed', reason = p_reason, concluido_em = clock_timestamp()
  where id = p_action_id
  returning * into action_row;

  -- Later actions of the same plan never start after a suppression. A newer
  -- lead message marks the whole remainder as superseded for reprocessing.
  update public.lexia_outbound_actions
  set
    status = 'suppressed',
    reason = case
      when p_reason = 'superseded_by_new_message' then p_reason
      else 'plan_interrupted'
    end,
    concluido_em = clock_timestamp()
  where conversation_id = action_row.conversation_id
    and invocation_id = action_row.invocation_id
    and sequence > action_row.sequence
    and status = 'prepared';
end;
$$;

-- ---------------------------------------------------------------------------
-- Policy RPCs: only an active Lexia admin JWT (checked here, not only in UI)
-- ---------------------------------------------------------------------------

create or replace function public.lexia_omni_create_policy(
  p_environment text,
  p_cliente_slug text,
  p_resume_mode text,
  p_human_intervention_ms integer,
  p_buffer_window_ms integer,
  p_pause_after_appointment boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.lexia_is_admin() then
    raise exception 'lexia_admin_required' using errcode = '42501';
  end if;
  if p_pause_after_appointment is null then
    raise exception 'explicit_post_appointment_choice_required' using errcode = '22004';
  end if;

  insert into public.lexia_omnichannel_policies (
    environment, cliente_slug, policy_version, status, resume_mode,
    human_intervention_ms, buffer_window_ms, pause_after_appointment, criado_por
  ) values (
    p_environment, p_cliente_slug, 1, 'active', p_resume_mode,
    p_human_intervention_ms, p_buffer_window_ms, p_pause_after_appointment, auth.uid()
  );
  return 1;
end;
$$;

create or replace function public.lexia_omni_set_appointment_pause(
  p_environment text,
  p_cliente_slug text,
  p_pause_after_appointment boolean,
  p_expected_policy_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.lexia_omnichannel_policies%rowtype;
begin
  if not public.lexia_is_admin() then
    raise exception 'lexia_admin_required' using errcode = '42501';
  end if;
  if p_pause_after_appointment is null then
    raise exception 'explicit_post_appointment_choice_required' using errcode = '22004';
  end if;
  perform public.lexia_omni_require(p_expected_policy_version is not null, 'expected_policy_version_required');

  select * into current_row
  from public.lexia_omnichannel_policies p
  where p.environment = p_environment
    and p.cliente_slug = p_cliente_slug
    and p.status = 'active'
  for update;

  if not found then
    raise exception 'omnichannel_policy_unavailable' using errcode = 'P0002';
  end if;
  if current_row.policy_version is distinct from p_expected_policy_version then
    raise exception 'policy_version_conflict' using errcode = '40001';
  end if;
  if current_row.pause_after_appointment = p_pause_after_appointment then
    return current_row.policy_version;
  end if;

  update public.lexia_omnichannel_policies
  set status = 'superseded', substituido_em = clock_timestamp()
  where id = current_row.id;

  insert into public.lexia_omnichannel_policies (
    environment, cliente_slug, policy_version, status, resume_mode,
    human_intervention_ms, buffer_window_ms, pause_after_appointment, criado_por
  ) values (
    current_row.environment, current_row.cliente_slug, current_row.policy_version + 1,
    'active', current_row.resume_mode, current_row.human_intervention_ms,
    current_row.buffer_window_ms, p_pause_after_appointment, auth.uid()
  );

  -- Appointments already confirmed keep the policy captured at confirmation.
  return current_row.policy_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ingress and messages
-- ---------------------------------------------------------------------------

create or replace function public.lexia_omni_resolve_conversation(
  p_account_id uuid,
  p_conversation_ref text,
  p_identificador_conversa text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.lexia_channel_accounts%rowtype;
  resolved_id uuid;
begin
  select * into account_row
  from public.lexia_channel_accounts
  where id = p_account_id;

  -- Scope comes from the trusted account binding, never from the payload.
  if not found or account_row.status <> 'active' then
    raise exception 'omni_account_unavailable' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.lexia_clientes c
    where c.slug = account_row.cliente_slug and c.status = 'ativo'
  ) then
    raise exception 'cliente_inativo' using errcode = '42501';
  end if;

  insert into public.lexia_conversation_states (
    environment, cliente_slug, channel, account_id, conversation_ref, identificador_conversa
  ) values (
    account_row.environment, account_row.cliente_slug, account_row.channel,
    account_row.id, p_conversation_ref, p_identificador_conversa
  )
  on conflict (environment, cliente_slug, channel, account_id, conversation_ref) do nothing
  returning id into resolved_id;

  if resolved_id is null then
    select s.id into resolved_id
    from public.lexia_conversation_states s
    where s.environment = account_row.environment
      and s.cliente_slug = account_row.cliente_slug
      and s.channel = account_row.channel
      and s.account_id = account_row.id
      and s.conversation_ref = p_conversation_ref;
  end if;
  return resolved_id;
end;
$$;

create or replace function public.lexia_omni_register_ingress(
  p_account_id uuid,
  p_provider_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_conversation_id uuid
)
returns table (out_ingress_id uuid, out_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.lexia_channel_accounts%rowtype;
  new_id uuid;
begin
  select * into account_row from public.lexia_channel_accounts where id = p_account_id;
  if not found or account_row.status <> 'active' then
    raise exception 'omni_account_unavailable' using errcode = 'P0002';
  end if;
  if p_conversation_id is not null and not exists (
    select 1 from public.lexia_conversation_states s
    where s.id = p_conversation_id and s.account_id = p_account_id
  ) then
    raise exception 'omni_scope_mismatch' using errcode = '42501';
  end if;

  insert into public.lexia_ingress_events (
    environment, cliente_slug, channel, account_id, provider_event_id,
    event_type, conversation_id, occurred_at
  ) values (
    account_row.environment, account_row.cliente_slug, account_row.channel,
    p_account_id, p_provider_event_id, p_event_type, p_conversation_id, p_occurred_at
  )
  on conflict (account_id, provider_event_id) do nothing
  returning id into new_id;

  if new_id is not null then
    return query select new_id, false;
  else
    return query
      select e.id, true
      from public.lexia_ingress_events e
      where e.account_id = p_account_id and e.provider_event_id = p_provider_event_id;
  end if;
end;
$$;

-- Every valid message is persisted, including during pauses, before any
-- buffer, media processing, context, brain or delivery work.
create or replace function public.lexia_omni_record_message(
  p_conversation_id uuid,
  p_author text,
  p_provider_message_id text,
  p_provider_timestamp timestamptz,
  p_tipo text,
  p_conteudo text,
  p_media_kind text,
  p_media_processing_status text,
  p_action_id uuid
)
returns table (out_mensagem_id uuid, out_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  new_id uuid;
begin
  perform public.lexia_omni_require(
    p_author in ('lead', 'human_agent', 'ai', 'system'), 'omni_author_not_allowed'
  );
  select * into conversation_row
  from public.lexia_conversation_states where id = p_conversation_id;
  if not found then
    raise exception 'omni_conversation_not_found' using errcode = 'P0002';
  end if;

  -- An AI message must belong to an action of this same conversation that was
  -- claimed for delivery; other authors never carry an action.
  if p_author = 'ai' then
    perform public.lexia_omni_require(
      exists (
        select 1 from public.lexia_outbound_actions o
        where o.id = p_action_id
          and o.conversation_id = p_conversation_id
          and o.status in ('claimed', 'sent', 'delivery_unknown')
      ),
      'omni_action_scope_mismatch'
    );
  else
    perform public.lexia_omni_require(p_action_id is null, 'omni_action_not_allowed');
  end if;

  insert into public.lexia_mensagens (
    cliente_slug, contacto_id, identificador_conversa, direccao, tipo, conteudo,
    origem, criado_em, omni_conversation_id, omni_author, provider_message_id,
    provider_timestamp, omni_action_id, media_kind, media_processing_status
  ) values (
    conversation_row.cliente_slug, conversation_row.contacto_id,
    conversation_row.identificador_conversa,
    case when p_author = 'lead' then 'recebida' else 'enviada' end,
    coalesce(p_tipo, 'texto'), p_conteudo,
    case when p_author = 'human_agent' then 'humano' else 'workflow' end,
    coalesce(p_provider_timestamp, clock_timestamp()), p_conversation_id, p_author,
    p_provider_message_id, p_provider_timestamp, p_action_id, p_media_kind,
    p_media_processing_status
  )
  on conflict (omni_conversation_id, provider_message_id)
    where omni_conversation_id is not null and provider_message_id is not null
  do nothing
  returning id into new_id;

  if new_id is not null then
    return query select new_id, false;
  else
    return query
      select m.id, true
      from public.lexia_mensagens m
      where m.omni_conversation_id = p_conversation_id
        and m.provider_message_id = p_provider_message_id;
  end if;
end;
$$;

create or replace function public.lexia_omni_update_media_status(
  p_mensagem_id uuid,
  p_media_processing_status text,
  p_media_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Media failures never remove the original message, authorship or blocks.
  update public.lexia_mensagens
  set media_processing_status = p_media_processing_status,
      media_error_code = left(p_media_error_code, 64)
  where id = p_mensagem_id and omni_conversation_id is not null;
  if not found then
    raise exception 'omni_message_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- State commands
-- ---------------------------------------------------------------------------

create or replace function public.lexia_omni_has_active_block(
  p_conversation_id uuid,
  p_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lexia_conversation_blocks b
    where b.conversation_id = p_conversation_id
      and b.status = 'active'
      and (b.expires_at is null or b.expires_at > p_at)
  );
$$;

-- A lead message advances only lead_message_seq; it does not change
-- state_version/delivery_epoch, so reminders stay valid while an unsent
-- reply is superseded by its lead cutoff.
create or replace function public.lexia_omni_record_lead_message(
  p_conversation_id uuid,
  p_command_id text,
  p_mensagem_id uuid,
  p_occurred_at timestamptz
)
returns table (out_lead_seq bigint, out_disposition text, out_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  next_seq bigint;
  entry_disposition text;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);

  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return query
      select e.lead_seq, e.disposition, true
      from public.lexia_inbound_buffer_entries e
      where e.conversation_id = p_conversation_id and e.mensagem_id = p_mensagem_id;
    return;
  end if;

  perform public.lexia_omni_require(
    exists (
      select 1 from public.lexia_mensagens m
      where m.id = p_mensagem_id
        and m.omni_conversation_id = p_conversation_id
        and m.omni_author = 'lead'
    ),
    'omni_message_mismatch'
  );

  -- D1: only the lead counter advances; state_version/delivery_epoch do not,
  -- so reminders stay valid. Unsent replies are protected by their cutoff.
  next_seq := conversation_row.lead_message_seq + 1;
  entry_disposition := case
    when public.lexia_omni_has_active_block(p_conversation_id, clock_timestamp()) then 'pending'
    else 'buffered'
  end;

  update public.lexia_conversation_states
  set lead_message_seq = next_seq, atualizado_em = clock_timestamp()
  where id = p_conversation_id;

  update public.lexia_mensagens
  set lead_seq = next_seq,
      origem = case when entry_disposition = 'pending' then 'recebida_na_pausa' else origem end
  where id = p_mensagem_id;

  insert into public.lexia_inbound_buffer_entries (
    conversation_id, environment, cliente_slug, mensagem_id, lead_seq, disposition,
    enfileirado_em
  ) values (
    p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
    p_mensagem_id, next_seq, entry_disposition, clock_timestamp()
  );

  perform public.lexia_omni_commit_transition(
    p_conversation_id, p_command_id, 'lead_message.record',
    jsonb_build_object('mensagem_id', p_mensagem_id, 'lead_seq', next_seq),
    p_occurred_at, null, false
  );

  return query select next_seq, entry_disposition, false;
end;
$$;

create or replace function public.lexia_omni_record_human_intervention(
  p_conversation_id uuid,
  p_command_id text,
  p_mensagem_id uuid,
  p_occurred_at timestamptz
)
returns table (out_state_version bigint, out_expires_at timestamptz, out_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  policy_row public.lexia_omnichannel_policies%rowtype;
  candidate timestamptz;
  existing public.lexia_conversation_blocks%rowtype;
  new_version bigint;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);

  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return query
      select conversation_row.state_version, b.expires_at, true
      from public.lexia_conversation_blocks b
      where b.conversation_id = p_conversation_id and b.block_key = 'human_intervention';
    return;
  end if;

  if not exists (
    select 1 from public.lexia_mensagens m
    where m.id = p_mensagem_id
      and m.omni_conversation_id = p_conversation_id
      and m.omni_author = 'human_agent'
  ) then
    raise exception 'omni_message_mismatch' using errcode = '22023';
  end if;

  policy_row := public.lexia_omni_active_policy(
    conversation_row.environment, conversation_row.cliente_slug
  );
  candidate := p_occurred_at + policy_row.human_intervention_ms * interval '1 millisecond';

  select * into existing
  from public.lexia_conversation_blocks
  where conversation_id = p_conversation_id and block_key = 'human_intervention'
  for update;

  if not found then
    insert into public.lexia_conversation_blocks (
      conversation_id, environment, cliente_slug, block_key, block_type, status,
      source_ref, expires_at, criado_em, atualizado_em
    ) values (
      p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
      'human_intervention', 'human_intervention', 'active',
      p_mensagem_id::text, candidate, p_occurred_at, p_occurred_at
    );
  else
    -- A delayed human event never shortens a later deadline.
    update public.lexia_conversation_blocks
    set
      status = 'active',
      expires_at = greatest(existing.expires_at, candidate),
      source_ref = case
        when candidate >= existing.expires_at then p_mensagem_id::text
        else existing.source_ref
      end,
      criado_em = least(existing.criado_em, p_occurred_at),
      atualizado_em = greatest(existing.atualizado_em, p_occurred_at),
      encerrado_por = null
    where id = existing.id;
  end if;

  new_version := public.lexia_omni_commit_transition(
    p_conversation_id, p_command_id, 'human_intervention.record',
    jsonb_build_object('mensagem_id', p_mensagem_id), p_occurred_at, null, true
  );

  return query
    select new_version, b.expires_at, false
    from public.lexia_conversation_blocks b
    where b.conversation_id = p_conversation_id and b.block_key = 'human_intervention';
end;
$$;

create or replace function public.lexia_omni_start_manual_pause(
  p_conversation_id uuid,
  p_command_id text,
  p_pause_ref text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_actor uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  perform public.lexia_omni_require(p_pause_ref is not null, 'pause_ref_required');
  if p_expires_at is not null and p_expires_at <= p_occurred_at then
    raise exception 'manual_pause_expiry_before_start' using errcode = '22023';
  end if;
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);
  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return conversation_row.state_version;
  end if;

  insert into public.lexia_conversation_blocks (
    conversation_id, environment, cliente_slug, block_key, block_type, status,
    source_ref, expires_at, criado_em, atualizado_em
  ) values (
    p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
    'manual:' || p_pause_ref, 'manual_pause', 'active', p_pause_ref, p_expires_at,
    p_occurred_at, p_occurred_at
  )
  on conflict (conversation_id, block_key) do update
    set status = 'active', expires_at = excluded.expires_at,
        atualizado_em = excluded.atualizado_em, encerrado_por = null;

  return public.lexia_omni_commit_transition(
    p_conversation_id, p_command_id, 'manual_pause.start',
    jsonb_build_object('pause_ref', p_pause_ref, 'expires_at', p_expires_at),
    p_occurred_at, p_actor, true
  );
end;
$$;

-- Ends exactly one block. Handoffs end only through lexia_omni_resume_handoff
-- and a human intervention only with an audited exceptional reason.
create or replace function public.lexia_omni_end_block(
  p_conversation_id uuid,
  p_command_id text,
  p_block_key text,
  p_occurred_at timestamptz,
  p_actor uuid,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  perform public.lexia_omni_require(p_block_key is not null, 'block_key_required');
  if p_block_key like 'handoff:%' then
    raise exception 'handoff_requires_resume_command' using errcode = '42501';
  end if;
  if p_block_key = 'human_intervention' and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'exceptional_reason_required' using errcode = '22023';
  end if;

  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);
  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return conversation_row.state_version;
  end if;

  update public.lexia_conversation_blocks
  set status = 'ended', atualizado_em = p_occurred_at, encerrado_por = p_actor
  where conversation_id = p_conversation_id
    and block_key = p_block_key
    and status = 'active'
    and (expires_at is null or expires_at > p_occurred_at);

  if not found then
    raise exception 'active_block_not_found' using errcode = 'P0002';
  end if;

  return public.lexia_omni_commit_transition(
    p_conversation_id, p_command_id, 'block.end',
    jsonb_build_object('block_key', p_block_key, 'reason', left(p_reason, 200)),
    p_occurred_at, p_actor, true
  );
end;
$$;

create or replace function public.lexia_omni_expire_blocks(
  p_conversation_id uuid,
  p_command_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
  decision_at timestamptz;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_lock_conversation(p_conversation_id);
  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return 0;
  end if;
  -- D3: database time read after the lock, not the transaction start.
  decision_at := clock_timestamp();

  -- Expiry ends only the reasons that are due; every other block survives.
  update public.lexia_conversation_blocks
  set status = 'expired', atualizado_em = decision_at
  where conversation_id = p_conversation_id
    and status = 'active'
    and expires_at is not null
    and expires_at <= decision_at;
  get diagnostics expired_count = row_count;

  if expired_count > 0 then
    perform public.lexia_omni_commit_transition(
      p_conversation_id, p_command_id, 'blocks.expire',
      jsonb_build_object('expired', expired_count), decision_at, null, true
    );
  end if;
  return expired_count;
end;
$$;

-- answer_pending: moves pending lead messages into the buffer exactly once
-- after the last block ends. await_new_message never calls this.
create or replace function public.lexia_omni_release_pending(
  p_conversation_id uuid,
  p_command_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  policy_row public.lexia_omnichannel_policies%rowtype;
  released integer;
  decision_at timestamptz;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);
  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return 0;
  end if;
  decision_at := clock_timestamp();
  policy_row := public.lexia_omni_active_policy(
    conversation_row.environment, conversation_row.cliente_slug
  );
  if policy_row.resume_mode <> 'answer_pending'
    or public.lexia_omni_has_active_block(p_conversation_id, decision_at) then
    return 0;
  end if;

  update public.lexia_inbound_buffer_entries
  set disposition = 'buffered',
      enfileirado_em = decision_at - policy_row.buffer_window_ms * interval '1 millisecond'
  where conversation_id = p_conversation_id and disposition = 'pending';
  get diagnostics released = row_count;

  if released > 0 then
    perform public.lexia_omni_commit_transition(
      p_conversation_id, p_command_id, 'pending.release',
      jsonb_build_object('released', released), decision_at, null, false
    );
  end if;
  return released;
end;
$$;

create or replace function public.lexia_omni_request_handoff(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_handoff_ref text,
  p_motivo text,
  p_resumo text,
  p_prioridade text,
  p_occurred_at timestamptz
)
returns table (out_handoff_id uuid, out_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  existing_id uuid;
  new_id uuid;
  mapped_priority text;
begin
  perform public.lexia_omni_require(p_idempotency_key is not null, 'idempotency_key_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);

  select h.id into existing_id
  from public.lexia_handoffs h
  where h.omni_conversation_id = p_conversation_id
    and h.idempotency_key = p_idempotency_key;
  if found then
    return query select existing_id, true;
    return;
  end if;

  mapped_priority := case p_prioridade
    when 'low' then 'baixa'
    when 'normal' then 'normal'
    when 'high' then 'alta'
  end;
  if mapped_priority is null then
    raise exception 'invalid_handoff_priority' using errcode = '22023';
  end if;

  insert into public.lexia_handoffs (
    cliente_slug, nome_contacto, telefone, motivo, prioridade, resumo, status,
    origem, omni_conversation_id, block_key, idempotency_key
  )
  select
    conversation_row.cliente_slug, c.nome, c.telefone, left(p_motivo, 500),
    mapped_priority, left(p_resumo, 4000), 'pendente', 'omnichannel_v2',
    p_conversation_id, 'handoff:' || p_handoff_ref, p_idempotency_key
  from (select 1) as anchor
  left join public.lexia_contactos c on c.id = conversation_row.contacto_id
  returning id into new_id;

  insert into public.lexia_conversation_blocks (
    conversation_id, environment, cliente_slug, block_key, block_type, status,
    source_ref, expires_at, criado_em, atualizado_em
  ) values (
    p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
    'handoff:' || p_handoff_ref, 'handoff', 'active', p_handoff_ref, null,
    p_occurred_at, p_occurred_at
  );

  perform public.lexia_omni_commit_transition(
    p_conversation_id, 'handoff.request:' || p_idempotency_key, 'handoff.request',
    jsonb_build_object('handoff_id', new_id, 'handoff_ref', p_handoff_ref),
    p_occurred_at, null, true
  );

  return query select new_id, false;
end;
$$;

-- Resolving a handoff changes only the durable ticket. Its independent block
-- remains active until lexia_omni_resume_handoff is called explicitly.
create or replace function public.lexia_omni_resolve_handoff(
  p_conversation_id uuid,
  p_command_id text,
  p_handoff_id uuid,
  p_resolution text,
  p_notes text,
  p_occurred_at timestamptz,
  p_actor uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  handoff_row public.lexia_handoffs%rowtype;
  mapped_status text;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  perform public.lexia_omni_require(p_resolution in ('resolved', 'lost'), 'invalid_handoff_resolution');
  mapped_status := case p_resolution when 'resolved' then 'resolvido' else 'perdido' end;
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);
  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return conversation_row.state_version;
  end if;

  select * into handoff_row
  from public.lexia_handoffs
  where id = p_handoff_id and omni_conversation_id = p_conversation_id
  for update;
  if not found then
    raise exception 'handoff_not_found' using errcode = 'P0002';
  end if;
  if handoff_row.retomado_em is not null then
    raise exception 'handoff_already_resumed' using errcode = '23514';
  end if;
  if handoff_row.status in ('resolvido', 'perdido')
    and handoff_row.status is distinct from mapped_status then
    raise exception 'handoff_resolution_conflict' using errcode = '23514';
  end if;

  update public.lexia_handoffs
  set status = mapped_status,
      omni_resolution = p_resolution,
      omni_resolved_at = coalesce(omni_resolved_at, p_occurred_at),
      omni_resolved_by = coalesce(omni_resolved_by, p_actor),
      resumo = case
        when nullif(trim(coalesce(p_notes, '')), '') is null then resumo
        else left(concat_ws(E'\n', nullif(resumo, ''), 'Resolucao: ' || trim(p_notes)), 4000)
      end,
      atualizado_em = clock_timestamp()
  where id = p_handoff_id;

  return public.lexia_omni_commit_transition(
    p_conversation_id, p_command_id, 'handoff.resolve',
    jsonb_build_object('handoff_id', p_handoff_id, 'resolution', p_resolution),
    p_occurred_at, p_actor, false
  );
end;
$$;

-- Resolving a handoff (status resolvido/perdido) never resumes the AI. This
-- separate command is accepted only for a closed handoff and ends only its
-- own block.
create or replace function public.lexia_omni_resume_handoff(
  p_conversation_id uuid,
  p_command_id text,
  p_handoff_id uuid,
  p_occurred_at timestamptz,
  p_actor uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  handoff_row public.lexia_handoffs%rowtype;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);
  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return conversation_row.state_version;
  end if;

  select * into handoff_row
  from public.lexia_handoffs
  where id = p_handoff_id and omni_conversation_id = p_conversation_id
  for update;
  if not found then
    raise exception 'handoff_not_found' using errcode = 'P0002';
  end if;
  if handoff_row.retomado_em is not null then
    return conversation_row.state_version;
  end if;
  if handoff_row.status not in ('resolvido', 'perdido') then
    raise exception 'handoff_must_be_closed_before_resume' using errcode = '42501';
  end if;

  update public.lexia_handoffs
  set retomado_em = p_occurred_at, retomado_por = p_actor
  where id = p_handoff_id;

  update public.lexia_conversation_blocks
  set status = 'ended', atualizado_em = p_occurred_at, encerrado_por = p_actor
  where conversation_id = p_conversation_id
    and block_key = handoff_row.block_key
    and status = 'active';

  return public.lexia_omni_commit_transition(
    p_conversation_id, p_command_id, 'handoff.resume',
    jsonb_build_object('handoff_id', p_handoff_id), p_occurred_at, p_actor, true
  );
end;
$$;

-- The pause decision comes from the active company policy, read here, never
-- from the caller. The same rule applies to every channel and only to the
-- conversation where the appointment was confirmed.
create or replace function public.lexia_omni_confirm_appointment(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_appointment_ref text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_tool_invocation_id text,
  p_occurred_at timestamptz
)
returns table (
  out_paused boolean,
  out_state_version bigint,
  out_delivery_epoch bigint,
  out_duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  policy_row public.lexia_omnichannel_policies%rowtype;
  existing public.lexia_appointment_events%rowtype;
begin
  perform public.lexia_omni_require(p_idempotency_key is not null, 'idempotency_key_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  perform public.lexia_omni_require(p_ends_at > p_starts_at, 'appointment_interval_invalid');
  perform public.lexia_omni_require(p_timezone is not null, 'timezone_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);

  select * into existing
  from public.lexia_appointment_events
  where conversation_id = p_conversation_id and appointment_ref = p_appointment_ref;
  if found then
    if existing.starts_at <> p_starts_at
      or existing.ends_at <> p_ends_at
      or existing.timezone <> p_timezone then
      raise exception 'appointment_reference_conflict' using errcode = '23505';
    end if;
    return query select existing.paused_until_end, conversation_row.state_version,
      conversation_row.delivery_epoch, true;
    return;
  end if;

  policy_row := public.lexia_omni_active_policy(
    conversation_row.environment, conversation_row.cliente_slug
  );

  insert into public.lexia_appointment_events (
    conversation_id, environment, cliente_slug, appointment_ref, status, starts_at,
    ends_at, timezone, tool_invocation_id, confirmed_idempotency_key,
    paused_until_end, policy_version
  ) values (
    p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
    p_appointment_ref, 'confirmed', p_starts_at, p_ends_at, p_timezone,
    p_tool_invocation_id, p_idempotency_key, policy_row.pause_after_appointment,
    policy_row.policy_version
  );

  if policy_row.pause_after_appointment then
    insert into public.lexia_conversation_blocks (
      conversation_id, environment, cliente_slug, block_key, block_type, status,
      source_ref, expires_at, criado_em, atualizado_em
    ) values (
      p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
      'appointment:' || p_appointment_ref, 'appointment', 'active', p_appointment_ref,
      p_ends_at, p_occurred_at, p_occurred_at
    );
  end if;

  perform public.lexia_omni_commit_transition(
    p_conversation_id, 'appointment.confirm:' || p_idempotency_key, 'appointment.confirm',
    jsonb_build_object(
      'appointment_ref', p_appointment_ref,
      'paused', policy_row.pause_after_appointment,
      'policy_version', policy_row.policy_version
    ),
    p_occurred_at, null, true
  );

  select * into conversation_row
  from public.lexia_conversation_states where id = p_conversation_id;
  return query select policy_row.pause_after_appointment, conversation_row.state_version,
    conversation_row.delivery_epoch, false;
end;
$$;

-- Cancellation denies reminders but keeps the original block expiry and
-- never recreates a block that was removed or already expired.
create or replace function public.lexia_omni_cancel_appointment(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_appointment_ref text,
  p_tool_invocation_id text,
  p_occurred_at timestamptz
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
begin
  perform public.lexia_omni_require(p_idempotency_key is not null, 'idempotency_key_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);

  select * into appointment_row
  from public.lexia_appointment_events
  where conversation_id = p_conversation_id and appointment_ref = p_appointment_ref
  for update;
  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  if appointment_row.status = 'cancelled' then
    return query select conversation_row.state_version, true;
    return;
  end if;

  update public.lexia_appointment_events
  set status = 'cancelled', cancelled_idempotency_key = p_idempotency_key,
      tool_invocation_id = p_tool_invocation_id,
      attendance_status = 'cancelled',
      attendance_recorded_at = coalesce(attendance_recorded_at, p_occurred_at),
      atualizado_em = clock_timestamp()
  where id = appointment_row.id;

  update public.lexia_conversation_blocks
  set atualizado_em = p_occurred_at
  where conversation_id = p_conversation_id
    and block_key = 'appointment:' || p_appointment_ref
    and status = 'active';

  new_version := public.lexia_omni_commit_transition(
    p_conversation_id, 'appointment.cancel:' || p_idempotency_key, 'appointment.cancel',
    jsonb_build_object('appointment_ref', p_appointment_ref), p_occurred_at, null, true
  );
  return query select new_version, false;
end;
$$;

-- A CRM user can cancel the durable appointment without impersonating the
-- private brain tool. This keeps the original tool provenance, suppresses
-- reminders and preserves the appointment block until its original expiry or
-- an explicit block command.
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

-- Attendance is an operational CRM fact. It never creates, closes or revives
-- an appointment block and cannot turn a cancelled appointment into a visit.
create or replace function public.lexia_omni_update_appointment_attendance(
  p_conversation_id uuid,
  p_command_id text,
  p_appointment_ref text,
  p_attendance_status text,
  p_occurred_at timestamptz,
  p_actor uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  appointment_row public.lexia_appointment_events%rowtype;
begin
  perform public.lexia_omni_require(p_command_id is not null, 'command_id_required');
  perform public.lexia_omni_require(p_occurred_at is not null, 'occurred_at_required');
  perform public.lexia_omni_require(
    p_attendance_status in ('attended', 'no_show'), 'invalid_attendance_status'
  );
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);
  if public.lexia_omni_command_seen(p_conversation_id, p_command_id) then
    return conversation_row.state_version;
  end if;

  select * into appointment_row
  from public.lexia_appointment_events
  where conversation_id = p_conversation_id and appointment_ref = p_appointment_ref
  for update;
  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  if appointment_row.status = 'cancelled' then
    raise exception 'cancelled_appointment_has_no_attendance' using errcode = '23514';
  end if;
  if p_occurred_at < appointment_row.starts_at then
    raise exception 'attendance_before_appointment_start' using errcode = '22023';
  end if;
  if appointment_row.attendance_status <> 'unknown'
    and appointment_row.attendance_status is distinct from p_attendance_status then
    raise exception 'attendance_status_conflict' using errcode = '23514';
  end if;

  update public.lexia_appointment_events
  set attendance_status = p_attendance_status,
      attendance_recorded_at = coalesce(attendance_recorded_at, p_occurred_at),
      attendance_recorded_by = coalesce(attendance_recorded_by, p_actor),
      atualizado_em = clock_timestamp()
  where id = appointment_row.id;

  return public.lexia_omni_commit_transition(
    p_conversation_id, p_command_id, 'appointment.attendance.update',
    jsonb_build_object(
      'appointment_ref', p_appointment_ref,
      'attendance_status', p_attendance_status
    ),
    p_occurred_at, p_actor, false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Buffer: sliding debounce, atomic claim, one batch per conversation
-- ---------------------------------------------------------------------------

create or replace function public.lexia_omni_claim_inbound_batch(
  p_conversation_id uuid,
  p_candidate_seq bigint
)
returns table (
  out_claimed boolean,
  out_reason text,
  out_batch_id uuid,
  out_fencing_token bigint,
  out_cutoff_seq bigint,
  out_mensagem_ids uuid[],
  out_superseded_invocation_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  policy_row public.lexia_omnichannel_policies%rowtype;
  latest_seq bigint;
  latest_at timestamptz;
  new_fencing bigint;
  new_batch_id uuid;
  carried uuid[];
  decision_at timestamptz;
begin
  perform public.lexia_omni_require(p_candidate_seq is not null, 'candidate_seq_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);
  -- D3: database time read after the conversation lock.
  decision_at := clock_timestamp();
  policy_row := public.lexia_omni_active_policy(
    conversation_row.environment, conversation_row.cliente_slug
  );

  if exists (
    select 1 from public.lexia_inbound_batches b
    where b.conversation_id = p_conversation_id and b.status = 'claimed'
  ) then
    return query select false, 'batch_in_progress', null::uuid, null::bigint,
      null::bigint, null::uuid[], null::uuid[];
    return;
  end if;

  -- A block that started during the buffer (for example a human
  -- intervention) stops the batch before context, brain or tools run. The
  -- open messages become pending and follow the company resume policy.
  if public.lexia_omni_has_active_block(p_conversation_id, decision_at) then
    update public.lexia_inbound_buffer_entries
    set disposition = 'pending'
    where conversation_id = p_conversation_id
      and disposition = 'buffered'
      and batch_id is null;
    return query select false, 'blocked', null::uuid, null::bigint,
      null::bigint, null::uuid[], null::uuid[];
    return;
  end if;

  select e.lead_seq, e.enfileirado_em into latest_seq, latest_at
  from public.lexia_inbound_buffer_entries e
  where e.conversation_id = p_conversation_id
    and e.disposition = 'buffered'
    and e.batch_id is null
  order by e.lead_seq desc
  limit 1;

  if latest_seq is null then
    return query select false, 'empty', null::uuid, null::bigint,
      null::bigint, null::uuid[], null::uuid[];
    return;
  end if;
  if latest_seq is distinct from p_candidate_seq then
    return query select false, 'newer_message_waiting', null::uuid, null::bigint,
      null::bigint, null::uuid[], null::uuid[];
    return;
  end if;
  if decision_at - latest_at < policy_row.buffer_window_ms * interval '1 millisecond' then
    return query select false, 'window_open', null::uuid, null::bigint,
      null::bigint, null::uuid[], null::uuid[];
    return;
  end if;

  update public.lexia_conversation_states
  set fencing_counter = fencing_counter + 1
  where id = p_conversation_id
  returning fencing_counter into new_fencing;

  insert into public.lexia_inbound_batches (
    conversation_id, environment, cliente_slug, fencing_token, cutoff_seq, status,
    reivindicado_em
  ) values (
    p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
    new_fencing, latest_seq, 'claimed', decision_at
  )
  returning id into new_batch_id;

  select coalesce(array_agg(b.invocation_id order by b.encerrado_em), '{}'::uuid[])
    into carried
  from public.lexia_inbound_batches b
  where b.conversation_id = p_conversation_id
    and b.status = 'superseded'
    and b.carried_into is null;

  update public.lexia_inbound_batches
  set carried_into = new_batch_id
  where conversation_id = p_conversation_id
    and status = 'superseded'
    and carried_into is null;

  update public.lexia_inbound_batches
  set superseded_invocation_ids = carried
  where id = new_batch_id;

  -- Takes exactly the open entries up to the cutoff, including those carried
  -- from a superseded batch. Later arrivals stay for the next batch.
  update public.lexia_inbound_buffer_entries
  set batch_id = new_batch_id
  where conversation_id = p_conversation_id
    and disposition = 'buffered'
    and batch_id is null
    and lead_seq <= latest_seq;

  return query
    select true, null::text, new_batch_id, new_fencing, latest_seq,
      (select array_agg(e.mensagem_id order by e.lead_seq)
       from public.lexia_inbound_buffer_entries e
       where e.batch_id = new_batch_id),
      carried;
end;
$$;

create or replace function public.lexia_omni_complete_inbound_batch(
  p_batch_id uuid,
  p_fencing_token bigint,
  p_invocation_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_row public.lexia_inbound_batches%rowtype;
begin
  perform public.lexia_omni_require(p_batch_id is not null, 'batch_id_required');
  perform public.lexia_omni_require(p_fencing_token is not null, 'fencing_token_required');
  perform public.lexia_omni_require(p_invocation_id is not null, 'invocation_id_required');
  select * into batch_row from public.lexia_inbound_batches where id = p_batch_id;
  if not found then
    raise exception 'stale_inbound_batch' using errcode = '40001';
  end if;
  perform public.lexia_omni_lock_conversation(batch_row.conversation_id);

  update public.lexia_inbound_batches
  set status = 'completed', invocation_id = p_invocation_id, encerrado_em = clock_timestamp()
  where id = p_batch_id and status = 'claimed' and fencing_token = p_fencing_token;
  if not found then
    raise exception 'stale_inbound_batch' using errcode = '40001';
  end if;

  return (
    select max(e.lead_seq)
    from public.lexia_inbound_buffer_entries e
    where e.conversation_id = batch_row.conversation_id
      and e.disposition = 'buffered'
      and e.batch_id is null
  );
end;
$$;

-- An unsent reply superseded by a newer lead message: the batch messages are
-- released for the next batch, which also carries the superseded invocation.
create or replace function public.lexia_omni_supersede_inbound_batch(
  p_batch_id uuid,
  p_fencing_token bigint,
  p_invocation_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_row public.lexia_inbound_batches%rowtype;
begin
  perform public.lexia_omni_require(p_batch_id is not null, 'batch_id_required');
  perform public.lexia_omni_require(p_fencing_token is not null, 'fencing_token_required');
  perform public.lexia_omni_require(p_invocation_id is not null, 'invocation_id_required');
  select * into batch_row from public.lexia_inbound_batches where id = p_batch_id;
  if not found then
    raise exception 'stale_inbound_batch' using errcode = '40001';
  end if;
  perform public.lexia_omni_lock_conversation(batch_row.conversation_id);

  if not exists (
    select 1 from public.lexia_inbound_buffer_entries e
    where e.conversation_id = batch_row.conversation_id
      and e.disposition = 'buffered'
      and e.batch_id is null
      and e.lead_seq > batch_row.cutoff_seq
  ) then
    raise exception 'no_newer_lead_message' using errcode = '22023';
  end if;

  update public.lexia_inbound_batches
  set status = 'superseded', invocation_id = p_invocation_id, encerrado_em = clock_timestamp()
  where id = p_batch_id and status = 'claimed' and fencing_token = p_fencing_token;
  if not found then
    raise exception 'stale_inbound_batch' using errcode = '40001';
  end if;

  update public.lexia_inbound_buffer_entries
  set batch_id = null
  where batch_id = p_batch_id;

  return (
    select max(e.lead_seq)
    from public.lexia_inbound_buffer_entries e
    where e.conversation_id = batch_row.conversation_id
      and e.disposition = 'buffered'
      and e.batch_id is null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Outbound: prepare, per-action gate and claim, finish, reconcile, retry
-- ---------------------------------------------------------------------------

create or replace function public.lexia_omni_prepare_outbound_actions(
  p_conversation_id uuid,
  p_invocation_id uuid,
  p_lead_cutoff_seq bigint,
  p_automation_request_id uuid,
  p_actions jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  action_count integer;
  max_sequence integer;
  distinct_sequences integer;
  confirmation_count integer;
  confirmation_sequence integer;
  conflicting integer;
begin
  perform public.lexia_omni_require(
    jsonb_typeof(p_actions) = 'array' and jsonb_array_length(p_actions) > 0,
    'outbound_actions_required'
  );
  perform public.lexia_omni_require(p_invocation_id is not null, 'invocation_id_required');
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);

  select count(*), max((a ->> 'sequence')::integer),
         count(distinct (a ->> 'sequence')::integer),
         count(*) filter (where a ->> 'kind' = 'appointment_confirmation'),
         max((a ->> 'sequence')::integer) filter (where a ->> 'kind' = 'appointment_confirmation')
    into action_count, max_sequence, distinct_sequences, confirmation_count, confirmation_sequence
  from jsonb_array_elements(p_actions) a;

  if max_sequence is distinct from action_count or distinct_sequences is distinct from action_count then
    raise exception 'outbound_sequences_must_be_contiguous' using errcode = '22023';
  end if;
  if confirmation_count > 1
    or (confirmation_count = 1 and confirmation_sequence <> max_sequence) then
    raise exception 'appointment_confirmation_must_be_unique_and_final' using errcode = '22023';
  end if;

  -- Replies and confirmations carry the batch cutoff: a newer lead message
  -- supersedes them before delivery.
  if p_lead_cutoff_seq is null and exists (
    select 1 from jsonb_array_elements(p_actions) a
    where a ->> 'kind' in ('reply', 'appointment_confirmation')
  ) then
    raise exception 'lead_cutoff_required_for_replies' using errcode = '22023';
  end if;
  -- D1: reminders are not superseded by lead messages and carry no cutoff.
  if p_lead_cutoff_seq is not null and exists (
    select 1 from jsonb_array_elements(p_actions) a
    where a ->> 'kind' = 'appointment_reminder'
  ) then
    raise exception 'reminders_do_not_carry_lead_cutoff' using errcode = '22023';
  end if;

  if p_automation_request_id is not null and exists (
    select 1
    from jsonb_array_elements(p_actions) a
    left join public.lexia_automation_requests r on r.id = p_automation_request_id
    where r.id is null
      or r.conversation_id <> p_conversation_id
      or r.status <> 'accepted'
      or r.kind <> a ->> 'kind'
      or r.source_ref is distinct from a ->> 'source_ref'
  ) then
    raise exception 'automation_actions_mismatch' using errcode = '22023';
  end if;

  insert into public.lexia_outbound_actions (
    id, conversation_id, environment, cliente_slug, invocation_id, automation_request_id,
    sequence, kind, source_ref, captured_state_version, captured_delivery_epoch,
    lead_cutoff_seq, content
  )
  select
    (a ->> 'action_id')::uuid, p_conversation_id, conversation_row.environment,
    conversation_row.cliente_slug, p_invocation_id, p_automation_request_id,
    (a ->> 'sequence')::integer, a ->> 'kind', a ->> 'source_ref',
    (a -> 'captured_state' ->> 'state_version')::bigint,
    (a -> 'captured_state' ->> 'delivery_epoch')::bigint,
    p_lead_cutoff_seq, a -> 'content'
  from jsonb_array_elements(p_actions) a
  on conflict (id) do nothing;

  -- A retried prepare with the same IDs is a no-op; any divergence fails.
  select count(*) into conflicting
  from jsonb_array_elements(p_actions) a
  join public.lexia_outbound_actions o on o.id = (a ->> 'action_id')::uuid
  where o.conversation_id is distinct from p_conversation_id
    or o.invocation_id is distinct from p_invocation_id
    or o.sequence is distinct from (a ->> 'sequence')::integer
    or o.kind is distinct from a ->> 'kind';
  if conflicting > 0 then
    raise exception 'outbound_action_conflict' using errcode = '23505';
  end if;

  return action_count;
end;
$$;

-- Acquires the delivery right for one action. Only the call that returns
-- out_acquired = true may contact the provider, and only with its own
-- claimant and fencing token. An action already claimed by anyone returns
-- out_acquired = false and no token.
create or replace function public.lexia_omni_claim_outbound_action(
  p_action_id uuid,
  p_claimant text
)
returns table (
  out_acquired boolean,
  out_status text,
  out_reason text,
  out_fencing_token bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_row public.lexia_outbound_actions%rowtype;
  conversation_row public.lexia_conversation_states%rowtype;
  account_row public.lexia_channel_accounts%rowtype;
  appointment_row public.lexia_appointment_events%rowtype;
  new_fencing bigint;
  appointment_bound boolean;
  decision_at timestamptz;
begin
  perform public.lexia_omni_require(p_action_id is not null, 'action_id_required');
  perform public.lexia_omni_require(
    p_claimant is not null and char_length(p_claimant) between 1 and 128, 'claimant_required'
  );

  select * into action_row from public.lexia_outbound_actions where id = p_action_id;
  if not found then
    raise exception 'outbound_action_not_found' using errcode = 'P0002';
  end if;

  conversation_row := public.lexia_omni_lock_conversation(action_row.conversation_id);
  select * into action_row from public.lexia_outbound_actions where id = p_action_id for update;
  -- D3: the decision uses database time read after every relevant lock.
  decision_at := clock_timestamp();

  if action_row.status <> 'prepared' then
    return query select false, action_row.status, coalesce(action_row.reason, 'already_claimed'),
      null::bigint;
    return;
  end if;

  if exists (
    select 1 from public.lexia_outbound_actions o
    where o.conversation_id = action_row.conversation_id
      and o.invocation_id = action_row.invocation_id
      and o.sequence < action_row.sequence
      and o.status <> 'sent'
  ) then
    return query select false, 'prepared'::text, 'previous_action_not_sent'::text, null::bigint;
    return;
  end if;

  select * into account_row
  from public.lexia_channel_accounts where id = conversation_row.account_id;
  if account_row.status <> 'active'
    or account_row.delivery_owner <> 'v2'
    or account_row.delivery_mode <> 'deliver' then
    perform public.lexia_omni_suppress_plan(p_action_id, 'observe_only');
    return query select false, 'suppressed'::text, 'observe_only'::text, null::bigint;
    return;
  end if;

  if action_row.captured_state_version is distinct from conversation_row.state_version
    or action_row.captured_delivery_epoch is distinct from conversation_row.delivery_epoch then
    perform public.lexia_omni_suppress_plan(p_action_id, 'state_changed');
    return query select false, 'suppressed'::text, 'state_changed'::text, null::bigint;
    return;
  end if;

  appointment_bound := action_row.kind in ('appointment_reminder', 'appointment_confirmation');

  -- An appointment block admits only the reminder and the single confirmation
  -- of its own appointment; every other active block keeps blocking.
  if exists (
    select 1 from public.lexia_conversation_blocks b
    where b.conversation_id = action_row.conversation_id
      and b.status = 'active'
      and (b.expires_at is null or b.expires_at > decision_at)
      and not (
        b.block_type = 'appointment'
        and appointment_bound
        and b.source_ref = action_row.source_ref
      )
  ) then
    perform public.lexia_omni_suppress_plan(p_action_id, 'blocked');
    return query select false, 'suppressed'::text, 'blocked'::text, null::bigint;
    return;
  end if;

  if appointment_bound then
    select * into appointment_row
    from public.lexia_appointment_events
    where conversation_id = action_row.conversation_id
      and appointment_ref = action_row.source_ref
    for update;
    if not found then
      perform public.lexia_omni_suppress_plan(p_action_id, 'appointment_not_found');
      return query select false, 'suppressed'::text, 'appointment_not_found'::text, null::bigint;
      return;
    end if;
    if appointment_row.status = 'cancelled' then
      perform public.lexia_omni_suppress_plan(p_action_id, 'appointment_cancelled');
      return query select false, 'suppressed'::text, 'appointment_cancelled'::text, null::bigint;
      return;
    end if;
    if appointment_row.starts_at <= decision_at then
      perform public.lexia_omni_suppress_plan(p_action_id, 'appointment_started');
      return query select false, 'suppressed'::text, 'appointment_started'::text, null::bigint;
      return;
    end if;
    if action_row.kind = 'appointment_confirmation'
      and appointment_row.confirmation_action_id is not null
      and appointment_row.confirmation_action_id is distinct from action_row.id then
      perform public.lexia_omni_suppress_plan(p_action_id, 'appointment_confirmation_already_sent');
      return query select false, 'suppressed'::text, 'appointment_confirmation_already_sent'::text,
        null::bigint;
      return;
    end if;
  end if;

  if action_row.lead_cutoff_seq is not null
    and conversation_row.lead_message_seq > action_row.lead_cutoff_seq then
    perform public.lexia_omni_suppress_plan(p_action_id, 'superseded_by_new_message');
    return query select false, 'suppressed'::text, 'superseded_by_new_message'::text, null::bigint;
    return;
  end if;

  update public.lexia_conversation_states
  set fencing_counter = fencing_counter + 1
  where id = action_row.conversation_id
  returning fencing_counter into new_fencing;

  update public.lexia_outbound_actions
  set status = 'claimed', claim_fencing = new_fencing, claimed_by = p_claimant,
      attempts = attempts + 1, reivindicado_em = decision_at, reason = null
  where id = p_action_id;

  -- D2: the single confirmation is reserved in the same transaction as the
  -- claim. A reservation is not a delivery.
  if action_row.kind = 'appointment_confirmation' then
    update public.lexia_appointment_events
    set confirmation_action_id = action_row.id, atualizado_em = decision_at
    where id = appointment_row.id;
  end if;

  return query select true, 'claimed'::text, null::text, new_fencing;
end;
$$;

create or replace function public.lexia_omni_finish_outbound_action(
  p_action_id uuid,
  p_claimant text,
  p_fencing_token bigint,
  p_status text,
  p_provider_message_id text,
  p_reason text,
  p_mensagem_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_row public.lexia_outbound_actions%rowtype;
begin
  perform public.lexia_omni_require(p_action_id is not null, 'action_id_required');
  perform public.lexia_omni_require(p_claimant is not null, 'claimant_required');
  perform public.lexia_omni_require(p_fencing_token is not null, 'fencing_token_required');
  perform public.lexia_omni_require(
    p_status in ('sent', 'failed', 'delivery_unknown'), 'invalid_delivery_status'
  );
  perform public.lexia_omni_require(
    p_status <> 'sent' or p_provider_message_id is not null, 'provider_message_id_required'
  );

  select * into action_row from public.lexia_outbound_actions where id = p_action_id for update;
  if not found then
    raise exception 'outbound_action_not_found' using errcode = 'P0002';
  end if;

  -- The persisted AI message must belong to this action and conversation.
  if p_mensagem_id is not null then
    perform public.lexia_omni_require(
      exists (
        select 1 from public.lexia_mensagens m
        where m.id = p_mensagem_id
          and m.omni_conversation_id = action_row.conversation_id
          and m.cliente_slug = action_row.cliente_slug
          and m.omni_author = 'ai'
          and m.omni_action_id = action_row.id
      ),
      'omni_message_scope_mismatch'
    );
  end if;

  if action_row.status = p_status
    and action_row.claimed_by is not distinct from p_claimant
    and action_row.claim_fencing is not distinct from p_fencing_token
    and action_row.provider_message_id is not distinct from p_provider_message_id then
    return 'duplicate';
  end if;
  if action_row.status <> 'claimed'
    or action_row.claimed_by is distinct from p_claimant
    or action_row.claim_fencing is distinct from p_fencing_token then
    raise exception 'stale_outbound_claim' using errcode = '40001';
  end if;

  update public.lexia_outbound_actions
  set status = p_status, provider_message_id = p_provider_message_id,
      reason = left(p_reason, 64), mensagem_id = p_mensagem_id,
      concluido_em = clock_timestamp()
  where id = p_action_id;

  -- D2: a definitive failure sent nothing, so the reservation is released for
  -- a safe recovery; an uncertain result keeps it until reconciliation.
  if p_status = 'failed' and action_row.kind = 'appointment_confirmation' then
    update public.lexia_appointment_events
    set confirmation_action_id = null, atualizado_em = clock_timestamp()
    where conversation_id = action_row.conversation_id
      and confirmation_action_id = action_row.id;
  end if;
  return p_status;
end;
$$;

create or replace function public.lexia_omni_reconcile_outbound_action(
  p_action_id uuid,
  p_status text,
  p_provider_message_id text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_row public.lexia_outbound_actions%rowtype;
begin
  perform public.lexia_omni_require(p_status in ('sent', 'failed'), 'invalid_reconciliation_status');
  perform public.lexia_omni_require(
    p_status <> 'sent' or p_provider_message_id is not null, 'provider_message_id_required'
  );
  select * into action_row from public.lexia_outbound_actions where id = p_action_id for update;
  if not found or action_row.status <> 'delivery_unknown' then
    raise exception 'only_unknown_delivery_can_be_reconciled' using errcode = '42501';
  end if;

  update public.lexia_outbound_actions
  set status = p_status, provider_message_id = p_provider_message_id,
      reason = left(p_reason, 64), concluido_em = clock_timestamp()
  where id = p_action_id;

  if p_status = 'failed' and action_row.kind = 'appointment_confirmation' then
    update public.lexia_appointment_events
    set confirmation_action_id = null, atualizado_em = clock_timestamp()
    where conversation_id = action_row.conversation_id
      and confirmation_action_id = action_row.id;
  end if;
  return p_status;
end;
$$;

create or replace function public.lexia_omni_prepare_outbound_retry(p_action_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_row public.lexia_outbound_actions%rowtype;
begin
  select * into action_row from public.lexia_outbound_actions where id = p_action_id for update;
  if not found then
    raise exception 'outbound_action_not_found' using errcode = 'P0002';
  end if;
  if action_row.status = 'delivery_unknown' then
    raise exception 'unknown_delivery_must_be_reconciled' using errcode = '42501';
  end if;
  if action_row.status <> 'failed' then
    raise exception 'only_deterministic_failure_can_be_retried' using errcode = '42501';
  end if;
  -- The retry keeps its captured snapshot and passes the full gate again.
  update public.lexia_outbound_actions
  set status = 'prepared', reason = null, claim_fencing = null, claimed_by = null
  where id = p_action_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Automations, context and projection
-- ---------------------------------------------------------------------------

create or replace function public.lexia_omni_register_automation_request(
  p_request_id uuid,
  p_conversation_id uuid,
  p_kind text,
  p_source_ref text,
  p_due_at timestamptz
)
returns table (out_status text, out_reason text, out_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  existing public.lexia_automation_requests%rowtype;
  request_status text := 'accepted';
  request_reason text;
begin
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);

  select * into existing from public.lexia_automation_requests where id = p_request_id;
  if found then
    if existing.conversation_id is distinct from p_conversation_id
      or existing.kind is distinct from p_kind
      or existing.source_ref is distinct from p_source_ref then
      raise exception 'automation_request_conflict' using errcode = '23505';
    end if;
    return query select existing.status, existing.reason, true;
    return;
  end if;

  perform public.lexia_omni_require(p_request_id is not null, 'request_id_required');
  perform public.lexia_omni_require(p_kind in ('appointment_reminder', 'followup'), 'invalid_automation_kind');
  if p_kind = 'appointment_reminder' and not exists (
    select 1 from public.lexia_appointment_events a
    where a.conversation_id = p_conversation_id
      and a.appointment_ref = p_source_ref
      and a.status = 'confirmed'
      and a.starts_at > clock_timestamp()
  ) then
    request_status := 'rejected';
    request_reason := 'appointment_not_remindable';
  end if;

  insert into public.lexia_automation_requests (
    id, conversation_id, environment, cliente_slug, kind, source_ref, due_at, status, reason
  ) values (
    p_request_id, p_conversation_id, conversation_row.environment,
    conversation_row.cliente_slug, p_kind, p_source_ref, p_due_at, request_status,
    request_reason
  );
  return query select request_status, request_reason, false;
end;
$$;

create or replace function public.lexia_omni_store_context(
  p_conversation_id uuid,
  p_expected_context_version bigint,
  p_context_call_id uuid,
  p_config_version text,
  p_source_message_ids uuid[],
  p_operational_context jsonb,
  p_company_fields jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.lexia_conversation_states%rowtype;
  current_version bigint;
begin
  perform public.lexia_omni_require(p_expected_context_version is not null, 'expected_context_version_required');
  perform public.lexia_omni_require(p_context_call_id is not null, 'context_call_id_required');
  perform public.lexia_omni_require(
    cardinality(p_source_message_ids) > 0 and array_position(p_source_message_ids, null) is null,
    'source_message_ids_required'
  );
  conversation_row := public.lexia_omni_lock_conversation(p_conversation_id);

  -- Context is accepted only for the exact active tenant configuration.
  if not exists (
    select 1 from public.lexia_context_agent_configs c
    where c.environment = conversation_row.environment
      and c.cliente_slug = conversation_row.cliente_slug
      and c.status = 'active'
      and c.config_version = p_config_version
  ) then
    raise exception 'context_config_unavailable' using errcode = 'P0002';
  end if;

  -- Every source message must belong to this conversation and company.
  perform public.lexia_omni_require(
    not exists (
      select 1
      from unnest(p_source_message_ids) as source(id)
      where not exists (
        select 1 from public.lexia_mensagens m
        where m.id = source.id
          and m.omni_conversation_id = p_conversation_id
          and m.cliente_slug = conversation_row.cliente_slug
      )
    ),
    'context_source_scope_mismatch'
  );

  select coalesce(max(x.context_version), 0) into current_version
  from public.lexia_conversation_contexts x
  where x.conversation_id = p_conversation_id;
  if current_version is distinct from p_expected_context_version then
    raise exception 'context_version_conflict' using errcode = '40001';
  end if;

  insert into public.lexia_conversation_contexts (
    conversation_id, environment, cliente_slug, context_version, config_version,
    context_call_id, source_message_ids, operational_context, company_fields
  ) values (
    p_conversation_id, conversation_row.environment, conversation_row.cliente_slug,
    current_version + 1, p_config_version, p_context_call_id, p_source_message_ids,
    p_operational_context, p_company_fields
  );
  return current_version + 1;
end;
$$;

create or replace function public.lexia_omni_complete_projection(
  p_outbox_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox_row public.lexia_omnichannel_projection_outbox%rowtype;
begin
  perform public.lexia_omni_require(p_status in ('done', 'failed'), 'invalid_projection_status');
  update public.lexia_omnichannel_projection_outbox
  set status = p_status, attempts = attempts + 1, processado_em = clock_timestamp()
  where id = p_outbox_id
  returning * into outbox_row;
  if not found then
    raise exception 'projection_not_found' using errcode = 'P0002';
  end if;

  -- A failed projection keeps the conversation stale; it never authorizes
  -- delivery, which always reads the central state.
  if p_status = 'done' then
    update public.lexia_conversation_states
    set projection_status = 'current'
    where id = outbox_row.conversation_id
      and state_version = outbox_row.state_version;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.lexia_channel_accounts enable row level security;
alter table public.lexia_omnichannel_policies enable row level security;
alter table public.lexia_context_agent_configs enable row level security;
alter table public.lexia_brain_bindings enable row level security;
alter table public.lexia_conversation_states enable row level security;
alter table public.lexia_conversation_blocks enable row level security;
alter table public.lexia_conversation_state_events enable row level security;
alter table public.lexia_ingress_events enable row level security;
alter table public.lexia_inbound_batches enable row level security;
alter table public.lexia_inbound_buffer_entries enable row level security;
alter table public.lexia_appointment_events enable row level security;
alter table public.lexia_automation_requests enable row level security;
alter table public.lexia_outbound_actions enable row level security;
alter table public.lexia_conversation_contexts enable row level security;
alter table public.lexia_omnichannel_projection_outbox enable row level security;

revoke all on
  public.lexia_channel_accounts,
  public.lexia_omnichannel_policies,
  public.lexia_context_agent_configs,
  public.lexia_brain_bindings,
  public.lexia_conversation_states,
  public.lexia_conversation_blocks,
  public.lexia_conversation_state_events,
  public.lexia_ingress_events,
  public.lexia_inbound_batches,
  public.lexia_inbound_buffer_entries,
  public.lexia_appointment_events,
  public.lexia_automation_requests,
  public.lexia_outbound_actions,
  public.lexia_conversation_contexts,
  public.lexia_omnichannel_projection_outbox
from public, anon, authenticated, service_role;

-- Server read models use service_role; every write goes through the RPCs.
grant select on
  public.lexia_channel_accounts,
  public.lexia_omnichannel_policies,
  public.lexia_context_agent_configs,
  public.lexia_brain_bindings,
  public.lexia_conversation_states,
  public.lexia_conversation_blocks,
  public.lexia_conversation_state_events,
  public.lexia_ingress_events,
  public.lexia_inbound_batches,
  public.lexia_inbound_buffer_entries,
  public.lexia_appointment_events,
  public.lexia_automation_requests,
  public.lexia_outbound_actions,
  public.lexia_conversation_contexts,
  public.lexia_omnichannel_projection_outbox
to service_role;

-- Company users and Lexia admins read the policy (view only for companies).
create policy "omnichannel_policies_select"
on public.lexia_omnichannel_policies for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  environment,
  cliente_slug,
  policy_version,
  status,
  resume_mode,
  human_intervention_ms,
  buffer_window_ms,
  pause_after_appointment,
  criado_em,
  substituido_em
) on public.lexia_omnichannel_policies to authenticated;

create policy "conversation_states_select"
on public.lexia_conversation_states for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id,
  environment,
  cliente_slug,
  channel,
  identificador_conversa,
  contacto_id,
  projection_status,
  atualizado_em
) on public.lexia_conversation_states to authenticated;

create policy "conversation_blocks_select"
on public.lexia_conversation_blocks for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id,
  conversation_id,
  environment,
  cliente_slug,
  block_key,
  block_type,
  status,
  expires_at,
  criado_em,
  atualizado_em
) on public.lexia_conversation_blocks to authenticated;

create policy "appointment_events_select"
on public.lexia_appointment_events for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id,
  conversation_id,
  environment,
  cliente_slug,
  appointment_ref,
  status,
  starts_at,
  ends_at,
  timezone,
  paused_until_end,
  policy_version,
  criado_em,
  atualizado_em
) on public.lexia_appointment_events to authenticated;

-- Internal helpers are not callable by any API role.
revoke all on function public.lexia_omni_lock_conversation(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_command_seen(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_active_policy(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_commit_transition(uuid, text, text, jsonb, timestamptz, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_suppress_plan(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_has_active_block(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_require(boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_guard_policy_update()
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_guard_append_only()
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_guard_outbound_status()
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_guard_legacy_columns()
  from public, anon, authenticated, service_role;

-- Policy changes: only an authenticated Lexia admin session (checked inside).
revoke all on function public.lexia_omni_create_policy(text, text, text, integer, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_omni_set_appointment_pause(text, text, boolean, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.lexia_omni_create_policy(text, text, text, integer, integer, boolean)
  to authenticated;
grant execute on function public.lexia_omni_set_appointment_pause(text, text, boolean, integer)
  to authenticated;

-- Operational RPCs: service_role only, after server-side authorization.
do $$
declare
  rpc text;
begin
  for rpc in
    select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'lexia_omni_resolve_conversation',
        'lexia_omni_register_ingress',
        'lexia_omni_record_message',
        'lexia_omni_update_media_status',
        'lexia_omni_record_lead_message',
        'lexia_omni_record_human_intervention',
        'lexia_omni_start_manual_pause',
        'lexia_omni_end_block',
        'lexia_omni_expire_blocks',
        'lexia_omni_release_pending',
        'lexia_omni_request_handoff',
        'lexia_omni_resolve_handoff',
        'lexia_omni_resume_handoff',
        'lexia_omni_confirm_appointment',
        'lexia_omni_cancel_appointment',
        'lexia_omni_cancel_appointment_from_crm',
        'lexia_omni_update_appointment_attendance',
        'lexia_omni_claim_inbound_batch',
        'lexia_omni_complete_inbound_batch',
        'lexia_omni_supersede_inbound_batch',
        'lexia_omni_prepare_outbound_actions',
        'lexia_omni_claim_outbound_action',
        'lexia_omni_finish_outbound_action',
        'lexia_omni_reconcile_outbound_action',
        'lexia_omni_prepare_outbound_retry',
        'lexia_omni_register_automation_request',
        'lexia_omni_store_context',
        'lexia_omni_complete_projection'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', rpc);
    execute format('grant execute on function %s to service_role', rpc);
  end loop;
end;
$$;

commit;
