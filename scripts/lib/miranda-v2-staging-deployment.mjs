import { randomBytes } from "node:crypto";

export const stagingWorkflowSpecs = {
  entry: {
    id: "d-HaAJRDGtlnBoKX",
    sourceName: "LEXIA V2 CANDIDATO - MIRANDA - 01 ENTRADA OMNICHANNEL",
    name: "LEXIA HML - MIRANDA - 01 ENTRADA OMNICHANNEL",
    file: "01-entrada-omnichannel-hml.json",
  },
  service: {
    id: "vYKPApDzqyBUx3Xo",
    sourceName: "LEXIA V2 CANDIDATO - MIRANDA - 02 ATENDIMENTO IA",
    name: "LEXIA HML - MIRANDA - 02 ATENDIMENTO IA",
    file: "02-atendimento-ia-hml.json",
  },
  agenda: {
    id: "ybR0Ijc0HDRUNBsZ",
    sourceName: "LEXIA V2 CANDIDATO - MIRANDA - 03 AGENDA",
    name: "LEXIA HML - MIRANDA - 03 AGENDA",
    file: "03-agenda-hml.json",
  },
  automation: {
    id: "kh_MnrJlDH3KmyzI",
    sourceName: "LEXIA V2 CANDIDATO - MIRANDA - 04 FOLLOW-UPS E LEMBRETES",
    name: "LEXIA HML - MIRANDA - 04 FOLLOW-UPS E LEMBRETES",
    file: "04-followups-lembretes-hml.json",
  },
  crm: {
    id: "eTucz9iRsfs28sd1",
    sourceName: "LEXIA V2 CANDIDATO - MIRANDA - 05 INTEGRAÇÃO CRM",
    name: "LEXIA HML - MIRANDA - 05 INTEGRAÇÃO CRM",
    file: "05-integracao-crm-hml.json",
  },
  delivery: {
    id: "yX2ab8yzzDppCj-P",
    sourceName: "LEXIA V2 CANDIDATO - MIRANDA - 06 SAÍDA SEGURA",
    name: "LEXIA HML - MIRANDA - 06 SAÍDA SEGURA",
    file: "06-saida-segura-hml.json",
  },
};

// These IDs are stable so a repeated import updates the same isolated resources.
export const stagingCredentialSpecs = {
  centralNative: {
    id: "4wThZGKEvzHcsmMi",
    name: "Lexia HML Central Supabase Native",
    type: "supabaseApi",
  },
  centralRest: {
    id: "KErzLHbB5Ip0_R0P",
    name: "Lexia HML Central Supabase REST",
    type: "httpCustomAuth",
  },
  redis: {
    id: "HE7xSB8txC3iVmNA",
    name: "Lexia HML Redis Isolado",
    type: "redis",
  },
  frappe: {
    id: "HuWlTzah7WLEYzZw",
    name: "Lexia HML Frappe CRM",
    type: "httpHeaderAuth",
  },
  externalDisabled: {
    id: "4VUezED2R8MEw2Ni",
    name: "Lexia HML External Disabled",
    type: "httpCustomAuth",
  },
  agentTestWebhook: {
    id: "4c9e07556f6df361",
    name: "Lexia CRM Agent Test Header Auth",
    type: "httpHeaderAuth",
  },
  mirandaPrivateSupabase: {
    id: "7Ji8ImfPRc9uJgJO",
    name: "MIRANDA SKIN EXPERT",
    type: "supabaseApi",
  },
  openAi: {
    id: "Lrpm8B9pckhN74bg",
    name: "Open AI Amynda",
    type: "openAiApi",
  },
  gemini: {
    id: "P1rHG7nrqpIYrJMo",
    name: "gEMINI pRO",
    type: "googlePalmApi",
  },
  anthropic: {
    id: "Qf6tp7bMahnqCxtz",
    name: "Chave API - Miranda Skin",
    type: "anthropicApi",
  },
  calendarTest: {
    id: "qIVn28yraEF8klpa",
    name: "Calendar Testes Arthur",
    type: "googleCalendarOAuth2Api",
  },
};

const candidateKeys = Object.keys(stagingWorkflowSpecs);
const sourceTargetByName = new Map(
  Object.entries(stagingWorkflowSpecs).map(([key, spec]) => [spec.sourceName, { key, ...spec }]),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function credential(spec) {
  return { id: spec.id, name: spec.name };
}

function replaceEnvironmentReferences(value, replacements) {
  if (typeof value === "string") {
    let output = value;
    for (const [name, replacement] of Object.entries(replacements)) {
      output = output.replaceAll(`$env.${name}`, JSON.stringify(replacement));
    }
    return output;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceEnvironmentReferences(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceEnvironmentReferences(item, replacements),
      ]),
    );
  }
  return value;
}

function bindNodeCredential(node, config) {
  const credentials = stagingCredentialSpecs;

  if (node.type === "n8n-nodes-base.webhook") {
    node.credentials = { httpHeaderAuth: credential(credentials.agentTestWebhook) };
    return;
  }
  if (node.type === "n8n-nodes-base.redis") {
    node.credentials = { redis: credential(credentials.redis) };
    return;
  }
  if (
    node.type === "n8n-nodes-base.supabase" ||
    node.type === "n8n-nodes-base.supabaseTool"
  ) {
    const target = node.name.includes("Buscar Histórico Follow-up")
      ? credentials.centralNative
      : credentials.mirandaPrivateSupabase;
    node.credentials = { supabaseApi: credential(target) };
    return;
  }
  if (
    node.type === "@n8n/n8n-nodes-langchain.openAi" ||
    node.type === "@n8n/n8n-nodes-langchain.lmChatOpenAi"
  ) {
    node.credentials = { openAiApi: credential(credentials.openAi) };
    return;
  }
  if (node.type === "@n8n/n8n-nodes-langchain.googleGemini") {
    node.credentials = { googlePalmApi: credential(credentials.gemini) };
    return;
  }
  if (node.type === "@n8n/n8n-nodes-langchain.lmChatAnthropic") {
    node.credentials = { anthropicApi: credential(credentials.anthropic) };
    return;
  }
  if (node.type === "n8n-nodes-base.googleCalendar") {
    node.credentials = {
      googleCalendarOAuth2Api: credential(credentials.calendarTest),
    };
    return;
  }
  if (node.type !== "n8n-nodes-base.httpRequest") return;

  if (node.name === "ESPELHO | Enviar evento autenticado ao Frappe") {
    node.credentials = { httpHeaderAuth: credential(credentials.frappe) };
    const headers = node.parameters.headerParameters?.parameters ?? [];
    if (!headers.some((header) => header.name === "X-Frappe-Site-Name")) {
      headers.push({ name: "X-Frappe-Site-Name", value: config.frappeSiteName });
    }
    node.parameters.headerParameters = { parameters: headers };
    return;
  }

  if (
    node.name === "MÍDIA | Baixar mídia por URL confiável" ||
    node.name.startsWith("PROVEDOR | Enviar ")
  ) {
    node.credentials = {
      httpCustomAuth: credential(credentials.externalDisabled),
    };
    return;
  }

  node.credentials = { httpCustomAuth: credential(credentials.centralRest) };
}

function rewriteSubworkflowTarget(node) {
  if (
    node.type !== "n8n-nodes-base.executeWorkflow" &&
    node.type !== "@n8n/n8n-nodes-langchain.toolWorkflow"
  ) {
    return;
  }
  const workflowId = node.parameters.workflowId;
  const sourceName = workflowId?.cachedResultName;
  const target = sourceTargetByName.get(sourceName);
  if (!target) {
    throw new Error(`unknown_staging_subworkflow_target:${node.name}:${sourceName}`);
  }
  workflowId.value = target.id;
  workflowId.cachedResultName = target.name;
}

function hardenTriggers(node) {
  if (node.type === "n8n-nodes-base.scheduleTrigger") {
    node.disabled = true;
    return;
  }
  if (node.name === "CANAIS | Webhook interno Z-API") {
    node.parameters.path = "lexia-hml-v2-miranda-zapi";
    node.disabled = true;
    return;
  }
  if (node.name === "CANAIS | Webhook interno Meta") {
    node.parameters.path = "lexia-hml-v2-miranda-meta";
    node.disabled = true;
    return;
  }
  if (node.name === "CANAIS | Webhook de teste da plataforma") {
    node.parameters.path = "lexia-hml-v2-test-miranda-omnichannel";
    delete node.disabled;
    return;
  }
  if (node.name === "COMANDOS | Webhook autenticado do Frappe") {
    node.parameters.path = "lexia-hml-v2-miranda-crm-command";
    delete node.disabled;
  }
}

export function buildStagingWorkflows(candidates, config) {
  const requiredConfig = [
    "centralSupabaseUrl",
    "frappeInternalUrl",
    "frappeSiteName",
    "mediaAllowedHosts",
    "providerDisabledUrl",
    "whatsappAccountId",
    "instagramAccountId",
    "messengerAccountId",
  ];
  for (const key of requiredConfig) {
    if (!config[key]) throw new Error(`missing_staging_config:${key}`);
  }
  if (config.deliveryMode !== "observe_only") {
    throw new Error("staging_delivery_mode_must_be_observe_only");
  }

  const replacements = {
    LEXIA_CENTRAL_SUPABASE_URL: config.centralSupabaseUrl,
    LEXIA_DELIVERY_MODE: config.deliveryMode,
    LEXIA_FRAPPE_CRM_URL: config.frappeInternalUrl,
    LEXIA_MEDIA_ALLOWED_HOSTS: config.mediaAllowedHosts,
    LEXIA_META_SEND_URL: `${config.providerDisabledUrl}/meta`,
    LEXIA_MIRANDA_CALENDAR_ID: config.calendarId ?? "primary",
    LEXIA_MIRANDA_INSTAGRAM_ACCOUNT_ID: config.instagramAccountId,
    LEXIA_MIRANDA_LOCATION_LABEL: config.locationLabel ?? "Miranda staging",
    LEXIA_MIRANDA_MESSENGER_ACCOUNT_ID: config.messengerAccountId,
    LEXIA_MIRANDA_TIMEZONE: config.timezone ?? "America/New_York",
    LEXIA_MIRANDA_ZAPI_ACCOUNT_ID: config.whatsappAccountId,
    LEXIA_ZAPI_SEND_URL: `${config.providerDisabledUrl}/zapi`,
  };

  const output = {};
  for (const key of candidateKeys) {
    const source = candidates[key];
    const spec = stagingWorkflowSpecs[key];
    if (!source || source.name !== spec.sourceName) {
      throw new Error(`staging_source_mismatch:${key}`);
    }
    const workflow = replaceEnvironmentReferences(clone(source), replacements);
    workflow.id = spec.id;
    workflow.name = spec.name;
    workflow.description =
      "Cópia completa de homologação da Miranda. Canais e agendas reais ficam desativados; Agent Test e comandos CRM usam somente o ambiente isolado.";
    workflow.active = false;
    workflow.isArchived = false;
    workflow.settings = {
      ...(workflow.settings ?? {}),
      executionOrder: "v1",
      timezone: "America/Sao_Paulo",
      callerPolicy: "workflowsFromSameOwner",
      availableInMCP: true,
    };
    workflow.tags = [];
    workflow.pinData = {};
    delete workflow.versionId;
    delete workflow.activeVersionId;

    for (const node of workflow.nodes) {
      hardenTriggers(node);
      rewriteSubworkflowTarget(node);
      bindNodeCredential(node, config);
    }
    output[key] = workflow;
  }
  assertStagingWorkflows(output, config);
  return output;
}

export function buildPrivateCredentialImport(env, disabledToken) {
  const required = [
    "LEXIA_LOTE2_SUPABASE_URL",
    "LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY",
    "LEXIA_LOTE2_UPSTASH_REDIS_REST_URL",
    "LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN",
    "LEXIA_LOTE2_FRAPPE_INTEGRATION_API_KEY",
    "LEXIA_LOTE2_FRAPPE_INTEGRATION_API_SECRET",
  ];
  for (const key of required) {
    if (!env[key]) throw new Error(`missing_private_staging_value:${key}`);
  }
  if (env.LEXIA_LOTE2_ENVIRONMENT !== "isolated_test") {
    throw new Error("staging_environment_must_be_isolated_test");
  }

  const redisHost = new URL(env.LEXIA_LOTE2_UPSTASH_REDIS_REST_URL).hostname;
  const token = disabledToken || randomBytes(24).toString("base64url");
  const specs = stagingCredentialSpecs;
  return [
    {
      id: specs.centralNative.id,
      name: specs.centralNative.name,
      type: specs.centralNative.type,
      data: {
        host: env.LEXIA_LOTE2_SUPABASE_URL,
        serviceRole: env.LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY,
      },
    },
    {
      id: specs.centralRest.id,
      name: specs.centralRest.name,
      type: specs.centralRest.type,
      data: {
        json: JSON.stringify({
          headers: {
            apikey: env.LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }),
      },
    },
    {
      id: specs.redis.id,
      name: specs.redis.name,
      type: specs.redis.type,
      data: {
        password: env.LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN,
        user: "default",
        host: redisHost,
        port: 6379,
        database: 0,
        ssl: true,
        disableTlsVerification: false,
      },
    },
    {
      id: specs.frappe.id,
      name: specs.frappe.name,
      type: specs.frappe.type,
      data: {
        name: "Authorization",
        value: `token ${env.LEXIA_LOTE2_FRAPPE_INTEGRATION_API_KEY}:${env.LEXIA_LOTE2_FRAPPE_INTEGRATION_API_SECRET}`,
      },
    },
    {
      id: specs.externalDisabled.id,
      name: specs.externalDisabled.name,
      type: specs.externalDisabled.type,
      data: {
        json: JSON.stringify({ headers: { "X-Lexia-Disabled": token } }),
      },
    },
  ];
}

export function assertStagingWorkflows(workflows, config) {
  const values = Object.values(workflows);
  if (values.length !== candidateKeys.length) {
    throw new Error("staging_workflow_count_invalid");
  }
  const serialized = JSON.stringify(values);
  if (serialized.includes("$env.")) throw new Error("staging_env_reference_remaining");
  if (/service_role|YOUR-PASSWORD|redis:\/\/default:/i.test(serialized)) {
    throw new Error("staging_secret_material_detected");
  }
  if (serialized.includes("app.uselexia.app")) {
    throw new Error("staging_production_destination_detected");
  }
  if (!serialized.includes(config.providerDisabledUrl)) {
    throw new Error("staging_disabled_provider_destination_missing");
  }

  const ids = new Set(values.map((workflow) => workflow.id));
  for (const workflow of values) {
    if (workflow.active !== false) throw new Error(`staging_workflow_active:${workflow.name}`);
    if (!ids.has(workflow.id)) throw new Error(`staging_workflow_id_missing:${workflow.name}`);
    for (const node of workflow.nodes) {
      if (
        node.type === "n8n-nodes-base.scheduleTrigger" &&
        node.disabled !== true
      ) {
        throw new Error(`staging_schedule_enabled:${node.name}`);
      }
      if (
        ["CANAIS | Webhook interno Z-API", "CANAIS | Webhook interno Meta"].includes(
          node.name,
        ) &&
        node.disabled !== true
      ) {
        throw new Error(`staging_provider_webhook_enabled:${node.name}`);
      }
      if (
        [
          "CANAIS | Webhook de teste da plataforma",
          "COMANDOS | Webhook autenticado do Frappe",
        ].includes(node.name) &&
        node.disabled === true
      ) {
        throw new Error(`staging_safe_webhook_disabled:${node.name}`);
      }
      if (
        [
          "n8n-nodes-base.httpRequest",
          "n8n-nodes-base.webhook",
          "n8n-nodes-base.redis",
          "n8n-nodes-base.supabase",
          "n8n-nodes-base.supabaseTool",
          "n8n-nodes-base.googleCalendar",
          "@n8n/n8n-nodes-langchain.openAi",
          "@n8n/n8n-nodes-langchain.googleGemini",
          "@n8n/n8n-nodes-langchain.lmChatOpenAi",
          "@n8n/n8n-nodes-langchain.lmChatAnthropic",
        ].includes(node.type) &&
        !node.credentials
      ) {
        throw new Error(`staging_node_without_credential:${workflow.name}:${node.name}`);
      }
      if (
        node.type === "n8n-nodes-base.executeWorkflow" ||
        node.type === "@n8n/n8n-nodes-langchain.toolWorkflow"
      ) {
        const targetId = node.parameters.workflowId?.value;
        if (!ids.has(targetId)) {
          throw new Error(`staging_subworkflow_target_invalid:${node.name}:${targetId}`);
        }
      }
    }
  }
}
