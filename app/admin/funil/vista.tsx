import { Barra } from "@/app/components/ds";
import { AvisoLinha, CabecalhoTela, FiltroTrilho } from "@/app/components/tela";
import { ETAPAS, type EtapaFunil, type SemanaFunil } from "@/lib/funil/etapas";
import { CLIENTES_DO_FUNIL, SEMANAS_DO_FUNIL, lerFunilDoCliente, type FunilDoCliente } from "@/lib/funil/read";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import { createAdminClient } from "@/lib/supabase/admin";
import { ocultoNoAdmin } from "@/lib/clientes/ocultos";

/**
 * O funil dos agentes (18/11/2026): as mesmas seis etapas para todos os
 * clientes, por semana da 1.ª mensagem. Mostra onde cada agente perde gente e
 * deixa comparar semanas antes e depois de uma mudança. As regras estão em
 * `lib/funil/etapas.ts`; a leitura da base em `lib/funil/read.ts`.
 */

function nomesDasEtapas(t: FuncaoT): Record<EtapaFunil, string> {
  return {
    compareceu: t("Compareceu"),
    conversa: t("Conversa"),
    horarios: t("Horários"),
    marcada: t("Marcada"),
    preco: t("Preço"),
    resumo: t("Resumo"),
  };
}

function definicoes(t: FuncaoT): Record<EtapaFunil, string> {
  return {
    compareceu: t("A hora da marcação já passou e ela continua na agenda (não cancelada). A agenda não registra faltas."),
    conversa: t("O cliente escreveu pela 1.ª vez nesta semana e o agente respondeu (respostas só da equipe não contam)."),
    horarios: t("O agente escreveu uma hora concreta (ex.: 15:30, 9h, 7 PM)."),
    marcada: t("Há uma marcação na agenda com o telefone desta conversa, criada depois da 1.ª mensagem."),
    preco: t("O agente escreveu um valor em dinheiro (ex.: 60€, US$ 40, R$ 150)."),
    resumo: t("O agente pediu confirmação com o dia ou a hora (ex.: “sexta 20/11 às 15:30, certo?”)."),
  };
}

/** A tela sem a verificação de acesso (quem chama já confirmou `lexia_admin`). */
export async function FunilVista({ pedido }: { pedido: string }) {
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];

  const admin = createAdminClient();
  const slugs = CLIENTES_DO_FUNIL.map((c) => c.slug).filter((s) => !ocultoNoAdmin(s));
  const { data: clientesData } = await admin.from("lexia_clientes").select("slug, nome").in("slug", slugs);
  const nomes = new Map((clientesData ?? []).map((c) => [c.slug as string, (c.nome as string | null) || (c.slug as string)]));
  const selecionado = slugs.includes(pedido) ? pedido : "";
  const mostrar = selecionado ? [selecionado] : slugs;

  const agora = new Date();
  const funis = await Promise.all(
    mostrar.map(async (slug) => {
      try {
        return { funil: await lerFunilDoCliente(admin, slug, agora), slug };
      } catch (erro) {
        console.error("[funil]", slug, erro);
        return { funil: null, slug };
      }
    }),
  );

  const etapas = nomesDasEtapas(t);
  const defs = definicoes(t);

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        resto={t("Onde cada agente perde gente")}
        sobretitulo={selecionado ? `${t("Funil")} · ${nomes.get(selecionado) ?? selecionado}` : t("Funil dos agentes")}
        subtitulo={t("Últimas {n} semanas, por semana da 1.ª mensagem do cliente.", { n: SEMANAS_DO_FUNIL })}
      />

      <FiltroTrilho
        opcoes={[
          { ativo: !selecionado, href: "/admin/funil", label: t("Todos") },
          ...slugs.map((slug) => ({
            ativo: selecionado === slug,
            href: `/admin/funil?cliente=${encodeURIComponent(slug)}`,
            label: nomes.get(slug) ?? slug,
          })),
        ]}
        rotulo={t("Cliente")}
      />

      <details className="ds-bloco ds-entrar group p-4 sm:p-5">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          {t("Como cada etapa é medida")}
          <span className="ml-2 text-muted-foreground group-open:hidden">+</span>
          <span className="ml-2 hidden text-muted-foreground group-open:inline">−</span>
        </summary>
        <ol className="mt-3 flex flex-col gap-2">
          {ETAPAS.map((e, i) => (
            <li className="text-sm leading-snug" key={e}>
              <span className="font-medium text-foreground">
                {i + 1}. {etapas[e]}
              </span>{" "}
              <span className="text-muted-foreground">{defs[e]}</span>
            </li>
          ))}
        </ol>
        <p className="ds-legenda mt-3">
          {t("A taxa de cada etapa é: das conversas que chegaram à etapa anterior, quantas chegaram a esta. No comparecimento, a base são as marcações cuja hora já passou. As semanas recentes ainda estão amadurecendo.")}
        </p>
      </details>

      {funis.map(({ funil, slug }, i) => (
        <article className="ds-bloco ds-entrar flex min-w-0 flex-col gap-5 p-4 sm:p-6" key={slug} style={{ ["--i" as string]: i + 1 }}>
          <header className="flex min-w-0 flex-col gap-1">
            <h2 className="ds-titulo-2 truncate text-foreground">{nomes.get(slug) ?? slug}</h2>
            {funil ? (
              <p className="ds-legenda">
                {t("{n} conversas começaram nestas {s} semanas.", { n: funil.total.escreveram, s: SEMANAS_DO_FUNIL })}
              </p>
            ) : null}
          </header>

          {!funil ? (
            <AvisoLinha tom="perigo">{t("Não foi possível ler os dados deste cliente agora.")}</AvisoLinha>
          ) : funil.total.escreveram === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhuma conversa nova nestas semanas.")}</p>
          ) : (
            <>
              <FunilTotal etapas={etapas} funil={funil} t={t} />
              <NotasDaAgenda funil={funil} locale={locale} t={t} />
              <TabelaSemanas etapas={etapas} funil={funil} locale={locale} t={t} />
            </>
          )}
        </article>
      ))}
    </section>
  );
}

function FunilTotal({ etapas, funil, t }: { etapas: Record<EtapaFunil, string>; funil: FunilDoCliente; t: FuncaoT }) {
  const total = funil.total;
  const base = Math.max(1, total.escreveram);
  return (
    <ol className="flex flex-col gap-3">
      {ETAPAS.map((e, i) => {
        const semDado = funil.semDado[e];
        const n = total.contagens[e];
        const taxa = total.taxas[e];
        return (
          <li className="flex min-w-0 flex-col gap-1.5" key={e}>
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-foreground">
                <span className="tabular-nums text-muted-foreground">{i + 1}.</span> {etapas[e]}
              </span>
              {semDado ? (
                <span className="shrink-0 text-sm text-muted-foreground">{t("sem dado")}</span>
              ) : (
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  <span className="text-base font-semibold text-foreground">{n}</span>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {taxa === null ? "—" : i === 0 ? t("{p}% responderam", { p: taxa }) : t("{p}% da anterior", { p: taxa })}
                  </span>
                </span>
              )}
            </div>
            {semDado ? (
              <p className="ds-legenda">
                {semDado === "loja"
                  ? t("Loja: o agente não marca horários.")
                  : t("A agenda do Google deste cliente ainda não está espelhada na Lexia.")}
              </p>
            ) : (
              <Barra valor={(n / base) * 100} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function NotasDaAgenda({ funil, locale, t }: { funil: FunilDoCliente; locale: string; t: FuncaoT }) {
  if (funil.marcacoesSemConversa === null) return null;
  const sinc = funil.agendaSincronizadaEm
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: funil.timeZone }).format(
        new Date(funil.agendaSincronizadaEm),
      )
    : null;
  return (
    <div className="flex flex-col gap-1">
      {funil.marcacoesSemConversa > 0 ? (
        <p className="ds-legenda">
          {t("{n} marcações com telefone destas semanas não se ligaram a uma conversa nova (o lead falou por Instagram, deu outro número ou já conversava antes). Não entram no funil.", { n: funil.marcacoesSemConversa })}
        </p>
      ) : null}
      {sinc ? <p className="ds-legenda">{t("Agenda do Google sincronizada em {quando}.", { quando: sinc })}</p> : null}
    </div>
  );
}

function TabelaSemanas({
  etapas,
  funil,
  locale,
  t,
}: {
  etapas: Record<EtapaFunil, string>;
  funil: FunilDoCliente;
  locale: string;
  t: FuncaoT;
}) {
  const dia = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const rotuloSemana = (s: SemanaFunil) => dia.format(new Date(`${s.semana}T12:00:00Z`));
  const grade = "grid grid-cols-[3.25rem_repeat(6,minmax(0,1fr))] gap-x-1 sm:grid-cols-[6.5rem_repeat(6,minmax(0,1fr))] sm:gap-x-3";

  return (
    <div className="flex min-w-0 flex-col">
      <p className="ds-sobretitulo mb-2">{t("Por semana")}</p>
      <div className={`${grade} border-b border-border pb-2`} role="row">
        <span className="text-[0.6875rem] text-muted-foreground" role="columnheader">
          {t("Semana")}
        </span>
        {ETAPAS.map((e, i) => (
          <span className="min-w-0 truncate text-center text-[0.6875rem] text-muted-foreground" key={e} role="columnheader" title={etapas[e]}>
            <span className="tabular-nums">{i + 1}</span>
            <span className="hidden sm:inline"> {etapas[e]}</span>
          </span>
        ))}
      </div>
      {funil.semanas.map((s, linha) => (
        <div className={`${grade} items-center border-b border-border/60 py-2 last:border-b-0`} key={s.semana} role="row">
          <span className="flex min-w-0 flex-col leading-tight" role="rowheader">
            <span className="text-[0.8125rem] font-medium tabular-nums text-foreground">{rotuloSemana(s)}</span>
            <span className="truncate text-[0.6875rem] text-muted-foreground">
              {s.escreveram}
              {linha === 0 ? " ·" : ""}
            </span>
          </span>
          {ETAPAS.map((e) => {
            const semDado = funil.semDado[e];
            const taxa = s.taxas[e];
            return (
              <span className="flex min-w-0 flex-col items-center leading-tight tabular-nums" key={e} role="cell">
                {semDado ? (
                  <span aria-label={t("sem dado")} className="text-sm text-muted-foreground" title={t("sem dado")}>
                    —
                  </span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-foreground">{s.contagens[e]}</span>
                    <span className="text-[0.6875rem] text-muted-foreground">{taxa === null ? " " : `${taxa}%`}</span>
                  </>
                )}
              </span>
            );
          })}
        </div>
      ))}
      <p className="ds-legenda mt-2">
        {t("Debaixo da data: quantos clientes escreveram. Em cada etapa: quantas conversas chegaram e a taxa sobre a etapa anterior. A linha com · é a semana em curso.")}
      </p>
    </div>
  );
}
