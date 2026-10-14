import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  ContractValidationError,
  type JsonObject,
} from "../lib/omnichannel/contracts";
import {
  SchemaDefinitionError,
  assertContractSchema,
  assertJsonSchemaValue,
  type ContractSchemaName,
} from "../lib/omnichannel/schema-validator";

type Fixture = {
  context_config: Record<string, unknown>;
  context_result: Record<string, unknown>;
  ingress_event: Record<string, unknown>;
  brain_request: Record<string, unknown>;
  brain_result: Record<string, unknown> & {
    actions: Array<Record<string, unknown>>;
    domain_events: Array<Record<string, unknown>>;
  };
  automation_request: Record<string, unknown> & {
    proposed_actions: Array<Record<string, unknown>>;
  };
  delivery_results: Array<Record<string, unknown>>;
};

function fixture(name: "a" | "b") {
  return JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "contracts",
        "omnichannel",
        "v1",
        "examples",
        `empresa-sintetica-${name}-flow.json`,
      ),
      "utf8",
    ),
  ) as Fixture;
}

function assertValid(name: ContractSchemaName, value: unknown) {
  assert.doesNotThrow(() => assertContractSchema(name, value), name);
}

test("both synthetic fixtures validate through every applicable contract schema", () => {
  for (const current of [fixture("a"), fixture("b")]) {
    assertValid("context-agent-config", current.context_config);
    assertValid("context-result", current.context_result);
    assertValid("ingress-event", current.ingress_event);
    assertValid("brain-request", current.brain_request);
    assertValid("brain-result", current.brain_result);
    assertValid("automation-request", current.automation_request);

    for (const action of [
      ...current.brain_result.actions,
      ...current.automation_request.proposed_actions,
    ]) {
      assertValid("outbound-action", action);
    }
    for (const event of current.brain_result.domain_events) {
      assertValid("domain-event", event);
    }
    for (const result of current.delivery_results) {
      assertValid("delivery-result", result);
    }
  }

  const source = fixture("a");
  assertValid("state-command", {
    schema_version: "lexia.state.command.v1",
    command_id: "aaaaaaaa-0000-4000-8000-000000000120",
    scope: source.ingress_event.scope,
    type: "human_intervention.record",
    occurred_at: "2026-10-08T12:00:00.000Z",
    payload: { message_id: "synthetic-message" },
  });
});

test("context schema rejects missing, mistyped and additional common fields", () => {
  const source = fixture("a").context_result;
  const missing = structuredClone(source);
  delete (missing.operational_context as Record<string, unknown>).intent;
  assert.throws(() => assertContractSchema("context-result", missing), /required/);

  const mistyped = structuredClone(source);
  (mistyped.operational_context as Record<string, unknown>).confidence = "high";
  assert.throws(() => assertContractSchema("context-result", mistyped), /type number/);

  const extra = structuredClone(source);
  (extra.operational_context as Record<string, unknown>).unexpected = true;
  assert.throws(() => assertContractSchema("context-result", extra), /not allowed/);
});

test("confirmed appointments require confirmed status and a complete interval", () => {
  const event = fixture("a").brain_result.domain_events[0]!;

  const wrongStatus = structuredClone(event);
  (wrongStatus.appointment as Record<string, unknown>).status = "cancelled";
  assert.throws(
    () => assertContractSchema("domain-event", wrongStatus),
    /oneOf/,
  );

  const missingEnd = structuredClone(event);
  delete (missingEnd.appointment as Record<string, unknown>).ends_at;
  assert.throws(
    () => assertContractSchema("domain-event", missingEnd),
    /oneOf/,
  );
});

test("brain and automation schemas validate their nested actions and events", () => {
  const source = fixture("a");
  const invalidBrainAction = structuredClone(source.brain_result);
  invalidBrainAction.actions[0]!.content = { type: "text" };
  assert.throws(
    () => assertContractSchema("brain-result", invalidBrainAction),
    /oneOf/,
  );

  const invalidBrainEvent = structuredClone(source.brain_result);
  delete (
    invalidBrainEvent.domain_events[0]!.appointment as Record<string, unknown>
  ).ends_at;
  assert.throws(
    () => assertContractSchema("brain-result", invalidBrainEvent),
    /oneOf/,
  );

  const invalidAutomationAction = structuredClone(source.automation_request);
  invalidAutomationAction.proposed_actions[0]!.sequence = 0;
  assert.throws(
    () => assertContractSchema("automation-request", invalidAutomationAction),
    /at least 1/,
  );
});

test("CRM commands accept only the payload paired with their command type", () => {
  const scope = fixture("a").ingress_event.scope;
  const base = {
    schema_version: "lexia.crm.command.v1",
    command_id: "aaaaaaaa-0000-4000-8000-000000000201",
    correlation_id: "aaaaaaaa-0000-4000-8000-000000000202",
    occurred_at: "2026-10-09T12:00:00-03:00",
    scope,
  };
  const commands = [
    {
      ...base,
      command_type: "manual_pause.start",
      payload: {
        pause_ref: "crm-pause-1",
        reason: "Atendimento humano",
        expires_at: "2026-10-09T13:00:00-03:00",
      },
    },
    {
      ...base,
      command_type: "manual_pause.end",
      payload: { pause_ref: "crm-pause-1" },
    },
    {
      ...base,
      command_type: "handoff.resolve",
      payload: {
        handoff_id: "aaaaaaaa-0000-4000-8000-000000000203",
        resolution: "resolved",
      },
    },
    {
      ...base,
      command_type: "handoff.resume",
      payload: { handoff_id: "aaaaaaaa-0000-4000-8000-000000000203" },
    },
    {
      ...base,
      command_type: "appointment.cancel",
      payload: { appointment_ref: "appointment-synthetic-1" },
    },
    {
      ...base,
      command_type: "appointment.attendance.update",
      payload: {
        appointment_ref: "appointment-synthetic-1",
        attendance_status: "no_show",
      },
    },
  ];

  for (const command of commands) assertValid("crm-command", command);

  const wrongPayload = structuredClone(commands[5]!);
  wrongPayload.payload = { pause_ref: "crm-pause-1" } as never;
  assert.throws(
    () => assertContractSchema("crm-command", wrongPayload),
    /oneOf/,
  );

  const extraPayloadField = structuredClone(commands[0]!);
  (extraPayloadField.payload as Record<string, unknown>).cliente_slug =
    "empresa_sintetica_b";
  assert.throws(
    () => assertContractSchema("crm-command", extraPayloadField),
    /oneOf/,
  );
});

test("outbound audio uses an opaque media reference instead of a destination", () => {
  const action = structuredClone(fixture("a").brain_result.actions[0]!);
  action.content = {
    type: "audio",
    media_ref: "asset://empresa_sintetica_a/followup/demo",
  };
  assertValid("outbound-action", action);

  const invalid = structuredClone(action);
  invalid.content = { type: "audio" };
  assert.throws(
    () => assertContractSchema("outbound-action", invalid),
    /oneOf/,
  );
});

test("date-time validation rejects normalization and accepts valid offsets", () => {
  const source = fixture("a");

  const impossibleDate = structuredClone(source.ingress_event);
  impossibleDate.occurred_at = "2026-02-30T12:00:00Z";
  assert.throws(
    () => assertContractSchema("ingress-event", impossibleDate),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error instanceof SchemaDefinitionError, false);
      assert.match(error.message, /RFC 3339 date-time/);
      return true;
    },
  );

  const invalidHour = structuredClone(source.automation_request);
  invalidHour.due_at = "2026-02-28T24:00:00Z";
  assert.throws(
    () => assertContractSchema("automation-request", invalidHour),
    /RFC 3339 date-time/,
  );

  const validOffset = structuredClone(source.ingress_event);
  validOffset.occurred_at = "2026-02-28T12:00:00-03:00";
  assertValid("ingress-event", validOffset);

  const validLeapDate = structuredClone(source.delivery_results[0]!);
  validLeapDate.attempted_at = "2024-02-29T23:59:59.123+01:30";
  assertValid("delivery-result", validLeapDate);
});

test("recursive schema definitions fail before not, anyOf or oneOf can absorb them", () => {
  for (const keyword of ["not", "anyOf", "oneOf"] as const) {
    const recursiveCondition =
      keyword === "not"
        ? { not: { $ref: "#/$defs/loop" } }
        : {
            [keyword]: [
              { type: "string" },
              { $ref: "#/$defs/loop" },
            ],
          };
    const schema = {
      $defs: {
        loop: recursiveCondition,
      },
      $ref: "#/$defs/loop",
    } as JsonObject;

    assert.throws(
      () => assertJsonSchemaValue(schema, "safe"),
      (error: unknown) => {
        assert.ok(error instanceof SchemaDefinitionError, keyword);
        assert.equal(error instanceof ContractValidationError, false, keyword);
        assert.match(error.message, /recursive \$ref/, keyword);
        return true;
      },
    );
  }
});
