import "server-only";

import {
  AccessDeniedError,
  requireOperationalClientAccess,
  requireReadableClientAccess,
} from "@/lib/auth/access-context";
import { getDateRange } from "@/lib/dashboard/date-range";
import { getClientTimezone } from "@/lib/metrics/external-client-metrics";

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
  options: { mode?: "operation" | "read" } = {},
): Promise<AnalystScope> {
  let access;

  try {
    access =
      options.mode === "read"
        ? await requireReadableClientAccess(input.clienteSlug)
        : await requireOperationalClientAccess(input.clienteSlug);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      const status =
        error.status === 404 && !String(input.clienteSlug ?? "").trim()
          ? 400
          : error.status;
      throw new AnalystRequestError(error.message, status);
    }

    throw error;
  }

  const { client, clienteSlug, profile, user } = access;

  const timezone = getClientTimezone(clienteSlug);
  const range = getDateRange(
    String(input.periodo ?? "mes"),
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
