import type { ContextAgentInput } from "./context-config";
import {
  ContractValidationError,
  type ContextResult,
  type OmnichannelScope,
} from "./contracts";
import { assertContractSchema, assertJsonSchemaValue } from "./schema-validator";
import { assertSameScope } from "./scope";

export type ContextResultOrigin = {
  scope: OmnichannelScope;
  contextCallId: string;
  configVersion: string;
  sourceMessageIds: readonly string[];
};

function assertExactSourceMessages(
  actual: readonly string[],
  expected: readonly string[],
) {
  if (
    actual.length !== expected.length ||
    actual.some((messageId, index) => messageId !== expected[index])
  ) {
    throw new ContractValidationError(
      "Context result source messages do not match the context call.",
    );
  }
}

export function assertContextResultOrigin(
  result: ContextResult,
  origin: ContextResultOrigin,
) {
  assertContractSchema("context-result", result);
  assertSameScope(origin.scope, result.scope, "Context result");

  if (result.context_call_id !== origin.contextCallId) {
    throw new ContractValidationError(
      "Context result belongs to another context call.",
    );
  }
  if (result.config_version !== origin.configVersion) {
    throw new ContractValidationError(
      "Context result configuration version is invalid.",
    );
  }

  assertExactSourceMessages(result.source_message_ids, origin.sourceMessageIds);
}

export function validateContextResult(
  result: ContextResult,
  input: ContextAgentInput,
) {
  assertContextResultOrigin(result, {
    scope: input.scope,
    contextCallId: input.context_call_id,
    configVersion: input.config_version,
    sourceMessageIds: input.messages.map((message) => message.message_id),
  });

  assertJsonSchemaValue(
    input.company_fields_schema,
    result.company_fields,
    "company_fields",
  );

  return structuredClone(result);
}
