"use server";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { acessoAoOnboarding } from "@/lib/onboarding/acesso";
import { liberarConversaDe, salvarEtapa1De, type EstadoEtapa1 } from "@/lib/onboarding/etapa1-acoes";
import { enviarParaAEquipe, salvarNaRevisao, type ResultadoDaRevisao } from "@/lib/onboarding/revisao";

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

/** Revisão (Etapa 3): corrigir um campo da ficha antes de enviar. */
export async function salvarCampoDaRevisao(pedido: { campo: string; itemId: string | null; valor: unknown }): Promise<ResultadoDaRevisao> {
  return salvarNaRevisao(await acessoDoCliente(), { campo: String(pedido.campo ?? ""), itemId: typeof pedido.itemId === "string" ? pedido.itemId : null, valor: pedido.valor });
}

/** Revisão (Etapa 3): enviar a ficha para a equipe. Depois disto, ela não muda mais por aqui. */
export async function enviarFichaParaAEquipe(): Promise<ResultadoDaRevisao> {
  return enviarParaAEquipe(await acessoDoCliente());
}
