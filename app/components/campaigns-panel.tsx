import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { Dica, GrupoMetricas, SeccaoTitulo } from "@/app/components/painel-ui";
import type { CampanhaResumo, PainelCampanhas } from "@/lib/campaigns/read";
import { getTimezoneLabel } from "@/lib/clientes/timezone";
import { dashboardPeriodOptions } from "@/lib/dashboard/date-range";

/**
 * Corpo do painel de campanhas, partilhado pelo ecrã do cliente
 * (`/app/campanhas`) e pelo do administrador (`/admin/campanhas`).
 *
 * O que muda entre os dois é só a moldura: o `basePath` dos links de período e
 * o selector de cliente que o admin tem a mais (`leading`). Os números e os
 * gráficos são os mesmos, e é por isso que vivem aqui — duas cópias
 * divergiriam na primeira correcção.
 */

export function formatCampanhasMoney(value: number, moeda: string) {
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
  const [, mes, diaDoMes] = dia.split("-");

  return `${diaDoMes}/${mes}`;
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
    return (
      <p className="text-sm text-muted-foreground">
        Sem gasto registado no período.
      </p>
    );
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
              className="w-full rounded-t-[3px] bg-foreground/85 transition group-hover:bg-primary"
              style={{
                height: `${Math.max((dia.gasto / maxGasto) * 100, dia.gasto > 0 ? 2 : 0)}%`,
              }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg bg-primary px-2.5 py-1.5 text-center text-[11px] whitespace-nowrap text-primary-foreground group-hover:block">
              <p className="font-semibold">{formatDayLabel(dia.dia)}</p>
              <p>{formatCampanhasMoney(dia.gasto, moeda)}</p>
              <p className="text-muted-foreground/60">
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
              <p className="text-center text-[10px] whitespace-nowrap text-muted-foreground">
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
    return (
      <p className="text-sm text-muted-foreground">
        Sem campanhas com gasto no período.
      </p>
    );
  }

  const maxGasto = Math.max(
    ...campanhas.map((campanha) => campanha.gasto),
    0.01,
  );

  return (
    <div className="space-y-4">
      {campanhas.map((campanha) => (
        <div key={campanha.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-foreground">
              {campanha.nome}
            </span>
            <span className="shrink-0 font-semibold text-foreground">
              {formatCampanhasMoney(campanha.gasto, moeda)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{
                width: `${Math.max((campanha.gasto / maxGasto) * 100, 2)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(campanha.cliques)} cliques ·{" "}
            {formatNumber(campanha.impressoes)} impressões
            {campanha.estado ? ` · ${campanha.estado.toLowerCase()}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

export function CampaignsPanel({
  basePath,
  fim,
  inicio,
  leading,
  painel,
  parametrosFixos,
  periodKey,
  rangeLabel,
  timezone,
  vazioMensagem,
}: {
  basePath: string;
  /** Dia final do período, para o formulário de datas personalizadas. */
  fim: string;
  inicio: string;
  /** Selector de cliente; só o admin o usa. */
  leading?: ReactNode;
  painel: PainelCampanhas;
  /** Parâmetros a preservar ao trocar de período (ex.: `cliente`). */
  parametrosFixos?: Record<string, string>;
  periodKey: string;
  rangeLabel: string;
  timezone: string;
  vazioMensagem: string;
}) {
  const entradasFixas = Object.entries(parametrosFixos ?? {});
  const hrefPeriodo = (periodo: string) => {
    const query = new URLSearchParams([...entradasFixas, ["periodo", periodo]]);

    return `${basePath}?${query.toString()}`;
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-surface/90 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-col gap-3">
            {leading}
            <div>
              <SeccaoTitulo sufixo={rangeLabel}>Período</SeccaoTitulo>
              <p className="mt-1 text-xs text-muted-foreground">
                {getTimezoneLabel(timezone)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboardPeriodOptions.map((option) => {
              const isActive = option.key === periodKey;

              return (
                <Link
                  className={`inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    isActive
                      ? "border-foreground bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:bg-surface-muted"
                  }`}
                  href={hrefPeriodo(option.key)}
                  key={option.key}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        {periodKey === "personalizado" ? (
          <Form
            action={basePath}
            className="mt-4 flex flex-wrap items-end gap-3"
            replace
            scroll={false}
          >
            {entradasFixas.map(([nome, valor]) => (
              <input key={nome} name={nome} type="hidden" value={valor} />
            ))}
            <input name="periodo" type="hidden" value="personalizado" />
            <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
              Início
              <input
                className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
                defaultValue={inicio}
                name="inicio"
                type="date"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
              Fim
              <input
                className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
                defaultValue={fim}
                name="fim"
                type="date"
              />
            </label>
            <FormSubmitButton
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              pendingLabel="Aplicando..."
            >
              Aplicar
            </FormSubmitButton>
          </Form>
        ) : null}
      </div>

      {painel.temDados ? (
        <>
          <div className="flex flex-col gap-3">
            <SeccaoTitulo sufixo="no período">Investimento</SeccaoTitulo>
            <GrupoMetricas
              itens={[
                {
                  dica: "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.",
                  label: "Investido",
                  valor: formatCampanhasMoney(painel.gasto, painel.moeda),
                },
                {
                  dica: "Pessoas que entraram em contacto no período, por qualquer via — não só por anúncio.",
                  label: "Contactos novos",
                  valor: formatNumber(painel.contactosNovos),
                },
                {
                  dica: "Investido a dividir pelos contactos novos. É um limite superior do custo real por lead de anúncio.",
                  label: "Custo por contacto",
                  valor:
                    painel.custoPorContacto === null
                      ? null
                      : formatCampanhasMoney(
                          painel.custoPorContacto,
                          painel.moeda,
                        ),
                },
                {
                  dica: "Cliques em qualquer parte do anúncio.",
                  label: "Cliques",
                  nota: `${formatNumber(painel.cliquesLink)} no link`,
                  valor: formatNumber(painel.cliques),
                },
              ]}
            />
          </div>

          <div className="flex flex-col gap-3">
            <SeccaoTitulo sufixo="no período">Entrega</SeccaoTitulo>
            <GrupoMetricas
              itens={[
                {
                  dica: "Impressões servidas no período. Uma pessoa pode ver o anúncio várias vezes.",
                  label: "Impressões",
                  valor: formatNumber(painel.impressoes),
                },
                {
                  dica: "Custo por mil impressões, recalculado do total do período.",
                  label: "CPM",
                  valor:
                    painel.cpm === null
                      ? null
                      : formatCampanhasMoney(painel.cpm, painel.moeda),
                },
                {
                  dica: "Cliques a dividir pelas impressões, recalculado do total do período.",
                  label: "CTR",
                  valor:
                    painel.ctr === null ? null : `${painel.ctr.toFixed(2)}%`,
                },
              ]}
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="mb-5 flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-foreground">
                Gasto por dia
              </h2>
              <Dica texto="Passa o rato numa barra para ver o gasto e os contactos daquele dia." />
            </div>
            <DailySpendChart dias={painel.diario} moeda={painel.moeda} />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="mb-5 text-sm font-semibold text-foreground">
              Gasto por campanha
              <span className="ml-1.5 font-normal text-muted-foreground">
                por investimento
              </span>
            </h2>
            <CampaignRanking
              campanhas={painel.porCampanha}
              moeda={painel.moeda}
            />
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
            <p className="text-sm font-semibold text-amber-900">
              Porque não existe &quot;custo por mensagem&quot; por campanha
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-900/90">
              A Meta não devolve conversas iniciadas nesta conta: os conjuntos
              que optimizam conversas enviam as pessoas para o Instagram Direct,
              que não identifica o anúncio de origem. Por isso o custo acima é
              calculado sobre <strong>todos</strong> os contactos novos, e não
              só sobre os que vieram de anúncio — serve para comparar períodos,
              não para afirmar o custo exacto de um lead pago.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="text-lg font-semibold text-foreground">
            Ainda não há dados de campanhas
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {vazioMensagem}
          </p>
        </div>
      )}
    </>
  );
}
