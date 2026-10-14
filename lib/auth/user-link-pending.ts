import "server-only";

import {
  requireAdministrativeClientAccess,
  requireLexiaAdmin,
} from "@/lib/auth/access-context";
import { getUserLinkRetryDecision } from "@/lib/auth/user-link-contracts";
import { createAdminClient } from "@/lib/supabase/admin";

export type PendingUserLink = {
  criado_em: string;
  erro_codigo: string | null;
  erro_resumo: string;
  id: string;
  role: "cliente_admin" | "cliente_operador";
  status_perfil: "ativo" | "inativo";
  user_id: string;
};

type PendingUserLinkInput = {
  clienteSlug: string;
  errorCode?: string | null;
  errorSummary: string;
  role: string;
  status: string;
  userId: string;
};

function limited(value: string | null | undefined, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function recordPendingUserLink(input: PendingUserLinkInput) {
  const { user } = await requireLexiaAdmin();
  await requireAdministrativeClientAccess(input.clienteSlug);
  const admin = createAdminClient();
  const payload = {
    cliente_slug: input.clienteSlug,
    criado_por: user.id,
    erro_codigo: limited(input.errorCode, 80) || null,
    erro_resumo:
      limited(input.errorSummary, 500) ||
      "Falha ao criar o vínculo do usuário com o cliente.",
    estado: "pendente",
    role: input.role,
    status_perfil: input.status,
    user_id: input.userId,
  };
  const { data: existing, error: lookupError } = await admin
    .from("lexia_user_link_pendencias")
    .select("id")
    .eq("user_id", input.userId)
    .eq("estado", "pendente")
    .maybeSingle();

  if (lookupError) {
    throw new Error("Não foi possível registrar a pendência de vínculo.");
  }

  const query = existing
    ? admin
        .from("lexia_user_link_pendencias")
        .update(payload)
        .eq("id", existing.id)
    : admin.from("lexia_user_link_pendencias").insert(payload);
  const { error } = await query;

  if (error) {
    throw new Error("Não foi possível registrar a pendência de vínculo.");
  }
}

export async function listPendingUserLinksAsAdmin(clienteSlug: string) {
  await requireAdministrativeClientAccess(clienteSlug);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lexia_user_link_pendencias")
    .select(
      "id, user_id, role, status_perfil, erro_codigo, erro_resumo, criado_em",
    )
    .eq("cliente_slug", clienteSlug)
    .eq("estado", "pendente")
    .order("criado_em", { ascending: false });

  if (error) {
    throw new Error("Não foi possível buscar pendências de vínculo.");
  }

  return (data ?? []) as PendingUserLink[];
}

export async function retryPendingUserLinkAsAdmin(
  clienteSlug: string,
  pendingId: string,
) {
  const { user } = await requireLexiaAdmin();
  await requireAdministrativeClientAccess(clienteSlug);
  const admin = createAdminClient();
  const { data: pending, error: pendingError } = await admin
    .from("lexia_user_link_pendencias")
    .select("id, user_id, cliente_slug, role, status_perfil, estado")
    .eq("id", pendingId)
    .eq("cliente_slug", clienteSlug)
    .eq("estado", "pendente")
    .maybeSingle();

  if (pendingError || !pending) {
    throw new Error("Pendência de vínculo não encontrada.");
  }

  const { data: profiles, error: profilesError } = await admin
    .from("lexia_usuarios_clientes")
    .select("cliente_slug, role, status")
    .eq("user_id", pending.user_id)
    .limit(2);

  if (profilesError) {
    throw new Error("Não foi possível validar o vínculo atual do usuário.");
  }

  const existingProfiles = profiles ?? [];
  const retryDecision = getUserLinkRetryDecision(existingProfiles, {
    cliente_slug: pending.cliente_slug,
    role: pending.role,
    status: pending.status_perfil,
  });

  if (retryDecision === "conflict") {
    throw new Error(
      "Este usuário já possui outro vínculo. A pendência foi preservada para revisão.",
    );
  }

  if (retryDecision === "create") {
    const { error: linkError } = await admin
      .from("lexia_usuarios_clientes")
      .insert({
        cliente_slug: pending.cliente_slug,
        role: pending.role,
        status: pending.status_perfil,
        user_id: pending.user_id,
      });

    if (linkError) {
      throw new Error(
        "O vínculo ainda não pôde ser criado. A pendência foi mantida.",
      );
    }
  }

  const { error: resolveError } = await admin
    .from("lexia_user_link_pendencias")
    .update({
      estado: "resolvida",
      resolvido_em: new Date().toISOString(),
      resolvido_por: user.id,
    })
    .eq("id", pending.id)
    .eq("estado", "pendente");

  if (resolveError) {
    throw new Error(
      "O vínculo foi criado, mas a pendência ainda precisa de revisão manual.",
    );
  }
}
