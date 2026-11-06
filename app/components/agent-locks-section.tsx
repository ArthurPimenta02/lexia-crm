import Link from "next/link";

import { AgentLockBadges } from "@/app/components/agent-lock-badges";
import { AgentPauseControls } from "@/app/components/agent-pause-controls";
import { getChannelLabel } from "@/app/components/channel-brand";
import {
  HandoffEmptyState,
  HandoffSectionHeader,
  handoffListClass,
} from "@/app/components/handoff-cards";
import { nomeParaAvatar } from "@/app/components/conversation-workspace";
import { AvatarCanal } from "@/app/components/tela";
import { getT } from "@/lib/i18n/servidor";
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
const kindOrder: AgentLock["kind"][] = [
  "pausa_manual",
  "status",
  "pausa_eterna",
];

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
        kindOrder.indexOf(a.locks[0].kind) -
          kindOrder.indexOf(b.locks[0].kind) ||
        a.identificadorConversa.localeCompare(b.identificadorConversa),
    );
}

async function loadContacts(clienteSlug: string, conversationIds: string[]) {
  const supabase = await createClient();
  const contacts = new Map<string, LockContact>();

  for (
    let index = 0;
    index < conversationIds.length;
    index += contactChunkSize
  ) {
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
  sufixo,
}: {
  clienteSlug: string;
  conversationsPath: string;
  includeClientParam?: boolean;
  /** No admin, qual dos clientes é esta secção. No painel do cliente não há. */
  sufixo?: string;
}) {
  const { error, isConfigured, locks } = await listAgentLocks(clienteSlug);
  const t = await getT();

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
        dica={t(
          "Conversas em que o agente não está respondendo agora. Retome quando o atendimento humano terminar.",
        )}
        sufixo={sufixo}
        title={t("Agente pausado")}
      />

      {error ? (
        <HandoffEmptyState>
          {t(error)} {t("Tente novamente em instantes.")}
        </HandoffEmptyState>
      ) : groups.length > 0 ? (
        <div className={handoffListClass}>
          {groups.map((group) => {
            const contact = contacts.get(group.identificadorConversa);
            const canal = contact?.canal ?? group.canal;
            const name =
              contact?.nome || contact?.telefone || t("Contato sem nome");
            const canAct =
              Boolean(contact) ||
              group.locks.some((lock) => lock.kind !== "status");

            return (
              <div
                className="tela-linha flex-wrap items-start sm:flex-nowrap sm:items-center"
                key={group.identificadorConversa}
              >
                <AvatarCanal
                  canal={canal}
                  nome={contact?.nome || contact?.telefone ? nomeParaAvatar(name) : "?"}
                  tamanho={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {name}
                  </p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-xs text-muted-foreground">
                      {t(getChannelLabel(canal))}
                      {contact?.telefone && contact.nome ? ` · ${contact.telefone}` : ""}
                    </span>
                    <AgentLockBadges locks={group.locks} />
                  </div>
                </div>

                <div className="flex w-full shrink-0 items-center gap-2 pl-[3.25rem] sm:w-auto sm:pl-0">
                  {canAct ? (
                    <AgentPauseControls
                      clienteSlug={clienteSlug}
                      contactLabel={contact?.nome ?? undefined}
                      hasEternalPause={group.locks.some(
                        (lock) => lock.kind === "pausa_eterna",
                      )}
                      hasManualPause={group.locks.some(
                        (lock) => lock.kind === "pausa_manual",
                      )}
                      identificadorConversa={group.identificadorConversa}
                      retomarDiscreto
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("Volta sozinho quando o prazo terminar.")}
                    </span>
                  )}
                  {contact ? (
                    <Link
                      className="ds-botao ds-botao-fantasma ds-botao-p"
                      href={getConversationHref(
                        conversationsPath,
                        clienteSlug,
                        includeClientParam,
                        group,
                      )}
                    >
                      {t("Abrir conversa")}
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <HandoffEmptyState>
          {t("O agente está ativo em todas as conversas.")}
        </HandoffEmptyState>
      )}
    </section>
  );
}
