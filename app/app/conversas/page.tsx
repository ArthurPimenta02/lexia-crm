import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment, Suspense } from "react";

import { saveClientConversationFeedback } from "@/app/app/conversas/actions";
import {
  ChannelBadge,
  ChannelIcon,
  getChannelLabel,
} from "@/app/components/channel-brand";
import { ConversationAgentStatus } from "@/app/components/conversation-agent-status";
import { ConversationFeedbackAction } from "@/app/components/conversation-feedback-action";
import { ConversationFilterBar } from "@/app/components/conversation-filter-bar";
import {
  ConversationDaySeparator,
  ConversationMessageBubble,
} from "@/app/components/conversation-message-bubble";
import {
  appendConversationPeriodParams,
  type ConversationPeriodState,
  getConversationPeriodState,
} from "@/app/components/conversation-period-filter";
import { ScrollToBottomPanel } from "@/app/components/scroll-to-bottom-panel";
import {
  formatDateInTimezone,
  getSelectedTimezone,
} from "@/lib/clientes/timezone";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getSearchValue } from "@/lib/dashboard/date-range";
import { getConversationDateRange } from "@/lib/conversations/date-range";
import { resolveConversationSelection } from "@/lib/conversations/select-conversation";
import {
  getConversationDayKey,
  getConversationMessagePreview,
  isSentConversationMessage,
  prepareConversationMessages,
  type ConversationMessageRecord,
  type DisplayConversationMessage,
} from "@/lib/conversations/message-display";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { assinarMidias } from "@/lib/conversations/media-urls";
import { createClient } from "@/lib/supabase/server";

type ConversationsPageProps = {
  searchParams: Promise<{
    busca?: string | string[];
    canal?: string | string[];
    conversa?: string | string[];
    fim?: string | string[];
    fuso?: string | string[];
    inicio?: string | string[];
    periodo?: string | string[];
  }>;
};

type Contact = {
  id: string;
  cliente_slug: string;
  canal: string | null;
  identificador_conversa: string;
  nome: string | null;
  telefone: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
};

type Message = ConversationMessageRecord;

type ConversationSummary = {
  lastActivityAt: string | null;
  lastMessage: DisplayConversationMessage | null;
  messageCount: number;
};

const allowedChannels = ["whatsapp", "messenger", "instagram"];

function buildSummaries(messages: Message[]) {
  const summaries = new Map<string, ConversationSummary>();

  for (const message of prepareConversationMessages(messages)) {
    const current = summaries.get(message.identificador_conversa) ?? {
      lastActivityAt: null,
      lastMessage: null,
      messageCount: 0,
    };

    summaries.set(message.identificador_conversa, {
      lastActivityAt: message.criado_em ?? current.lastActivityAt,
      lastMessage: message,
      messageCount: current.messageCount + 1,
    });
  }

  return summaries;
}

function getContactLastActivity(
  contact: Contact,
  summaries: Map<string, ConversationSummary>,
) {
  return (
    summaries.get(contact.identificador_conversa)?.lastActivityAt ??
    contact.atualizado_em ??
    contact.criado_em
  );
}

function getDateTimeValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function getFilterHref(
  channel: string,
  timezone: string,
  period: ConversationPeriodState,
  searchQuery: string,
) {
  const params = new URLSearchParams();

  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  if (searchQuery) {
    params.set("busca", searchQuery);
  }

  return `/app/conversas?${params.toString()}`;
}

function getConversationHref(
  conversationId: string,
  channel: string,
  timezone: string,
  period: ConversationPeriodState,
  searchQuery: string,
) {
  const params = new URLSearchParams();

  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  if (searchQuery) {
    params.set("busca", searchQuery);
  }

  params.set("conversa", conversationId);

  return `/app/conversas?${params.toString()}`;
}

function getConversationCountText(count: number, searchQuery: string) {
  const label = searchQuery ? "resultado" : "conversa";

  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function normalizeConversationSearch(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export default async function ClientConversationsPage({
  searchParams,
}: ConversationsPageProps) {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/conversas");

  if (!profile.cliente_slug || profile.status !== "ativo") {
    return (
      <section className="flex w-full min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Conversas</h1>
          <p className="mt-2 text-muted-foreground">
            Não foi possível encontrar um vínculo ativo com um cliente.
          </p>
        </div>
      </section>
    );
  }

  const params = await searchParams;
  const searchQuery = getSearchValue(params.busca).trim().slice(0, 80);
  const normalizedSearch = normalizeConversationSearch(searchQuery);
  const requestedChannel = getSearchValue(params.canal);
  const selectedChannel = allowedChannels.includes(requestedChannel)
    ? requestedChannel
    : "";
  // Sem `?fuso=` na barra, as horas aparecem no fuso do cliente e não no do
  // Brasil. Um atendimento das 09:45 em Boston aparecia como 13:45.
  const selectedTimezone = getSelectedTimezone(
    params.fuso,
    profile.cliente_slug,
  );
  const selectedPeriod = getSearchValue(params.periodo) || "hoje";
  const customStart = getSearchValue(params.inicio);
  const customEnd = getSearchValue(params.fim);
  const range = getConversationDateRange(
    selectedPeriod,
    customStart,
    customEnd,
    selectedTimezone.timeZone,
  );
  const periodState = getConversationPeriodState(
    range,
    selectedTimezone.timeZone,
  );
  const requestedConversation = getSearchValue(params.conversa);
  const supabase = await createClient();
  const emptyMessagesResult = { data: [] as Message[], error: null };
  const loadConversationHistory = (conversationIdentifier: string) =>
    fetchAllSupabaseRows<Message>(async (from, to) => {
      const result = await supabase
        .from("lexia_mensagens")
        .select(
          "id, cliente_slug, contacto_id, identificador_conversa, direccao, tipo, conteudo, origem, criado_em",
        )
        .eq("cliente_slug", profile.cliente_slug)
        .eq("identificador_conversa", conversationIdentifier)
        .order("criado_em", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      return {
        data: (result.data ?? []) as Message[],
        error: result.error,
      };
    });
  const contactsPromise = fetchAllSupabaseRows<Contact>(async (from, to) => {
    let query = supabase
      .from("lexia_contactos")
      .select(
        "id, cliente_slug, canal, identificador_conversa, nome, telefone, criado_em, atualizado_em",
      )
      .eq("cliente_slug", profile.cliente_slug)
      .not("identificador_conversa", "like", "teste:%");

    if (selectedChannel) {
      query = query.eq("canal", selectedChannel);
    }

    const result = await query
      .order("atualizado_em", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    return {
      data: (result.data ?? []) as Contact[],
      error: result.error,
    };
  });
  const periodMessagesPromise = fetchAllSupabaseRows<Message>(
    async (from, to) => {
      const result = await supabase
        .from("lexia_mensagens")
        .select(
          "id, cliente_slug, contacto_id, identificador_conversa, direccao, tipo, conteudo, origem, criado_em",
        )
        .eq("cliente_slug", profile.cliente_slug)
        .not("identificador_conversa", "like", "teste:%")
        .gte("criado_em", range.start.toISOString())
        .lt("criado_em", range.end.toISOString())
        .order("criado_em", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      return {
        data: (result.data ?? []) as Message[],
        error: result.error,
      };
    },
  );
  const requestedHistoryPromise = requestedConversation
    ? loadConversationHistory(requestedConversation)
    : Promise.resolve(emptyMessagesResult);
  const [contactsResult, messagesResult, requestedHistoryResult] =
    await Promise.all([
      contactsPromise,
      periodMessagesPromise,
      requestedHistoryPromise,
    ]);

  if (contactsResult.error) {
    return (
      <section className="flex w-full min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Conversas</h1>
          <p className="mt-2 text-muted-foreground">
            Não foi possível carregar as conversas neste momento.
          </p>
        </div>
      </section>
    );
  }

  if (messagesResult.error) {
    return (
      <section className="flex w-full min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Conversas</h1>
          <p className="mt-2 text-muted-foreground">
            Não foi possível carregar as mensagens neste momento.
          </p>
        </div>
      </section>
    );
  }

  const messages = messagesResult.data as Message[];
  const summaries = buildSummaries(messages);
  const conversationsInPeriod = new Set(
    messages.map((message) => message.identificador_conversa),
  );
  const selection = resolveConversationSelection({
    contacts: contactsResult.data,
    isInPeriod: (contact) =>
      normalizedSearch
        ? normalizeConversationSearch(
            `${contact.nome ?? ""} ${contact.telefone ?? ""}`,
          ).includes(normalizedSearch)
        : conversationsInPeriod.has(contact.identificador_conversa),
    requestedConversation,
    sortValue: (contact) =>
      getDateTimeValue(getContactLastActivity(contact, summaries)),
  });
  const sortedContacts = selection.contacts;
  const selectedContact = selection.selected;
  const selectedMessagesResult = selectedContact
    ? selectedContact.identificador_conversa === requestedConversation
      ? requestedHistoryResult
      : await loadConversationHistory(selectedContact.identificador_conversa)
    : emptyMessagesResult;

  if (selectedMessagesResult.error) {
    return (
      <section className="flex w-full min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Conversas</h1>
          <p className="mt-2 text-muted-foreground">
            Não foi possível carregar o histórico desta conversa.
          </p>
        </div>
      </section>
    );
  }

  const isChatOpenOnMobile = Boolean(
    selectedContact &&
    selectedContact.identificador_conversa === requestedConversation,
  );
  const selectedMessages = selectedMessagesResult.data;
  // A mídia guardada no bucket privado ganha uma URL assinada aqui, no
  // servidor, só para o cliente desta página (lib/conversations/media-urls.ts).
  const displayMessages = await assinarMidias(
    prepareConversationMessages(selectedMessages),
    profile.cliente_slug,
  );
  const selectedSummary = selectedContact
    ? buildSummaries(selectedMessages).get(
        selectedContact.identificador_conversa,
      )
    : null;
  const lastSelectedMessageId =
    displayMessages[displayMessages.length - 1]?.displayId ?? "sem-mensagens";

  return (
    <section className="flex w-full min-w-0 flex-col gap-2 lg:h-[calc(100dvh-4rem)] lg:min-h-[600px]">
      <h1 className="sr-only">Conversas</h1>

      <ConversationFilterBar
        basePath="/app/conversas"
        channel={selectedChannel}
        conversationId={selectedContact?.identificador_conversa}
        period={periodState}
        rangeLabel={range.label}
        searchQuery={searchQuery}
        timezone={selectedTimezone.value}
      />

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside
          className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface/90 shadow-[0_14px_36px_rgba(0,0,0,0.05)] backdrop-blur ${
            isChatOpenOnMobile ? "max-lg:hidden" : ""
          }`}
        >
          <div className="border-b border-border bg-surface/95 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Conversas
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {getConversationCountText(sortedContacts.length, searchQuery)}
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground/60">
                Mais recentes
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto bg-surface-muted p-2">
            {sortedContacts.length > 0 ? (
              sortedContacts.map((contact) => {
                const isSelected =
                  selectedContact?.identificador_conversa ===
                  contact.identificador_conversa;
                const summary = isSelected
                  ? (selectedSummary ??
                    summaries.get(contact.identificador_conversa))
                  : summaries.get(contact.identificador_conversa);
                const lastActivity = getContactLastActivity(contact, summaries);
                const isOutsidePeriod =
                  selection.requestedIsOutsidePeriod &&
                  contact.identificador_conversa === requestedConversation;

                return (
                  <Link
                    className={`rounded-[14px] border px-3 py-2.5 transition ${
                      isSelected
                        ? "border-foreground bg-primary text-primary-foreground shadow-[0_16px_32px_rgba(0,0,0,0.16)]"
                        : "border-transparent bg-surface text-foreground shadow-sm hover:border-border hover:shadow-md"
                    }`}
                    href={getConversationHref(
                      contact.identificador_conversa,
                      selectedChannel,
                      selectedTimezone.value,
                      periodState,
                      searchQuery,
                    )}
                    key={contact.id}
                    /*
                     * Escolher uma conversa não é mudar de página, é mudar o
                     * que está ao lado — e a lista tem de ficar onde estava.
                     *
                     * Por omissão o Next põe a nova página no topo, e quando a
                     * janela não rola — aqui não rola, o layout é `h-dvh` —
                     * fá-lo com um `scrollIntoView`, que rola todos os
                     * contentores que rolem até o topo ficar à vista. O
                     * contentor que rola nesta lista é ela própria, por isso
                     * clicar na décima conversa saltava de volta à primeira.
                     */
                    scroll={false}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-2">
                        <ChannelIcon channel={contact.canal} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {contact.nome || contact.telefone || "Sem nome"}
                          </p>
                          {isOutsidePeriod ? (
                            <p
                              className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                isSelected ? "text-amber-300" : "text-amber-700"
                              }`}
                            >
                              Fora do período
                            </p>
                          ) : null}
                          {/*
                            Como no cabeçalho: sem nome, o título já é o
                            próprio número — ou o PSID do Instagram e do
                            Messenger — e a linha de baixo repetia-o.
                          */}
                          {contact.nome ? (
                            <p
                              className={`mt-0.5 truncate text-[11px] ${
                                isSelected
                                  ? "text-primary-foreground/85"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {contact.telefone ?? "Sem telefone"}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <ChannelBadge channel={contact.canal} />
                    </div>

                    <p
                      className={`mt-1.5 line-clamp-1 text-xs ${
                        isSelected
                          ? "text-primary-foreground/85"
                          : "text-muted-foreground"
                      }`}
                    >
                      {summary
                        ? getConversationMessagePreview(summary.lastMessage)
                        : "Abrir histórico completo"}
                    </p>

                    <div
                      className={`mt-2 flex items-center justify-between gap-3 text-[11px] ${
                        isSelected
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      <span>
                        {summary
                          ? `${summary.messageCount} mensagens`
                          : "Histórico disponível"}
                      </span>
                      <span className="shrink-0">
                        {formatDateInTimezone(
                          lastActivity,
                          selectedTimezone.timeZone,
                        )}
                      </span>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {searchQuery
                  ? `Nenhuma conversa encontrada para “${searchQuery}”.`
                  : "Não há conversas com mensagens neste período."}
              </div>
            )}
          </div>
        </aside>

        <section
          className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_14px_36px_rgba(0,0,0,0.05)] ${
            isChatOpenOnMobile
              ? "max-lg:fixed max-lg:inset-0 max-lg:z-[60] max-lg:h-dvh max-lg:rounded-none max-lg:border-0"
              : "max-lg:hidden"
          }`}
        >
          {selectedContact ? (
            <>
              <div className="shrink-0 border-b border-border bg-surface/95 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 lg:px-4 lg:py-2.5">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 items-center gap-2 lg:gap-3">
                    <Link
                      aria-label="Voltar para a lista de conversas"
                      className="-ml-1 flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted lg:hidden"
                      href={getFilterHref(
                        selectedChannel,
                        selectedTimezone.value,
                        periodState,
                        searchQuery,
                      )}
                    >
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                      >
                        <path
                          d="M12.5 4.5L7 10l5.5 5.5"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                      </svg>
                    </Link>
                    {/*
                      O canal diz-se uma vez só, no ícone.

                      Estavam aqui três: o ícone, uma etiqueta "WhatsApp" ao
                      lado do nome e outra vez no subtítulo, a seguir ao
                      telefone. Desde que o ícone passou a ser o desenho
                      oficial da marca, lê-se de relance e as outras duas não
                      acrescentavam nada — só empurravam o nome da pessoa, que
                      é o que interessa neste cabeçalho, para o meio da linha.

                      O nome do canal fica em `sr-only` porque o glifo é
                      `aria-hidden`: sem isto, quem usa leitor de ecrã deixava
                      de saber por onde a conversa entrou.
                    */}
                    <ChannelIcon channel={selectedContact.canal} size="lg" />
                    <span className="sr-only">
                      {getChannelLabel(selectedContact.canal)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] leading-tight font-semibold text-foreground">
                        {selectedContact.nome ||
                          selectedContact.telefone ||
                          "Conversa"}
                      </h2>
                      {/*
                        O telefone só aparece por baixo de um nome. Sem nome, o
                        título já é o próprio número — ou o PSID do Instagram —
                        e repeti-lo aqui dava a mesma cadeia de dezasseis
                        dígitos duas vezes, uma por cima da outra.
                      */}
                      {selectedContact.nome ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground max-sm:hidden">
                          {selectedContact.telefone ?? "Sem telefone"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5 md:items-end">
                    <div className="text-xs text-muted-foreground max-lg:hidden">
                      {formatDateInTimezone(
                        selectedSummary?.lastActivityAt ??
                          selectedContact.atualizado_em,
                        selectedTimezone.timeZone,
                      )}
                    </div>
                    <Suspense fallback={null}>
                      <ConversationAgentStatus
                        clienteSlug={profile.cliente_slug}
                        contactLabel={
                          selectedContact.nome ||
                          selectedContact.telefone ||
                          undefined
                        }
                        identificadorConversa={
                          selectedContact.identificador_conversa
                        }
                      />
                    </Suspense>
                  </div>
                </div>
              </div>

              {selection.requestedIsOutsidePeriod ? (
                <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900 lg:px-4">
                  Esta conversa está fora do período filtrado ({range.label}),
                  mas o histórico completo está aqui.
                </p>
              ) : null}

              <ScrollToBottomPanel
                className="lexia-chat-wallpaper flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-2.5 sm:px-4 sm:py-3"
                scrollKey={`${selectedContact.identificador_conversa}:${displayMessages.length}:${lastSelectedMessageId}`}
              >
                {displayMessages.length > 0 ? (
                  displayMessages.map((message, messageIndex) => {
                    const dayKey = getConversationDayKey(
                      message.criado_em,
                      selectedTimezone.timeZone,
                    );
                    const previousMessage = displayMessages[messageIndex - 1];
                    const previousDayKey = previousMessage
                      ? getConversationDayKey(
                          previousMessage.criado_em,
                          selectedTimezone.timeZone,
                        )
                      : null;
                    const showFeedback =
                      isSentConversationMessage(message) &&
                      message.partIndex === message.partCount - 1;

                    return (
                      <Fragment key={message.displayId}>
                        {dayKey !== previousDayKey ? (
                          <ConversationDaySeparator
                            label={formatDateInTimezone(
                              message.criado_em,
                              selectedTimezone.timeZone,
                              {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              },
                            )}
                          />
                        ) : null}
                        <ConversationMessageBubble
                          feedback={
                            showFeedback ? (
                              <ConversationFeedbackAction
                                appearance="dark"
                                messageId={message.sourceMessageId}
                                onSave={saveClientConversationFeedback}
                              />
                            ) : null
                          }
                          message={message}
                          timeZone={selectedTimezone.timeZone}
                        />
                      </Fragment>
                    );
                  })
                ) : (
                  <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                    Esta conversa ainda não tem mensagens registadas.
                  </div>
                )}
              </ScrollToBottomPanel>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
              {selection.requestedIsMissing
                ? "Não encontrámos esta conversa. Escolha uma da lista."
                : "Selecione uma conversa para ver as mensagens."}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
