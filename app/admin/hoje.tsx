import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";

import { saudacaoDaHora } from "@/lib/dashboard/series";
import { horasDesde, type Hoje } from "@/lib/admin/hoje";
import type { FuncaoT } from "@/lib/i18n/traduzir";

/**
 * "Hoje" no topo do admin (desenho 2B aprovado a 14/11/2026): um cartão por
 * cliente com o número que pede ação, na cor da urgência; por baixo as
 * marcações novas, os handoffs com o motivo, a agenda de hoje e os problemas.
 */

const COR = {
  perigo: "var(--ds-perigo)",
  alerta: "var(--ds-alerta)",
  ouro: "var(--ds-ouro)",
  positivo: "var(--ds-positivo)",
} as const;

const hora = (iso: string, timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
const dia = (iso: string, timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));

export function SecaoHoje({ hoje, t, locale, agora }: { hoje: Hoje; t: FuncaoT; locale: string; agora: number }) {
  const precisam = hoje.cartoes.filter((c) => c.tom !== "positivo");
  const titulo =
    precisam.length === 0 ? t("Tudo em dia.")
    : precisam.length === 1 ? t("{nome} precisa de atenção.", { nome: precisam[0].nome })
    : t("{n} clientes precisam de atenção.", { n: precisam.length });
  const resumo = [
    hoje.marcacoes.length === 0 ? t("nenhuma marcação nova pela agente") : hoje.marcacoes.length === 1 ? t("1 marcação nova pela agente") : t("{n} marcações novas pela agente", { n: hoje.marcacoes.length }),
    hoje.handoffs.length === 0 ? t("nenhum handoff") : hoje.handoffs.length === 1 ? t("1 handoff") : t("{n} handoffs", { n: hoje.handoffs.length }),
  ].join(" · ");

  return (
    <section aria-labelledby="titulo-hoje" className="flex min-w-0 flex-col gap-5">
      <header className="ds-entrar flex flex-col gap-2">
        <p className="ds-sobretitulo">Lexia {"//"} {t("Hoje")}</p>
        <h1 className="ds-titulo-1 text-foreground" id="titulo-hoje">
          <span className="text-muted-foreground">{t(saudacaoDaHora("America/Sao_Paulo"))}.</span>{" "}
          {titulo}
        </h1>
        <p className="text-sm text-muted-foreground">{t("Últimas 24 horas")} · {resumo}</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {hoje.cartoes.map((c, i) => (
          <Link
            className="ds-bloco ds-interativo ds-entrar flex min-w-0 flex-col gap-4 p-5"
            href={`/admin/clientes/${encodeURIComponent(c.slug)}`}
            key={c.slug}
            style={{ ["--i" as string]: i + 1 }}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: c.situacao === "teste" ? "var(--ds-ouro)" : "var(--ds-positivo)" }}
              />
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{c.nome}</span>
              {c.situacao === "teste" ? <span className="ds-selo ds-selo-ouro">{t("Em teste")}</span> : null}
              <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            {/*
              O número é a coisa grande do cartão: fino, apertado, na cor da
              urgência, com a frase por baixo (não ao lado, que partia em
              cartões estreitos). Sem nada pendente, um visto no lugar do zero.
            */}
            <div className="flex items-end gap-3">
              {c.numero === 0 ? (
                <span
                  aria-hidden="true"
                  className="grid h-12 w-12 place-items-center rounded-full"
                  style={{ background: `color-mix(in oklab, ${COR.positivo} 16%, transparent)`, color: COR.positivo }}
                >
                  <Check className="h-6 w-6" strokeWidth={2.4} />
                </span>
              ) : (
                <span
                  className="text-[3.25rem] leading-[0.85] font-[550] tracking-[-0.045em] tabular-nums"
                  style={{ color: COR[c.tom] }}
                >
                  {c.numero}
                </span>
              )}
              <span className="pb-0.5 text-sm leading-tight font-medium text-foreground">{c.frase}</span>
            </div>
            <div className="flex min-h-10 flex-col gap-0.5 border-t border-border pt-3 text-[0.8125rem] text-muted-foreground">
              {c.linhas.length === 0 ? <span>{t("Nada pendente.")}</span> : null}
              {c.linhas.map((l) => (
                <span className="truncate" key={l}>{l}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="ds-bloco min-w-0 p-5">
          <h2 className="ds-titulo-3 mb-3 text-foreground">{t("Marcações novas")}</h2>
          {hoje.marcacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhuma marcação pela agente nas últimas 24 horas.")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {hoje.marcacoes.slice(0, 6).map((m) => (
                <li className="flex flex-col gap-0.5" key={`${m.slug}-${m.inicio}-${m.titulo}`}>
                  <span className="text-sm text-foreground">{m.titulo}</span>
                  <span className="text-[0.8125rem] text-muted-foreground">
                    {hoje.nomes[m.slug] ?? m.slug} · {dia(m.inicio, m.timeZone, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ds-bloco min-w-0 p-5">
          <h2 className="ds-titulo-3 mb-3 text-foreground">{t("Handoffs")}</h2>
          {hoje.handoffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhum handoff nas últimas 24 horas.")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {hoje.handoffs.slice(0, 6).map((h) => (
                <li className="flex flex-col gap-0.5" key={`${h.slug}-${h.conversa}-${h.em}`}>
                  <span className="text-sm text-foreground">{h.motivo}</span>
                  <span className="text-[0.8125rem] text-muted-foreground">
                    {hoje.nomes[h.slug] ?? h.slug} · {t("há {n} h", { n: horasDesde(Date.parse(h.em), agora) })}
                    {h.prioridade === "alta" ? <span className="ds-selo ds-selo-perigo ml-2">{t("Prioridade alta")}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        <section className="ds-bloco min-w-0 p-5">
          <h2 className="ds-titulo-3 mb-3 text-foreground">{t("Agenda de hoje")}</h2>
          {hoje.agenda.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nada marcado para hoje.")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {hoje.agenda.slice(0, 10).map((a) => (
                <li className="flex items-baseline gap-3" key={`${a.slug}-${a.inicio}-${a.titulo}`}>
                  <span className="w-12 shrink-0 font-semibold tabular-nums text-foreground">{hora(a.inicio, a.timeZone, locale)}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="min-w-0 truncate text-sm text-foreground sm:flex-1">{a.titulo}</span>
                    <span className="shrink-0 text-[0.8125rem] text-muted-foreground">
                      {hoje.nomes[a.slug] ?? a.slug}
                      {a.pelaAgente ? <span className="ml-1 text-accent">· {t("pela agente")}</span> : null}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hoje.agenda.length > 0 ? <p className="ds-legenda mt-3">{t("Horas no fuso de cada cliente.")}</p> : null}
        </section>

        <section className="ds-bloco min-w-0 p-5">
          <h2 className="ds-titulo-3 mb-3 text-foreground">{t("Problemas")}</h2>
          {hoje.problemas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhum erro nas últimas 24 horas.")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {hoje.problemas.map((p) => (
                <li className="flex flex-col gap-0.5" key={p.slug}>
                  <span className="text-sm text-foreground">
                    {p.quantos === 1 ? t("{nome}: 1 atendimento com erro", { nome: hoje.nomes[p.slug] ?? p.slug }) : t("{nome}: {n} atendimentos com erro", { nome: hoje.nomes[p.slug] ?? p.slug, n: p.quantos })}
                  </span>
                  <span className="truncate text-[0.8125rem] text-muted-foreground">{p.erro}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
