import "server-only";

import { revalidatePath } from "next/cache";

import { MetaAdsError } from "@/lib/meta/ads";
import { syncMetaCampanhas } from "@/lib/meta/sync";
import { createClient } from "@/lib/supabase/server";

/**
 * Corpo do botão "Atualizar dados", partilhado pelas duas server actions
 * (a do cliente e a do admin). A autorização fica fora daqui de propósito:
 * cada action decide de quem pode ser o `clienteSlug` antes de chamar isto.
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

export async function atualizarCampanhasDoCliente({
  clienteSlug,
  caminhoParaRevalidar,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
}): Promise<AtualizarCampanhasResultado> {
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
    revalidatePath(caminhoParaRevalidar);

    return {
      mensagem: "Os dados foram puxados há menos de um minuto. Já estão atuais.",
      ok: true,
    };
  }

  try {
    const resultado = await syncMetaCampanhas({ clienteSlug });

    revalidatePath(caminhoParaRevalidar);

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
