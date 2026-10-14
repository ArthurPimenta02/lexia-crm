import {
  ContractValidationError,
  type OmnichannelChannel,
  type OmnichannelEnvironment,
  type OmnichannelScope,
} from "./contracts";

const environments = new Set<OmnichannelEnvironment>([
  "local",
  "isolated_test",
  "staging",
  "production",
]);

const channels = new Set<OmnichannelChannel>([
  "whatsapp",
  "instagram",
  "messenger",
]);

const slugPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireBoundedString(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new ContractValidationError(`${field} is invalid.`);
  }

  return value;
}

export function validateScope(scope: OmnichannelScope): OmnichannelScope {
  if (!environments.has(scope.environment)) {
    throw new ContractValidationError("scope.environment is invalid.");
  }

  if (!channels.has(scope.channel)) {
    throw new ContractValidationError("scope.channel is invalid.");
  }

  if (!slugPattern.test(scope.cliente_slug)) {
    throw new ContractValidationError("scope.cliente_slug is invalid.");
  }

  if (!uuidPattern.test(scope.account_ref)) {
    throw new ContractValidationError("scope.account_ref is invalid.");
  }

  requireBoundedString(scope.conversation_ref, "scope.conversation_ref", 256);

  return { ...scope };
}

export function serializeScope(scope: OmnichannelScope) {
  const valid = validateScope(scope);

  return JSON.stringify([
    valid.environment,
    valid.cliente_slug,
    valid.channel,
    valid.account_ref,
    valid.conversation_ref,
  ]);
}

export function sameScope(left: OmnichannelScope, right: OmnichannelScope) {
  return serializeScope(left) === serializeScope(right);
}

export function assertSameScope(
  expected: OmnichannelScope,
  actual: OmnichannelScope,
  label = "record",
) {
  if (!sameScope(expected, actual)) {
    throw new ContractValidationError(`${label} belongs to another scope.`);
  }
}

export function assertSingleScope(
  expected: OmnichannelScope,
  records: ReadonlyArray<{ scope: OmnichannelScope }>,
  label: string,
) {
  for (const record of records) {
    assertSameScope(expected, record.scope, label);
  }
}
