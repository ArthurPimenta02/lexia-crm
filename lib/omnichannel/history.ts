import type {
  CanonicalMessage,
  MessageAuthor,
  OmnichannelScope,
} from "./contracts";
import { sameScope, validateScope } from "./scope";

export function resolveMessageAuthor(input: {
  direction: CanonicalMessage["direction"];
  fromBusinessAccount: boolean;
  automatedActionId?: string;
}): MessageAuthor {
  if (input.automatedActionId) return "ai";
  if (input.direction === "outbound" && input.fromBusinessAccount) {
    return "human_agent";
  }
  if (input.direction === "inbound") return "lead";
  return "system";
}

export function selectScopedHistory(
  messages: readonly CanonicalMessage[],
  scope: OmnichannelScope,
) {
  validateScope(scope);
  const seenProviderEvents = new Set<string>();

  return messages
    .filter((message) => sameScope(message.scope, scope))
    .sort((left, right) => {
      const time = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
      return time || left.message_id.localeCompare(right.message_id);
    })
    .filter((message) => {
      if (seenProviderEvents.has(message.provider_event_id)) return false;
      seenProviderEvents.add(message.provider_event_id);
      return true;
    })
    .map((message) => structuredClone(message));
}

export function getMostRecentAuthor(messages: readonly CanonicalMessage[]) {
  if (messages.length === 0) return null;

  return [...messages]
    .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))[0]
    ?.author ?? null;
}
