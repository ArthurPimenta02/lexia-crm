import "server-only";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getDateRange } from "@/lib/dashboard/date-range";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  analystChannels,
  type AnalystChannel,
  type AnalystScope,
  type AnalystScopeInput,
} from "./types";

export class AnalystRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function normalizeChannel(value: string | undefined): AnalystChannel {
  return analystChannels.includes(value as AnalystChannel)
    ? (value as AnalystChannel)
    : "todos";
}

export async function resolveAnalystScope(
  input: AnalystScopeInput,
): Promise<AnalystScope> {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile) {
    throw new AnalystRequestError("Faça login novamente para continuar.", 401);
  }

  if (profile.status !== "ativo") {
    throw new AnalystRequestError("Este acesso não está ativo.", 403);
  }

  let clienteSlug = "";

  if (profile.role === "lexia_admin") {
    clienteSlug = String(input.clienteSlug ?? "").trim();

    if (!clienteSlug) {
      throw new AnalystRequestError("Selecione um cliente para consultar.", 400);
    }
  } else if (isClientRole(profile.role) && profile.cliente_slug) {
    clienteSlug = profile.cliente_slug;
  }

  if (!clienteSlug) {
    throw new AnalystRequestError("Cliente não encontrado para este acesso.", 403);
  }

  const admin = createAdminClient();
  const { data: client, error } = await admin
    .from("lexia_clientes")
    .select("nome, slug, status")
    .eq("slug", clienteSlug)
    .maybeSingle();

  if (error || !client) {
    throw new AnalystRequestError("Cliente não encontrado.", 404);
  }

  if (client.status !== "ativo") {
    throw new AnalystRequestError("Este cliente não está ativo.", 403);
  }

  const timezone = getClientTimezone(clienteSlug);
  const range = getDateRange(
    String(input.periodo ?? "hoje"),
    String(input.inicio ?? ""),
    String(input.fim ?? ""),
    timezone,
  );

  if (range.end.getTime() - range.start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new AnalystRequestError(
      "Escolha um período de no máximo 366 dias.",
      400,
    );
  }

  return {
    channel: normalizeChannel(input.canal),
    clienteName: client.nome || client.slug,
    clienteSlug,
    range,
    role: profile.role,
    timezone,
    userId: user.id,
  };
}
