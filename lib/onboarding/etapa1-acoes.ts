import "server-only";

import { revalidatePath } from "next/cache";

import { getT } from "@/lib/i18n/servidor";
import type { AcessoAoOnboarding } from "@/lib/onboarding/acesso";
import { abrirOnboarding, gravarEstado, gravarEtapa1, type Etapa1 } from "@/lib/onboarding/dados";

/**
 * O que as ações da Etapa 1 fazem, depois de alguém já ter decidido de que
 * empresa se trata (`acessoAoOnboarding`). As duas portas — a do painel do
 * cliente e a do admin — chamam isto.
 */
export type EstadoEtapa1 = { message: string | null; type: "success" | "error" | null };

const IDIOMAS = ["Português", "English", "Español"];
const texto = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

function revalidar(slug: string) {
  revalidatePath(`/admin/clientes/${slug}/onboarding`);
  revalidatePath("/app/onboarding");
}

export async function salvarEtapa1De(acesso: AcessoAoOnboarding | null, formData: FormData): Promise<EstadoEtapa1> {
  const t = await getT();
  if (!acesso) return { message: t("Acesso não autorizado."), type: "error" };
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
    const onb = await abrirOnboarding(acesso.admin, acesso.clienteSlug);
    if (onb.estado !== "etapa1") return { message: t("A conversa já foi liberada."), type: "error" };
    await gravarEtapa1(acesso.admin, acesso.clienteSlug, etapa1);
  } catch {
    return { message: t("Não foi possível salvar. Tente de novo."), type: "error" };
  }
  revalidar(acesso.clienteSlug);
  return { message: t("Salvo."), type: "success" };
}

/** Passa o onboarding para a conversa (Etapa 2). */
export async function liberarConversaDe(acesso: AcessoAoOnboarding | null): Promise<EstadoEtapa1> {
  const t = await getT();
  if (!acesso) return { message: t("Acesso não autorizado."), type: "error" };
  const onb = await abrirOnboarding(acesso.admin, acesso.clienteSlug);
  if (onb.estado !== "etapa1") return { message: t("A conversa já foi liberada."), type: "error" };
  if (!onb.achados?.rascunho_em) return { message: t("Gere o rascunho antes de liberar a conversa."), type: "error" };
  await gravarEstado(acesso.admin, acesso.clienteSlug, { estado: "conversa" });
  revalidar(acesso.clienteSlug);
  return { message: t("Conversa liberada."), type: "success" };
}
