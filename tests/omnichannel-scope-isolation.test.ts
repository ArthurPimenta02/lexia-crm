import assert from "node:assert/strict";
import test from "node:test";

import type { OmnichannelScope } from "../lib/omnichannel/contracts";
import {
  buildIngressDedupeKey,
  buildRedisKey,
  buildRedisScopePrefix,
} from "../lib/omnichannel/redis-keys";
import {
  buildScopedIdempotencyKey,
  claimIdempotencyKey,
  createIdempotencyLedger,
} from "../lib/omnichannel/idempotency";

const secret = "synthetic-only-secret-32-characters-minimum";
const scopeA: OmnichannelScope = {
  environment: "isolated_test",
  cliente_slug: "empresa_sintetica_a",
  channel: "whatsapp",
  account_ref: "11111111-1111-4111-8111-111111111111",
  conversation_ref: "same-provider-conversation",
};
const scopeB: OmnichannelScope = {
  ...scopeA,
  cliente_slug: "empresa_sintetica_b",
  account_ref: "22222222-2222-4222-8222-222222222222",
};

test("Redis keys isolate environment, tenant, channel, account and conversation", () => {
  const keyA = buildRedisKey(scopeA, "state", secret);
  const keyB = buildRedisKey(scopeB, "state", secret);
  const keyOtherEnvironment = buildRedisKey(
    { ...scopeA, environment: "staging" },
    "state",
    secret,
  );

  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyOtherEnvironment);
  assert.doesNotMatch(keyA, /same-provider-conversation/);
  assert.match(keyA, /^lexia:omni:v2:isolated_test:empresa_sintetica_a:/);
  assert.equal(
    buildRedisScopePrefix(scopeA, secret).split("{")[1]?.split("}")[0]?.length,
    64,
  );
});

test("the same provider event remains independently idempotent per tenant", () => {
  assert.notEqual(
    buildIngressDedupeKey(scopeA, "same-event", secret),
    buildIngressDedupeKey(scopeB, "same-event", secret),
  );

  const keyA = buildScopedIdempotencyKey(scopeA, "ingress", "same-event");
  const keyB = buildScopedIdempotencyKey(scopeB, "ingress", "same-event");
  const first = claimIdempotencyKey(createIdempotencyLedger(), keyA, "result-a");
  const duplicate = claimIdempotencyKey(first.ledger, keyA, "other-result");
  const otherTenant = claimIdempotencyKey(first.ledger, keyB, "result-b");

  assert.equal(first.claimed, true);
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.resultRef, "result-a");
  assert.equal(otherTenant.claimed, true);

  const distinctContentTwin = claimIdempotencyKey(
    first.ledger,
    buildScopedIdempotencyKey(scopeA, "ingress", "different-event-same-content"),
    "result-a-2",
  );
  assert.equal(distinctContentTwin.claimed, true);
});

test("idempotency encoding cannot collide when IDs contain separators", () => {
  const scopeWithSeparators = {
    ...scopeA,
    conversation_ref: "conversation|ingress|event",
  };
  const otherConversation = {
    ...scopeA,
    conversation_ref: "conversation",
  };
  const firstKey = buildScopedIdempotencyKey(
    scopeWithSeparators,
    "ingress",
    "tail",
  );
  const secondKey = buildScopedIdempotencyKey(
    otherConversation,
    "ingress",
    "event|ingress|tail",
  );

  assert.notEqual(firstKey, secondKey);
  assert.notEqual(
    buildRedisKey(scopeWithSeparators, "state", secret),
    buildRedisKey(otherConversation, "state", secret),
  );
  const first = claimIdempotencyKey(createIdempotencyLedger(), firstKey, "first");
  const second = claimIdempotencyKey(first.ledger, secondKey, "second");
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, true);
});

test("short HMAC secrets and malformed tenant scopes fail closed", () => {
  assert.throws(() => buildRedisKey(scopeA, "state", "too-short"), /at least 32/);
  assert.throws(
    () => buildRedisKey({ ...scopeA, cliente_slug: "../tenant" }, "state", secret),
    /cliente_slug/,
  );
});
