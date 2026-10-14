import assert from "node:assert/strict";
import test from "node:test";

import { ContractValidationError } from "../lib/omnichannel/contracts";
import {
  assertSafeWorkflowTestRequest,
  assertWorkflowTestResult,
  simulateWorkflowTest,
} from "../lib/omnichannel/workflow-test";

function request(target = "omnichannel") {
  const runId = "aaaaaaaa-0000-4000-8000-000000000901";
  return {
    schema_version: "lexia.workflow.test.request.v1",
    run_id: runId,
    target,
    delivery_mode: "simulate",
    execution_mode: "safe_simulation",
    tool_policy: { calendar: "disabled" },
    scope: {
      environment: "isolated_test",
      cliente_slug: "miranda_sintetica",
      channel: "whatsapp",
      account_ref: "aaaaaaaa-0000-4000-8000-000000000902",
      conversation_ref: `test:${runId}`,
    },
    input: {
      message_id: `test-message:${runId}`,
      type: "text",
      text: "Mensagem totalmente sintética.",
    },
    expectations: {
      provider_send: false,
      persist_synthetic_events: true,
      return_trace: true,
    },
  };
}

test("workflow tests fail closed outside synthetic non-production scope", () => {
  const production = request();
  production.scope.environment = "production";
  assert.throws(
    () => assertSafeWorkflowTestRequest(production),
    ContractValidationError,
  );

  const realConversation = request();
  realConversation.scope.conversation_ref = "provider-conversation-123";
  assert.throws(
    () => assertSafeWorkflowTestRequest(realConversation),
    /bound to run_id|pattern/,
  );

  const providerSend = request();
  providerSend.expectations.provider_send = true;
  assert.throws(
    () => assertSafeWorkflowTestRequest(providerSend),
    ContractValidationError,
  );
});

test("only full isolated tests may authorize a test Calendar", () => {
  const safe = request();
  safe.tool_policy.calendar = "test_read_only";
  assert.throws(() => assertSafeWorkflowTestRequest(safe), /cannot authorize Calendar/);

  const full = request();
  full.execution_mode = "full_agent_virtual";
  full.tool_policy.calendar = "test_read_write";
  assert.doesNotThrow(() => assertSafeWorkflowTestRequest(full));

  full.scope.environment = "staging";
  assert.throws(() => assertSafeWorkflowTestRequest(full), /restricted to isolated_test/);
});

test("every Miranda target produces a correlated result with provider send blocked", () => {
  for (const target of [
    "omnichannel",
    "brain",
    "followup",
    "reminder",
    "create_appointment",
    "check_availability",
  ]) {
    const source = request(target);
    const result = simulateWorkflowTest(source);
    assert.equal(result.target, target);
    assert.equal(result.run_id, source.run_id);
    assert.equal(result.provider_send_attempted, false);
    assert.equal(result.status, "completed");
    assert.ok(result.trace.length > 0);
    assert.doesNotThrow(() => assertWorkflowTestResult(source, result));
  }
});

test("Frappe cannot accept a result from another run or workflow target", () => {
  const source = request("omnichannel");
  const wrongTarget = simulateWorkflowTest(request("brain"));
  assert.throws(
    () => assertWorkflowTestResult(source, wrongTarget),
    /target does not match/,
  );

  const wrongRun = simulateWorkflowTest(source);
  wrongRun.run_id = "bbbbbbbb-0000-4000-8000-000000000901";
  assert.throws(
    () => assertWorkflowTestResult(source, wrongRun),
    /run_id does not match/,
  );
});

test("follow-up image support is explicit but remains disabled", () => {
  const result = simulateWorkflowTest(request("followup"));
  assert.deepEqual(result.output?.followup_image, undefined);
  assert.equal(result.output?.image_action_contract_ready, true);
  assert.equal(result.output?.image_delivery_enabled, false);
});

test("availability cannot masquerade as appointment creation", () => {
  const result = simulateWorkflowTest(request("check_availability"));
  assert.equal(result.output?.appointment_confirmed_emitted, false);
  assert.ok(
    result.trace.some(
      (step) =>
        step.step === "appointment_confirmed_event" &&
        step.status === "blocked",
    ),
  );
});
