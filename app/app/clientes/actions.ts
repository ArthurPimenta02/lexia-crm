"use server";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import type { CamposDoServico } from "@/lib/clientes/marcacao";
import {
  criarCliente,
  gravarFichaDoCliente,
  juntarClientes,
  registarServicoDeCliente,
  separarClientes,
  type CamposDaFicha,
  type GravarClienteResultado,
} from "@/lib/clientes/write";

/**
 * Gravações da ficha de clientes.
 *
 * O `cliente_slug` vem sempre do perfil no servidor, nunca do formulário:
 * aceitar um slug do navegador deixava um utilizador abrir e editar a lista de
 * clientes de outra empresa.
 */

const caminho = "/app/clientes";

const semPermissao: GravarClienteResultado = {
  mensagem: "Sessão sem permissão para editar clientes.",
  ok: false,
};

/**
 * Os campos da ficha, lidos do formulário.
 *
 * Um só sítio a ler os nomes dos campos: criar e editar partilham o mesmo
 * formulário, e um nome trocado num dos lados gravava silenciosamente vazio.
 */
function camposDaFicha(formData: FormData): CamposDaFicha {
  return {
    emailBruto: String(formData.get("email") ?? ""),
    idadeBruto: String(formData.get("idade") ?? ""),
    moradaBruto: String(formData.get("morada") ?? ""),
    notasBruto: String(formData.get("notas") ?? ""),
    origemManualBruto: String(formData.get("origem_manual") ?? ""),
    origemManualNotaBruto: String(formData.get("origem_manual_nota") ?? ""),
    viaturaBruto: String(formData.get("viatura") ?? ""),
  };
}

/**
 * O serviço já feito, lido do formulário.
 *
 * Os mesmos nomes de campo no formulário de criar e no da ficha, pela mesma
 * razão que em `camposDaFicha`: um nome trocado num dos lados gravava vazio
 * sem dizer nada.
 *
 * Vai para `marcacoes`, na base do próprio cliente, e não para a ficha: é uma
 * venda, e as vendas já são o que alimenta o histórico e o total gasto.
 */
function camposDoServico(formData: FormData): CamposDoServico {
  return {
    dataBruto: String(formData.get("servico_data") ?? ""),
    executorBruto: String(formData.get("servico_executor") ?? ""),
    servicoIdBruto: String(formData.get("servico_id") ?? ""),
    valorBruto: String(formData.get("servico_valor") ?? ""),
  };
}

async function perfilDoCliente() {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || !isClientRole(profile.role) || !profile.cliente_slug) {
    return null;
  }

  if (profile.role !== "cliente_admin") {
    return null;
  }

  return { clienteSlug: profile.cliente_slug, userId: user.id };
}

export async function criarClienteAction(
  _anterior: GravarClienteResultado | null,
  formData: FormData,
): Promise<GravarClienteResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  return criarCliente({
    caminhoParaRevalidar: caminho,
    campos: camposDaFicha(formData),
    clienteSlug: perfil.clienteSlug,
    // O dono só pode confirmar depois de o aviso lhe ter sido mostrado.
    confirmado: String(formData.get("confirmado") ?? "") === "sim",
    indicativoBruto: String(formData.get("indicativo") ?? ""),
    nomeBruto: String(formData.get("nome") ?? ""),
    servico: camposDoServico(formData),
    telefoneBruto: String(formData.get("telefone") ?? ""),
    userId: perfil.userId,
  });
}

export async function gravarFichaAction(
  _anterior: GravarClienteResultado | null,
  formData: FormData,
): Promise<GravarClienteResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const contactoId = String(formData.get("contacto_id") ?? "").trim();

  if (!contactoId) {
    return { mensagem: "Cliente não identificado.", ok: false };
  }

  return gravarFichaDoCliente({
    caminhoParaRevalidar: caminho,
    campos: camposDaFicha(formData),
    clienteSlug: perfil.clienteSlug,
    contactoId,
    userId: perfil.userId,
  });
}

/**
 * Regista um serviço já feito num cliente que já está no painel.
 *
 * Separada do `gravarFichaAction` de propósito. São duas bases de dados
 * diferentes e dois actos diferentes: corrigir o email não é vender. Juntar
 * as duas coisas num botão só punha o dono a registar uma venda de cada vez
 * que arranjasse uma morada.
 */
export async function registarServicoAction(
  _anterior: GravarClienteResultado | null,
  formData: FormData,
): Promise<GravarClienteResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const contactoId = String(formData.get("contacto_id") ?? "").trim();

  if (!contactoId) {
    return { mensagem: "Cliente não identificado.", ok: false };
  }

  return registarServicoDeCliente({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    // Só depois de o aviso dos serviços que já lá estão ter sido mostrado.
    confirmado: String(formData.get("confirmado") ?? "") === "sim",
    contactoId,
    servico: camposDoServico(formData),
  });
}

export async function juntarClientesAction(
  _anterior: GravarClienteResultado | null,
  formData: FormData,
): Promise<GravarClienteResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const principalId = String(formData.get("principal_id") ?? "").trim();
  const duplicadoId = String(formData.get("duplicado_id") ?? "").trim();

  if (!principalId || !duplicadoId) {
    return { mensagem: "Escolhe o contacto a juntar.", ok: false };
  }

  return juntarClientes({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    duplicadoId,
    principalId,
    userId: perfil.userId,
  });
}

export async function separarClientesAction(
  _anterior: GravarClienteResultado | null,
  formData: FormData,
): Promise<GravarClienteResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return semPermissao;
  }

  const duplicadoId = String(formData.get("duplicado_id") ?? "").trim();

  if (!duplicadoId) {
    return { mensagem: "Contacto não identificado.", ok: false };
  }

  return separarClientes({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    duplicadoId,
    userId: perfil.userId,
  });
}
