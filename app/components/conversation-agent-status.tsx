import {
  AgentActiveBadge,
  AgentLockBadges,
} from "@/app/components/agent-lock-badges";
import { AgentPauseControls } from "@/app/components/agent-pause-controls";
import {
  getConversationLocks,
  hasAgentLocksIntegration,
} from "@/lib/redis/agent-locks";

// Linha compacta do cabeçalho da conversa. Deve ser renderizada dentro de
// <Suspense> para que lentidão ou falha do Redis nunca bloqueie o histórico.
export async function ConversationAgentStatus({
  clienteSlug,
  contactLabel,
  identificadorConversa,
}: {
  clienteSlug: string;
  contactLabel?: string;
  identificadorConversa: string;
}) {
  if (!hasAgentLocksIntegration(clienteSlug)) {
    return null;
  }

  const { error, isConfigured, locks } = await getConversationLocks(
    clienteSlug,
    identificadorConversa,
  );

  if (!isConfigured) {
    return null;
  }

  if (error) {
    return (
      <p className="text-xs text-zinc-500">Estado do agente indisponível.</p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      {locks.length > 0 ? (
        <AgentLockBadges align="end" locks={locks} />
      ) : (
        <AgentActiveBadge />
      )}
      <AgentPauseControls
        clienteSlug={clienteSlug}
        contactLabel={contactLabel}
        hasEternalPause={locks.some((lock) => lock.kind === "pausa_eterna")}
        hasManualPause={locks.some((lock) => lock.kind === "pausa_manual")}
        identificadorConversa={identificadorConversa}
      />
    </div>
  );
}
