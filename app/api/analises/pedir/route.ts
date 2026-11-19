import { randomUUID } from "node:crypto";

import { dispararRotina } from "@/lib/analises/gatilho";
import { validarPedido } from "@/lib/analises/regras";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Pedir uma análise das conversas (19/11/2026), só `lexia_admin`.
 *
 * Corpo: { tipo: "geral" | "especifica", periodo: "24h" | "3d" | "7d",
 *          cliente?: slug, conversa?: identificador, pergunta?: texto }
 *
 * Grava uma linha `estado='pedida'` em `lexia_analises` (service_role, depois
 * de confirmar o papel) e, se houver `ANALISE_GITHUB_TOKEN`, abre a issue que
 * dispara a rotina na nuvem. Sem a variável, fica só a linha.
 */
export async function POST(request: Request) {
  const t = await getT();
  const { profile, user } = await getLoggedInUserProfile();
  if (!user || !profile) return Response.json({ erro: t("Acesso não autorizado.") }, { status: 401 });
  if (profile.role !== "lexia_admin") return Response.json({ erro: t("Acesso não autorizado.") }, { status: 403 });

  const corpo = await request.json().catch(() => null);
  const v = validarPedido(corpo, new Date());
  if (!v.ok) {
    const mensagens = {
      cliente: t("Escolha o cliente."),
      pergunta: t("Escreva o que quer que a análise procure."),
      periodo: t("Escolha o período."),
      tipo: t("Pedido inválido."),
    } as const;
    return Response.json({ erro: mensagens[v.erro] }, { status: 400 });
  }

  const admin = createAdminClient();
  if (v.linha.cliente_slug) {
    const { data: cliente } = await admin
      .from("lexia_clientes")
      .select("slug")
      .eq("slug", v.linha.cliente_slug)
      .maybeSingle();
    if (!cliente) return Response.json({ erro: t("Cliente não encontrado.") }, { status: 400 });
  }

  const id = randomUUID();
  const { error } = await admin.from("lexia_analises").insert({ id, ...v.linha });
  if (error) {
    const semTabela = error.code === "42P01" || error.code === "PGRST205";
    console.error("[analises] gravar pedido", error.code);
    return Response.json(
      { erro: semTabela ? t("Falta rodar a migration das análises no Supabase central.") : t("Não foi possível registrar o pedido.") },
      { status: 500 },
    );
  }

  const gatilho = await dispararRotina(id, v.linha);
  const mensagem =
    gatilho === "disparada"
      ? t("Análise pedida. O relatório aparece aqui quando terminar.")
      : t("Pedido registrado; roda na próxima análise.");
  return Response.json({ disparada: gatilho === "disparada", id, mensagem, ok: true });
}
