"use server";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  atualizarCampanhasDoCliente,
  type AtualizarCampanhasResultado,
} from "@/lib/campaigns/refresh";
import { createClient } from "@/lib/supabase/server";

/**
 * Botão "Atualizar" do painel de campanhas do administrador.
 *
 * Aqui o `cliente_slug` tem de vir do formulário — é o próprio selector de
 * cliente — mas só depois de duas verificações: que quem chama é
 * `lexia_admin`, e que o slug existe mesmo em `lexia_clientes`. Sem a segunda,
 * um slug inventado no formulário iria direito à procura de variáveis de
 * ambiente com esse nome.
 */
export async function atualizarCampanhasAdminAction(
  _anterior: AtualizarCampanhasResultado | null,
  formData: FormData,
): Promise<AtualizarCampanhasResultado> {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || profile.role !== "lexia_admin") {
    return {
      mensagem: "Sessão sem permissão para atualizar campanhas.",
      ok: false,
    };
  }

  const clienteSlug = String(formData.get("cliente_slug") ?? "").trim();

  if (!clienteSlug) {
    return { mensagem: "Escolhe um cliente primeiro.", ok: false };
  }

  const supabase = await createClient();
  const { data: cliente } = await supabase
    .from("lexia_clientes")
    .select("slug")
    .eq("slug", clienteSlug)
    .maybeSingle();

  if (!cliente) {
    return { mensagem: "Cliente desconhecido.", ok: false };
  }

  return atualizarCampanhasDoCliente({
    caminhoParaRevalidar: "/admin/campanhas",
    clienteSlug,
  });
}
