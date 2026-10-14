import {
  ContractValidationError,
  type BrainReprocess,
  type BrainRequest,
  type BrainResult,
  type CanonicalMessage,
  type ContextResult,
  type ExecutedToolEffect,
  type JsonObject,
  type OmnichannelScope,
} from "./contracts";
import { assertContextResultOrigin } from "./operational-context";
import { assertContractSchema } from "./schema-validator";
import { assertSameScope, assertSingleScope } from "./scope";

export function buildBrainRequest(input: {
  invocationId: string;
  correlationId: string;
  scope: OmnichannelScope;
  state: BrainRequest["state"];
  messages: readonly CanonicalMessage[];
  contact: JsonObject;
  context: ContextResult;
  contextCallId: string;
  contextConfigVersion: string;
  policy: JsonObject;
  capabilities: readonly string[];
  reprocess?: BrainReprocess;
}): BrainRequest {
  assertSingleScope(input.scope, input.messages, "Brain message");
  assertContextResultOrigin(input.context, {
    scope: input.scope,
    contextCallId: input.contextCallId,
    configVersion: input.contextConfigVersion,
    sourceMessageIds: input.messages.map((message) => message.message_id),
  });

  return {
    schema_version: "lexia.brain.request.v1",
    invocation_id: input.invocationId,
    correlation_id: input.correlationId,
    scope: structuredClone(input.scope),
    state: structuredClone(input.state),
    messages: input.messages.map((message) => structuredClone(message)),
    contact: structuredClone(input.contact),
    operational_context: structuredClone(input.context.operational_context),
    company_fields: structuredClone(input.context.company_fields),
    policy: structuredClone(input.policy),
    capabilities: [...input.capabilities],
    ...(input.reprocess ? { reprocess: structuredClone(input.reprocess) } : {}),
  };
}

// Builds the reprocess block for a reply discarded by a newer lead message.
// Only tool operations with effects are carried; availability checks are not.
export function buildReprocessContext(input: {
  supersededResults: readonly BrainResult[];
  deliveredActionIds: readonly string[];
}): BrainReprocess {
  if (input.supersededResults.length === 0) {
    throw new ContractValidationError("Reprocess requires a superseded invocation.");
  }

  const executed: ExecutedToolEffect[] = [];
  for (const result of input.supersededResults) {
    for (const entry of result.tool_audit) {
      if (entry.result !== "succeeded" || entry.operation === "availability.check") continue;
      executed.push({
        tool_name: entry.tool_name,
        invocation_id: entry.invocation_id,
        operation: entry.operation,
        result: "succeeded",
        ...(entry.appointment_ref ? { appointment_ref: entry.appointment_ref } : {}),
      });
    }
  }

  return {
    superseded_invocation_ids: [
      ...new Set(input.supersededResults.map((result) => result.invocation_id)),
    ],
    delivered_action_ids: [...new Set(input.deliveredActionIds)],
    executed_tool_effects: executed,
  };
}

export function validateBrainResult(
  request: BrainRequest,
  result: BrainResult,
) {
  assertContractSchema("brain-result", result);
  if (
    result.schema_version !== "lexia.brain.result.v1" ||
    result.invocation_id !== request.invocation_id
  ) {
    throw new ContractValidationError("Brain result invocation is invalid.");
  }
  if (
    result.captured_state.state_version !== request.state.state_version ||
    result.captured_state.delivery_epoch !== request.state.delivery_epoch
  ) {
    throw new ContractValidationError("Brain result captured state is invalid.");
  }

  const actionIds = new Set<string>();
  for (const action of result.actions) {
    assertSameScope(request.scope, action.scope, "Brain action");
    if (action.invocation_id !== request.invocation_id) {
      throw new ContractValidationError("Brain action invocation is invalid.");
    }
    if (
      action.captured_state.state_version !== request.state.state_version ||
      action.captured_state.delivery_epoch !== request.state.delivery_epoch
    ) {
      throw new ContractValidationError("Brain action captured state is invalid.");
    }
    if (actionIds.has(action.action_id)) {
      throw new ContractValidationError("Brain action IDs must be unique.");
    }
    if (request.reprocess?.delivered_action_ids.includes(action.action_id)) {
      throw new ContractValidationError("Brain action was already delivered.");
    }
    actionIds.add(action.action_id);
  }

  const confirmations = result.actions.filter(
    (action) => action.kind === "appointment_confirmation",
  );
  if (confirmations.length > 1) {
    throw new ContractValidationError("Only one appointment confirmation is allowed.");
  }
  const confirmation = confirmations[0];
  if (confirmation) {
    const lastSequence = Math.max(...result.actions.map((action) => action.sequence));
    if (confirmation.sequence !== lastSequence) {
      throw new ContractValidationError("Appointment confirmation must be the final action.");
    }
    const ref = confirmation.source_ref;
    const createdNow = result.domain_events.some(
      (event) =>
        event.type === "appointment.confirmed" && event.appointment.appointment_ref === ref,
    );
    const createdBeforeReprocess = request.reprocess?.executed_tool_effects.some(
      (effect) => effect.operation === "appointment.create" && effect.appointment_ref === ref,
    );
    if (!ref || (!createdNow && !createdBeforeReprocess)) {
      throw new ContractValidationError(
        "Appointment confirmation must be bound to a tool-created appointment.",
      );
    }
  }

  for (const event of result.domain_events) {
    if (
      event.invocation_id !== request.invocation_id ||
      !request.capabilities.includes(event.type)
    ) {
      throw new ContractValidationError("Brain domain event is not allowed.");
    }

    if (
      event.type === "appointment.confirmed" ||
      event.type === "appointment.cancelled"
    ) {
      const toolInvocationId = event.appointment.tool_invocation_id;
      const expectedOperation =
        event.type === "appointment.confirmed"
          ? "appointment.create"
          : "appointment.cancel";
      const attested = result.tool_audit.some(
        (entry) =>
          entry.invocation_id === toolInvocationId &&
          entry.operation === expectedOperation &&
          entry.result === "succeeded" &&
          entry.appointment_ref === event.appointment.appointment_ref,
      );
      if (!attested) {
        throw new ContractValidationError(
          "Appointment event requires a matching successful tool operation and result.",
        );
      }

      if (
        event.type === "appointment.confirmed" &&
        Date.parse(event.appointment.ends_at) <=
          Date.parse(event.appointment.starts_at)
      ) {
        throw new ContractValidationError(
          "Confirmed appointment end must be after its start.",
        );
      }
    }
  }

  return structuredClone(result);
}
