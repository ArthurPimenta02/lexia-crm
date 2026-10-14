import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MIRANDA_SOURCES,
  sanitizeUnknown,
  sanitizeMirandaWorkflow,
  scanPackage,
  type N8nWorkflow,
} from "../scripts/build-miranda-v2-review-package";

test("sanitizer removes credentials assigned inside code strings", () => {
  const value = sanitizeUnknown({
    jsCode: [
      "const TOKEN_PROVIDER = 'opaque-provider-value-that-must-not-survive';",
      'let api_key_secondary = "another-sensitive-value";',
      "const safe_label = 'Miranda';",
      "const config = { secret: `embedded-sensitive-value` };",
    ].join("\n"),
  }) as { jsCode: string };

  assert.doesNotMatch(value.jsCode, /opaque-provider|another-sensitive|embedded-sensitive/);
  assert.equal(
    value.jsCode.match(/\[CONFIGURE_IN_N8N_CREDENTIAL\]/g)?.length,
    3,
  );
  assert.match(value.jsCode, /safe_label = 'Miranda'/);
});

function syntheticWorkflow(): N8nWorkflow {
  return {
    name: "MIRANDA SKIN EXPERT - OMNICHANNEL",
    active: true,
    id: "real-workflow-id",
    versionId: "real-version-id",
    pinData: { node: [{ json: { token: "must-not-survive" } }] },
    settings: { executionOrder: "v1" },
    connections: {},
    nodes: [
      {
        id: "source-node",
        name: "Enviar Mensagem Cliente",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [0, 0],
        credentials: { httpHeaderAuth: { id: "credential-id", name: "real" } },
        parameters: {
          url: "https://provider.example.com/send",
          headers: {
            assignments: [
              { name: "api_token", value: "sk-live-12345678901234567890" },
              { name: "phone", value: "+55 11 99999-9999" },
              { name: "permitir_envio_real", value: true },
            ],
          },
        },
      },
    ],
  };
}

test("Miranda review copy is inactive, sanitized and preserves the source", () => {
  const source = syntheticWorkflow();
  const original = JSON.stringify(source);
  const output = sanitizeMirandaWorkflow(source, MIRANDA_SOURCES[0]!);

  assert.equal(JSON.stringify(source), original, "the source export changed");
  assert.equal(output.active, false);
  assert.deepEqual(output.pinData, {});
  assert.equal(output.id, undefined);
  assert.equal(output.versionId, undefined);

  const inherited = output.nodes.find((node) => node.name === "Enviar Mensagem Cliente")!;
  assert.equal(inherited.disabled, true);
  const serialized = JSON.stringify(output);
  assert.doesNotMatch(serialized, /credential-id|sk-live|provider\.example\.com|99999-9999/);
  assert.doesNotMatch(serialized, /"credentials"/);
  assert.match(serialized, /redacted\.example\.invalid/);
  assert.match(serialized, /"permitir_envio_real","value":false/);
});

test("test webhook is authenticated and cannot reach inherited provider nodes", () => {
  const output = sanitizeMirandaWorkflow(
    syntheticWorkflow(),
    MIRANDA_SOURCES[0]!,
  );
  const webhook = output.nodes.find(
    (node) => node.name === "[LEXIA TEST] Entrada autenticada",
  )!;
  assert.equal(webhook.parameters?.authentication, "headerAuth");
  assert.equal(webhook.credentials, undefined);

  const reachable = new Set<string>();
  const queue = [webhook.name];
  while (queue.length) {
    const name = queue.shift()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    for (const branch of output.connections[name]?.main ?? []) {
      for (const next of branch) queue.push(next.node);
    }
  }
  const reachableTypes = output.nodes
    .filter((node) => reachable.has(node.name))
    .map((node) => node.type);
  assert.deepEqual(reachableTypes, [
    "n8n-nodes-base.webhook",
    "n8n-nodes-base.code",
    "n8n-nodes-base.respondToWebhook",
  ]);
  assert.equal(reachable.has("Enviar Mensagem Cliente"), false);
});

test("embedded test branch fails closed for production and requires simulation", () => {
  const output = sanitizeMirandaWorkflow(
    syntheticWorkflow(),
    MIRANDA_SOURCES[0]!,
  );
  const code = String(
    output.nodes.find((node) => node.name === "[LEXIA TEST] Validar e simular")!
      .parameters?.jsCode,
  );
  assert.match(code, /\['isolated_test','staging'\]/);
  assert.match(code, /delivery_mode !== 'simulate'/);
  assert.match(code, /expectations\.provider_send !== false/);
  assert.match(code, /provider_send_attempted: false/);
  assert.doesNotMatch(code, /https?:\/\//);
});

test("package scanner reports secret material and forbidden local files", () => {
  const root = mkdtempSync(join(tmpdir(), "lexia-package-scan-test-"));
  try {
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, ".env.local"), "TOKEN=hidden\n");
    writeFileSync(
      join(root, "nested", "bad.json"),
      JSON.stringify({ token: "secret-value", url: "postgresql://user:pass@host/db" }),
    );
    const scan = scanPackage(root);
    assert.ok(scan.disallowed.includes(".env.local"));
    assert.ok(scan.findings.some((finding) => finding.type === "database_url"));
    assert.ok(scan.findings.some((finding) => finding.type === "inline_secret_field"));
    assert.match(readFileSync(join(root, ".env.local"), "utf8"), /hidden/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("package scanner distinguishes an empty URL example from a database destination", () => {
  const root = mkdtempSync(join(tmpdir(), "lexia-package-scan-placeholder-test-"));
  try {
    writeFileSync(join(root, "README.md"), "A configuração incompleta aparece como `redis://`.\n");
    const scan = scanPackage(root);
    assert.equal(scan.findings.some((finding) => finding.type === "database_url"), false);
    assert.deepEqual(scan.disallowed, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
