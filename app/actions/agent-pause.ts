"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import {
  clearEternalPause,
  clearManualPause,
  hasAgentLocksIntegration,
  isValidConversationId,
  setManualPause,
} from "@/lib/redis/agent-locks";
import {
  manualPauseDurations,
  type ManualPauseDuration,
} from "@/lib/redis/pause-durations";
import { createClient } from "@/lib/supabase/server";

export type AgentPauseActionResult = {
  error?: string;
  ok: boolean;
};

type PauseContext =
  | { clienteSlug: string; ok: true; role: string; userId: string }
  | { error: string; ok: false };

// O slug do cliente vem sempre do perfil autenticado. O parâmetro só é
// considerado para o admin Lexia, que precisa escolher o cliente.
async function getPauseContext(requestedSlug: string): Promise<PauseContext> {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || profile.status !== "ativo") {
    return { error: "Acesso não autorizado.", ok: false };
  }

  const clienteSlug =
    profile.role === "lexia_admin"
      ? requestedSlug
      : isClientRole(profile.role)
        ? profile.cliente_slug
        : null;

  if (!clienteSlug || !hasAgentLocksIntegration(clienteSlug)) {
    return { error: "Pausas não disponíveis para este cliente.", ok: false };
  }

  return { clienteSlug, ok: true, role: profile.role, userId: user.id };
}

async function conversationExists(
  clienteSlug: string,
  identificadorConversa: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_contactos")
    .select("id")
    .eq("cliente_slug", clienteSlug)
    .eq("identificador_conversa", identificadorConversa)
    .not("identificador_conversa", "like", "teste:%")
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data);
}

function revalidatePausePaths() {
  revalidatePath("/app/handoffs");
  revalidatePath("/app/conversas");
  revalidatePath("/admin/handoffs");
  revalidatePath("/admin/conversas");
}

export async function pauseAgentForConversation(
  requestedSlug: string,
  identificadorConversa: string,
  duration: string,
): Promise<AgentPauseActionResult> {
  const context = await getPauseContext(requestedSlug);

  if (!context.ok) {
    return { error: context.error, ok: false };
  }

  if (!manualPauseDurations.some((option) => option.value === duration)) {
    return { error: "Duração inválida.", ok: false };
  }

  if (
    !isValidConversationId(identificadorConversa) ||
    !(await conversationExists(context.clienteSlug, identificadorConversa))
  ) {
    return { error: "Conversa não encontrada.", ok: false };
  }

  const result = await setManualPause(
    context.clienteSlug,
    identificadorConversa,
    duration as ManualPauseDuration,
    { role: context.role, userId: context.userId },
  );

  if (result.ok) {
    revalidatePausePaths();
  }

  return result;
}

export type ResumableLockKind = "pausa_manual" | "pausa_eterna";

// Remove as travas que o painel pode apagar. A trava `status` (intervenção
// humana ou handoff) é só de leitura e expira sozinha.
export async function resumeAgentForConversation(
  requestedSlug: string,
  identificadorConversa: string,
  kinds: ResumableLockKind[],
): Promise<AgentPauseActionResult> {
  const context = await getPauseContext(requestedSlug);

  if (!context.ok) {
    return { error: context.error, ok: false };
  }

  const uniqueKinds = Array.from(new Set(kinds)).filter(
    (kind) => kind === "pausa_manual" || kind === "pausa_eterna",
  );

  if (uniqueKinds.length === 0) {
    return { error: "Nada para retomar nesta conversa.", ok: false };
  }

  for (const kind of uniqueKinds) {
    const result =
      kind === "pausa_manual"
        ? await clearManualPause(context.clienteSlug, identificadorConversa)
        : await clearEternalPause(context.clienteSlug, identificadorConversa);

    if (!result.ok) {
      return result;
    }
  }

  revalidatePausePaths();

  return { ok: true };
}
