import type { OmnichannelScope } from "./contracts";
import { validateScope } from "./scope";

export type IdempotencyLedger = {
  claims: Record<string, string>;
};

export function createIdempotencyLedger(): IdempotencyLedger {
  return { claims: {} };
}

export function buildScopedIdempotencyKey(
  scope: OmnichannelScope,
  kind: "ingress" | "state" | "action" | "automation",
  externalId: string,
) {
  if (!externalId.trim()) throw new Error("Idempotency ID cannot be empty.");
  const valid = validateScope(scope);

  return JSON.stringify([
    "lexia.idempotency.key.v1",
    valid.environment,
    valid.cliente_slug,
    valid.channel,
    valid.account_ref,
    valid.conversation_ref,
    kind,
    externalId,
  ]);
}

export function claimIdempotencyKey(
  ledger: IdempotencyLedger,
  key: string,
  resultRef: string,
) {
  const existing = ledger.claims[key];
  if (existing) {
    return {
      claimed: false as const,
      ledger,
      resultRef: existing,
    };
  }

  return {
    claimed: true as const,
    ledger: {
      claims: {
        ...ledger.claims,
        [key]: resultRef,
      },
    },
    resultRef,
  };
}
