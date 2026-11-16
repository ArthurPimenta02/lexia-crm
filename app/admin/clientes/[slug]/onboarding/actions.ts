"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { abrirOnboarding, gravarEstado, gravarEtapa1, type Etapa1 } from "@/lib/onboarding/dados";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoEtapa1 = { message: string | null; type: "success" | "error" | null };

const IDIOMAS = ["Português", "English", "Español"];
const texto = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

async function clienteDoAdmin(slug: string) {
  const { profile, user } = await getLoggedInUserProfile();
  if (!user || profile?.role !== "lexia_admin") return null;
  const admin = createAdminClient();
  const { data } = await admin.from("lexia_clientes").select("slug").eq("slug", slug).maybeSingle();
  return data ? { admin, user } : null;
}

/** Grava as informações gerais da Etapa 1. Só `lexia_admin`. */
export async function salvarEtapa1(clienteSlug: string, _estado: EstadoEtapa1, formData: FormData): Promise<EstadoEtapa1> {
  const t = await getT();
  const c = await clienteDoAdmin(clienteSlug);
  if (!c) return { message: t("Acesso não autorizado."), type: "error" };
  const etapa1: Etapa1 = {
    instagram: texto(formData, "instagram", 300),
    site: texto(formData, "site", 300),
    google: texto(formData, "google", 500),
    tipo_de_negocio: texto(formData, "tipo_de_negocio", 120),
    idiomas: formData.getAll("idiomas").map(String).filter((i) => IDIOMAS.includes(i)),
    notas: texto(formData, "notas", 20_000),
    texto_colado: texto(formData, "texto_colado", 60_000),
  };
  try {
    await abrirOnboarding(c.admin, clienteSlug);
    await gravarEtapa1(c.admin, clienteSlug, etapa1);
  } catch {
    return { message: t("Não foi possível salvar. Tente de novo."), type: "error" };
  }
  revalidatePath(`/admin/clientes/${clienteSlug}/onboarding`);
  return { message: t("Salvo."), type: "success" };
}

/** Passa o onboarding para a conversa: a partir daqui a cliente vê a Etapa 2. */
export async function liberarConversa(clienteSlug: string): Promise<EstadoEtapa1> {
  const t = await getT();
  const c = await clienteDoAdmin(clienteSlug);
  if (!c) return { message: t("Acesso não autorizado."), type: "error" };
  const onb = await abrirOnboarding(c.admin, clienteSlug);
  if (onb.estado !== "etapa1") return { message: t("A conversa já foi liberada."), type: "error" };
  if (!onb.achados?.rascunho_em) return { message: t("Gere o rascunho antes de liberar a conversa."), type: "error" };
  await gravarEstado(c.admin, clienteSlug, { estado: "conversa" });
  revalidatePath(`/admin/clientes/${clienteSlug}/onboarding`);
  return { message: t("Conversa liberada."), type: "success" };
}
