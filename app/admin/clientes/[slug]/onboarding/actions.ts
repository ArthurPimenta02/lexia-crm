"use server";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { acessoAoOnboarding } from "@/lib/onboarding/acesso";
import { liberarConversaDe, salvarEtapa1De, type EstadoEtapa1 } from "@/lib/onboarding/etapa1-acoes";

/** Só a equipe da Lexia. O cliente escolhido é confirmado na lexia_clientes (em `acessoAoOnboarding`). */
async function acessoDaLexia(clienteSlug: string) {
  const { profile } = await getLoggedInUserProfile();
  if (profile?.role !== "lexia_admin") return null;
  return acessoAoOnboarding(clienteSlug);
}

export async function salvarEtapa1(clienteSlug: string, _estado: EstadoEtapa1, formData: FormData): Promise<EstadoEtapa1> {
  return salvarEtapa1De(await acessoDaLexia(clienteSlug), formData);
}

export async function liberarConversa(clienteSlug: string): Promise<EstadoEtapa1> {
  return liberarConversaDe(await acessoDaLexia(clienteSlug));
}
