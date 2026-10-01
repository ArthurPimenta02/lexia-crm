import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/app/components/form-submit-button";
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
  getClientTimezone,
  getExternalClientMetrics,
} from "@/lib/metrics/external-client-metrics";
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

function formatDate(date: string | null) {
  if (!date) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

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

function StatCard({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[24px] border border-zinc-200/80 bg-white/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function formatConversionRate(appointments: number | null, conversations: number) {
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
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  if (items.length === 0) {
    return <p className="text-sm text-zinc-600">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-zinc-800">{item.label}</span>
            <span className="text-zinc-500">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full bg-zinc-950"
              style={{ width: `${Math.max((item.value / maxValue) * 100, 6)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniHeatmap({
  cells,
}: {
  cells: { day: string; hour: number; value: number }[];
}) {
  const maxValue = Math.max(...cells.map((cell) => cell.value), 1);
  const peakCells = cells
    .filter((cell) => cell.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (peakCells.length === 0) {
    return <p className="text-sm text-zinc-600">Sem mensagens recebidas no período.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {peakCells.map((cell) => (
        <div
          className="rounded-2xl border border-zinc-200 p-3"
          key={`${cell.day}-${cell.hour}`}
          style={{
            backgroundColor: `rgba(24,24,27,${0.04 + (cell.value / maxValue) * 0.14})`,
          }}
        >
          <p className="text-xs font-semibold text-zinc-500">{cell.day}</p>
          <p className="mt-1 text-lg font-semibold text-zinc-950">
            {String(cell.hour).padStart(2, "0")}h
          </p>
          <p className="mt-1 text-xs text-zinc-600">{cell.value} mensagens</p>
        </div>
      ))}
    </div>
  );
}

export default async function AdminDashboard({ searchParams }: AdminDashboardProps) {
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
  const selectedClient = clients.some((client) => client.slug === requestedClient)
    ? requestedClient
    : "";
  const selectedClientSlugs = selectedClient
    ? [selectedClient]
    : clients.map((client) => client.slug);
  const selectedTimezone = selectedClient
    ? getClientTimezone(selectedClient)
    : dashboardTimeZone;
  const range = getDateRange(
    period,
    customStart,
    customEnd,
    selectedTimezone,
  );
  const rangesByClient = new Map(
    selectedClientSlugs.map((clienteSlug) => [
      clienteSlug,
      getDateRange(
        period,
        customStart,
        customEnd,
        getClientTimezone(clienteSlug),
      ),
    ] as const),
  );
  const clientRanges = Array.from(rangesByClient.values());
  const queryStart = new Date(
    clientRanges.length > 0
      ? Math.min(...clientRanges.map((clientRange) => clientRange.start.getTime()))
      : range.start.getTime(),
  );
  const queryEnd = new Date(
    clientRanges.length > 0
      ? Math.max(...clientRanges.map((clientRange) => clientRange.end.getTime()))
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

          contactsQuery = contactsQuery.in(
            "cliente_slug",
            selectedClientSlugs,
          );

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
    selectedClientSlugs.map(async (clienteSlug) => [
      clienteSlug,
      selectedChannel
        ? null
        : await getExternalClientMetrics(
            clienteSlug,
            rangesByClient.get(clienteSlug) ?? range,
          ),
    ] as const),
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
      !selectedChannel || channelConversationKeys.has(getConversationKey(message)),
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
    selectedClientSlugs.map((clienteSlug) => [
      clienteSlug,
      new Set(
        Array.from(startedConversationKeys).filter((key) =>
          key.startsWith(`${clienteSlug}:`),
        ),
      ),
    ] as const),
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
  const outOfHoursEntries = selectedClientSlugs.map((clienteSlug) => [
    clienteSlug,
    getOutOfHoursMetrics(
      messageMetricRows.filter((message) => message.cliente_slug === clienteSlug),
      getClientTimezone(clienteSlug),
    ),
  ] as const);
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

  for (const [clienteSlug, conversationKeys] of startedConversationKeysByClient) {
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
    const startedConversations = startedConversationCounts.get(client.slug) ?? 0;

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
        <div>
          <p className="text-sm font-semibold tracking-[0.32em] text-zinc-500 uppercase">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Visão geral da plataforma
          </h1>
          <p className="mt-2 max-w-3xl text-zinc-600">
            Números reais dos agentes, conversas, agendamentos e problemas
            marcados no período seleccionado.
          </p>
        </div>
        <Link
          className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          href={buildAdminHref("/admin/conversas", {
            cliente: selectedClientLabel,
            canal: selectedChannel,
          })}
        >
          Ver conversas
        </Link>
      </div>

      <div className="rounded-[24px] border border-zinc-200/80 bg-white/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
        <Form
          action="/admin"
          className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
          replace
          scroll={false}
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
            Cliente
            <select
              className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
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

          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
            Canal
            <select
              className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
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
            className="h-11 rounded-md bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800"
            pendingLabel="Aplicando..."
          >
            Aplicar filtros
          </FormSubmitButton>
        </Form>

        <div className="mt-5 flex flex-col gap-4 border-t border-zinc-100 pt-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
              Período
            </p>
            <p className="mt-1 text-sm text-zinc-600">{range.label}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {selectedClient
                ? `Fuso horário: ${selectedTimezone}`
                : "Cada cliente é calculado no respectivo fuso horário."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboardPeriodOptions.map((option) => {
              const isActive = option.key === range.key;
              const href = buildAdminHref("/admin", {
                canal: selectedChannel,
                cliente: selectedClient,
                periodo: option.key,
              });

              return (
                <Link
                  className={`inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    isActive
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
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
            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
              Início
              <input
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                defaultValue={
                  customStart ||
                  getDateInputValue(range.start, selectedTimezone)
                }
                name="inicio"
                type="date"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
              Fim
              <input
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
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
              className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
              pendingLabel="Aplicando..."
            >
              Aplicar
            </FormSubmitButton>
          </Form>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          description="Primeira mensagem recebida de cada conversa dentro do período."
          label="Conversas iniciadas"
          value={totals.conversations}
        />
        <StatCard
          description={
            selectedChannel
              ? "Os agendamentos não possuem canal associado e não podem ser filtrados com segurança."
              : "Agendamentos válidos criados no período, conforme o estado de cada cliente."
          }
          label="Agendamentos realizados"
          value={selectedChannel ? "--" : totals.appointments}
        />
        <StatCard
          description={
            selectedChannel
              ? "Indisponível com filtro de canal, pois os agendamentos não registam essa origem."
              : `${totals.appointments} agendamentos para ${totals.conversations} conversas iniciadas no mesmo período; sem atribuição individual.`
          }
          label="Relação com agendamentos"
          value={totalConversionRate}
        />
        <StatCard
          description={
            autonomyMetrics.dataAvailable
              ? `${autonomyMetrics.interventionConversations} conversa${
                  autonomyMetrics.interventionConversations === 1 ? "" : "s"
                } com intervenção humana. Dados fiáveis a partir de 01/08/2026.`
              : "Dados de autonomia disponíveis a partir de 01/08/2026."
          }
          label="Autonomia do agente"
          value={
            autonomyMetrics.percentage === null
              ? "--"
              : `${autonomyMetrics.percentage}%`
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          description="Mensagens automáticas de retomada efectivamente registadas no período."
          label="Follow-ups enviados"
          value={totals.followups}
        />
        <StatCard
          description={`${followupRecovery.followupConversations} conversas receberam follow-up rápido e ${followupRecovery.recoveredConversations} voltaram a responder.`}
          label="Recuperação de follow-up rápido"
          value={
            followupRecovery.recoveryRate === null
              ? "--"
              : `${followupRecovery.recoveryRate}%`
          }
        />
        <StatCard
          description="Contactos distintos criados pela primeira vez no período."
          label="Novos contactos"
          value={newContactCount}
        />
        <StatCard
          description={`${totalOutOfHoursCount} de ${totalOutOfHoursSent} respostas fora de 9h-19h ou fim de semana.`}
          label="Fora do horário"
          value={
            totalOutOfHoursPercentage === null
              ? "--"
              : `${totalOutOfHoursPercentage}%`
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          description="Conversas com pelo menos uma mensagem recebida ou enviada no período."
          label="Conversas activas"
          value={totals.activeConversations}
        />
        <StatCard
          description={`${firstResponse.samples} conversas iniciadas com primeira resposta automática em até 1h.`}
          label="Primeira resposta média"
          value={formatSeconds(firstResponse.averageSeconds)}
        />
        <StatCard
          description="Feedbacks ainda pendentes de análise."
          label="Feedbacks pendentes"
          value={totals.pendingFeedbacks}
        />
        <StatCard
          description="Mensagens recebidas dos clientes finais."
          label="Mensagens recebidas"
          value={totals.messagesReceived}
        />
        <StatCard
          description="Todas as mensagens enviadas, incluindo agente, equipa e follow-ups."
          label="Mensagens enviadas"
          value={totals.messagesSent}
        />
        <StatCard
          description="Handoffs reais ainda pendentes."
          label="Handoffs pendentes"
          value={totals.handoffs}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-[24px] border border-zinc-200/80 bg-white/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <h2 className="text-lg font-semibold text-zinc-950">
            Conversas iniciadas por canal
          </h2>
          <div className="mt-5">
            <RankingList
              emptyText="Sem conversas por canal no período."
              items={channelRanking}
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-zinc-200/80 bg-white/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <h2 className="text-lg font-semibold text-zinc-950">
            Serviços mais agendados
          </h2>
          <div className="mt-5">
            <RankingList
              emptyText="Sem agendamentos no período."
              items={serviceRanking}
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-zinc-200/80 bg-white/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <h2 className="text-lg font-semibold text-zinc-950">
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

      <div className="rounded-[24px] border border-zinc-200/80 bg-white/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
        <h2 className="text-lg font-semibold text-zinc-950">
          Horários de pico
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Mensagens recebidas por dia e hora. Em visão geral, usa o fuso da
          plataforma; ao filtrar cliente, usa o fuso do cliente.
        </p>
        <div className="mt-5">
          <MiniHeatmap cells={heatmapCells} />
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/95 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-950">
            Clientes no período
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Comparativo de operação por cliente, canal e estado.
          </p>
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1380px] table-fixed border-collapse text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold tracking-[0.08em] text-zinc-500 uppercase">
                <tr>
                  <th className="w-[15%] border-b border-zinc-200 px-4 py-3">
                    Cliente
                  </th>
                  <th className="w-[7%] border-b border-zinc-200 px-4 py-3">
                    Iniciadas
                  </th>
                  <th className="w-[11%] border-b border-zinc-200 px-4 py-3">
                    Canais
                  </th>
                  <th className="w-[8%] border-b border-zinc-200 px-4 py-3">
                    Recebidas
                  </th>
                  <th className="w-[8%] border-b border-zinc-200 px-4 py-3">
                    Enviadas
                  </th>
                  <th className="w-[9%] border-b border-zinc-200 px-4 py-3">
                    Agendamentos
                  </th>
                  <th className="w-[9%] border-b border-zinc-200 px-4 py-3">
                    Relação
                  </th>
                  <th className="w-[9%] border-b border-zinc-200 px-4 py-3">
                    Autonomia
                  </th>
                  <th className="w-[8%] border-b border-zinc-200 px-4 py-3">
                    Follow-ups
                  </th>
                  <th className="w-[9%] border-b border-zinc-200 px-4 py-3">
                    Pendências
                  </th>
                  <th className="w-[7%] border-b border-zinc-200 px-4 py-3">
                    Workflows
                  </th>
                  <th className="w-[7%] border-b border-zinc-200 px-4 py-3">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-zinc-100" key={row.client.slug}>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-zinc-950">
                        {row.client.nome ?? row.client.slug}
                      </p>
                      <p className="mt-1 font-mono text-xs text-zinc-500">
                        {row.client.slug}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {formatLabel(row.client.status)} ·{" "}
                        {row.client.modo_teste ? "Modo teste" : "Produção"}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-2xl font-semibold text-zinc-950">
                        {row.conversations}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {row.activeConversations} activas
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-1.5 text-xs font-medium text-zinc-700">
                        <span>WhatsApp: {row.whatsapp}</span>
                        <span>Messenger: {row.messenger}</span>
                        <span>Instagram: {row.instagram}</span>
                        {row.unknownChannel > 0 ? (
                          <span>Não identificado: {row.unknownChannel}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-700">
                      {row.messagesReceived}
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-700">
                      {row.messagesSent}
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-700">
                      {row.appointments ?? "--"}
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-700">
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="text-base font-semibold text-zinc-950">
                          {row.conversionRate}
                        </span>
                        <span>
                          {row.conversations} → {row.appointments ?? "--"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-700">
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="text-base font-semibold text-zinc-950">
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
                    <td className="px-4 py-4 align-top text-zinc-700">
                      {row.followups ?? "--"}
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-700">
                      <div className="flex flex-col gap-1.5 text-xs font-medium">
                        <span>Feedbacks: {row.pendingFeedbacks}</span>
                        <span>Handoffs: {row.handoffs}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-700">
                      {row.workflows}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-2">
                        <Link
                          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                          href={buildAdminHref("/admin/conversas", {
                            canal: selectedChannel,
                            cliente: row.client.slug,
                          })}
                        >
                          Conversas
                        </Link>
                        <Link
                          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
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
          <div className="px-5 py-10 text-sm text-zinc-600">
            Nenhum cliente encontrado com os filtros actuais.
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-zinc-200/80 bg-white/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Últimas conversas iniciadas
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Amostra recente dentro do período seleccionado.
            </p>
          </div>
          <Link
            className="text-sm font-semibold text-zinc-950 underline-offset-2 hover:underline"
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
                className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 transition hover:border-zinc-300 hover:bg-white"
                href={buildAdminHref("/admin/conversas", {
                  canal: contact.canal ?? "",
                  cliente: contact.cliente_slug,
                  conversa: contact.identificador_conversa,
                })}
                key={`${contact.cliente_slug}-${contact.identificador_conversa}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-950">
                      {contact.nome || contact.telefone || "Sem nome"}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                      {contact.cliente_slug}
                    </p>
                  </div>
                  <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600">
                    {formatLabel(contact.canal)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-zinc-600">
                  {formatDate(contact.criado_em)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-zinc-600">
            Ainda não há conversas reais registadas neste período.
          </p>
        )}
      </div>
    </section>
  );
}
