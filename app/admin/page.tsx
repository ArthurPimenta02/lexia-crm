import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { atualizarCampanhasAdminAction } from "@/app/admin/campanhas/actions";
import { CampaignsDashboardStrip } from "@/app/components/campaigns-dashboard-strip";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import {
  Dica,
  GrupoMetricas,
  HorariosDePico,
  Ranking,
  SeccaoTitulo,
} from "@/app/components/painel-ui";
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
  formatDateInTimezone,
  getClientTimezone,
} from "@/lib/clientes/timezone";
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

function formatLabel(value: string | null) {
  if (!value) {
    return "Sem valor";
  }

  return value.replaceAll("_", " ");
}

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
function formatConversionRate(
  appointments: number | null,
  conversations: number,
) {
  if (appointments === null || conversations === 0) {
    return "--";
  }

  return `${Math.round((appointments / conversations) * 1000) / 10}%`;
}

function formatSeconds(seconds: number | null) {
  if (seconds === null) {
    return "--";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.round(seconds / 6) / 10} min`;
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

function RankingList({
  emptyText,
  items,
}: {
  emptyText: string;
  items: { label: string; value: number }[];
}) {
  return <Ranking itens={items} vazio={emptyText} />;
}

function MiniHeatmap({
  cells,
}: {
  cells: { day: string; hour: number; value: number }[];
}) {
  return <HorariosDePico cells={cells} />;
}

export default async function AdminDashboard({
  searchParams,
}: AdminDashboardProps) {
  const { profile, user } = await getLoggedInUserProfile();

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
  );
  const channelRanking = [
    {
      label: "WhatsApp",
      value: rows.reduce((total, row) => total + row.whatsapp, 0),
    },
    {
      label: "Messenger",
      value: rows.reduce((total, row) => total + row.messenger, 0),
    },
    {
      label: "Instagram",
      value: rows.reduce((total, row) => total + row.instagram, 0),
    },
    {
      label: "Canal não identificado",
      value: rows.reduce((total, row) => total + row.unknownChannel, 0),
    },
  ].filter((item) => item.value > 0);
  const serviceRanking = mergeRankings(rows.map((row) => row.services));
  const weekdayRanking = mergeRankings(rows.map((row) => row.weekdays)).filter(
    (item) => item.value > 0,
  );
  const latestContacts = periodContacts.slice(0, 6);
  const newContactCount = new Set(periodContacts.map(getConversationKey)).size;
  const selectedClientLabel = selectedClient || "";

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Dashboard
          </h1>
        </div>
        <Link
          className="inline-flex h-10 w-fit shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          href={buildAdminHref("/admin/conversas", {
            cliente: selectedClientLabel,
            canal: selectedChannel,
          })}
        >
          Ver conversas
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <Form
          action="/admin"
          className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          replace
          scroll={false}
        >
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            Cliente
            <select
              className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary"
              defaultValue={selectedClient}
              name="cliente"
            >
              <option value="">Todos os clientes</option>
              {clients.map((client) => (
                <option key={client.slug} value={client.slug}>
                  {client.nome ?? client.slug} ({client.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            Canal
            <select
              className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary"
              defaultValue={selectedChannel}
              name="canal"
            >
              {channelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <FormSubmitButton
            className="h-10 shrink-0 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            pendingLabel="Aplicando..."
          >
            Aplicar filtros
          </FormSubmitButton>
        </Form>

        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {range.label}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {selectedClient ? selectedTimezone : "Vários fusos horários"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-border bg-surface-muted p-1">
            {dashboardPeriodOptions.map((option) => {
              const isActive = option.key === range.key;
              const href = buildAdminHref("/admin", {
                canal: selectedChannel,
                cliente: selectedClient,
                periodo: option.key,
              });

              return (
                <Link
                  className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  href={href}
                  key={option.key}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        {range.key === "personalizado" ? (
          <Form
            action="/admin"
            className="mt-4 flex flex-wrap items-end gap-3"
            replace
            scroll={false}
          >
            <input name="periodo" type="hidden" value="personalizado" />
            {selectedClient ? (
              <input name="cliente" type="hidden" value={selectedClient} />
            ) : null}
            {selectedChannel ? (
              <input name="canal" type="hidden" value={selectedChannel} />
            ) : null}
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              Início
              <input
                className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary"
                defaultValue={
                  customStart ||
                  getDateInputValue(range.start, selectedTimezone)
                }
                name="inicio"
                type="date"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              Fim
              <input
                className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary"
                defaultValue={
                  customEnd ||
                  getDateInputValue(
                    getInclusiveRangeEnd(range.end),
                    selectedTimezone,
                  )
                }
                name="fim"
                type="date"
              />
            </label>
            <FormSubmitButton
              className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              pendingLabel="Aplicando..."
            >
              Aplicar
            </FormSubmitButton>
          </Form>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <SeccaoTitulo sufixo="no período">Resultado</SeccaoTitulo>
        <GrupoMetricas
          itens={[
            {
              dica: "Primeira mensagem recebida de cada conversa dentro do período.",
              label: "Conversas iniciadas",
              valor: totals.conversations,
            },
            {
              dica: selectedChannel
                ? "Os agendamentos não possuem canal associado e não podem ser filtrados com segurança."
                : "Agendamentos válidos criados no período, conforme o estado de cada cliente.",
              label: "Agendamentos",
              valor: selectedChannel ? "--" : totals.appointments,
            },
            {
              dica: selectedChannel
                ? "Indisponível com filtro de canal, pois os agendamentos não registam essa origem."
                : "Agendamentos a dividir pelas conversas iniciadas no mesmo período; sem atribuição individual.",
              label: "Agendam. / conversa",
              nota: selectedChannel
                ? undefined
                : `${totals.appointments} para ${totals.conversations} conversas`,
              valor: totalConversionRate,
            },
            {
              dica: autonomyMetrics.dataAvailable
                ? "Conversas resolvidas sem ninguém da equipa escrever. Dados fiáveis a partir de 01/08/2026."
                : "Dados de autonomia disponíveis a partir de 01/08/2026.",
              label: "Autonomia do agente",
              nota: autonomyMetrics.dataAvailable
                ? `${autonomyMetrics.interventionConversations} com intervenção humana`
                : undefined,
              valor:
                autonomyMetrics.percentage === null
                  ? "--"
                  : `${autonomyMetrics.percentage}%`,
            },
          ]}
        />
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
        <SeccaoTitulo sufixo="no período">Captação e retoma</SeccaoTitulo>
        <GrupoMetricas
          itens={[
            {
              dica: "Contactos distintos criados pela primeira vez no período.",
              label: "Novos contactos",
              valor: newContactCount,
            },
            {
              dica: "Mensagens automáticas de retomada efectivamente registadas no período.",
              label: "Follow-ups enviados",
              valor: totals.followups,
            },
            {
              dica: "Conversas que receberam follow-up rápido e voltaram a responder.",
              label: "Recuperação por follow-up",
              nota: `${followupRecovery.recoveredConversations} de ${followupRecovery.followupConversations} voltaram a responder`,
              valor:
                followupRecovery.recoveryRate === null
                  ? "--"
                  : `${followupRecovery.recoveryRate}%`,
            },
            {
              dica: "Respostas enviadas fora de 9h-19h ou ao fim de semana.",
              label: "Fora do horário",
              nota: `${totalOutOfHoursCount} de ${totalOutOfHoursSent} respostas`,
              valor:
                totalOutOfHoursPercentage === null
                  ? "--"
                  : `${totalOutOfHoursPercentage}%`,
            },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SeccaoTitulo sufixo="no período">Atendimento</SeccaoTitulo>
        <GrupoMetricas
          itens={[
            {
              dica: "Conversas com pelo menos uma mensagem recebida ou enviada no período.",
              label: "Conversas activas",
              valor: totals.activeConversations,
            },
            {
              dica: "Tempo até à primeira resposta automática, nas conversas respondidas em menos de 1h.",
              label: "Primeira resposta",
              nota: `${firstResponse.samples} conversas`,
              valor: formatSeconds(firstResponse.averageSeconds),
            },
            {
              dica: "Mensagens recebidas dos clientes finais.",
              label: "Mensagens recebidas",
              valor: totals.messagesReceived,
            },
            {
              dica: "Todas as mensagens enviadas, incluindo agente, equipa e follow-ups.",
              label: "Mensagens enviadas",
              valor: totals.messagesSent,
            },
            {
              dica: "Handoffs reais ainda pendentes.",
              label: "Handoffs pendentes",
              valor: totals.handoffs,
            },
            {
              dica: "Feedbacks ainda pendentes de análise.",
              label: "Feedbacks pendentes",
              valor: totals.pendingFeedbacks,
            },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-semibold text-foreground">
            Conversas iniciadas por canal
          </h2>
          <div className="mt-5">
            <RankingList
              emptyText="Sem conversas por canal no período."
              items={channelRanking}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-semibold text-foreground">
            Serviços mais agendados
          </h2>
          <div className="mt-5">
            <RankingList
              emptyText="Sem agendamentos no período."
              items={serviceRanking}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-semibold text-foreground">
            Agendamentos por dia
          </h2>
          <div className="mt-5">
            <RankingList
              emptyText="Sem agendamentos no período."
              items={weekdayRanking}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-foreground">
            Horários de pico
          </h2>
          <Dica texto="Mensagens recebidas por dia e hora. Em visão geral usa o fuso da plataforma; ao filtrar cliente, o fuso do cliente." />
        </div>
        <div className="mt-5">
          <MiniHeatmap cells={heatmapCells} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            Clientes no período
          </h2>
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1380px] table-fixed border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="w-[15%] border-b border-border px-4 py-3">
                    Cliente
                  </th>
                  <th className="w-[7%] border-b border-border px-4 py-3">
                    Iniciadas
                  </th>
                  <th className="w-[11%] border-b border-border px-4 py-3">
                    Canais
                  </th>
                  <th className="w-[8%] border-b border-border px-4 py-3">
                    Recebidas
                  </th>
                  <th className="w-[8%] border-b border-border px-4 py-3">
                    Enviadas
                  </th>
                  <th className="w-[9%] border-b border-border px-4 py-3">
                    Agendamentos
                  </th>
                  <th className="w-[9%] border-b border-border px-4 py-3">
                    Relação
                  </th>
                  <th className="w-[9%] border-b border-border px-4 py-3">
                    Autonomia
                  </th>
                  <th className="w-[8%] border-b border-border px-4 py-3">
                    Follow-ups
                  </th>
                  <th className="w-[9%] border-b border-border px-4 py-3">
                    Pendências
                  </th>
                  <th className="w-[7%] border-b border-border px-4 py-3">
                    Workflows
                  </th>
                  <th className="w-[7%] border-b border-border px-4 py-3">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    className="border-b border-border transition last:border-0 hover:bg-surface-muted"
                    key={row.client.slug}
                  >
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-foreground">
                        {row.client.nome ?? row.client.slug}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {row.client.slug}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatLabel(row.client.status)} ·{" "}
                        {row.client.modo_teste ? "Modo teste" : "Produção"}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-2xl font-semibold text-foreground">
                        {row.conversations}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.activeConversations} activas
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
                        <span>WhatsApp: {row.whatsapp}</span>
                        <span>Messenger: {row.messenger}</span>
                        <span>Instagram: {row.instagram}</span>
                        {row.unknownChannel > 0 ? (
                          <span>Não identificado: {row.unknownChannel}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {row.messagesReceived}
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {row.messagesSent}
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {row.appointments ?? "--"}
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="text-base font-semibold text-foreground">
                          {row.conversionRate}
                        </span>
                        <span>
                          {row.conversations} → {row.appointments ?? "--"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="text-base font-semibold text-foreground">
                          {row.autonomy?.percentage == null
                            ? "--"
                            : `${row.autonomy?.percentage}%`}
                        </span>
                        <span>
                          {row.autonomy?.interventionConversations ?? 0} com
                          intervenção
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {row.followups ?? "--"}
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      <div className="flex flex-col gap-1.5 text-xs font-medium">
                        <span>Feedbacks: {row.pendingFeedbacks}</span>
                        <span>Handoffs: {row.handoffs}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {row.workflows}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-2">
                        <Link
                          className="rounded-2xl border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
                          href={buildAdminHref("/admin/conversas", {
                            canal: selectedChannel,
                            cliente: row.client.slug,
                          })}
                        >
                          Conversas
                        </Link>
                        <Link
                          className="rounded-2xl border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
                          href={`/admin/feedbacks`}
                        >
                          Feedbacks
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-sm text-muted-foreground">
            Nenhum cliente encontrado com os filtros actuais.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Últimas conversas iniciadas
            </h2>
          </div>
          <Link
            className="text-sm font-semibold text-foreground underline-offset-2 hover:underline"
            href={buildAdminHref("/admin/conversas", {
              canal: selectedChannel,
              cliente: selectedClient,
            })}
          >
            Ver todas
          </Link>
        </div>

        {latestContacts.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {latestContacts.map((contact) => (
              <Link
                className="rounded-2xl border border-border bg-surface-muted p-4 transition hover:border-border hover:bg-surface"
                href={buildAdminHref("/admin/conversas", {
                  canal: contact.canal ?? "",
                  cliente: contact.cliente_slug,
                  conversa: contact.identificador_conversa,
                })}
                key={`${contact.cliente_slug}-${contact.identificador_conversa}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {contact.nome || contact.telefone || "Sem nome"}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {contact.cliente_slug}
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {formatLabel(contact.canal)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {formatDateInTimezone(
                    contact.criado_em,
                    getClientTimezone(contact.cliente_slug),
                  )}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            Ainda não há conversas reais registadas neste período.
          </p>
        )}
      </div>
    </section>
  );
}
