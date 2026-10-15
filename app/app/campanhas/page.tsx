import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getPainelCampanhas, type CampanhaResumo } from "@/lib/campaigns/read";
import {
  dashboardPeriodOptions,
  getDateInputValue,
  getDateRange,
  getInclusiveRangeEnd,
  getSearchValue,
} from "@/lib/dashboard/date-range";
import { getClientTimezone } from "@/lib/metrics/external-client-metrics";

import { RefreshButton } from "./refresh-button";

type CampanhasPageProps = {
  searchParams: Promise<{
    fim?: string | string[];
    inicio?: string | string[];
    periodo?: string | string[];
  }>;
};

function getTimezoneLabel(timeZone: string) {
  if (timeZone === "America/New_York") {
    return "Nova Iorque";
  }

  if (timeZone === "Europe/Lisbon") {
    return "Lisboa";
  }

  return "Brasília";
}

function formatMoney(value: number, moeda: string) {
  return new Intl.NumberFormat("pt-PT", {
    currency: moeda,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-PT").format(value);
}

function formatDayLabel(dia: string) {
  const [, mes, dey] = dia.split("-");

  return `${dey}/${mes}`;
}

function MetricCard({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

/**
 * Barras do gasto diário, desenhadas com `div`s como o resto do painel.
 * Não há biblioteca de gráficos no projecto e não se acrescenta uma por isto.
 */
function DailySpendChart({
  dias,
  moeda,
}: {
  dias: { contactos: number; dia: string; gasto: number }[];
  moeda: string;
}) {
  if (dias.length === 0) {
    return <p className="text-sm text-zinc-600">Sem gasto registado no período.</p>;
  }

  const maxGasto = Math.max(...dias.map((dia) => dia.gasto), 0.01);
  // Com muitos dias os rótulos sobrepõem-se; mostrar um a cada N mantém-nos
  // legíveis sem cortar barras do gráfico.
  const passoRotulo = Math.ceil(dias.length / 12);

  return (
    <div>
      <div className="flex h-44 items-end gap-[3px]">
        {dias.map((dia) => (
          <div
            className="group relative flex h-full flex-1 items-end"
            key={dia.dia}
          >
            <div
              className="w-full rounded-t-[3px] bg-zinc-950/85 transition group-hover:bg-zinc-950"
              style={{
                height: `${Math.max((dia.gasto / maxGasto) * 100, dia.gasto > 0 ? 2 : 0)}%`,
              }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg bg-zinc-950 px-2.5 py-1.5 text-center text-[11px] whitespace-nowrap text-white group-hover:block">
              <p className="font-semibold">{formatDayLabel(dia.dia)}</p>
              <p>{formatMoney(dia.gasto, moeda)}</p>
              <p className="text-zinc-300">
                {dia.contactos} contacto{dia.contactos === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px]">
        {dias.map((dia, indice) => (
          <div className="flex-1 overflow-hidden" key={dia.dia}>
            {indice % passoRotulo === 0 ? (
              <p className="text-center text-[10px] whitespace-nowrap text-zinc-500">
                {formatDayLabel(dia.dia)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CampaignRanking({
  campanhas,
  moeda,
}: {
  campanhas: CampanhaResumo[];
  moeda: string;
}) {
  if (campanhas.length === 0) {
    return <p className="text-sm text-zinc-600">Sem campanhas com gasto no período.</p>;
  }

  const maxGasto = Math.max(...campanhas.map((campanha) => campanha.gasto), 0.01);

  return (
    <div className="space-y-4">
      {campanhas.map((campanha) => (
        <div key={campanha.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-zinc-800">
              {campanha.nome}
            </span>
            <span className="shrink-0 font-semibold text-zinc-950">
              {formatMoney(campanha.gasto, moeda)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full bg-zinc-950"
              style={{
                width: `${Math.max((campanha.gasto / maxGasto) * 100, 2)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {formatNumber(campanha.cliques)} cliques ·{" "}
            {formatNumber(campanha.impressoes)} impressões
            {campanha.estado ? ` · ${campanha.estado.toLowerCase()}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

export default async function CampanhasPage({ searchParams }: CampanhasPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const clienteSlug = profile.cliente_slug;
  const timezone = getClientTimezone(clienteSlug);
  const params = await searchParams;
  const customStart = getSearchValue(params.inicio);
  const customEnd = getSearchValue(params.fim);
  // Padrão "mes" e não "hoje" como no dashboard: o gasto do dia corrente está
  // sempre incompleto, e abrir a página num número a meio engana.
  const range = getDateRange(
    getSearchValue(params.periodo) || "mes",
    customStart,
    customEnd,
    timezone,
  );

  const inicio = getDateInputValue(range.start, timezone);
  const fim = getDateInputValue(getInclusiveRangeEnd(range.end), timezone);

  const painel = await getPainelCampanhas({
    clienteSlug,
    fim,
    fimIso: range.end.toISOString(),
    inicio,
    inicioIso: range.start.toISOString(),
    timezone,
  });

  const atualizadoEm = painel.atualizadoEm
    ? new Intl.DateTimeFormat("pt-PT", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        timeZone: timezone,
      }).format(new Date(painel.atualizadoEm))
    : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
            Campanhas
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Investimento em anúncios
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-600">
            Gasto e entrega das campanhas da Meta no período seleccionado.
          </p>
        </div>
        <RefreshButton atualizadoEm={atualizadoEm} />
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

              return (
                <Link
                  className={`inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    isActive
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                  href={`/app/campanhas?periodo=${option.key}`}
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
            action="/app/campanhas"
            className="mt-4 flex flex-wrap items-end gap-3"
            replace
            scroll={false}
          >
            <input name="periodo" type="hidden" value="personalizado" />
            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
              Início
              <input
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                defaultValue={customStart || inicio}
                name="inicio"
                type="date"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
              Fim
              <input
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                defaultValue={customEnd || fim}
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

      {painel.temDados ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              description="Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios."
              label="Investido"
              value={formatMoney(painel.gasto, painel.moeda)}
            />
            <MetricCard
              description="Pessoas que entraram em contacto no período, por qualquer via — não só por anúncio."
              label="Contactos novos"
              value={formatNumber(painel.contactosNovos)}
            />
            <MetricCard
              description="Investido a dividir pelos contactos novos. É um limite superior do custo real por lead de anúncio."
              label="Custo por contacto"
              value={
                painel.custoPorContacto === null
                  ? "--"
                  : formatMoney(painel.custoPorContacto, painel.moeda)
              }
            />
            <MetricCard
              description={`Cliques em qualquer parte do anúncio. Os cliques no link foram ${formatNumber(painel.cliquesLink)}.`}
              label="Cliques"
              value={formatNumber(painel.cliques)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              description="Impressões servidas no período. Uma pessoa pode ver o anúncio várias vezes."
              label="Impressões"
              value={formatNumber(painel.impressoes)}
            />
            <MetricCard
              description="Custo por mil impressões, recalculado do total do período."
              label="CPM"
              value={
                painel.cpm === null ? "--" : formatMoney(painel.cpm, painel.moeda)
              }
            />
            <MetricCard
              description="Cliques a dividir pelas impressões, recalculado do total do período."
              label="CTR"
              value={painel.ctr === null ? "--" : `${painel.ctr.toFixed(2)}%`}
            />
          </div>

          <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
            <p className="text-sm font-medium text-zinc-500">Gasto por dia</p>
            <p className="mt-1 mb-5 text-sm text-zinc-600">
              Passa o rato numa barra para ver o gasto e os contactos daquele dia.
            </p>
            <DailySpendChart dias={painel.diario} moeda={painel.moeda} />
          </div>

          <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
            <p className="text-sm font-medium text-zinc-500">Gasto por campanha</p>
            <p className="mt-1 mb-5 text-sm text-zinc-600">
              Ordenado pelo investimento no período.
            </p>
            <CampaignRanking campanhas={painel.porCampanha} moeda={painel.moeda} />
          </div>

          <div className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-5">
            <p className="text-sm font-semibold text-amber-900">
              Porque não existe &quot;custo por mensagem&quot; por campanha
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-900/90">
              A Meta não devolve conversas iniciadas nesta conta: os conjuntos que
              optimizam conversas enviam as pessoas para o Instagram Direct, que não
              identifica o anúncio de origem. Por isso o custo acima é calculado
              sobre <strong>todos</strong> os contactos novos, e não só sobre os que
              vieram de anúncio — serve para comparar períodos, não para afirmar o
              custo exacto de um lead pago.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-8 text-center shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <p className="text-lg font-semibold text-zinc-950">
            Ainda não há dados de campanhas
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
            Carrega em &quot;Atualizar dados&quot; para puxar o histórico da Meta.
            Se continuar vazio, a conta de anúncios ainda não está ligada a esta
            empresa.
          </p>
        </div>
      )}
    </div>
  );
}
