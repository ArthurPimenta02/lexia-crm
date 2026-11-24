"use server";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { acessoAoOnboarding } from "@/lib/onboarding/acesso";
import { gravarNaBaseDoAgente, previaDaBaseDoAgente, type Previa, type ResultadoDaGravacao } from "@/lib/onboarding/exportar-base";
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

/** Etapa 3: a prévia da base do agente (não grava nada). Só lexia_admin. */
export async function previaDaBase(clienteSlug: string): Promise<Previa> {
  return previaDaBaseDoAgente(await acessoDaLexia(clienteSlug));
}

/** Etapa 3: grava na base PRÓPRIA do cliente (conexão supabase_cliente deste slug). Só lexia_admin. */
export async function gravarNaBase(clienteSlug: string): Promise<ResultadoDaGravacao> {
  return gravarNaBaseDoAgente(await acessoDaLexia(clienteSlug));
}
