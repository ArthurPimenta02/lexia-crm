import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getConversationKey,
  type DashboardMessageMetricRow,
} from "@/lib/dashboard/operational-metrics";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

type MetricsRange = {
  end: Date;
  start: Date;
};

type PriorInboundRow = {
  cliente_slug: string;
  criado_em: string | null;
  id: string;
  identificador_conversa: string;
};

const identifierBatchSize = 100;

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function getQueryBounds(rangesByClient: ReadonlyMap<string, MetricsRange>) {
  const ranges = Array.from(rangesByClient.values());

  return {
    end: new Date(Math.max(...ranges.map((range) => range.end.getTime()))),
    start: new Date(Math.min(...ranges.map((range) => range.start.getTime()))),
  };
}

export async function fetchDashboardPeriodMessages(
  supabase: SupabaseClient,
  clientSlugs: string[],
  rangesByClient: ReadonlyMap<string, MetricsRange>,
) {
  if (clientSlugs.length === 0 || rangesByClient.size === 0) {
    return { data: [] as DashboardMessageMetricRow[], error: null };
  }

  const bounds = getQueryBounds(rangesByClient);
  const result = await fetchAllSupabaseRows<DashboardMessageMetricRow>(
    async (from, to) => {
      let query = supabase
        .from("lexia_mensagens")
        .select(
          "id, cliente_slug, identificador_conversa, direccao, origem, criado_em",
        )
        .not("identificador_conversa", "like", "teste:%")
        .gte("criado_em", bounds.start.toISOString())
        .lt("criado_em", bounds.end.toISOString());

      query =
        clientSlugs.length === 1
          ? query.eq("cliente_slug", clientSlugs[0])
          : query.in("cliente_slug", clientSlugs);

      const page = await query
        .order("criado_em", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      return {
        data: (page.data ?? []) as DashboardMessageMetricRow[],
        error: page.error,
      };
    },
  );

  if (result.error) {
    return result;
  }

  return {
    data: result.data.filter((message) => {
      const range = rangesByClient.get(message.cliente_slug);

      if (!range || !message.criado_em) {
        return false;
      }

      const createdAt = new Date(message.criado_em);

      return createdAt >= range.start && createdAt < range.end;
    }),
    error: null,
  };
}

export async function findStartedConversationKeys(
  supabase: SupabaseClient,
  periodMessages: DashboardMessageMetricRow[],
  rangesByClient: ReadonlyMap<string, MetricsRange>,
) {
  const candidateKeys = new Set(
    periodMessages
      .filter((message) => message.direccao === "recebida")
      .map(getConversationKey),
  );

  if (candidateKeys.size === 0) {
    return { data: candidateKeys, error: null };
  }

  const clientSlugs = Array.from(
    new Set(periodMessages.map((message) => message.cliente_slug)),
  );
  const identifiers = Array.from(
    new Set(
      periodMessages
        .filter((message) => candidateKeys.has(getConversationKey(message)))
        .map((message) => message.identificador_conversa),
    ),
  );
  const latestRangeStart = new Date(
    Math.max(
      ...Array.from(rangesByClient.values()).map((range) =>
        range.start.getTime(),
      ),
    ),
  );
  const batchResults = await Promise.all(
    chunkValues(identifiers, identifierBatchSize).map((identifierBatch) =>
      fetchAllSupabaseRows<PriorInboundRow>(async (from, to) => {
        let query = supabase
          .from("lexia_mensagens")
          .select("id, cliente_slug, identificador_conversa, criado_em")
          .eq("direccao", "recebida")
          .not("identificador_conversa", "like", "teste:%")
          .in("identificador_conversa", identifierBatch)
          .lt("criado_em", latestRangeStart.toISOString());

        query =
          clientSlugs.length === 1
            ? query.eq("cliente_slug", clientSlugs[0])
            : query.in("cliente_slug", clientSlugs);

        const page = await query
          .order("criado_em", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);

        return {
          data: (page.data ?? []) as PriorInboundRow[],
          error: page.error,
        };
      }),
    ),
  );
  const failedResult = batchResults.find((result) => result.error);

  if (failedResult?.error) {
    return { data: new Set<string>(), error: failedResult.error };
  }

  const priorConversationKeys = new Set<string>();

  for (const row of batchResults.flatMap((result) => result.data)) {
    const range = rangesByClient.get(row.cliente_slug);
    const key = getConversationKey(row);

    if (
      range &&
      row.criado_em &&
      candidateKeys.has(key) &&
      new Date(row.criado_em) < range.start
    ) {
      priorConversationKeys.add(key);
    }
  }

  return {
    data: new Set(
      Array.from(candidateKeys).filter((key) => !priorConversationKeys.has(key)),
    ),
    error: null,
  };
}
