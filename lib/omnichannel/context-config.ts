import {
  type CanonicalMessage,
  type ContextAgentConfig,
  type JsonValue,
  type OmnichannelScope,
} from "./contracts";
import { assertSameScope, assertSingleScope, validateScope } from "./scope";

export class ContextConfigurationUnavailableError extends Error {
  readonly code = "context_config_unavailable";

  constructor(message = "Context configuration is unavailable.") {
    super(message);
    this.name = "ContextConfigurationUnavailableError";
  }
}

export type ContextMemoryEntry = {
  scope: OmnichannelScope;
  key: string;
  value: JsonValue;
};

export type ContextAgentInput = {
  schema_version: "lexia.context.agent.input.v1";
  scope: OmnichannelScope;
  context_call_id: string;
  config_version: string;
  prompt_template: string;
  common_schema_version: "lexia.context.result.v1";
  company_fields_schema: ContextAgentConfig["company_fields_schema"];
  locale: string;
  timezone: string;
  model_policy_ref: string;
  messages: CanonicalMessage[];
  memory: ContextMemoryEntry[];
};

function matchesTenant(
  config: ContextAgentConfig,
  scope: OmnichannelScope,
) {
  return (
    config.environment === scope.environment &&
    config.cliente_slug === scope.cliente_slug
  );
}

function validateResolvedConfig(
  config: ContextAgentConfig,
  scope: OmnichannelScope,
) {
  if (!matchesTenant(config, scope) || config.status !== "active") {
    throw new ContextConfigurationUnavailableError();
  }

  if (
    config.schema_version !== "lexia.context.agent.config.v1" ||
    config.common_schema_version !== "lexia.context.result.v1" ||
    config.config_version.trim().length === 0 ||
    config.prompt_template.trim().length === 0 ||
    config.prompt_template.length > 20_000 ||
    config.locale.trim().length === 0 ||
    config.timezone.trim().length === 0 ||
    config.model_policy_ref.trim().length === 0
  ) {
    throw new ContextConfigurationUnavailableError(
      "Context configuration is invalid.",
    );
  }

  return structuredClone(config);
}

export class SimulatedCentralContextConfigStore {
  readonly lookups: Array<{
    environment: OmnichannelScope["environment"];
    cliente_slug: string;
  }> = [];

  constructor(private readonly configs: readonly ContextAgentConfig[]) {}

  async getActiveForScope(scope: OmnichannelScope) {
    validateScope(scope);
    this.lookups.push({
      environment: scope.environment,
      cliente_slug: scope.cliente_slug,
    });

    const matches = this.configs.filter(
      (config) => matchesTenant(config, scope) && config.status === "active",
    );

    if (matches.length !== 1) {
      throw new ContextConfigurationUnavailableError();
    }

    return validateResolvedConfig(matches[0], scope);
  }
}

export function buildGenericContextAgentSet(input: {
  scope: OmnichannelScope;
  contextCallId: string;
  config: ContextAgentConfig;
  messages: readonly CanonicalMessage[];
  memory: readonly ContextMemoryEntry[];
}): ContextAgentInput {
  const scope = validateScope(input.scope);
  const config = validateResolvedConfig(input.config, scope);
  if (!input.contextCallId.trim()) {
    throw new ContextConfigurationUnavailableError(
      "Context call identifier is invalid.",
    );
  }

  assertSingleScope(scope, input.messages, "Context message");
  assertSingleScope(scope, input.memory, "Context memory");

  return {
      schema_version: "lexia.context.agent.input.v1",
      scope,
      context_call_id: input.contextCallId,
    config_version: config.config_version,
    prompt_template: config.prompt_template,
    common_schema_version: config.common_schema_version,
    company_fields_schema: structuredClone(config.company_fields_schema),
    locale: config.locale,
    timezone: config.timezone,
    model_policy_ref: config.model_policy_ref,
    messages: input.messages.map((message) => structuredClone(message)),
    memory: input.memory.map((entry) => structuredClone(entry)),
  };
}

export async function prepareContextAgentCall(input: {
  scope: OmnichannelScope;
  contextCallId: string;
  store: SimulatedCentralContextConfigStore;
  messages: readonly CanonicalMessage[];
  memory: readonly ContextMemoryEntry[];
}) {
  for (const message of input.messages) {
    assertSameScope(input.scope, message.scope, "Context message");
  }

  const config = await input.store.getActiveForScope(input.scope);

  return buildGenericContextAgentSet({
      config,
      contextCallId: input.contextCallId,
    memory: input.memory,
    messages: input.messages,
    scope: input.scope,
  });
}

export async function runSimulatedContextStage<T>(input: {
  scope: OmnichannelScope;
  contextCallId: string;
  store: SimulatedCentralContextConfigStore;
  messages: readonly CanonicalMessage[];
  memory: readonly ContextMemoryEntry[];
  invoke: (prepared: ContextAgentInput) => Promise<T>;
}) {
  const prepared = await prepareContextAgentCall(input);
  return input.invoke(prepared);
}
