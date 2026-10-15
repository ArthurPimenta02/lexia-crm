"use server";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  definirReceita,
  registarExecucao,
  type GravarProdutoResultado,
} from "@/lib/produtos/write";
import {
  excluirServico,
  gravarPrecoENotas,
  reporServico,
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

  return gravarPrecoENotas({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    notasBruto: String(formData.get("notas") ?? ""),
    precoBruto: String(formData.get("preco") ?? ""),
    servicoId,
    userId: autorizado.userId,
  });
}

export async function definirReceitaAdminAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const autorizado = await clienteAutorizado(formData);

  if (!autorizado) {
    return semPermissao;
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();
  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!produtoId || !servicoId) {
    return { mensagem: "Produto ou serviço não identificado.", ok: false };
  }

  return definirReceita({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    produtoId,
    quantidadeBruta: String(formData.get("quantidade") ?? ""),
    servicoId,
    userId: autorizado.userId,
  });
}

export async function registarExecucaoAdminAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const autorizado = await clienteAutorizado(formData);

  if (!autorizado) {
    return semPermissao;
  }

  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!servicoId) {
    return { mensagem: "Serviço não identificado.", ok: false };
  }

  return registarExecucao({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    servicoId,
    userId: autorizado.userId,
  });
}

export async function excluirServicoAdminAction(
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

  return excluirServico({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    servicoId,
  });
}

export async function reporServicoAdminAction(
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

  return reporServico({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    servicoId,
  });
}
