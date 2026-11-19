import { ArrowUpRight, Repeat2 } from "lucide-react";
import Link from "next/link";

import { ItemAcoes } from "@/app/admin/analises/item-acoes";
import { NovoPedido } from "@/app/admin/analises/novo-pedido";
import { Selo } from "@/app/components/ds";
import { AvisoLinha, CabecalhoTela, FiltroTrilho, VazioTela } from "@/app/components/tela";
import { DIAS_DOS_REPETIDOS, lerAnalises, type Analise, type ItemAnalise } from "@/lib/analises/read";
import {
  contagemTotal,
  contagensPorCliente,
  eEstadoItem,
  eGravidade,
  errosQueSeRepetem,
  ESTADOS_ITEM,
  GRAVIDADES,
  linkDaConversa,
  type Contagem,
  type EstadoItem,
  type Gravidade,
  type Repetido,
} from "@/lib/analises/regras";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Análises das conversas (19/11/2026). À esquerda (no celular, em cima, a
 * deslizar) as análises mais recentes; ao meio a escolhida, com cartões por
 * cliente e cada achado; por baixo, os erros que se repetem em vários dias.
 * Os filtros ficam no endereço (?cliente, ?gravidade, ?estado, ?analise).
 */

type Filtros = { analise: string; cliente: string; estado: string; gravidade: string };

const FUSO = "America/Sao_Paulo";
const PESO: Record<string, number> = { detalhe: 2, grave: 0, medio: 1, positivo: 3 };
const TOM_GRAVIDADE: Record<Gravidade, "perigo" | "alerta" | "neutro" | "verde"> = {
  detalhe: "neutro",
  grave: "perigo",
  medio: "alerta",
  positivo: "verde",
};
const COR_GRAVIDADE: Record<Gravidade, string> = {
  detalhe: "var(--ds-texto-3)",
  grave: "var(--ds-perigo)",
  medio: "var(--ds-alerta)",
  positivo: "var(--ds-positivo)",
};

function rotulos(t: FuncaoT) {
  return {
    estadoAnalise: {
      a_correr: t("Rodando"),
      concluida: t("Concluída"),
      falhou: t("Falhou"),
      pedida: t("Na fila"),
    } as Record<string, string>,
    estadoItem: {
      corrigido: t("Corrigido"),
      falso_alarme: t("Falso alarme"),
      novo: t("Novo"),
      visto: t("Visto"),
    } as Record<EstadoItem, string>,
    gravidade: {
      detalhe: t("Detalhe"),
      grave: t("Grave"),
      medio: t("Médio"),
      positivo: t("Positivo"),
    } as Record<Gravidade, string>,
    gravidadePlural: {
      detalhe: t("detalhes"),
      grave: t("graves"),
      medio: t("médios"),
      positivo: t("positivos"),
    } as Record<Gravidade, string>,
    tipo: {
      diaria: t("Diária"),
      especifica: t("Específica"),
      geral: t("Geral"),
    } as Record<string, string>,
  };
}

function hrefCom(f: Filtros, mudar: Partial<Filtros>) {
  const p = new URLSearchParams();
  const n = { ...f, ...mudar };
  for (const k of ["cliente", "gravidade", "estado", "analise"] as const) if (n[k]) p.set(k, n[k]);
  const q = p.toString();
  return q ? `/admin/analises?${q}` : "/admin/analises";
}

/** A tela sem a verificação de acesso (quem chama já confirmou `lexia_admin`). */
export async function AnalisesVista({ filtros: pedidos }: { filtros: Filtros }) {
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const r = rotulos(t);
  const admin = createAdminClient();

  const { data: clientesData } = await admin.from("lexia_clientes").select("slug, nome").order("nome");
  const clientes = (clientesData ?? [])
    .filter((c) => !["cliente_teste", "clinica_teste"].includes(c.slug as string))
    .map((c) => ({ nome: (c.nome as string | null) || (c.slug as string), slug: c.slug as string }));
  const nomes = new Map(clientes.map((c) => [c.slug, c.nome]));
  const nomeDe = (slug: string | null) => (slug ? (nomes.get(slug) ?? slug) : t("Todos os clientes"));

  // Só valores conhecidos entram nos filtros e na consulta.
  const filtros: Filtros = {
    analise: /^[0-9a-f-]{36}$/i.test(pedidos.analise) ? pedidos.analise : "",
    cliente: nomes.has(pedidos.cliente) ? pedidos.cliente : "",
    estado: eEstadoItem(pedidos.estado) ? pedidos.estado : "",
    gravidade: eGravidade(pedidos.gravidade) ? pedidos.gravidade : "",
  };

  const agora = new Date();
  const leitura = await lerAnalises(admin, { agora, cliente: filtros.cliente, pedida: filtros.analise });

  const cabecalhoBase = {
    acoes: <NovoPedido clienteAtual={filtros.cliente} clientes={clientes} />,
    sobretitulo: t("Análises das conversas"),
  };

  if (leitura.faltaMigracao) {
    return (
      <section className="flex w-full min-w-0 flex-col gap-6">
        <CabecalhoTela {...cabecalhoBase} resto={t("O que os agentes erraram e por quê")} />
        <AvisoLinha tom="alerta">{t("Falta rodar a migration das análises no Supabase central.")}</AvisoLinha>
      </section>
    );
  }

  const { analises, itensDaLista, itensSelecionada, repetidosBase, selecionada } = leitura;

  const passa = (it: { cliente_slug: string; estado: string; gravidade: string }) =>
    (!filtros.cliente || it.cliente_slug === filtros.cliente) &&
    (!filtros.gravidade || it.gravidade === filtros.gravidade) &&
    (!filtros.estado || it.estado === filtros.estado);

  const itensFiltrados = itensSelecionada
    .filter(passa)
    .sort((a, b) => (PESO[a.gravidade] ?? 9) - (PESO[b.gravidade] ?? 9) || a.criado_em.localeCompare(b.criado_em));
  const itensDoCliente = itensSelecionada.filter((i) => !filtros.cliente || i.cliente_slug === filtros.cliente);
  const gravesAbertos = itensDoCliente.filter((i) => i.gravidade === "grave" && i.estado === "novo").length;

  const repetidos = errosQueSeRepetem(
    repetidosBase.filter((i) => !filtros.cliente || i.cliente_slug === filtros.cliente),
  ).slice(0, 12);

  const fmtData = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: FUSO });
  const fmtDia = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: FUSO });

  const titulo = !selecionada
    ? { resto: t("O que os agentes erraram e por quê") }
    : gravesAbertos > 0
      ? { destaque: String(gravesAbertos), resto: gravesAbertos === 1 ? t("erro grave por olhar") : t("erros graves por olhar") }
      : { resto: t("Nenhum erro grave por olhar") };

  return (
    <section className="flex w-full min-w-0 flex-col gap-5">
      <CabecalhoTela
        {...cabecalhoBase}
        {...titulo}
        subtitulo={t("A análise diária roda às 2h (Brasília) e lê as últimas 24 h de cada cliente.")}
      />

      {analises.length === 0 && !selecionada ? (
        <div className="ds-bloco ds-entrar">
          <VazioTela
            pose="voando"
            texto={
              filtros.cliente
                ? t("Nenhuma análise deste cliente ainda. Peça uma específica ou espere a diária das 2h.")
                : t("A primeira análise diária roda às 2h (Brasília). Você também pode pedir uma agora, pelos botões acima.")
            }
            titulo={t("Ainda não há análises")}
          />
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-2">
            <FiltroTrilho
              opcoes={[
                { ativo: !filtros.cliente, href: hrefCom(filtros, { cliente: "" }), label: t("Todos") },
                ...clientes.map((c) => ({
                  ativo: filtros.cliente === c.slug,
                  href: hrefCom(filtros, { cliente: c.slug }),
                  label: c.nome,
                })),
              ]}
              rotulo={t("Cliente")}
            />
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
              <FiltroTrilho
                opcoes={[
                  { ativo: !filtros.gravidade, href: hrefCom(filtros, { gravidade: "" }), label: t("Toda gravidade") },
                  ...GRAVIDADES.map((g) => ({
                    ativo: filtros.gravidade === g,
                    href: hrefCom(filtros, { gravidade: g }),
                    label: r.gravidade[g],
                  })),
                ]}
                rotulo={t("Gravidade")}
              />
              <FiltroTrilho
                opcoes={[
                  { ativo: !filtros.estado, href: hrefCom(filtros, { estado: "" }), label: t("Todo estado") },
                  ...ESTADOS_ITEM.map((e) => ({
                    ativo: filtros.estado === e,
                    href: hrefCom(filtros, { estado: e }),
                    label: r.estadoItem[e],
                  })),
                ]}
                rotulo={t("Estado")}
              />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
            {/* Lista: no celular desliza na horizontal; no computador é a coluna da esquerda. */}
            <nav aria-label={t("Análises")} className="min-w-0 lg:col-start-1 lg:row-start-1">
              <p className="ds-sobretitulo mb-2 px-1">{t("Análises")}</p>
              <ol className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
                {analises.map((a) => {
                  const itens = itensDaLista.filter((i) => i.analise_id === a.id && passa(i));
                  const c = contagemTotal(itens);
                  const ativa = selecionada?.id === a.id;
                  return (
                    <li className="w-[15.5rem] shrink-0 snap-start lg:w-auto" key={a.id}>
                      <Link
                        aria-current={ativa ? "page" : undefined}
                        className={`ds-bloco flex h-full min-w-0 flex-col gap-1.5 p-3.5 transition-[box-shadow] ${
                          ativa ? "shadow-[0_0_0_2px_var(--ds-acao)]" : ""
                        }`}
                        href={hrefCom(filtros, { analise: a.id })}
                        prefetch={false}
                        scroll={false}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                            {fmtData.format(new Date(a.criado_em))}
                          </span>
                          <Selo tom={a.estado === "falhou" ? "perigo" : a.estado === "concluida" ? "neutro" : "ouro"}>
                            {a.estado === "concluida" ? r.tipo[a.tipo] ?? a.tipo : r.estadoAnalise[a.estado] ?? a.estado}
                          </Selo>
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {nomeDe(a.cliente_slug)}
                          {a.pedido ? ` · ${a.pedido}` : ""}
                        </span>
                        <ContagemEmLinha contagem={c} />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <div className="flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              {selecionada ? (
                <DetalheAnalise
                  analise={selecionada}
                  fmtData={fmtData}
                  filtros={filtros}
                  itens={itensFiltrados}
                  itensDoCliente={itensDoCliente}
                  locale={locale}
                  nomeDe={nomeDe}
                  r={r}
                  t={t}
                />
              ) : null}
            </div>

            <div className="min-w-0 self-start lg:col-start-1 lg:row-start-2">
              <PainelRepetidos fmtDia={fmtDia} nomeDe={nomeDe} r={r} repetidos={repetidos} t={t} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ContagemEmLinha({ contagem }: { contagem: Contagem }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
      {GRAVIDADES.map((g) => (
        <span className="inline-flex items-center gap-1" key={g}>
          <span aria-hidden className="size-1.5 rounded-full" style={{ background: COR_GRAVIDADE[g] }} />
          <span className={contagem[g] ? "text-foreground" : ""}>{contagem[g]}</span>
        </span>
      ))}
    </span>
  );
}

type Rotulos = ReturnType<typeof rotulos>;

function DetalheAnalise({
  analise,
  filtros,
  fmtData,
  itens,
  itensDoCliente,
  locale,
  nomeDe,
  r,
  t,
}: {
  analise: Analise;
  filtros: Filtros;
  fmtData: Intl.DateTimeFormat;
  itens: ItemAnalise[];
  itensDoCliente: ItemAnalise[];
  locale: string;
  nomeDe: (slug: string | null) => string;
  r: Rotulos;
  t: FuncaoT;
}) {
  const porCliente = contagensPorCliente(itensDoCliente);
  const custo = analise.custo_estimado === null ? null : Number(analise.custo_estimado);
  const periodo =
    analise.periodo_inicio && analise.periodo_fim
      ? `${fmtData.format(new Date(analise.periodo_inicio))} → ${fmtData.format(new Date(analise.periodo_fim))}`
      : null;
  const emCurso = analise.estado === "pedida" || analise.estado === "a_correr";

  return (
    <>
      <article className="ds-bloco ds-entrar flex min-w-0 flex-col gap-3 p-4 sm:p-6">
        <header className="flex min-w-0 flex-wrap items-center gap-2">
          <Selo tom="escuro">{r.tipo[analise.tipo] ?? analise.tipo}</Selo>
          <Selo ponto tom={analise.estado === "falhou" ? "perigo" : analise.estado === "concluida" ? "verde" : "ouro"}>
            {r.estadoAnalise[analise.estado] ?? analise.estado}
          </Selo>
          <span className="text-sm text-muted-foreground">{nomeDe(analise.cliente_slug)}</span>
        </header>
        <h2 className="ds-titulo-2 text-foreground">{fmtData.format(new Date(analise.criado_em))}</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {periodo ? (
            <>
              <dt className="text-muted-foreground">{t("Período")}</dt>
              <dd className="min-w-0 tabular-nums text-foreground">{periodo}</dd>
            </>
          ) : null}
          {analise.conversa ? (
            <>
              <dt className="text-muted-foreground">{t("Conversa")}</dt>
              <dd className="min-w-0 break-all text-foreground">
                {analise.cliente_slug && linkDaConversa(analise.cliente_slug, analise.conversa) ? (
                  <Link className="underline-offset-2 hover:underline" href={linkDaConversa(analise.cliente_slug, analise.conversa)!}>
                    {analise.conversa}
                  </Link>
                ) : (
                  analise.conversa
                )}
              </dd>
            </>
          ) : null}
          {custo !== null && Number.isFinite(custo) ? (
            <>
              <dt className="text-muted-foreground">{t("Custo estimado")}</dt>
              <dd className="tabular-nums text-foreground">
                {new Intl.NumberFormat(locale, { currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency" }).format(custo)}
              </dd>
            </>
          ) : null}
        </dl>
        {analise.pedido ? (
          <blockquote className="rounded-[14px] bg-muted px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-foreground">
            {analise.pedido}
          </blockquote>
        ) : null}
        {analise.resumo ? (
          <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-foreground">{analise.resumo}</p>
        ) : null}
        {analise.estado === "falhou" && analise.erro ? <AvisoLinha tom="perigo">{analise.erro}</AvisoLinha> : null}
        {emCurso ? (
          <AvisoLinha tom="info">
            {analise.estado === "pedida"
              ? t("Pedido na fila. O relatório aparece aqui quando a rotina terminar.")
              : t("A rotina está lendo as conversas agora.")}
          </AvisoLinha>
        ) : null}
      </article>

      {porCliente.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {porCliente.map(({ cliente_slug, contagem }, i) => {
            const ativo = filtros.cliente === cliente_slug;
            return (
              <Link
                aria-current={ativo ? "true" : undefined}
                className={`ds-bloco ds-entrar flex min-w-0 flex-col gap-3 p-4 ${ativo ? "shadow-[0_0_0_2px_var(--ds-acao)]" : ""}`}
                href={hrefCom(filtros, { cliente: ativo ? "" : cliente_slug })}
                key={cliente_slug}
                scroll={false}
                style={{ ["--i" as string]: i + 1 }}
              >
                <span className="truncate text-sm font-semibold text-foreground">{nomeDe(cliente_slug)}</span>
                <span className="grid grid-cols-4 gap-1">
                  {GRAVIDADES.map((g) => (
                    <span className="flex min-w-0 flex-col" key={g}>
                      <span className="ds-numero text-[1.375rem] leading-none" style={{ color: contagem[g] ? COR_GRAVIDADE[g] : "var(--ds-texto-3)" }}>
                        {contagem[g]}
                      </span>
                      <span className="mt-1 truncate text-[0.6875rem] text-muted-foreground">{r.gravidadePlural[g]}</span>
                    </span>
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {itens.length === 0 ? (
        emCurso ? null : (
          <div className="ds-bloco">
            <VazioTela
              pose={itensDoCliente.length === 0 ? "feliz" : "piscadinha"}
              texto={
                itensDoCliente.length === 0
                  ? t("A análise não encontrou nada a apontar neste período.")
                  : t("Nenhum item com estes filtros.")
              }
              titulo={itensDoCliente.length === 0 ? t("Nada a apontar") : t("Nada por aqui")}
            />
          </div>
        )
      ) : (
        <ol className="flex min-w-0 flex-col gap-3">
          {itens.map((it) => (
            <li key={it.id}>
              <ItemCartao item={it} nomeDe={nomeDe} r={r} t={t} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function ItemCartao({ item, nomeDe, r, t }: { item: ItemAnalise; nomeDe: (s: string | null) => string; r: Rotulos; t: FuncaoT }) {
  const g = eGravidade(item.gravidade) ? item.gravidade : "detalhe";
  const link = linkDaConversa(item.cliente_slug, item.identificador_conversa);
  const campos: { rotulo: string; valor: string | null; mono?: boolean }[] = [
    { rotulo: t("O que a IA decidiu"), valor: item.o_que_a_ia_decidiu },
    { rotulo: t("O que o código fez"), valor: item.o_que_o_codigo_fez },
    { rotulo: t("Causa"), valor: item.causa },
    { mono: true, rotulo: t("Onde corrigir"), valor: item.onde_corrigir },
  ];
  const resolvido = item.estado === "corrigido" || item.estado === "falso_alarme";

  return (
    <article
      className={`ds-bloco flex min-w-0 flex-col gap-3 border-l-[3px] p-4 sm:p-5 ${resolvido ? "opacity-75" : ""}`}
      style={{ borderLeftColor: COR_GRAVIDADE[g] }}
    >
      <header className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Selo tom={TOM_GRAVIDADE[g]}>{r.gravidade[g]}</Selo>
          <span className="text-xs text-muted-foreground">{nomeDe(item.cliente_slug)}</span>
          {item.estado !== "novo" && eEstadoItem(item.estado) ? (
            <span className="text-xs text-muted-foreground">· {r.estadoItem[item.estado]}</span>
          ) : null}
        </div>
        <h3 className="ds-titulo-3 text-foreground [overflow-wrap:anywhere]">{item.titulo}</h3>
        {link ? (
          <Link className="inline-flex w-fit max-w-full items-center gap-1 text-xs font-medium text-[var(--ds-acao-forte)] underline-offset-2 hover:underline" href={link}>
            <span className="truncate">{t("Abrir conversa")}</span>
            <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
          </Link>
        ) : item.identificador_conversa ? (
          <span className="truncate text-xs text-muted-foreground">{item.identificador_conversa}</span>
        ) : null}
      </header>

      {item.citacao ? (
        <blockquote className="rounded-[14px] bg-muted px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-foreground [overflow-wrap:anywhere]">
          {item.citacao}
        </blockquote>
      ) : null}

      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        {campos
          .filter((c) => c.valor)
          .map((c) => (
            <div className="flex min-w-0 flex-col gap-0.5" key={c.rotulo}>
              <dt className="ds-sobretitulo">{c.rotulo}</dt>
              <dd
                className={`text-sm leading-relaxed whitespace-pre-line text-foreground [overflow-wrap:anywhere] ${c.mono ? "font-mono text-[0.8125rem]" : ""}`}
              >
                {c.valor}
              </dd>
            </div>
          ))}
      </dl>

      <ItemAcoes estado={item.estado} id={item.id} nota={item.nota_admin} />
    </article>
  );
}

function PainelRepetidos({
  fmtDia,
  nomeDe,
  r,
  repetidos,
  t,
}: {
  fmtDia: Intl.DateTimeFormat;
  nomeDe: (s: string | null) => string;
  r: Rotulos;
  repetidos: Repetido[];
  t: FuncaoT;
}) {
  return (
    <section className="ds-bloco flex min-w-0 flex-col gap-3 p-4">
      <header className="flex items-center gap-2">
        <Repeat2 aria-hidden className="size-4 text-muted-foreground" />
        <h2 className="ds-titulo-3 text-foreground">{t("Erros que se repetem")}</h2>
      </header>
      <p className="ds-legenda">{t("O mesmo título ou a mesma causa em 2 dias ou mais, nos últimos {n} dias.", { n: DIAS_DOS_REPETIDOS })}</p>
      {repetidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nenhum erro se repetiu.")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {repetidos.map((rp) => (
            <li className="flex min-w-0 flex-col gap-1 py-2.5 first:pt-0 last:pb-0" key={`${rp.campo}:${rp.texto}`}>
              <span className="flex min-w-0 items-start gap-2">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: COR_GRAVIDADE[rp.gravidade] }} />
                <span className="min-w-0 flex-1 text-sm leading-snug text-foreground [overflow-wrap:anywhere]">
                  {rp.campo === "causa" ? <span className="text-muted-foreground">{t("Causa")}: </span> : null}
                  {rp.texto}
                </span>
              </span>
              <span className="pl-4 text-xs leading-snug text-muted-foreground">
                {t("{d} dias · {v} vezes", { d: rp.dias.length, v: rp.vezes })} · {rp.clientes.map((c) => nomeDe(c)).join(", ")} ·{" "}
                {t("último {dia}", { dia: fmtDia.format(new Date(rp.ultimo)) })}
                <span className="sr-only"> ({r.gravidade[rp.gravidade]})</span>
              </span>
              {rp.voltouDepoisDeCorrigido ? (
                <span className="pl-4">
                  <Selo tom="perigo">{t("Voltou depois de corrigido")}</Selo>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
