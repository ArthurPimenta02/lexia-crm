import type { CanonicalMessage, MediaKind } from "./contracts";
import { recordHumanIntervention, type ConversationState } from "./state-machine";

export type MediaProcessor = {
  process(kind: Exclude<MediaKind, "text">, message: CanonicalMessage): Promise<string>;
};

function mediaErrorCode(kind: Exclude<MediaKind, "text">) {
  return `${kind}_processing_failed`;
}

export async function normalizeMediaMessage(
  message: CanonicalMessage,
  processor: MediaProcessor,
) {
  if (!message.media || message.media.kind === "text") {
    return structuredClone(message);
  }

  const normalized = structuredClone(message);
  const kind = normalized.media?.kind;
  if (!kind || kind === "text") return normalized;

  try {
    const extractedText = await processor.process(kind, normalized);
    if (normalized.media) {
      normalized.media.processing_status = "completed";
      normalized.media.extracted_text = extractedText;
      delete normalized.media.error_code;
    }
  } catch {
    if (normalized.media) {
      normalized.media.processing_status = "failed";
      normalized.media.error_code = mediaErrorCode(kind);
      delete normalized.media.extracted_text;
    }
  }

  return normalized;
}

export async function processHumanAudioIntervention(input: {
  state: ConversationState;
  message: CanonicalMessage;
  commandId: string;
  durationMs: number;
  processor: MediaProcessor;
}) {
  if (input.message.author !== "human_agent" || input.message.media?.kind !== "audio") {
    throw new Error("Expected a human agent audio message.");
  }

  const intervention = recordHumanIntervention(input.state, {
    commandId: input.commandId,
    durationMs: input.durationMs,
    messageId: input.message.message_id,
    occurredAt: input.message.occurred_at,
  });

  const message = await normalizeMediaMessage(input.message, input.processor);

  return {
    continueToBrain: false as const,
    duplicate: intervention.duplicate,
    message,
    state: intervention.state,
  };
}
