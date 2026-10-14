import type { OmnichannelScope } from "./contracts";
import { validateScope } from "./scope";

// Local model of the current sliding debounce: every lead message restarts
// the window and only the newest arrival may close the batch. Unlike the
// legacy GET + DEL pair, closing moves exactly the elected entries into one
// active batch, so a message arriving meanwhile stays for the next batch.
// Messages are expected to be persisted before they are enqueued here.

export type InboundBufferEntry = {
  messageId: string;
  leadSeq: number;
  enqueuedAt: string;
};

export type InboundBatch = {
  batchId: string;
  fencingToken: number;
  entries: InboundBufferEntry[];
  messageIds: string[];
  cutoffSeq: number;
  claimedAt: string;
  supersededInvocationIds: string[];
};

export type InboundBufferState = {
  scope: OmnichannelScope;
  windowMs: number;
  entries: InboundBufferEntry[];
  // Lead messages received or left open while automation was blocked. They
  // stay recorded and follow the company resume policy.
  pending: InboundBufferEntry[];
  activeBatch: InboundBatch | null;
  fencingCounter: number;
  // Messages and invocations of a superseded batch wait here for the next one.
  carryOver: {
    entries: InboundBufferEntry[];
    supersededInvocationIds: string[];
  };
};

export type ClaimRefusal =
  | "blocked"
  | "batch_in_progress"
  | "empty"
  | "newer_message_waiting"
  | "window_open";

function parseTime(value: string, field: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} is invalid.`);
  return timestamp;
}

function lastEntry(entries: readonly InboundBufferEntry[]) {
  return entries.reduce<InboundBufferEntry | null>(
    (latest, entry) => (!latest || entry.leadSeq > latest.leadSeq ? entry : latest),
    null,
  );
}

function assertActiveBatch(
  buffer: InboundBufferState,
  input: { batchId: string; fencingToken: number },
) {
  const batch = buffer.activeBatch;
  if (!batch || batch.batchId !== input.batchId || batch.fencingToken !== input.fencingToken) {
    throw new Error("Stale or unknown inbound batch.");
  }
  return batch;
}

function nextClaimSeq(buffer: InboundBufferState) {
  return lastEntry(buffer.entries)?.leadSeq ?? null;
}

export function createInboundBuffer(
  scope: OmnichannelScope,
  windowMs: number,
): InboundBufferState {
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error("windowMs must be a positive integer.");
  }
  return {
    scope: validateScope(scope),
    windowMs,
    entries: [],
    pending: [],
    activeBatch: null,
    fencingCounter: 0,
    carryOver: { entries: [], supersededInvocationIds: [] },
  };
}

export function enqueueInboundMessage(
  buffer: InboundBufferState,
  input: { messageId: string; leadSeq: number; at: string; blocked: boolean },
) {
  if (typeof input.blocked !== "boolean") throw new Error("blocked must be explicit.");
  parseTime(input.at, "at");
  if (!input.messageId.trim() || !Number.isSafeInteger(input.leadSeq) || input.leadSeq < 1) {
    throw new Error("Inbound message ID and lead sequence are invalid.");
  }
  const known =
    buffer.entries.some((entry) => entry.messageId === input.messageId) ||
    buffer.carryOver.entries.some((entry) => entry.messageId === input.messageId) ||
    buffer.pending.some((entry) => entry.messageId === input.messageId) ||
    buffer.activeBatch?.messageIds.includes(input.messageId) === true;
  if (known) return { duplicate: true, state: buffer };

  const draft = structuredClone(buffer);
  const entry = { messageId: input.messageId, leadSeq: input.leadSeq, enqueuedAt: input.at };
  if (input.blocked) draft.pending.push(entry);
  else draft.entries.push(entry);
  return { duplicate: false, state: draft };
}

export function claimInboundBatch(
  buffer: InboundBufferState,
  input: { candidateSeq: number; batchId: string; at: string; blocked: boolean },
):
  | { claimed: true; state: InboundBufferState; batch: InboundBatch }
  | { claimed: false; state: InboundBufferState; reason: ClaimRefusal } {
  const at = parseTime(input.at, "at");
  if (!Number.isSafeInteger(input.candidateSeq)) throw new Error("candidateSeq is required.");
  if (typeof input.blocked !== "boolean") throw new Error("blocked must be explicit.");
  if (buffer.activeBatch) {
    return { claimed: false, state: buffer, reason: "batch_in_progress" };
  }
  // A block that started during the buffer stops the batch before context,
  // brain or tools; the open messages become pending.
  if (input.blocked) {
    const draft = structuredClone(buffer);
    draft.pending.push(...draft.carryOver.entries, ...draft.entries);
    draft.pending.sort((left, right) => left.leadSeq - right.leadSeq);
    draft.entries = [];
    draft.carryOver.entries = [];
    return { claimed: false, state: draft, reason: "blocked" };
  }
  const latest = lastEntry(buffer.entries);
  if (!latest) return { claimed: false, state: buffer, reason: "empty" };
  if (latest.leadSeq !== input.candidateSeq) {
    return { claimed: false, state: buffer, reason: "newer_message_waiting" };
  }
  if (at - parseTime(latest.enqueuedAt, "enqueuedAt") < buffer.windowMs) {
    return { claimed: false, state: buffer, reason: "window_open" };
  }

  const draft = structuredClone(buffer);
  const taken = [...draft.carryOver.entries, ...draft.entries].sort(
    (left, right) => left.leadSeq - right.leadSeq,
  );
  draft.fencingCounter += 1;
  const batch: InboundBatch = {
    batchId: input.batchId,
    fencingToken: draft.fencingCounter,
    entries: taken,
    messageIds: taken.map((entry) => entry.messageId),
    cutoffSeq: latest.leadSeq,
    claimedAt: input.at,
    supersededInvocationIds: [...draft.carryOver.supersededInvocationIds],
  };
  draft.activeBatch = batch;
  draft.entries = [];
  draft.carryOver = { entries: [], supersededInvocationIds: [] };
  return { claimed: true, state: draft, batch: structuredClone(batch) };
}

// answer_pending: moves pending messages back into the buffer once, after the
// last block ended. await_new_message never calls this.
export function releasePendingMessages(buffer: InboundBufferState, input: { at: string }) {
  parseTime(input.at, "at");
  if (buffer.pending.length === 0) return { state: buffer, released: 0 };
  const draft = structuredClone(buffer);
  const windowStart = new Date(parseTime(input.at, "at") - draft.windowMs).toISOString();
  draft.entries.push(...draft.pending.map((entry) => ({ ...entry, enqueuedAt: windowStart })));
  draft.entries.sort((left, right) => left.leadSeq - right.leadSeq);
  const released = draft.pending.length;
  draft.pending = [];
  return { state: draft, released };
}

export function completeInboundBatch(
  buffer: InboundBufferState,
  input: { batchId: string; fencingToken: number },
) {
  assertActiveBatch(buffer, input);
  const draft = structuredClone(buffer);
  draft.activeBatch = null;
  return { state: draft, nextClaimSeq: nextClaimSeq(draft) };
}

// A reply that was not sent is discarded when a newer lead message arrives:
// the batch messages are carried into the next batch together with the new
// ones, and the superseded invocation is remembered so its delivered actions
// and executed tools are not repeated.
export function supersedeInboundBatch(
  buffer: InboundBufferState,
  input: { batchId: string; fencingToken: number; invocationId: string },
) {
  const batch = assertActiveBatch(buffer, input);
  if (!input.invocationId.trim()) throw new Error("invocationId cannot be empty.");
  if (!buffer.entries.some((entry) => entry.leadSeq > batch.cutoffSeq)) {
    throw new Error("A batch is superseded only by a newer lead message.");
  }

  const draft = structuredClone(buffer);
  draft.carryOver = {
    entries: structuredClone(batch.entries),
    supersededInvocationIds: [...batch.supersededInvocationIds, input.invocationId],
  };
  draft.activeBatch = null;
  return { state: draft, nextClaimSeq: nextClaimSeq(draft) };
}
