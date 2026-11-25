import { ArrowUpRight, ChevronRight, Repeat2 } from "lucide-react";
import Link from "next/link";

import { ItemAcoes } from "@/app/admin/analises/item-acoes";
import { NovoPedido } from "@/app/admin/analises/novo-pedido";
import { Selo } from "@/app/components/ds";
import { AvisoLinha, CabecalhoTela, FiltroTrilho, VazioTela } from "@/app/components/tela";
import { DIAS_DOS_REPETIDOS, lerAnalises, type Analise, type ItemAnalise } from "@/lib/analises/read";
import {
  contagemTotal,
  contagensPorCliente,
  eResolvido,
  eGravidade,
  errosQueSeRepetem,
  eVista,
  linkDaConversa,
  separarItens,
  totalPorResolver,
  type Contagem,
  type EstadoItem,
  type Gravidade,
  type Repetido,
  type Vista,
} from "@/lib/analises/regras";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILTRO_OCULTOS } from "@/lib/clientes/ocultos";

/**
 * Análises das conversas (19/11/2026; simplificada no mesmo dia). À esquerda
 * (no celular, em cima, a deslizar) as análises mais recentes; ao meio a
 * escolhida, com um cartão por cliente e os achados; por baixo, os erros que
 * se repetem em vários dias.
 *
 * Regra da tela: erro contado é erro POR RESOLVER (novo ou visto). Corrigidos
 * e falsos alarmes nunca entram nos números de graves/médios/detalhes; ficam
 * num grupo recolhido "Já corrigidos (N)" no fim. Os filtros ficam no
 * endereço (?cliente, ?estado=corrigidos|todos, ?analise).
 */

type Filtros = { analise: string; cliente: string; estado: string };

const FUSO = "America/Sao_Paulo";
const ERROS = ["grave", "medio", "detalhe"] as const;
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
    /** "2 detalhes", "1 grave". */
    quantos: (g: (typeof ERROS)[number], n: number) =>
      g === "grave"
        ? n === 1 ? t("{n} grave", { n }) : t("{n} graves", { n })
        : g === "medio"
          ? n === 1 ? t("{n} médio", { n }) : t("{n} médios", { n })
          : n === 1 ? t("{n} detalhe", { n }) : t("{n} detalhes", { n }),
    corrigidos: (n: number) => (n === 1 ? t("{n} corrigido", { n }) : t("{n} corrigidos", { n })),
    correuBem: (n: number) => (n === 1 ? t("{n} correu bem", { n }) : t("{n} correram bem", { n })),
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
  for (const k of ["cliente", "estado", "analise"] as const) if (n[k]) p.set(k, n[k]);
  const q = p.toString();
  return q ? `/admin/analises?${q}` : "/admin/analises";
}

/** "2 detalhes · 1 médio" só com o que existe; vazio quando não há nada por resolver. */
function divisao(c: Contagem, r: Rotulos) {
  return ERROS.filter((g) => c[g] > 0)
    .map((g) => r.quantos(g, c[g]))
    .join(" · ");
}

/** A cor do número: a do erro mais grave por resolver; cinza quando é zero. */
function corDoPior(c: Contagem) {
  const pior = ERROS.find((g) => c[g] > 0);
  return pior ? COR_GRAVIDADE[pior] : "var(--ds-texto-3)";
}

/** A tela sem a verificação de acesso (quem chama já confirmou `lexia_admin`). */
export async function AnalisesVista({ filtros: pedidos }: { filtros: Filtros }) {
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const r = rotulos(t);
  const admin = createAdminClient();

  const { data: clientesData } = await admin.from("lexia_clientes").select("slug, nome").not("slug", "in", FILTRO_OCULTOS).order("nome");
  const clientes = (clientesData ?? [])
    .filter((c) => !["cliente_teste", "clinica_teste"].includes(c.slug as string))
    .map((c) => ({ nome: (c.nome as string | null) || (c.slug as string), slug: c.slug as string }));
  const nomes = new Map(clientes.map((c) => [c.slug, c.nome]));
  const nomeDe = (slug: string | null) => (slug ? (nomes.get(slug) ?? slug) : t("Todos os clientes"));

  // Só valores conhecidos entram nos filtros e na consulta. Sem `estado`, a vista é "por resolver".
  const filtros: Filtros = {
    analise: /^[0-9a-f-]{36}$/i.test(pedidos.analise) ? pedidos.analise : "",
    cliente: nomes.has(pedidos.cliente) ? pedidos.cliente : "",
    estado: eVista(pedidos.estado) && pedidos.estado !== "por_resolver" ? pedidos.estado : "",
  };
  const vista: Vista = (filtros.estado || "por_resolver") as Vista;

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

  const doCliente = (it: { cliente_slug: string }) => !filtros.cliente || it.cliente_slug === filtros.cliente;
  const itensDoCliente = itensSelecionada.filter(doCliente);
  // O título conta a análise escolhida (a mesma dos cartões e da lista de itens), só o que está por resolver.
  const total = contagemTotal(itensDoCliente);

  const repetidos = errosQueSeRepetem(repetidosBase.filter(doCliente)).slice(0, 12);

  const fmtData = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: FUSO });
  const fmtDia = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: FUSO });

  const titulo = !selecionada
    ? { resto: t("O que os agentes erraram e por quê") }
    : total.grave > 0
      ? { destaque: String(total.grave), resto: total.grave === 1 ? t("erro grave por resolver") : t("erros graves por resolver") }
      : { resto: t("Nada grave por resolver") };

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
            <FiltroTrilho
              opcoes={[
                { ativo: vista === "por_resolver", href: hrefCom(filtros, { estado: "" }), label: t("Por resolver"), quantidade: totalPorResolver(total) },
                { ativo: vista === "corrigidos", href: hrefCom(filtros, { estado: "corrigidos" }), label: t("Corrigidos"), quantidade: total.corrigidos },
                { ativo: vista === "todos", href: hrefCom(filtros, { estado: "todos" }), label: t("Todos") },
              ]}
              rotulo={t("Estado")}
            />
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
            {/* Lista: no celular desliza na horizontal; no computador é a coluna da esquerda. */}
            <nav aria-label={t("Análises")} className="min-w-0 lg:col-start-1 lg:row-start-1">
              <p className="ds-sobretitulo mb-2 px-1">{t("Análises")}</p>
              <ol className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
                {analises.map((a) => {
                  const c = contagemTotal(itensDaLista.filter((i) => i.analise_id === a.id && doCliente(i)));
                  const ativa = selecionada?.id === a.id;
                  const pronta = a.estado === "concluida";
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
                          {pronta ? null : (
                            <Selo tom={a.estado === "falhou" ? "perigo" : "ouro"}>{r.estadoAnalise[a.estado] ?? a.estado}</Selo>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {r.tipo[a.tipo] ?? a.tipo} · {nomeDe(a.cliente_slug)}
                          {a.pedido ? ` · ${a.pedido}` : ""}
                        </span>
                        {pronta ? <ContagemEmLinha contagem={c} r={r} t={t} /> : null}
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
                  itensDoCliente={itensDoCliente}
                  locale={locale}
                  nomeDe={nomeDe}
                  r={r}
                  t={t}
                  vista={vista}
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

/** Na lista de análises: o que está por resolver; os corrigidos só em cinza ao lado. */
function ContagemEmLinha({ contagem, r, t }: { contagem: Contagem; r: Rotulos; t: FuncaoT }) {
  const abertos = totalPorResolver(contagem);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: abertos ? corDoPior(contagem) : "var(--ds-positivo)" }} />
        {abertos ? t("{coisas} por resolver", { coisas: divisao(contagem, r) }) : t("Nada por resolver")}
      </span>
      {contagem.corrigidos ? <span className="text-muted-foreground">· {r.corrigidos(contagem.corrigidos)}</span> : null}
    </span>
  );
}

type Rotulos = ReturnType<typeof rotulos>;

function DetalheAnalise({
  analise,
  filtros,
  fmtData,
  itensDoCliente,
  locale,
  nomeDe,
  r,
  t,
  vista,
}: {
  analise: Analise;
  filtros: Filtros;
  fmtData: Intl.DateTimeFormat;
  itensDoCliente: ItemAnalise[];
  locale: string;
  nomeDe: (slug: string | null) => string;
  r: Rotulos;
  t: FuncaoT;
  vista: Vista;
}) {
  const porCliente = contagensPorCliente(itensDoCliente);
  const { porResolver, positivos, resolvidos } = separarItens(itensDoCliente);
  const custo = analise.custo_estimado === null ? null : Number(analise.custo_estimado);
  const periodo =
    analise.periodo_inicio && analise.periodo_fim
      ? `${fmtData.format(new Date(analise.periodo_inicio))} → ${fmtData.format(new Date(analise.periodo_fim))}`
      : null;
  const emCurso = analise.estado === "pedida" || analise.estado === "a_correr";
  const lista = (itens: ItemAnalise[]) => (
    <ol className="flex min-w-0 flex-col gap-3">
      {itens.map((it) => (
        <li key={it.id}>
          <ItemCartao item={it} nomeDe={nomeDe} r={r} t={t} />
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <article className="ds-bloco ds-entrar flex min-w-0 flex-col gap-3 p-4 sm:p-6">
        <header className="flex min-w-0 flex-wrap items-center gap-2">
          <Selo tom="escuro">{r.tipo[analise.tipo] ?? analise.tipo}</Selo>
          {analise.estado === "concluida" ? null : (
            <Selo ponto tom={analise.estado === "falhou" ? "perigo" : "ouro"}>
              {r.estadoAnalise[analise.estado] ?? analise.estado}
            </Selo>
          )}
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
            const abertos = totalPorResolver(contagem);
            const rodape = [
              contagem.corrigidos ? r.corrigidos(contagem.corrigidos) : "",
              contagem.positivo ? r.correuBem(contagem.positivo) : "",
            ].filter(Boolean);
            return (
              <Link
                aria-current={ativo ? "true" : undefined}
                className={`ds-bloco ds-entrar flex min-w-0 flex-col gap-2 p-4 ${ativo ? "shadow-[0_0_0_2px_var(--ds-acao)]" : ""}`}
                href={hrefCom(filtros, { cliente: ativo ? "" : cliente_slug })}
                key={cliente_slug}
                scroll={false}
                style={{ ["--i" as string]: i + 1 }}
              >
                <span className="truncate text-sm font-semibold text-foreground">{nomeDe(cliente_slug)}</span>
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="ds-numero text-[2rem] leading-none" style={{ color: corDoPior(contagem) }}>
                    {abertos}
                  </span>
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {t("por resolver")}
                    {abertos ? <span className="text-muted-foreground"> · {divisao(contagem, r)}</span> : null}
                  </span>
                </span>
                {rodape.length ? <span className="truncate text-xs text-muted-foreground">{rodape.join(" · ")}</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}

      {emCurso ? null : itensDoCliente.length === 0 ? (
        <div className="ds-bloco">
          <VazioTela pose="feliz" texto={t("A análise não encontrou nada a apontar neste período.")} titulo={t("Nada a apontar")} />
        </div>
      ) : vista === "corrigidos" ? (
        resolvidos.length === 0 ? (
          <div className="ds-bloco">
            <VazioTela pose="piscadinha" texto={t("Quando marcar um erro como corrigido, ele aparece aqui.")} titulo={t("Nada corrigido ainda")} />
          </div>
        ) : (
          lista(resolvidos)
        )
      ) : (
        <>
          <section aria-label={t("Por resolver")} className="flex min-w-0 flex-col gap-3">
            {porResolver.length === 0 ? (
              <div className="ds-bloco">
                <VazioTela pose="feliz" titulo={t("Nada por resolver")} />
              </div>
            ) : (
              <>
                <h2 className="ds-sobretitulo px-1">
                  {t("Por resolver")} <span className="tabular-nums">({porResolver.length})</span>
                </h2>
                {lista(porResolver)}
              </>
            )}
          </section>

          {positivos.length > 0 ? (
            <section aria-label={t("O que correu bem")} className="flex min-w-0 flex-col gap-3">
              <h2 className="ds-sobretitulo px-1">
                {t("O que correu bem")} <span className="tabular-nums">({positivos.length})</span>
              </h2>
              {lista(positivos)}
            </section>
          ) : null}

          {resolvidos.length > 0 ? (
            <details className="group min-w-0" open={vista === "todos"}>
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[12px] bg-[color-mix(in_oklab,var(--ds-texto)_3%,transparent)] px-3.5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-90" />
                {t("Já corrigidos ({n})", { n: resolvidos.length })}
              </summary>
              <div className="mt-3">{lista(resolvidos)}</div>
            </details>
          ) : null}
        </>
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
  const resolvido = eResolvido(item.estado);

  return (
    <article
      className={`ds-bloco flex min-w-0 flex-col gap-3 border-l-[3px] p-4 sm:p-5 ${resolvido ? "bg-transparent" : ""}`}
      style={{ borderLeftColor: resolvido ? "var(--border)" : COR_GRAVIDADE[g] }}
    >
      <header className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* Resolvido: o selo do estado vem primeiro e bem visível; o resto do cartão fica apagado. */}
          {resolvido ? (
            <Selo ponto tom={item.estado === "corrigido" ? "verde" : "neutro"}>
              {r.estadoItem[item.estado as EstadoItem]}
            </Selo>
          ) : null}
          <span className={resolvido ? "opacity-55" : ""}>
            <Selo tom={TOM_GRAVIDADE[g]}>{r.gravidade[g]}</Selo>
          </span>
          <span className="text-xs text-muted-foreground">{nomeDe(item.cliente_slug)}</span>
          {item.estado === "visto" ? <span className="text-xs text-muted-foreground">· {r.estadoItem.visto}</span> : null}
        </div>
        <h3 className={`ds-titulo-3 [overflow-wrap:anywhere] ${resolvido ? "text-muted-foreground line-through decoration-1" : "text-foreground"}`}>
          {item.titulo}
        </h3>
        {link ? (
          <Link className="inline-flex w-fit max-w-full items-center gap-1 text-xs font-medium text-[var(--ds-acao-forte)] underline-offset-2 hover:underline" href={link}>
            <span className="truncate">{t("Abrir conversa")}</span>
            <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
          </Link>
        ) : item.identificador_conversa ? (
          <span className="truncate text-xs text-muted-foreground">{item.identificador_conversa}</span>
        ) : null}
      </header>

      <div className={`flex min-w-0 flex-col gap-3 ${resolvido ? "opacity-55" : ""}`}>
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
      </div>

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
