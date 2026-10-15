import { timingSafeEqual } from "node:crypto";

import { getMetaAdsConfig, MetaAdsError } from "@/lib/meta/ads";
import { syncMetaCampanhas } from "@/lib/meta/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Agendamento diário do gasto de campanhas (Fase 8).
 *
 * Quem chama é o Vercel Cron declarado no `vercel.json`, não o n8n: a rota vive
 * na mesma aplicação, e um agendamento a menos no n8n é uma peça a menos a
 * poder falhar em silêncio.
 *
 * O Vercel manda `Authorization: Bearer $CRON_SECRET` por si, desde que a
 * variável exista no projecto. É por isso que a autorização aqui é a
 * `CRON_SECRET` e não a `LEXIA_CRON_SECRET` da rota de sincronização manual —
 * aquela continua a servir o n8n e quem chama à mão.
 *
 * Corre todos os clientes activos que tenham conta de anúncios configurada,
 * um a seguir ao outro: em paralelo seria mais rápido mas gastaria o limite de
 * pedidos por hora da Meta de uma vez.
 */

function autorizado(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || secret.length < 16) {
    return false;
  }

  const [scheme, token] = (request.headers.get("authorization") ?? "").split(
    /\s+/,
    2,
  );

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return false;
  }

  const recebido = Buffer.from(token);
  const esperado = Buffer.from(secret);

  return (
    recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
  );
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return Response.json({ error: "Integração não autorizada." }, { status: 401 });
  }

  // Sem sessão de utilizador: a leitura da lista de clientes é com a chave de
  // serviço, como no cron da classificação.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("lexia_clientes")
    .select("slug")
    .eq("status", "ativo")
    .order("slug");

  if (error) {
    console.error("Cron de campanhas: falha ao listar clientes", error);

    return Response.json(
      { error: "Não foi possível listar os clientes." },
      { status: 500 },
    );
  }

  const slugs = (data ?? [])
    .map((cliente) => cliente.slug as string)
    .filter((slug) => getMetaAdsConfig(slug) !== null);

  const resultados: {
    clienteSlug: string;
    erro?: string;
    gastoTotal?: number;
    linhas?: number;
  }[] = [];

  for (const clienteSlug of slugs) {
    try {
      const resultado = await syncMetaCampanhas({ clienteSlug });

      resultados.push({
        clienteSlug,
        gastoTotal: resultado.gastoTotal,
        linhas: resultado.linhas,
      });
    } catch (erro) {
      // Um cliente com o token sem acesso não pode impedir os outros de
      // actualizar; o erro fica na resposta e nos logs do cron.
      const mensagem =
        erro instanceof MetaAdsError || erro instanceof Error
          ? erro.message
          : "Falha desconhecida.";

      console.error("Cron de campanhas: falha num cliente", {
        clienteSlug,
        erro,
      });
      resultados.push({ clienteSlug, erro: mensagem });
    }
  }

  return Response.json({ clientes: resultados, total: resultados.length });
}
