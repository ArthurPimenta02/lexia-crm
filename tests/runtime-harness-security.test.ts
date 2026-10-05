import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";

import {
  WorkflowConfigurationError,
  validateWorkflowWebhookUrl,
} from "../lib/workflows/contracts";
import {
  assertRuntimeHarnessMode,
  assertRuntimeManifestCleanupContract,
  assertTemporaryInstallIncludesDevDependencies,
  buildRuntimeManifestCleanupChecks,
  temporaryNpmInstallArgs,
} from "../scripts/lib/runtime-harness-contracts.mjs";
import {
  assertRuntimeResponseProtectionCoverage,
  buildRuntimeResponseForbiddenValues,
  classifyRuntimeActionMessage,
  extractRuntimeActionStateCandidates,
  findRuntimeResponseLeaks,
  runtimeResponseContainsText,
  summarizeRuntimeActionResponse,
} from "../scripts/lib/runtime-response-audit.mjs";
import {
  createRuntimeAppProxy,
  decodeRuntimeProxyBody,
} from "../scripts/lib/runtime-app-proxy.mjs";

test("runtime receiver requires allowlisted HTTPS without production TLS bypass", () => {
  const allowedHosts = new Set(["localhost"]);

  assert.equal(
    validateWorkflowWebhookUrl(
      "https://localhost:9443/workflow/v2",
      allowedHosts,
      { allowLocalHttp: false },
    ),
    "https://localhost:9443/workflow/v2",
  );

  assert.throws(
    () =>
      validateWorkflowWebhookUrl(
        "http://localhost:9443/workflow/v2",
        allowedHosts,
        { allowLocalHttp: false },
      ),
    WorkflowConfigurationError,
  );

  assert.throws(
    () =>
      validateWorkflowWebhookUrl(
        "https://127.0.0.1:9443/workflow/v2",
        allowedHosts,
        { allowLocalHttp: false },
      ),
    /não está autorizado/,
  );
});

test("loopback proxy captures the exact action response without becoming a browser reader", async (t) => {
  const payload = "Configurações salvas com sucesso.";
  const upstream = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/x-component" });
    response.end(payload);
  });
  await new Promise<void>((resolvePromise, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = upstream.address();
  assert.ok(address && typeof address !== "string");

  const proxy = await createRuntimeAppProxy({
    targetOrigin: `http://127.0.0.1:${address.port}`,
  });
  t.after(async () => {
    await proxy.close();
    await new Promise<void>((resolvePromise, reject) =>
      upstream.close((error) =>
        error ? reject(error) : resolvePromise(),
      ),
    );
  });

  const index = proxy.getActionCount();
  const response = await fetch(`${proxy.origin}/settings`, {
    body: "synthetic",
    headers: { "next-action": "synthetic-action" },
    method: "POST",
  });
  assert.equal(await response.text(), payload);

  const captured = await proxy.waitForAction(index);
  assert.equal(captured.hasNextAction, true);
  assert.equal(captured.path, "/settings");
  assert.equal(decodeRuntimeProxyBody(captured).toString("utf8"), payload);

  await assert.rejects(
    () => createRuntimeAppProxy({ targetOrigin: "https://example.com" }),
    /loopback HTTP/,
  );
});

test("runtime response audit covers stored destinations and server secrets", () => {
  const values = buildRuntimeResponseForbiddenValues({
    analystSecret: "synthetic-analyst-secret",
    serviceRoleKey: "synthetic-service-role-key",
    workflowV1: "https://localhost:9443/workflow/v1",
    workflowV2: "https://localhost:9443/workflow/v2",
  });

  assert.doesNotThrow(() => assertRuntimeResponseProtectionCoverage(values));
  assert.deepEqual(
    findRuntimeResponseLeaks(
      "RSC contains https://localhost:9443/workflow/v2",
      values,
    ),
    ["stored_workflow_v2"],
  );

  const weakenedProtection = new Map(values);
  weakenedProtection.delete("stored_workflow_v1");
  assert.throws(
    () => assertRuntimeResponseProtectionCoverage(weakenedProtection),
    /missing stored_workflow_v1/,
  );

  assert.equal(
    runtimeResponseContainsText(
      '1:{"message":"Configurações salvas com sucesso."}',
      "Configurações salvas com sucesso.",
    ),
    true,
  );
  assert.equal(
    runtimeResponseContainsText(
      '1:{\"message\":\"Configura\\u00e7\\u00f5es salvas com sucesso.\"}',
      "Configurações salvas com sucesso.",
    ),
    true,
  );
  assert.equal(
    runtimeResponseContainsText(
      '1:{\"message\":\"Configura\\\\u00e7\\\\u00f5es salvas com sucesso.\"}',
      "Configurações salvas com sucesso.",
    ),
    true,
  );
  assert.equal(
    runtimeResponseContainsText(
      '1:{"message":"Configuração rejeitada."}',
      "Configurações salvas com sucesso.",
    ),
    false,
  );

  assert.deepEqual(
    summarizeRuntimeActionResponse(
      '0:{"a":"$@1"}\n1:{"message":"ok","type":"success"}\n',
    ),
    {
      byteLength: 50,
      chunkKinds: { "{": 2 },
      containsDigestKey: false,
      containsErrorChunk: false,
      containsMessageKey: true,
      containsSuccessType: true,
      containsUndefinedToken: false,
      lineCount: 2,
    },
  );
  assert.deepEqual(
    summarizeRuntimeActionResponse('0:{"a":"$@1"}\n1:E{"digest":"synthetic"}\n'),
    {
      byteLength: 40,
      chunkKinds: { "{": 1, E: 1 },
      containsDigestKey: true,
      containsErrorChunk: true,
      containsMessageKey: false,
      containsSuccessType: false,
      containsUndefinedToken: false,
      lineCount: 2,
    },
  );
  assert.deepEqual(
    extractRuntimeActionStateCandidates(
      '0:{"a":"$@1"}\n1:{"message":"saved","type":"success"}\n2:I["ignored"]\n',
    ),
    [{ message: "saved", type: "success" }],
  );
  assert.deepEqual(
    classifyRuntimeActionMessage("Configurações salvas.", [
      "Configurações salvas.",
    ]),
    { kind: "exact", knownMessage: "Configurações salvas." },
  );
  assert.deepEqual(
    classifyRuntimeActionMessage("ConfiguraÃ§Ãµes salvas.", [
      "Configurações salvas.",
    ]),
    {
      kind: "utf8_bytes_interpreted_as_latin1",
      knownMessage: "Configurações salvas.",
    },
  );
  assert.deepEqual(classifyRuntimeActionMessage("unknown", ["known"]), {
    kind: "unrecognized",
    knownMessage: null,
  });
});

test("temporary Next install includes development build dependencies", () => {
  assert.deepEqual(temporaryNpmInstallArgs, ["ci", "--include=dev"]);
  assert.doesNotThrow(() =>
    assertTemporaryInstallIncludesDevDependencies(temporaryNpmInstallArgs),
  );
  assert.throws(
    () => assertTemporaryInstallIncludesDevDependencies(["ci"]),
    /--include=dev/,
  );
});

test("verification-only mode cannot install a missing runtime harness", () => {
  assert.doesNotThrow(() =>
    assertRuntimeHarnessMode({ harnessExists: true, verifyOnly: true }),
  );
  assert.throws(
    () =>
      assertRuntimeHarnessMode({ harnessExists: false, verifyOnly: true }),
    /Verification-only mode refused/,
  );
});

test("manifest cleanup uses slug for clients and remains manifest-scoped", () => {
  const clientSlugs = ["lote1_runtime_synthetic"];
  const checks = buildRuntimeManifestCleanupChecks(clientSlugs);

  assert.doesNotThrow(() => assertRuntimeManifestCleanupContract(checks));
  assert.deepEqual(
    checks.find((check) => check.table === "lexia_clientes"),
    {
      column: "slug",
      table: "lexia_clientes",
      values: clientSlugs,
    },
  );
  assert.ok(
    checks.every(
      (check) =>
        check.values.length === 1 && check.values[0] === clientSlugs[0],
    ),
  );

  const weakenedChecks = checks.map((check) =>
    check.table === "lexia_clientes"
      ? { ...check, column: "cliente_slug" }
      : check,
  );
  assert.throws(
    () => assertRuntimeManifestCleanupContract(weakenedChecks),
    /invalid key for lexia_clientes/,
  );
});

test("runtime runner keeps credentials out of the copied app and trusts TLS per process", () => {
  const source = readFileSync(
    new URL("../scripts/test-lote1-runtime-next.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /name\.startsWith\("\.env"\)/);
  assert.match(source, /NODE_EXTRA_CA_CERTS: temporary\.certificatePath/);
  assert.doesNotMatch(source, /NODE_TLS_REJECT_UNAUTHORIZED\s*:/);
  assert.match(source, /assertRuntimeResponseProtectionCoverage/);
  assert.match(source, /headerValue\("next-action"\)/);
  assert.match(source, /captureNextActionResponse/);
  assert.match(source, /request\.isNavigationRequest\(\)/);
  assert.match(source, /createRuntimeAppProxy/);
  assert.match(source, /loopback_stream_proxy/);
  assert.doesNotMatch(source, /response\.clone\(\)/);
  assert.match(source, /response\.body\(\)/);
  assert.match(source, /actionResultSuccessReturned/);
  assert.doesNotMatch(source, /networkidle/);
});

test("runtime schema is marked disposable and does not broaden workflow grants", () => {
  const schema = readFileSync(
    new URL(
      "../supabase/isolated/202610040001_lote1_runtime_next_schema.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(schema, /environment = 'isolated_test'/);
  assert.match(schema, /disposable = true/);
  assert.match(schema, /revoke all on public\.lexia_runtime_test_harness/);
  assert.doesNotMatch(schema, /grant .*lexia_workflows/i);
});
