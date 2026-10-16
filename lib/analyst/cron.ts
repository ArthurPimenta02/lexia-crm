import "server-only";

import { timingSafeEqual } from "node:crypto";

import { getDateInputValue, getDateRange } from "@/lib/dashboard/date-range";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { createAdminClient } from "@/lib/supabase/admin";

import { analyzeConversationBatch } from "./classifier";
import { AnalystDataContext } from "./data";
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

/**
 * Parede de tempo do ciclo, não apenas um aviso: nenhuma chamada à OpenAI
 * pode terminar depois dela, porque o `timeout` de cada requisição é
 * encurtado para o que sobrar daqui. O limite declarado na rota é 60s, e os
 * segundos restantes cobrem o recálculo de cobertura e a resposta HTTP.
 */
const defaultTimeBudgetMs = 50_000;
/** Nunca ultrapassar o `maxDuration` declarado na rota. */
const maxTimeBudgetMs = 54_000;
/**
 * Abaixo disto não compensa começar outro cliente: a classificação seria
 * abortada no meio e só deixaria uma execução com erro para trás. Uma rodada
 * de seis conversas em paralelo levou entre 18s e 27s nas medições.
 */
const minimumClientBudgetMs = 20_000;

export type ClassificationClientResult = {
  analyzed: number;
  clienteSlug: string;
  coveragePercentage: number | null;
  durationMs: number;
  failed: number;
  pending: number;
  skipped: number;
};

export type ClassificationCycleResult = {
  analyzed: number;
  clientes: ClassificationClientResult[];
  durationMs: number;
  failed: number;
  pending: number;
  skipped: number;
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

function shuffle<T>(items: T[]) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }

  return result;
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

  // Cada execução só alcança os primeiros clientes antes de esgotar o tempo.
  // Numa ordem fixa, quem está no fim do alfabeto nunca seria classificado.
  // Embaralhar dá a todos a mesma chance ao longo das execuções, sem precisar
  // guardar de quem foi a vez anterior.
  return shuffle((data ?? []) as { nome: string | null; slug: string }[]);
}

export type ClassificationCycleInput = {
  clienteSlug?: string;
  /** Conversas classificadas em paralelo dentro de cada cliente. */
  concurrency?: number;
  /**
   * Mede só a leitura do histórico e a cobertura, sem chamar a OpenAI.
   * Serve para separar "o banco está lento" de "a classificação está lenta"
   * quando o ciclo estoura o tempo de execução.
   */
  dryRun?: boolean;
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
    Math.min(
      Number(input.timeBudgetMs ?? defaultTimeBudgetMs) || defaultTimeBudgetMs,
      maxTimeBudgetMs,
    ),
  );

  const clients = await listActiveClients(input.clienteSlug);

  if (clients.length === 0) {
    throw new AnalystRequestError("Nenhum cliente ativo encontrado.", 404);
  }

  const results: ClassificationClientResult[] = [];
  const skippedForTime: string[] = [];

  const deadlineAt = startedAt + timeBudgetMs;

  for (const client of clients) {
    // Não basta o prazo ainda não ter passado: o que sobra precisa dar para
    // uma rodada inteira. Começar em cima da hora só produziria erro.
    if (deadlineAt - Date.now() < minimumClientBudgetMs) {
      skippedForTime.push(client.slug);
      continue;
    }

    const clientStartedAt = Date.now();

    try {
      const scope = buildSystemScope(client, lookbackDays);

      if (input.dryRun) {
        const coverage = await new AnalystDataContext(scope).getCoverage();

        results.push({
          analyzed: 0,
          clienteSlug: client.slug,
          coveragePercentage: coverage.coveragePercentage,
          durationMs: Date.now() - clientStartedAt,
          failed: 0,
          pending: coverage.pendingConversations,
          skipped: 0,
        });
        continue;
      }

      const result = await analyzeConversationBatch(scope, limit, {
        concurrency: input.concurrency,
        deadlineAt,
        enforceRateLimit: false,
      });

      results.push({
        analyzed: result.analyzed,
        clienteSlug: client.slug,
        coveragePercentage: result.coverage.coveragePercentage,
        durationMs: Date.now() - clientStartedAt,
        failed: result.failed,
        pending: result.pending,
        skipped: result.skipped,
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
        durationMs: Date.now() - clientStartedAt,
        failed: 1,
        pending: 0,
        skipped: 0,
      });
    }
  }

  return {
    analyzed: results.reduce((total, item) => total + item.analyzed, 0),
    clientes: results,
    durationMs: Date.now() - startedAt,
    failed: results.reduce((total, item) => total + item.failed, 0),
    pending: results.reduce((total, item) => total + item.pending, 0),
    skipped: results.reduce((total, item) => total + item.skipped, 0),
    skippedForTime,
  };
}
