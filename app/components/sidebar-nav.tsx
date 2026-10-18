"use client";

import {
  CircleDot,
  FlaskConical,
  LayoutDashboard,
  LifeBuoy,
  LoaderCircle,
  Megaphone,
  MessagesSquare,
  Package,
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

const icones: Record<string, LucideIcon> = {
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
};

export type SidebarNavItem = {
  href: string;
  icon?: string;
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

  return (
    <nav className="flex flex-col gap-1">
      <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.22em] text-sidebar-muted uppercase">
        {groupLabel}
      </p>

      {items.map((item) => {
        const activo = estaActivo(item.href, pathname);
        const Icone = icones[item.icon ?? ""] ?? CircleDot;

        return (
          <Link
            aria-current={activo ? "page" : undefined}
            className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              activo
                ? "bg-sidebar-active font-semibold text-sidebar-active-foreground"
                : "font-medium text-sidebar-muted hover:bg-muted hover:text-sidebar-foreground"
            }`}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icone
              aria-hidden="true"
              className={`h-[18px] w-[18px] shrink-0 transition ${
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
