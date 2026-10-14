import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import type {
  JsonObject,
  JsonValue,
  WorkflowTestTarget,
} from "../lib/omnichannel/contracts";
import {
  WORKFLOW_TEST_TRACE_PLANS,
  workflowTestOutputFor,
} from "../lib/omnichannel/workflow-test";

type N8nNode = {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
  webhookId?: string;
  [key: string]: unknown;
};

type N8nConnection = {
  node: string;
  type: string;
  index: number;
};

export type N8nWorkflow = {
  name: string;
  nodes: N8nNode[];
  connections: Record<
    string,
    { main: Array<N8nConnection[]>; [key: string]: unknown }
  >;
  active?: boolean;
  settings?: Record<string, unknown>;
  pinData?: Record<string, unknown>;
  [key: string]: unknown;
};

type SourceDefinition = {
  target: WorkflowTestTarget;
  match: (name: string) => boolean;
  output: string;
  testPath: string;
};

export const MIRANDA_SOURCES: SourceDefinition[] = [
  {
    target: "omnichannel",
    match: (name) => name.includes("MIRANDA SKIN EXPERT") && name.includes("OMNICHANNEL"),
    output: "01-miranda-omnichannel-v2-review.inactive.json",
    testPath: "lexia-v2-test-miranda-omnichannel",
  },
  {
    target: "brain",
    match: (name) => name.includes("Cérebro") && name.includes("MIRANDA SKIN EXPERT"),
    output: "02-miranda-brain-v2-review.inactive.json",
    testPath: "lexia-v2-test-miranda-brain",
  },
  {
    target: "followup",
    match: (name) => name.includes("FOLLOW-UP") && name.includes("MIRANDA"),
    output: "03-miranda-followup-v2-review.inactive.json",
    testPath: "lexia-v2-test-miranda-followup",
  },
  {
    target: "reminder",
    match: (name) => name.includes("LEMBRETES") && name.includes("MIRANDA"),
    output: "04-miranda-reminder-v2-review.inactive.json",
    testPath: "lexia-v2-test-miranda-reminder",
  },
  {
    target: "create_appointment",
    match: (name) => name.trim() === "criar_agendamento",
    output: "05-miranda-create-appointment-v2-review.inactive.json",
    testPath: "lexia-v2-test-miranda-create-appointment",
  },
  {
    target: "check_availability",
    match: (name) => name.trim() === "verificar_disponibilidade",
    output: "06-miranda-check-availability-v2-review.inactive.json",
    testPath: "lexia-v2-test-miranda-check-availability",
  },
];

const SECRET_NAME =
  /(?:token|secret|password|senha|authorization|credential|api[_-]?key|service[_-]?role|private[_-]?key)/i;
const URL_NAME = /(?:^|_)(?:url|uri|endpoint|host)(?:$|_)/i;
const PHONE_NAME = /(?:phone|telefone|whatsapp_number|numero_whatsapp)/i;

function redactString(value: string) {
  return value
    .replace(
      /\b((?:const|let|var)\s+(?=[A-Za-z_$][\w$]*\s*=)(?=[\w$]*(?:token|secret|password|senha|authorization|credential|api_?key|service_?role|private_?key))[A-Za-z_$][\w$]*\s*=\s*)(["'`])(?:\\.|(?!\2)[\s\S])*?\2/giu,
      "$1$2[CONFIGURE_IN_N8N_CREDENTIAL]$2",
    )
    .replace(
      /\b((?:token|secret|password|senha|api_?key)\s*:\s*)(["'`])(?:\\.|(?!\2)[\s\S])*?\2/giu,
      "$1$2[CONFIGURE_IN_N8N_CREDENTIAL]$2",
    )
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/giu, "postgresql://redacted.invalid/removed")
    .replace(/redis(?:s)?:\/\/[^\s"'`]+/giu, "rediss://redacted.invalid/removed")
    .replace(/https?:\/\/[^\s"'`)}\]]+/giu, (url) => {
      if (
        url.startsWith("https://json-schema.org/") ||
        url.startsWith("https://contracts.uselexia.invalid/") ||
        url.includes("example.invalid")
      ) {
        return url;
      }
      return "https://redacted.example.invalid/removed";
    })
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "contact@example.invalid")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu, "[REDACTED_JWT]")
    .replace(/\b(?:sk|rk|pk)[-_][A-Za-z0-9_-]{16,}\b/giu, "[REDACTED_TOKEN]")
    .replace(/\+?\d[\d ().-]{10,}\d/gu, "[REDACTED_PHONE]");
}

export function sanitizeUnknown(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (SECRET_NAME.test(key)) return "[CONFIGURE_IN_N8N_CREDENTIAL]";
    if (URL_NAME.test(key)) return "https://redacted.example.invalid/removed";
    if (PHONE_NAME.test(key)) return "[REDACTED_PHONE]";
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item));
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const assignmentName = typeof source.name === "string" ? source.name : "";
  const sanitized: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(source)) {
    if (childKey === "credentials" || childKey === "webhookId") continue;
    if (childKey === "workflowId") {
      sanitized[childKey] = {
        __rl: true,
        mode: "list",
        value: "",
        cachedResultName:
          typeof (childValue as Record<string, unknown> | null)?.cachedResultName === "string"
            ? redactString(String((childValue as Record<string, unknown>).cachedResultName))
            : "SELECT_AFTER_IMPORT",
      };
      continue;
    }
    if (childKey === "value" && assignmentName) {
      if (assignmentName === "permitir_envio_real") {
        sanitized[childKey] = false;
        continue;
      }
      if (SECRET_NAME.test(assignmentName)) {
        sanitized[childKey] = "[CONFIGURE_IN_N8N_CREDENTIAL]";
        continue;
      }
      if (URL_NAME.test(assignmentName)) {
        sanitized[childKey] = "https://redacted.example.invalid/removed";
        continue;
      }
      if (PHONE_NAME.test(assignmentName)) {
        sanitized[childKey] = "[REDACTED_PHONE]";
        continue;
      }
    }
    sanitized[childKey] = sanitizeUnknown(childValue, childKey);
  }
  return sanitized;
}

function deterministicId(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function testCode(target: WorkflowTestTarget) {
  const trace = JSON.stringify(WORKFLOW_TEST_TRACE_PLANS[target]);
  const output = JSON.stringify(workflowTestOutputFor(target));
  return `// Lexia Miranda V2 review: synthetic test branch only.
// No database, model, Redis, tool or provider is called from this branch.
const TARGET = ${JSON.stringify(target)};
const body = typeof $json.body === 'string' ? JSON.parse($json.body) : ($json.body || $json);
const fail = (code) => { throw new Error('workflow_test_invalid:' + code); };
const exact = (value, keys, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort().join('|');
  const expected = [...keys].sort().join('|');
  if (actual !== expected) fail(code);
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
exact(body, ['schema_version','run_id','target','delivery_mode','scope','input','expectations'], 'top_level');
if (body.schema_version !== 'lexia.workflow.test.request.v1') fail('schema_version');
if (!uuid.test(body.run_id)) fail('run_id');
if (body.target !== TARGET) fail('target');
if (body.delivery_mode !== 'simulate') fail('delivery_mode');
exact(body.scope, ['environment','cliente_slug','channel','account_ref','conversation_ref'], 'scope');
if (!['isolated_test','staging'].includes(body.scope.environment)) fail('environment');
if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(body.scope.cliente_slug)) fail('cliente_slug');
if (!['whatsapp','instagram','messenger'].includes(body.scope.channel)) fail('channel');
if (!uuid.test(body.scope.account_ref)) fail('account_ref');
if (body.scope.conversation_ref !== 'test:' + body.run_id) fail('conversation_ref');
exact(body.input, ['message_id','type','text'], 'input');
if (body.input.message_id !== 'test-message:' + body.run_id) fail('message_id');
if (body.input.type !== 'text') fail('input_type');
if (typeof body.input.text !== 'string' || body.input.text.length < 1 || body.input.text.length > 4000) fail('text');
exact(body.expectations, ['provider_send','persist_synthetic_events','return_trace'], 'expectations');
if (body.expectations.provider_send !== false || body.expectations.persist_synthetic_events !== true || body.expectations.return_trace !== true) fail('expectations');
return [{ json: {
  schema_version: 'lexia.workflow.test.result.v1',
  run_id: body.run_id,
  target: TARGET,
  status: 'completed',
  provider_send_attempted: false,
  summary: 'Teste sintético ' + TARGET + ' concluído sem envio externo.',
  trace: ${trace},
  output: ${output}
} }];`;
}

function maxPosition(nodes: N8nNode[]) {
  return nodes.reduce(
    (current, node) => Math.max(current, node.position?.[0] ?? 0),
    0,
  );
}

export function sanitizeMirandaWorkflow(
  source: N8nWorkflow,
  definition: SourceDefinition,
): N8nWorkflow {
  const sanitized = sanitizeUnknown(structuredClone(source)) as N8nWorkflow;
  const prefix = `review:${definition.target}`;
  const startX = maxPosition(sanitized.nodes) + 480;
  const y = -800;

  sanitized.nodes = sanitized.nodes.map((node) => ({
    ...node,
    credentials: undefined,
    webhookId: undefined,
    disabled: true,
  }));

  const noteName = "[LEXIA V2] LEIA ANTES DE ATIVAR";
  const webhookName = "[LEXIA TEST] Entrada autenticada";
  const simulateName = "[LEXIA TEST] Validar e simular";
  const responseName = "[LEXIA TEST] Responder resultado";
  sanitized.nodes.push(
    {
      id: deterministicId(`${prefix}:note`),
      name: noteName,
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [startX, y - 300],
      parameters: {
        width: 920,
        height: 240,
        content:
          "## REVISÃO INATIVA / NÃO É FLUXO DE PRODUÇÃO\nOs nós herdados estão desativados e sem credenciais. Ative somente após revisar o README. Para o teste pelo Frappe, associe uma credencial Header Auth exclusiva ao webhook abaixo. O ramo de teste não chama banco, Redis, modelo, tool ou provedor.",
      },
    },
    {
      id: deterministicId(`${prefix}:webhook`),
      name: webhookName,
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [startX, y],
      parameters: {
        httpMethod: "POST",
        path: definition.testPath,
        authentication: "headerAuth",
        responseMode: "responseNode",
        options: {},
      },
    },
    {
      id: deterministicId(`${prefix}:simulate`),
      name: simulateName,
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [startX + 280, y],
      parameters: { jsCode: testCode(definition.target) },
    },
    {
      id: deterministicId(`${prefix}:response`),
      name: responseName,
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.4,
      position: [startX + 560, y],
      parameters: {
        respondWith: "json",
        responseBody: "={{ $json }}",
        options: {},
      },
    },
  );

  sanitized.connections = {
    ...sanitized.connections,
    [webhookName]: {
      main: [[{ node: simulateName, type: "main", index: 0 }]],
    },
    [simulateName]: {
      main: [[{ node: responseName, type: "main", index: 0 }]],
    },
  };
  sanitized.name = `MIRANDA V2 REVIEW - ${definition.target.toUpperCase()} - INATIVO`;
  sanitized.active = false;
  sanitized.pinData = {};
  sanitized.settings = {
    executionOrder: "v1",
    saveManualExecutions: true,
    saveExecutionProgress: true,
    saveDataErrorExecution: "all",
    saveDataSuccessExecution: "all",
  };
  sanitized.tags = [];
  for (const key of [
    "id",
    "versionId",
    "meta",
    "shared",
    "staticData",
    "triggerCount",
    "updatedAt",
    "createdAt",
  ]) {
    delete sanitized[key];
  }
  return sanitized;
}

function findJsonFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...findJsonFiles(path));
    else if (entry.endsWith(".json")) files.push(path);
  }
  return files;
}

function resolveSourceRoot(source: string) {
  const absolute = resolve(source);
  if (!existsSync(absolute)) throw new Error(`Source does not exist: ${absolute}`);
  if (statSync(absolute).isDirectory()) return { root: absolute, cleanup: null as string | null };
  if (!absolute.toLowerCase().endsWith(".zip")) {
    throw new Error("Source must be a directory or ZIP archive.");
  }
  const temporary = mkdtempSync(join(tmpdir(), "lexia-miranda-v2-source-"));
  execFileSync("unzip", ["-q", absolute, "-d", temporary], { stdio: "ignore" });
  return { root: temporary, cleanup: temporary };
}

function loadSources(root: string) {
  const workflows = findJsonFiles(root)
    .map((path) => {
      try {
        const value = JSON.parse(readFileSync(path, "utf8")) as N8nWorkflow;
        return value && Array.isArray(value.nodes) && typeof value.name === "string"
          ? { path, workflow: value }
          : null;
      } catch {
        return null;
      }
    })
    .filter((value): value is { path: string; workflow: N8nWorkflow } => Boolean(value));

  return MIRANDA_SOURCES.map((definition) => {
    const matches = workflows.filter(({ workflow }) => definition.match(workflow.name));
    if (matches.length !== 1) {
      throw new Error(
        `Expected one source workflow for ${definition.target}; found ${matches.length}.`,
      );
    }
    return { definition, ...matches[0] };
  });
}

function copyTree(source: string, destination: string) {
  if (!existsSync(source)) return;
  if (statSync(source).isFile()) mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    filter: (path) => {
      const name = basename(path);
      return ![
        ".git",
        ".next",
        "node_modules",
        "__pycache__",
        ".DS_Store",
      ].includes(name) && !name.endsWith(".pyc") && !name.startsWith(".env");
    },
  });
}

const SECRET_PATTERNS = [
  { type: "jwt", expression: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu },
  { type: "provider_api_key", expression: /\b(?:sk|rk|pk)[-_][A-Za-z0-9_-]{16,}\b/giu },
  { type: "database_url", expression: /\b(?:postgres(?:ql)?|redis(?:s)?):\/\/[^\s"'`<>]+/giu },
  { type: "private_key", expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu },
];

export function scanPackage(root: string) {
  const findings: Array<{ file: string; type: string }> = [];
  const disallowed: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if ([".git", ".next", "node_modules", "__pycache__"].includes(entry)) {
          disallowed.push(relative(root, path));
        } else {
          walk(path);
        }
        continue;
      }
      const rel = relative(root, path);
      if (entry.startsWith(".env") || entry.endsWith(".pyc")) disallowed.push(rel);
      if (stat.size > 8_000_000) continue;
      const text = readFileSync(path, "utf8");
      for (const pattern of SECRET_PATTERNS) {
        pattern.expression.lastIndex = 0;
        if (pattern.expression.test(text)) findings.push({ file: rel, type: pattern.type });
      }
      if (path.endsWith(".json")) {
        try {
          const parsed = JSON.parse(text) as JsonValue;
          const visit = (value: JsonValue, key = "") => {
            if (key === "credentials") findings.push({ file: rel, type: "credential_binding" });
            if (typeof value === "string" && SECRET_NAME.test(key) && !value.startsWith("[")) {
              findings.push({ file: rel, type: "inline_secret_field" });
            } else if (Array.isArray(value)) value.forEach((item) => visit(item));
            else if (value && typeof value === "object") {
              Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
            }
          };
          visit(parsed);
        } catch {
          // Non-JSON files with a .json suffix are caught by import-time checks.
        }
      }
    }
  };
  walk(root);
  return { findings, disallowed };
}

function packageReadme(manifest: JsonObject) {
  return `# Lexia Miranda CRM V2 - pacote de revisão\n\n` +
    `Gerado em ${manifest.generated_at}. Este pacote é **inativo e não é uma publicação de produção**.\n\n` +
    `## O que pode ser testado\n\n` +
    `Os seis workflows em \`workflows/miranda-transition\` conservam a topologia sanitizada para revisão, mas todos os nós herdados estão desativados. Cada arquivo possui um único ramo executável de teste: Webhook autenticado -> validação estrita -> simulação -> resposta. O ramo não chama banco, Redis, modelo, tool ou provedor.\n\n` +
    `O Frappe em \`frappe-app\` cria execuções sintéticas, escolhe o alvo e aceita somente resultado correlacionado com \`provider_send_attempted=false\`. As URLs e o segredo Header Auth ficam somente no \`site_config.json\` do laboratório, nunca neste pacote.\n\n` +
    `O inventário das mudanças, checks executados e integrações ainda pendentes está em \`REVIEW_SUMMARY.md\`.\n\n` +
    `## Ordem segura\n\n` +
    `1. Importar em uma instância n8n isolada, nunca sobre os workflows ativos.\n` +
    `2. Associar uma credencial Header Auth exclusiva aos seis webhooks de teste.\n` +
    `3. Revisar que apenas os três nós \`[LEXIA TEST]\` de cada workflow estão habilitados.\n` +
    `4. Ativar os endpoints apenas no laboratório.\n` +
    `5. Configurar os destinos no \`site_config.json\` do Frappe isolado.\n` +
    `6. Rodar primeiro o teste omnichannel; depois cérebro, follow-up, lembrete e tools.\n\n` +
    `## Limite importante\n\n` +
    `O teste comprova o contrato Frappe-n8n, isolamento, correlação e bloqueio de envio. Ele ainda não comprova modelos, Supabase, Redis, Google Agenda, provedores ou a inteligência privada real da Miranda. Os workflows de \`workflows/omni-v2-simulator\` exercitam localmente a máquina de estados, concorrência, deduplicação e entrega parcial com componentes falsos.\n\n` +
    `Imagem em follow-up já existe no contrato de ação, mas permanece explicitamente desabilitada até validar armazenamento de mídia e cada provedor.\n`;
}

export function buildReviewPackage(options: {
  source: string;
  output: string;
  frappeApp?: string;
}) {
  const output = resolve(options.output);
  if (existsSync(output)) {
    throw new Error(`Output already exists; refusing to overwrite: ${output}`);
  }
  const resolved = resolveSourceRoot(options.source);
  try {
    const sources = loadSources(resolved.root);
    mkdirSync(join(output, "workflows", "miranda-transition"), { recursive: true });

    const manifestEntries = sources.map(({ definition, workflow, path }) => {
      const sourceHash = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
      const result = sanitizeMirandaWorkflow(workflow, definition);
      const destination = join(
        output,
        "workflows",
        "miranda-transition",
        definition.output,
      );
      writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
      return {
        target: definition.target,
        file: relative(output, destination),
        source_node_count: workflow.nodes.length,
        review_node_count: result.nodes.length,
        source_sha256: sourceHash,
        test_path: definition.testPath,
        original_nodes_disabled: true,
        active: false,
      };
    });

    copyTree(
      join(process.cwd(), "n8n", "omnichannel-test"),
      join(output, "workflows", "omni-v2-simulator"),
    );
    copyTree(
      join(process.cwd(), "n8n", "miranda-crm"),
      join(output, "workflows", "crm-bridge"),
    );
    copyTree(
      join(process.cwd(), "contracts", "omnichannel", "v1"),
      join(output, "contracts", "omnichannel", "v1"),
    );
    copyTree(
      join(process.cwd(), "docs", "LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md"),
      join(output, "docs", "LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md"),
    );
    copyTree(
      join(process.cwd(), "docs", "LOTE_2_REFERENCIA_FLUXO_ATUAL_MIRANDA.md"),
      join(output, "docs", "LOTE_2_REFERENCIA_FLUXO_ATUAL_MIRANDA.md"),
    );
    copyTree(
      join(process.cwd(), "docs", "LOTE_2_MIRANDA_REVIEW_PACKAGE.md"),
      join(output, "REVIEW_SUMMARY.md"),
    );
    if (options.frappeApp) {
      copyTree(resolve(options.frappeApp), join(output, "frappe-app"));
    }

    const manifest: JsonObject = {
      schema_version: "lexia.miranda.review.package.v1",
      generated_at: new Date().toISOString(),
      status: "inactive_review_only",
      source_archive_included: false,
      workflows: manifestEntries as unknown as JsonValue,
      guarantees: {
        active_workflows_modified: false,
        original_nodes_enabled: false,
        test_provider_send: false,
        credentials_included: false,
        real_destinations_included: false,
        followup_image_contract_ready: true,
        followup_image_delivery_enabled: false,
      },
    };
    writeFileSync(join(output, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(output, "README.md"), packageReadme(manifest));

    const scan = scanPackage(output);
    const report = {
      schema_version: "lexia.sanitization.report.v1",
      scanned_at: new Date().toISOString(),
      secret_findings: scan.findings,
      disallowed_paths: scan.disallowed,
      passed: scan.findings.length === 0 && scan.disallowed.length === 0,
    };
    writeFileSync(
      join(output, "SANITIZATION_REPORT.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    if (!report.passed) {
      const diagnostics = [
        ...scan.findings.map(({ file, type }) => `${file}: ${type}`),
        ...scan.disallowed.map((file) => `${file}: disallowed_path`),
      ].join(", ");
      throw new Error(
        `Sanitization failed with ${scan.findings.length} finding(s) and ${scan.disallowed.length} disallowed path(s): ${diagnostics}`,
      );
    }
    return { output, manifest, report };
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  } finally {
    if (resolved.cleanup) rmSync(resolved.cleanup, { recursive: true, force: true });
  }
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = argument("--source");
  const output = argument("--output");
  if (!source || !output) {
    throw new Error("Usage: --source <zip-or-directory> --output <new-directory> [--frappe-app <directory>]");
  }
  const result = buildReviewPackage({
    source,
    output,
    frappeApp: argument("--frappe-app"),
  });
  process.stdout.write(`${result.output}\n`);
}
