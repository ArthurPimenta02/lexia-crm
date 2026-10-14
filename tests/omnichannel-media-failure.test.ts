import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalMessage, OmnichannelScope } from "../lib/omnichannel/contracts";
import { FakeMediaProcessor } from "../lib/omnichannel/fake-adapters";
import {
  normalizeMediaMessage,
  processHumanAudioIntervention,
} from "../lib/omnichannel/media";
import { createConversationState, getActiveBlocks } from "../lib/omnichannel/state-machine";

const scope: OmnichannelScope = {
  environment: "isolated_test",
  cliente_slug: "empresa_sintetica_a",
  channel: "whatsapp",
  account_ref: "11111111-1111-4111-8111-111111111111",
  conversation_ref: "conversation-audio-001",
};

function mediaMessage(
  kind: "audio" | "image" | "pdf" | "video",
  author: CanonicalMessage["author"] = "lead",
): CanonicalMessage {
  return {
    schema_version: "lexia.message.v1",
    event_id: "aaaaaaaa-0000-4000-8000-000000000020",
    provider_event_id: `provider-${kind}-1`,
    message_id: `message-${kind}-1`,
    scope,
    author,
    direction: author === "lead" ? "inbound" : "outbound",
    occurred_at: "2026-10-08T12:00:00.000Z",
    media: {
      kind,
      provider_media_ref: `fake-${kind}-ref`,
      processing_status: "pending",
    },
  };
}

test("failed human audio transcription preserves message and renewable intervention", async () => {
  const result = await processHumanAudioIntervention({
    state: createConversationState(scope),
    message: mediaMessage("audio", "human_agent"),
    commandId: "human-audio-command-1",
    durationMs: 30 * 60 * 1000,
    processor: new FakeMediaProcessor({ audio: new Error("synthetic failure") }),
  });

  assert.equal(result.continueToBrain, false);
  assert.equal(result.message.message_id, "message-audio-1");
  assert.equal(result.message.media?.processing_status, "failed");
  assert.equal(result.message.media?.error_code, "audio_processing_failed");
  assert.equal(getActiveBlocks(result.state, "2026-10-08T12:01:00.000Z").length, 1);
  assert.equal(result.state.blocks[0]?.type, "human_intervention");
});

test("all supported fake media branches preserve the original event", async () => {
  const processor = new FakeMediaProcessor({
    audio: "Synthetic transcript",
    image: "Synthetic image description",
    pdf: "Synthetic PDF text",
    video: new Error("video analyzer intentionally unavailable"),
  });

  for (const kind of ["audio", "image", "pdf"] as const) {
    const original = mediaMessage(kind);
    const normalized = await normalizeMediaMessage(original, processor);
    assert.equal(normalized.event_id, original.event_id);
    assert.equal(normalized.media?.processing_status, "completed");
    assert.ok(normalized.media?.extracted_text);
  }

  const video = await normalizeMediaMessage(mediaMessage("video"), processor);
  assert.equal(video.media?.processing_status, "failed");
  assert.equal(video.media?.error_code, "video_processing_failed");
});
