"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useIdioma } from "@/app/components/idioma";
import { estaActivo, icones, type SidebarNavItem } from "@/app/components/sidebar-nav";

/**
 * A barra de abas de baixo, só dentro do app do iPhone.
 *
 * No navegador o painel continua igual (menu de cima). Dentro da casca nativa
 * a `PonteDoApp` põe a classe `no-app` no `<html>`, e o CSS mostra esta barra
 * (ver `.barra-do-app` em globals.css). Três telas do dia a dia à mão do
 * polegar e "Mais" abre o menu completo.
 */

/** As telas que valem uma aba, pela ordem de preferência. */
const PREFERIDAS = ["/app", "/admin", "/app/conversas", "/admin/clientes", "/app/agenda", "/admin/turnos"];

export function abasDoApp(items: SidebarNavItem[]) {
  return PREFERIDAS.map((href) => items.find((item) => item.href === href && !item.indisponivel))
    .filter((item): item is SidebarNavItem => Boolean(item))
    .slice(0, 3);
}

export function BarraDoApp({ items, onMais }: { items: SidebarNavItem[]; onMais: () => void }) {
  const pathname = usePathname();
  const { t } = useIdioma();
  const abas = abasDoApp(items);
  const algumaActiva = abas.some((aba) => estaActivo(aba.href, pathname));

  return (
    <nav aria-label={t("Navegação do app")} className="barra-do-app">
      {abas.map((aba) => {
        const Icone = (aba.icon ? icones[aba.icon] : undefined) ?? Menu;
        const activa = estaActivo(aba.href, pathname);

        return (
          <Link aria-current={activa ? "page" : undefined} className="barra-do-app__aba" data-activa={activa} href={aba.href} key={aba.href}>
            <Icone aria-hidden="true" className="h-[22px] w-[22px]" />
            <span>{aba.label}</span>
          </Link>
        );
      })}
      <button className="barra-do-app__aba" data-activa={!algumaActiva} onClick={onMais} type="button">
        <Menu aria-hidden="true" className="h-[22px] w-[22px]" />
        <span>{t("Mais")}</span>
      </button>
    </nav>
  );
}
