import {
  ContractValidationError,
  type AutomationRequest,
} from "./contracts";
import { assertContractSchema } from "./schema-validator";
import { assertSameScope } from "./scope";

export function validateAutomationRequest(request: AutomationRequest) {
  assertContractSchema("automation-request", request);

  for (const action of request.proposed_actions) {
    assertSameScope(request.scope, action.scope, "Automation action");
    if (request.kind !== action.kind) {
      throw new ContractValidationError("Automation kind does not match its action.");
    }
    if (action.source_ref !== request.source_ref) {
      throw new ContractValidationError("Automation source reference is invalid.");
    }
  }

  return structuredClone(request);
}
