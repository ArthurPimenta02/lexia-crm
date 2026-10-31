import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";
import { Fragment, Suspense } from "react";

import { saveAdminConversationFeedback } from "@/app/admin/conversas/actions";
import {
  ChannelBadge,
  ChannelIcon,
  getChannelLabel,
} from "@/app/components/channel-brand";
import { ConversationAgentStatus } from "@/app/components/conversation-agent-status";
import { ConversationFeedbackAction } from "@/app/components/conversation-feedback-action";
import { ConversationFilterBar } from "@/app/components/conversation-filter-bar";
import { FormSubmitButton } from "@/app/components/form-submit-button";
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
import { getLoggedInUserProfile } from "@/lib/auth/profile";
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

type AdminConversationsPageProps = {
  searchParams: Promise<{
    busca?: string | string[];
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
  searchQuery: string,
) {
  const params = new URLSearchParams();

  params.set("cliente", clienteSlug);
  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  if (searchQuery) {
    params.set("busca", searchQuery);
  }

  return `/admin/conversas?${params.toString()}`;
}

function getConversationHref(
  clienteSlug: string,
  conversationId: string,
  channel: string,
  timezone: string,
  period: ConversationPeriodState,
  searchQuery: string,
) {
  const params = new URLSearchParams();

  params.set("cliente", clienteSlug);
  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  if (channel) {
    params.set("canal", channel);
  }

  if (searchQuery) {
    params.set("busca", searchQuery);
  }

  params.set("conversa", conversationId);

  return `/admin/conversas?${params.toString()}`;
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
  const searchQuery = getSearchValue(params.busca).trim().slice(0, 80);
  const normalizedSearch = normalizeConversationSearch(searchQuery);
  const requestedClient = getSearchValue(params.cliente);
  const requestedChannel = getSearchValue(params.canal);
  const selectedChannel = allowedChannels.includes(requestedChannel)
    ? requestedChannel
    : "";
  const selectedPeriod = getSearchValue(params.periodo) || "hoje";
  const customStart = getSearchValue(params.inicio);
  const customEnd = getSearchValue(params.fim);
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

  // O fuso só se decide depois de sabermos o cliente: sem `?fuso=` na barra,
  // as horas aparecem no fuso dele e não no do Brasil. O período é calculado
  // a seguir porque "hoje" significa coisas diferentes em Lisboa e em Boston.
  const selectedTimezone = getSelectedTimezone(
    params.fuso,
    selectedClient?.slug,
  );
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

  let contacts: Contact[] = [];
  let messages: Message[] = [];
  let conversationsInPeriod = new Set<string>();
  const emptyMessagesResult = { data: [] as Message[], error: null };
  let requestedHistoryResult: { data: Message[]; error: unknown } =
    emptyMessagesResult;
  const loadConversationHistory = (
    clienteSlug: string,
    conversationIdentifier: string,
  ) =>
    fetchAllSupabaseRows<Message>(async (from, to) => {
      const result = await supabase
        .from("lexia_mensagens")
        .select(
          "id, cliente_slug, contacto_id, identificador_conversa, direccao, tipo, conteudo, origem, criado_em",
        )
        .eq("cliente_slug", clienteSlug)
        .eq("identificador_conversa", conversationIdentifier)
        .order("criado_em", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      return {
        data: (result.data ?? []) as Message[],
        error: result.error,
      };
    });

  if (selectedClient) {
    const contactsPromise = fetchAllSupabaseRows<Contact>(async (from, to) => {
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
    const periodMessagesPromise = fetchAllSupabaseRows<Message>(
      async (from, to) => {
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
      },
    );
    const requestedHistoryPromise = requestedConversation
      ? loadConversationHistory(selectedClient.slug, requestedConversation)
      : Promise.resolve(emptyMessagesResult);
    const [contactsResult, messagesResult, preloadedHistoryResult] =
      await Promise.all([
        contactsPromise,
        periodMessagesPromise,
        requestedHistoryPromise,
      ]);

    if (contactsResult.error) {
      throw new Error("Não foi possível buscar as conversas.");
    }

    if (messagesResult.error) {
      throw new Error("Não foi possível buscar as mensagens.");
    }

    requestedHistoryResult = preloadedHistoryResult;
    messages = messagesResult.data as Message[];
    conversationsInPeriod = new Set(
      messages.map((message) => message.identificador_conversa),
    );
    contacts = contactsResult.data;
  }

  const summaries = buildSummaries(messages);
  const selection = resolveConversationSelection({
    contacts,
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
  const selectedMessagesResult =
    selectedClient && selectedContact
      ? selectedContact.identificador_conversa === requestedConversation
        ? requestedHistoryResult
        : await loadConversationHistory(
            selectedClient.slug,
            selectedContact.identificador_conversa,
          )
      : emptyMessagesResult;

  if (selectedMessagesResult.error) {
    throw new Error("Não foi possível buscar o histórico da conversa.");
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
    selectedClient.slug,
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
        basePath="/admin/conversas"
        channel={selectedChannel}
        clientSlug={selectedClient?.slug}
        conversationId={selectedContact?.identificador_conversa}
        leading={
          <Form
            action="/admin/conversas"
            className="flex min-w-0 items-center gap-1.5 sm:border-r sm:border-border sm:pr-2"
            replace
            scroll={false}
          >
            <label className="sr-only" htmlFor="cliente">
              Cliente
            </label>
            <select
              className="h-9 min-w-0 max-w-56 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground outline-none transition focus:border-border-strong"
              defaultValue={selectedClient?.slug ?? ""}
              id="cliente"
              name="cliente"
            >
              {clients.length === 0 ? (
                <option value="">Nenhum cliente activo</option>
              ) : null}
              {clients.map((client) => (
                <option key={client.id} value={client.slug}>
                  {client.nome ?? client.slug}
                </option>
              ))}
            </select>
            {selectedChannel ? (
              <input name="canal" type="hidden" value={selectedChannel} />
            ) : null}
            {searchQuery ? (
              <input name="busca" type="hidden" value={searchQuery} />
            ) : null}
            <input name="fuso" type="hidden" value={selectedTimezone.value} />
            <input name="periodo" type="hidden" value={periodState.key} />
            {periodState.key === "personalizado" ? (
              <>
                <input name="inicio" type="hidden" value={periodState.start} />
                <input name="fim" type="hidden" value={periodState.end} />
              </>
            ) : null}
            <FormSubmitButton
              className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
              pendingLabel="..."
            >
              Selecionar
            </FormSubmitButton>
          </Form>
        }
        period={periodState}
        rangeLabel={range.label}
        searchQuery={searchQuery}
        timezone={selectedTimezone.value}
      />

      {!selectedClient ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum cliente activo disponível.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside
            className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface/90 shadow-[0_14px_36px_rgba(0,0,0,0.05)] backdrop-blur ${
              isChatOpenOnMobile ? "max-lg:hidden" : ""
            }`}
          >
            <div className="border-b border-border bg-surface/95 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Conversas</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {getConversationCountText(
                      sortedContacts.length,
                      searchQuery,
                    )}
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
                  const lastActivity = getContactLastActivity(
                    contact,
                    summaries,
                  );
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
                        selectedClient.slug,
                        contact.identificador_conversa,
                        selectedChannel,
                        selectedTimezone.value,
                        periodState,
                        searchQuery,
                      )}
                      key={contact.id}
                      // Mesma razão do ecrã do cliente: sem isto o Next põe a
                      // página no topo com um `scrollIntoView`, que arrasta a
                      // própria lista de conversas de volta à primeira linha.
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
                                  isSelected
                                    ? "text-amber-300"
                                    : "text-amber-700"
                                }`}
                              >
                                Fora do período
                              </p>
                            ) : null}
                            {/*
                              Como no cabeçalho: sem nome, o título já é o
                              próprio número ou o PSID, e esta linha repetia-o.
                            */}
                            {contact.nome ? (
                              <p
                                className={`mt-0.5 truncate text-[11px] ${
                                  isSelected
                                    ? "text-primary-foreground/70"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {contact.telefone ?? "Sem telefone"}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <ChannelBadge
                          channel={contact.canal}
                          variant={isSelected ? "dark" : "light"}
                        />
                      </div>

                      <p
                        className={`mt-1.5 line-clamp-1 text-xs ${
                          isSelected
                            ? "text-primary-foreground/75"
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
                            ? "text-primary-foreground/60"
                            : "text-muted-foreground/60"
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
                          selectedClient.slug,
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
                        Mesma razão do ecrã do cliente: o canal diz-se uma vez
                        só, no ícone, agora que é o desenho oficial da marca.
                        O `sr-only` existe porque o glifo é `aria-hidden`.
                      */}
                      <ChannelIcon channel={selectedContact.canal} size="lg" />
                      <span className="sr-only">
                        {getChannelLabel(selectedContact.canal)}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-[15px] leading-tight font-semibold">
                          {selectedContact.nome ||
                            selectedContact.telefone ||
                            "Conversa"}
                        </h2>
                        {/*
                          Sem nome o título já é o próprio número, ou o PSID do
                          Instagram. Repeti-lo mostrava a mesma cadeia duas
                          vezes, uma por cima da outra.
                        */}
                        {selectedContact.nome ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground max-sm:hidden">
                            {selectedContact.telefone ?? "Sem telefone"}
                          </p>
                        ) : null}
                        <p className="sr-only">
                          {selectedContact.identificador_conversa}
                        </p>
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
                      {profile.status === "ativo" ? (
                        <Suspense fallback={null}>
                          <ConversationAgentStatus
                            clienteSlug={selectedClient.slug}
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
                      ) : null}
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
                                  appearance="dark"
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
                    <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                      Esta conversa ainda não tem mensagens registadas.
                    </div>
                  )}
                </ScrollToBottomPanel>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
                {selection.requestedIsMissing
                  ? "Não encontrámos esta conversa neste cliente. Escolhe uma da lista."
                  : "Selecciona uma conversa para visualizar as mensagens."}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
