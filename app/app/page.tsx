import { ArrowUpRight, PlugZap } from "lucide-react";
import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { CampaignsDashboardStrip } from "@/app/components/campaigns-dashboard-strip";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import {
  Card,
  CardTitulo,
  Dica,
  GrupoMetricas,
  HorariosDePico,
  LinhaMetrica,
  Ranking,
  SeccaoTitulo,
} from "@/app/components/painel-ui";
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
import { getClientTimezone, getTimezoneLabel } from "@/lib/clientes/timezone";
import { getExternalClientMetrics } from "@/lib/metrics/external-client-metrics";
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

function formatConversionRate(
  appointments: number | null,
  conversations: number,
) {
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

    if (
      channel === "instagram" ||
      channel === "messenger" ||
      channel === "whatsapp"
    ) {
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
  const externalMetricsPromise = getExternalClientMetrics(
    profile.cliente_slug,
    {
      end: range.end,
      start: range.start,
    },
  );
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
    <section className="flex w-full flex-col gap-5">
      {/*
        Título e período na mesma linha. O período deixou de ser um cartão
        com três linhas de texto por cima dos botões: o que ele tem a dizer
        ("1 a 16 de Outubro", "Europa/Lisboa") cabe por baixo dos botões, em
        letra pequena, e o botão escolhido já diz qual é o período.
      */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {range.label} · {getTimezoneLabel(timezone)}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="flex w-full items-center gap-2 overflow-x-auto lg:w-auto">
            <div className="flex shrink-0 gap-1 rounded-xl border border-border bg-surface p-1">
              {dashboardPeriodOptions.map((option) => {
                const isActive = option.key === range.key;

                return (
                  <Link
                    className={`inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    href={`/app?periodo=${option.key}`}
                    key={option.key}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>

            <Link
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-foreground transition hover:bg-muted"
              href="/app/conversas"
            >
              Conversas
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          {range.key === "personalizado" ? (
            <Form
              action="/app"
              className="flex flex-wrap items-end gap-2"
              replace
              scroll={false}
            >
              <input name="periodo" type="hidden" value="personalizado" />
              <input
                aria-label="Início"
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary"
                defaultValue={
                  customStart || getDateInputValue(range.start, timezone)
                }
                name="inicio"
                type="date"
              />
              <input
                aria-label="Fim"
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary"
                defaultValue={
                  customEnd ||
                  getDateInputValue(getInclusiveRangeEnd(range.end), timezone)
                }
                name="fim"
                type="date"
              />
              <FormSubmitButton
                className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                pendingLabel="A aplicar..."
              >
                Aplicar
              </FormSubmitButton>
            </Form>
          ) : null}
        </div>
      </header>

      {/*
        Os quatro números que respondem à pergunta "como é que isto está a
        correr". Os outros oito não desapareceram — desceram para a lista
        logo a seguir, porque eram oito cartões gigantes a disputar a mesma
        atenção que estes quatro.
      */}
      <div className="flex flex-col gap-3">
        <SeccaoTitulo sufixo="no período">Resultado</SeccaoTitulo>
        <GrupoMetricas
          itens={[
            {
              dica: "Conversas em que a primeira mensagem do cliente caiu dentro do período escolhido.",
              label: "Conversas iniciadas",
              valor: startedConversations,
            },
            {
              dica: "Agendamentos válidos criados no período, conforme o estado usado por este cliente.",
              label: "Agendamentos",
              valor: externalMetrics.appointments ?? "--",
            },
            {
              dica: "Agendamentos a dividir por conversas iniciadas no mesmo período. Não é atribuição individual: não diz que foi aquela conversa que gerou aquele agendamento.",
              label: "Agendam. / conversa",
              nota:
                externalMetrics.appointments === null
                  ? undefined
                  : `${externalMetrics.appointments} para ${startedConversations} conversas`,
              valor: conversionRate ?? "--",
            },
            {
              dica: autonomyMetrics.dataAvailable
                ? `Percentagem de conversas que o agente fechou sozinho. Dados a partir de ${formatRangeDate(autonomyMetrics.effectiveStart, timezone)}.`
                : "Dados de autonomia só existem a partir de 01/08/2026.",
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
        Logo depois do resultado, porque é a leitura que lhe falta: as conversas
        iniciadas acima não dizem nada sobre o que custaram. Devolve `null`
        sozinha para quem não tem conta de anúncios ligada.
      */}
      <CampaignsDashboardStrip
        clienteSlug={profile.cliente_slug}
        conversasIniciadas={startedConversations}
        hrefCampanhas="/app/campanhas"
        range={{ end: range.end, start: range.start }}
        timezone={timezone}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitulo>Volume no período</CardTitulo>
          <div className="divide-y divide-border border-t border-border">
            <LinhaMetrica
              dica="Conversas com pelo menos uma mensagem recebida ou enviada no período, mesmo que tenham começado antes."
              label="Conversas activas"
              valor={activeConversations}
            />
            <LinhaMetrica
              dica="Mensagens que os clientes finais enviaram."
              label="Mensagens recebidas"
              valor={receivedMessages}
            />
            <LinhaMetrica
              dica="Todas as mensagens enviadas: agente, equipa e follow-ups."
              label="Mensagens enviadas"
              valor={sentMessages}
            />
            <LinhaMetrica
              dica="Contactos distintos criados pela primeira vez no período."
              label="Novos contactos"
              valor={newContacts}
            />
          </div>
        </Card>

        <Card>
          <CardTitulo>Qualidade do atendimento</CardTitulo>
          <div className="divide-y divide-border border-t border-border">
            <LinhaMetrica
              dica="Tempo médio até à primeira resposta automática, nas conversas iniciadas no período em que essa resposta chegou em menos de uma hora."
              label="Primeira resposta"
              nota={`${firstResponse.samples} conversas`}
              valor={formatSeconds(firstResponse.averageSeconds)}
            />
            <LinhaMetrica
              dica="Respostas do agente fora de 9h-19h ou ao fim-de-semana. É o que o agente cobre e uma pessoa não cobriria."
              label="Fora do horário"
              nota={`${outOfHours.outsideCount} de ${outOfHours.sentCount} respostas`}
              valor={
                outOfHours.percentage === null
                  ? "--"
                  : `${outOfHours.percentage}%`
              }
            />
            <LinhaMetrica
              dica="Mensagens automáticas de retomada efectivamente registadas no período."
              label="Follow-ups enviados"
              valor={followupsSent}
            />
            <LinhaMetrica
              dica="Das conversas que receberam follow-up rápido, quantas voltaram a responder."
              label="Recuperação por follow-up"
              nota={`${followupRecovery.recoveredConversations} de ${followupRecovery.followupConversations} voltaram`}
              valor={
                followupRecovery.recoveryRate === null
                  ? "--"
                  : `${followupRecovery.recoveryRate}%`
              }
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            Conversas por canal
          </h2>
          <Ranking
            itens={[
              { label: "WhatsApp", value: channelCounts.whatsapp },
              { label: "Messenger", value: channelCounts.messenger },
              { label: "Instagram", value: channelCounts.instagram },
              { label: "Sem canal", value: channelCounts.unknown },
            ].filter((item) => item.value > 0)}
            vazio="Sem conversas por canal no período."
          />
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            Serviços mais agendados
          </h2>
          <Ranking
            itens={externalMetrics.services}
            vazio="Sem agendamentos no período."
          />
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            Agendamentos por dia
          </h2>
          <Ranking
            itens={externalMetrics.appointmentWeekdays.filter(
              (item) => item.value > 0,
            )}
            vazio="Sem agendamentos no período."
          />
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-foreground">
            Horários de pico
          </h2>
          <Dica texto="As oito horas com mais mensagens recebidas, no fuso do cliente." />
        </div>
        <HorariosDePico cells={heatmapCells} />
      </Card>

      {!externalMetrics.isConfigured ? (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted px-5 py-4">
          <PlugZap
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
          />
          <p className="text-sm leading-relaxed text-muted-foreground">
            As conversas já estão ligadas. Agendamentos e follow-ups entram
            assim que a fonte de métricas deste cliente estiver ligada ao
            painel.
          </p>
        </div>
      ) : null}
    </section>
  );
}
