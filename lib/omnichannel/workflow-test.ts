import type {
  JsonObject,
  WorkflowTestRequest,
  WorkflowTestResult,
  WorkflowTestTarget,
  WorkflowTestTraceStep,
} from "./contracts";
import { ContractValidationError } from "./contracts";
import { assertContractSchema } from "./schema-validator";

export const WORKFLOW_TEST_TRACE_PLANS: Record<
  WorkflowTestTarget,
  WorkflowTestTraceStep[]
> = {
  omnichannel: [
    { step: "validate_test_contract", status: "passed" },
    { step: "resolve_trusted_scope", status: "simulated" },
    { step: "record_message_before_pause", status: "simulated" },
    { step: "deduplicate_event", status: "simulated" },
    { step: "apply_human_intervention_before_media", status: "simulated" },
    { step: "load_company_context", status: "simulated" },
    { step: "invoke_brain_contract", status: "simulated" },
    { step: "revalidate_before_each_action", status: "passed" },
    {
      step: "provider_send",
      status: "blocked",
      reason: "delivery_mode_simulate",
    },
    { step: "emit_crm_events", status: "simulated" },
  ],
  brain: [
    { step: "validate_brain_request", status: "simulated" },
    { step: "isolate_private_memory", status: "simulated" },
    { step: "run_private_tools", status: "simulated" },
    { step: "return_proposed_actions_and_events", status: "simulated" },
    {
      step: "provider_send",
      status: "blocked",
      reason: "brain_has_no_provider_credential",
    },
  ],
  followup: [
    { step: "load_due_followup", status: "simulated" },
    { step: "build_automation_request", status: "simulated" },
    { step: "image_action_contract_ready", status: "passed" },
    { step: "revalidate_before_each_action", status: "passed" },
    {
      step: "provider_send",
      status: "blocked",
      reason: "delivery_mode_simulate",
    },
  ],
  reminder: [
    { step: "load_due_reminder", status: "simulated" },
    { step: "check_confirmed_not_cancelled_appointment", status: "simulated" },
    { step: "revalidate_before_each_action", status: "passed" },
    {
      step: "provider_send",
      status: "blocked",
      reason: "delivery_mode_simulate",
    },
  ],
  create_appointment: [
    { step: "validate_tool_request", status: "simulated" },
    { step: "create_calendar_event", status: "simulated" },
    { step: "build_attested_appointment_event", status: "simulated" },
    { step: "apply_appointment_pause_policy", status: "simulated" },
    {
      step: "provider_send",
      status: "blocked",
      reason: "tool_has_no_provider_credential",
    },
  ],
  check_availability: [
    { step: "validate_tool_request", status: "simulated" },
    { step: "query_calendar_slots", status: "simulated" },
    { step: "return_availability_only", status: "passed" },
    {
      step: "appointment_confirmed_event",
      status: "blocked",
      reason: "availability_is_not_appointment_creation",
    },
  ],
};

export function assertSafeWorkflowTestRequest(
  value: unknown,
): WorkflowTestRequest {
  assertContractSchema("workflow-test-request", value);
  const request = value as WorkflowTestRequest;
  const expectedConversation = `test:${request.run_id}`;
  const expectedMessage = `test-message:${request.run_id}`;
  if (request.scope.conversation_ref !== expectedConversation) {
    throw new ContractValidationError(
      "workflow-test-request conversation_ref is not bound to run_id.",
    );
  }
  if (request.input.message_id !== expectedMessage) {
    throw new ContractValidationError(
      "workflow-test-request message_id is not bound to run_id.",
    );
  }
  if (
    request.execution_mode === "safe_simulation" &&
    request.tool_policy.calendar !== "disabled"
  ) {
    throw new ContractValidationError(
      "safe workflow simulation cannot authorize Calendar access.",
    );
  }
  if (
    request.execution_mode === "full_agent_virtual" &&
    request.scope.environment !== "isolated_test"
  ) {
    throw new ContractValidationError(
      "full agent virtual tests are restricted to isolated_test.",
    );
  }
  return structuredClone(request);
}

export function workflowTestOutputFor(target: WorkflowTestTarget): JsonObject {
  if (target === "omnichannel") {
    return {
      crm_event_types: [
        "contact.upserted",
        "conversation.opened",
        "message.recorded",
        "conversation.context.updated",
        "message.delivery.updated",
      ],
      delivery: { mode: "simulate", status: "suppressed" },
      followup_image: { contract_ready: true, enabled: false },
    };
  }
  if (target === "brain") {
    return {
      decision: "reply",
      proposed_actions: 1,
      provider_access: false,
      tool_events_attested: "simulated_only",
    };
  }
  if (target === "followup") {
    return {
      automation_kind: "followup",
      proposed_actions: [{ type: "text" }],
      image_action_contract_ready: true,
      image_delivery_enabled: false,
    };
  }
  if (target === "reminder") {
    return {
      automation_kind: "appointment_reminder",
      cancelled_appointment_reminder_allowed: false,
    };
  }
  if (target === "create_appointment") {
    return {
      domain_event: "appointment.confirmed",
      provenance: "simulated_tool_result",
      provider_access: false,
    };
  }
  return {
    slots: ["synthetic-slot-1", "synthetic-slot-2"],
    appointment_confirmed_emitted: false,
  };
}

export function simulateWorkflowTest(value: unknown): WorkflowTestResult {
  const request = assertSafeWorkflowTestRequest(value);
  const result: WorkflowTestResult = {
    schema_version: "lexia.workflow.test.result.v1",
    run_id: request.run_id,
    target: request.target,
    status: "completed",
    provider_send_attempted: false,
    summary: `Teste sintético ${request.target} concluído sem envio externo.`,
    trace: structuredClone(WORKFLOW_TEST_TRACE_PLANS[request.target]),
    output: workflowTestOutputFor(request.target),
  };
  assertContractSchema("workflow-test-result", result);
  return result;
}

export function assertWorkflowTestResult(
  requestValue: unknown,
  resultValue: unknown,
): WorkflowTestResult {
  const request = assertSafeWorkflowTestRequest(requestValue);
  assertContractSchema("workflow-test-result", resultValue);
  const result = resultValue as WorkflowTestResult;
  if (result.run_id !== request.run_id) {
    throw new ContractValidationError(
      "workflow-test-result run_id does not match the request.",
    );
  }
  if (result.target !== request.target) {
    throw new ContractValidationError(
      "workflow-test-result target does not match the request.",
    );
  }
  if (result.provider_send_attempted !== false) {
    throw new ContractValidationError(
      "workflow-test-result indicates a provider send attempt.",
    );
  }
  return structuredClone(result);
}
