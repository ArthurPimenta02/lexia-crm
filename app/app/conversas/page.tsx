import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment, Suspense } from "react";

import { saveClientConversationFeedback } from "@/app/app/conversas/actions";
import {
  ChannelBadge,
  ChannelFilterLink,
  ChannelIcon,
  getChannelLabel,
} from "@/app/components/channel-brand";
import { ConversationAgentStatus } from "@/app/components/conversation-agent-status";
import { ConversationFeedbackAction } from "@/app/components/conversation-feedback-action";
import {
  ConversationDaySeparator,
  ConversationMessageBubble,
} from "@/app/components/conversation-message-bubble";
import {
  appendConversationPeriodParams,
  ConversationPeriodFilter,
  type ConversationPeriodState,
  getConversationPeriodState,
} from "@/app/components/conversation-period-filter";
import {
  formatDateInTimezone,
  getSelectedTimezone,
  TimezoneSwitcher,
} from "@/app/components/conversation-timezone";
import { ScrollToBottomPanel } from "@/app/components/scroll-to-bottom-panel";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getDateRange, getSearchValue } from "@/lib/dashboard/date-range";
import {
  getConversationDayKey,
  getConversationMessagePreview,
  isSentConversationMessage,
  prepareConversationMessages,
  type ConversationMessageRecord,
  type DisplayConversationMessage,
} from "@/lib/conversations/message-display";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

type ConversationsPageProps = {
  searchParams: Promise<{
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

const channelFilters = [
  { label: "Todas", value: "" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Messenger", value: "messenger" },
  { label: "Instagram", value: "instagram" },
];
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
) {
  const params = new URLSearchParams();

  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  return `/app/conversas?${params.toString()}`;
}

function getConversationHref(
  conversationId: string,
  channel: string,
  timezone: string,
  period: ConversationPeriodState,
) {
  const params = new URLSearchParams();

  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  params.set("conversa", conversationId);

  return `/app/conversas?${params.toString()}`;
}

function getTimezoneHref(
  channel: string,
  conversationId: string | null,
  timezone: string,
  period: ConversationPeriodState,
) {
  const params = new URLSearchParams();

  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  if (conversationId) {
    params.set("conversa", conversationId);
  }

  return `/app/conversas?${params.toString()}`;
}

function getConversationCountText(count: number, channel: string) {
  const base = `${count} conversa${count === 1 ? "" : "s"}`;
  const channelLabel = channelFilters.find((item) => item.value === channel)
    ?.label;

  return channelLabel && channel
    ? `${base} no ${channelLabel}`
    : base;
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

  if (!profile.cliente_slug || profile.status !== "ativo") {
    return (
      <section className="flex w-full min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-950">Conversas</h1>
          <p className="mt-2 text-zinc-600">
            Não foi possível encontrar um vínculo ativo com um cliente.
          </p>
        </div>
      </section>
    );
  }

  const params = await searchParams;
  const requestedChannel = getSearchValue(params.canal);
  const selectedChannel = allowedChannels.includes(requestedChannel)
    ? requestedChannel
    : "";
  const selectedTimezone = getSelectedTimezone(params.fuso);
  const selectedPeriod = getSearchValue(params.periodo);
  const customStart = getSearchValue(params.inicio);
  const customEnd = getSearchValue(params.fim);
  const range = getDateRange(
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
          <h1 className="text-3xl font-semibold text-zinc-950">Conversas</h1>
          <p className="mt-2 text-zinc-600">
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
          <h1 className="text-3xl font-semibold text-zinc-950">Conversas</h1>
          <p className="mt-2 text-zinc-600">
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
  const contacts = contactsResult.data.filter((contact) =>
    conversationsInPeriod.has(contact.identificador_conversa),
  );
  const sortedContacts = [...contacts].sort(
    (firstContact, secondContact) =>
      getDateTimeValue(getContactLastActivity(secondContact, summaries)) -
      getDateTimeValue(getContactLastActivity(firstContact, summaries)),
  );
  const selectedContact =
    sortedContacts.find(
      (contact) => contact.identificador_conversa === requestedConversation,
    ) ??
    sortedContacts[0] ??
    null;
  const selectedMessagesResult = selectedContact
    ? selectedContact.identificador_conversa === requestedConversation
      ? requestedHistoryResult
      : await loadConversationHistory(selectedContact.identificador_conversa)
    : emptyMessagesResult;

  if (selectedMessagesResult.error) {
    return (
      <section className="flex w-full min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-950">Conversas</h1>
          <p className="mt-2 text-zinc-600">
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
  const displayMessages = prepareConversationMessages(selectedMessages);
  const selectedSummary = selectedContact
    ? buildSummaries(selectedMessages).get(
        selectedContact.identificador_conversa,
      )
    : null;
  const lastSelectedMessageId =
    displayMessages[displayMessages.length - 1]?.displayId ?? "sem-mensagens";

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <div>
        <p className="text-sm font-semibold tracking-[0.32em] text-zinc-500 uppercase">
          Agente
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Conversas
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600">
          Conversas reais registadas pelo agente em produção.
        </p>
      </div>

      <div className="grid gap-5 lg:h-[calc(100vh-190px)] lg:min-h-[560px] lg:grid-cols-[380px_1fr]">
        <aside
          className={`flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-zinc-200/80 bg-white/90 shadow-[0_18px_45px_rgba(0,0,0,0.06)] backdrop-blur ${
            isChatOpenOnMobile ? "max-lg:hidden" : ""
          }`}
        >
          <div className="border-b border-zinc-200/70 bg-white/95 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950">
                  Conversas
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {getConversationCountText(contacts.length, selectedChannel)}
                </p>
              </div>
              {selectedChannel ? (
                <ChannelBadge channel={selectedChannel} />
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {channelFilters.map((filter) => {
                const isActive = selectedChannel === filter.value;

                return (
                  <ChannelFilterLink
                    active={isActive}
                    channel={filter.value}
                    href={getFilterHref(
                      filter.value,
                      selectedTimezone.value,
                      periodState,
                    )}
                    key={filter.label}
                  />
                );
              })}
            </div>
            <ConversationPeriodFilter
              basePath="/app/conversas"
              channel={selectedChannel}
              period={periodState}
              rangeLabel={range.label}
              timezone={selectedTimezone.value}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#f7f7f5] p-3">
            {sortedContacts.length > 0 ? (
              sortedContacts.map((contact) => {
                const summary = summaries.get(contact.identificador_conversa);
                const isSelected =
                  selectedContact?.identificador_conversa ===
                  contact.identificador_conversa;
                const lastActivity = getContactLastActivity(contact, summaries);

                return (
                  <Link
                    className={`rounded-[18px] border px-4 py-3 transition ${
                      isSelected
                        ? "border-zinc-950 bg-zinc-950 text-white shadow-[0_16px_32px_rgba(0,0,0,0.16)]"
                        : "border-transparent bg-white text-zinc-950 shadow-sm hover:border-zinc-200 hover:shadow-md"
                    }`}
                    href={getConversationHref(
                      contact.identificador_conversa,
                      selectedChannel,
                      selectedTimezone.value,
                      periodState,
                    )}
                    key={contact.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <ChannelIcon channel={contact.canal} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {contact.nome || contact.telefone || "Sem nome"}
                          </p>
                          <p
                            className={`mt-1 truncate text-xs ${
                              isSelected ? "text-white/85" : "text-zinc-500"
                            }`}
                          >
                            {contact.telefone ?? "Sem telefone"}
                          </p>
                        </div>
                      </div>
                      <ChannelBadge channel={contact.canal} />
                    </div>

                    <p
                      className={`mt-2 line-clamp-2 text-xs ${
                        isSelected ? "text-white/85" : "text-zinc-600"
                      }`}
                    >
                      {getConversationMessagePreview(summary?.lastMessage)}
                    </p>

                    <div
                      className={`mt-3 flex items-center justify-between gap-3 text-xs ${
                        isSelected ? "text-white/80" : "text-zinc-500"
                      }`}
                    >
                      <span>{summary?.messageCount ?? 0} mensagens</span>
                    </div>

                    <p
                      className={`mt-1 text-xs ${
                        isSelected ? "text-white/80" : "text-zinc-500"
                      }`}
                    >
                      {formatDateInTimezone(
                        lastActivity,
                        selectedTimezone.timeZone,
                      )}
                    </p>
                  </Link>
                );
              })
            ) : (
              <div className="px-4 py-10 text-center text-sm text-zinc-500">
                Não há conversas com mensagens neste período.
              </div>
            )}
          </div>
        </aside>

        <section
          className={`flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-zinc-200/80 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.06)] ${
            isChatOpenOnMobile
              ? "max-lg:fixed max-lg:inset-0 max-lg:z-[60] max-lg:rounded-none max-lg:border-0"
              : "max-lg:hidden"
          }`}
        >
          {selectedContact ? (
            <>
              <div className="border-b border-zinc-200/70 bg-white/95 px-3 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 lg:px-5 lg:py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 items-center gap-2 lg:items-start lg:gap-3">
                    <Link
                      aria-label="Voltar para a lista de conversas"
                      className="-ml-1 flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-zinc-700 transition hover:bg-zinc-100 lg:hidden"
                      href={getFilterHref(
                        selectedChannel,
                        selectedTimezone.value,
                        periodState,
                      )}
                    >
                      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20">
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
                    <ChannelIcon channel={selectedContact.canal} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-zinc-950">
                          {selectedContact.nome ||
                            selectedContact.telefone ||
                            "Conversa"}
                        </h2>
                        <ChannelBadge channel={selectedContact.canal} />
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">
                        {selectedContact.telefone ?? "Sem telefone"} ·{" "}
                        {getChannelLabel(selectedContact.canal)}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-2 md:items-end">
                    <div className="text-sm text-zinc-500 max-lg:hidden">
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
                          selectedContact.nome || selectedContact.telefone || undefined
                        }
                        identificadorConversa={
                          selectedContact.identificador_conversa
                        }
                      />
                    </Suspense>
                  </div>
                </div>
                <div className="mt-2 overflow-x-auto lg:mt-4">
                  <TimezoneSwitcher
                    activeValue={selectedTimezone.value}
                    buildHref={(timezone) =>
                      getTimezoneHref(
                        selectedChannel,
                        selectedContact.identificador_conversa,
                        timezone,
                        periodState,
                      )
                    }
                  />
                </div>
              </div>

              <ScrollToBottomPanel
                className="lexia-chat-wallpaper flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-5 sm:px-6"
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
                                appearance="light"
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
                  <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-500">
                    Esta conversa ainda não tem mensagens registadas.
                  </div>
                )}
              </ScrollToBottomPanel>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-zinc-500">
              Selecione uma conversa para ver as mensagens.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
