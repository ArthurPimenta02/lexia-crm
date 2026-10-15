"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { MetaAdsError } from "@/lib/meta/ads";
import { syncMetaCampanhas } from "@/lib/meta/sync";
import { createClient } from "@/lib/supabase/server";

/**
 * Botão "Atualizar" do painel de campanhas.
 *
 * O `cliente_slug` vem sempre do perfil no servidor, nunca do formulário:
 * aceitar o slug do navegador deixaria um utilizador puxar o gasto de outra
 * empresa.
 */

/**
 * Tempo mínimo entre duas chamadas à Meta. Não é zelo excessivo: o botão é
 * clicável à vontade e a Marketing API tem limite de pedidos por hora — ao
 * esgotá-lo, o painel pára de actualizar para todos, não só para quem clicou.
 * Dentro da janela só se recarrega o que já está gravado.
 */
const janelaMinimaMs = 60_000;

export type AtualizarCampanhasResultado = {
  mensagem: string;
  ok: boolean;
};

/**
 * Não declara parâmetros de propósito. `useActionState` passa o estado anterior
 * e o FormData, mas nada do formulário é usado — ver o comentário acima sobre o
 * `cliente_slug` — e uma função sem parâmetros continua a servir a assinatura.
 */
export async function atualizarCampanhasAction(): Promise<AtualizarCampanhasResultado> {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || !isClientRole(profile.role) || !profile.cliente_slug) {
    return { mensagem: "Sessão sem permissão para atualizar campanhas.", ok: false };
  }

  const clienteSlug = profile.cliente_slug;
  const supabase = await createClient();
  const { data: ultima } = await supabase
    .from("lexia_campanha_custos")
    .select("sincronizado_em")
    .eq("cliente_slug", clienteSlug)
    .order("sincronizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sincronizadoEm = ultima?.sincronizado_em
    ? new Date(ultima.sincronizado_em).getTime()
    : 0;

  if (sincronizadoEm && Date.now() - sincronizadoEm < janelaMinimaMs) {
    revalidatePath("/app/campanhas");

    return {
      mensagem: "Os dados foram puxados há menos de um minuto. Já estão atuais.",
      ok: true,
    };
  }

  try {
    const resultado = await syncMetaCampanhas({ clienteSlug });

    revalidatePath("/app/campanhas");

    return {
      mensagem: `Atualizado: ${resultado.linhas} dias de ${resultado.campanhas} campanhas.`,
      ok: true,
    };
  } catch (error) {
    if (error instanceof MetaAdsError) {
      // A mensagem da Meta é a única pista útil quando o token perde acesso.
      return { mensagem: error.message, ok: false };
    }

    console.error("Falha ao atualizar campanhas", { clienteSlug, error });

    return {
      mensagem: "Não foi possível atualizar agora. Tenta outra vez em instantes.",
      ok: false,
    };
  }
}
