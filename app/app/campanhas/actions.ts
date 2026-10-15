"use server";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import {
  atualizarCampanhasDoCliente,
  type AtualizarCampanhasResultado,
} from "@/lib/campaigns/refresh";

/**
 * Botão "Atualizar" do painel de campanhas do cliente.
 *
 * O `cliente_slug` vem sempre do perfil no servidor, nunca do formulário:
 * aceitar o slug do navegador deixaria um utilizador puxar o gasto de outra
 * empresa.
 */

/**
 * Não declara parâmetros de propósito. `useActionState` passa o estado anterior
 * e o FormData, mas nada do formulário é usado — ver o comentário acima sobre o
 * `cliente_slug` — e uma função sem parâmetros continua a servir a assinatura.
 */
export async function atualizarCampanhasAction(): Promise<AtualizarCampanhasResultado> {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || !isClientRole(profile.role) || !profile.cliente_slug) {
    return {
      mensagem: "Sessão sem permissão para atualizar campanhas.",
      ok: false,
    };
  }

  return atualizarCampanhasDoCliente({
    caminhoParaRevalidar: "/app/campanhas",
    clienteSlug: profile.cliente_slug,
  });
}
