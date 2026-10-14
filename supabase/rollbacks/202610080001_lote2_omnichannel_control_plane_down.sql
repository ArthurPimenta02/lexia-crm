-- Destructive rollback for 202610080001_lote2_omnichannel_control_plane.sql.
--
-- Not part of the normal procedure: an operational rollback uses
-- supabase/operations/202610080001_lote2_disable_delivery.sql and keeps all
-- v2 data. Use this file only on a disposable project, or after a verified
-- backup restore, retention review and separate approval.
--
-- Required in the same session:
--   set lexia.target_project_ref = '<project_ref>';
--   set lexia.target_environment = '<environment>';
-- and, only when v2 data exists and was exported first:
--   set lexia.lote2_rollback_confirm = 'DESTROY_LOTE2_DATA';
--
-- Order: triggers on legacy tables, functions (some return table row
-- types), legacy columns, then tables from dependents to parents. Every object
-- is named explicitly; CASCADE is never used.

begin;

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

  -- Data guard over every table and column this file removes.
  if current_setting('lexia.lote2_rollback_confirm', true) is distinct from 'DESTROY_LOTE2_DATA'
    and (
      exists (select 1 from public.lexia_omnichannel_projection_outbox)
      or exists (select 1 from public.lexia_conversation_contexts)
      or exists (select 1 from public.lexia_outbound_actions)
      or exists (select 1 from public.lexia_automation_requests)
      or exists (select 1 from public.lexia_appointment_events)
      or exists (select 1 from public.lexia_inbound_buffer_entries)
      or exists (select 1 from public.lexia_inbound_batches)
      or exists (select 1 from public.lexia_ingress_events)
      or exists (select 1 from public.lexia_conversation_state_events)
      or exists (select 1 from public.lexia_conversation_blocks)
      or exists (select 1 from public.lexia_conversation_states)
      or exists (select 1 from public.lexia_brain_bindings)
      or exists (select 1 from public.lexia_context_agent_configs)
      or exists (select 1 from public.lexia_omnichannel_policies)
      or exists (select 1 from public.lexia_channel_accounts)
      or exists (select 1 from public.lexia_mensagens where omni_conversation_id is not null or omni_author is not null or provider_message_id is not null or provider_timestamp is not null or omni_action_id is not null or lead_seq is not null or media_kind is not null or media_processing_status is not null or media_error_code is not null)
      or exists (select 1 from public.lexia_handoffs where omni_conversation_id is not null or block_key is not null or idempotency_key is not null or omni_resolution is not null or omni_resolved_at is not null or omni_resolved_by is not null or retomado_em is not null or retomado_por is not null)
      or exists (select 1 from public.lexia_contactos where omni_account_id is not null or provider_contact_ref is not null)
    ) then
    raise exception 'Lot 2 data exists. Export it and confirm explicitly before dropping.';
  end if;
end;
$$;

drop trigger lexia_mensagens_omni_columns_guard on public.lexia_mensagens;
drop trigger lexia_handoffs_omni_columns_guard on public.lexia_handoffs;
drop trigger lexia_contactos_omni_columns_guard on public.lexia_contactos;
drop trigger lexia_outbound_actions_status_guard on public.lexia_outbound_actions;
drop trigger lexia_conversation_state_events_append_only on public.lexia_conversation_state_events;
drop trigger lexia_omnichannel_policies_guard on public.lexia_omnichannel_policies;

drop function public.lexia_omni_require(boolean, text);
drop function public.lexia_omni_lock_conversation(uuid);
drop function public.lexia_omni_command_seen(uuid, text);
drop function public.lexia_omni_active_policy(text, text);
drop function public.lexia_omni_commit_transition(uuid, text, text, jsonb, timestamptz, uuid, boolean);
drop function public.lexia_omni_suppress_plan(uuid, text);
drop function public.lexia_omni_create_policy(text, text, text, integer, integer, boolean);
drop function public.lexia_omni_set_appointment_pause(text, text, boolean, integer);
drop function public.lexia_omni_resolve_conversation(uuid, text, text);
drop function public.lexia_omni_register_ingress(uuid, text, text, timestamptz, uuid);
drop function public.lexia_omni_record_message(uuid, text, text, timestamptz, text, text, text, text, uuid);
drop function public.lexia_omni_update_media_status(uuid, text, text);
drop function public.lexia_omni_has_active_block(uuid, timestamptz);
drop function public.lexia_omni_record_lead_message(uuid, text, uuid, timestamptz);
drop function public.lexia_omni_record_human_intervention(uuid, text, uuid, timestamptz);
drop function public.lexia_omni_start_manual_pause(uuid, text, text, timestamptz, timestamptz, uuid);
drop function public.lexia_omni_end_block(uuid, text, text, timestamptz, uuid, text);
drop function public.lexia_omni_expire_blocks(uuid, text);
drop function public.lexia_omni_release_pending(uuid, text);
drop function public.lexia_omni_request_handoff(uuid, text, text, text, text, text, timestamptz);
drop function public.lexia_omni_resolve_handoff(uuid, text, uuid, text, text, timestamptz, uuid);
drop function public.lexia_omni_resume_handoff(uuid, text, uuid, timestamptz, uuid);
drop function public.lexia_omni_confirm_appointment(uuid, text, text, timestamptz, timestamptz, text, text, timestamptz);
drop function public.lexia_omni_cancel_appointment(uuid, text, text, text, timestamptz);
drop function public.lexia_omni_cancel_appointment_from_crm(uuid, text, text, timestamptz, uuid);
drop function public.lexia_omni_update_appointment_attendance(uuid, text, text, text, timestamptz, uuid);
drop function public.lexia_omni_claim_inbound_batch(uuid, bigint);
drop function public.lexia_omni_complete_inbound_batch(uuid, bigint, uuid);
drop function public.lexia_omni_supersede_inbound_batch(uuid, bigint, uuid);
drop function public.lexia_omni_prepare_outbound_actions(uuid, uuid, bigint, uuid, jsonb);
drop function public.lexia_omni_claim_outbound_action(uuid, text);
drop function public.lexia_omni_finish_outbound_action(uuid, text, bigint, text, text, text, uuid);
drop function public.lexia_omni_reconcile_outbound_action(uuid, text, text, text);
drop function public.lexia_omni_prepare_outbound_retry(uuid);
drop function public.lexia_omni_register_automation_request(uuid, uuid, text, text, timestamptz);
drop function public.lexia_omni_store_context(uuid, bigint, uuid, text, uuid[], jsonb, jsonb);
drop function public.lexia_omni_complete_projection(uuid, text);
drop function public.lexia_omni_guard_policy_update();
drop function public.lexia_omni_guard_append_only();
drop function public.lexia_omni_guard_outbound_status();
drop function public.lexia_omni_guard_legacy_columns();

drop index public.lexia_mensagens_omni_provider_key;
drop index public.lexia_mensagens_omni_lead_seq_key;
drop index public.lexia_handoffs_omni_idempotency_key;

alter table public.lexia_mensagens
  drop constraint lexia_mensagens_omni_conversation_fkey,
  drop column omni_conversation_id,
  drop column omni_author,
  drop column provider_message_id,
  drop column provider_timestamp,
  drop column omni_action_id,
  drop column lead_seq,
  drop column media_kind,
  drop column media_processing_status,
  drop column media_error_code;

alter table public.lexia_handoffs
  drop constraint lexia_handoffs_omni_conversation_fkey,
  drop column omni_conversation_id,
  drop column block_key,
  drop column idempotency_key,
  drop column omni_resolution,
  drop column omni_resolved_at,
  drop column omni_resolved_by,
  drop column retomado_em,
  drop column retomado_por;

alter table public.lexia_contactos
  drop column omni_account_id,
  drop column provider_contact_ref;

drop table public.lexia_omnichannel_projection_outbox;
drop table public.lexia_conversation_contexts;
drop table public.lexia_outbound_actions;
drop table public.lexia_automation_requests;
drop table public.lexia_appointment_events;
drop table public.lexia_inbound_buffer_entries;
drop table public.lexia_inbound_batches;
drop table public.lexia_ingress_events;
drop table public.lexia_conversation_state_events;
drop table public.lexia_conversation_blocks;
drop table public.lexia_conversation_states;
drop table public.lexia_brain_bindings;
drop table public.lexia_context_agent_configs;
drop table public.lexia_omnichannel_policies;
drop table public.lexia_channel_accounts;

commit;
