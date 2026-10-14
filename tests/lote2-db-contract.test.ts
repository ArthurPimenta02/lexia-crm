import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Static contract checks for the Lot 2 SQL files. They do not connect to a
// database; behavior still requires the isolated harness before any target.

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = read("supabase/migrations/202610080001_lote2_omnichannel_control_plane.sql");
const stateEventFollowup = read("supabase/migrations/202610090001_lote2_state_event_command_types.sql");
const crmCancellationFollowup = read("supabase/migrations/202610090002_lote2_crm_appointment_cancellation.sql");
const crmCancellationPreflight = read("supabase/checks/202610090003_lote2_crm_followup_preflight.sql");
const preflight = read("supabase/checks/202610080001_lote2_preflight.sql");
const verify = read("supabase/checks/202610080002_lote2_verify.sql");
const seed = read("supabase/operations/202610080002_lote2_seed_initial_policies.sql");
const disableDelivery = read("supabase/operations/202610080001_lote2_disable_delivery.sql");
const rollback = read("supabase/rollbacks/202610080001_lote2_omnichannel_control_plane_down.sql");

function functionBody(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, name);
  const end = migration.indexOf("\n$$;", start);
  return migration.slice(start, end);
}

const createdTables = [...migration.matchAll(/^create table public\.(\w+)/gm)].map((m) => m[1]!);
const omniFunctions = [...migration.matchAll(/^create or replace function public\.(lexia_omni_\w+)\(/gm)]
  .map((m) => m[1]!);

test("every Lot 2 table has RLS and no direct write grant to API roles", () => {
  assert.equal(createdTables.length, 15);
  for (const table of createdTables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), table);
  }
  const revoke = migration.match(/revoke all on\s+([\s\S]*?)\s+from public, anon, authenticated, service_role;/)?.[1] ?? "";
  for (const table of createdTables) assert.match(revoke, new RegExp(`public\\.${table}\\b`), table);
  assert.doesNotMatch(
    migration,
    /grant\s+(?:insert|update|delete|truncate|all)\b[^;]*\bto\s+(?:public|anon|authenticated)\b/i,
  );
});

test("prompts, brain bindings, accounts and action content stay server-only", () => {
  for (const table of [
    "lexia_context_agent_configs",
    "lexia_brain_bindings",
    "lexia_channel_accounts",
    "lexia_outbound_actions",
    "lexia_ingress_events",
    "lexia_inbound_buffer_entries",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`grant select[^;]*on public\\.${table} to authenticated`, "i"),
      table,
    );
    assert.doesNotMatch(migration, new RegExp(`on public\\.${table} for select to authenticated`), table);
  }
});

test("company users only read their own policy, blocks and appointments", () => {
  for (const table of [
    "lexia_omnichannel_policies",
    "lexia_conversation_states",
    "lexia_conversation_blocks",
    "lexia_appointment_events",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `on public\\.${table} for select to authenticated\\s+using \\(public\\.lexia_user_can_access_cliente\\(cliente_slug\\)\\)`,
      ),
      table,
    );
  }
  const stateColumns = migration.match(/grant select \(([\s\S]*?)\) on public\.lexia_conversation_states to authenticated/)?.[1] ?? "";
  assert.doesNotMatch(stateColumns, /conversation_ref|account_id|fencing_counter/);
});

test("every Lot 2 function pins an empty search_path and RPCs are security definer", () => {
  assert.ok(omniFunctions.length >= 30);
  for (const name of omniFunctions) {
    const body = functionBody(name);
    assert.match(body, /set search_path = ''/, name);
    if (!name.startsWith("lexia_omni_guard_")) assert.match(body, /security definer/, name);
  }
});

test("the state-event constraint accepts every command type emitted by RPCs", () => {
  const constraint = migration.match(
    /command_type text not null check \(command_type in \(([\s\S]*?)\)\),/,
  )?.[1] ?? "";
  const allowed = new Set(
    [...constraint.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)].map((match) => match[1]),
  );
  const emitted = new Set(
    [...migration.matchAll(/lexia_omni_commit_transition\([\s\S]*?'([a-z_]+(?:\.[a-z_]+)+)'/g)]
      .map((match) => match[1]),
  );
  for (const commandType of emitted) {
    assert.ok(allowed.has(commandType), commandType);
  }
  assert.ok(allowed.has("handoff.resolve"));
  assert.ok(allowed.has("appointment.attendance.update"));
  assert.match(stateEventFollowup, /'handoff\.resolve'/);
  assert.match(stateEventFollowup, /'appointment\.attendance\.update'/);
  assert.match(stateEventFollowup, /lexia\.target_project_ref/);
  assert.match(stateEventFollowup, /lexia\.target_environment/);
});

test("only a Lexia admin session can create or change the post-appointment policy", () => {
  for (const name of ["lexia_omni_create_policy", "lexia_omni_set_appointment_pause"]) {
    const body = functionBody(name);
    assert.match(body, /if not public\.lexia_is_admin\(\) then\s+raise exception 'lexia_admin_required'/, name);
    assert.match(body, /p_pause_after_appointment is null/, name);
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\)\\s+to authenticated;`), name);
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\([^)]*\\)\\s+from public, anon, authenticated, service_role;`),
      name,
    );
  }
  const authenticatedGrants = [...migration.matchAll(/grant execute on function public\.(\w+)\([^)]*\)\s+to authenticated/g)]
    .map((m) => m[1]);
  assert.deepEqual(authenticatedGrants.sort(), ["lexia_omni_create_policy", "lexia_omni_set_appointment_pause"]);
  assert.match(functionBody("lexia_omni_set_appointment_pause"), /policy_version_conflict/);
  assert.match(migration, /pause_after_appointment boolean not null,/);
  assert.doesNotMatch(migration, /pause_after_appointment boolean not null default/);
});

test("the appointment pause comes from the company policy and is channel-agnostic", () => {
  const confirm = functionBody("lexia_omni_confirm_appointment");
  assert.match(confirm, /policy_row := public\.lexia_omni_active_policy\(/);
  assert.match(confirm, /if policy_row\.pause_after_appointment then/);
  assert.doesNotMatch(confirm, /\bp_pause|\bchannel\b|whatsapp|instagram|messenger/i);
  assert.match(confirm, /p_conversation_id, conversation_row\.environment, conversation_row\.cliente_slug,\s+'appointment:'/);
});

test("the delivery claim distinguishes an acquired claim from an existing one", () => {
  const claim = functionBody("lexia_omni_claim_outbound_action");
  assert.match(claim, /p_claimant text/);
  assert.match(claim, /out_acquired boolean/);
  assert.match(claim, /if action_row\.status <> 'prepared' then\s+return query select false,/);
  assert.match(claim, /return query select true, 'claimed'::text, null::text, new_fencing;/);
  assert.equal(claim.match(/return query select true/g)?.length, 1);
  const finish = functionBody("lexia_omni_finish_outbound_action");
  assert.match(finish, /claimed_by is distinct from p_claimant/);
  assert.match(finish, /claim_fencing is distinct from p_fencing_token/);
});

test("required values reject NULL and comparisons are null-safe", () => {
  assert.match(functionBody("lexia_omni_require"), /if p_condition is not true then/);
  assert.match(functionBody("lexia_omni_finish_outbound_action"), /p_fencing_token is not null, 'fencing_token_required'/);
  assert.match(functionBody("lexia_omni_set_appointment_pause"), /policy_version is distinct from p_expected_policy_version/);
  assert.match(functionBody("lexia_omni_store_context"), /current_version is distinct from p_expected_context_version/);
  assert.match(functionBody("lexia_omni_claim_inbound_batch"), /latest_seq is distinct from p_candidate_seq/);
  for (const name of ["lexia_omni_complete_inbound_batch", "lexia_omni_supersede_inbound_batch"]) {
    assert.match(functionBody(name), /p_fencing_token is not null, 'fencing_token_required'/, name);
  }
  for (const name of [
    "lexia_omni_record_human_intervention", "lexia_omni_start_manual_pause", "lexia_omni_end_block",
    "lexia_omni_resolve_handoff", "lexia_omni_resume_handoff", "lexia_omni_request_handoff",
    "lexia_omni_confirm_appointment", "lexia_omni_cancel_appointment",
    "lexia_omni_cancel_appointment_from_crm",
    "lexia_omni_update_appointment_attendance", "lexia_omni_record_lead_message",
  ]) {
    assert.match(functionBody(name), /p_occurred_at is not null, 'occurred_at_required'/, name);
  }
});

test("decisions use the database clock read after the locks", () => {
  const rpcSection = migration.split("-- Internal helpers")[1] ?? "";
  assert.doesNotMatch(rpcSection.replace(/default now\(\)/g, ""), /\bnow\(\)/);
  for (const name of [
    "lexia_omni_claim_outbound_action", "lexia_omni_claim_inbound_batch",
    "lexia_omni_expire_blocks", "lexia_omni_release_pending",
  ]) {
    const body = functionBody(name);
    const lock = body.indexOf("lexia_omni_lock_conversation(");
    const clock = body.indexOf("decision_at := clock_timestamp()");
    assert.ok(lock !== -1 && clock > lock, name);
  }
});

test("the inbound claim refuses while blocked and keeps the messages pending", () => {
  const claim = functionBody("lexia_omni_claim_inbound_batch");
  const blocked = claim.indexOf("'blocked'");
  assert.ok(blocked !== -1 && blocked < claim.indexOf("'window_open'"));
  assert.match(claim, /set disposition = 'pending'/);
});

test("cross references are validated and every new legacy column is guarded", () => {
  assert.match(functionBody("lexia_omni_finish_outbound_action"), /m\.omni_action_id = action_row\.id/);
  assert.match(functionBody("lexia_omni_store_context"), /context_source_scope_mismatch/);
  assert.match(functionBody("lexia_omni_record_message"), /omni_action_scope_mismatch/);
  const guard = functionBody("lexia_omni_guard_legacy_columns");
  for (const column of [
    "omni_conversation_id", "omni_author", "provider_message_id", "provider_timestamp", "omni_action_id",
    "lead_seq", "media_kind", "media_processing_status", "media_error_code", "block_key",
    "idempotency_key", "omni_resolution", "omni_resolved_at", "omni_resolved_by",
    "retomado_em", "retomado_por", "omni_account_id", "provider_contact_ref",
  ]) {
    assert.ok((guard.match(new RegExp(`new\\.${column}\\b`, "g")) ?? []).length >= 2, column);
  }
  assert.match(migration, /create trigger lexia_contactos_omni_columns_guard/);
});

test("the target must be declared and match the identity marker", () => {
  for (const [name, sql] of [["migration", migration], ["preflight", preflight], ["seed", seed], ["disable", disableDelivery], ["rollback", rollback]] as const) {
    assert.match(sql, /lexia\.target_project_ref/, name);
    assert.match(sql, /identity_ref is distinct from expected_ref or identity_env is distinct from expected_env/, name);
  }
});

test("the rollback drops functions before tables, explicitly and without CASCADE", () => {
  const code = rollback.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /cascade/i);
  assert.doesNotMatch(code, /like 'lexia/);
  const lastFunction = code.lastIndexOf("drop function");
  const firstTable = code.indexOf("drop table");
  assert.ok(lastFunction !== -1 && firstTable > lastFunction);
  for (const name of omniFunctions) assert.match(code, new RegExp(`drop function public\\.${name}\\(`), name);
  for (const table of createdTables) {
    assert.match(code, new RegExp(`exists \\(select 1 from public\\.${table}\\)`), table);
    assert.match(code, new RegExp(`drop table public\\.${table};`), table);
  }
});

test("the delivery claim enforces blocks, the single confirmation and the lead cutoff", () => {
  const claim = functionBody("lexia_omni_claim_outbound_action");
  const order = [
    "lexia_omni_lock_conversation",
    "'observe_only'",
    "'state_changed'",
    "'blocked'",
    "'appointment_cancelled'",
    "'appointment_started'",
    "'appointment_confirmation_already_sent'",
    "'superseded_by_new_message'",
    "status = 'claimed'",
  ].map((token) => claim.indexOf(token));
  for (const index of order) assert.notEqual(index, -1);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(claim, /b\.block_type = 'appointment'\s+and appointment_bound\s+and b\.source_ref = action_row\.source_ref/);
  assert.match(claim, /set confirmation_action_id = action_row\.id/);
  assert.match(migration, /lexia_outbound_actions_one_confirmation_key[\s\S]*?kind = 'appointment_confirmation'/);
  assert.match(functionBody("lexia_omni_prepare_outbound_actions"), /lead_cutoff_required_for_replies/);
  assert.match(functionBody("lexia_omni_prepare_outbound_retry"), /unknown_delivery_must_be_reconciled/);
});

test("the buffer claim keeps the debounce and supersede requires a newer lead message", () => {
  const claim = functionBody("lexia_omni_claim_inbound_batch");
  for (const reason of ["batch_in_progress", "empty", "newer_message_waiting", "window_open"]) {
    assert.match(claim, new RegExp(`'${reason}'`));
  }
  assert.match(migration, /lexia_inbound_batches_one_claimed_key[\s\S]*?where status = 'claimed'/);
  assert.match(functionBody("lexia_omni_supersede_inbound_batch"), /no_newer_lead_message/);
  const lead = functionBody("lexia_omni_record_lead_message");
  assert.match(lead, /'lead_message\.record'[\s\S]*?p_occurred_at, null, false/);
});

test("handoff resume is separate and blocks end one at a time", () => {
  const resolve = functionBody("lexia_omni_resolve_handoff");
  assert.match(resolve, /set status = mapped_status,[\s\S]*?omni_resolution = p_resolution/);
  assert.doesNotMatch(resolve, /update public\.lexia_conversation_blocks/);
  assert.doesNotMatch(resolve, /retomado_em\s*=/);
  assert.match(functionBody("lexia_omni_resume_handoff"), /handoff_row\.status not in \('resolvido', 'perdido'\)/);
  const end = functionBody("lexia_omni_end_block");
  assert.match(end, /handoff_requires_resume_command/);
  assert.match(end, /exceptional_reason_required/);
  assert.match(end, /and block_key = p_block_key/);
  assert.match(functionBody("lexia_omni_record_human_intervention"), /greatest\(existing\.expires_at, candidate\)/);
});

test("appointment cancellation and attendance never recreate or close pauses", () => {
  const cancel = functionBody("lexia_omni_cancel_appointment");
  assert.match(cancel, /attendance_status = 'cancelled'/);
  assert.match(cancel, /and status = 'active'/);
  assert.doesNotMatch(cancel, /insert into public\.lexia_conversation_blocks/);
  assert.doesNotMatch(cancel, /status = 'ended'/);

  const crmCancel = functionBody("lexia_omni_cancel_appointment_from_crm");
  assert.match(crmCancel, /cancelled_idempotency_key = coalesce\(cancelled_idempotency_key, p_command_id\)/);
  assert.match(crmCancel, /attendance_status = 'cancelled'/);
  assert.match(crmCancel, /and status = 'active'/);
  assert.doesNotMatch(crmCancel, /tool_invocation_id\s*=/);
  assert.doesNotMatch(crmCancel, /insert into public\.lexia_conversation_blocks/);
  assert.doesNotMatch(crmCancel, /status = 'ended'/);
  assert.match(crmCancellationFollowup, /lexia\.target_project_ref/);
  assert.match(crmCancellationFollowup, /lexia\.target_environment/);
  assert.match(crmCancellationFollowup, /grant execute[\s\S]*?to service_role/);
  assert.doesNotMatch(crmCancellationFollowup, /tool_invocation_id\s*=/);

  const attendance = functionBody("lexia_omni_update_appointment_attendance");
  assert.match(attendance, /p_attendance_status in \('attended', 'no_show'\)/);
  assert.match(attendance, /cancelled_appointment_has_no_attendance/);
  assert.match(attendance, /attendance_before_appointment_start/);
  assert.match(attendance, /attendance_status_conflict/);
  assert.doesNotMatch(attendance, /lexia_conversation_blocks/);
  assert.doesNotMatch(attendance, /paused_until_end/);
});

test("preflight and verify are read-only and fail on blockers", () => {
  for (const [name, sql] of [
    ["preflight", preflight],
    ["verify", verify],
    ["CRM follow-up preflight", crmCancellationPreflight],
  ] as const) {
    const outsideDo = sql.replace(/do \$\$[\s\S]*?\$\$;/g, "").replace(/--.*$/gm, "");
    assert.doesNotMatch(outsideDo, /\b(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/i, name);
    assert.match(sql, /raise exception/, name);
  }
  assert.match(crmCancellationPreflight, /count\(\*\) from public\.lexia_lote2_test_resources\) <> 10/);
  assert.match(crmCancellationPreflight, /run_id <> '25000000-0000-4000-8000-000000000001'/);
  assert.match(crmCancellationPreflight, /exists \(select 1 from public\.lexia_conversation_states\)/);
});

test("operations require an explicit environment and rollback refuses data loss", () => {
  assert.match(seed, /:'lexia_environment'/);
  assert.doesNotMatch(seed, /'(?:local|isolated_test|staging|production)', '/);
  assert.match(seed, /'miranda_skin_experts', 1, 'active',\s+'await_new_message', 900000, 60000, true/);
  assert.match(seed, /'detail_by_cordeiro', 1, 'active',[\s\S]*?:detail_buffer_window_ms, false/);
  assert.match(disableDelivery, /delivery_mode = 'observe_only', delivery_owner = 'v1'/);
  assert.match(rollback, /lexia\.lote2_rollback_confirm/);
  assert.match(functionBody("lexia_omni_prepare_outbound_actions"), /reminders_do_not_carry_lead_cutoff/);
  assert.match(rollback, /DESTROY_LOTE2_DATA/);
});

test("Lot 2 SQL files contain no destinations or credentials", () => {
  for (const sql of [migration, stateEventFollowup, preflight, verify, seed, disableDelivery, rollback]) {
    assert.doesNotMatch(sql, /https?:\/\//i);
    assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}/);
    assert.doesNotMatch(sql, /asteric/i);
  }
});
