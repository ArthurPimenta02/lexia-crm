"use client";

import {
  BellRing,
  Ban,
  CalendarDays,
  CircleDot,
  FlaskConical,
  LayoutDashboard,
  LifeBuoy,
  LoaderCircle,
  Megaphone,
  MessagesSquare,
  Package,
  PlugZap,
  Route,
  SquareKanban,
  Star,
  Telescope,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import { useIdioma } from "@/app/components/idioma";

/**
 * A navegação do painel.
 *
 * Porque é que o ícone vem como texto e não como componente
 * ---------------------------------------------------------
 * A lista de páginas é escrita nos layouts, que correm no servidor, e isto
 * corre no navegador. Entre os dois só passam dados — uma função de ícone não
 * atravessa essa fronteira. Por isso o layout manda o nome do ícone e a
 * tradução para desenho acontece aqui.
 */

export const icones: Record<string, LucideIcon> = {
  agenda: CalendarDays,
  analista: Telescope,
  campanhas: Megaphone,
  clientes: Users,
  conversas: MessagesSquare,
  dashboard: LayoutDashboard,
  feedbacks: Star,
  handoffs: LifeBuoy,
  pipeline: SquareKanban,
  produtos: Package,
  servicos: Wrench,
  testes: FlaskConical,
  turnos: Route,
  followups: BellRing,
  conexoes: PlugZap,
  bloqueios: Ban,
};

export type SidebarNavItem = {
  href: string;
  icon?: string;
  /**
   * Ecrã fechado para este cliente. Continua à vista — é como ele sabe que o
   * painel tem mais do que aquilo que lhe abriram — mas deixa de ser um link.
   */
  indisponivel?: boolean;
  label: string;
};

type SidebarNavProps = {
  groupLabel: string;
  items: SidebarNavItem[];
  onNavigate?: () => void;
};

/**
 * O rodinha a girar enquanto a página seguinte carrega.
 *
 * Fica sempre no sítio, visível ou não, para o item não saltar de largura
 * quando se carrega nele.
 */
function SidebarLinkStatus() {
  const { pending } = useLinkStatus();

  return (
    <LoaderCircle
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 animate-spin transition-opacity ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

export function estaActivo(href: string, pathname: string) {
  return (
    pathname === href ||
    (href !== "/app" && href !== "/admin" && pathname.startsWith(`${href}/`))
  );
}

export function SidebarNav({ groupLabel, items, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { t } = useIdioma();

  return (
    <nav className="flex flex-col gap-0.5">
      <p className="ds-sobretitulo mb-2 px-3">
        {groupLabel}
      </p>

      {items.map((item) => {
        const activo = estaActivo(item.href, pathname);
        const Icone = icones[item.icon ?? ""] ?? CircleDot;

        if (item.indisponivel) {
          /*
            Um `<span>`, não um `<Link>` desactivado: um `<a>` sem `href` ainda
            aparece na tecla Tab e ainda se pode abrir em nova janela com o
            botão do meio. O que não é link não se comporta como link.
          */
          return (
            <span
              aria-disabled="true"
              className="flex min-h-9 cursor-not-allowed items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-[0.8125rem] font-medium text-sidebar-muted opacity-50"
              key={item.href}
              title={t("Tela indisponível nesta conta")}
            >
              <Icone
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
                strokeWidth={1.8}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="shrink-0 rounded border border-sidebar-border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                {t("Indisponível")}
              </span>
            </span>
          );
        }

        return (
          <Link
            aria-current={activo ? "page" : undefined}
            className={`group relative flex min-h-9 items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-[0.8125rem] transition-[background-color,color] duration-150 ${
              activo
                ? "bg-sidebar-active font-semibold text-sidebar-active-foreground before:absolute before:top-2 before:bottom-2 before:-left-2.5 before:w-[3px] before:rounded-r-full before:bg-primary"
                : "font-medium text-sidebar-muted hover:bg-muted hover:text-sidebar-foreground"
            }`}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icone
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 transition ${
                activo
                  ? ""
                  : "text-sidebar-muted group-hover:text-sidebar-foreground"
              }`}
              strokeWidth={activo ? 2.2 : 1.8}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <SidebarLinkStatus />
          </Link>
        );
      })}
    </nav>
  );
}
