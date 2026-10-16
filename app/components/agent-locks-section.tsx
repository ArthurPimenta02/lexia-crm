import Link from "next/link";

import { AgentLockBadges } from "@/app/components/agent-lock-badges";
import { AgentPauseControls } from "@/app/components/agent-pause-controls";
import { ChannelIcon, getChannelLabel } from "@/app/components/channel-brand";
import {
  HandoffEmptyState,
  HandoffSectionHeader,
  handoffCardClass,
  handoffGridClass,
} from "@/app/components/handoff-cards";
import { listAgentLocks, type AgentLock } from "@/lib/redis/agent-locks";
import { createClient } from "@/lib/supabase/server";

type LockContact = {
  canal: string | null;
  identificador_conversa: string;
  nome: string | null;
  telefone: string | null;
};

type ConversationLocks = {
  canal: string;
  identificadorConversa: string;
  locks: AgentLock[];
};

const contactChunkSize = 100;
const kindOrder: AgentLock["kind"][] = ["pausa_manual", "status", "pausa_eterna"];

function groupByConversation(locks: AgentLock[]) {
  const groups = new Map<string, ConversationLocks>();

  for (const lock of locks) {
    const current = groups.get(lock.identificadorConversa) ?? {
      canal: lock.canal,
      identificadorConversa: lock.identificadorConversa,
      locks: [],
    };

    current.locks.push(lock);
    groups.set(lock.identificadorConversa, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      locks: [...group.locks].sort(
        (a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind),
      ),
    }))
    .sort(
      (a, b) =>
        kindOrder.indexOf(a.locks[0].kind) - kindOrder.indexOf(b.locks[0].kind) ||
        a.identificadorConversa.localeCompare(b.identificadorConversa),
    );
}

async function loadContacts(clienteSlug: string, conversationIds: string[]) {
  const supabase = await createClient();
  const contacts = new Map<string, LockContact>();

  for (let index = 0; index < conversationIds.length; index += contactChunkSize) {
    const { data, error } = await supabase
      .from("lexia_contactos")
      .select("canal, identificador_conversa, nome, telefone")
      .eq("cliente_slug", clienteSlug)
      .in(
        "identificador_conversa",
        conversationIds.slice(index, index + contactChunkSize),
      );

    if (error) {
      console.error("Erro ao buscar contactos das pausas do agente", {
        clienteSlug,
        error,
      });
      continue;
    }

    for (const contact of (data ?? []) as LockContact[]) {
      contacts.set(contact.identificador_conversa, contact);
    }
  }

  return contacts;
}

function getConversationHref(
  conversationsPath: string,
  clienteSlug: string,
  includeClientParam: boolean,
  group: ConversationLocks,
) {
  const params = new URLSearchParams();

  if (includeClientParam) {
    params.set("cliente", clienteSlug);
  }

  // Sem `periodo`: a página das conversas abre a conversa pedida mesmo que
  // caia fora do filtro, e forçar "mes" aqui só apagava a escolha do dono —
  // continuando a deixar de fora um handoff com mais de 30 dias.
  params.set("canal", group.canal);
  params.set("conversa", group.identificadorConversa);

  return `${conversationsPath}?${params.toString()}`;
}

// O chamador é responsável por autorizar o acesso ao cliente antes de
// renderizar esta secção: ela lê o Redis com credenciais de servidor.
export async function AgentLocksSection({
  clienteSlug,
  conversationsPath,
  includeClientParam = false,
  title = "Agente pausado",
}: {
  clienteSlug: string;
  conversationsPath: string;
  includeClientParam?: boolean;
  title?: string;
}) {
  const { error, isConfigured, locks } = await listAgentLocks(clienteSlug);

  if (!isConfigured) {
    return null;
  }

  const groups = groupByConversation(locks);
  const contacts =
    groups.length > 0
      ? await loadContacts(
          clienteSlug,
          groups.map((group) => group.identificadorConversa),
        )
      : new Map<string, LockContact>();

  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <HandoffSectionHeader
        count={error ? undefined : groups.length}
        description="Conversas em que o agente não está a responder agora. Retome quando o atendimento humano terminar."
        title={title}
      />

      {error ? (
        <HandoffEmptyState>{error} Tente novamente em instantes.</HandoffEmptyState>
      ) : groups.length > 0 ? (
        <div className={handoffGridClass}>
          {groups.map((group) => {
            const contact = contacts.get(group.identificadorConversa);
            const canal = contact?.canal ?? group.canal;
            const name = contact?.nome || contact?.telefone || "Contacto sem nome";
            const canAct =
              Boolean(contact) ||
              group.locks.some((lock) => lock.kind !== "status");

            return (
              <article
                className={handoffCardClass}
                key={group.identificadorConversa}
              >
                <header className="flex items-center gap-3">
                  <ChannelIcon channel={canal} />
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-zinc-950">
                      {name}
                    </h3>
                    <p className="truncate text-sm text-zinc-500">
                      {contact?.telefone ?? group.identificadorConversa} ·{" "}
                      {getChannelLabel(canal)}
                    </p>
                  </div>
                </header>

                <AgentLockBadges locks={group.locks} />

                <div className="mt-auto flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  {canAct ? (
                    <AgentPauseControls
                      clienteSlug={clienteSlug}
                      contactLabel={contact?.nome ?? undefined}
                      fullWidth
                      hasEternalPause={group.locks.some(
                        (lock) => lock.kind === "pausa_eterna",
                      )}
                      hasManualPause={group.locks.some(
                        (lock) => lock.kind === "pausa_manual",
                      )}
                      identificadorConversa={group.identificadorConversa}
                    />
                  ) : (
                    <span className="text-xs text-zinc-500">
                      Volta sozinho quando o prazo terminar.
                    </span>
                  )}
                  {contact ? (
                    <Link
                      className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950 sm:h-9 sm:text-xs"
                      href={getConversationHref(
                        conversationsPath,
                        clienteSlug,
                        includeClientParam,
                        group,
                      )}
                    >
                      Abrir conversa
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <HandoffEmptyState>
          O agente está ativo em todas as conversas.
        </HandoffEmptyState>
      )}
    </section>
  );
}
