"use server";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  gravarCustoDoServico,
  gravarCustoHoraDoExecutor,
  type GravarServicoResultado,
} from "@/lib/servicos/write";
import { createClient } from "@/lib/supabase/server";

/**
 * Gravações do painel de serviços no lado do admin.
 *
 * Aqui o slug vem do selector de cliente, logo do navegador — e por isso é
 * confirmado em duas etapas antes de servir para escrever: o perfil tem de ser
 * `lexia_admin` e o slug tem de existir em `lexia_clientes`.
 */

const caminho = "/admin/servicos";

const semPermissao: GravarServicoResultado = {
  mensagem: "Sessão sem permissão para editar serviços.",
  ok: false,
};

async function clienteAutorizado(formData: FormData) {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || profile.role !== "lexia_admin") {
    return null;
  }

  const clienteSlug = String(formData.get("cliente_slug") ?? "").trim();

  if (!clienteSlug) {
    return null;
  }

  const supabase = await createClient();
  const { data: cliente } = await supabase
    .from("lexia_clientes")
    .select("slug")
    .eq("slug", clienteSlug)
    .maybeSingle();

  if (!cliente) {
    return null;
  }

  return { clienteSlug: cliente.slug as string, userId: user.id };
}

export async function gravarServicoAdminAction(
  _anterior: GravarServicoResultado | null,
  formData: FormData,
): Promise<GravarServicoResultado> {
  const autorizado = await clienteAutorizado(formData);

  if (!autorizado) {
    return semPermissao;
  }

  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!servicoId) {
    return { mensagem: "Serviço não identificado.", ok: false };
  }

  return gravarCustoDoServico({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    custoProdutoBruto: String(formData.get("custo_produto") ?? ""),
    notasBruto: String(formData.get("notas") ?? ""),
    precoBruto: String(formData.get("preco") ?? ""),
    servicoId,
    userId: autorizado.userId,
  });
}

export async function gravarCustoHoraAdminAction(
  _anterior: GravarServicoResultado | null,
  formData: FormData,
): Promise<GravarServicoResultado> {
  const autorizado = await clienteAutorizado(formData);

  if (!autorizado) {
    return semPermissao;
  }

  const executor = String(formData.get("executor") ?? "").trim();

  if (!executor) {
    return { mensagem: "Executor não identificado.", ok: false };
  }

  return gravarCustoHoraDoExecutor({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    custoHoraBruto: String(formData.get("custo_hora") ?? ""),
    executor,
    userId: autorizado.userId,
  });
}
