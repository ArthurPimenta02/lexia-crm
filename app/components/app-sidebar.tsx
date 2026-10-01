"use client";

import { useEffect, useState } from "react";

import { logoutAction } from "@/app/actions/auth";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { LexiaBrand } from "@/app/components/lexia-brand";
import { SidebarNav } from "@/app/components/sidebar-nav";

type AppSidebarProps = {
  items: { href: string; label: string }[];
  subtitle: string;
};

// Desktop: barra lateral fixa. Mobile: barra superior compacta com menu
// hambúrguer que abre a mesma navegação numa gaveta.
export function AppSidebar({ items, subtitle }: AppSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

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
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-900 bg-[#050505] px-4 lg:hidden">
        <div className="flex items-center gap-2.5">
          <LexiaBrand compact showText={false} />
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold text-zinc-50">Lexia AI</p>
            <p className="text-[11px] text-zinc-400">{subtitle}</p>
          </div>
        </div>
        <button
          aria-controls="lexia-menu"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 transition hover:bg-white/10"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20">
            {isOpen ? (
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            ) : (
              <path
                d="M3.5 6h13M3.5 10h13M3.5 14h13"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            )}
          </svg>
        </button>
      </header>

      {isOpen ? (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setIsOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-72 shrink-0 flex-col overflow-y-auto border-r border-zinc-900 bg-[#050505] px-5 py-6 shadow-[18px_0_60px_rgba(0,0,0,0.18)] transition-transform duration-200 lg:static lg:z-auto lg:w-72 lg:max-w-none lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        id="lexia-menu"
      >
        <div className="mb-8">
          <LexiaBrand compact />
          <p className="mt-3 text-sm font-medium text-zinc-400">{subtitle}</p>
        </div>

        <SidebarNav
          groupLabel="AGENTE"
          items={items}
          onNavigate={() => setIsOpen(false)}
          variant="dark"
        />

        <form action={logoutAction}>
          <FormSubmitButton
            className="h-11 w-full rounded-md border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
            pendingLabel="Saindo..."
          >
            Sair
          </FormSubmitButton>
        </form>
      </aside>
    </>
  );
}
