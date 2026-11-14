import {
  ArrowUpRight,
  Bot,
  CalendarCheck,
  Hand,
  Inbox,
  MessageCircleReply,
  MessageSquareWarning,
  MessagesSquare,
  MoonStar,
  Percent,
  RotateCcw,
  Send,
  Timer,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { atualizarCampanhasAdminAction } from "@/app/admin/campanhas/actions";
import { CampaignsDashboardStrip } from "@/app/components/campaigns-dashboard-strip";
import { CartaoMetrica, Faisca, LinhaLista, separarUnidade } from "@/app/components/cartoes";
import { ChannelIcon } from "@/app/components/channel-brand";
import { Avatar } from "@/app/components/ds";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { GraficoArea, GraficoBarras, MapaDeCalor } from "@/app/components/graficos";
import { Card, CardTitulo, Dica, Ranking } from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  dashboardPeriodOptions,
  dashboardTimeZone,
  getDateInputValue,
  getDateRange,
  getInclusiveRangeEnd,
  getSearchValue,
} from "@/lib/dashboard/date-range";
import {
  getAutonomyMetrics,
  getConversationKey,
  getFirstResponseMetrics,
  getFollowupRecoveryMetrics,
  getFollowupsSentCount,
  getOutOfHoursMetrics,
  getReceivedMessagesHeatmap,
  getUniqueConversationCountsByClient,
  type DashboardMessageMetricRow,
} from "@/lib/dashboard/operational-metrics";
import {
  fetchDashboardPeriodMessages,
  findStartedConversationKeys,
} from "@/lib/dashboard/message-metrics-data";
import {
  baldesDoPeriodo,
  granularidadeDoPeriodo,
  conversasEsperando,
  conversasPorBalde,
  datasPorBalde,
  periodoAteAgora,
  saudacaoDaHora,
} from "@/lib/dashboard/series";
import { getClientTimezone, getTimezoneLabel } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { getExternalClientMetrics } from "@/lib/metrics/external-client-metrics";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

type AdminDashboardProps = {
  searchParams: Promise<{
    canal?: string | string[];
    cliente?: string | string[];
    fim?: string | string[];
    inicio?: string | string[];
    periodo?: string | string[];
  }>;
};

type Client = {
  id: string;
  modo_teste: boolean | null;
  nome: string | null;
  slug: string;
  status: string | null;
};

type Contact = {
  canal: string | null;
  cliente_slug: string;
  criado_em: string | null;
  id: string;
  identificador_conversa: string;
  nome: string | null;
  telefone: string | null;
  atualizado_em: string | null;
};

type Message = {
  cliente_slug: string;
  criado_em: string | null;
  direccao: string | null;
  id: string;
  identificador_conversa: string;
  origem: string | null;
};

type Feedback = {
  cliente_slug: string;
  criado_em: string | null;
  id: string;
  status: string | null;
};

type Handoff = {
  cliente_slug: string;
  criado_em: string | null;
  id: string;
  status: string | null;
};

type Workflow = {
  cliente_slug: string;
  status: string | null;
};

const channelOptions = [
  { label: "Todos os canais", value: "" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Messenger", value: "messenger" },
  { label: "Instagram", value: "instagram" },
] as const;

const allowedChannels = ["whatsapp", "messenger", "instagram"];

function buildAdminHref(basePath: string, params: Record<string, string>) {
  const urlParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      urlParams.set(key, value);
    }
  }

  const query = urlParams.toString();

  return query ? `${basePath}?${query}` : basePath;
}

function countByClient<T extends { cliente_slug: string }>(
  rows: T[],
  predicate?: (row: T) => boolean,
) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (predicate && !predicate(row)) {
      continue;
    }

    counts.set(row.cliente_slug, (counts.get(row.cliente_slug) ?? 0) + 1);
  }

  return counts;
}

/**
 * O mesmo cartão do painel do cliente, com o nome que esta página já usava.
 *
 * A `description` que era um parágrafo por baixo do número passou a ser a
 * explicação do `?`. São catorze cartões nesta página: catorze parágrafos
 * era mais texto do que dados, e empurrava metade dos números para fora do
 * ecrã.
 */
function formatPercent(value: number, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatConversionRate(
  appointments: number | null,
  conversations: number,
  locale: string,
) {
  if (appointments === null || conversations === 0) {
    return "--";
  }

  return formatPercent(
    Math.round((appointments / conversations) * 1000) / 10,
    locale,
  );
}

function formatSeconds(seconds: number | null, locale: string) {
  if (seconds === null) {
    return "--";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Math.round(seconds / 6) / 10,
  )} min`;
}

/**
 * O rótulo do período no idioma de quem vê. O `range.label` de
 * `lib/dashboard/date-range` vem sempre em pt-BR e é partilhado com o
 * analista, por isso a data volta a ser escrita aqui com o mesmo fuso.
 */
function formatPeriodLabel(
  range: { end: Date; key: string; start: Date },
  timeZone: string,
  locale: string,
) {
  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeZone,
  });

  if (range.key === "hoje") {
    return format.format(range.start);
  }

  return `${format.format(range.start)} - ${format.format(
    getInclusiveRangeEnd(range.end),
  )}`;
}

function mergeRankings(groups: { label: string; value: number }[][]) {
  const counts = new Map<string, number>();

  for (const group of groups) {
    for (const item of group) {
      counts.set(item.label, (counts.get(item.label) ?? 0) + item.value);
    }
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

export default async function AdminDashboard({
  searchParams,
}: AdminDashboardProps) {
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
  const period = getSearchValue(params.periodo);
  const customStart = getSearchValue(params.inicio);
  const customEnd = getSearchValue(params.fim);
  const requestedClient = getSearchValue(params.cliente);
  const requestedChannel = getSearchValue(params.canal);
  const selectedChannel = allowedChannels.includes(requestedChannel)
    ? requestedChannel
    : "";
  const supabase = await createClient();

  const { data: clientsData, error: clientsError } = await supabase
    .from("lexia_clientes")
    .select("id, nome, slug, status, modo_teste")
    .order("nome");

  if (clientsError) {
    throw new Error("Não foi possível buscar os clientes.");
  }

  const clients = (clientsData ?? []) as Client[];
  const selectedClient = clients.some(
    (client) => client.slug === requestedClient,
  )
    ? requestedClient
    : "";
  const selectedClientSlugs = selectedClient
    ? [selectedClient]
    : clients.map((client) => client.slug);
  const selectedTimezone = selectedClient
    ? getClientTimezone(selectedClient)
    : dashboardTimeZone;
  const range = getDateRange(period, customStart, customEnd, selectedTimezone);
  const rangesByClient = new Map(
    selectedClientSlugs.map(
      (clienteSlug) =>
        [
          clienteSlug,
          getDateRange(
            period,
            customStart,
            customEnd,
            getClientTimezone(clienteSlug),
          ),
        ] as const,
    ),
  );
  const clientRanges = Array.from(rangesByClient.values());
  const queryStart = new Date(
    clientRanges.length > 0
      ? Math.min(
          ...clientRanges.map((clientRange) => clientRange.start.getTime()),
        )
      : range.start.getTime(),
  );
  const queryEnd = new Date(
    clientRanges.length > 0
      ? Math.max(
          ...clientRanges.map((clientRange) => clientRange.end.getTime()),
        )
      : range.end.getTime(),
  );
  const isRowInClientRange = (row: {
    cliente_slug: string;
    criado_em: string | null;
  }) => {
    const clientRange = rangesByClient.get(row.cliente_slug);

    if (!clientRange || !row.criado_em) {
      return false;
    }

    const createdAt = new Date(row.criado_em);

    return createdAt >= clientRange.start && createdAt < clientRange.end;
  };

  const contactsPromise =
    selectedClientSlugs.length === 0
      ? Promise.resolve({ data: [] as Contact[], error: null })
      : fetchAllSupabaseRows<Contact>(async (from, to) => {
          let contactsQuery = supabase
            .from("lexia_contactos")
            .select(
              "id, cliente_slug, canal, identificador_conversa, nome, telefone, criado_em, atualizado_em",
            )
            .not("identificador_conversa", "like", "teste:%");

          contactsQuery = contactsQuery.in("cliente_slug", selectedClientSlugs);

          if (selectedChannel) {
            contactsQuery = contactsQuery.eq("canal", selectedChannel);
          }

          const result = await contactsQuery
            .order("criado_em", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to);

          return {
            data: (result.data ?? []) as Contact[],
            error: result.error,
          };
        });
  const messagesPromise = fetchDashboardPeriodMessages(
    supabase,
    selectedClientSlugs,
    rangesByClient,
  );
  const feedbacksPromise =
    selectedClientSlugs.length === 0
      ? Promise.resolve({ data: [] as Feedback[], error: null })
      : fetchAllSupabaseRows<Feedback>(async (from, to) => {
          const feedbackQuery = supabase
            .from("lexia_feedbacks")
            .select("id, cliente_slug, status, criado_em")
            .in("cliente_slug", selectedClientSlugs)
            .gte("criado_em", queryStart.toISOString())
            .lt("criado_em", queryEnd.toISOString());

          const result = await feedbackQuery
            .order("criado_em", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);

          return {
            data: (result.data ?? []) as Feedback[],
            error: result.error,
          };
        });
  const handoffsPromise =
    selectedClientSlugs.length === 0
      ? Promise.resolve({ data: [] as Handoff[], error: null })
      : fetchAllSupabaseRows<Handoff>(async (from, to) => {
          const handoffQuery = supabase
            .from("lexia_handoffs")
            .select("id, cliente_slug, status, criado_em")
            .in("cliente_slug", selectedClientSlugs)
            .gte("criado_em", queryStart.toISOString())
            .lt("criado_em", queryEnd.toISOString());

          const result = await handoffQuery
            .order("criado_em", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);

          return {
            data: (result.data ?? []) as Handoff[],
            error: result.error,
          };
        });
  const workflowsPromise =
    selectedClientSlugs.length === 0
      ? Promise.resolve({ data: [] as Workflow[], error: null })
      : supabase
          .from("lexia_workflows")
          .select("cliente_slug, status")
          .in("cliente_slug", selectedClientSlugs);
  const externalMetricsPromise = Promise.all(
    selectedClientSlugs.map(
      async (clienteSlug) =>
        [
          clienteSlug,
          selectedChannel
            ? null
            : await getExternalClientMetrics(
                clienteSlug,
                rangesByClient.get(clienteSlug) ?? range,
              ),
        ] as const,
    ),
  );
  const [
    contactsResult,
    messagesResult,
    feedbacksResult,
    handoffsResult,
    workflowsResult,
    externalMetricsEntries,
  ] = await Promise.all([
    contactsPromise,
    messagesPromise,
    feedbacksPromise,
    handoffsPromise,
    workflowsPromise,
    externalMetricsPromise,
  ]);

  if (contactsResult.error) {
    throw new Error("Não foi possível buscar as conversas.");
  }

  if (messagesResult.error) {
    throw new Error("Não foi possível buscar as mensagens.");
  }

  if (feedbacksResult.error) {
    throw new Error("Não foi possível buscar os feedbacks.");
  }

  if (handoffsResult.error) {
    throw new Error("Não foi possível buscar os handoffs.");
  }

  if (workflowsResult.error) {
    throw new Error("Não foi possível buscar os workflows.");
  }

  const contacts = contactsResult.data;
  const contactsByConversation = new Map(
    contacts.map((contact) => [getConversationKey(contact), contact]),
  );
  const channelConversationKeys = new Set(contactsByConversation.keys());
  const periodContacts = contacts.filter(isRowInClientRange);
  const messages = (messagesResult.data as Message[]).filter(
    (message) =>
      !selectedChannel ||
      channelConversationKeys.has(getConversationKey(message)),
  );
  const startedConversationsResult = await findStartedConversationKeys(
    supabase,
    messages,
    rangesByClient,
  );

  if (startedConversationsResult.error) {
    throw new Error("Não foi possível identificar as conversas iniciadas.");
  }

  const feedbacks = feedbacksResult.data.filter(isRowInClientRange);
  const handoffs = handoffsResult.data.filter(isRowInClientRange);
  const workflows = (workflowsResult.data ?? []) as Workflow[];
  const externalMetrics = new Map(externalMetricsEntries);

  const messageMetricRows = messages as DashboardMessageMetricRow[];
  const startedConversationKeys = startedConversationsResult.data;
  const startedConversationCounts = new Map<string, number>();

  for (const conversationKey of startedConversationKeys) {
    const separatorIndex = conversationKey.indexOf(":");
    const clienteSlug = conversationKey.slice(0, separatorIndex);

    startedConversationCounts.set(
      clienteSlug,
      (startedConversationCounts.get(clienteSlug) ?? 0) + 1,
    );
  }

  const activeConversationCounts =
    getUniqueConversationCountsByClient(messageMetricRows);
  const startedConversationKeysByClient = new Map(
    selectedClientSlugs.map(
      (clienteSlug) =>
        [
          clienteSlug,
          new Set(
            Array.from(startedConversationKeys).filter((key) =>
              key.startsWith(`${clienteSlug}:`),
            ),
          ),
        ] as const,
    ),
  );
  const autonomyMetricsByClient = new Map(
    selectedClientSlugs.map((clienteSlug) => {
      const clientRange = rangesByClient.get(clienteSlug) ?? range;

      return [
        clienteSlug,
        getAutonomyMetrics(
          messageMetricRows.filter(
            (message) => message.cliente_slug === clienteSlug,
          ),
          clientRange,
        ),
      ] as const;
    }),
  );
  const autonomyValues = Array.from(autonomyMetricsByClient.values());
  const autonomyTotalConversations = autonomyValues.reduce(
    (total, metrics) => total + metrics.totalConversations,
    0,
  );
  const autonomyInterventions = autonomyValues.reduce(
    (total, metrics) => total + metrics.interventionConversations,
    0,
  );
  const autonomyMetrics = {
    dataAvailable: autonomyValues.some((metrics) => metrics.dataAvailable),
    interventionConversations: autonomyInterventions,
    percentage:
      autonomyTotalConversations > 0
        ? Math.round(
            ((autonomyTotalConversations - autonomyInterventions) /
              autonomyTotalConversations) *
              1000,
          ) / 10
        : null,
  };
  const followupRecoveryEntries = selectedClientSlugs.map((clienteSlug) => {
    const clientRange = rangesByClient.get(clienteSlug) ?? range;

    return getFollowupRecoveryMetrics(
      messageMetricRows.filter(
        (message) => message.cliente_slug === clienteSlug,
      ),
      clientRange,
    );
  });
  const totalFollowupConversations = followupRecoveryEntries.reduce(
    (total, metrics) => total + metrics.followupConversations,
    0,
  );
  const totalRecoveredConversations = followupRecoveryEntries.reduce(
    (total, metrics) => total + metrics.recoveredConversations,
    0,
  );
  const followupRecovery = {
    followupConversations: totalFollowupConversations,
    recoveredConversations: totalRecoveredConversations,
    recoveryRate:
      totalFollowupConversations > 0
        ? Math.round(
            (totalRecoveredConversations / totalFollowupConversations) * 1000,
          ) / 10
        : null,
  };
  const firstResponseEntries = selectedClientSlugs.map((clienteSlug) => {
    const clientRange = rangesByClient.get(clienteSlug) ?? range;

    return getFirstResponseMetrics(
      messageMetricRows.filter(
        (message) =>
          message.cliente_slug === clienteSlug &&
          startedConversationKeys.has(getConversationKey(message)),
      ),
      clientRange,
    );
  });
  const firstResponseSamples = firstResponseEntries.reduce(
    (total, metrics) => total + metrics.samples,
    0,
  );
  const firstResponse = {
    averageSeconds:
      firstResponseSamples > 0
        ? Math.round(
            firstResponseEntries.reduce(
              (total, metrics) => total + metrics.totalSeconds,
              0,
            ) / firstResponseSamples,
          )
        : null,
    samples: firstResponseSamples,
  };
  const heatmapCells = getReceivedMessagesHeatmap(
    messageMetricRows,
    selectedTimezone,
  );
  const outOfHoursEntries = selectedClientSlugs.map(
    (clienteSlug) =>
      [
        clienteSlug,
        getOutOfHoursMetrics(
          messageMetricRows.filter(
            (message) => message.cliente_slug === clienteSlug,
          ),
          getClientTimezone(clienteSlug),
        ),
      ] as const,
  );
  const outOfHoursByClient = new Map(outOfHoursEntries);
  const totalOutOfHoursSent = outOfHoursEntries.reduce(
    (total, [, metrics]) => total + metrics.sentCount,
    0,
  );
  const totalOutOfHoursCount = outOfHoursEntries.reduce(
    (total, [, metrics]) => total + metrics.outsideCount,
    0,
  );
  const totalOutOfHoursPercentage =
    totalOutOfHoursSent > 0
      ? Math.round((totalOutOfHoursCount / totalOutOfHoursSent) * 1000) / 10
      : null;
  const whatsappCounts = new Map<string, number>();
  const messengerCounts = new Map<string, number>();
  const instagramCounts = new Map<string, number>();
  const unknownChannelCounts = new Map<string, number>();

  for (const [
    clienteSlug,
    conversationKeys,
  ] of startedConversationKeysByClient) {
    for (const conversationKey of conversationKeys) {
      const channel = contactsByConversation.get(conversationKey)?.canal;
      const target =
        channel === "whatsapp"
          ? whatsappCounts
          : channel === "messenger"
            ? messengerCounts
            : channel === "instagram"
              ? instagramCounts
              : unknownChannelCounts;

      target.set(clienteSlug, (target.get(clienteSlug) ?? 0) + 1);
    }
  }

  const receivedMessageCounts = countByClient(
    messages,
    (message) => message.direccao === "recebida",
  );
  const sentMessageCounts = countByClient(
    messages,
    (message) => message.direccao === "enviada",
  );
  const pendingFeedbackCounts = countByClient(
    feedbacks,
    (feedback) => feedback.status === "pendente",
  );
  const pendingHandoffCounts = countByClient(
    handoffs,
    (handoff) => handoff.status === "pendente",
  );
  const activeWorkflowCounts = countByClient(
    workflows,
    (workflow) => workflow.status === "ativo",
  );

  const visibleClients = clients.filter((client) =>
    selectedClient ? client.slug === selectedClient : true,
  );

  const rows = visibleClients.map((client) => {
    const metrics = externalMetrics.get(client.slug);
    const clientMessages = messageMetricRows.filter(
      (message) => message.cliente_slug === client.slug,
    );
    const startedConversations =
      startedConversationCounts.get(client.slug) ?? 0;

    return {
      appointments: metrics?.appointments ?? null,
      activeConversations: activeConversationCounts.get(client.slug) ?? 0,
      autonomy: autonomyMetricsByClient.get(client.slug) ?? null,
      client,
      conversations: startedConversations,
      conversionRate: formatConversionRate(
        metrics?.appointments ?? null,
        startedConversations,
        locale,
      ),
      followups: getFollowupsSentCount(clientMessages),
      handoffs: pendingHandoffCounts.get(client.slug) ?? 0,
      instagram: instagramCounts.get(client.slug) ?? 0,
      messenger: messengerCounts.get(client.slug) ?? 0,
      messagesReceived: receivedMessageCounts.get(client.slug) ?? 0,
      messagesSent: sentMessageCounts.get(client.slug) ?? 0,
      outOfHours: outOfHoursByClient.get(client.slug) ?? null,
      pendingFeedbacks: pendingFeedbackCounts.get(client.slug) ?? 0,
      services: metrics?.services ?? [],
      unknownChannel: unknownChannelCounts.get(client.slug) ?? 0,
      whatsapp: whatsappCounts.get(client.slug) ?? 0,
      weekdays: metrics?.appointmentWeekdays ?? [],
      workflows: activeWorkflowCounts.get(client.slug) ?? 0,
    };
  });

  const totals = rows.reduce(
    (current, row) => ({
      appointments: current.appointments + (row.appointments ?? 0),
      activeConversations:
        current.activeConversations + row.activeConversations,
      conversations: current.conversations + row.conversations,
      followups: current.followups + row.followups,
      handoffs: current.handoffs + row.handoffs,
      messagesReceived: current.messagesReceived + row.messagesReceived,
      messagesSent: current.messagesSent + row.messagesSent,
      pendingFeedbacks: current.pendingFeedbacks + row.pendingFeedbacks,
    }),
    {
      appointments: 0,
      activeConversations: 0,
      conversations: 0,
      followups: 0,
      handoffs: 0,
      messagesReceived: 0,
      messagesSent: 0,
      pendingFeedbacks: 0,
    },
  );

  const totalConversionRate = formatConversionRate(
    selectedChannel ? null : totals.appointments,
    totals.conversations,
    locale,
  );
  const serviceRanking = mergeRankings(rows.map((row) => row.services));
  const weekdayRanking = mergeRankings(rows.map((row) => row.weekdays))
    .filter((item) => item.value > 0)
    .map((item) => ({ ...item, label: t(item.label) }));
  const latestContacts = periodContacts.slice(0, 6);
  const newContactCount = new Set(periodContacts.map(getConversationKey)).size;
  const selectedClientLabel = selectedClient || "";
  const autonomyStartLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 7, 1)));

  // As séries do gráfico, no mesmo formato do dashboard do cliente. Com
  // todos os clientes, os dias são contados no fuso da plataforma.
  // 13/11: por hora (hoje/ontem), por dia, ou por mês acima de 92 dias (Período total).
  const porHora = granularidadeDoPeriodo(range);
  const baldes = baldesDoPeriodo(periodoAteAgora(range), selectedTimezone, porHora);
  const formatoBalde = new Intl.DateTimeFormat(
    locale,
    porHora === "mes"
      ? { month: "short", timeZone: "UTC", year: "2-digit" }
      : porHora
        ? { hour: "2-digit", minute: "2-digit", timeZone: selectedTimezone }
        : { day: "2-digit", month: "short", timeZone: selectedTimezone },
  );
  const rotulosBaldes = baldes.map((b) =>
    formatoBalde.format(b.inicio).replace(/\.$/, ""),
  );
  const serieConversas = conversasPorBalde(
    messageMetricRows,
    baldes,
    selectedTimezone,
    porHora,
  );
  const temAgendamentos =
    !selectedChannel &&
    visibleClients.some((client) => externalMetrics.get(client.slug)?.isConfigured);
  const serieAgendamentos = datasPorBalde(
    selectedChannel
      ? []
      : visibleClients.flatMap(
          (client) => externalMetrics.get(client.slug)?.appointmentDates ?? [],
        ),
    baldes,
    selectedTimezone,
    porHora,
  );
  // A taxa de cada dia, só para a forma do mini-gráfico.
  const serieTaxa = serieConversas.map((c, i) =>
    c > 0 ? Math.min(100, ((serieAgendamentos[i] ?? 0) / c) * 100) : 0,
  );
  const seriePorCliente = new Map(
    visibleClients.map((client) => [
      client.slug,
      conversasPorBalde(
        messageMetricRows.filter((m) => m.cliente_slug === client.slug),
        baldes,
        selectedTimezone,
        porHora,
      ),
    ]),
  );
  const esperando = conversasEsperando(messageMetricRows);
  const saudacao = t(saudacaoDaHora(selectedTimezone));
  const numero = new Intl.NumberFormat(locale);
  const diasDoMapa: [string, string][] = [
    "Seg",
    "Ter",
    "Qua",
    "Qui",
    "Sex",
    "Sáb",
    "Dom",
  ].map((d) => [d, t(d)]);
  const nomeSelecionado = selectedClient
    ? (clients.find((c) => c.slug === selectedClient)?.nome ?? selectedClient)
    : t("Todos os clientes");
  const totalCanais = {
    instagram: rows.reduce((total, row) => total + row.instagram, 0),
    messenger: rows.reduce((total, row) => total + row.messenger, 0),
    unknown: rows.reduce((total, row) => total + row.unknownChannel, 0),
    whatsapp: rows.reduce((total, row) => total + row.whatsapp, 0),
  };
  const filtrosAtivos = {
    canal: selectedChannel,
    cliente: selectedClient,
  };
  const metricasTopo = [
    {
      cor: "var(--ds-acao)",
      dica: t("Primeira mensagem recebida de cada conversa dentro do período."),
      faisca: serieConversas,
      href: buildAdminHref("/admin/conversas", {
        canal: selectedChannel,
        cliente: selectedClientLabel,
      }),
      icone: <MessagesSquare aria-hidden="true" className="h-4 w-4" />,
      label: t("Conversas iniciadas"),
      nota: t("{n} conversas ativas", {
        n: numero.format(totals.activeConversations),
      }),
      valor: numero.format(totals.conversations),
    },
    {
      cor: "var(--ds-destaque)",
      dica: selectedChannel
        ? t(
            "Os agendamentos não possuem canal associado e não podem ser filtrados com segurança.",
          )
        : t(
            "Agendamentos válidos criados no período, conforme o estado de cada cliente.",
          ),
      faisca: temAgendamentos ? serieAgendamentos : undefined,
      href: undefined,
      icone: <CalendarCheck aria-hidden="true" className="h-4 w-4" />,
      label: t("Agendamentos"),
      nota: undefined,
      valor: selectedChannel ? "--" : numero.format(totals.appointments),
    },
    {
      cor: "var(--ds-destaque)",
      dica: selectedChannel
        ? t(
            "Indisponível com filtro de canal, pois os agendamentos não registram essa origem.",
          )
        : t(
            "Agendamentos divididos pelas conversas iniciadas no mesmo período; sem atribuição individual.",
          ),
      faisca: temAgendamentos ? serieTaxa : undefined,
      href: undefined,
      icone: <Percent aria-hidden="true" className="h-4 w-4" />,
      label: t("Taxa de agendamento"),
      nota: selectedChannel
        ? undefined
        : t("{agendamentos} agendamentos em {conversas} conversas", {
            agendamentos: numero.format(totals.appointments),
            conversas: numero.format(totals.conversations),
          }),
      valor: totalConversionRate,
    },
    {
      cor: "var(--ds-ouro)",
      dica: autonomyMetrics.dataAvailable
        ? t(
            "Conversas resolvidas sem ninguém da equipe escrever. Dados confiáveis a partir de {data}.",
            { data: autonomyStartLabel },
          )
        : t("Dados de autonomia disponíveis a partir de {data}.", {
            data: autonomyStartLabel,
          }),
      faisca: undefined,
      href: undefined,
      icone: <Bot aria-hidden="true" className="h-4 w-4" />,
      label: t("Autonomia do agente"),
      nota: autonomyMetrics.dataAvailable
        ? t("{n} com intervenção humana", {
            n: autonomyMetrics.interventionConversations,
          })
        : undefined,
      valor:
        autonomyMetrics.percentage === null
          ? "--"
          : formatPercent(autonomyMetrics.percentage, locale),
    },
  ];

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <header className="ds-entrar flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="ds-sobretitulo truncate">
            Lexia {"//"} {nomeSelecionado}
          </p>
          <h1 className="ds-titulo-1 mt-2 text-foreground">
            {saudacao}.{" "}
            {esperando === 0 ? (
              <span className="text-muted-foreground">
                {t("Ninguém esperando resposta.")}
              </span>
            ) : (
              <span className="text-accent">
                {esperando === 1
                  ? t("1 conversa esperando resposta.")
                  : t("{n} conversas esperando resposta.", { n: esperando })}
              </span>
            )}
          </h1>
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
            {formatPeriodLabel(range, selectedTimezone, locale)} ·{" "}
            {selectedClient
              ? t(getTimezoneLabel(selectedTimezone))
              : t("Vários fusos horários")}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <nav aria-label={t("Período")} className="ds-trilho max-w-full overflow-x-auto">
            {dashboardPeriodOptions.map((option) => (
              <Link
                aria-current={option.key === range.key ? "page" : undefined}
                className={`inline-flex h-[1.875rem] shrink-0 items-center rounded-[8px] px-3.5 text-[0.8125rem] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] ${
                  option.key === range.key
                    ? "bg-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--border)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                href={buildAdminHref("/admin", { ...filtrosAtivos, periodo: option.key })}
                key={option.key}
                prefetch
              >
                {t(option.label)}
              </Link>
            ))}
          </nav>
          <Link
            className="ds-botao ds-botao-primario ds-botao-p"
            href={buildAdminHref("/admin/conversas", {
              canal: selectedChannel,
              cliente: selectedClientLabel,
            })}
          >
            {t("Conversas")}
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <Form
        action="/admin"
        className="ds-entrar flex flex-wrap items-center gap-2"
        replace
        scroll={false}
        style={{ ["--i" as string]: 1 }}
      >
        {range.key !== "hoje" ? (
          <input name="periodo" type="hidden" value={range.key} />
        ) : null}
        <select
          aria-label={t("Cliente")}
          className="ds-campo h-9 w-full min-w-0 sm:w-auto sm:min-w-[14rem]"
          defaultValue={selectedClient}
          name="cliente"
        >
          <option value="">{t("Todos os clientes")}</option>
          {clients.map((client) => (
            <option key={client.slug} value={client.slug}>
              {client.nome ?? client.slug}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Canal")}
          className="ds-campo h-9 min-w-0 flex-1 sm:flex-none sm:w-auto"
          defaultValue={selectedChannel}
          name="canal"
        >
          {channelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value ? option.label : t(option.label)}
            </option>
          ))}
        </select>
        {range.key === "personalizado" ? (
          <>
            <input
              aria-label={t("Início")}
              className="ds-campo h-9 w-auto"
              defaultValue={
                customStart || getDateInputValue(range.start, selectedTimezone)
              }
              name="inicio"
              type="date"
            />
            <input
              aria-label={t("Fim")}
              className="ds-campo h-9 w-auto"
              defaultValue={
                customEnd ||
                getDateInputValue(getInclusiveRangeEnd(range.end), selectedTimezone)
              }
              name="fim"
              type="date"
            />
          </>
        ) : null}
        <FormSubmitButton
          className="ds-botao ds-botao-secundario ds-botao-p shrink-0"
          pendingLabel={t("Aplicando...")}
        >
          {t("Aplicar filtros")}
        </FormSubmitButton>
      </Form>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {metricasTopo.map((m, i) => {
          const { unidade, valor } = separarUnidade(m.valor);
          return (
            <div className="ds-entrar min-w-0" key={m.label} style={{ ["--i" as string]: i + 2 }}>
              <CartaoMetrica
                cor={m.cor}
                dica={m.dica}
                faisca={m.faisca}
                href={m.href}
                icone={m.icone}
                nota={m.nota}
                rotulo={m.label}
                unidade={unidade}
                valor={valor}
              />
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="ds-bloco ds-entrar min-w-0 p-5" style={{ ["--i" as string]: 6 }}>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="ds-titulo-3 text-foreground">{t("Conversas e agendamentos")}</h2>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="ds-valor text-[1.75rem] text-foreground">
                  {numero.format(serieConversas.reduce((a, b) => a + b, 0))}
                  <small>{t("conversas")}</small>
                </span>
                {temAgendamentos ? (
                  <span className="ds-valor text-[1.75rem] text-accent">
                    {numero.format(serieAgendamentos.reduce((a, b) => a + b, 0))}
                    <small>{t("agendamentos")}</small>
                  </span>
                ) : null}
              </p>
              <p className="ds-legenda mt-1">
                {porHora === "mes" ? t("Por mês, no período") : porHora ? (range.key === "ontem" ? t("Por hora, ontem") : t("Por hora, hoje")) : t("Por dia, no período")}
              </p>
            </div>
            <span className="ds-selo ds-selo-neutro shrink-0">
              {selectedClient
                ? t(getTimezoneLabel(selectedTimezone))
                : t(getTimezoneLabel(dashboardTimeZone))}
            </span>
          </div>
          <GraficoArea
            rotulos={rotulosBaldes}
            series={[
              { nome: t("Conversas"), valores: serieConversas },
              ...(temAgendamentos
                ? [{ nome: t("Agendamentos"), tracejada: true, valores: serieAgendamentos }]
                : []),
            ]}
            vazio={t("Sem conversas no período.")}
          />
        </div>

        <div className="ds-bloco ds-entrar min-w-0 p-5" style={{ ["--i" as string]: 7 }}>
          <div className="mb-4">
            <h2 className="ds-titulo-3 text-foreground">{t("Canal")}</h2>
            <p className="ds-legenda mt-0.5">{t("De onde vem cada conversa")}</p>
          </div>
          <GraficoBarras
            itens={[
              { icone: <ChannelIcon channel="whatsapp" size="sm" />, rotulo: "WhatsApp", valor: totalCanais.whatsapp },
              { icone: <ChannelIcon channel="instagram" size="sm" />, rotulo: "Instagram", valor: totalCanais.instagram },
              { icone: <ChannelIcon channel="messenger" size="sm" />, rotulo: "Messenger", valor: totalCanais.messenger },
              ...(totalCanais.unknown > 0
                ? [{ rotulo: t("Sem canal"), valor: totalCanais.unknown }]
                : []),
            ]}
            vazio={t("Sem conversas por canal no período.")}
          />
        </div>
      </div>

      {/*
        Só com uma empresa escolhida, e sem filtro de canal.

        Sem empresa escolhida haveria várias contas de anúncios e possivelmente
        várias moedas a somar para um total que não quer dizer nada. Com filtro
        de canal, o gasto não acompanha: a Meta cobra por posicionamento, que
        não é o `canal` por onde a conversa entrou, e dividir um gasto inteiro
        por um terço das conversas dava um custo por conversa inflacionado.
      */}
      {selectedClient && !selectedChannel ? (
        <CampaignsDashboardStrip
          acaoAtualizar={atualizarCampanhasAdminAction}
          clienteSlug={selectedClient}
          conversasIniciadas={totals.conversations}
          hrefCampanhas={buildAdminHref("/admin/campanhas", {
            cliente: selectedClient,
            periodo: range.key,
          })}
          range={rangesByClient.get(selectedClient) ?? range}
          slugNoFormulario={selectedClient}
          timezone={selectedTimezone}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="ds-titulo-3 text-foreground">
            {t("Clientes no período")}
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {rows.length}
            </span>
          </h2>
          <Link
            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
            href="/admin/clientes/novo"
          >
            {t("Novo cliente")}
          </Link>
        </div>

        {rows.length > 0 ? (
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {/* Quem teve mais conversas primeiro; empate fica por nome. */}
            {[...rows].sort((a, b) => b.conversations - a.conversations).map((row) => {
              const nome = row.client.nome ?? row.client.slug;
              const pendencias = row.pendingFeedbacks + row.handoffs;
              return (
                <article className="ds-bloco flex min-w-0 flex-col p-4 sm:p-5" key={row.client.slug}>
                  <div className="flex items-start gap-3">
                    <Avatar nome={nome} tamanho={36} />
                    <div className="min-w-0 flex-1">
                      <Link
                        className="block truncate font-semibold text-foreground underline-offset-2 hover:underline"
                        href={buildAdminHref("/admin", {
                          canal: selectedChannel,
                          cliente: row.client.slug,
                          periodo: range.key === "hoje" ? "" : range.key,
                        })}
                      >
                        {nome}
                      </Link>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {row.client.slug}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <p className="ds-valor text-foreground">
                      {numero.format(row.conversations)}
                      <small>{t("conversas")}</small>
                    </p>
                    {(seriePorCliente.get(row.client.slug) ?? []).some((v) => v > 0) ? (
                      <Faisca
                        cor="var(--ds-acao)"
                        valores={seriePorCliente.get(row.client.slug) ?? []}
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("{n} ativas", { n: row.activeConversations })} · WhatsApp{" "}
                    {row.whatsapp} · Instagram {row.instagram} · Messenger{" "}
                    {row.messenger}
                  </p>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
                    <div className="min-w-0">
                      <dt className="truncate text-xs text-muted-foreground">{t("Agendamentos")}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {row.appointments ?? "--"}
                        {row.conversionRate !== "--" ? (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {row.conversionRate}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="truncate text-xs text-muted-foreground">{t("Autonomia")}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {row.autonomy?.percentage == null
                          ? "--"
                          : formatPercent(row.autonomy.percentage, locale)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="truncate text-xs text-muted-foreground">{t("Mensagens")}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {numero.format(row.messagesReceived)}
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}↓ · {numero.format(row.messagesSent)} ↑
                        </span>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="truncate text-xs text-muted-foreground">{t("Follow-ups")}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {row.followups}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    {pendencias > 0 ? (
                      <Link
                        className="ds-selo ds-selo-alerta"
                        href={row.handoffs > 0 ? "/admin/handoffs" : "/admin/feedbacks"}
                      >
                        {t("{n} pendências", { n: pendencias })}
                      </Link>
                    ) : (
                      <span className="ds-selo ds-selo-neutro">{t("Sem pendências")}</span>
                    )}
                    <span className="ds-selo ds-selo-neutro">
                      {row.workflows === 1
                        ? t("1 workflow")
                        : t("{n} workflows", { n: row.workflows })}
                    </span>
                    <Link
                      className="ds-botao ds-botao-secundario ds-botao-p ml-auto"
                      href={buildAdminHref("/admin/conversas", {
                        canal: selectedChannel,
                        cliente: row.client.slug,
                      })}
                    >
                      {t("Conversas")}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ds-bloco px-5 py-10 text-sm text-muted-foreground">
            {t("Nenhum cliente encontrado com os filtros atuais.")}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitulo>{t("Captação e retomada")}</CardTitulo>
          <div className="ds-lista pb-1.5">
            <LinhaLista
              cor="var(--ds-ouro)"
              dica={t("Contatos distintos criados pela primeira vez no período.")}
              icone={<UserPlus aria-hidden="true" className="h-4 w-4" />}
              rotulo={t("Novos contatos")}
              valor={newContactCount}
            />
            <LinhaLista
              cor="var(--ds-acao)"
              dica={t(
                "Mensagens automáticas de retomada efetivamente registradas no período.",
              )}
              icone={<MessageCircleReply aria-hidden="true" className="h-4 w-4" />}
              rotulo={t("Follow-ups enviados")}
              valor={totals.followups}
            />
            <LinhaLista
              cor="var(--ds-destaque)"
              dica={t(
                "Conversas que receberam follow-up rápido e voltaram a responder.",
              )}
              icone={<RotateCcw aria-hidden="true" className="h-4 w-4" />}
              nota={t("{voltaram} de {total} voltaram a responder", {
                total: followupRecovery.followupConversations,
                voltaram: followupRecovery.recoveredConversations,
              })}
              rotulo={t("Recuperação por follow-up")}
              valor={
                followupRecovery.recoveryRate === null
                  ? "--"
                  : formatPercent(followupRecovery.recoveryRate, locale)
              }
            />
            <LinhaLista
              cor="var(--info)"
              dica={t("Respostas enviadas fora de 9h-19h ou no fim de semana.")}
              icone={<MoonStar aria-hidden="true" className="h-4 w-4" />}
              nota={t("{fora} de {total} respostas", {
                fora: totalOutOfHoursCount,
                total: totalOutOfHoursSent,
              })}
              rotulo={t("Fora do horário")}
              valor={
                totalOutOfHoursPercentage === null
                  ? "--"
                  : formatPercent(totalOutOfHoursPercentage, locale)
              }
            />
          </div>
        </Card>

        <Card>
          <CardTitulo>{t("Atendimento")}</CardTitulo>
          <div className="ds-lista pb-1.5">
            <LinhaLista
              cor="var(--info)"
              dica={t(
                "Tempo até a primeira resposta automática, nas conversas respondidas em menos de 1h.",
              )}
              icone={<Timer aria-hidden="true" className="h-4 w-4" />}
              nota={t("{n} conversas", { n: firstResponse.samples })}
              rotulo={t("Primeira resposta")}
              valor={formatSeconds(firstResponse.averageSeconds, locale)}
            />
            <LinhaLista
              cor="var(--info)"
              dica={t("Mensagens recebidas dos clientes finais.")}
              icone={<Inbox aria-hidden="true" className="h-4 w-4" />}
              rotulo={t("Mensagens recebidas")}
              valor={totals.messagesReceived}
            />
            <LinhaLista
              cor="var(--ds-destaque)"
              dica={t(
                "Todas as mensagens enviadas, incluindo agente, equipe e follow-ups.",
              )}
              icone={<Send aria-hidden="true" className="h-4 w-4" />}
              rotulo={t("Mensagens enviadas")}
              valor={totals.messagesSent}
            />
            <Link className="ds-interativo block rounded-none" href="/admin/handoffs">
              <LinhaLista
                cor="var(--warning)"
                dica={t("Handoffs reais ainda pendentes.")}
                icone={<Hand aria-hidden="true" className="h-4 w-4" />}
                rotulo={t("Handoffs pendentes")}
                valor={totals.handoffs}
              />
            </Link>
            <Link className="ds-interativo block rounded-none" href="/admin/feedbacks">
              <LinhaLista
                cor="var(--ds-ouro)"
                dica={t("Feedbacks ainda pendentes de análise.")}
                icone={<MessageSquareWarning aria-hidden="true" className="h-4 w-4" />}
                rotulo={t("Feedbacks pendentes")}
                valor={totals.pendingFeedbacks}
              />
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="ds-bloco min-w-0 p-5">
          <div className="mb-4 flex items-center gap-1.5">
            <h2 className="ds-titulo-3 text-foreground">{t("Horários de pico")}</h2>
            <Dica
              texto={t(
                "Mensagens recebidas por dia e hora. Na visão geral usa o fuso da plataforma; ao filtrar um cliente, o fuso do cliente.",
              )}
            />
          </div>
          <MapaDeCalor
            celulas={heatmapCells}
            dias={diasDoMapa}
            vazio={t("Sem mensagens recebidas no período.")}
          />
        </div>

        <div className="ds-bloco min-w-0 p-5">
          <h2 className="ds-titulo-3 mb-4 text-foreground">
            {t("Serviços mais agendados")}
          </h2>
          <Ranking itens={serviceRanking} vazio={t("Sem agendamentos no período.")} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.65fr]">
        <div className="ds-bloco min-w-0 p-5">
          <h2 className="ds-titulo-3 mb-4 text-foreground">
            {t("Agendamentos por dia")}
          </h2>
          <Ranking itens={weekdayRanking} vazio={t("Sem agendamentos no período.")} />
        </div>

        <Card className="min-w-0">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
            <h2 className="ds-titulo-3 text-foreground">
              {t("Últimas conversas iniciadas")}
            </h2>
            <Link
              className="text-sm font-medium text-accent underline-offset-2 hover:underline"
              href={buildAdminHref("/admin/conversas", {
                canal: selectedChannel,
                cliente: selectedClient,
              })}
            >
              {t("Ver todas")}
            </Link>
          </div>
          {latestContacts.length > 0 ? (
            <div className="ds-lista pb-1.5">
              {latestContacts.map((contact) => {
                const nome = contact.nome || contact.telefone || t("Sem nome");
                return (
                  <Link
                    className="ds-interativo flex min-h-14 items-center gap-3 rounded-none px-4 py-2.5"
                    href={buildAdminHref("/admin/conversas", {
                      canal: contact.canal ?? "",
                      cliente: contact.cliente_slug,
                      conversa: contact.identificador_conversa,
                    })}
                    key={`${contact.cliente_slug}-${contact.identificador_conversa}`}
                  >
                    <Avatar nome={nome} tamanho={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {clients.find((c) => c.slug === contact.cliente_slug)?.nome ??
                          contact.cliente_slug}
                      </p>
                    </div>
                    <ChannelIcon channel={contact.canal} size="sm" />
                    <p className="w-[7.5rem] shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {contact.criado_em
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: getClientTimezone(contact.cliente_slug),
                          }).format(new Date(contact.criado_em))
                        : t("Sem data")}
                    </p>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              {t("Ainda não há conversas reais registradas neste período.")}
            </p>
          )}
        </Card>
      </div>
    </section>
  );
}
