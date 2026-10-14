import { createHash } from "node:crypto";

import {
  sanitizeUnknown,
  type N8nWorkflow as SourceWorkflow,
} from "../build-miranda-v2-review-package";

export type Connection = { node: string; type: string; index: number };

export type N8nNode = {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  disabled?: boolean;
  onError?: string;
  retryOnFail?: boolean;
  [key: string]: unknown;
};

export type CandidateWorkflow = {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, Record<string, Connection[][]>>;
  pinData: Record<string, never>;
  active: false;
  settings: Record<string, unknown>;
  tags: [];
};

export const CANDIDATE_PREFIX = "LEXIA V2 CANDIDATO - MIRANDA";

export function stableUuid(seed: string) {
  const value = createHash("sha256").update(seed).digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

export class WorkflowBuilder {
  readonly nodes: N8nNode[] = [];
  readonly connections: CandidateWorkflow["connections"] = {};
  private index = 0;

  constructor(private readonly shortName: string) {}

  add(
    name: string,
    type: string,
    typeVersion: number,
    parameters: Record<string, unknown>,
    options: Partial<N8nNode> = {},
  ) {
    this.index += 1;
    const node: N8nNode = {
      id: stableUuid(`${this.shortName}:${name}:${this.index}`),
      name,
      type,
      typeVersion,
      position: [this.index * 260, 0],
      parameters,
      ...options,
    };
    this.nodes.push(node);
    return name;
  }

  connect(
    from: string,
    to: string,
    output = 0,
    type = "main",
    targetIndex = 0,
  ) {
    const byType = (this.connections[from] ??= {});
    const outputs = (byType[type] ??= []);
    while (outputs.length <= output) outputs.push([]);
    outputs[output]!.push({ node: to, type, index: targetIndex });
  }

  node(name: string) {
    const result = this.nodes.find((node) => node.name === name);
    if (!result) throw new Error(`Candidate node not found: ${name}`);
    return result;
  }

  done(): CandidateWorkflow {
    return {
      name: `${CANDIDATE_PREFIX} - ${this.shortName}`,
      nodes: this.nodes,
      connections: this.connections,
      pinData: {},
      active: false,
      settings: {
        executionOrder: "v1",
        saveManualExecutions: true,
        saveExecutionProgress: true,
        saveDataErrorExecution: "all",
        saveDataSuccessExecution: "all",
      },
      tags: [],
    };
  }
}

export function workflow(name: string) {
  return new WorkflowBuilder(name);
}

export function trigger(builder: WorkflowBuilder, name = "Receber contrato") {
  return builder.add(name, "n8n-nodes-base.executeWorkflowTrigger", 1.1, {
    inputSource: "passthrough",
  });
}

export function code(
  builder: WorkflowBuilder,
  name: string,
  jsCode: string,
  options: Partial<N8nNode> = {},
) {
  return builder.add(
    name,
    "n8n-nodes-base.code",
    2,
    { jsCode: jsCode.trim() },
    options,
  );
}

export function ifNode(
  builder: WorkflowBuilder,
  name: string,
  expression: string,
) {
  return builder.add(name, "n8n-nodes-base.if", 2, {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
      conditions: [
        {
          id: stableUuid(`${name}:condition`),
          leftValue: `={{ ${expression} }}`,
          rightValue: "",
          operator: { type: "boolean", operation: "true", singleValue: true },
        },
      ],
      combinator: "and",
    },
    options: {},
  });
}

export function switchNode(
  builder: WorkflowBuilder,
  name: string,
  expression: string,
  values: string[],
) {
  return builder.add(name, "n8n-nodes-base.switch", 3.2, {
    rules: {
      values: values.map((value) => ({
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: stableUuid(`${name}:${value}`),
              leftValue: `={{ ${expression} }}`,
              rightValue: value,
              operator: { type: "string", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        renameOutput: true,
        outputKey: value,
      })),
    },
    options: { fallbackOutput: "extra" },
  });
}

export function subworkflow(
  builder: WorkflowBuilder,
  name: string,
  target: string,
) {
  return builder.add(name, "n8n-nodes-base.executeWorkflow", 1.1, {
    source: "database",
    workflowId: {
      __rl: true,
      mode: "list",
      value: "",
      cachedResultName: `${CANDIDATE_PREFIX} - ${target}`,
    },
    options: { waitForSubWorkflow: true },
  });
}

export function rpc(
  builder: WorkflowBuilder,
  name: string,
  rpcName?: string,
) {
  const path = rpcName
    ? `'/${rpcName}'`
    : "'/' + encodeURIComponent($json.rpc_name)";
  return builder.add(
    name,
    "n8n-nodes-base.httpRequest",
    4.2,
    {
      method: "POST",
      url: `={{ $env.LEXIA_CENTRAL_SUPABASE_URL + '/rest/v1/rpc' + ${path} }}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpCustomAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Content-Type", value: "application/json" }],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ $json.rpc_body }}",
      options: {
        response: {
          response: {
            fullResponse: false,
            outputPropertyName: "body",
            responseFormat: "text",
          },
        },
        timeout: 12000,
      },
    },
    { retryOnFail: false, onError: "stopWorkflow" },
  );
}

export function rest(
  builder: WorkflowBuilder,
  name: string,
  pathExpression: string,
) {
  return builder.add(
    name,
    "n8n-nodes-base.httpRequest",
    4.2,
    {
      method: "GET",
      url: `={{ $env.LEXIA_CENTRAL_SUPABASE_URL + ${pathExpression} }}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpCustomAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Accept", value: "application/json" }],
      },
      options: {
        response: { response: { fullResponse: true, responseFormat: "json" } },
        timeout: 12000,
      },
    },
    { retryOnFail: false, onError: "stopWorkflow" },
  );
}

export function redisProjection(
  builder: WorkflowBuilder,
  name: string,
  keyExpression: string,
  valueExpression: string,
  ttlSeconds: number,
) {
  return builder.add(
    name,
    "n8n-nodes-base.redis",
    1,
    {
      operation: "set",
      key: `={{ ${keyExpression} }}`,
      value: `={{ ${valueExpression} }}`,
      expire: true,
      ttl: ttlSeconds,
    },
    { retryOnFail: false, onError: "stopWorkflow" },
  );
}

export function responseBody(nodeName: string) {
  return `(() => { const items = $('${nodeName}').all(); if (items.length !== 1) throw new Error('${nodeName.replaceAll("'", "")} output cardinality invalid'); const value = items[0].json; const raw = value.body ?? value; if (typeof raw !== 'string') return raw; const text = raw.trim(); if (!text) return null; try { return JSON.parse(text); } catch { return text; } })()`;
}

export function cloneNode(
  source: SourceWorkflow,
  sourceName: string,
  targetName = sourceName,
): N8nNode {
  const original = source.nodes.find((node) => node.name === sourceName);
  if (!original) throw new Error(`Source node not found: ${source.name} / ${sourceName}`);
  const sanitized = sanitizeUnknown(structuredClone(original)) as Record<string, unknown>;
  const sanitizedParameters =
    (sanitized.parameters as Record<string, unknown> | undefined) ?? {};
  const originalParameters =
    (original.parameters as Record<string, unknown> | undefined) ?? {};

  // Public model identifiers can end in a release date. The broad phone scrubber
  // must not turn a valid selector such as claude-...-20251001 into an invalid model.
  if (String(original.type).startsWith("@n8n/n8n-nodes-langchain.lm")) {
    for (const key of ["model", "modelName"]) {
      const selector = originalParameters[key];
      const value =
        typeof selector === "string"
          ? selector
          : selector && typeof selector === "object"
            ? (selector as Record<string, unknown>).value
            : undefined;
      if (
        typeof value === "string" &&
        /^(?:claude|gpt|gemini|o\d|text-embedding)[A-Za-z0-9._:-]{0,120}$/i.test(value)
      ) {
        sanitizedParameters[key] = structuredClone(selector);
      }
    }
  }
  delete sanitized.credentials;
  delete sanitized.webhookId;
  delete sanitized.id;
  delete sanitized.position;
  delete sanitized.disabled;
  return {
    id: stableUuid(`${source.name}:${sourceName}:${targetName}`),
    name: targetName,
    type: String(sanitized.type ?? original.type),
    position: [0, 0] as [number, number],
    parameters: sanitizedParameters,
    typeVersion: Number(sanitized.typeVersion ?? 1),
    ...(typeof sanitized.onError === "string" ? { onError: sanitized.onError } : {}),
    ...(typeof sanitized.retryOnFail === "boolean"
      ? { retryOnFail: sanitized.retryOnFail }
      : {}),
  };
}

export function appendClone(
  builder: WorkflowBuilder,
  source: SourceWorkflow,
  sourceName: string,
  targetName = sourceName,
) {
  const node = cloneNode(source, sourceName, targetName);
  return builder.add(targetName, node.type, node.typeVersion, node.parameters, {
    onError: node.onError,
    retryOnFail: node.retryOnFail,
  });
}

export function copyConnections(
  builder: WorkflowBuilder,
  source: SourceWorkflow,
  kept: Set<string>,
) {
  const connections = source.connections as unknown as Record<
    string,
    Record<string, Connection[][]>
  >;
  for (const [from, byType] of Object.entries(connections)) {
    if (!kept.has(from)) continue;
    for (const [type, outputs] of Object.entries(byType)) {
      outputs.forEach((branch, output) => {
        branch.forEach((connection) => {
          if (kept.has(connection.node)) {
            builder.connect(from, connection.node, output, type, connection.index);
          }
        });
      });
    }
  }
}

export function removeConnection(
  builder: WorkflowBuilder,
  from: string,
  to: string,
) {
  const byType = builder.connections[from];
  if (!byType) return;
  for (const outputs of Object.values(byType)) {
    for (const branch of outputs) {
      const retained = branch.filter((connection) => connection.node !== to);
      branch.splice(0, branch.length, ...retained);
    }
  }
}

export function uuidExpression(seedExpression: string) {
  return `(() => {
  const seedText = String(${seedExpression});
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < seedText.length; i++) {
    h1 = Math.imul(h1 ^ seedText.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (seedText.charCodeAt(i) + i), 0x85ebca6b) >>> 0;
  }
  const hex = [h1, h2, h1 ^ h2, Math.imul(h1, 31) ^ h2]
    .map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
  return hex.slice(0,8) + '-' + hex.slice(8,12) + '-4' + hex.slice(13,16) + '-8' + hex.slice(17,20) + '-' + hex.slice(20,32);
})()`;
}
