import type { OmnichannelEnvironment, OmnichannelScope } from "./contracts";
import { validateScope } from "./scope";

export type ResumeMode = "await_new_message" | "answer_pending";

export type OmnichannelPolicy = {
  resumeMode: ResumeMode;
  humanInterventionDurationMs: number;
  // Debounce window of the buffer (60 s in the current Miranda flow).
  bufferWindowMs: number;
  appointment: {
    // Configured per company in the central Supabase. When enabled, a
    // confirmed appointment blocks automation until its end and admits one
    // tool-bound confirmation; when disabled it creates no block. There is no
    // implicit default: a missing policy fails closed.
    pauseAfterConfirmation: boolean;
    cancellationKeepsBlock: true;
    cancelledReminderAllowed: false;
  };
};

export type CompanyOmnichannelPolicy = {
  environment: OmnichannelEnvironment;
  cliente_slug: string;
  policy_version: string;
  status: "active" | "inactive";
  policy: OmnichannelPolicy;
};

export class OmnichannelPolicyUnavailableError extends Error {
  readonly code = "omnichannel_policy_unavailable";

  constructor(message = "Omnichannel policy is unavailable.") {
    super(message);
    this.name = "OmnichannelPolicyUnavailableError";
  }
}

export function validateOmnichannelPolicy(
  policy: OmnichannelPolicy,
): OmnichannelPolicy {
  if (
    policy.resumeMode !== "await_new_message" &&
    policy.resumeMode !== "answer_pending"
  ) {
    throw new Error("Invalid resume mode.");
  }

  if (
    !Number.isSafeInteger(policy.humanInterventionDurationMs) ||
    policy.humanInterventionDurationMs <= 0
  ) {
    throw new Error("Human intervention duration must be a positive integer.");
  }

  if (
    !Number.isSafeInteger(policy.bufferWindowMs) ||
    policy.bufferWindowMs < 1000 ||
    policy.bufferWindowMs > 600000
  ) {
    throw new Error("Buffer window must be between 1 and 600 seconds.");
  }

  if (typeof policy.appointment?.pauseAfterConfirmation !== "boolean") {
    throw new Error("The post-appointment pause must be explicitly enabled or disabled.");
  }

  if (
    policy.appointment.cancellationKeepsBlock !== true ||
    policy.appointment.cancelledReminderAllowed !== false
  ) {
    throw new Error("The approved appointment policy cannot be weakened.");
  }

  return structuredClone(policy);
}

// Simulates the exact lookup in the central Supabase: one active policy per
// environment and company, never a global or another company's row.
export class SimulatedCentralPolicyStore {
  readonly lookups: Array<{
    environment: OmnichannelEnvironment;
    cliente_slug: string;
  }> = [];

  constructor(private readonly records: readonly CompanyOmnichannelPolicy[]) {}

  async getActiveForScope(scope: OmnichannelScope) {
    const valid = validateScope(scope);
    this.lookups.push({
      environment: valid.environment,
      cliente_slug: valid.cliente_slug,
    });

    const matches = this.records.filter(
      (record) =>
        record.environment === valid.environment &&
        record.cliente_slug === valid.cliente_slug &&
        record.status === "active",
    );
    const match = matches[0];
    if (matches.length !== 1 || !match || !match.policy_version.trim()) {
      throw new OmnichannelPolicyUnavailableError();
    }

    try {
      return {
        policyVersion: match.policy_version,
        policy: validateOmnichannelPolicy(match.policy),
      };
    } catch {
      throw new OmnichannelPolicyUnavailableError("Omnichannel policy is invalid.");
    }
  }
}
