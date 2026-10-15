// Leitura e escrita das travas do agente no Redis (Upstash) de cada cliente.
// Módulo exclusivo de servidor: usa tokens privados e nunca deve ser importado
// por Client Components. O contrato das chaves está documentado em Agent.MD.

import {
  manualPauseDurations,
  type ManualPauseDuration,
} from "@/lib/redis/pause-durations";

export type AgentLockKind = "pausa_manual" | "pausa_eterna" | "status";

export type AgentLock = {
  canal: string;
  expiresAt: string | null;
  identificadorConversa: string;
  kind: AgentLockKind;
  ttlSeconds: number | null;
  value: string;
};

export type AgentLocksResult = {
  error: string | null;
  isConfigured: boolean;
  locks: AgentLock[];
};

type AgentLocksClientConfig = {
  envPrefix: string;
  // Canais que possuem a trava pós-agendamento no workflow.
  eternalPauseChannels: string[];
  namespacePrefix: string;
  namespaceSuffix: string;
};

const clientConfigs: Record<string, AgentLocksClientConfig> = {
  // Verificado a 15/10/2026 contra o Redis e os workflows reais: as 10 chaves
  // `status` existentes batem byte a byte com o que `buildKey` monta, e o nó
  // `Ver Pausa Manual` do omnichannel activo lê
  // `redis_namespace + ':pausa_manual:' + identificador_conversa`, com
  // `redis_namespace` = `lexia:detail_by_cordeiro:<canal>:v1`.
  //
  // `eternalPauseChannels` fica vazio porque nenhum workflow do Detail escreve
  // `pausa_eterna` — oferecer o botão era prometer retomar uma trava que não
  // existe.
  detail_by_cordeiro: {
    envPrefix: "DETAIL",
    eternalPauseChannels: [],
    namespacePrefix: "lexia:detail_by_cordeiro:",
    namespaceSuffix: ":v1",
  },
  miranda_skin_experts: {
    envPrefix: "MIRANDA",
    eternalPauseChannels: ["whatsapp"],
    namespacePrefix: "lexia:novo_cliente:",
    namespaceSuffix: ":v1",
  },
};

const allowedChannels = ["whatsapp", "instagram", "messenger"];
const lockKinds: AgentLockKind[] = ["pausa_manual", "pausa_eterna", "status"];
const conversationIdPattern = /^(whatsapp|instagram|messenger):[A-Za-z0-9._@+-]{3,64}$/;
const requestTimeoutMs = 8000;
const scanCount = 1000;
const maxScanIterations = 40;
const maxLocks = 500;

type UpstashReply = { error?: string; result?: unknown };

function getConfig(clienteSlug: string) {
  return clientConfigs[clienteSlug] ?? null;
}

function getCredentials(config: AgentLocksClientConfig) {
  const url = process.env[`${config.envPrefix}_UPSTASH_REDIS_REST_URL`]?.trim();
  const token =
    process.env[`${config.envPrefix}_UPSTASH_REDIS_REST_TOKEN`]?.trim();

  if (!url || !token) {
    return null;
  }

  return { token, url: url.replace(/\/+$/, "") };
}

export function hasAgentLocksIntegration(clienteSlug: string) {
  return Boolean(getConfig(clienteSlug));
}

export function getAgentLocksClientSlugs() {
  return Object.keys(clientConfigs);
}

export function isValidConversationId(value: string) {
  return conversationIdPattern.test(value);
}

export function supportsEternalPause(clienteSlug: string, canal: string) {
  return Boolean(getConfig(clienteSlug)?.eternalPauseChannels.includes(canal));
}

function getNamespace(config: AgentLocksClientConfig, canal: string) {
  return `${config.namespacePrefix}${canal}${config.namespaceSuffix}`;
}

function buildKey(
  config: AgentLocksClientConfig,
  kind: AgentLockKind,
  identificadorConversa: string,
) {
  const canal = identificadorConversa.split(":")[0];

  return `${getNamespace(config, canal)}:${kind}:${identificadorConversa}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getKeyPattern(config: AgentLocksClientConfig) {
  return new RegExp(
    `^${escapeRegExp(config.namespacePrefix)}(${allowedChannels.join("|")})${escapeRegExp(
      config.namespaceSuffix,
    )}:(${lockKinds.join("|")}):(.+)$`,
  );
}

async function runPipeline(
  credentials: { token: string; url: string },
  commands: (string | number)[][],
): Promise<UpstashReply[]> {
  const response = await fetch(`${credentials.url}/pipeline`, {
    body: JSON.stringify(commands),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Upstash respondeu HTTP ${response.status}.`);
  }

  const replies = (await response.json()) as UpstashReply[];

  if (!Array.isArray(replies) || replies.length !== commands.length) {
    throw new Error("Resposta inesperada do Upstash.");
  }

  const failed = replies.find((reply) => reply.error);

  if (failed) {
    throw new Error("O Redis recusou um dos comandos.");
  }

  return replies;
}

async function scanLockKeys(
  credentials: { token: string; url: string },
  config: AgentLocksClientConfig,
) {
  const keyPattern = getKeyPattern(config);
  const keys = new Set<string>();
  let cursor = "0";

  for (let iteration = 0; iteration < maxScanIterations; iteration += 1) {
    const [reply] = await runPipeline(credentials, [
      [
        "SCAN",
        cursor,
        "MATCH",
        `${config.namespacePrefix}*${config.namespaceSuffix}:*`,
        "COUNT",
        scanCount,
      ],
    ]);
    const [nextCursor, pageKeys] = reply.result as [string, string[]];

    for (const key of pageKeys ?? []) {
      if (keyPattern.test(key)) {
        keys.add(key);
      }
    }

    cursor = String(nextCursor);

    if (cursor === "0" || keys.size >= maxLocks) {
      break;
    }
  }

  return Array.from(keys).slice(0, maxLocks);
}

function toLock(
  config: AgentLocksClientConfig,
  key: string,
  value: unknown,
  ttl: unknown,
  now: number,
): AgentLock | null {
  const match = getKeyPattern(config).exec(key);
  const ttlSeconds = typeof ttl === "number" ? ttl : Number(ttl);

  // TTL -2 indica que a chave expirou entre o SCAN e a leitura.
  if (!match || value === null || value === undefined || ttlSeconds === -2) {
    return null;
  }

  const hasExpiry = Number.isFinite(ttlSeconds) && ttlSeconds >= 0;

  return {
    canal: match[1],
    expiresAt: hasExpiry
      ? new Date(now + ttlSeconds * 1000).toISOString()
      : null,
    identificadorConversa: match[3],
    kind: match[2] as AgentLockKind,
    ttlSeconds: hasExpiry ? ttlSeconds : null,
    value: String(value),
  };
}

async function readLocks(
  credentials: { token: string; url: string },
  config: AgentLocksClientConfig,
  keys: string[],
) {
  if (keys.length === 0) {
    return [];
  }

  const replies = await runPipeline(
    credentials,
    keys.flatMap((key) => [
      ["GET", key],
      ["TTL", key],
    ]),
  );
  const now = Date.now();

  return keys
    .map((key, index) =>
      toLock(
        config,
        key,
        replies[index * 2]?.result,
        replies[index * 2 + 1]?.result,
        now,
      ),
    )
    .filter((lock): lock is AgentLock => Boolean(lock));
}

function failure(isConfigured: boolean, error: string | null): AgentLocksResult {
  return { error, isConfigured, locks: [] };
}

export async function listAgentLocks(
  clienteSlug: string,
): Promise<AgentLocksResult> {
  const config = getConfig(clienteSlug);
  const credentials = config ? getCredentials(config) : null;

  if (!config || !credentials) {
    return failure(false, null);
  }

  try {
    const keys = await scanLockKeys(credentials, config);
    const locks = await readLocks(credentials, config, keys);

    return { error: null, isConfigured: true, locks };
  } catch (error) {
    console.error("Erro ao listar travas do agente no Redis", {
      clienteSlug,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });

    return failure(true, "Não foi possível consultar as pausas do agente.");
  }
}

export async function getConversationLocks(
  clienteSlug: string,
  identificadorConversa: string,
): Promise<AgentLocksResult> {
  const config = getConfig(clienteSlug);
  const credentials = config ? getCredentials(config) : null;

  if (!config || !credentials || !isValidConversationId(identificadorConversa)) {
    return failure(false, null);
  }

  try {
    const keys = lockKinds.map((kind) =>
      buildKey(config, kind, identificadorConversa),
    );
    const locks = await readLocks(credentials, config, keys);

    return { error: null, isConfigured: true, locks };
  } catch (error) {
    console.error("Erro ao ler travas da conversa no Redis", {
      clienteSlug,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });

    return failure(true, "Não foi possível consultar as pausas do agente.");
  }
}

type WriteResult = { error?: string; ok: boolean };

async function writeCommand(
  clienteSlug: string,
  identificadorConversa: string,
  buildCommand: (config: AgentLocksClientConfig) => (string | number)[],
): Promise<WriteResult> {
  const config = getConfig(clienteSlug);
  const credentials = config ? getCredentials(config) : null;

  if (!config || !credentials) {
    return { error: "Integração de pausas não configurada.", ok: false };
  }

  if (!isValidConversationId(identificadorConversa)) {
    return { error: "Conversa inválida.", ok: false };
  }

  try {
    await runPipeline(credentials, [buildCommand(config)]);

    return { ok: true };
  } catch (error) {
    console.error("Erro ao gravar trava do agente no Redis", {
      clienteSlug,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });

    return { error: "Não foi possível comunicar com o Redis.", ok: false };
  }
}

export async function setManualPause(
  clienteSlug: string,
  identificadorConversa: string,
  duration: ManualPauseDuration,
  metadata: { role: string; userId: string },
): Promise<WriteResult> {
  const option = manualPauseDurations.find((item) => item.value === duration);

  if (!option) {
    return { error: "Duração inválida.", ok: false };
  }

  // Qualquer valor não vazio pausa o agente; o JSON serve de auditoria.
  const value = JSON.stringify({
    duracao: option.value,
    em: new Date().toISOString(),
    origem: "painel_lexia",
    por: metadata.userId,
    role: metadata.role,
  });

  return writeCommand(clienteSlug, identificadorConversa, (config) => {
    const key = buildKey(config, "pausa_manual", identificadorConversa);

    return option.seconds
      ? ["SET", key, value, "EX", option.seconds]
      : ["SET", key, value];
  });
}

export async function clearManualPause(
  clienteSlug: string,
  identificadorConversa: string,
): Promise<WriteResult> {
  return writeCommand(clienteSlug, identificadorConversa, (config) => [
    "DEL",
    buildKey(config, "pausa_manual", identificadorConversa),
  ]);
}

export async function clearEternalPause(
  clienteSlug: string,
  identificadorConversa: string,
): Promise<WriteResult> {
  const canal = identificadorConversa.split(":")[0];

  if (!supportsEternalPause(clienteSlug, canal)) {
    return { error: "Este canal não possui pausa pós-agendamento.", ok: false };
  }

  return writeCommand(clienteSlug, identificadorConversa, (config) => [
    "DEL",
    buildKey(config, "pausa_eterna", identificadorConversa),
  ]);
}
