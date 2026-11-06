import Form from "next/form";
import type { ReactNode } from "react";

import { Eye, Megaphone, MessageCircle, MousePointerClick, Wallet } from "lucide-react";

import { CampaignsGraficoGasto } from "@/app/components/campaigns-grafico";
import { CartaoMetrica } from "@/app/components/cartoes";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { Dica } from "@/app/components/painel-ui";
import {
  AvisoLinha,
  CabecalhoTela,
  FiltroTrilho,
  GradeMetricas,
  VazioTela,
} from "@/app/components/tela";
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
 * O que muda entre os dois é só a moldura: o `basePath` dos links de período,
 * o seletor de cliente que o admin tem a mais (`leading`) e a ação do botão
 * "Atualizar dados" (`acoes`). Os números são os mesmos, por isso vivem aqui.
 *
 * Desenho de 06/11/2026: título com o custo por contato, números em cartões,
 * gráfico de área do gasto e a lista por campanha com barra de proporção.
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

const MARCA = "\u0001";

/** Frase traduzida com o valor em verde no meio ("Cada contato custou $4"). */
function fraseComDestaque(texto: string, valor: ReactNode) {
  const [antes, depois] = texto.split(MARCA);
  return (
    <>
      {antes}
      <span className="text-accent">{valor}</span>
      {depois}
    </>
  );
}

/** O estado que a Meta devolve (ACTIVE, PAUSED…) num selo legível. */
function SeloEstado({ estado, t }: { estado: string | null; t: FuncaoT }) {
  if (!estado) return null;
  const e = estado.toUpperCase();
  if (e === "ACTIVE") {
    return <span className="ds-selo ds-selo-verde ds-selo-ponto">{t("Ativa")}</span>;
  }
  if (e.includes("PAUSED")) {
    return <span className="ds-selo ds-selo-neutro">{t("Pausada")}</span>;
  }
  return <span className="ds-selo ds-selo-neutro">{estado.toLowerCase()}</span>;
}

function ListaCampanhas({
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
      <VazioTela
        pose="piscadinha"
        titulo={t("Sem campanhas com gasto no período.")}
      />
    );
  }

  const maxGasto = Math.max(...campanhas.map((c) => c.gasto), 0.01);

  return (
    <ul className="tela-lista">
      {campanhas.map((campanha) => (
        <li className="tela-linha items-start" key={campanha.id}>
          <span
            className="ds-chip-icone mt-0.5"
            style={{ ["--chip" as string]: "var(--ds-ouro)" }}
          >
            <Megaphone aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {campanha.nome}
                </span>
                <SeloEstado estado={campanha.estado} t={t} />
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatCampanhasMoney(campanha.gasto, moeda, locale)}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-accent"
                style={{
                  width: `${Math.max((campanha.gasto / maxGasto) * 100, 2)}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
              {t("{cliques} cliques · {impressoes} impressões", {
                cliques: formatNumber(campanha.cliques, locale),
                impressoes: formatNumber(campanha.impressoes, locale),
              })}
            </p>
            {/*
              Quem chegou por esta campanha. Só aparece quando há alguém: "0
              contatos" em todas fazia parecer que a medição está avariada.
              O aviso no fim da tela explica o limite uma vez.
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
        </li>
      ))}
    </ul>
  );
}

export async function CampaignsPanel({
  acoes,
  basePath,
  fim,
  inicio,
  leading,
  painel,
  parametrosFixos,
  periodKey,
  rangeLabel,
  sobretitulo,
  timezone,
  vazioMensagem,
}: {
  /** O botão "Atualizar dados" (cada ecrã tem a sua ação). */
  acoes?: ReactNode;
  basePath: string;
  /** Dia final do período, para o formulário de datas personalizadas. */
  fim: string;
  inicio: string;
  /** Seletor de cliente; só o admin o usa. */
  leading?: ReactNode;
  painel: PainelCampanhas;
  /** Parâmetros a preservar ao trocar de período (ex.: `cliente`). */
  parametrosFixos?: Record<string, string>;
  periodKey: string;
  rangeLabel: string;
  sobretitulo?: ReactNode;
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
  const dinheiro = (n: number) => formatCampanhasMoney(n, painel.moeda, locale);

  const titulo = !painel.temDados ? (
    <span className="text-muted-foreground">{t("Ainda não há dados de campanhas")}</span>
  ) : painel.custoPorContacto !== null ? (
    fraseComDestaque(
      t("Cada contato novo custou {valor} neste período.", { valor: MARCA }),
      dinheiro(painel.custoPorContacto),
    )
  ) : (
    fraseComDestaque(
      t("{valor} investidos neste período.", { valor: MARCA }),
      dinheiro(painel.gasto),
    )
  );

  const percentagem = (n: number) =>
    `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(n)}%`;
  const entrega = [
    painel.cpm !== null ? `CPM ${dinheiro(painel.cpm)}` : null,
    painel.ctr !== null ? `CTR ${percentagem(painel.ctr)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <CabecalhoTela
        acoes={
          <div className="flex w-full flex-col items-start gap-3 lg:w-auto lg:items-end">
            <FiltroTrilho
              opcoes={dashboardPeriodOptions.map((option) => ({
                ativo: option.key === periodKey,
                href: hrefPeriodo(option.key),
                label: t(option.label),
              }))}
              rotulo={t("Período")}
            />
            {acoes}
          </div>
        }
        resto={titulo}
        sobretitulo={sobretitulo ?? `${t("Campanhas")} · Meta`}
        subtitulo={`${rangeLabel} · ${t(getTimezoneLabel(timezone))}`}
      />

      {leading || periodKey === "personalizado" ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {leading ?? <span />}
          {periodKey === "personalizado" ? (
            <Form
              action={basePath}
              className="flex flex-wrap items-end gap-2"
              replace
              scroll={false}
            >
              {entradasFixas.map(([nome, valor]) => (
                <input key={nome} name={nome} type="hidden" value={valor} />
              ))}
              <input name="periodo" type="hidden" value="personalizado" />
              <input
                aria-label={t("Início")}
                className="ds-campo w-auto"
                defaultValue={inicio}
                name="inicio"
                type="date"
              />
              <input
                aria-label={t("Fim")}
                className="ds-campo w-auto"
                defaultValue={fim}
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
      ) : null}

      {painel.temDados ? (
        <>
          <GradeMetricas colunas={painel.impressoes > 0 ? 4 : 3}>
            <CartaoMetrica
              cor="var(--ds-ouro)"
              dica={t(
                "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.",
              )}
              icone={<Wallet aria-hidden="true" className="h-4 w-4" />}
              rotulo={t("Investido")}
              valor={dinheiro(painel.gasto)}
            />
            <CartaoMetrica
              cor="var(--ds-acao)"
              dica={t(
                "Pessoas que entraram em contato no período, por qualquer via, não só por anúncio.",
              )}
              faisca={painel.diario.map((d) => d.contactos)}
              icone={<MessageCircle aria-hidden="true" className="h-4 w-4" />}
              nota={
                painel.custoPorContacto !== null
                  ? t("{valor} por contato", {
                      valor: dinheiro(painel.custoPorContacto),
                    })
                  : undefined
              }
              rotulo={t("Contatos novos")}
              valor={formatNumber(painel.contactosNovos, locale)}
            />
            <CartaoMetrica
              cor="var(--ds-mancha-2)"
              dica={t("Cliques em qualquer parte do anúncio.")}
              icone={<MousePointerClick aria-hidden="true" className="h-4 w-4" />}
              nota={t("{n} no link", {
                n: formatNumber(painel.cliquesLink, locale),
              })}
              rotulo={t("Cliques")}
              valor={formatNumber(painel.cliques, locale)}
            />
            {/* Sem impressões a Meta não mandou a entrega: nada de cartão vazio. */}
            {painel.impressoes > 0 ? (
              <CartaoMetrica
                cor="var(--ds-info)"
                dica={t(
                  "Impressões servidas no período. Uma pessoa pode ver o anúncio várias vezes.",
                )}
                icone={<Eye aria-hidden="true" className="h-4 w-4" />}
                nota={entrega || undefined}
                rotulo={t("Impressões")}
                valor={formatNumber(painel.impressoes, locale)}
              />
            ) : null}
          </GradeMetricas>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section className="ds-bloco min-w-0 p-5">
              <div className="mb-4 flex items-center gap-1.5">
                <h2 className="ds-titulo-3 text-foreground">{t("Gasto por dia")}</h2>
                <Dica
                  texto={t(
                    "Passe o mouse sobre o gráfico para ver o gasto de cada dia.",
                  )}
                />
                <span className="ml-auto text-xs text-muted-foreground">{rangeLabel}</span>
              </div>
              <CampaignsGraficoGasto
                dias={painel.diario}
                moeda={painel.moeda}
                nomeSerie={t("Investido")}
                vazio={t("Sem gasto registrado no período.")}
              />
            </section>

            <section className="ds-bloco min-w-0 p-3 sm:p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2 px-2 pt-1">
                <h2 className="ds-titulo-3 text-foreground">{t("Por campanha")}</h2>
                <span className="text-xs text-muted-foreground">{t("por investimento")}</span>
              </div>
              <ListaCampanhas
                campanhas={painel.porCampanha}
                locale={locale}
                moeda={painel.moeda}
                t={t}
              />
            </section>
          </div>

          <AvisoLinha
            detalhe={
              <>
                <p>
                  {t(
                    "A Meta não devolve conversas iniciadas nesta conta: os conjuntos que otimizam conversas enviam as pessoas para o Instagram Direct, que não identifica o anúncio de origem. Por isso o custo acima é calculado sobre todos os contatos novos, e não só sobre os que vieram de anúncio. Serve para comparar períodos, não para afirmar o custo exato de um lead pago.",
                  )}
                </p>
                <p className="mt-2">
                  {t(
                    "Os contatos identificados por campanha vêm da mesma limitação: {com} de {total} contatos novos do período trazem o anúncio de origem. Só o clique para WhatsApp o envia. É um mínimo garantido, não um total: vale para comparar campanhas entre si, porque a regra falha igual em todas, e não vale para dizer que fatia dos contatos veio de anúncio pago.",
                    {
                      com: formatNumber(painel.contactosComAnuncio, locale),
                      total: formatNumber(painel.contactosNovos, locale),
                    },
                  )}
                </p>
              </>
            }
            tom="info"
          >
            {t('Por que não existe "custo por mensagem" por campanha')}
          </AvisoLinha>
        </>
      ) : (
        <div className="ds-bloco">
          <VazioTela texto={vazioMensagem} titulo={t("Nenhum gasto salvo ainda.")} />
        </div>
      )}
    </>
  );
}
