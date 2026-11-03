import { ArrowUpRight, PlugZap } from "lucide-react";
import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { atualizarCampanhasAction } from "@/app/app/campanhas/actions";
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
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import {
  dashboardPeriodOptions,
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
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";

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

function formatPercent(value: number, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatConversionRate(
  appointments: number | null,
  conversations: number,
  locale: string,
) {
  if (appointments === null || conversations === 0) {
    return null;
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
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app");

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
    locale,
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
            {t("Dashboard")}
          </h1>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {formatPeriodLabel(range, timezone, locale)} ·{" "}
            {t(getTimezoneLabel(timezone))}
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
                    {t(option.label)}
                  </Link>
                );
              })}
            </div>

            <Link
              className="ds-botao ds-botao-secundario shrink-0"
              href="/app/conversas"
            >
              {t("Conversas")}
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
                aria-label={t("Início")}
                className="ds-campo"
                style={{ width: "auto" }}
                defaultValue={
                  customStart || getDateInputValue(range.start, timezone)
                }
                name="inicio"
                type="date"
              />
              <input
                aria-label={t("Fim")}
                className="ds-campo"
                style={{ width: "auto" }}
                defaultValue={
                  customEnd ||
                  getDateInputValue(getInclusiveRangeEnd(range.end), timezone)
                }
                name="fim"
                type="date"
              />
              <FormSubmitButton
                className="ds-botao ds-botao-primario"
                pendingLabel={t("Aplicando...")}
              >
                {t("Aplicar")}
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
        <SeccaoTitulo sufixo={t("no período")}>
          {t("Resultado")}
        </SeccaoTitulo>
        <GrupoMetricas
          itens={[
            {
              dica: t(
                "Conversas em que a primeira mensagem do cliente caiu dentro do período escolhido.",
              ),
              label: t("Conversas iniciadas"),
              valor: startedConversations,
            },
            {
              dica: t(
                "Agendamentos válidos criados no período, conforme o estado usado por este cliente.",
              ),
              label: t("Agendamentos"),
              valor: externalMetrics.appointments ?? "--",
            },
            {
              dica: t(
                "Agendamentos divididos pelas conversas iniciadas no mesmo período. Não é atribuição individual: não diz que foi aquela conversa que gerou aquele agendamento.",
              ),
              label: t("Agendam. / conversa"),
              nota:
                externalMetrics.appointments === null
                  ? undefined
                  : t("{agendamentos} para {conversas} conversas", {
                      agendamentos: externalMetrics.appointments,
                      conversas: startedConversations,
                    }),
              valor: conversionRate ?? "--",
            },
            {
              dica: autonomyMetrics.dataAvailable
                ? t(
                    "Porcentagem de conversas que o agente fechou sozinho. Dados a partir de {data}.",
                    {
                      data: new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                        timeZone: timezone,
                      }).format(autonomyMetrics.effectiveStart),
                    },
                  )
                : t("Dados de autonomia só existem a partir de {data}.", {
                    data: new Intl.DateTimeFormat(locale, {
                      dateStyle: "short",
                      timeZone: "UTC",
                    }).format(new Date(Date.UTC(2026, 7, 1))),
                  }),
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
          ]}
        />
      </div>

      {/*
        Logo depois do resultado, porque é a leitura que lhe falta: as conversas
        iniciadas acima não dizem nada sobre o que custaram. Devolve `null`
        sozinha para quem não tem conta de anúncios ligada.
      */}
      <CampaignsDashboardStrip
        acaoAtualizar={atualizarCampanhasAction}
        clienteSlug={profile.cliente_slug}
        conversasIniciadas={startedConversations}
        hrefCampanhas="/app/campanhas"
        range={{ end: range.end, start: range.start }}
        timezone={timezone}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitulo>{t("Volume no período")}</CardTitulo>
          <div className="divide-y divide-border border-t border-border">
            <LinhaMetrica
              dica={t(
                "Conversas com pelo menos uma mensagem recebida ou enviada no período, mesmo que tenham começado antes.",
              )}
              label={t("Conversas ativas")}
              valor={activeConversations}
            />
            <LinhaMetrica
              dica={t("Mensagens que os clientes finais enviaram.")}
              label={t("Mensagens recebidas")}
              valor={receivedMessages}
            />
            <LinhaMetrica
              dica={t("Todas as mensagens enviadas: agente, equipe e follow-ups.")}
              label={t("Mensagens enviadas")}
              valor={sentMessages}
            />
            <LinhaMetrica
              dica={t("Contatos distintos criados pela primeira vez no período.")}
              label={t("Novos contatos")}
              valor={newContacts}
            />
          </div>
        </Card>

        <Card>
          <CardTitulo>{t("Qualidade do atendimento")}</CardTitulo>
          <div className="divide-y divide-border border-t border-border">
            <LinhaMetrica
              dica={t(
                "Tempo médio até a primeira resposta automática, nas conversas iniciadas no período em que essa resposta chegou em menos de uma hora.",
              )}
              label={t("Primeira resposta")}
              nota={t("{n} conversas", { n: firstResponse.samples })}
              valor={formatSeconds(firstResponse.averageSeconds, locale)}
            />
            <LinhaMetrica
              dica={t(
                "Respostas do agente fora de 9h-19h ou no fim de semana. É o que o agente cobre e uma pessoa não cobriria.",
              )}
              label={t("Fora do horário")}
              nota={t("{fora} de {total} respostas", {
                fora: outOfHours.outsideCount,
                total: outOfHours.sentCount,
              })}
              valor={
                outOfHours.percentage === null
                  ? "--"
                  : formatPercent(outOfHours.percentage, locale)
              }
            />
            <LinhaMetrica
              dica={t(
                "Mensagens automáticas de retomada efetivamente registradas no período.",
              )}
              label={t("Follow-ups enviados")}
              valor={followupsSent}
            />
            <LinhaMetrica
              dica={t(
                "Das conversas que receberam follow-up rápido, quantas voltaram a responder.",
              )}
              label={t("Recuperação por follow-up")}
              nota={t("{voltaram} de {total} voltaram", {
                total: followupRecovery.followupConversations,
                voltaram: followupRecovery.recoveredConversations,
              })}
              valor={
                followupRecovery.recoveryRate === null
                  ? "--"
                  : formatPercent(followupRecovery.recoveryRate, locale)
              }
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("Conversas por canal")}
          </h2>
          <Ranking
            itens={[
              { label: "WhatsApp", value: channelCounts.whatsapp },
              { label: "Messenger", value: channelCounts.messenger },
              { label: "Instagram", value: channelCounts.instagram },
              { label: t("Sem canal"), value: channelCounts.unknown },
            ].filter((item) => item.value > 0)}
            vazio={t("Sem conversas por canal no período.")}
          />
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("Serviços mais agendados")}
          </h2>
          <Ranking
            itens={externalMetrics.services}
            vazio={t("Sem agendamentos no período.")}
          />
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("Agendamentos por dia")}
          </h2>
          <Ranking
            itens={externalMetrics.appointmentWeekdays
              .filter((item) => item.value > 0)
              .map((item) => ({ ...item, label: t(item.label) }))}
            vazio={t("Sem agendamentos no período.")}
          />
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("Horários de pico")}
          </h2>
          <Dica
            texto={t(
              "As oito horas com mais mensagens recebidas, no fuso do cliente.",
            )}
          />
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
            {t(
              "As conversas já estão conectadas. Agendamentos e follow-ups entram assim que a fonte de métricas deste cliente estiver conectada ao painel.",
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}
