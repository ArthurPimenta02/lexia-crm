"use server";

import { traduzirResultado } from "@/lib/catalogo/traduzir-resultado";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
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

/**
 * Gravações do painel de serviços do cliente.
 *
 * O `cliente_slug` vem sempre do perfil no servidor, nunca do formulário.
 * Estas acções escrevem na base de dados do cliente — aceitar um slug do
 * navegador deixaria um utilizador mudar os preços de outra empresa.
 */

const caminho = "/app/servicos";

const semPermissao: GravarServicoResultado = {
  mensagem: "Sessão sem permissão para editar serviços.",
  ok: false,
};

async function perfilDoCliente() {
  const { profile, user } = await getLoggedInUserProfile();

  if (
    !user ||
    !profile ||
    !isClientRole(profile.role) ||
    !profile.cliente_slug
  ) {
    return null;
  }

  // Só o administrador do cliente mexe em preços e custos. Um operador vê o
  // painel mas não o altera.
  if (profile.role !== "cliente_admin") {
    return null;
  }

  return { clienteSlug: profile.cliente_slug, userId: user.id };
}

export async function gravarServicoAction(
  _anterior: GravarServicoResultado | null,
  formData: FormData,
): Promise<GravarServicoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return traduzirResultado(semPermissao);
  }

  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!servicoId) {
    return traduzirResultado({ mensagem: "Serviço não identificado.", ok: false });
  }

  return traduzirResultado(
    await gravarPrecoENotas({
      caminhoParaRevalidar: caminho,
      clienteSlug: perfil.clienteSlug,
      notasBruto: String(formData.get("notas") ?? ""),
      precoBruto: String(formData.get("preco") ?? ""),
      servicoId,
      userId: perfil.userId,
    }),
  );
}

export async function definirReceitaAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return traduzirResultado(semPermissao);
  }

  const produtoId = String(formData.get("produto_id") ?? "").trim();
  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!produtoId || !servicoId) {
    return traduzirResultado({ mensagem: "Produto ou serviço não identificado.", ok: false });
  }

  return traduzirResultado(
    await definirReceita({
      caminhoParaRevalidar: caminho,
      clienteSlug: perfil.clienteSlug,
      produtoId,
      quantidadeBruta: String(formData.get("quantidade") ?? ""),
      servicoId,
      userId: perfil.userId,
    }),
  );
}

export async function registarExecucaoAction(
  _anterior: GravarProdutoResultado | null,
  formData: FormData,
): Promise<GravarProdutoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return traduzirResultado(semPermissao);
  }

  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!servicoId) {
    return traduzirResultado({ mensagem: "Serviço não identificado.", ok: false });
  }

  return traduzirResultado(
    await registarExecucao({
      caminhoParaRevalidar: caminho,
      clienteSlug: perfil.clienteSlug,
      servicoId,
      userId: perfil.userId,
    }),
  );
}

export async function excluirServicoAction(
  _anterior: GravarServicoResultado | null,
  formData: FormData,
): Promise<GravarServicoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return traduzirResultado(semPermissao);
  }

  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!servicoId) {
    return traduzirResultado({ mensagem: "Serviço não identificado.", ok: false });
  }

  return traduzirResultado(
    await excluirServico({
      caminhoParaRevalidar: caminho,
      clienteSlug: perfil.clienteSlug,
      servicoId,
    }),
  );
}

export async function reporServicoAction(
  _anterior: GravarServicoResultado | null,
  formData: FormData,
): Promise<GravarServicoResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return traduzirResultado(semPermissao);
  }

  const servicoId = String(formData.get("servico_id") ?? "").trim();

  if (!servicoId) {
    return traduzirResultado({ mensagem: "Serviço não identificado.", ok: false });
  }

  return traduzirResultado(
    await reporServico({
      caminhoParaRevalidar: caminho,
      clienteSlug: perfil.clienteSlug,
      servicoId,
    }),
  );
}
