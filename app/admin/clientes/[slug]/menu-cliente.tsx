import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { FuncaoT } from "@/lib/i18n/traduzir";

/**
 * A casa do cliente (14/11/2026): as telas que saíram do menu do admin,
 * agrupadas pelo que se vai fazer. Cada link abre a tela de sempre já filtrada
 * por este cliente (`?cliente=<slug>`).
 */

type Item = { label: string; href: string; aviso?: number };

export function MenuDoCliente({
  slug,
  t,
  feedbacksPendentes,
  handoffsPendentes,
  temFollowups,
}: {
  slug: string;
  t: FuncaoT;
  feedbacksPendentes: number;
  handoffsPendentes: number;
  temFollowups: boolean;
}) {
  const c = `?cliente=${encodeURIComponent(slug)}`;
  const grupos: { titulo: string; itens: Item[] }[] = [
    {
      titulo: t("Atendimento"),
      itens: [
        { label: t("Conversas"), href: `/admin/conversas${c}` },
        ...(temFollowups ? [{ label: t("Follow-ups e lembretes"), href: "/admin/followups" }] : []),
        { label: t("Handoffs"), href: `/admin/handoffs${c}`, aviso: handoffsPendentes },
        { label: t("Feedbacks"), href: `/admin/feedbacks${c}`, aviso: feedbacksPendentes },
      ],
    },
    {
      titulo: t("Vendas"),
      itens: [
        { label: t("Campanhas"), href: `/admin/campanhas${c}` },
        { label: t("Eventos Meta"), href: `/admin/eventos-meta${c}` },
        { label: t("Serviços"), href: `/admin/servicos${c}` },
        { label: t("Produtos"), href: `/admin/produtos${c}` },
      ],
    },
    {
      titulo: t("Agente"),
      itens: [
        { label: t("Área de testes"), href: `/admin/area-testes${c}` },
        { label: t("Analista Lexia"), href: `/admin/analista${c}` },
        { label: t("Controle do agente"), href: `/admin/turnos${c}` },
        { label: t("Conexões"), href: `/admin/conexoes${c}` },
        { label: t("Bloqueios"), href: `/admin/bloqueios${c}` },
      ],
    },
    {
      titulo: t("Conta"),
      itens: [{ label: t("Configurações"), href: "#configuracoes" }],
    },
  ];

  return (
    <nav aria-label={t("Telas deste cliente")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {grupos.map((g, i) => (
        <section className="ds-bloco ds-entrar flex min-w-0 flex-col p-2" key={g.titulo} style={{ ["--i" as string]: i + 1 }}>
          <p className="ds-sobretitulo px-3 pt-2 pb-1.5">{g.titulo}</p>
          {g.itens.map((it) => (
            <Link
              className="group flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-sm text-foreground transition-colors hover:bg-muted"
              href={it.href}
              key={it.href}
            >
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.aviso ? (
                <span className="ds-selo ds-selo-alerta tabular-nums">{it.aviso}</span>
              ) : null}
              <ArrowUpRight
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>
          ))}
        </section>
      ))}
    </nav>
  );
}
