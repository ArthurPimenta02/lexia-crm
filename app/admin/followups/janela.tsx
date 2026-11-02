"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A janela do detalhe de um follow-up. Abre pelo endereço (?fu=<id>), para
 * poder ser partilhada e para o "voltar" do navegador a fechar. Fecha com
 * Esc, com um clique fora ou no X.
 */
export function Janela({ titulo, fechar, children }: { titulo: string; fechar: string; children: ReactNode }) {
  const painel = useRef<HTMLDivElement>(null);
  const botaoFechar = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    painel.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") botaoFechar.current?.click();
    };
    document.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <Link aria-label="Fechar" className="absolute inset-0 bg-foreground/30" href={fechar} replace scroll={false} />
      <div
        aria-labelledby="janela-titulo"
        aria-modal="true"
        className="relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-[0_12px_40px_rgba(16,19,26,0.18)] outline-none sm:rounded-2xl"
        ref={painel}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground" id="janela-titulo">
            {titulo}
          </h2>
          <Link
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            href={fechar}
            ref={botaoFechar}
            replace
            scroll={false}
          >
            <X aria-hidden className="size-4" />
          </Link>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
