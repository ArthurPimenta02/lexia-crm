import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test, { before } from "node:test";

import type { MasterStore } from "../lib/omnichannel/master-runtime";
import { buildWorkflows, WORKFLOW_PREFIX, type WorkflowBuild } from "../n8n/omnichannel-test/build";
import { LocalN8nExecutor } from "../n8n/omnichannel-test/local-executor";

// Runs the generated n8n JSON workflows end to end with the local executor:
// scenario runner -> master -> sub-workflows -> fake brain/provider. No
// network, credential, model or provider is used.

const dir = join(process.cwd(), "n8n", "omnichannel-test", "workflows");
const files = readdirSync(dir).filter((file) => file !== "manifest.json");
const workflows = files.map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")));

type Report = {
  results: Array<{ scenario_id: string; result: Record<string, unknown> }>;
  final: Record<string, MasterStore>;
};

let report: Report;
let executor: LocalN8nExecutor;

before(async () => {
  executor = new LocalN8nExecutor(workflows);
  const output = await executor.run(`${WORKFLOW_PREFIX} - Scenario Runner`);
  report = output[0]!.json as unknown as Report;
});

function results(id: string) {
  return report.results.filter((entry) => entry.scenario_id === id).map((entry) => entry.result);
}
function store(id: string) {
  return report.final[id]!;
}
function sent(id: string, conversation?: string) {
  return store(id).provider_log
    .filter((entry) => !conversation || entry.conversation_key.includes(conversation))
    .map((entry) => [entry.text, entry.outcome]);
}
function brainCalls(id: string, conversation: string) {
  return store(id).brain_calls.filter((call) => call.conversation_key.includes(conversation));
}

test("committed workflow JSON matches the generator and stays inactive without services", async () => {
  const built: WorkflowBuild[] = await buildWorkflows();
  assert.equal(built.length, files.length);
  for (const entry of built) {
    const committed = JSON.parse(readFileSync(join(dir, entry.file), "utf8"));
    assert.deepEqual(committed, JSON.parse(JSON.stringify(entry.workflow)), `${entry.file} is stale: run npx tsx n8n/omnichannel-test/generate.ts`);
  }
  const allowed = new Set([
    "n8n-nodes-base.manualTrigger",
    "n8n-nodes-base.executeWorkflowTrigger",
    "n8n-nodes-base.code",
    "n8n-nodes-base.if",
    "n8n-nodes-base.executeWorkflow",
    "n8n-nodes-base.splitInBatches",
  ]);
  for (const workflow of workflows) {
    assert.equal(workflow.active, false, workflow.name);
    assert.match(workflow.name, /^OMNI v2 TEST - /);
    for (const node of workflow.nodes) assert.ok(allowed.has(node.type), `${workflow.name}/${node.name}: ${node.type}`);
    const raw = JSON.stringify(workflow);
    assert.doesNotMatch(raw, /"credentials"\s*:/);
    const urls = raw.match(/https?:\/\/[^"'\\\s]+/g) ?? [];
    assert.deepEqual(
      urls.filter((url) => url !== "https://json-schema.org/draft/2020-12/schema" && !url.startsWith("https://contracts.uselexia.invalid/")),
      [],
    );
    assert.doesNotMatch(raw, /miranda|detail_by_cordeiro|asteric/i);
  }
});

test("each step runs in its own node and sub-workflow", () => {
  const executed = new Set(executor.log.map((entry) => `${entry.workflow} :: ${entry.node}`));
  for (const expected of [
    "Master :: Route Event",
    "Ingress :: Adapter Ingress And Trusted Scope",
    "Ingress :: Persist, Authorship And Intervention",
    "Conversation Turn :: Buffer Claim (Owner And Cutoff)",
    "Conversation Turn :: History And Company Context",
    "Conversation Turn :: Build Brain Request",
    "Brain Fake :: Private Brain And Tools (Fake)",
    "Conversation Turn :: Validate And Apply Brain Result",
    "Delivery :: Claim Next Action (Gate)",
    "Provider Send Fake :: Fake Provider (No Network)",
    "Delivery :: Record Delivery Result",
    "Conversation Turn :: Finish Batch Or Supersede",
    "Conversation Turn :: Close Batch Without Brain",
    "Conversation Turn :: Buffer Not Claimed",
    "Automation :: Register Automation Request",
    "Recovery :: Reconcile Or Retry",
    "State Command :: Apply State Command",
  ]) {
    assert.ok(executed.has(`${WORKFLOW_PREFIX} - ${expected}`), expected);
  }
});

test("the brain and the provider receive only their contracts, never the store", () => {
  const triggers = (name: string) =>
    executor.log.filter((entry) => entry.workflow === `${WORKFLOW_PREFIX} - ${name}` && entry.type === "n8n-nodes-base.executeWorkflowTrigger");
  assert.ok(triggers("Brain Fake").length > 0);
  for (const entry of triggers("Brain Fake")) assert.deepEqual(entry.input_keys, ["brain_call"]);
  for (const entry of triggers("Provider Send Fake")) assert.deepEqual(entry.input_keys, ["provider_call"]);
});

test("pause enabled: one tool-bound confirmation, block until the end, reminders and other blocks", () => {
  const steps = results("pause_on_booking");
  assert.deepEqual(sent("pause_on_booking", "whatsapp"), [
    ["Agendamento confirmado (sintético).", "sent"],
    ["Lembrete sintético 1", "sent"],
  ]);
  assert.equal(brainCalls("pause_on_booking", "whatsapp").length, 1);
  assert.deepEqual(steps[3]?.turn, { not_claimed: "blocked" });
  assert.deepEqual((steps[6]?.delivery as { statuses: string[] }).statuses, ["suppressed"]);
  // The same lead on the company's Messenger account is not paused.
  assert.deepEqual(sent("pause_on_booking", "messenger"), [["Resposta sintética.", "sent"]]);
  const whatsapp = Object.values(store("pause_on_booking").conversations).find((c) => c.scope.channel === "whatsapp")!;
  assert.equal(whatsapp.state.appointments[0]?.pausedUntilEnd, true);
  assert.equal(whatsapp.buffer.pending.length, 1);
});

test("pause disabled: reply and confirmation go out, no block; reminder only before start", () => {
  const steps = results("pause_off_booking");
  assert.deepEqual(sent("pause_off_booking"), [
    ["Perfeito!", "sent"],
    ["Confirmado (sintético).", "sent"],
    ["Claro, posso ajudar.", "sent"],
    ["Lembrete sintético 3", "sent"],
  ]);
  assert.deepEqual({ route: steps[5]?.route, reason: steps[5]?.reason }, { route: "rejected", reason: "appointment_not_remindable" });
  const conversation = Object.values(store("pause_off_booking").conversations)[0]!;
  assert.equal(conversation.state.appointments[0]?.pausedUntilEnd, false);
  assert.equal(conversation.state.blocks.length, 0);
});

test("intervention during the buffer: the brain is never called and team audio failure keeps message and pause", () => {
  const steps = results("intervention_during_buffer");
  assert.deepEqual(steps[2]?.turn, { not_claimed: "blocked" });
  const calls = brainCalls("intervention_during_buffer", "lead-a-002");
  assert.equal(calls.length, 1);
  const final = store("intervention_during_buffer");
  const audio = final.messages.find((message) => message.message_id === "msg-c3")!;
  assert.equal(audio.author, "human_agent");
  assert.equal(audio.media?.processing_status, "failed");
  // await_new_message: the later batch contains only the new lead message.
  const request = final.invocations[calls[0]!.invocation_id]!.request!;
  assert.deepEqual(request.messages.map((message) => message.message_id), ["msg-c4"]);
  assert.ok(final.messages.some((message) => message.message_id === "msg-c1"));
});

test("intervention during generation: tool effect kept, stale reply suppressed", () => {
  assert.deepEqual(sent("intervention_during_generation"), []);
  const final = store("intervention_during_generation");
  assert.equal(final.tool_effects.length, 1);
  const conversation = Object.values(final.conversations)[0]!;
  assert.equal(conversation.state.appointments.length, 1);
  assert.ok(Object.values(conversation.ledger.entries).every((entry) => entry.reason === "state_changed" || entry.reason === "plan_interrupted"));
});

test("new lead message before send: unsent remainder discarded, batch reprocessed without repeating effects", () => {
  assert.deepEqual(sent("new_message_before_send"), [
    ["Bolha 1", "sent"],
    ["Bolha nova considerando tudo", "sent"],
    ["Confirmação única", "sent"],
  ]);
  const final = store("new_message_before_send");
  assert.equal(final.tool_effects.filter((effect) => effect.appointment_ref === "appt-b-r").length, 1);
  const calls = brainCalls("new_message_before_send", "lead-b-004");
  assert.deepEqual(calls.map((call) => call.reprocess), [false, true]);
  const second = final.invocations[calls[1]!.invocation_id]!.request!;
  assert.deepEqual(second.messages.map((message) => message.message_id), ["msg-e1", "msg-e2"]);
  assert.equal(second.reprocess?.delivered_action_ids.length, 1);
  assert.equal(second.reprocess?.executed_tool_effects[0]?.appointment_ref, "appt-b-r");
  assert.equal(final.invocations[calls[0]!.invocation_id]!.status, "superseded");
});

test("partial delivery: failure stops the plan; retry resumes without repeating the sent bubble", () => {
  assert.deepEqual(sent("partial_delivery_failure"), [["P1", "sent"], ["P2", "failed"], ["P2", "sent"], ["P3", "sent"]]);
  const steps = results("partial_delivery_failure");
  assert.deepEqual(((steps[1]?.turn as { delivery: { statuses: string[] } }).delivery).statuses, ["sent", "failed", "prepared"]);
});

test("cancellation keeps the pause and denies reminders; manual removal ends only that block", () => {
  const steps = results("cancellation_keeps_pause");
  assert.equal(steps[3]?.reason, "appointment_not_remindable");
  assert.deepEqual(steps[5]?.turn, { not_claimed: "blocked" });
  assert.deepEqual(sent("cancellation_keeps_pause"), [["Confirmado.", "sent"], ["Resposta sintética.", "sent"]]);
});

test("manual removal keeps reminders only before the appointment starts", () => {
  const steps = results("manual_removal_reminders");
  assert.deepEqual(sent("manual_removal_reminders"), [["Confirmado.", "sent"], ["Lembrete sintético 6", "sent"]]);
  assert.equal(steps[4]?.reason, "appointment_not_remindable");
});

test("timeout and duplicates: uncertain result is never retried blindly; duplicates do not repeat effects", () => {
  const steps = results("timeout_and_duplicates");
  assert.equal((steps[1]?.ingest as { route: string }).route, "duplicate");
  assert.deepEqual(steps[2]?.turn, { not_claimed: "newer_message_waiting" });
  assert.equal(steps[4]?.reason, "unknown_delivery_must_be_reconciled");
  assert.deepEqual((steps[5]?.delivery as { statuses: string[] }).statuses, ["sent"]);
  assert.equal(steps[6]?.reason, "only_deterministic_failure_can_be_retried");
  assert.equal((steps[7]?.ingest as { route: string }).route, "ai_echo");
  assert.deepEqual(sent("timeout_and_duplicates"), [["T1", "timeout"]]);
  const final = store("timeout_and_duplicates");
  assert.equal(final.messages.filter((message) => message.message_id === "msg-i1").length, 1);
  assert.equal(Object.values(final.conversations)[0]!.state.blocks.length, 0);
});

test("isolation: forged tenant rejected, missing config fails closed, policy changed only by Lexia admin", () => {
  const steps = results("isolation_and_policy");
  assert.equal((steps[0]?.ingest as { reason: string }).reason, "tenant_mismatch");
  assert.deepEqual(steps[2]?.turn, { closed: "context_config_unavailable" });
  assert.equal(brainCalls("isolation_and_policy", "empresa_sintetica_c").length, 0);
  assert.ok(store("isolation_and_policy").messages.some((message) => message.message_id === "msg-j2"));
  assert.equal((steps[3]?.command_result as { reason: string }).reason, "lexia_admin_required");
  assert.equal((steps[4]?.command_result as { reason: string }).reason, "forbidden");
  assert.equal((steps[5]?.command_result as { ok: boolean }).ok, true);
  assert.equal((steps[6]?.command_result as { ok: boolean }).ok, true);
  // B now pauses after booking: only the confirmation goes out.
  assert.deepEqual(sent("isolation_and_policy"), [["Confirmado B.", "sent"]]);
  const final = store("isolation_and_policy");
  const keys = Object.keys(final.conversations);
  assert.ok(keys.every((key) => !key.includes("empresa_sintetica_a")));
});

test("handoff from the brain blocks delivery; resolving does not resume; explicit resume does", () => {
  const steps = results("handoff_requires_resume");
  assert.deepEqual(((steps[1]?.turn as { delivery: { statuses: string[] } }).delivery).statuses, ["suppressed"]);
  assert.equal((steps[2]?.ingest as { route: string }).route, "pending");
  assert.equal((steps[3]?.command_result as { ok: boolean }).ok, true);
  assert.deepEqual(steps[4]?.turn, { not_claimed: "blocked" });
  assert.equal((steps[5]?.command_result as { ok: boolean }).ok, true);
  assert.deepEqual(sent("handoff_requires_resume"), [["De volta com a IA.", "sent"]]);
  const conversation = Object.values(store("handoff_requires_resume").conversations)[0]!;
  assert.equal(conversation.state.handoffs[0]?.status, "resumed");
});
