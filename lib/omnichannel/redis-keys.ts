import { createHmac } from "node:crypto";

import type { OmnichannelScope } from "./contracts";
import { serializeScope, validateScope } from "./scope";

export const omnichannelRedisResources = [
  "state",
  "blocks",
  "block_expiries",
  "pending",
  "buffer",
  "context",
  "lease",
] as const;

export type OmnichannelRedisResource =
  (typeof omnichannelRedisResources)[number];

export function buildScopeHash(scope: OmnichannelScope, environmentSecret: string) {
  if (environmentSecret.length < 32) {
    throw new Error("The environment HMAC secret must have at least 32 characters.");
  }

  return createHmac("sha256", environmentSecret)
    .update(serializeScope(scope))
    .digest("hex");
}

export function buildRedisScopePrefix(
  scope: OmnichannelScope,
  environmentSecret: string,
) {
  const valid = validateScope(scope);
  const scopeHash = buildScopeHash(valid, environmentSecret);

  return [
    "lexia",
    "omni",
    "v2",
    valid.environment,
    valid.cliente_slug,
    valid.channel,
    valid.account_ref,
    `{${scopeHash}}`,
  ].join(":");
}

export function buildRedisKey(
  scope: OmnichannelScope,
  resource: OmnichannelRedisResource,
  environmentSecret: string,
) {
  return `${buildRedisScopePrefix(scope, environmentSecret)}:${resource}`;
}

export function buildIngressDedupeKey(
  scope: OmnichannelScope,
  providerEventId: string,
  environmentSecret: string,
) {
  const eventHash = createHmac("sha256", environmentSecret)
    .update(providerEventId)
    .digest("hex");

  return `${buildRedisScopePrefix(scope, environmentSecret)}:dedupe:in:${eventHash}`;
}

export function buildOutboundDedupeKey(
  scope: OmnichannelScope,
  actionId: string,
  environmentSecret: string,
) {
  const actionHash = createHmac("sha256", environmentSecret)
    .update(actionId)
    .digest("hex");

  return `${buildRedisScopePrefix(scope, environmentSecret)}:dedupe:out:${actionHash}`;
}
