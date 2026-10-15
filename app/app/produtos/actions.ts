"use server";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import {
  criarProduto,
  definirReceita,
  excluirProduto,
  registarAjuste,
  registarCompra,
  reporProduto,
  type GravarProdutoResultado,
} from "@/lib/produtos/write";

/**
 * Gravações da página de produtos do cliente.
 *
 * O `cliente_slug` vem sempre do perfil no servidor, nunca do formulário:
 * aceitar um slug do navegador deixaria um utilizador mexer no stock de outra
 * empresa.
 */

const caminho = "/app/produtos";

const semPermissao: GravarProdutoResultado = {
  mensagem: "Sessão sem permissão para editar produtos.",
  ok: false,
};

async function perfilDoCliente() {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || !isClientRole(profile.role) || !profile.cliente_slug) {
    return null;
  }

  // Só o administrador do cliente mexe no stock. Um operador vê a página mas
  // não a altera.
  if (profile.role !== "cliente_admin") {
    return null;
  }

  return { clienteSlug: profile.cliente_slug, userId: user.id };
}

export async function criarProdutoAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  return criarProduto({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    nomeBruto: String(formData.get("nome") ?? ""),
    notasBruto: String(formData.get("notas") ?? ""),
    unidadeBruta: String(formData.get("unidade") ?? ""),
    userId: perfil.userId,
  });
}

export async function registarCompraAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();

  if (!produtoId) {
    return { mensagem: "Produto não identificado.", ok: false };
  }

  return registarCompra({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    custoTotalBruto: String(formData.get("custo_total") ?? ""),
    produtoId,
    quantidadeBruta: String(formData.get("quantidade") ?? ""),
    userId: perfil.userId,
  });
}

export async function registarAjusteAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();

  if (!produtoId) {
    return { mensagem: "Produto não identificado.", ok: false };
  }

  return registarAjuste({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    direccao: String(formData.get("direccao") ?? ""),
    notaBruta: String(formData.get("nota") ?? ""),
    produtoId,
    quantidadeBruta: String(formData.get("quantidade") ?? ""),
    userId: perfil.userId,
  });
}

export async function excluirProdutoAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();

  if (!produtoId) {
    return { mensagem: "Produto não identificado.", ok: false };
  }

  return excluirProduto({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    produtoId,
    userId: perfil.userId,
  });
}

export async function reporProdutoAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();

  if (!produtoId) {
    return { mensagem: "Produto não identificado.", ok: false };
  }

  return reporProduto({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    produtoId,
    userId: perfil.userId,
  });
}

/**
 * Ligar um serviço a este produto, a partir da página de Produtos.
 *
 * É a mesma escrita que a receita faz do lado dos Serviços — a tabela é uma só.
 * O que muda é só por onde o dono entra: às vezes pensa "o que gasta este
 * champô", não "o que gasta esta lavagem".
 */
export async function definirReceitaDoProdutoAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();
  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!produtoId || !servicoId) {
    return { mensagem: "Produto ou serviço não identificado.", ok: false };
  }

  return definirReceita({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    produtoId,
    quantidadeBruta: String(formData.get("quantidade") ?? ""),
    servicoId,
    userId: perfil.userId,
  });
}
