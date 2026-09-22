import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment, Suspense } from "react";

import { saveAdminConversationFeedback } from "@/app/admin/conversas/actions";
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
import { getLoggedInUserProfile } from "@/lib/auth/profile";
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

type AdminConversationsPageProps = {
  searchParams: Promise<{
    canal?: string | string[];
    cliente?: string | string[];
    conversa?: string | string[];
    fim?: string | string[];
    fuso?: string | string[];
    inicio?: string | string[];
    periodo?: string | string[];
  }>;
};

type AdminClient = {
  id: string;
  nome: string | null;
  slug: string;
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
  clienteSlug: string,
  channel: string,
  timezone: string,
  period: ConversationPeriodState,
) {
  const params = new URLSearchParams();

  params.set("cliente", clienteSlug);
  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  return `/admin/conversas?${params.toString()}`;
}

function getConversationHref(
  clienteSlug: string,
  conversationId: string,
  channel: string,
  timezone: string,
  period: ConversationPeriodState,
) {
  const params = new URLSearchParams();

  params.set("cliente", clienteSlug);
  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  params.set("conversa", conversationId);

  return `/admin/conversas?${params.toString()}`;
}

function getTimezoneHref(
  clienteSlug: string,
  channel: string,
  conversationId: string | null,
  timezone: string,
  period: ConversationPeriodState,
) {
  const params = new URLSearchParams();

  params.set("cliente", clienteSlug);
  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  if (conversationId) {
    params.set("conversa", conversationId);
  }

  return `/admin/conversas?${params.toString()}`;
}

function getConversationCountText(count: number, channel: string) {
  const base = `${count} conversa${count === 1 ? "" : "s"}`;
  const channelLabel = channelFilters.find((item) => item.value === channel)
    ?.label;

  return channelLabel && channel
    ? `${base} no ${channelLabel}`
    : base;
}

export default async function AdminConversationsPage({
  searchParams,
}: AdminConversationsPageProps) {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  const params = await searchParams;
  const requestedClient = getSearchValue(params.cliente);
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

  const { data: clientsData, error: clientsError } = await supabase
    .from("lexia_clientes")
    .select("id, nome, slug")
    .eq("status", "ativo")
    .order("nome");

  if (clientsError) {
    throw new Error("Não foi possível buscar os clientes.");
  }

  const clients = (clientsData ?? []) as AdminClient[];
  const selectedClient =
    clients.find((client) => client.slug === requestedClient) ??
    clients[0] ??
    null;

  let contacts: Contact[] = [];
  let messages: Message[] = [];

  if (selectedClient) {
    const { data: contactsData, error: contactsError } =
      await fetchAllSupabaseRows<Contact>(async (from, to) => {
        let query = supabase
          .from("lexia_contactos")
          .select(
            "id, cliente_slug, canal, identificador_conversa, nome, telefone, criado_em, atualizado_em",
          )
          .eq("cliente_slug", selectedClient.slug)
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

    if (contactsError) {
      throw new Error("Não foi possível buscar as conversas.");
    }

    const { data: messagesData, error: messagesError } =
      contactsData.length > 0
        ? await fetchAllSupabaseRows<Message>(async (from, to) => {
            const result = await supabase
              .from("lexia_mensagens")
              .select(
                "id, cliente_slug, contacto_id, identificador_conversa, direccao, tipo, conteudo, origem, criado_em",
              )
              .eq("cliente_slug", selectedClient.slug)
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
          })
        : { data: [], error: null };

    if (messagesError) {
      throw new Error("Não foi possível buscar as mensagens.");
    }

    messages = messagesData as Message[];
    const conversationsInPeriod = new Set(
      messages.map((message) => message.identificador_conversa),
    );
    contacts = contactsData.filter((contact) =>
      conversationsInPeriod.has(contact.identificador_conversa),
    );
  }

  const summaries = buildSummaries(messages);
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
  const { data: selectedMessages, error: selectedMessagesError } =
    selectedClient && selectedContact
      ? await fetchAllSupabaseRows<Message>(async (from, to) => {
          const result = await supabase
            .from("lexia_mensagens")
            .select(
              "id, cliente_slug, contacto_id, identificador_conversa, direccao, tipo, conteudo, origem, criado_em",
            )
            .eq("cliente_slug", selectedClient.slug)
            .eq(
              "identificador_conversa",
              selectedContact.identificador_conversa,
            )
            .order("criado_em", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);

          return {
            data: (result.data ?? []) as Message[],
            error: result.error,
          };
        })
      : { data: [], error: null };

  if (selectedMessagesError) {
    throw new Error("Não foi possível buscar o histórico da conversa.");
  }

  const isChatOpenOnMobile = Boolean(
    selectedContact &&
      selectedContact.identificador_conversa === requestedConversation,
  );
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
        <h1 className="text-3xl font-semibold tracking-tight">Conversas</h1>
        <p className="mt-2 text-zinc-600">
          Conversas reais registadas pelos agentes em produção.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
        method="get"
      >
        <div className="flex min-w-72 flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="cliente">
            Cliente
          </label>
          <select
            className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900"
            defaultValue={selectedClient?.slug ?? ""}
            id="cliente"
            name="cliente"
          >
            {clients.length === 0 ? (
              <option value="">Nenhum cliente activo</option>
            ) : null}
            {clients.map((client) => (
              <option key={client.id} value={client.slug}>
                {client.nome ?? client.slug} ({client.slug})
              </option>
            ))}
          </select>
        </div>

        {selectedChannel ? (
          <input name="canal" type="hidden" value={selectedChannel} />
        ) : null}
        <input name="fuso" type="hidden" value={selectedTimezone.value} />
        <input name="periodo" type="hidden" value={periodState.key} />
        {periodState.key === "personalizado" ? (
          <>
            <input name="inicio" type="hidden" value={periodState.start} />
            <input name="fim" type="hidden" value={periodState.end} />
          </>
        ) : null}

        <button
          className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          type="submit"
        >
          Seleccionar
        </button>
      </form>

      {!selectedClient ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          Nenhum cliente activo disponível.
        </div>
      ) : (
        <div className="grid gap-5 lg:h-[calc(100vh-270px)] lg:min-h-[560px] lg:grid-cols-[380px_1fr]">
          <aside
            className={`flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-zinc-200/80 bg-white/90 shadow-[0_18px_45px_rgba(0,0,0,0.06)] backdrop-blur ${
              isChatOpenOnMobile ? "max-lg:hidden" : ""
            }`}
          >
            <div className="border-b border-zinc-200/70 bg-white/95 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Conversas</h2>
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
                        selectedClient.slug,
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
                basePath="/admin/conversas"
                channel={selectedChannel}
                clientSlug={selectedClient.slug}
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
                  const lastActivity = getContactLastActivity(
                    contact,
                    summaries,
                  );

                  return (
                    <Link
                      className={`rounded-[18px] border px-4 py-3 transition ${
                        isSelected
                          ? "border-zinc-950 bg-zinc-950 text-white shadow-[0_16px_32px_rgba(0,0,0,0.16)]"
                          : "border-transparent bg-white text-zinc-800 shadow-sm hover:border-zinc-200 hover:shadow-md"
                      }`}
                      href={getConversationHref(
                        selectedClient.slug,
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
                              isSelected ? "text-white/70" : "text-zinc-500"
                            }`}
                          >
                            {contact.telefone ?? "Sem telefone"}
                          </p>
                          </div>
                        </div>
                        <ChannelBadge
                          channel={contact.canal}
                          variant={isSelected ? "dark" : "light"}
                        />
                      </div>

                      <p
                        className={`mt-2 line-clamp-2 text-xs ${
                          isSelected ? "text-white/75" : "text-zinc-500"
                        }`}
                      >
                        {getConversationMessagePreview(summary?.lastMessage)}
                      </p>

                      <div
                        className={`mt-3 flex items-center justify-between gap-3 text-xs ${
                          isSelected ? "text-white/60" : "text-zinc-400"
                        }`}
                      >
                        <span className="truncate">
                          {contact.identificador_conversa}
                        </span>
                        <span className="shrink-0">
                          {summary?.messageCount ?? 0} msg
                        </span>
                      </div>

                      <p
                        className={`mt-1 text-xs ${
                          isSelected ? "text-white/60" : "text-zinc-400"
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
                          selectedClient.slug,
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
                          <h2 className="truncate font-semibold">
                            {selectedContact.nome ||
                              selectedContact.telefone ||
                              "Conversa"}
                          </h2>
                          <ChannelBadge channel={selectedContact.canal} />
                        </div>
                        <p className="mt-1 text-sm text-zinc-500">
                          {selectedClient.slug} ·{" "}
                          {selectedContact.telefone ?? "Sem telefone"} ·{" "}
                          {getChannelLabel(selectedContact.canal)}
                        </p>
                        <p className="mt-1 break-words font-mono text-xs text-zinc-400">
                          {selectedContact.identificador_conversa}
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
                      {profile.status === "ativo" ? (
                        <Suspense fallback={null}>
                          <ConversationAgentStatus
                            clienteSlug={selectedClient.slug}
                            contactLabel={
                              selectedContact.nome || selectedContact.telefone || undefined
                            }
                            identificadorConversa={
                              selectedContact.identificador_conversa
                            }
                          />
                        </Suspense>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 overflow-x-auto lg:mt-4">
                    <TimezoneSwitcher
                      activeValue={selectedTimezone.value}
                      buildHref={(timezone) =>
                        getTimezoneHref(
                          selectedClient.slug,
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
                  scrollKey={`${selectedClient.slug}:${selectedContact.identificador_conversa}:${displayMessages.length}:${lastSelectedMessageId}`}
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
                                  onSave={saveAdminConversationFeedback.bind(
                                    null,
                                    selectedClient.slug,
                                  )}
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
                Selecciona uma conversa para visualizar as mensagens.
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
