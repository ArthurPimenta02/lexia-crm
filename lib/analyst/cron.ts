import "server-only";

import { timingSafeEqual } from "node:crypto";

import { getDateInputValue, getDateRange } from "@/lib/dashboard/date-range";
import { getClientTimezone } from "@/lib/metrics/external-client-metrics";
import { createAdminClient } from "@/lib/supabase/admin";

import { analyzeConversationBatch } from "./classifier";
import { AnalystRequestError } from "./scope";
import type { AnalystScope } from "./types";

/**
 * Classificação agendada.
 *
 * O n8n só agenda e chama; toda a leitura de conversa e a chamada à OpenAI
 * continuam dentro da plataforma. Nenhuma transcrição sai daqui.
 */

const defaultBatchLimit = 4;
const maxBatchLimit = 8;
const defaultLookbackDays = 90;
const maxLookbackDays = 366;

/** Margem para responder antes do limite de execução da função na Vercel. */
const defaultTimeBudgetMs = 45_000;

export type ClassificationClientResult = {
  analyzed: number;
  clienteSlug: string;
  coveragePercentage: number | null;
  failed: number;
  pending: number;
};

export type ClassificationCycleResult = {
  analyzed: number;
  clientes: ClassificationClientResult[];
  failed: number;
  pending: number;
  skippedForTime: string[];
};

function getClassificationCronSecret() {
  const secret = process.env.LEXIA_CRON_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new AnalystRequestError(
      "A classificação agendada ainda não está configurada.",
      503,
    );
  }

  return secret;
}

function constantTimeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function assertClassificationCronRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  const expected = getClassificationCronSecret();

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    !constantTimeEqual(token, expected)
  ) {
    throw new AnalystRequestError("Integração não autorizada.", 401);
  }
}

/**
 * Escopo de sistema: mesmo formato que o do usuário logado, mas sem usuário.
 * `userId` vazio faz a execução ser gravada com `criado_por` nulo.
 */
function buildSystemScope(
  client: { nome: string | null; slug: string },
  lookbackDays: number,
): AnalystScope {
  const timezone = getClientTimezone(client.slug);
  const now = new Date();
  const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  return {
    channel: "todos",
    clienteName: client.nome || client.slug,
    clienteSlug: client.slug,
    range: getDateRange(
      "personalizado",
      getDateInputValue(start, timezone),
      getDateInputValue(now, timezone),
      timezone,
    ),
    role: "lexia_admin",
    timezone,
    userId: "",
  };
}

async function listActiveClients(clienteSlug?: string) {
  const admin = createAdminClient();
  let query = admin
    .from("lexia_clientes")
    .select("nome, slug")
    .eq("status", "ativo")
    .order("slug", { ascending: true });

  if (clienteSlug) {
    query = query.eq("slug", clienteSlug);
  }

  const { data, error } = await query;

  if (error) {
    throw new AnalystRequestError(
      "Não foi possível listar os clientes ativos.",
      500,
    );
  }

  return (data ?? []) as { nome: string | null; slug: string }[];
}

export type ClassificationCycleInput = {
  clienteSlug?: string;
  limit?: number;
  lookbackDays?: number;
  timeBudgetMs?: number;
};

export async function runClassificationCycle(
  input: ClassificationCycleInput = {},
): Promise<ClassificationCycleResult> {
  const startedAt = Date.now();
  const limit = Math.max(
    1,
    Math.min(Number(input.limit ?? defaultBatchLimit) || defaultBatchLimit, maxBatchLimit),
  );
  const lookbackDays = Math.max(
    1,
    Math.min(
      Number(input.lookbackDays ?? defaultLookbackDays) || defaultLookbackDays,
      maxLookbackDays,
    ),
  );
  const timeBudgetMs = Math.max(
    5_000,
    Number(input.timeBudgetMs ?? defaultTimeBudgetMs) || defaultTimeBudgetMs,
  );

  const clients = await listActiveClients(input.clienteSlug);

  if (clients.length === 0) {
    throw new AnalystRequestError("Nenhum cliente ativo encontrado.", 404);
  }

  const results: ClassificationClientResult[] = [];
  const skippedForTime: string[] = [];

  for (const client of clients) {
    if (Date.now() - startedAt > timeBudgetMs) {
      skippedForTime.push(client.slug);
      continue;
    }

    try {
      const scope = buildSystemScope(client, lookbackDays);
      const result = await analyzeConversationBatch(scope, limit, {
        enforceRateLimit: false,
      });

      results.push({
        analyzed: result.analyzed,
        clienteSlug: client.slug,
        coveragePercentage: result.coverage.coveragePercentage,
        failed: result.failed,
        pending: result.pending,
      });
    } catch (error) {
      // Um cliente com problema não pode impedir os outros de serem processados.
      console.error("Falha no ciclo de classificação do Analista Lexia", {
        clienteSlug: client.slug,
        error,
      });

      results.push({
        analyzed: 0,
        clienteSlug: client.slug,
        coveragePercentage: null,
        failed: 1,
        pending: 0,
      });
    }
  }

  return {
    analyzed: results.reduce((total, item) => total + item.analyzed, 0),
    clientes: results,
    failed: results.reduce((total, item) => total + item.failed, 0),
    pending: results.reduce((total, item) => total + item.pending, 0),
    skippedForTime,
  };
}
