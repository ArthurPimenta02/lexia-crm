"use server";

import { revalidatePath } from "next/cache";

import { eEstadoItem, LIMITE_NOTA } from "@/lib/analises/regras";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: boolean; error?: string };

/**
 * Análises das conversas (19/11/2026). As tabelas são escritas com a
 * service_role, que ignora o RLS: cada acção confirma `lexia_admin` ANTES de
 * lhes tocar.
 */
async function adminId() {
  const { profile, user } = await getLoggedInUserProfile();
  return user && profile?.role === "lexia_admin" ? user.id : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Visto, corrigido, falso alarme (ou de volta a novo). */
export async function mudarEstadoItem(id: string, estado: string): Promise<ActionResult> {
  const t = await getT();
  if (!(await adminId())) return { ok: false, error: t("Acesso não autorizado.") };
  if (!UUID.test(id) || !eEstadoItem(estado)) return { ok: false, error: t("Pedido inválido.") };
  const { error } = await createAdminClient().from("lexia_analises_itens").update({ estado }).eq("id", id);
  if (error) return { ok: false, error: t("Não foi possível salvar.") };
  revalidatePath("/admin/analises");
  return { ok: true };
}

/** A nota do admin num item (vazia apaga). */
export async function guardarNotaItem(id: string, nota: string): Promise<ActionResult> {
  const t = await getT();
  if (!(await adminId())) return { ok: false, error: t("Acesso não autorizado.") };
  if (!UUID.test(id) || typeof nota !== "string") return { ok: false, error: t("Pedido inválido.") };
  const texto = nota.trim().slice(0, LIMITE_NOTA) || null;
  const { error } = await createAdminClient().from("lexia_analises_itens").update({ nota_admin: texto }).eq("id", id);
  if (error) return { ok: false, error: t("Não foi possível salvar.") };
  revalidatePath("/admin/analises");
  return { ok: true };
}
