import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import {
  getLoggedInUserProfile,
  isClientRole,
  type LexiaUserProfile,
} from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export class AccessDeniedError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 404 = 403,
  ) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export type ActiveProfileContext = {
  profile: LexiaUserProfile;
  user: User;
};

export type AuthorizedClient = {
  id: string;
  nome: string;
  slug: string;
  status: "ativo" | "inativo" | "suspenso";
};

export type AuthorizedClientContext = ActiveProfileContext & {
  client: AuthorizedClient;
  clienteSlug: string;
};

const getClientBySlug = cache(async (clienteSlug: string) => {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lexia_clientes")
    .select("id, nome, slug, status")
    .eq("slug", clienteSlug)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível validar o cliente deste acesso.");
  }

  return (data as AuthorizedClient | null) ?? null;
});

export async function requireActiveProfile(): Promise<ActiveProfileContext> {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile) {
    throw new AccessDeniedError("Faça login novamente para continuar.", 401);
  }

  if (profile.status !== "ativo") {
    throw new AccessDeniedError("Este acesso não está ativo.");
  }

  return { profile, user };
}

export async function requireLexiaAdmin(): Promise<ActiveProfileContext> {
  const context = await requireActiveProfile();

  if (
    context.profile.role !== "lexia_admin" ||
    context.profile.cliente_slug !== null
  ) {
    throw new AccessDeniedError("Acesso restrito à administração da Lexia.");
  }

  return context;
}

async function requireKnownClient(clienteSlug: string) {
  const normalizedSlug = clienteSlug.trim();

  if (!normalizedSlug) {
    throw new AccessDeniedError("Cliente não informado.", 404);
  }

  const client = await getClientBySlug(normalizedSlug);

  if (!client) {
    throw new AccessDeniedError("Cliente não encontrado.", 404);
  }

  return client;
}

export async function requireClientPanelAccess(): Promise<AuthorizedClientContext> {
  const context = await requireActiveProfile();
  const { profile } = context;

  if (!isClientRole(profile.role) || !profile.cliente_slug) {
    throw new AccessDeniedError("Acesso restrito ao painel do cliente.");
  }

  const client = await requireKnownClient(profile.cliente_slug);

  if (client.status !== "ativo") {
    throw new AccessDeniedError("Esta empresa não está ativa.");
  }

  return {
    ...context,
    client,
    clienteSlug: client.slug,
  };
}

export async function requireAdministrativeClientAccess(
  clienteSlug: string,
  options: { requireActiveClient?: boolean } = {},
): Promise<AuthorizedClientContext> {
  const context = await requireLexiaAdmin();
  const client = await requireKnownClient(clienteSlug);

  if (options.requireActiveClient && client.status !== "ativo") {
    throw new AccessDeniedError("Esta empresa não está ativa.");
  }

  return {
    ...context,
    client,
    clienteSlug: client.slug,
  };
}

export async function requireOperationalClientAccess(
  requestedSlug?: string,
): Promise<AuthorizedClientContext> {
  const context = await requireActiveProfile();
  const { profile } = context;
  const clienteSlug =
    profile.role === "lexia_admin"
      ? String(requestedSlug ?? "").trim()
      : isClientRole(profile.role)
        ? profile.cliente_slug
        : null;

  if (!clienteSlug) {
    throw new AccessDeniedError("Cliente não encontrado para este acesso.");
  }

  if (
    profile.role !== "lexia_admin" &&
    (!isClientRole(profile.role) || profile.cliente_slug !== clienteSlug)
  ) {
    throw new AccessDeniedError("Este usuário não pode acessar esse cliente.");
  }

  const client = await requireKnownClient(clienteSlug);

  if (client.status !== "ativo") {
    throw new AccessDeniedError("Esta empresa não está ativa.");
  }

  return {
    ...context,
    client,
    clienteSlug: client.slug,
  };
}

export async function requireReadableClientAccess(
  requestedSlug?: string,
): Promise<AuthorizedClientContext> {
  const context = await requireActiveProfile();

  if (context.profile.role === "lexia_admin") {
    return requireAdministrativeClientAccess(String(requestedSlug ?? ""));
  }

  return requireClientPanelAccess();
}

// Contenção continua disponível ao admin mesmo com a empresa inativa. Para
// usuários do cliente, a empresa precisa continuar ativa.
export async function requireContainmentClientAccess(
  requestedSlug?: string,
): Promise<AuthorizedClientContext> {
  const context = await requireActiveProfile();
  const { profile } = context;

  if (profile.role === "lexia_admin") {
    return requireAdministrativeClientAccess(String(requestedSlug ?? ""));
  }

  return requireClientPanelAccess();
}

export function getAccessErrorMessage(error: unknown) {
  return error instanceof AccessDeniedError
    ? error.message
    : "Não foi possível validar este acesso.";
}
