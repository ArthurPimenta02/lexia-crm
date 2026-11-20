import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export type AcessoAoOnboarding = { admin: SupabaseClient; clienteSlug: string; userId: string; lexia: boolean };

/**
 * De que empresa é o onboarding deste pedido.
 *
 * - Conta de cliente: SEMPRE a empresa da sessão, diga o pedido o que disser.
 *   O que vem do navegador não escolhe empresa.
 * - Equipe da Lexia (lexia_admin): a empresa pedida, depois de confirmada na
 *   lexia_clientes.
 * Qualquer outro caso: sem acesso.
 */
export async function acessoAoOnboarding(pedida?: unknown): Promise<AcessoAoOnboarding | null> {
  const a = await acessoOuMotivo(pedida);
  return "sem" in a ? null : a;
}

/** Igual a `acessoAoOnboarding`, mas diz porque não entrou: sem sessão (expirou: entrar de novo resolve) ou sem permissão. */
export async function acessoOuMotivo(pedida?: unknown): Promise<AcessoAoOnboarding | { sem: "sessao" | "permissao" }> {
  const { profile, user } = await getLoggedInUserProfile();
  if (!user) return { sem: "sessao" };
  if (!profile) return { sem: "permissao" };
  const admin = createAdminClient();
  if (isClientRole(profile.role)) {
    if (!profile.cliente_slug || profile.status !== "ativo") return { sem: "permissao" };
    return { admin, clienteSlug: profile.cliente_slug, userId: user.id, lexia: false };
  }
  if (profile.role !== "lexia_admin") return { sem: "permissao" };
  const slug = typeof pedida === "string" ? pedida.trim() : "";
  if (!slug) return { sem: "permissao" };
  const { data } = await admin.from("lexia_clientes").select("slug").eq("slug", slug).maybeSingle();
  return data ? { admin, clienteSlug: slug, userId: user.id, lexia: true } : { sem: "permissao" };
}

/** A resposta do servidor quando não há acesso: 401 com motivo quando a sessão expirou (a tela guarda e reenvia), 403 no resto. */
export const SESSAO_EXPIRADA = "Sua sessão expirou. Entre de novo: sua resposta está guardada.";
export function respostaSemAcesso(sem: "sessao" | "permissao"): Response {
  return sem === "sessao" ? Response.json({ erro: SESSAO_EXPIRADA, motivo: "sessao" }, { status: 401 }) : Response.json({ erro: "Acesso não autorizado.", motivo: "permissao" }, { status: 403 });
}
