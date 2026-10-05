import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { loadEnvFile } from "node:process";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createFakeRuntimeReceiver } from "./lib/fake-runtime-receiver.mjs";
import {
  createRuntimeAppProxy,
  decodeRuntimeProxyBody,
} from "./lib/runtime-app-proxy.mjs";
import {
  assertRuntimeManifestCleanupContract,
  assertTemporaryInstallIncludesDevDependencies,
  buildRuntimeManifestCleanupChecks,
  temporaryNpmInstallArgs,
} from "./lib/runtime-harness-contracts.mjs";
import {
  assertRuntimeResponseProtectionCoverage,
  buildRuntimeResponseForbiddenValues,
  classifyRuntimeActionMessage,
  extractRuntimeActionStateCandidates,
  findRuntimeResponseLeaks,
  runtimeResponseContainsText,
  summarizeRuntimeActionResponse,
} from "./lib/runtime-response-audit.mjs";
import {
  assertIsolatedRemoteIdentity,
  validateIsolatedTestTarget,
} from "./lib/target-identity.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const localEnvironmentFile =
  process.env.LEXIA_LOTE1_ENV_FILE?.trim() ||
  join(repositoryRoot, ".env.lote1.test.local");

if (existsSync(localEnvironmentFile)) {
  loadEnvFile(localEnvironmentFile);
}

const supabaseUrl = process.env.LEXIA_TEST_SUPABASE_URL?.trim();
const anonKey = process.env.LEXIA_TEST_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey =
  process.env.LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY?.trim();
const testProjectRef =
  process.env.LEXIA_TEST_SUPABASE_PROJECT_REF?.trim();
const runtimeConfirmation =
  process.env.LEXIA_RUNTIME_TEST_CONFIRM?.trim();
const runtimeDiagnosticMode =
  process.env.LEXIA_RUNTIME_DIAGNOSTIC_MODE?.trim() || "";
const runtimeProxyMode =
  process.env.LEXIA_RUNTIME_USE_APP_PROXY?.trim() || "0";
if (!["0", "1"].includes(runtimeProxyMode)) {
  console.error("LEXIA_RUNTIME_USE_APP_PROXY must be 0 or 1.");
  process.exit(2);
}
const useRuntimeAppProxy = runtimeProxyMode === "1";

const runtimeDiagnosticModes = new Set([
  "workflow_blank_update",
]);

if (runtimeDiagnosticMode && !runtimeDiagnosticModes.has(runtimeDiagnosticMode)) {
  console.error("LEXIA_RUNTIME_DIAGNOSTIC_MODE is not recognized.");
  process.exit(2);
}

let verifiedProjectRef;
try {
  ({ testProjectRef: verifiedProjectRef } = validateIsolatedTestTarget({
    anonKey,
    applicationUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    confirmation: process.env.LEXIA_TEST_CONFIRM_ISOLATED?.trim(),
    productionProjectRef:
      process.env.LEXIA_PRODUCTION_SUPABASE_PROJECT_REF?.trim(),
    protectedProjectRefs:
      process.env.LEXIA_PROTECTED_SUPABASE_PROJECT_REFS?.trim(),
    serviceRoleKey,
    testProjectRef,
    testUrl: supabaseUrl,
  }));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid isolated runtime target.",
  );
  process.exit(2);
}

const runtimeOperation = runtimeDiagnosticMode
  ? "DIAGNOSE_NEXT_RUNTIME"
  : "RUN_NEXT_RUNTIME";
const expectedRuntimeConfirmation =
  `${runtimeOperation}:${verifiedProjectRef}`;
if (runtimeConfirmation !== expectedRuntimeConfirmation) {
  console.error(
    `LEXIA_RUNTIME_TEST_CONFIRM must equal ${expectedRuntimeConfirmation}.`,
  );
  process.exit(2);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const runId = randomUUID();
const suffix = runId.replaceAll("-", "").slice(0, 12);
const syntheticSlug = `lote1_runtime_${suffix}`;
const manifest = {
  authUserIds: [],
  clientSlugs: [syntheticSlug],
  runId,
  testExecutionIds: [],
  testSessionIds: [],
  version: "lote1-runtime-next-v1",
  workflowIds: [],
};
const cleanupFailures = [];
const completedChecks = [];
let tempRoot;
let manifestPath;
let browser;
let nextProcess;
let receiver;
let runtimeAppProxy;
let testFailure = null;
const runtimeRedactionValues = new Set([serviceRoleKey, anonKey]);

function randomPassword() {
  return `Lx!${randomBytes(24).toString("base64url")}9a`;
}

function redacted(value) {
  let output = String(value ?? "");
  for (const secret of runtimeRedactionValues) {
    if (secret) output = output.replaceAll(secret, "[REDACTED]");
  }
  return output;
}

function registerRedactionValue(value) {
  if (value) runtimeRedactionValues.add(String(value));
}

async function saveManifest() {
  if (!manifestPath) return;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
}

async function countRows(table, column, values) {
  if (!values.length) return 0;
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .in(column, values);
  if (error) throw error;
  return count ?? 0;
}

async function assertCleanRemoteStart() {
  const { data: identity, error: identityError } = await admin
    .from("lexia_environment_identity")
    .select("project_ref, environment, disposable")
    .eq("id", true)
    .single();
  if (identityError) throw identityError;
  assertIsolatedRemoteIdentity(identity, verifiedProjectRef);

  const { data: harness, error: harnessError } = await admin
    .from("lexia_runtime_test_harness")
    .select("project_ref, version")
    .eq("id", true)
    .single();
  if (harnessError) throw harnessError;
  assert.equal(harness.project_ref, verifiedProjectRef);
  assert.equal(harness.version, manifest.version);

  const { data: authUsers, error: authError } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) throw authError;
  assert.equal(authUsers.users.length, 0, "Auth must be empty before the run");

  const productTables = [
    "lexia_clientes",
    "lexia_usuarios_clientes",
    "lexia_workflows",
    "lexia_testes_sessoes",
    "lexia_testes_execucoes",
    "lexia_feedbacks",
    "lexia_handoffs",
    "lexia_contactos",
    "lexia_mensagens",
    "lexia_ai_sessoes",
    "lexia_ai_mensagens",
    "lexia_ai_execucoes",
    "lexia_conversation_insights",
    "lexia_user_link_pendencias",
  ];

  for (const table of productTables) {
    const { count, error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    assert.equal(count ?? 0, 0, `${table} must be empty before the run`);
  }

  completedChecks.push("remote_identity_and_empty_state");
}

async function createSyntheticUser(label, profile) {
  const credentials = {
    email: `lexia-runtime-${label}-${suffix}@example.com`,
    password: randomPassword(),
  };
  registerRedactionValue(credentials.email);
  registerRedactionValue(credentials.password);
  const { data, error } = await admin.auth.admin.createUser({
    email: credentials.email,
    email_confirm: true,
    password: credentials.password,
  });
  if (error || !data.user) throw error ?? new Error("Auth user missing.");

  manifest.authUserIds.push(data.user.id);
  await saveManifest();

  const { error: profileError } = await admin
    .from("lexia_usuarios_clientes")
    .insert({
      cliente_slug: profile.clienteSlug,
      role: profile.role,
      status: "ativo",
      user_id: data.user.id,
    });
  if (profileError) throw profileError;

  return { ...credentials, id: data.user.id };
}

async function freePort() {
  const server = createTcpServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a local TCP port.");
  }
  const port = address.port;
  await new Promise((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return port;
}

async function prepareTemporaryApplication() {
  tempRoot = await mkdtemp(join(tmpdir(), "lexia-lote1-runtime-"));
  manifestPath = join(tempRoot, "manifest.json");
  await saveManifest();

  const appRoot = join(tempRoot, "app");
  const excludedRoots = new Set([".git", ".next", "node_modules"]);
  await cp(repositoryRoot, appRoot, {
    filter(source) {
      const relative = source.slice(repositoryRoot.length).replace(/^\//, "");
      const first = relative.split(sep)[0];
      const name = basename(source);
      if (excludedRoots.has(first)) return false;
      if (name.startsWith(".env")) return false;
      return name !== ".DS_Store";
    },
    recursive: true,
  });

  const opensslConfig = join(tempRoot, "openssl.cnf");
  const certificatePath = join(tempRoot, "localhost-cert.pem");
  const keyPath = join(tempRoot, "localhost-key.pem");
  await writeFile(
    opensslConfig,
    [
      "[req]",
      "distinguished_name=req_dn",
      "x509_extensions=v3_req",
      "prompt=no",
      "[req_dn]",
      "CN=localhost",
      "[v3_req]",
      "subjectAltName=@alt_names",
      "basicConstraints=critical,CA:TRUE",
      "keyUsage=critical,keyCertSign,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      "[alt_names]",
      "DNS.1=localhost",
      "IP.1=127.0.0.1",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  const certificateResult = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
      "-days",
      "1",
      "-config",
      opensslConfig,
      "-extensions",
      "v3_req",
    ],
    { encoding: "utf8" },
  );
  if (certificateResult.status !== 0) {
    throw new Error("Could not generate the temporary localhost certificate.");
  }

  return {
    appRoot,
    certificate: await readFile(certificatePath),
    certificatePath,
    key: await readFile(keyPath),
  };
}

function runChecked(label, command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    const details = redacted(
      [result.stdout, result.stderr].filter(Boolean).join("\n"),
    );
    throw new Error(`${label} failed.\n${details.slice(-6000)}`);
  }
}

async function waitForNext(appUrl, logs) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (nextProcess && nextProcess.exitCode !== null) {
      throw new Error(`Next exited before readiness.\n${logs().slice(-4000)}`);
    }
    try {
      const response = await fetch(`${appUrl}/login`, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Next did not become ready.\n${logs().slice(-4000)}`);
}

function responseAuditor(page, appUrl, forbiddenValues) {
  const pending = [];
  const violations = [];

  page.on("response", (response) => {
    if (!response.url().startsWith(appUrl)) return;
    const contentType = response.headers()["content-type"] ?? "";
    if (
      !/text|json|javascript|x-component/i.test(contentType) ||
      [204, 205, 304].includes(response.status())
    ) {
      return;
    }

    pending.push(async () => {
      try {
        const body = await response.body();
          for (const label of findRuntimeResponseLeaks(
            body,
            forbiddenValues,
          )) {
            violations.push({ label, url: response.url() });
          }
      } catch {
        // Navigational responses may no longer be retained by Chromium.
      }
    });
  });

  return {
    async assertClean() {
      await Promise.all(pending.splice(0).map((audit) => audit()));
      assert.deepEqual(
        violations.splice(0),
        [],
        "A private runtime value was returned to the browser",
      );
    },
  };
}

async function login(page, appUrl, credentials, expectedPath) {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === expectedPath, {
    timeout: 20_000,
  });
}

const knownSettingsActionMessages = [
  "Configurações salvas com sucesso.",
  "Acesso restrito à administração da Lexia.",
  "Preencha os dados obrigatórios do cliente.",
  "Status do workflow inválido.",
  "Preencha nome e tipo. A URL é obrigatória apenas ao criar um workflow.",
  "Cliente não encontrado.",
  "Não foi possível atualizar o cliente.",
  "Cliente salvo, mas o workflow não foi salvo",
  "Cliente salvo, mas não foi possível salvar o workflow.",
];

function captureNextActionResponse(page, targetUrl) {
  return new Promise((resolvePromise, reject) => {
    let matched = false;
    const timeout = setTimeout(() => {
      page.off("response", onResponse);
      reject(new Error("Timed out waiting for the correlated Server Action"));
    }, 10_000);

    async function onResponse(response) {
      if (matched) return;

      const request = response.request();
      if (request.url() !== targetUrl || request.method() !== "POST") {
        return;
      }

      const nextActionHeader = await request.headerValue("next-action");
      if (!nextActionHeader?.trim()) return;

      matched = true;
      clearTimeout(timeout);
      page.off("response", onResponse);

      resolvePromise({
        actionRequestWasNavigation: request.isNavigationRequest(),
        contentType: response.headers()["content-type"] ?? "",
        hasActionRedirectHeader: Boolean(
          response.headers()["x-action-redirect"],
        ),
        hasActionRevalidatedHeader: Boolean(
          response.headers()["x-action-revalidated"],
        ),
        nextActionHeaderPresent: true,
        response,
        responseStatus: response.status(),
      });
    }

    page.on("response", onResponse);
  });
}

async function submitSettingsForm(
  page,
  {
    appProxy,
    clientName,
    expectedMessage = "Configurações salvas com sucesso.",
    expectedType = "success",
    expectRefresh = true,
    forbiddenValues,
    webhookUrl,
    workflowName,
  },
) {
  const form = page.locator("form").filter({
    has: page.locator('input[name="workflow_nome"]'),
  });
  await form.waitFor({ state: "visible" });
  await form.locator('input[name="webhook_url"]').fill(webhookUrl);
  if (clientName !== undefined) {
    await form.locator('input[name="nome"]').fill(clientName);
  }
  if (workflowName !== undefined) {
    await form.locator('input[name="workflow_nome"]').fill(workflowName);
  }

  const saveButton = form.getByRole("button", {
    exact: true,
    name: "Salvar configurações",
  });
  const formVisibleBefore = await form.isVisible();
  const saveButtonVisibleBefore = await saveButton.isVisible();
  const saveButtonEnabledBefore = await saveButton.isEnabled();

  assert.equal(formVisibleBefore, true, "Settings form is not visible");
  assert.equal(
    saveButtonVisibleBefore,
    true,
    "Settings submit button is not visible",
  );
  assert.equal(
    saveButtonEnabledBefore,
    true,
    "Settings submit button is not enabled",
  );

  await form.evaluate((element) => {
    const state = { pendingObserved: false };
    const inspect = () => {
      const buttons = Array.from(element.querySelectorAll("button"));
      if (
        buttons.some(
          (button) => button.textContent?.trim() === "Salvando...",
        )
      ) {
        state.pendingObserved = true;
      }
    };
    const observer = new globalThis.MutationObserver(inspect);
    observer.observe(element, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    inspect();
    globalThis.__lexiaLote1ActionLifecycle = { observer, state };
  });
  const proxyActionIndex = appProxy?.getActionCount() ?? null;

  const targetUrl = page.url();
  const target = new URL(targetUrl);
  let actionRequestCount = 0;
  let routerRefreshRequestCount = 0;
  const requestInspections = [];
  const isRouterRefreshRequest = async (request) => {
    if (request.method() !== "GET") return false;
    const requestUrl = new URL(request.url());
    if (requestUrl.pathname !== target.pathname) return false;
    const headers = await request.allHeaders();
    return headers.rsc === "1";
  };
  const onRequest = (request) => {
    requestInspections.push(
      (async () => {
        const headers = await request.allHeaders();
        if (
          request.method() === "POST" &&
          request.url() === targetUrl &&
          Boolean(headers["next-action"]?.trim())
        ) {
          actionRequestCount += 1;
        }
        if (await isRouterRefreshRequest(request)) {
          routerRefreshRequestCount += 1;
        }
      })(),
    );
  };
  const mainFrameNavigationPaths = [];
  const onFrameNavigated = (frame) => {
    if (frame !== page.mainFrame()) return;
    mainFrameNavigationPaths.push(new URL(frame.url()).pathname);
  };
  page.on("request", onRequest);
  page.on("framenavigated", onFrameNavigated);
  const actionResponsePromise = captureNextActionResponse(page, targetUrl);
  const refreshResponsePromise = expectRefresh
    ? page.waitForResponse(
        async (response) =>
          isRouterRefreshRequest(response.request()),
        { timeout: 10_000 },
      )
    : null;

  let actionResponse;
  try {
    [actionResponse] = await Promise.all([
      actionResponsePromise,
      saveButton.click(),
    ]);
  } catch (error) {
    page.off("request", onRequest);
    page.off("framenavigated", onFrameNavigated);
    throw error;
  }

  const waitForExpectedUi = () =>
    page.waitForFunction(
      ({ message }) => {
        const workflowInput = globalThis.document.querySelector(
          'input[name="workflow_nome"]',
        );
        const settingsForm = workflowInput?.closest("form");
        if (!settingsForm) return false;

        const messageRendered = Array.from(
          settingsForm.querySelectorAll("p"),
        ).some((element) => element.textContent?.trim() === message);
        const readyButton = Array.from(
          settingsForm.querySelectorAll('button[type="submit"]'),
        ).some(
          (button) =>
            button.textContent?.trim() === "Salvar configurações" &&
            !button.disabled,
        );

        return messageRendered && readyButton;
      },
      { message: expectedMessage },
      { timeout: 5_000 },
    );

  let uiSettled = true;
  try {
    await waitForExpectedUi();
    if (refreshResponsePromise) {
      await refreshResponsePromise;
      if (clientName !== undefined) {
        await page
          .getByRole("heading", { exact: true, name: clientName })
          .waitFor({ state: "visible", timeout: 10_000 });
      }
      if (workflowName) {
        await page
          .getByText(workflowName, { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 10_000 });
      }
      await waitForExpectedUi();
    }
    await page.evaluate(
      () =>
        new Promise((resolvePromise) =>
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolvePromise),
          ),
        ),
    );
  } catch {
    uiSettled = false;
  }
  await Promise.all(requestInspections);
  page.off("request", onRequest);
  page.off("framenavigated", onFrameNavigated);

  let renderedMessages = [];
  let finalButtons = [];
  try {
    renderedMessages = await form
      .locator("p.rounded-md.border.px-3.py-2.text-sm")
      .allTextContents();
    finalButtons = await form
      .locator('button[type="submit"]')
      .evaluateAll((buttons) =>
        buttons.map((button) => ({
          disabled: button.disabled,
          text: button.textContent?.trim() ?? "",
        })),
      );
  } catch {
    // Navigation state is reported explicitly below.
  }
  const saveButtonReady = finalButtons.some(
    (button) =>
      button.text === "Salvar configurações" && button.disabled === false,
  );
  let pendingObserved = false;
  try {
    pendingObserved = await page.evaluate(() => {
      const lifecycle = globalThis.__lexiaLote1ActionLifecycle;
      lifecycle?.observer.disconnect();
      return Boolean(lifecycle?.state.pendingObserved);
    });
  } catch {
    // A replaced document is itself visible in the other lifecycle signals.
  }

  let responseBody = Buffer.alloc(0);
  let responseBodyAvailable = false;
  const responseBodyErrorCode = null;
  let responseBodySource = "not_requested";
  if (appProxy) {
    const proxiedAction = await appProxy.waitForAction(proxyActionIndex);
    assert.equal(proxiedAction.hasNextAction, true);
    assert.equal(proxiedAction.method, "POST");
    assert.equal(
      proxiedAction.path,
      `${new URL(targetUrl).pathname}${new URL(targetUrl).search}`,
    );
    assert.equal(proxiedAction.status, actionResponse.responseStatus);
    assert.equal(
      proxiedAction.contentType,
      actionResponse.contentType,
      "Proxy and Playwright observed different action responses",
    );
    responseBody = decodeRuntimeProxyBody(proxiedAction);
    responseBodyAvailable = true;
    responseBodySource = "loopback_stream_proxy";
  }

  if (forbiddenValues && responseBodyAvailable) {
    assert.deepEqual(
      findRuntimeResponseLeaks(responseBody, forbiddenValues),
      [],
      "The correlated Server Action returned a private runtime value",
    );
  }

  const responseBodyText = responseBody.toString("utf8");
  const responseStructure = summarizeRuntimeActionResponse(responseBody);
  const responseActionStates = extractRuntimeActionStateCandidates(responseBody);
  const classifiedActionStates = responseActionStates.map((state) => ({
    messageClassification: classifyRuntimeActionMessage(
      state.message,
      knownSettingsActionMessages,
    ),
    messageLength: state.message?.length ?? null,
    type: [null, "error", "success"].includes(state.type)
      ? state.type
      : "[UNRECOGNIZED_TYPE]",
  }));
  const expectedRendered = renderedMessages.includes(expectedMessage);
  const actionResultExpectedReturnedExactly = responseBodyAvailable
    ? runtimeResponseContainsText(responseBodyText, expectedMessage)
    : null;
  const actionResultExpectedReturned =
    actionResultExpectedReturnedExactly ||
    classifiedActionStates.some(
      (state) =>
        state.type === expectedType &&
        state.messageClassification.knownMessage === expectedMessage,
    ) ||
    (!responseBodyAvailable &&
      actionResponse.responseStatus === 200 &&
      expectedRendered);
  const expectedSuccessMessage = "Configurações salvas com sucesso.";
  const actionResultSuccessReturnedExactly = responseBodyAvailable
    ? runtimeResponseContainsText(responseBodyText, expectedSuccessMessage)
    : null;
  const actionResultSuccessReturned =
    actionResultSuccessReturnedExactly ||
    classifiedActionStates.some(
      (state) =>
        state.type === "success" &&
        state.messageClassification.knownMessage === expectedSuccessMessage,
    ) ||
    (!responseBodyAvailable &&
      actionResponse.responseStatus === 200 &&
      renderedMessages.includes(expectedSuccessMessage));

  return {
    actionRequestCount,
    actionRequestWasNavigation: actionResponse.actionRequestWasNavigation,
    actionResultExpectedReturned,
    actionResultExpectedReturnedExactly,
    actionResultSuccessReturned,
    actionResultSuccessReturnedExactly,
    contentType: actionResponse.contentType,
    finalButtons,
    formVisibleBefore,
    hasActionRedirectHeader: actionResponse.hasActionRedirectHeader,
    hasActionRevalidatedHeader: actionResponse.hasActionRevalidatedHeader,
    knownResponseMessages: knownSettingsActionMessages.filter((message) =>
      runtimeResponseContainsText(responseBodyText, message),
    ),
    mainFrameNavigationPaths,
    nextActionHeaderPresent: actionResponse.nextActionHeaderPresent,
    pathnameAfter: new URL(page.url()).pathname,
    pendingObserved,
    renderedMessages: renderedMessages.map((message) => redacted(message)),
    responseBodyAvailable,
    responseBodyErrorCode,
    responseBodyRequested: Boolean(appProxy),
    responseBodySource,
    responseActionStates: classifiedActionStates,
    responseStructure,
    responseStatus: actionResponse.responseStatus,
    routerRefreshRequestCount,
    saveButtonEnabledBefore,
    saveButtonReady,
    saveButtonVisibleBefore,
    uiSettled,
  };
}

async function waitForVisible(locator, timeout = 10_000) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function inspectClientDetailSettings(page, { clientName, workflowName }) {
  const clientHeadingVisible = await waitForVisible(
    page.getByRole("heading", { exact: true, name: clientName }),
  );
  const workflowSummaryVisible = await waitForVisible(
    page.getByText(workflowName, { exact: true }).first(),
  );

  return {
    clientHeadingVisible,
    clientInputValue: await page.locator('input[name="nome"]').inputValue(),
    workflowInputValue: await page
      .locator('input[name="workflow_nome"]')
      .inputValue(),
    workflowSummaryVisible,
  };
}

async function verifySettingsNavigationFreshness(
  page,
  { clientName, clienteSlug, workflowName },
) {
  const detailPath = `/admin/clientes/${clienteSlug}`;
  const dashboardLink = page.getByRole("link", {
    exact: true,
    name: "Dashboard",
  });

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/admin", { timeout: 20_000 }),
    dashboardLink.click(),
  ]);
  const firstDashboardFresh = await waitForVisible(
    page.getByText(clientName, { exact: true }).first(),
  );

  await page.goBack();
  await page.waitForURL((url) => url.pathname === detailPath, {
    timeout: 20_000,
  });
  const returnedDetail = await inspectClientDetailSettings(page, {
    clientName,
    workflowName,
  });

  await page.goForward();
  await page.waitForURL((url) => url.pathname === "/admin", {
    timeout: 20_000,
  });
  const secondDashboardFresh = await waitForVisible(
    page.getByText(clientName, { exact: true }).first(),
  );

  await page.goBack();
  await page.waitForURL((url) => url.pathname === detailPath, {
    timeout: 20_000,
  });
  const finalDetail = await inspectClientDetailSettings(page, {
    clientName,
    workflowName,
  });

  return {
    finalDetail,
    firstDashboardFresh,
    returnedDetail,
    secondDashboardFresh,
  };
}

function assertClientDetailSettings(detail, expected, label) {
  assert.equal(
    detail.clientHeadingVisible,
    true,
    `The ${label} client detail heading was stale`,
  );
  assert.equal(detail.clientInputValue, expected.clientName);
  assert.equal(detail.workflowInputValue, expected.workflowName);
  assert.equal(
    detail.workflowSummaryVisible,
    true,
    `The ${label} workflow summary was stale`,
  );
}

function assertSettingsNavigationFreshness(result, expected) {
  assert.equal(
    result.firstDashboardFresh,
    true,
    "The administrative dashboard rendered stale client data",
  );
  assert.equal(
    result.secondDashboardFresh,
    true,
    "The administrative dashboard was stale on the second navigation",
  );

  for (const [label, detail] of [
    ["returned", result.returnedDetail],
    ["final", result.finalDetail],
  ]) {
    assertClientDetailSettings(detail, expected, label);
  }
}

function assertSuccessfulSettingsSubmission(submission) {
  assert.equal(submission.nextActionHeaderPresent, true);
  assert.equal(submission.responseStatus, 200);
  assert.equal(
    submission.actionRequestCount,
    1,
    "A successful settings edit must submit exactly one Server Action",
  );
  assert.equal(
    submission.routerRefreshRequestCount,
    1,
    "A successful settings edit must refresh its route exactly once",
  );
  if (submission.responseBodyRequested) {
    assert.equal(
      submission.responseBodyAvailable,
      true,
      `The correlated Server Action body was unavailable (${submission.responseBodyErrorCode ?? "unknown"})`,
    );
  }
  assert.equal(
    submission.actionResultSuccessReturned,
    true,
    "The correlated Server Action response did not return the success result",
  );
  assert.ok(
    submission.renderedMessages.includes(
      "Configurações salvas com sucesso.",
    ),
    "The success result was not rendered in the settings form",
  );
  assert.equal(
    submission.saveButtonReady,
    true,
    "The settings submit button did not return to its ready state",
  );
  assert.equal(
    submission.uiSettled,
    true,
    "The settings action lifecycle did not settle",
  );
}

function assertRejectedSettingsSubmission(submission, expectedMessage) {
  assert.equal(submission.nextActionHeaderPresent, true);
  assert.equal(submission.responseStatus, 200);
  assert.equal(
    submission.actionRequestCount,
    1,
    "A rejected settings edit must submit exactly one Server Action",
  );
  assert.equal(
    submission.routerRefreshRequestCount,
    0,
    "A rejected settings edit must not refresh the route",
  );
  assert.equal(
    submission.actionResultExpectedReturned,
    true,
    "The rejected Server Action response did not return the expected error",
  );
  assert.ok(
    submission.renderedMessages.includes(expectedMessage),
    "The settings error was not rendered in the form",
  );
  assert.equal(submission.saveButtonReady, true);
  assert.equal(submission.uiSettled, true);
}

async function callbackRequest(appUrl, authorization, body) {
  return fetch(`${appUrl}/api/analista/n8n/callback`, {
    body: JSON.stringify(body),
    headers: {
      authorization,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

async function runBrowserRehearsal({
  analystSecret,
  appProxy,
  appUrl,
  getServerLogs,
  receiverOrigin,
}) {
  const chromePath =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  await stat(chromePath);

  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const workflowV1 = `${receiverOrigin}/workflow/v1`;
  const workflowV2 = `${receiverOrigin}/workflow/v2`;
  registerRedactionValue(analystSecret);
  registerRedactionValue(receiverOrigin);
  registerRedactionValue(workflowV1);
  registerRedactionValue(workflowV2);
  const forbiddenValues = buildRuntimeResponseForbiddenValues({
    analystSecret,
    serviceRoleKey,
    workflowV1,
    workflowV2,
  });
  assertRuntimeResponseProtectionCoverage(forbiddenValues);

  const adminCredentials = await createSyntheticUser("admin", {
    clienteSlug: null,
    role: "lexia_admin",
  });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const browserErrors = [];
  adminPage.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserErrors.push(
        `console:${message.type()}:${redacted(message.text())}`,
      );
    }
  });
  adminPage.on("pageerror", (error) => {
    browserErrors.push(`pageerror:${redacted(error.message)}`);
  });
  const adminAudit = responseAuditor(adminPage, appUrl, forbiddenValues);
  await login(adminPage, appUrl, adminCredentials, "/admin/area-testes");

  await adminPage.goto(`${appUrl}/admin/clientes/novo`, {
    waitUntil: "domcontentloaded",
  });
  await adminPage.locator('input[name="nome"]').fill("Runtime Synthetic Client");
  await adminPage.locator('input[name="slug"]').fill(syntheticSlug);
  await adminPage.locator('select[name="status"]').selectOption("ativo");
  await adminPage.locator('input[name="modo_teste"]').check();
  await adminPage.locator('input[name="cor_principal"]').fill("#111827");
  await adminPage.locator('input[name="criar_workflow"]').check();
  await adminPage
    .locator('input[name="workflow_nome"]')
    .fill("Runtime Fake Workflow");
  await adminPage.locator('input[name="workflow_tipo"]').fill("whatsapp");
  await adminPage.locator('input[name="webhook_url"]').fill(workflowV1);
  await adminPage
    .locator('select[name="workflow_status"]')
    .selectOption("ativo");
  await adminPage.getByRole("button", { name: "Criar cliente" }).click();
  await adminPage.waitForURL(
    (url) => url.pathname === `/admin/clientes/${syntheticSlug}`,
    { timeout: 20_000 },
  );
  await adminAudit.assertClean();

  const { data: workflow, error: workflowError } = await admin
    .from("lexia_workflows")
    .select("id, webhook_url")
    .eq("cliente_slug", syntheticSlug)
    .single();
  if (workflowError) throw workflowError;
  assert.equal(workflow.webhook_url, workflowV1);
  manifest.workflowIds.push(workflow.id);
  await saveManifest();
  completedChecks.push("admin_created_client_and_private_workflow");

  const invalidSettingsMessage =
    "Preencha nome e tipo. A URL é obrigatória apenas ao criar um workflow.";
  const invalidSubmission = await submitSettingsForm(adminPage, {
    appProxy,
    clientName: "Runtime Synthetic Client",
    expectedMessage: invalidSettingsMessage,
    expectedType: "error",
    expectRefresh: false,
    forbiddenValues,
    webhookUrl: "",
    workflowName: "",
  });
  assertRejectedSettingsSubmission(invalidSubmission, invalidSettingsMessage);
  const [clientAfterInvalid, workflowAfterInvalid] = await Promise.all([
    admin
      .from("lexia_clientes")
      .select("nome")
      .eq("slug", syntheticSlug)
      .single(),
    admin
      .from("lexia_workflows")
      .select("nome, webhook_url")
      .eq("id", workflow.id)
      .single(),
  ]);
  if (clientAfterInvalid.error) throw clientAfterInvalid.error;
  if (workflowAfterInvalid.error) throw workflowAfterInvalid.error;
  assert.equal(clientAfterInvalid.data.nome, "Runtime Synthetic Client");
  assert.equal(workflowAfterInvalid.data.nome, "Runtime Fake Workflow");
  assert.equal(workflowAfterInvalid.data.webhook_url, workflowV1);
  await adminAudit.assertClean();
  completedChecks.push("settings_error_did_not_refresh_or_persist");

  const blankEdits = [
    {
      clientName: "Runtime Synthetic Client Edit 1",
      workflowName: "Runtime Fake Workflow Blank Edit 1",
    },
    {
      clientName: "Runtime Synthetic Client Edit 2",
      workflowName: "Runtime Fake Workflow Blank Edit 2",
    },
  ];
  const blankEditResults = [];

  for (const [index, edit] of blankEdits.entries()) {
    const submission = await submitSettingsForm(adminPage, {
      appProxy,
      clientName: edit.clientName,
      forbiddenValues,
      webhookUrl: "",
      workflowName: edit.workflowName,
    });
    const [clientResult, workflowResult] = await Promise.all([
      admin
        .from("lexia_clientes")
        .select("nome")
        .eq("slug", syntheticSlug)
        .single(),
      admin
        .from("lexia_workflows")
        .select("nome, webhook_url")
        .eq("id", workflow.id)
        .single(),
    ]);
    if (clientResult.error) throw clientResult.error;
    if (workflowResult.error) throw workflowResult.error;
    const currentDetail = await inspectClientDetailSettings(adminPage, edit);

    blankEditResults.push({
      clientNamePersisted: clientResult.data.nome === edit.clientName,
      currentDetail,
      destinationPreserved: workflowResult.data.webhook_url === workflowV1,
      index: index + 1,
      submission,
      workflowNamePersisted: workflowResult.data.nome === edit.workflowName,
    });
    await adminAudit.assertClean();
  }

  const finalBlankEdit = blankEdits.at(-1);
  assert.ok(finalBlankEdit);
  const navigationFreshness = await verifySettingsNavigationFreshness(
    adminPage,
    {
      clientName: finalBlankEdit.clientName,
      clienteSlug: syntheticSlug,
      workflowName: finalBlankEdit.workflowName,
    },
  );
  await adminAudit.assertClean();

  const blankSubmission = blankEditResults.at(-1).submission;
  const blankDestinationPreserved = blankEditResults.every(
    (result) => result.destinationPreserved,
  );
  const blankEditPersisted = blankEditResults.every(
    (result) => result.clientNamePersisted && result.workflowNamePersisted,
  );
  const blankSuccessRendered = blankEditResults.every((result) =>
    result.submission.renderedMessages.includes(
      "Configurações salvas com sucesso.",
    ),
  );
  const possibleApplicationActionCycleFailure =
    blankEditResults.every(
      ({ submission }) =>
        submission.formVisibleBefore &&
        submission.saveButtonVisibleBefore &&
        submission.saveButtonEnabledBefore &&
        submission.nextActionHeaderPresent &&
        submission.responseStatus === 200,
    ) &&
    blankEditPersisted &&
    blankDestinationPreserved &&
    blankEditResults.some(
      ({ submission }) =>
        !submission.actionResultSuccessReturned ||
        !blankSuccessRendered ||
        !submission.saveButtonReady,
    );

  if (runtimeDiagnosticMode) {
    const serverErrorLines = getServerLogs()
      .split(/\r?\n/)
      .filter((line) => /error|exception|fail|unauthor/i.test(line))
      .slice(-12)
      .map((line) => redacted(line).slice(0, 500));

    console.log("Sanitized blank workflow edit diagnostic:");
    console.log(`- diagnostic_source_variant: ${runtimeDiagnosticMode}`);
    console.log(`- loopback_capture_proxy: ${Boolean(appProxy)}`);
    console.log(`- response_status: ${blankSubmission.responseStatus}`);
    console.log(`- response_content_type: ${blankSubmission.contentType}`);
    console.log(
      `- next_action_header_present: ${blankSubmission.nextActionHeaderPresent}`,
    );
    console.log(
      `- action_request_was_navigation: ${blankSubmission.actionRequestWasNavigation}`,
    );
    console.log(
      `- main_frame_navigation_paths: ${JSON.stringify(blankSubmission.mainFrameNavigationPaths)}`,
    );
    console.log(
      `- response_body_available: ${blankSubmission.responseBodyAvailable}`,
    );
    console.log(
      `- response_body_error_code: ${blankSubmission.responseBodyErrorCode}`,
    );
    console.log(
      `- response_body_source: ${blankSubmission.responseBodySource}`,
    );
    console.log(
      `- response_structure: ${JSON.stringify(blankSubmission.responseStructure)}`,
    );
    console.log(
      `- response_action_states: ${JSON.stringify(blankSubmission.responseActionStates)}`,
    );
    console.log(
      `- action_redirect_header_present: ${blankSubmission.hasActionRedirectHeader}`,
    );
    console.log(
      `- action_revalidated_header_present: ${blankSubmission.hasActionRevalidatedHeader}`,
    );
    console.log(
      `- action_result_success_returned: ${blankSubmission.actionResultSuccessReturned}`,
    );
    console.log(
      `- action_result_success_returned_exactly: ${blankSubmission.actionResultSuccessReturnedExactly}`,
    );
    console.log(
      `- response_known_messages: ${JSON.stringify(blankSubmission.knownResponseMessages)}`,
    );
    console.log(
      `- rendered_messages: ${JSON.stringify(blankSubmission.renderedMessages)}`,
    );
    console.log(`- form_visible_before: ${blankSubmission.formVisibleBefore}`);
    console.log(
      `- save_button_visible_before: ${blankSubmission.saveButtonVisibleBefore}`,
    );
    console.log(
      `- save_button_enabled_before: ${blankSubmission.saveButtonEnabledBefore}`,
    );
    console.log(`- pending_observed: ${blankSubmission.pendingObserved}`);
    console.log(`- ui_settled: ${blankSubmission.uiSettled}`);
    console.log(`- save_button_ready: ${blankSubmission.saveButtonReady}`);
    console.log(
      `- final_buttons: ${JSON.stringify(blankSubmission.finalButtons)}`,
    );
    console.log(`- pathname_after: ${blankSubmission.pathnameAfter}`);
    console.log(
      `- edit_iterations: ${JSON.stringify(
        blankEditResults.map(({ clientNamePersisted, currentDetail, destinationPreserved, index, submission, workflowNamePersisted }) => ({
          actionRequestCount: submission.actionRequestCount,
          clientNamePersisted,
          currentDetail,
          destinationPreserved,
          index,
          responseStatus: submission.responseStatus,
          routerRefreshRequestCount: submission.routerRefreshRequestCount,
          saveButtonReady: submission.saveButtonReady,
          successRendered: submission.renderedMessages.includes(
            "Configurações salvas com sucesso.",
          ),
          workflowNamePersisted,
        })),
      )}`,
    );
    console.log(`- edit_persisted: ${blankEditPersisted}`);
    console.log(
      `- previous_destination_preserved: ${blankDestinationPreserved}`,
    );
    console.log(
      `- possible_application_action_cycle_failure: ${possibleApplicationActionCycleFailure}`,
    );
    console.log(
      `- navigation_freshness: ${JSON.stringify(navigationFreshness)}`,
    );
    console.log(`- browser_error_count: ${browserErrors.length}`);
    for (const error of browserErrors.slice(-12)) {
      console.log(`  ${redacted(error).slice(0, 500)}`);
    }
    console.log(`- server_error_line_count: ${serverErrorLines.length}`);
    for (const line of serverErrorLines) console.log(`  ${line}`);

    assert.equal(blankEditPersisted, true, "Blank URL edit was not persisted");
    assert.equal(
      blankDestinationPreserved,
      true,
      "Blank URL did not preserve the stored destination",
    );
    for (const result of blankEditResults) {
      assert.equal(result.clientNamePersisted, true);
      assert.equal(result.workflowNamePersisted, true);
      assert.equal(result.destinationPreserved, true);
      assertSuccessfulSettingsSubmission(result.submission);
      assertClientDetailSettings(
        result.currentDetail,
        blankEdits[result.index - 1],
        `edit ${result.index}`,
      );
    }
    assertSettingsNavigationFreshness(navigationFreshness, finalBlankEdit);
    completedChecks.push("focused_blank_workflow_edit_diagnostic");
    await adminContext.close();
    return { diagnosticOnly: true };
  }

  assert.equal(blankEditPersisted, true);
  assert.equal(blankDestinationPreserved, true);
  for (const result of blankEditResults) {
    assert.equal(result.clientNamePersisted, true);
    assert.equal(result.workflowNamePersisted, true);
    assert.equal(result.destinationPreserved, true);
    assertSuccessfulSettingsSubmission(result.submission);
    assertClientDetailSettings(
      result.currentDetail,
      blankEdits[result.index - 1],
      `edit ${result.index}`,
    );
    completedChecks.push(
      `blank_workflow_url_edit_${result.index}_preserved_destination`,
    );
  }
  assertSettingsNavigationFreshness(navigationFreshness, finalBlankEdit);
  completedChecks.push("settings_fresh_after_client_navigation_cycle");

  const updatedSubmission = await submitSettingsForm(adminPage, {
    appProxy,
    clientName: finalBlankEdit.clientName,
    forbiddenValues,
    webhookUrl: workflowV2,
    workflowName: finalBlankEdit.workflowName,
  });
  assertSuccessfulSettingsSubmission(updatedSubmission);
  const { data: updatedWorkflow, error: updatedError } = await admin
    .from("lexia_workflows")
    .select("webhook_url")
    .eq("id", workflow.id)
    .single();
  if (updatedError) throw updatedError;
  assert.equal(updatedWorkflow.webhook_url, workflowV2);
  assert.equal(
    await adminPage.locator('input[name="webhook_url"]').inputValue(),
    "",
  );
  assert.ok(!(await adminPage.content()).includes(workflowV2));
  await adminAudit.assertClean();
  completedChecks.push("workflow_destination_updated_without_browser_exposure");

  const clientCredentials = await createSyntheticUser("client", {
    clienteSlug: syntheticSlug,
    role: "cliente_admin",
  });

  await adminPage.goto(
    `${appUrl}/admin/area-testes?cliente=${encodeURIComponent(syntheticSlug)}`,
    { waitUntil: "domcontentloaded" },
  );
  await adminPage.getByRole("button", { name: "Nova", exact: true }).click();
  await adminPage.waitForURL((url) => Boolean(url.searchParams.get("session")), {
    timeout: 15_000,
  });
  const adminSessionId = new URL(adminPage.url()).searchParams.get("session");
  assert.ok(adminSessionId);
  manifest.testSessionIds.push(adminSessionId);
  await saveManifest();

  await adminPage
    .getByPlaceholder("Digite uma mensagem de teste")
    .fill("Mensagem sintética do admin");
  await adminPage.getByRole("button", { name: "Enviar", exact: true }).click();
  await adminPage
    .getByText("Resposta sintética v2 para painel_admin", { exact: true })
    .waitFor({ timeout: 20_000 });
  assert.equal(receiver.workflowRequests.length, 1);
  assert.equal(receiver.workflowRequests[0].path, "/workflow/v2");
  manifest.testExecutionIds.push(receiver.workflowRequests[0].executionId);
  await saveManifest();
  await adminAudit.assertClean();
  completedChecks.push("admin_runtime_dispatch_and_polling");

  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  const clientAudit = responseAuditor(clientPage, appUrl, forbiddenValues);
  await login(clientPage, appUrl, clientCredentials, "/app/area-testes");
  await clientPage
    .getByRole("button", { name: "Nova conversa", exact: true })
    .click();
  await clientPage.waitForURL((url) => Boolean(url.searchParams.get("session")), {
    timeout: 15_000,
  });
  const clientSessionId = new URL(clientPage.url()).searchParams.get("session");
  assert.ok(clientSessionId);
  manifest.testSessionIds.push(clientSessionId);
  await saveManifest();

  await clientPage
    .getByPlaceholder("Escreva uma mensagem para o agente")
    .fill("Mensagem sintética do cliente");
  await clientPage.getByRole("button", { name: "Enviar", exact: true }).click();
  await clientPage
    .getByText("Resposta sintética v2 para painel_cliente", { exact: true })
    .waitFor({ timeout: 20_000 });
  assert.equal(receiver.workflowRequests.length, 2);
  assert.equal(receiver.workflowRequests[1].path, "/workflow/v2");
  manifest.testExecutionIds.push(receiver.workflowRequests[1].executionId);
  await saveManifest();
  await clientAudit.assertClean();
  completedChecks.push("client_runtime_dispatch_and_polling");

  const adminRouteResponse = await clientContext.request.get(
    `${appUrl}/admin/area-testes?cliente=${syntheticSlug}&session=${adminSessionId}`,
    { maxRedirects: 0 },
  );
  assert.ok([303, 307, 308].includes(adminRouteResponse.status()));
  assert.equal(adminRouteResponse.headers().location, "/app");
  assert.equal(receiver.workflowRequests.length, 2);
  completedChecks.push("client_denied_admin_runtime_surface_without_dispatch");

  const analystQuestion = await clientPage.evaluate(
    async ({ clienteSlug }) => {
      const response = await fetch("/api/analista/chat", {
        body: JSON.stringify({
          canal: "todos",
          clienteSlug,
          fim: "",
          inicio: "",
          periodo: "mes",
          pergunta: "Pergunta sintética para o callback de runtime",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      return { body: await response.json(), status: response.status };
    },
    { clienteSlug: syntheticSlug },
  );
  assert.equal(analystQuestion.status, 202);
  const analystExecutionId = String(analystQuestion.body.executionId ?? "");
  const analystSessionId = String(analystQuestion.body.sessionId ?? "");
  assert.ok(analystExecutionId && analystSessionId);
  assert.equal(receiver.analystRequests.length, 1);
  assert.equal(
    receiver.analystRequests[0].callback,
    `${appUrl}/api/analista/n8n/callback`,
  );
  await clientAudit.assertClean();

  const callbackBody = {
    answer: "Resposta analítica sintética concluída pelo receptor falso.",
    execution_id: analystExecutionId,
    model: "fake-runtime-model",
    prompt_version: "fake-runtime-v1",
    sources: [],
    status: "completed",
    tools: ["listar_conversas"],
    usage: { input_tokens: 11, output_tokens: 13 },
  };

  const invalidCallback = await callbackRequest(
    appUrl,
    "Bearer invalid-runtime-secret",
    callbackBody,
  );
  assert.equal(invalidCallback.status, 401);
  const { data: afterInvalid, error: afterInvalidError } = await admin
    .from("lexia_ai_execucoes")
    .select("status")
    .eq("id", analystExecutionId)
    .single();
  if (afterInvalidError) throw afterInvalidError;
  assert.equal(afterInvalid.status, "iniciada");

  const firstCallback = await callbackRequest(
    appUrl,
    `Bearer ${analystSecret}`,
    callbackBody,
  );
  assert.equal(firstCallback.status, 200);
  assert.equal((await firstCallback.json()).idempotent, false);

  const repeatedCallback = await callbackRequest(
    appUrl,
    `Bearer ${analystSecret}`,
    callbackBody,
  );
  assert.equal(repeatedCallback.status, 200);
  assert.equal((await repeatedCallback.json()).idempotent, true);

  const conflictingCallback = await callbackRequest(
    appUrl,
    `Bearer ${analystSecret}`,
    { ...callbackBody, answer: "Resposta conflitante" },
  );
  assert.equal(conflictingCallback.status, 409);

  const postFinalTool = await fetch(`${appUrl}/api/analista/n8n/tool`, {
    body: JSON.stringify({
      arguments: {},
      execution_id: analystExecutionId,
      tool: "obter_cobertura",
    }),
    headers: {
      authorization: `Bearer ${analystSecret}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  assert.equal(postFinalTool.status, 409);

  const { data: storedExecution, error: storedExecutionError } = await admin
    .from("lexia_ai_execucoes")
    .select("status, ferramentas")
    .eq("id", analystExecutionId)
    .single();
  if (storedExecutionError) throw storedExecutionError;
  assert.equal(storedExecution.status, "concluida");
  assert.deepEqual(storedExecution.ferramentas, ["listar_conversas"]);

  const { data: answers, error: answersError } = await admin
    .from("lexia_ai_mensagens")
    .select("id, conteudo")
    .eq("sessao_id", analystSessionId)
    .eq("papel", "assistente");
  if (answersError) throw answersError;
  assert.equal(answers.length, 1);
  assert.equal(answers[0].conteudo, callbackBody.answer);

  const statusResult = await clientPage.evaluate(
    async ({ clienteSlug, executionId }) => {
      const params = new URLSearchParams({
        clienteSlug,
        execucaoId: executionId,
      });
      const response = await fetch(`/api/analista/status?${params}`, {
        cache: "no-store",
      });
      return { body: await response.json(), status: response.status };
    },
    { clienteSlug: syntheticSlug, executionId: analystExecutionId },
  );
  assert.equal(statusResult.status, 200);
  assert.equal(statusResult.body.status, "completed");
  await clientAudit.assertClean();
  completedChecks.push("next_callback_auth_idempotency_conflict_and_finality");

  await adminContext.close();
  await clientContext.close();
}

async function cleanupSyntheticResources() {
  try {
    if (manifest.clientSlugs.length > 0) {
      const { error } = await admin
        .from("lexia_clientes")
        .delete()
        .in("slug", manifest.clientSlugs);
      if (error) {
        cleanupFailures.push({ code: error.code, resource: "client_rows" });
      }
    }

    if (manifest.authUserIds.length > 0) {
      const { error } = await admin
        .from("lexia_usuarios_clientes")
        .delete()
        .in("user_id", manifest.authUserIds);
      if (error) {
        cleanupFailures.push({ code: error.code, resource: "profile_rows" });
      }

      for (const userId of manifest.authUserIds) {
        const { error: deleteError } =
          await admin.auth.admin.deleteUser(userId);
        if (deleteError) {
          cleanupFailures.push({
            code: deleteError.code ?? "auth_delete_failed",
            resource: `auth_user:${userId}`,
          });
        }
      }
    }

    const cleanupChecks = buildRuntimeManifestCleanupChecks(
      manifest.clientSlugs,
    );
    assertRuntimeManifestCleanupContract(cleanupChecks);

    for (const check of cleanupChecks) {
      try {
        const remaining = await countRows(
          check.table,
          check.column,
          check.values,
        );
        if (remaining === 0) continue;

        cleanupFailures.push({
          code: `remaining_${remaining}`,
          resource: check.table,
        });
      } catch (error) {
        cleanupFailures.push({
          code: error?.code ?? "cleanup_verification_failed",
          resource: check.table,
        });
      }
    }

    const { data: remainingUsers, error: listError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      cleanupFailures.push({
        code: listError.code ?? "auth_list_failed",
        resource: "auth_verification",
      });
    } else {
      const syntheticIds = new Set(manifest.authUserIds);
      const leftovers = remainingUsers.users.filter((user) =>
        syntheticIds.has(user.id),
      );
      if (leftovers.length > 0) {
        cleanupFailures.push({
          code: `remaining_${leftovers.length}`,
          resource: "auth_users",
        });
      }
    }
  } catch (error) {
    cleanupFailures.push({
      code: error?.code ?? "cleanup_exception",
      resource: "cleanup_runner",
    });
  }
}

async function stopNext() {
  if (!nextProcess || nextProcess.exitCode !== null) return;
  nextProcess.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => nextProcess.once("exit", resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 5000)),
  ]);
  if (nextProcess.exitCode === null) nextProcess.kill("SIGKILL");
}

try {
  await assertCleanRemoteStart();
  console.log(`Runtime target confirmed: ${verifiedProjectRef}.`);
  console.log("Production and protected refs remain excluded.");

  const temporary = await prepareTemporaryApplication();
  const analystSecret = randomBytes(48).toString("base64url");
  registerRedactionValue(analystSecret);
  receiver = await createFakeRuntimeReceiver({
    admin,
    analystSecret,
    certificate: temporary.certificate,
    key: temporary.key,
  });

  const nextPort = await freePort();
  const nextOrigin = `http://127.0.0.1:${nextPort}`;
  if (useRuntimeAppProxy) {
    runtimeAppProxy = await createRuntimeAppProxy({ targetOrigin: nextOrigin });
  }
  const appUrl = runtimeAppProxy?.origin ?? nextOrigin;
  const runtimeEnvironment = {
    CI: "1",
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    LEXIA_APP_URL: appUrl,
    LEXIA_WORKFLOW_ALLOWED_HOSTS: "localhost",
    N8N_ANALYST_WEBHOOK_SECRET: analystSecret,
    N8N_ANALYST_WEBHOOK_URL: `${receiver.origin}/analyst`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    NODE_EXTRA_CA_CERTS: temporary.certificatePath,
    PATH: process.env.PATH,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    TMPDIR: process.env.TMPDIR ?? tmpdir(),
  };

  assert.equal(runtimeEnvironment.LEXIA_WORKFLOW_ALLOWED_HOSTS, "localhost");
  assert.ok(runtimeEnvironment.N8N_ANALYST_WEBHOOK_URL.startsWith("https://localhost:"));
  assert.equal(runtimeEnvironment.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  assert.equal(runtimeEnvironment.UPSTASH_REDIS_REST_URL, undefined);
  completedChecks.push("loopback_https_configuration_without_tls_bypass");

  assertTemporaryInstallIncludesDevDependencies(temporaryNpmInstallArgs);
  runChecked("Temporary npm install", "npm", temporaryNpmInstallArgs, {
    cwd: temporary.appRoot,
    env: runtimeEnvironment,
  });
  runChecked("Isolated Next build", "npm", ["run", "build"], {
    cwd: temporary.appRoot,
    env: runtimeEnvironment,
  });

  let nextLogs = "";
  nextProcess = spawn(
    join(temporary.appRoot, "node_modules", ".bin", "next"),
    ["start", "--hostname", "127.0.0.1", "--port", String(nextPort)],
    {
      cwd: temporary.appRoot,
      env: runtimeEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on("data", (chunk) => {
      nextLogs = `${nextLogs}${redacted(chunk)}`.slice(-20_000);
    });
  }
  await waitForNext(appUrl, () => nextLogs);

  const rehearsal = await runBrowserRehearsal({
    analystSecret,
    appProxy: runtimeAppProxy,
    appUrl,
    getServerLogs: () => nextLogs,
    receiverOrigin: receiver.origin,
  });
  if (!rehearsal?.diagnosticOnly) {
    completedChecks.push("browser_responses_contained_no_private_values");
  }
} catch (error) {
  testFailure = error instanceof Error ? redacted(error.stack ?? error.message) : String(error);
} finally {
  try {
    await browser?.close();
  } catch {
    // Database cleanup still takes priority.
  }
  try {
    await runtimeAppProxy?.close();
  } catch {
    cleanupFailures.push({
      code: "app_proxy_close_failed",
      resource: "runtime_app_proxy",
    });
  }
  await stopNext();
  try {
    await receiver?.close();
  } catch {
    cleanupFailures.push({ code: "receiver_close_failed", resource: "receiver" });
  }

  await cleanupSyntheticResources();

  if (tempRoot && cleanupFailures.length === 0) {
    try {
      await rm(tempRoot, { force: true, recursive: true });
    } catch {
      cleanupFailures.push({ code: "temp_remove_failed", resource: tempRoot });
    }
  }
}

console.log(`Runtime checks completed: ${completedChecks.length}.`);
for (const check of completedChecks) console.log(`- ${check}`);

if (cleanupFailures.length > 0) {
  console.error("Synthetic cleanup failed independently:");
  for (const failure of cleanupFailures) {
    console.error(`- ${failure.resource}: ${failure.code}`);
  }
  if (manifestPath) console.error(`Cleanup manifest preserved at ${manifestPath}.`);
}

if (testFailure) {
  console.error("Next.js runtime rehearsal stopped at the first failure:");
  console.error(testFailure);
}

if (testFailure || cleanupFailures.length > 0) {
  process.exit(1);
}

console.log(
  runtimeDiagnosticMode
    ? "Focused Next.js runtime diagnostic passed."
    : "Lot 1 Next.js runtime rehearsal passed.",
);
console.log("Synthetic users and product data cleanup passed.");
console.log("The disposable runtime schema and identity markers were preserved.");
