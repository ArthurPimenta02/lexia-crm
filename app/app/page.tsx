import {
  ArrowUpRight,
  Bot,
  CalendarCheck,
  Inbox,
  MessageCircleReply,
  MessagesSquare,
  MoonStar,
  PlugZap,
  Send,
  RotateCcw,
  Timer,
  UserPlus,
  Percent,
} from "lucide-react";
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
  Ranking,
} from "@/app/components/painel-ui";
import { CartaoMetrica, LinhaLista, separarUnidade } from "@/app/components/cartoes";
import { ChannelIcon } from "@/app/components/channel-brand";
import { GraficoArea, GraficoBarras, MapaDeCalor } from "@/app/components/graficos";
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
import {
  baldesDoPeriodo,
  conversasEsperando,
  conversasPorBalde,
  datasPorBalde,
  periodoAteAgora,
  saudacaoDaHora,
} from "@/lib/dashboard/series";
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
  const nomeClientePromise = supabase
    .from("lexia_clientes")
    .select("nome")
    .eq("slug", profile.cliente_slug)
    .maybeSingle();
  const [
    contactsResult,
    externalMetrics,
    startedConversationsResult,
    nomeClienteResult,
  ] = await Promise.all([
    contactsPromise,
    externalMetricsPromise,
    startedConversationsPromise,
    nomeClientePromise,
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

  const nomeCliente =
    (nomeClienteResult.data as { nome?: string | null } | null)?.nome ??
    profile.cliente_slug;
  const porHora = range.key === "hoje";
  // O gráfico pára em agora: os dias que ainda não chegaram são zeros que
  // achatam a linha e não dizem nada.
  const baldes = baldesDoPeriodo(periodoAteAgora(range), timezone, porHora);
  const formatoBalde = new Intl.DateTimeFormat(
    locale,
    porHora
      ? { hour: "2-digit", minute: "2-digit", timeZone: timezone }
      : { day: "2-digit", month: "short", timeZone: timezone },
  );
  const rotulosBaldes = baldes.map((b) =>
    formatoBalde.format(b.inicio).replace(/\.$/, ""),
  );
  const serieConversas = conversasPorBalde(messages, baldes, timezone, porHora);
  const serieAgendamentos = datasPorBalde(
    externalMetrics.appointmentDates,
    baldes,
    timezone,
    porHora,
  );
  const esperando = conversasEsperando(messages);
  const saudacao = t(saudacaoDaHora(timezone));
  const diasDoMapa: [string, string][] = [
    "Seg",
    "Ter",
    "Qua",
    "Qui",
    "Sex",
    "Sáb",
    "Dom",
  ].map((d) => [d, t(d)]);
  const numero = new Intl.NumberFormat(locale);
  const metricasTopo = [
    {
      dica: t(
        "Conversas em que a primeira mensagem do cliente caiu dentro do período escolhido.",
      ),
      cor: "var(--ds-acao)",
      faisca: serieConversas,
      href: "/app/conversas",
      icone: <MessagesSquare aria-hidden="true" className="h-4 w-4" />,
      label: t("Conversas iniciadas"),
      nota: t("{n} conversas ativas", { n: numero.format(activeConversations) }),
      valor: numero.format(startedConversations),
    },
    {
      dica: t(
        "Agendamentos válidos criados no período, conforme o estado usado por este cliente.",
      ),
      cor: "var(--ds-destaque)",
      faisca: externalMetrics.isConfigured ? serieAgendamentos : undefined,
      href: "/app/agenda",
      icone: <CalendarCheck aria-hidden="true" className="h-4 w-4" />,
      label: t("Agendamentos"),
      nota:
        conversionRate === null
          ? undefined
          : t("{taxa} das conversas", { taxa: conversionRate }),
      valor:
        externalMetrics.appointments === null
          ? "--"
          : numero.format(externalMetrics.appointments),
    },
    {
      dica: t(
        "Tempo médio até a primeira resposta automática, nas conversas iniciadas no período em que essa resposta chegou em menos de uma hora.",
      ),
      cor: "var(--info)",
      faisca: undefined,
      href: undefined,
      icone: <Timer aria-hidden="true" className="h-4 w-4" />,
      label: t("Primeira resposta"),
      nota: t("{n} conversas", { n: firstResponse.samples }),
      valor: formatSeconds(firstResponse.averageSeconds, locale),
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
      cor: "var(--ds-ouro)",
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
    <section className="flex w-full flex-col gap-6">
      <header className="ds-entrar flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="ds-sobretitulo truncate">
            {nomeCliente} {"//"} {t("visão geral")}
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
            {formatPeriodLabel(range, timezone, locale)} ·{" "}
            {t(getTimezoneLabel(timezone))}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
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
                  href={`/app?periodo=${option.key}`}
                  key={option.key}
                  prefetch
                >
                  {t(option.label)}
                </Link>
              ))}
            </nav>
            <Link className="ds-botao ds-botao-primario ds-botao-p" href="/app/conversas">
              {t("Conversas")}
              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
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
                className="ds-campo w-auto"
                defaultValue={
                  customStart || getDateInputValue(range.start, timezone)
                }
                name="inicio"
                type="date"
              />
              <input
                aria-label={t("Fim")}
                className="ds-campo w-auto"
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {metricasTopo.map((m, i) => {
          const { unidade, valor } = separarUnidade(m.valor);
          return (
            <div className="ds-entrar min-w-0" key={m.label} style={{ ["--i" as string]: i + 1 }}>
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
        <div className="ds-bloco ds-entrar min-w-0 p-5" style={{ ["--i" as string]: 5 }}>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="ds-titulo-3 text-foreground">{t("Conversas e agendamentos")}</h2>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="ds-valor text-[1.75rem] text-foreground">
                  {numero.format(serieConversas.reduce((a, b) => a + b, 0))}
                  <small>{t("conversas")}</small>
                </span>
                {externalMetrics.isConfigured ? (
                  <span className="ds-valor text-[1.75rem] text-accent">
                    {numero.format(serieAgendamentos.reduce((a, b) => a + b, 0))}
                    <small>{t("agendamentos")}</small>
                  </span>
                ) : null}
              </p>
              <p className="ds-legenda mt-1">
                {porHora ? t("Por hora, hoje") : t("Por dia, no período")}
              </p>
            </div>
            <span className="ds-selo ds-selo-neutro shrink-0">{t(getTimezoneLabel(timezone))}</span>
          </div>
          <GraficoArea
            rotulos={rotulosBaldes}
            series={[
              { nome: t("Conversas"), valores: serieConversas },
              ...(externalMetrics.isConfigured
                ? [{ nome: t("Agendamentos"), tracejada: true, valores: serieAgendamentos }]
                : []),
            ]}
            vazio={t("Sem conversas no período.")}
          />
        </div>

        <div className="ds-bloco ds-entrar min-w-0 p-5" style={{ ["--i" as string]: 6 }}>
          <div className="mb-4">
            <h2 className="ds-titulo-3 text-foreground">{t("Canal")}</h2>
            <p className="ds-legenda mt-0.5">{t("De onde vem cada conversa")}</p>
          </div>
          <GraficoBarras
            itens={[
              { icone: <ChannelIcon channel="whatsapp" size="sm" />, rotulo: "WhatsApp", valor: channelCounts.whatsapp },
              { icone: <ChannelIcon channel="instagram" size="sm" />, rotulo: "Instagram", valor: channelCounts.instagram },
              { icone: <ChannelIcon channel="messenger" size="sm" />, rotulo: "Messenger", valor: channelCounts.messenger },
              ...(channelCounts.unknown > 0
                ? [{ rotulo: t("Sem canal"), valor: channelCounts.unknown }]
                : []),
            ]}
            vazio={t("Sem conversas por canal no período.")}
          />
        </div>
      </div>

      <CampaignsDashboardStrip
        acaoAtualizar={atualizarCampanhasAction}
        clienteSlug={profile.cliente_slug}
        conversasIniciadas={startedConversations}
        hrefCampanhas="/app/campanhas"
        range={{ end: range.end, start: range.start }}
        timezone={timezone}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitulo>{t("Volume no período")}</CardTitulo>
          <div className="ds-lista pb-1.5">
            <LinhaLista
              cor="var(--ds-acao)"
              icone={<MessagesSquare aria-hidden="true" className="h-4 w-4" />}
              dica={t(
                "Conversas com pelo menos uma mensagem recebida ou enviada no período, mesmo que tenham começado antes.",
              )}
              rotulo={t("Conversas ativas")}
              valor={activeConversations}
            />
            <LinhaLista
              cor="var(--info)"
              icone={<Inbox aria-hidden="true" className="h-4 w-4" />}
              dica={t("Mensagens que os clientes finais enviaram.")}
              rotulo={t("Mensagens recebidas")}
              valor={receivedMessages}
            />
            <LinhaLista
              cor="var(--ds-destaque)"
              icone={<Send aria-hidden="true" className="h-4 w-4" />}
              dica={t("Todas as mensagens enviadas: agente, equipe e follow-ups.")}
              rotulo={t("Mensagens enviadas")}
              valor={sentMessages}
            />
            <LinhaLista
              cor="var(--ds-ouro)"
              icone={<UserPlus aria-hidden="true" className="h-4 w-4" />}
              dica={t("Contatos distintos criados pela primeira vez no período.")}
              rotulo={t("Novos contatos")}
              valor={newContacts}
            />
          </div>
        </Card>

        <Card>
          <CardTitulo>{t("Qualidade do atendimento")}</CardTitulo>
          <div className="ds-lista pb-1.5">
            <LinhaLista
              cor="var(--ds-destaque)"
              icone={<Percent aria-hidden="true" className="h-4 w-4" />}
              dica={t(
                "Agendamentos divididos pelas conversas iniciadas no mesmo período. Não é atribuição individual: não diz que foi aquela conversa que gerou aquele agendamento.",
              )}
              rotulo={t("Agendam. / conversa")}
              nota={
                externalMetrics.appointments === null
                  ? undefined
                  : t("{agendamentos} para {conversas} conversas", {
                      agendamentos: externalMetrics.appointments,
                      conversas: startedConversations,
                    })
              }
              valor={conversionRate ?? "--"}
            />
            <LinhaLista
              cor="var(--info)"
              icone={<MoonStar aria-hidden="true" className="h-4 w-4" />}
              dica={t(
                "Respostas do agente fora de 9h-19h ou no fim de semana. É o que o agente cobre e uma pessoa não cobriria.",
              )}
              rotulo={t("Fora do horário")}
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
            <LinhaLista
              cor="var(--ds-acao)"
              icone={<MessageCircleReply aria-hidden="true" className="h-4 w-4" />}
              dica={t(
                "Mensagens automáticas de retomada efetivamente registradas no período.",
              )}
              rotulo={t("Follow-ups enviados")}
              valor={followupsSent}
            />
            <LinhaLista
              cor="var(--ds-ouro)"
              icone={<RotateCcw aria-hidden="true" className="h-4 w-4" />}
              dica={t(
                "Das conversas que receberam follow-up rápido, quantas voltaram a responder.",
              )}
              rotulo={t("Recuperação por follow-up")}
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

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="ds-bloco min-w-0 p-5">
          <div className="mb-4 flex items-center gap-1.5">
            <h2 className="ds-titulo-3 text-foreground">{t("Horários de pico")}</h2>
            <Dica
              texto={t(
                "Mensagens recebidas por dia da semana e hora, no fuso do cliente. Quanto mais escuro, mais movimento.",
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
          <Ranking
            itens={externalMetrics.services}
            vazio={t("Sem agendamentos no período.")}
          />
        </div>
      </div>

      {!externalMetrics.isConfigured ? (
        <div className="flex items-start gap-3 rounded-[20px] border border-border bg-surface-muted px-5 py-4">
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
