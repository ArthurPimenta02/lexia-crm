import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import {
  dashboardPeriodOptions,
  formatRangeDate,
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
  getUniqueConversationCount,
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

type DashboardPageProps = {
  searchParams: Promise<{
    fim?: string | string[];
    inicio?: string | string[];
    periodo?: string | string[];
  }>;
};

type ContactMetricRow = {
  canal: string | null;
  cliente_slug: string;
  criado_em: string | null;
  id: string;
  identificador_conversa: string;
};

function MetricCard({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: number | string | null;
}) {
  const isPending = value === null || value === "--";

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-4xl font-semibold tracking-tight text-zinc-950">
          {isPending ? "--" : value}
        </p>
        {isPending ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Em breve
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function formatConversionRate(appointments: number | null, conversations: number) {
  if (appointments === null || conversations === 0) {
    return null;
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

function countConversationsByChannel(
  conversationKeys: Set<string>,
  contacts: ContactMetricRow[],
) {
  const contactsByConversation = new Map(
    contacts.map((contact) => [getConversationKey(contact), contact]),
  );
  const counts = {
    instagram: 0,
    messenger: 0,
    unknown: 0,
    whatsapp: 0,
  };

  for (const conversationKey of conversationKeys) {
    const channel = contactsByConversation.get(conversationKey)?.canal;

    if (channel === "instagram" || channel === "messenger" || channel === "whatsapp") {
      counts[channel] += 1;
    } else {
      counts.unknown += 1;
    }
  }

  return counts;
}

function countNewContacts(
  contacts: ContactMetricRow[],
  range: { end: Date; start: Date },
) {
  return new Set(
    contacts
      .filter((contact) => {
        if (!contact.criado_em) {
          return false;
        }

        const createdAt = new Date(contact.criado_em);

        return createdAt >= range.start && createdAt < range.end;
      })
      .map(getConversationKey),
  ).size;
}

function getTimezoneLabel(timeZone: string) {
  if (timeZone === "America/New_York") {
    return "Nova Iorque";
  }

  if (timeZone === "Europe/Lisbon") {
    return "Lisboa";
  }

  return "Brasília";
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
    .slice(0, 8);

  if (peakCells.length === 0) {
    return <p className="text-sm text-zinc-600">Sem mensagens recebidas no período.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

export default async function AppPage({ searchParams }: DashboardPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  if (!profile.cliente_slug) {
    redirect("/login");
  }

  const params = await searchParams;
  const period = getSearchValue(params.periodo);
  const customStart = getSearchValue(params.inicio);
  const customEnd = getSearchValue(params.fim);
  const timezone = getClientTimezone(profile.cliente_slug);
  const range = getDateRange(period, customStart, customEnd, timezone);
  const supabase = await createClient();
  const rangesByClient = new Map([
    [profile.cliente_slug, { end: range.end, start: range.start }],
  ]);
  const messagesPromise = fetchDashboardPeriodMessages(
    supabase,
    [profile.cliente_slug],
    rangesByClient,
  );
  const contactsPromise = fetchAllSupabaseRows<ContactMetricRow>(
    async (from, to) => {
      const result = await supabase
        .from("lexia_contactos")
        .select("id, cliente_slug, identificador_conversa, canal, criado_em")
        .eq("cliente_slug", profile.cliente_slug)
        .not("identificador_conversa", "like", "teste:%")
        .order("criado_em", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      return {
        data: (result.data ?? []) as ContactMetricRow[],
        error: result.error,
      };
    },
  );
  const externalMetricsPromise = getExternalClientMetrics(profile.cliente_slug, {
    end: range.end,
    start: range.start,
  });
  const messagesResult = await messagesPromise;
  const startedConversationsPromise = messagesResult.error
    ? Promise.resolve({ data: new Set<string>(), error: messagesResult.error })
    : findStartedConversationKeys(
        supabase,
        messagesResult.data,
        rangesByClient,
      );
  const [contactsResult, externalMetrics, startedConversationsResult] =
    await Promise.all([
      contactsPromise,
      externalMetricsPromise,
      startedConversationsPromise,
    ]);

  if (
    messagesResult.error ||
    contactsResult.error ||
    startedConversationsResult.error
  ) {
    throw new Error("Não foi possível buscar as métricas do dashboard.");
  }

  const messages = messagesResult.data as DashboardMessageMetricRow[];
  const contacts = (contactsResult.data ?? []) as ContactMetricRow[];
  const startedConversationKeys = startedConversationsResult.data;
  const startedConversations = startedConversationKeys.size;
  const activeConversations = getUniqueConversationCount(messages);
  const channelCounts = countConversationsByChannel(
    startedConversationKeys,
    contacts,
  );
  const newContacts = countNewContacts(contacts, range);
  const receivedMessages = messages.filter(
    (message) => message.direccao === "recebida",
  ).length;
  const sentMessages = messages.filter(
    (message) => message.direccao === "enviada",
  ).length;
  const autonomyMetrics = getAutonomyMetrics(messages, range);
  const followupsSent = getFollowupsSentCount(messages);
  const followupRecovery = getFollowupRecoveryMetrics(messages, range);
  const outOfHours = getOutOfHoursMetrics(messages, timezone);
  const firstResponse = getFirstResponseMetrics(
    messages.filter((message) =>
      startedConversationKeys.has(getConversationKey(message)),
    ),
    range,
  );
  const heatmapCells = getReceivedMessagesHeatmap(messages, timezone);
  const conversionRate = formatConversionRate(
    externalMetrics.appointments,
    startedConversations,
  );

  return (
    <section className="flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.32em] text-zinc-500 uppercase">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Visão geral do agente
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-600">
            Indicadores operacionais do atendimento no período seleccionado.
          </p>
        </div>
        <Link
          className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          href="/app/conversas"
        >
          Ver conversas
        </Link>
      </div>

      <div className="rounded-[22px] border border-zinc-200/80 bg-white/90 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
              Período
            </p>
            <p className="mt-1 text-sm text-zinc-600">{range.label}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Fuso horário: {getTimezoneLabel(timezone)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboardPeriodOptions.map((option) => {
              const isActive = option.key === range.key;
              const href = `/app?periodo=${option.key}`;

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
            action="/app"
            className="mt-4 flex flex-wrap items-end gap-3"
            replace
            scroll={false}
          >
            <input name="periodo" type="hidden" value="personalizado" />
            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
              Início
              <input
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                defaultValue={
                  customStart || getDateInputValue(range.start, timezone)
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
                  getDateInputValue(getInclusiveRangeEnd(range.end), timezone)
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
        <MetricCard
          description="Primeira mensagem recebida de cada conversa dentro do período."
          label="Conversas iniciadas"
          value={startedConversations}
        />
        <MetricCard
          description="Agendamentos válidos criados no período, conforme o estado usado por este cliente."
          label="Agendamentos realizados"
          value={externalMetrics.appointments ?? "--"}
        />
        <MetricCard
          description={
            externalMetrics.appointments === null
              ? "A fonte de agendamentos ainda não está conectada para este cliente."
              : `${externalMetrics.appointments} agendamentos para ${startedConversations} conversas iniciadas no mesmo período; sem atribuição individual.`
          }
          label="Relação com agendamentos"
          value={conversionRate ?? "--"}
        />
        <MetricCard
          description={
            autonomyMetrics.dataAvailable
              ? `${autonomyMetrics.interventionConversations} conversa${
                  autonomyMetrics.interventionConversations === 1 ? "" : "s"
                } com intervenção humana. Dados a partir de ${formatRangeDate(
                  autonomyMetrics.effectiveStart,
                  timezone,
                )}.`
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
        <MetricCard
          description="Mensagens automáticas de retomada efectivamente registadas no período."
          label="Follow-ups enviados"
          value={followupsSent}
        />
        <MetricCard
          description={`${followupRecovery.followupConversations} conversas receberam follow-up rápido e ${followupRecovery.recoveredConversations} voltaram a responder.`}
          label="Recuperação de follow-up rápido"
          value={
            followupRecovery.recoveryRate === null
              ? "--"
              : `${followupRecovery.recoveryRate}%`
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description="Conversas com pelo menos uma mensagem recebida ou enviada no período."
          label="Conversas activas"
          value={activeConversations}
        />
        <MetricCard
          description="Mensagens recebidas dos clientes finais no período."
          label="Mensagens recebidas"
          value={receivedMessages}
        />
        <MetricCard
          description="Todas as mensagens enviadas, incluindo agente, equipa e follow-ups."
          label="Mensagens enviadas"
          value={sentMessages}
        />
        <MetricCard
          description="Contactos distintos criados pela primeira vez no período."
          label="Novos contactos"
          value={newContacts}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description={`${outOfHours.outsideCount} de ${outOfHours.sentCount} respostas do agente fora de 9h-19h ou fim de semana.`}
          label="Atendimento fora do horário"
          value={
            outOfHours.percentage === null ? "--" : `${outOfHours.percentage}%`
          }
        />
        <MetricCard
          description={`${firstResponse.samples} conversas iniciadas com primeira resposta automática em até 1h.`}
          label="Primeira resposta média"
          value={formatSeconds(firstResponse.averageSeconds)}
        />
        <MetricCard
          description={`${externalMetrics.recurringCustomers.recurringCustomers} recorrentes e ${externalMetrics.recurringCustomers.newCustomers} novos com agendamento no período.`}
          label="Clientes recorrentes"
          value={
            externalMetrics.recurringCustomers.percentage === null
              ? "--"
              : `${externalMetrics.recurringCustomers.percentage}%`
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <h2 className="text-lg font-semibold text-zinc-950">
            Conversas iniciadas por canal
          </h2>
          <div className="mt-5 grid gap-3">
            <RankingList
              emptyText="Sem conversas por canal no período."
              items={[
                { label: "WhatsApp", value: channelCounts.whatsapp },
                { label: "Messenger", value: channelCounts.messenger },
                { label: "Instagram", value: channelCounts.instagram },
                { label: "Canal não identificado", value: channelCounts.unknown },
              ].filter((item) => item.value > 0)}
            />
          </div>
        </div>

        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <h2 className="text-lg font-semibold text-zinc-950">
            Serviços mais agendados
          </h2>
          <div className="mt-5">
            <RankingList
              emptyText="Sem agendamentos no período."
              items={externalMetrics.services}
            />
          </div>
        </div>

        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <h2 className="text-lg font-semibold text-zinc-950">
            Agendamentos por dia
          </h2>
          <div className="mt-5">
            <RankingList
              emptyText="Sem agendamentos no período."
              items={externalMetrics.appointmentWeekdays.filter(
                (item) => item.value > 0,
              )}
            />
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
        <h2 className="text-lg font-semibold text-zinc-950">
          Horários de pico
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Mensagens recebidas por dia e hora no fuso do cliente.
        </p>
        <div className="mt-5">
          <MiniHeatmap cells={heatmapCells} />
        </div>
      </div>

      {!externalMetrics.isConfigured ? (
        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <h2 className="text-lg font-semibold text-zinc-950">
            Métricas em preparação
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            As conversas já estão conectadas. Agendamentos e follow-ups entram
            assim que a fonte de métricas do cliente estiver ligada ao painel.
          </p>
        </div>
      ) : null}
    </section>
  );
}
