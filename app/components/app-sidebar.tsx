"use client";

import { LogOut, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { logoutAction } from "@/app/actions/auth";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { useIdioma } from "@/app/components/idioma";
import { LexiaBrand } from "@/app/components/lexia-brand";
import { SeletorIdioma } from "@/app/components/seletor-idioma";
import { SeletorTema } from "@/app/components/seletor-tema";
import {
  estaActivo,
  SidebarNav,
  type SidebarNavItem,
} from "@/app/components/sidebar-nav";
import { SinoAvisos, useAvisos } from "@/app/components/sino-avisos";
import { BarraDoApp } from "@/app/components/barra-do-app";

/**
 * A moldura do painel: barra lateral no computador, gaveta no telemóvel.
 *
 * Porque é que o "Sair" andava a fugir
 * ------------------------------------
 * A barra era uma coluna normal ao lado do conteúdo, e uma coluna cresce até
 * à altura do que está ao lado dela. Na lista de clientes, com as fichas
 * abertas, isso dava uma coluna de milhares de píxeis — e o "Sair", que vive
 * no fundo dela, ia a reboque. Para sair da conta era preciso descer a
 * página inteira.
 *
 * A cura não é aqui, é no layout: quem rola agora é o `<main>`, não a
 * janela. A barra ocupa a altura do ecrã e fica quieta. Aqui dentro só a
 * navegação rola, se as páginas não couberem; a marca em cima e o "Sair" em
 * baixo estão fora dessa zona, por isso estão sempre no mesmo sítio.
 */

type AppSidebarProps = {
  /** Um segundo grupo por baixo do menu (no admin: acesso rápido a cada cliente). */
  atalhos?: { items: SidebarNavItem[]; titulo: string };
  /** O sino. Fora no painel de administração, que não tem avisos. */
  comSino?: boolean;
  items: SidebarNavItem[];
  subtitle: string;
};

export function AppSidebar({
  atalhos,
  comSino = false,
  items,
  subtitle,
}: AppSidebarProps) {
  const { t } = useIdioma();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const paginaActual = items.find((item) => estaActivo(item.href, pathname));
  /*
   * Uma leitura só, partilhada pelos dois sinos.
   *
   * O sino tem de estar nos dois sítios porque nenhum dos dois se vê sempre:
   * a barra de cima é `lg:hidden` e o topo da barra lateral está fora do ecrã
   * no telemóvel enquanto a gaveta estiver fechada. Como os dois estão
   * montados, o estado tem de vir de fora — senão cada página do produto
   * fazia a mesma leitura duas vezes.
   */
  const avisos = useAvisos(comSino);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      {/*
        No telemóvel a barra de cima diz em que página se está. Antes dizia
        sempre "Lexia AI", que é a única coisa que quem está lá dentro já
        sabe.
      */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] items-center gap-3 border-b border-sidebar-border bg-[var(--ds-vidro)] px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl lg:hidden">
        <button
          aria-controls="lexia-menu"
          aria-expanded={isOpen}
          aria-label={t("Abrir menu")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition hover:bg-muted"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            {paginaActual?.label ?? subtitle}
          </p>
        </div>

        {comSino ? <SinoAvisos estado={avisos} /> : null}

        <LexiaBrand compact showText={false} tone="light" />
      </header>

      {isOpen ? (
        <button
          aria-label={t("Fechar menu")}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsOpen(false)}
          type="button"
        />
      ) : null}

      {/*
        O `z-50` vale também no computador, e isso não é um descuido.

        O `lg:translate-x-0` faz desta barra um contexto de empilhamento
        próprio — é o que qualquer deslocação faz. Com `z-auto`, esse contexto
        inteiro caía ao mesmo nível dos elementos posicionados do `<main>`, e
        aí quem decide é a ordem do documento: o `<main>` vem depois, logo
        ganhava. Via-se na lista de avisos, com os ícones de informação dos
        cartões desenhados por cima dela.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[84%] max-w-[16rem] shrink-0 flex-col border-r border-sidebar-border bg-[var(--ds-vidro)] backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:static lg:h-full lg:w-[15.5rem] lg:max-w-none lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        id="lexia-menu"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-5 lg:pt-5">
          <LexiaBrand compact tone="light" />
          {comSino ? (
            <SinoAvisos
              ancora="esquerda"
              className="hidden lg:block"
              estado={avisos}
            />
          ) : null}
          <button
            aria-label={t("Fechar menu")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted transition hover:bg-muted hover:text-sidebar-foreground lg:hidden"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {/* A única zona que rola. Tudo o resto fica onde está. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
          <SidebarNav
            groupLabel={subtitle}
            items={items}
            onNavigate={() => setIsOpen(false)}
          />
          {atalhos && atalhos.items.length > 0 ? (
            <div className="mt-6">
              <SidebarNav
                groupLabel={atalhos.titulo}
                items={atalhos.items}
                onNavigate={() => setIsOpen(false)}
              />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-1 border-t border-sidebar-border p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] lg:pb-2.5">
          <SeletorTema compacto />
          <SeletorIdioma />
          <form action={logoutAction}>
            <FormSubmitButton
              className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-[0.8125rem] font-medium text-sidebar-muted transition hover:bg-muted hover:text-sidebar-foreground disabled:opacity-60"
              pendingLabel={t("Saindo...")}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {t("Sair")}
            </FormSubmitButton>
          </form>
        </div>
      </aside>
      <BarraDoApp items={items} onMais={() => setIsOpen(true)} />
    </>
  );
}
