import { assertClassificationCronRequest } from "@/lib/analyst/cron";
import { AnalystRequestError } from "@/lib/analyst/scope";
import { MetaAdsError } from "@/lib/meta/ads";
import { syncMetaCampanhas } from "@/lib/meta/sync";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Sincronização do gasto de campanhas (Fase 8).
 *
 * Chamada pelo n8n (Schedule Trigger + HTTP Request com Header Auth), uma vez
 * por dia. Não existe usuário logado aqui: a autorização é o mesmo Bearer
 * LEXIA_CRON_SECRET da classificação — reutilizado de propósito, para não
 * existirem dois caminhos de autenticação de cron a divergir com o tempo.
 *
 * Corpo:
 *   { "cliente_slug": "detail_by_cordeiro", "dias": 28 }
 *
 * `dias` acima de 28 só serve para o backfill inicial. No agendamento diário
 * deixar o padrão: 28 dias é o tempo que a Meta leva a parar de corrigir os
 * números de um dia já passado.
 */
export async function POST(request: Request) {
  try {
    assertClassificationCronRequest(request);

    let body: Record<string, unknown> = {};

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // Corpo inválido cai no erro de cliente_slug abaixo, que é mais claro.
    }

    const result = await syncMetaCampanhas({
      clienteSlug: String(body.cliente_slug ?? ""),
      lookbackDays: body.dias === undefined ? undefined : Number(body.dias),
    });

    return Response.json(result);
  } catch (error) {
    const status =
      error instanceof MetaAdsError || error instanceof AnalystRequestError
        ? error.status
        : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível sincronizar as campanhas.";

    if (status === 500) {
      console.error("Erro na sincronização de campanhas", error);
    }

    return Response.json({ error: message }, { status });
  }
}
