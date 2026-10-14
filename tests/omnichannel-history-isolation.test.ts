import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalMessage, OmnichannelScope } from "../lib/omnichannel/contracts";
import {
  getMostRecentAuthor,
  resolveMessageAuthor,
  selectScopedHistory,
} from "../lib/omnichannel/history";
import {
  normalizeFakeProviderEvent,
  shouldRouteIngressToBrain,
} from "../lib/omnichannel/fake-adapters";

const scopeA: OmnichannelScope = {
  environment: "isolated_test",
  cliente_slug: "empresa_sintetica_a",
  channel: "whatsapp",
  account_ref: "11111111-1111-4111-8111-111111111111",
  conversation_ref: "same-conversation-id",
};
const scopeB: OmnichannelScope = {
  ...scopeA,
  cliente_slug: "empresa_sintetica_b",
  account_ref: "22222222-2222-4222-8222-222222222222",
};

function message(
  scope: OmnichannelScope,
  author: CanonicalMessage["author"],
  occurredAt: string,
): CanonicalMessage {
  return {
    schema_version: "lexia.message.v1",
    event_id: `${scope.cliente_slug === "empresa_sintetica_a" ? "a" : "b"}aaaaaaa-0000-4000-8000-000000000001`,
    provider_event_id: "same-provider-event",
    message_id: `same-message-${author}`,
    scope,
    author,
    direction: author === "lead" ? "inbound" : "outbound",
    occurred_at: occurredAt,
    text: `${scope.cliente_slug}-${author}`,
  };
}

test("history with equal external IDs remains isolated by the complete scope", () => {
  const history = [
    message(scopeB, "lead", "2026-10-08T12:00:00.000Z"),
    message(scopeA, "lead", "2026-10-08T12:00:00.000Z"),
    { ...message(scopeA, "ai", "2026-10-08T12:01:00.000Z"), provider_event_id: "a-2" },
  ];

  const selectedA = selectScopedHistory(history, scopeA);
  const selectedB = selectScopedHistory(history, scopeB);

  assert.deepEqual(selectedA.map((item) => item.text), [
    "empresa_sintetica_a-lead",
    "empresa_sintetica_a-ai",
  ]);
  assert.deepEqual(selectedB.map((item) => item.text), [
    "empresa_sintetica_b-lead",
  ]);
  assert.equal(getMostRecentAuthor(selectedA), "ai");
});

test("authorship distinguishes provider echo, human team and lead", () => {
  assert.equal(
    resolveMessageAuthor({
      direction: "outbound",
      fromBusinessAccount: true,
      automatedActionId: "action-1",
    }),
    "ai",
  );
  assert.equal(
    resolveMessageAuthor({ direction: "outbound", fromBusinessAccount: true }),
    "human_agent",
  );
  assert.equal(
    resolveMessageAuthor({ direction: "inbound", fromBusinessAccount: false }),
    "lead",
  );
});

test("fake Meta adapter trusts its binding and supports a contact without phone", () => {
  const event = normalizeFakeProviderEvent(
    {
      environment: "isolated_test",
      clienteSlug: "empresa_sintetica_b",
      channel: "instagram",
      accountRef: "22222222-2222-4222-8222-222222222222",
      provider: "meta",
    },
    {
      eventId: "bbbbbbbb-0000-4000-8000-000000000010",
      providerEventId: "meta-event-1",
      correlationId: "bbbbbbbb-0000-4000-8000-000000000011",
      messageId: "meta-message-1",
      conversationRef: "meta-conversation-1",
      occurredAt: "2026-10-08T12:00:00.000Z",
      direction: "inbound",
      fromBusinessAccount: false,
      text: "Synthetic Meta message",
      contact: { providerContactRef: "instagram-user-1" },
      adOrigin: { providerRef: "fake-ad-1", sourceType: "instagram_ad" },
      untrustedClienteSlug: "empresa_sintetica_a",
    },
  );

  assert.equal(event.scope.cliente_slug, "empresa_sintetica_b");
  assert.equal(event.contact?.phone, undefined);
  assert.equal(event.message?.author, "lead");
  assert.deepEqual(
    new Set(event.capability_refs),
    new Set([
      "meta_events",
      "authorship",
      "contact_without_phone",
      "ad_origin",
      "inbound_text",
    ]),
  );
  assert.equal(shouldRouteIngressToBrain(event), true);
});

test("fake Z-API adapter marks outbound team audio as human intervention input", () => {
  const event = normalizeFakeProviderEvent(
    {
      environment: "isolated_test",
      clienteSlug: "empresa_sintetica_a",
      channel: "whatsapp",
      accountRef: "11111111-1111-4111-8111-111111111111",
      provider: "zapi",
    },
    {
      eventId: "aaaaaaaa-0000-4000-8000-000000000012",
      providerEventId: "zapi-event-1",
      correlationId: "aaaaaaaa-0000-4000-8000-000000000013",
      messageId: "zapi-message-1",
      conversationRef: "zapi-conversation-1",
      occurredAt: "2026-10-08T12:00:00.000Z",
      direction: "outbound",
      fromBusinessAccount: true,
      media: {
        kind: "audio",
        provider_media_ref: "fake-audio-ref",
        mime_type: "audio/ogg",
      },
      contact: { providerContactRef: "fake-contact-a" },
    },
  );

  assert.equal(event.message?.author, "human_agent");
  assert.equal(event.message?.media?.processing_status, "pending");
  assert.ok(event.capability_refs.includes("zapi_events"));
  assert.ok(event.capability_refs.includes("inbound_audio"));
  assert.ok(event.capability_refs.includes("human_audio"));
  assert.equal(shouldRouteIngressToBrain(event), false);
});

test("non-message provider events are audited but never routed to the brain", () => {
  const event = normalizeFakeProviderEvent(
    {
      environment: "isolated_test",
      clienteSlug: "empresa_sintetica_b",
      channel: "messenger",
      accountRef: "22222222-2222-4222-8222-222222222222",
      provider: "meta",
    },
    {
      eventId: "bbbbbbbb-0000-4000-8000-000000000014",
      providerEventId: "meta-reaction-1",
      correlationId: "bbbbbbbb-0000-4000-8000-000000000015",
      messageId: "meta-reaction-message-1",
      conversationRef: "meta-conversation-2",
      occurredAt: "2026-10-08T12:00:00.000Z",
      eventType: "reaction",
      direction: "inbound",
      fromBusinessAccount: false,
      contact: { providerContactRef: "messenger-user-1" },
    },
  );

  assert.equal(event.message, undefined);
  assert.equal(shouldRouteIngressToBrain(event), false);
  assert.ok(event.capability_refs.includes("meta_events"));
});
