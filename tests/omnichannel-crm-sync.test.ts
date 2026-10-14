import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { CrmSyncEvent } from "../lib/omnichannel/contracts";
import {
  assertCrmSyncEvent,
  buildCrmEventIdempotencyKey,
  orderCrmEvents,
} from "../lib/omnichannel/crm-sync";
import { assertContractSchema } from "../lib/omnichannel/schema-validator";

function fixtures() {
  return JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "contracts",
        "omnichannel",
        "v1",
        "examples",
        "crm-sync-miranda-events.json",
      ),
      "utf8",
    ),
  ) as CrmSyncEvent[];
}

test("synthetic Miranda CRM events validate and retain their declared order", () => {
  const events = fixtures();
  for (const event of events) assertCrmSyncEvent(event);

  assert.deepEqual(
    orderCrmEvents([...events].reverse()).map((event) => event.sequence),
    [1, 2, 3, 4],
  );
});

test("brain output cannot prove an appointment or provider delivery", () => {
  const appointment = structuredClone(fixtures()[2]!);
  appointment.source = {
    ...appointment.source,
    system: "brain",
    authority: "brain_result",
  };
  assert.throws(() => assertCrmSyncEvent(appointment), /cannot use authority/);

  const delivery = structuredClone(fixtures()[1]!);
  delivery.event_type = "message.delivery.updated";
  delivery.source = {
    ...delivery.source,
    system: "workflow",
    authority: "workflow_execution",
  };
  delivery.payload = {
    message_id: "synthetic-message-001",
    delivery_status: "sent",
    attempted_at: "2026-10-09T12:00:03-03:00",
  };
  assert.throws(() => assertCrmSyncEvent(delivery), /cannot use authority/);

  const forgedToolAuthority = structuredClone(fixtures()[2]!);
  forgedToolAuthority.source = {
    ...forgedToolAuthority.source,
    system: "brain",
    authority: "tool_result",
  };
  assert.throws(
    () => assertCrmSyncEvent(forgedToolAuthority),
    /must be emitted by tool/,
  );
});

test("appointment events require a complete attested interval", () => {
  const appointment = structuredClone(fixtures()[2]!);
  delete appointment.payload.ends_at;
  assert.throws(
    () => assertContractSchema("crm-sync-event", appointment),
    /oneOf/,
  );
});

test("uncertain delivery and completed enrichment keep reconciliation evidence", () => {
  const uncertain = structuredClone(fixtures()[1]!);
  uncertain.source = {
    ...uncertain.source,
    system: "workflow",
    authority: "workflow_execution",
  };
  uncertain.payload.direction = "outbound";
  uncertain.payload.author = "ai";
  uncertain.payload.delivery_status = "delivery_unknown";
  delete uncertain.payload.action_id;
  assert.throws(() => assertCrmSyncEvent(uncertain), /requires its stable action_id/);

  const enrichment = structuredClone(fixtures()[1]!);
  enrichment.event_type = "message.enrichment.updated";
  enrichment.source = {
    ...enrichment.source,
    system: "workflow",
    authority: "workflow_execution",
  };
  enrichment.payload = {
    message_id: "synthetic-message-001",
    enrichment_kind: "transcription",
    status: "completed",
    attempted_at: "2026-10-09T12:00:03-03:00",
  };
  assert.throws(() => assertCrmSyncEvent(enrichment), /requires validated content/);

  enrichment.payload.content = "Transcrição sintética.";
  assert.doesNotThrow(() => assertCrmSyncEvent(enrichment));
});

test("CRM payloads reject extra fields and invalid dates", () => {
  const message = structuredClone(fixtures()[1]!);
  message.payload.secret = "must-not-pass";
  assert.throws(() => assertContractSchema("crm-sync-event", message));

  const event = structuredClone(fixtures()[0]!);
  event.occurred_at = "2026-02-30T12:00:00Z";
  assert.throws(
    () => assertContractSchema("crm-sync-event", event),
    /RFC 3339 date-time/,
  );
});

test("idempotency keys cannot collide across scopes or separator-like IDs", () => {
  const event = fixtures()[0]!;
  const otherScope = {
    ...event.scope,
    cliente_slug: "empresa_sintetica_b",
  };
  const first = buildCrmEventIdempotencyKey(
    event.scope,
    "message.recorded",
    "conversation|message:1",
  );
  const second = buildCrmEventIdempotencyKey(
    otherScope,
    "message.recorded",
    "conversation|message:1",
  );
  const ambiguousLooking = buildCrmEventIdempotencyKey(
    event.scope,
    "message.recorded",
    "conversation|message:1|extra",
  );

  assert.notEqual(first, second);
  assert.notEqual(first, ambiguousLooking);
  assert.match(first, /^lexia:crm:v1:[a-f0-9]{64}$/);
});

test("Miranda CRM workflow artifacts stay inactive, simulated and complete", () => {
  const directory = join(process.cwd(), "n8n", "miranda-crm");
  const sinkText = readFileSync(
    join(directory, "crm-event-sink-v1.inactive.json"),
    "utf8",
  );
  const sink = JSON.parse(sinkText) as {
    active: boolean;
    nodes: Array<{ type: string; credentials?: unknown }>;
  };
  const mapText = readFileSync(join(directory, "miranda-event-map.json"), "utf8");
  const map = JSON.parse(mapText) as {
    delivery_mode: string;
    workflows: Array<{ name: string }>;
  };

  assert.equal(sink.active, false);
  assert.equal(map.delivery_mode, "observe_only");
  assert.equal(sink.nodes.some((node) => node.type === "n8n-nodes-base.httpRequest"), false);
  assert.equal(sink.nodes.some((node) => node.credentials !== undefined), false);
  assert.doesNotMatch(sinkText, /https?:\/\//i);
  assert.doesNotMatch(`${sinkText}\n${mapText}`, /ASTERIC/i);
  assert.deepEqual(
    map.workflows.map((workflow) => workflow.name),
    [
      "MIRANDA SKIN EXPERT - OMNICHANNEL",
      "Cérebro — MIRANDA SKIN EXPERT",
      "criar_agendamento",
      "verificar_disponibilidade",
      "AGENTE DE FOLLOW-UP — MIRANDA",
      "AGENTE DE LEMBRETES — MIRANDA",
    ],
  );
});
