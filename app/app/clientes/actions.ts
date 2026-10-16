"use server";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import {
  criarCliente,
  gravarNotasDoCliente,
  juntarClientes,
  separarClientes,
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
    clienteSlug: perfil.clienteSlug,
    // O dono só pode confirmar depois de o aviso lhe ter sido mostrado.
    confirmado: String(formData.get("confirmado") ?? "") === "sim",
    nomeBruto: String(formData.get("nome") ?? ""),
    notasBruto: String(formData.get("notas") ?? ""),
    telefoneBruto: String(formData.get("telefone") ?? ""),
    userId: perfil.userId,
  });
}

export async function gravarNotasAction(
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

  return gravarNotasDoCliente({
    caminhoParaRevalidar: caminho,
    clienteSlug: perfil.clienteSlug,
    contactoId,
    notasBruto: String(formData.get("notas") ?? ""),
    userId: perfil.userId,
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
