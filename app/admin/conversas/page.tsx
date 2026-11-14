import Form from "next/form";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { saveAdminConversationFeedback } from "@/app/admin/conversas/actions";
import { BloquearContacto } from "@/app/admin/conversas/bloquear-contacto";
import { ConversationAgentStatus } from "@/app/components/conversation-agent-status";
import {
  BuscaEFiltros,
  FiltrosAtivos,
  hrefConversas,
  type EstadoConversas,
} from "@/app/components/conversation-filter-bar";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { getConversationPeriodState } from "@/app/components/conversation-period-filter";
import {
  AreaConversas,
  CabecalhoConversa,
  DetalhesConversa,
  FichaConversa,
  HistoricoConversa,
  ListaConversas,
  previaComAutor,
  quandoCurto,
  situacaoDaConversa,
  TopoLista,
} from "@/app/components/conversation-workspace";
import { CaixaDeEnvio } from "@/app/components/caixa-de-envio";
import { AvisoLinha, FiltroTrilho, VazioTela } from "@/app/components/tela";
import { getTimezoneLabel } from "@/lib/clientes/timezone";
import { getSelectedTimezone } from "@/lib/clientes/timezone";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getSearchValue } from "@/lib/dashboard/date-range";
import { getConversationDateRange } from "@/lib/conversations/date-range";
import { resolveConversationSelection } from "@/lib/conversations/select-conversation";
import {
  getConversationMessagePreview,
  prepareConversationMessages,
  type ConversationMessageRecord,
  type DisplayConversationMessage,
} from "@/lib/conversations/message-display";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { assinarMidias } from "@/lib/conversations/media-urls";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { createClient } from "@/lib/supabase/server";
import { AtualizacaoAutomatica } from "@/app/components/atualizacao-automatica";
import { sinalDaTela } from "@/lib/sinais/sinal-da-tela";

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
    situacao?: string | string[];
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

/** Data e hora no idioma de quem vê, no fuso escolhido na barra. */
function formatarData(
  date: string | null,
  timeZone: string,
  locale: string,
  semData: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
) {
  if (!date) {
    return semData;
  }

  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
    new Date(date),
  );
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
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];

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
  const displayMessages = selectedClient
    ? await assinarMidias(
        prepareConversationMessages(selectedMessages),
        selectedClient.slug,
      )
    : [];
  const selectedSummary = selectedContact
    ? buildSummaries(selectedMessages).get(
        selectedContact.identificador_conversa,
      )
    : null;
  const lastSelectedMessageId =
    displayMessages[displayMessages.length - 1]?.displayId ?? "sem-mensagens";

  const situacaoPedida = getSearchValue(params.situacao) === "esperando" ? "esperando" : "";
  const estado: EstadoConversas = {
    basePath: "/admin/conversas",
    busca: searchQuery,
    canal: selectedChannel,
    cliente: selectedClient?.slug,
    conversa: null,
    fuso: selectedTimezone.value,
    periodo: periodState,
    situacao: situacaoPedida,
  };
  const timeZone = selectedTimezone.timeZone;
  // A situação vem da última mensagem do período, a mesma regra do dashboard.
  const situacaoDe = (identificador: string) =>
    situacaoDaConversa(summaries.get(identificador)?.lastMessage);
  const esperando = sortedContacts.filter(
    (contact) => situacaoDe(contact.identificador_conversa) === "esperando",
  ).length;
  const contatosVisiveis = situacaoPedida
    ? sortedContacts.filter(
        (contact) =>
          situacaoDe(contact.identificador_conversa) === "esperando" ||
          contact.identificador_conversa === requestedConversation,
      )
    : sortedContacts;
  const itens = contatosVisiveis.map((contact) => {
    const isSelected =
      selectedContact?.identificador_conversa === contact.identificador_conversa;
    const summary = isSelected
      ? (selectedSummary ?? summaries.get(contact.identificador_conversa))
      : summaries.get(contact.identificador_conversa);
    const ultima = summary?.lastMessage;
    const previa = ultima
      ? ultima.content || t(getConversationMessagePreview(ultima))
      : t("Abrir histórico completo");

    return {
      canal: contact.canal,
      foraDoPeriodo:
        selection.requestedIsOutsidePeriod &&
        contact.identificador_conversa === requestedConversation,
      href: hrefConversas(estado, { conversa: contact.identificador_conversa }),
      id: contact.id,
      nome: contact.nome || contact.telefone || t("Sem nome"),
      previa: previaComAutor(situacaoDaConversa(ultima), previa, t),
      quando: quandoCurto(getContactLastActivity(contact, summaries), timeZone, locale, t("Sem data")),
      selecionado: isSelected,
      semNome: !contact.nome && !contact.telefone,
      situacao: situacaoDe(contact.identificador_conversa),
    };
  });
  const nomeSelecionado = selectedContact
    ? selectedContact.nome || selectedContact.telefone || t("Sem nome")
    : "";

  const seletorCliente = (
    <Form
      action="/admin/conversas"
      className="flex min-w-0 items-center gap-1.5"
      replace
      scroll={false}
    >
      <label className="sr-only" htmlFor="cliente">
        {t("Cliente")}
      </label>
      <select
        className="ds-campo h-8 min-w-0 max-w-56 px-2.5 text-[0.8125rem]"
        defaultValue={selectedClient?.slug ?? ""}
        id="cliente"
        name="cliente"
      >
        {clients.length === 0 ? (
          <option value="">{t("Nenhum cliente ativo")}</option>
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
        className="ds-botao ds-botao-primario ds-botao-p"
        pendingLabel="..."
      >
        {t("Selecionar")}
      </FormSubmitButton>
    </Form>
  );

  const fichaAberta = (
            selectedContact ? (
              <FichaConversa
                canal={selectedContact.canal}
                linhas={[
                  ...(selectedContact.telefone
                    ? [{ rotulo: t("Telefone"), valor: selectedContact.telefone }]
                    : []),
                  {
                    rotulo: t("Primeiro contato"),
                    valor: formatarData(selectedContact.criado_em, timeZone, locale, t("Sem data"), {
                      dateStyle: "medium",
                    }),
                  },
                  {
                    rotulo: t("Última atividade"),
                    valor: formatarData(
                      selectedSummary?.lastActivityAt ?? selectedContact.atualizado_em,
                      timeZone,
                      locale,
                      t("Sem data"),
                    ),
                  },
                  {
                    rotulo: t("Histórico"),
                    valor:
                      (selectedSummary?.messageCount ?? 0) === 1
                        ? t("{n} mensagem", { n: 1 })
                        : t("{n} mensagens", { n: selectedSummary?.messageCount ?? 0 }),
                  },
                  {
                    rotulo: t("Identificador"),
                    valor: (
                      <span className="font-mono text-xs font-normal break-all text-muted-foreground">
                        {selectedContact.identificador_conversa}
                      </span>
                    ),
                  },
                ]}
                situacao={situacaoDe(selectedContact.identificador_conversa)}
              />
            ) : null
  );

  return (
    <section className="flex w-full min-w-0 flex-col gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-[640px]">
      <AtualizacaoAutomatica segundos={5} sinal={sinalDaTela.bind(null, "conversas", selectedClient?.slug ?? null)} />

      <div className={isChatOpenOnMobile ? "max-lg:hidden" : ""}>
        {/* Desenho A+ (14/11): no topo só fica a escolha do cliente; os filtros vivem no botão da lista. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="ds-sobretitulo">
            {selectedClient ? `${selectedClient.nome ?? selectedClient.slug} · ${t("Conversas")}` : t("Conversas")}
          </p>
          {seletorCliente}
        </div>
      </div>

      {!selectedClient ? (
        <div className="ds-bloco">
          <VazioTela titulo={t("Nenhum cliente ativo disponível.")} />
        </div>
      ) : (
        <AreaConversas
          chat={
            selectedContact ? (
              <>
                <CabecalhoConversa
                  acoes={
<>

                      <Suspense fallback={null}>
                        <BloquearContacto
                          clienteSlug={selectedClient.slug}
                          identificadorConversa={selectedContact.identificador_conversa}
                          nome={selectedContact.nome}
                        />
                      </Suspense>
                      {profile.status === "ativo" ? (
                        <Suspense fallback={null}>
                          <ConversationAgentStatus
                            clienteSlug={selectedClient.slug}
                            contactLabel={selectedContact.nome || selectedContact.telefone || undefined}
                            identificadorConversa={selectedContact.identificador_conversa}
                          />
                        </Suspense>
                      ) : null}
                    
<DetalhesConversa>{fichaAberta}</DetalhesConversa>
</>
}
                  canal={selectedContact.canal}
                  nome={nomeSelecionado}
                  semNome={!selectedContact.nome && !selectedContact.telefone}
                  subtitulo={
                    selectedContact.nome && selectedContact.telefone
                      ? selectedContact.telefone
                      : null
                  }
                  voltarHref={hrefConversas(estado)}
                />

                {selection.requestedIsOutsidePeriod ? (
                  <div className="shrink-0 border-b border-border px-3 py-2 lg:px-4">
                    <AvisoLinha tom="info">
                      {t(
                        "Esta conversa está fora do período filtrado ({periodo}), mas o histórico completo está aqui.",
                        { periodo: t(range.label) },
                      )}
                    </AvisoLinha>
                  </div>
                ) : null}

                <HistoricoConversa
                  formatarDia={(data) =>
                    formatarData(data, timeZone, locale, t("Sem data"), {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  }
                  mensagens={displayMessages}
                  onSave={saveAdminConversationFeedback.bind(null, selectedClient.slug)}
                  scrollKey={`${selectedClient.slug}:${selectedContact.identificador_conversa}:${displayMessages.length}:${lastSelectedMessageId}`}
                  timeZone={timeZone}
                />
                <CaixaDeEnvio key={selectedContact.identificador_conversa} cliente={selectedClient.slug} conversa={selectedContact.identificador_conversa} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <VazioTela
                  pose="ola"
                  texto={
                    selection.requestedIsMissing
                      ? t("Não encontramos esta conversa neste cliente. Escolha uma da lista.")
                      : undefined
                  }
                  titulo={t("Selecione uma conversa para visualizar as mensagens.")}
                />
              </div>
            )
          }
          conversaAberta={isChatOpenOnMobile}
          lista={
            <>
              <TopoLista>
                <h1 className="px-1 text-lg font-semibold tracking-tight text-foreground">{t("Conversas")}</h1>
                <BuscaEFiltros estado={estado} />
                <FiltroTrilho
                  opcoes={[
                    {
                      ativo: !situacaoPedida,
                      href: hrefConversas(estado, { situacao: "" }),
                      label: t("Todas"),
                      quantidade: sortedContacts.length,
                    },
                    {
                      ativo: situacaoPedida === "esperando",
                      href: hrefConversas(estado, { situacao: "esperando" }),
                      label: t("Esperando"),
                      quantidade: esperando,
                    },
                  ]}
                  rotulo={t("Situação")}
                />
                <FiltrosAtivos
                  estado={estado}
                  nomeFuso={getTimezoneLabel(timeZone)}
                  nomePeriodo={searchQuery ? t("Busca em todo o período") : t(range.label)}
                />
              </TopoLista>
              <ListaConversas
                itens={itens}
                vazio={
                  <VazioTela
                    pose="ola"
                    texto={
                      searchQuery
                        ? t("Confira o nome ou tente pelo número.")
                        : situacaoPedida
                          ? t("Todas as conversas deste período já foram respondidas.")
                          : t("Troque o período em Filtros para ver conversas mais antigas.")
                    }
                    titulo={
                      searchQuery
                        ? t("Nenhuma conversa encontrada para “{busca}”.", { busca: searchQuery })
                        : situacaoPedida
                          ? t("Ninguém esperando resposta.")
                          : t("Não há conversas com mensagens neste período.")
                    }
                  />
                }
              />
            </>
          }
        />
      )}
    </section>
  );
}
