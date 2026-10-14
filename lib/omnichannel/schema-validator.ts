import automationRequestSchema from "../../contracts/omnichannel/v1/automation-request.schema.json";
import brainRequestSchema from "../../contracts/omnichannel/v1/brain-request.schema.json";
import brainResultSchema from "../../contracts/omnichannel/v1/brain-result.schema.json";
import contextAgentConfigSchema from "../../contracts/omnichannel/v1/context-agent-config.schema.json";
import contextResultSchema from "../../contracts/omnichannel/v1/context-result.schema.json";
import crmCommandSchema from "../../contracts/omnichannel/v1/crm-command.schema.json";
import crmSyncEventSchema from "../../contracts/omnichannel/v1/crm-sync-event.schema.json";
import deliveryResultSchema from "../../contracts/omnichannel/v1/delivery-result.schema.json";
import domainEventSchema from "../../contracts/omnichannel/v1/domain-event.schema.json";
import ingressEventSchema from "../../contracts/omnichannel/v1/ingress-event.schema.json";
import outboundActionSchema from "../../contracts/omnichannel/v1/outbound-action.schema.json";
import stateCommandSchema from "../../contracts/omnichannel/v1/state-command.schema.json";
import workflowTestRequestSchema from "../../contracts/omnichannel/v1/workflow-test-request.schema.json";
import workflowTestResultSchema from "../../contracts/omnichannel/v1/workflow-test-result.schema.json";

import { ContractValidationError, type JsonObject, type JsonValue } from "./contracts";

export const contractSchemas = {
  "automation-request": automationRequestSchema,
  "brain-request": brainRequestSchema,
  "brain-result": brainResultSchema,
  "context-agent-config": contextAgentConfigSchema,
  "context-result": contextResultSchema,
  "crm-command": crmCommandSchema,
  "crm-sync-event": crmSyncEventSchema,
  "delivery-result": deliveryResultSchema,
  "domain-event": domainEventSchema,
  "ingress-event": ingressEventSchema,
  "outbound-action": outboundActionSchema,
  "state-command": stateCommandSchema,
  "workflow-test-request": workflowTestRequestSchema,
  "workflow-test-result": workflowTestResultSchema,
} as const;

export type ContractSchemaName = keyof typeof contractSchemas;

type SchemaNode = boolean | Record<string, unknown>;

const schemaById = new Map<string, SchemaNode>(
  Object.values(contractSchemas).map((schema) => [schema.$id, schema]),
);

const supportedKeywords = new Set([
  "$comment",
  "$defs",
  "$id",
  "$ref",
  "$schema",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "description",
  "enum",
  "format",
  "items",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "not",
  "oneOf",
  "pattern",
  "properties",
  "required",
  "title",
  "type",
  "uniqueItems",
  "x-lexia-contract-status",
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

export class SchemaDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaDefinitionError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new ContractValidationError(`${path} ${message}`);
}

function failDefinition(path: string, message: string): never {
  throw new SchemaDefinitionError(`${path} ${message}`);
}

function assertSchemaDefinition(
  schema: SchemaNode,
  path: string,
  validated: Set<SchemaNode>,
  active: Set<SchemaNode>,
  root: SchemaNode = schema,
) {
  if (typeof schema === "boolean") return;
  if (!isObject(schema)) {
    failDefinition(path, "must be a JSON Schema object or boolean.");
  }
  if (active.has(schema)) {
    failDefinition(path, "uses a recursive $ref, which is not supported locally.");
  }
  if (validated.has(schema)) return;
  active.add(schema);

  for (const key of Object.keys(schema)) {
    if (!supportedKeywords.has(key)) {
      failDefinition(
        path,
        `uses unsupported schema keyword ${JSON.stringify(key)}.`,
      );
    }
  }

  if ("type" in schema) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const validTypes = new Set([
      "array",
      "boolean",
      "integer",
      "null",
      "number",
      "object",
      "string",
    ]);
    if (
      types.length === 0 ||
      !types.every((type) => typeof type === "string" && validTypes.has(type))
    ) {
      failDefinition(path, "declares an unsupported type.");
    }
  }

  if ("required" in schema) {
    if (
      !Array.isArray(schema.required) ||
      !schema.required.every((entry) => typeof entry === "string")
    ) {
      failDefinition(path, "has an invalid required declaration.");
    }
    if (new Set(schema.required).size !== schema.required.length) {
      failDefinition(path, "declares duplicate required properties.");
    }
  }

  if ("enum" in schema && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    failDefinition(path, "has an invalid enum declaration.");
  }
  if (
    "format" in schema &&
    schema.format !== "uuid" &&
    schema.format !== "date-time"
  ) {
    failDefinition(
      path,
      `uses unsupported format ${JSON.stringify(schema.format)}.`,
    );
  }
  if ("pattern" in schema) {
    if (typeof schema.pattern !== "string") {
      failDefinition(path, "has an invalid pattern.");
    }
    try {
      new RegExp(schema.pattern, "u");
    } catch {
      failDefinition(path, "has an invalid pattern.");
    }
  }

  for (const keyword of ["minItems", "maxItems", "minLength", "maxLength"] as const) {
    if (
      keyword in schema &&
      (!Number.isSafeInteger(schema[keyword]) || Number(schema[keyword]) < 0)
    ) {
      failDefinition(path, `has an invalid ${keyword} declaration.`);
    }
  }
  for (const keyword of ["minimum", "maximum"] as const) {
    if (
      keyword in schema &&
      (typeof schema[keyword] !== "number" || !Number.isFinite(schema[keyword]))
    ) {
      failDefinition(path, `has an invalid ${keyword} declaration.`);
    }
  }
  if ("uniqueItems" in schema && typeof schema.uniqueItems !== "boolean") {
    failDefinition(path, "has an invalid uniqueItems declaration.");
  }

  if ("properties" in schema) {
    if (!isObject(schema.properties)) {
      failDefinition(path, "has invalid properties.");
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      assertSchemaDefinition(
        child as SchemaNode,
        `${path}.properties.${key}`,
        validated,
        active,
        root,
      );
    }
  }

  if ("$defs" in schema) {
    if (!isObject(schema.$defs)) failDefinition(path, "has invalid $defs.");
    for (const [key, child] of Object.entries(schema.$defs)) {
      assertSchemaDefinition(
        child as SchemaNode,
        `${path}.$defs.${key}`,
        validated,
        active,
        root,
      );
    }
  }

  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    if (!(keyword in schema)) continue;
    const children = schema[keyword];
    if (!Array.isArray(children) || children.length === 0) {
      failDefinition(path, `has an invalid ${keyword} declaration.`);
    }
    children.forEach((child, index) =>
      assertSchemaDefinition(
        child as SchemaNode,
        `${path}.${keyword}[${index}]`,
        validated,
        active,
        root,
      ),
    );
  }

  for (const keyword of ["items", "not"] as const) {
    if (keyword in schema) {
      assertSchemaDefinition(
        schema[keyword] as SchemaNode,
        `${path}.${keyword}`,
        validated,
        active,
        root,
      );
    }
  }

  if (
    "additionalProperties" in schema &&
    typeof schema.additionalProperties !== "boolean"
  ) {
    assertSchemaDefinition(
      schema.additionalProperties as SchemaNode,
      `${path}.additionalProperties`,
      validated,
      active,
      root,
    );
  }

  if ("$ref" in schema) {
    if (typeof schema.$ref !== "string") {
      failDefinition(path, "has an invalid $ref.");
    }
    const referenced = resolveReference(
      schema.$ref,
      root,
      path,
      failDefinition,
    );
    assertSchemaDefinition(
      referenced,
      `${path}.$ref`,
      validated,
      active,
      schema.$ref.startsWith("#/") ? root : referenced,
    );
  }

  active.delete(schema);
  validated.add(schema);
}

function decodeJsonPointerPart(value: string) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveReference(
  reference: string,
  root: SchemaNode,
  path: string,
  reject: (path: string, message: string) => never = failDefinition,
): SchemaNode {
  if (reference.startsWith("#/")) {
    let current: unknown = root;
    for (const part of reference.slice(2).split("/")) {
      if (!isObject(current)) reject(path, `cannot resolve $ref ${reference}.`);
      current = current[decodeJsonPointerPart(part)];
    }
    if (typeof current !== "boolean" && !isObject(current)) {
      reject(path, `cannot resolve $ref ${reference}.`);
    }
    return current;
  }

  const resolved = schemaById.get(reference);
  if (!resolved) reject(path, `uses unsupported external $ref ${reference}.`);
  return resolved;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => sameJsonValue(item, right[index]))
    );
  }
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && sameJsonValue(left[key], right[key]),
      )
    );
  }
  return false;
}

function matchesType(value: unknown, type: string) {
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isSafeInteger(value);
  if (type === "null") return value === null;
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "object") return isObject(value);
  return typeof value === type;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isStrictDateTime(value: string) {
  const match = dateTimePattern.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const daysByMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysByMonth[month - 1]! &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    offsetHour >= 0 &&
    offsetHour <= 23 &&
    offsetMinute >= 0 &&
    offsetMinute <= 59
  );
}

function validateFormat(value: string, format: unknown, path: string) {
  if (format === "uuid") {
    if (!uuidPattern.test(value)) fail(path, "must be a UUID.");
    return;
  }
  if (format === "date-time") {
    if (!isStrictDateTime(value)) {
      fail(path, "must be an RFC 3339 date-time.");
    }
    return;
  }
  failDefinition(path, `uses unsupported format ${JSON.stringify(format)}.`);
}

function validateNode(
  schema: SchemaNode,
  value: unknown,
  path: string,
  root: SchemaNode,
  referenceStack: Set<SchemaNode>,
) {
  if (schema === true) return;
  if (schema === false) fail(path, "is rejected by its schema.");

  if (schema.$ref !== undefined) {
    const reference = String(schema.$ref);
    const referenced = resolveReference(reference, root, path);
    if (referenceStack.has(referenced)) {
      failDefinition(
        path,
        "uses a recursive $ref, which is not supported locally.",
      );
    }
    const nextStack = new Set(referenceStack).add(referenced);
    validateNode(
      referenced,
      value,
      path,
      reference.startsWith("#/") ? root : referenced,
      nextStack,
    );
  }

  const declaredTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type === undefined
      ? []
      : [schema.type];
  if (
    declaredTypes.length > 0 &&
    !declaredTypes.some((type) => matchesType(value, String(type)))
  ) {
    fail(path, `must match type ${declaredTypes.join(" or ")}.`);
  }

  if ("const" in schema && !sameJsonValue(value, schema.const)) {
    fail(path, "does not match its constant value.");
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => sameJsonValue(value, candidate))
  ) {
    fail(path, "does not match an allowed enum value.");
  }

  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) continue;
    const matches = branches.filter((branch) => {
      try {
        validateNode(branch as SchemaNode, value, path, root, referenceStack);
        return true;
      } catch (error) {
        if (!(error instanceof ContractValidationError)) throw error;
        return false;
      }
    }).length;
    if (keyword === "allOf" && matches !== branches.length) {
      fail(path, "does not satisfy allOf.");
    }
    if (keyword === "anyOf" && matches === 0) fail(path, "does not satisfy anyOf.");
    if (keyword === "oneOf" && matches !== 1) fail(path, "does not satisfy oneOf.");
  }

  if (schema.not !== undefined) {
    let matched = true;
    try {
      validateNode(schema.not as SchemaNode, value, path, root, referenceStack);
    } catch (error) {
      if (!(error instanceof ContractValidationError)) throw error;
      matched = false;
    }
    if (matched) fail(path, "matches a forbidden schema.");
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      fail(path, `must contain at least ${schema.minLength} characters.`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      fail(path, `must contain at most ${schema.maxLength} characters.`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      fail(path, "does not match its pattern.");
    }
    if (schema.format !== undefined) validateFormat(value, schema.format, path);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      fail(path, `must be at least ${schema.minimum}.`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      fail(path, `must be at most ${schema.maximum}.`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      fail(path, `must contain at least ${schema.minItems} items.`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      fail(path, `must contain at most ${schema.maxItems} items.`);
    }
    if (
      schema.uniqueItems === true &&
      value.some((item, index) =>
        value.slice(0, index).some((previous) => sameJsonValue(previous, item)),
      )
    ) {
      fail(path, "must contain unique items.");
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) =>
        validateNode(
          schema.items as SchemaNode,
          item,
          `${path}[${index}]`,
          root,
          referenceStack,
        ),
      );
    }
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (typeof required === "string" && !Object.hasOwn(value, required)) {
          fail(`${path}.${required}`, "is required.");
        }
      }
    }

    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        validateNode(child as SchemaNode, value[key], `${path}.${key}`, root, referenceStack);
      }
    }

    for (const key of Object.keys(value)) {
      if (Object.hasOwn(properties, key)) continue;
      if (schema.additionalProperties === false) fail(`${path}.${key}`, "is not allowed.");
      if (isObject(schema.additionalProperties) || typeof schema.additionalProperties === "boolean") {
        validateNode(
          schema.additionalProperties as SchemaNode,
          value[key],
          `${path}.${key}`,
          root,
          referenceStack,
        );
      }
    }
  }
}

export function assertJsonSchemaValue(
  schema: JsonObject,
  value: JsonValue,
  path = "value",
) {
  const schemaNode = schema as SchemaNode;
  assertSchemaDefinition(schemaNode, "schema", new Set(), new Set());
  validateNode(schemaNode, value, path, schemaNode, new Set([schemaNode]));
}

export function assertContractSchema(name: ContractSchemaName, value: unknown) {
  const schema = contractSchemas[name] as SchemaNode;
  assertSchemaDefinition(schema, `${name} schema`, new Set(), new Set());
  validateNode(schema, value, name, schema, new Set([schema]));
}
