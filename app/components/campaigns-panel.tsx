import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { Dica, GrupoMetricas, SeccaoTitulo } from "@/app/components/painel-ui";
import type { CampanhaResumo, PainelCampanhas } from "@/lib/campaigns/read";
import { getTimezoneLabel } from "@/lib/clientes/timezone";
import { dashboardPeriodOptions } from "@/lib/dashboard/date-range";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";

/**
 * Corpo do painel de campanhas, partilhado pelo ecrã do cliente
 * (`/app/campanhas`) e pelo do administrador (`/admin/campanhas`).
 *
 * O que muda entre os dois é só a moldura: o `basePath` dos links de período e
 * o selector de cliente que o admin tem a mais (`leading`). Os números e os
 * gráficos são os mesmos, e é por isso que vivem aqui — duas cópias
 * divergiriam na primeira correcção.
 */

/** A moeda é a da conta de anúncios; o `locale` só muda a forma de escrever. */
export function formatCampanhasMoney(
  value: number,
  moeda: string,
  locale = LOCALE_DO_IDIOMA["pt-PT"],
) {
  return new Intl.NumberFormat(locale, {
    currency: moeda,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
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
  locale,
  moeda,
  t,
}: {
  dias: { contactos: number; dia: string; gasto: number }[];
  locale: string;
  moeda: string;
  t: FuncaoT;
}) {
  if (dias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Sem gasto registrado no período.")}
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
              <p>{formatCampanhasMoney(dia.gasto, moeda, locale)}</p>
              <p className="opacity-70">
                {dia.contactos === 1
                  ? t("{n} contato", { n: dia.contactos })
                  : t("{n} contatos", { n: dia.contactos })}
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
  locale,
  moeda,
  t,
}: {
  campanhas: CampanhaResumo[];
  locale: string;
  moeda: string;
  t: FuncaoT;
}) {
  if (campanhas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Sem campanhas com gasto no período.")}
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
              {formatCampanhasMoney(campanha.gasto, moeda, locale)}
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
            {t("{cliques} cliques · {impressoes} impressões", {
              cliques: formatNumber(campanha.cliques, locale),
              impressoes: formatNumber(campanha.impressoes, locale),
            })}
            {campanha.estado ? ` · ${campanha.estado.toLowerCase()}` : ""}
          </p>
          {/*
            Quem chegou por esta campanha. Só aparece quando há alguém: uma
            linha a dizer "0 contactos" em todas as campanhas fazia parecer que
            a medição está avariada, quando o que acontece é que o Instagram
            não manda os dados. O aviso abaixo do ranking explica-o uma vez.
          */}
          {campanha.contactosAtribuidos > 0 ? (
            <p className="mt-1 text-xs font-medium text-positive">
              {campanha.contactosAtribuidos === 1
                ? t("{n} contato identificado", {
                    n: formatNumber(campanha.contactosAtribuidos, locale),
                  })
                : t("{n} contatos identificados", {
                    n: formatNumber(campanha.contactosAtribuidos, locale),
                  })}
              {campanha.marcacoesAtribuidas > 0
                ? ` · ${
                    campanha.marcacoesAtribuidas === 1
                      ? t("{n} agendamento", {
                          n: formatNumber(campanha.marcacoesAtribuidas, locale),
                        })
                      : t("{n} agendamentos", {
                          n: formatNumber(campanha.marcacoesAtribuidas, locale),
                        })
                  }`
                : ""}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export async function CampaignsPanel({
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
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
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
              <SeccaoTitulo sufixo={rangeLabel}>{t("Período")}</SeccaoTitulo>
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
                  {t(option.label)}
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
              {t("Início")}
              <input
                className="ds-campo"
                defaultValue={inicio}
                name="inicio"
                type="date"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
              {t("Fim")}
              <input
                className="ds-campo"
                defaultValue={fim}
                name="fim"
                type="date"
              />
            </label>
            <FormSubmitButton
              className="ds-botao ds-botao-primario"
              pendingLabel={t("Aplicando...")}
            >
              {t("Aplicar")}
            </FormSubmitButton>
          </Form>
        ) : null}
      </div>

      {painel.temDados ? (
        <>
          <div className="flex flex-col gap-3">
            <SeccaoTitulo sufixo={t("no período")}>
              {t("Investimento")}
            </SeccaoTitulo>
            <GrupoMetricas
              itens={[
                {
                  dica: t(
                    "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.",
                  ),
                  label: t("Investido"),
                  valor: formatCampanhasMoney(painel.gasto, painel.moeda, locale),
                },
                {
                  dica: t(
                    "Pessoas que entraram em contato no período, por qualquer via, não só por anúncio.",
                  ),
                  label: t("Contatos novos"),
                  valor: formatNumber(painel.contactosNovos, locale),
                },
                {
                  dica: t(
                    "Investido dividido pelos contatos novos. É um limite superior do custo real por lead de anúncio.",
                  ),
                  label: t("Custo por contato"),
                  valor:
                    painel.custoPorContacto === null
                      ? null
                      : formatCampanhasMoney(
                          painel.custoPorContacto,
                          painel.moeda,
                          locale,
                        ),
                },
                {
                  dica: t("Cliques em qualquer parte do anúncio."),
                  label: t("Cliques"),
                  nota: t("{n} no link", {
                    n: formatNumber(painel.cliquesLink, locale),
                  }),
                  valor: formatNumber(painel.cliques, locale),
                },
              ]}
            />
          </div>

          <div className="flex flex-col gap-3">
            <SeccaoTitulo sufixo={t("no período")}>{t("Entrega")}</SeccaoTitulo>
            <GrupoMetricas
              itens={[
                {
                  dica: t(
                    "Impressões servidas no período. Uma pessoa pode ver o anúncio várias vezes.",
                  ),
                  label: t("Impressões"),
                  valor: formatNumber(painel.impressoes, locale),
                },
                {
                  dica: t("Custo por mil impressões, recalculado do total do período."),
                  label: "CPM",
                  valor:
                    painel.cpm === null
                      ? null
                      : formatCampanhasMoney(painel.cpm, painel.moeda, locale),
                },
                {
                  dica: t(
                    "Cliques divididos pelas impressões, recalculado do total do período.",
                  ),
                  label: "CTR",
                  valor:
                    painel.ctr === null
                      ? null
                      : `${new Intl.NumberFormat(locale, {
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2,
                        }).format(painel.ctr)}%`,
                },
              ]}
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="mb-5 flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-foreground">
                {t("Gasto por dia")}
              </h2>
              <Dica
                texto={t(
                  "Passe o mouse sobre uma barra para ver o gasto e os contatos daquele dia.",
                )}
              />
            </div>
            <DailySpendChart
              dias={painel.diario}
              locale={locale}
              moeda={painel.moeda}
              t={t}
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="mb-5 text-sm font-semibold text-foreground">
              {t("Gasto por campanha")}
              <span className="ml-1.5 font-normal text-muted-foreground">
                {t("por investimento")}
              </span>
            </h2>
            <CampaignRanking
              campanhas={painel.porCampanha}
              locale={locale}
              moeda={painel.moeda}
              t={t}
            />
          </div>

          <div className="rounded-2xl border border-warning/20 bg-warning-soft p-5">
            <p className="text-sm font-semibold text-warning">
              {t('Por que não existe "custo por mensagem" por campanha')}
            </p>
            <p className="mt-2 text-sm leading-6 text-warning">
              {t(
                "A Meta não devolve conversas iniciadas nesta conta: os conjuntos que otimizam conversas enviam as pessoas para o Instagram Direct, que não identifica o anúncio de origem. Por isso o custo acima é calculado sobre todos os contatos novos, e não só sobre os que vieram de anúncio. Serve para comparar períodos, não para afirmar o custo exato de um lead pago.",
              )}
            </p>
            {/*
              O mesmo limite, agora aplicado aos números por campanha. Dizer
              isto em voz alta é o que impede o dono de olhar para "3
              contactos" e concluir que a campanha trouxe três pessoas.
            */}
            <p className="mt-3 text-sm leading-6 text-warning">
              {t(
                "Os contatos identificados por campanha vêm da mesma limitação: {com} de {total} contatos novos do período trazem o anúncio de origem. Só o clique para WhatsApp o envia. É um mínimo garantido, não um total: vale para comparar campanhas entre si, porque a regra falha igual em todas, e não vale para dizer que fatia dos contatos veio de anúncio pago.",
                {
                  com: formatNumber(painel.contactosComAnuncio, locale),
                  total: formatNumber(painel.contactosNovos, locale),
                },
              )}
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="text-lg font-semibold text-foreground">
            {t("Ainda não há dados de campanhas")}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {vazioMensagem}
          </p>
        </div>
      )}
    </>
  );
}
