"use server";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { acessoAoOnboarding } from "@/lib/onboarding/acesso";
import { liberarConversaDe, salvarEtapa1De, type EstadoEtapa1 } from "@/lib/onboarding/etapa1-acoes";

/** Painel do cliente: a empresa é a da sessão. Nada do que vem do navegador escolhe empresa. */
async function acessoDoCliente() {
  const { profile } = await getLoggedInUserProfile();
  if (!profile || !isClientRole(profile.role)) return null;
  return acessoAoOnboarding();
}

export async function salvarEtapa1(_estado: EstadoEtapa1, formData: FormData): Promise<EstadoEtapa1> {
  return salvarEtapa1De(await acessoDoCliente(), formData);
}

export async function liberarConversa(): Promise<EstadoEtapa1> {
  return liberarConversaDe(await acessoDoCliente());
}
