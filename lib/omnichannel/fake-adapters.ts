import type {
  CanonicalMessage,
  DeliveryResult,
  IngressEvent,
  MediaDescriptor,
  OmnichannelChannel,
  OmnichannelEnvironment,
  OutboundAction,
} from "./contracts";
import { getOmnichannelCapability } from "./capabilities";
import { resolveMessageAuthor } from "./history";
import type { MediaProcessor } from "./media";

export type FakeTrustedBinding = {
  environment: OmnichannelEnvironment;
  clienteSlug: string;
  channel: OmnichannelChannel;
  accountRef: string;
  provider: "meta" | "zapi" | "fake";
};

export type FakeProviderPayload = {
  eventId: string;
  providerEventId: string;
  correlationId: string;
  messageId: string;
  conversationRef: string;
  occurredAt: string;
  eventType?: IngressEvent["event_type"];
  direction: CanonicalMessage["direction"];
  fromBusinessAccount: boolean;
  automatedActionId?: string;
  text?: string;
  media?: Omit<MediaDescriptor, "processing_status">;
  contact: {
    providerContactRef: string;
    displayName?: string;
    phone?: string;
  };
  adOrigin?: {
    providerRef: string;
    sourceType: string;
  };
  untrustedClienteSlug?: string;
};

function requireCapability(id: string) {
  if (!getOmnichannelCapability(id)) throw new Error(`Unknown capability: ${id}`);
  return id;
}

export function normalizeFakeProviderEvent(
  binding: FakeTrustedBinding,
  payload: FakeProviderPayload,
): IngressEvent {
  const scope = {
    environment: binding.environment,
    cliente_slug: binding.clienteSlug,
    channel: binding.channel,
    account_ref: binding.accountRef,
    conversation_ref: payload.conversationRef,
  } as const;

  const capabilityRefs = [requireCapability("authorship")];
  if (binding.provider === "meta") {
    capabilityRefs.push(requireCapability("meta_events"));
  } else if (binding.provider === "zapi") {
    capabilityRefs.push(requireCapability("zapi_events"));
  }
  if (!payload.contact.phone) capabilityRefs.push(requireCapability("contact_without_phone"));
  if (payload.adOrigin) capabilityRefs.push(requireCapability("ad_origin"));
  if (payload.media) capabilityRefs.push(requireCapability(`inbound_${payload.media.kind}`));
  else capabilityRefs.push(requireCapability("inbound_text"));

  const author = resolveMessageAuthor({
    automatedActionId: payload.automatedActionId,
    direction: payload.direction,
    fromBusinessAccount: payload.fromBusinessAccount,
  });
  if (author === "human_agent" && payload.media?.kind === "audio") {
    capabilityRefs.push(requireCapability("human_audio"));
  }

  const eventType = payload.eventType ?? "message";
  const message =
    eventType === "message"
      ? {
          schema_version: "lexia.message.v1" as const,
          event_id: payload.eventId,
          provider_event_id: payload.providerEventId,
          message_id: payload.messageId,
          scope,
          author,
          direction: payload.direction,
          occurred_at: payload.occurredAt,
          ...(payload.text ? { text: payload.text } : {}),
          ...(payload.media
            ? {
                media: {
                  ...payload.media,
                  processing_status: "pending" as const,
                },
              }
            : {}),
          ...(payload.automatedActionId
            ? { action_id: payload.automatedActionId }
            : {}),
          ...(payload.adOrigin
            ? {
                ad_origin: {
                  provider_ref: payload.adOrigin.providerRef,
                  source_type: payload.adOrigin.sourceType,
                },
              }
            : {}),
        }
      : undefined;

  return {
    schema_version: "lexia.ingress.event.v1",
    event_id: payload.eventId,
    provider_event_id: payload.providerEventId,
    correlation_id: payload.correlationId,
    scope,
    provider: binding.provider,
    event_type: eventType,
    occurred_at: payload.occurredAt,
    ...(message ? { message } : {}),
    contact: {
      provider_contact_ref: payload.contact.providerContactRef,
      ...(payload.contact.displayName ? { display_name: payload.contact.displayName } : {}),
      ...(payload.contact.phone ? { phone: payload.contact.phone } : {}),
    },
    capability_refs: capabilityRefs,
  };
}

export function shouldRouteIngressToBrain(event: IngressEvent) {
  return event.event_type === "message" && event.message?.author === "lead";
}

export class FakeMediaProcessor implements MediaProcessor {
  constructor(
    private readonly outcomes: Partial<Record<Exclude<MediaDescriptor["kind"], "text">, string | Error>>,
  ) {}

  async process(kind: Exclude<MediaDescriptor["kind"], "text">) {
    const outcome = this.outcomes[kind];
    if (outcome instanceof Error) throw outcome;
    if (typeof outcome !== "string") throw new Error("No fake media outcome configured.");
    return outcome;
  }
}

export type FakeSendOutcome =
  | { status: "sent"; providerMessageId: string }
  | { status: "failed"; reason: string }
  | { status: "delivery_unknown"; reason: string };

export class FakeProviderSendAdapter {
  readonly calls: OutboundAction[] = [];

  constructor(private readonly outcomes: Record<string, FakeSendOutcome>) {}

  async send(action: OutboundAction): Promise<DeliveryResult> {
    this.calls.push(structuredClone(action));
    const outcome = this.outcomes[action.action_id];
    if (!outcome) throw new Error(`No fake delivery outcome for ${action.action_id}.`);

    return {
      schema_version: "lexia.delivery.result.v1",
      action_id: action.action_id,
      status: outcome.status,
      attempted_at: "2026-10-08T15:00:00.000Z",
      ...(outcome.status === "sent"
        ? { provider_message_id: outcome.providerMessageId }
        : { reason: outcome.reason }),
    };
  }
}
