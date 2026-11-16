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
  const { profile, user } = await getLoggedInUserProfile();
  if (!user || !profile) return null;
  const admin = createAdminClient();
  if (isClientRole(profile.role)) {
    if (!profile.cliente_slug || profile.status !== "ativo") return null;
    return { admin, clienteSlug: profile.cliente_slug, userId: user.id, lexia: false };
  }
  if (profile.role !== "lexia_admin") return null;
  const slug = typeof pedida === "string" ? pedida.trim() : "";
  if (!slug) return null;
  const { data } = await admin.from("lexia_clientes").select("slug").eq("slug", slug).maybeSingle();
  return data ? { admin, clienteSlug: slug, userId: user.id, lexia: true } : null;
}
