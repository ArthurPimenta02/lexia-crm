"use server";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  criarProduto,
  registarAjuste,
  registarCompra,
  type GravarProdutoResultado,
} from "@/lib/produtos/write";
import { createClient } from "@/lib/supabase/server";

/**
 * Gravações da página de produtos no lado do admin.
 *
 * Aqui o slug vem do selector de cliente, logo do navegador — e por isso é
 * confirmado em duas etapas antes de servir para escrever: o perfil tem de ser
 * `lexia_admin` e o slug tem de existir em `lexia_clientes`.
 */

const caminho = "/admin/produtos";

const semPermissao: GravarProdutoResultado = {
  mensagem: "Sessão sem permissão para editar produtos.",
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

export async function criarProdutoAdminAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const autorizado = await clienteAutorizado(formData);

  if (!autorizado) {
    return semPermissao;
  }

  return criarProduto({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    nomeBruto: String(formData.get("nome") ?? ""),
    notasBruto: String(formData.get("notas") ?? ""),
    unidadeBruta: String(formData.get("unidade") ?? ""),
    userId: autorizado.userId,
  });
}

export async function registarCompraAdminAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const autorizado = await clienteAutorizado(formData);

  if (!autorizado) {
    return semPermissao;
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();

  if (!produtoId) {
    return { mensagem: "Produto não identificado.", ok: false };
  }

  return registarCompra({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    custoTotalBruto: String(formData.get("custo_total") ?? ""),
    produtoId,
    quantidadeBruta: String(formData.get("quantidade") ?? ""),
    userId: autorizado.userId,
  });
}

export async function registarAjusteAdminAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const autorizado = await clienteAutorizado(formData);

  if (!autorizado) {
    return semPermissao;
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();

  if (!produtoId) {
    return { mensagem: "Produto não identificado.", ok: false };
  }

  return registarAjuste({
    caminhoParaRevalidar: caminho,
    clienteSlug: autorizado.clienteSlug,
    direccao: String(formData.get("direccao") ?? ""),
    notaBruta: String(formData.get("nota") ?? ""),
    produtoId,
    quantidadeBruta: String(formData.get("quantidade") ?? ""),
    userId: autorizado.userId,
  });
}
