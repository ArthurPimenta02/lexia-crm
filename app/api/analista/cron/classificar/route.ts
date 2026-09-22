import {
  assertClassificationCronRequest,
  runClassificationCycle,
} from "@/lib/analyst/cron";
import { AnalystRequestError } from "@/lib/analyst/scope";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Classificação agendada das conversas.
 *
 * Chamada pelo n8n (Schedule Trigger + HTTP Request com Header Auth).
 * Não existe usuário logado aqui: a autorização é o Bearer LEXIA_CRON_SECRET.
 */
export async function POST(request: Request) {
  try {
    assertClassificationCronRequest(request);

    let body: Record<string, unknown> = {};

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // Corpo vazio é válido: roda com os padrões para todos os clientes ativos.
    }

    const clienteSlug = String(body.cliente_slug ?? "").trim();
    const result = await runClassificationCycle({
      clienteSlug: clienteSlug || undefined,
      concurrency:
        body.paralelas === undefined ? undefined : Number(body.paralelas),
      dryRun: body.apenas_medir === true,
      limit: body.limite === undefined ? undefined : Number(body.limite),
      lookbackDays: body.dias === undefined ? undefined : Number(body.dias),
      // Permite afinar o corte pelo n8n sem precisar de outro deploy.
      timeBudgetMs:
        body.orcamento_ms === undefined ? undefined : Number(body.orcamento_ms),
    });

    return Response.json(result);
  } catch (error) {
    const status = error instanceof AnalystRequestError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível executar a classificação agendada.";

    if (status === 500) {
      console.error("Erro na classificação agendada do Analista Lexia", error);
    }

    return Response.json({ error: message }, { status });
  }
}
