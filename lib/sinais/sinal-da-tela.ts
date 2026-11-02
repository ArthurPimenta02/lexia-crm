"use server";

import { createClient as createExternalClient } from "@supabase/supabase-js";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * O "sinal" de uma tela: um texto minúsculo que muda quando há novidade
 * (mensagem nova, turno novo, handoff novo). A tela pergunta-o de poucos em
 * poucos segundos e só volta a carregar os dados completos quando ele muda.
 *
 * Existe porque o Supabase e a Vercel estão no plano gratuito (Arthur, 02/11):
 * recarregar a página inteira a cada 15 s lia ~300 KB de cada vez, mesmo sem
 * nada novo; o sinal lê uma linha.
 *
 * Âmbito: o cliente só vê o sinal do próprio cliente (o slug pedido é
 * ignorado); Controle do agente e Follow-ups são só do lexia_admin.
 */
export type TelaComSinal = "conversas" | "handoffs" | "turnos" | "followups";

const BASES_CLIENTE: Record<string, string> = { miranda_skin_experts: "MIRANDA" };

export async function sinalDaTela(tela: TelaComSinal, clienteSlug?: string | null): Promise<string> {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) return "";
  const admin = profile.role === "lexia_admin";
  const slug = admin ? clienteSlug || null : profile.cliente_slug;
  if (!admin && !slug) return "";

  if (tela === "conversas") {
    const supabase = await createClient();
    let mensagens = supabase.from("lexia_mensagens").select("id, criado_em").order("criado_em", { ascending: false }).limit(1);
    let contactos = supabase.from("lexia_contactos").select("atualizado_em").order("atualizado_em", { ascending: false }).limit(1);
    if (slug) {
      mensagens = mensagens.eq("cliente_slug", slug);
      contactos = contactos.eq("cliente_slug", slug);
    }
    const [{ data: m }, { data: c }] = await Promise.all([mensagens, contactos]);
    return `${m?.[0]?.id ?? ""}|${m?.[0]?.criado_em ?? ""}|${c?.[0]?.atualizado_em ?? ""}`;
  }

  if (tela === "handoffs") {
    const supabase = await createClient();
    let q = supabase.from("lexia_handoffs").select("id, criado_em, status").order("criado_em", { ascending: false }).limit(1);
    if (slug) q = q.eq("cliente_slug", slug);
    let abertos = supabase.from("lexia_handoffs").select("id", { count: "exact", head: true }).neq("status", "resolvido");
    if (slug) abertos = abertos.eq("cliente_slug", slug);
    const [{ data }, { count }] = await Promise.all([q, abertos]);
    return `${data?.[0]?.id ?? ""}|${data?.[0]?.status ?? ""}|${count ?? ""}`;
  }

  if (!admin) return "";

  if (tela === "turnos") {
    let q = createAdminClient().from("lexia_turnos").select("id, criado_em").order("criado_em", { ascending: false }).limit(1);
    if (slug) q = q.eq("cliente_slug", slug);
    const { data } = await q;
    return `${data?.[0]?.id ?? ""}|${data?.[0]?.criado_em ?? ""}`;
  }

  // followups: a base do cliente (lexia_followups) + os turnos de follow-up/lembrete no CRM
  const prefixo = BASES_CLIENTE[slug ?? "miranda_skin_experts"];
  const url = prefixo ? process.env[`${prefixo}_SUPABASE_URL`]?.trim() : undefined;
  const chave = prefixo ? process.env[`${prefixo}_SUPABASE_SERVICE_ROLE_KEY`]?.trim() : undefined;
  const base = url && chave ? createExternalClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
  const [fu, tu] = await Promise.all([
    base
      ? base.from("lexia_followups").select("atualizado_em").order("atualizado_em", { ascending: false }).limit(1)
      : Promise.resolve({ data: null }),
    createAdminClient().from("lexia_turnos").select("id").in("rota", ["followup", "lembrete"]).order("criado_em", { ascending: false }).limit(1),
  ]);
  return `${fu.data?.[0]?.atualizado_em ?? ""}|${tu.data?.[0]?.id ?? ""}`;
}
