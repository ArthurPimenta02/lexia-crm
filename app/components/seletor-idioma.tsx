"use client";

import { Check, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { mudarIdiomaAction } from "@/app/actions/idioma";
import { useIdioma } from "@/app/components/idioma";
import { BANDEIRA_DO_IDIOMA, IDIOMAS, NOME_DO_IDIOMA } from "@/lib/i18n/idiomas";

/**
 * Troca o idioma do painel. A escolha fica guardada neste navegador.
 * `para` decide para que lado o menu abre: para cima no fundo da barra
 * lateral, para baixo no ecrã de entrada.
 */
export function SeletorIdioma({
  className = "",
  para = "cima",
}: {
  className?: string;
  para?: "cima" | "baixo";
}) {
  const { idioma, t } = useIdioma();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aMudar, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div className={`relative ${className}`} ref={caixa}>
      <button
        aria-expanded={aberto}
        aria-haspopup="listbox"
        className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-muted transition hover:bg-muted hover:text-sidebar-foreground disabled:opacity-60"
        disabled={aMudar}
        onClick={() => setAberto((a) => !a)}
        type="button"
      >
        <Languages aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{NOME_DO_IDIOMA[idioma]}</span>
        <span aria-hidden="true">{BANDEIRA_DO_IDIOMA[idioma]}</span>
      </button>

      {aberto ? (
        <ul
          aria-label={t("Idioma")}
          className={`absolute inset-x-0 z-50 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-[0_12px_32px_rgba(0,0,0,0.12)] ${
            para === "cima" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
          role="listbox"
        >
          {IDIOMAS.map((opcao) => (
            <li key={opcao}>
              <button
                aria-selected={opcao === idioma}
                className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-foreground transition hover:bg-muted"
                onClick={() => {
                  setAberto(false);
                  if (opcao === idioma) return;
                  iniciar(async () => {
                    await mudarIdiomaAction(opcao);
                    router.refresh();
                  });
                }}
                role="option"
                type="button"
              >
                <span aria-hidden="true">{BANDEIRA_DO_IDIOMA[opcao]}</span>
                <span className="flex-1">{NOME_DO_IDIOMA[opcao]}</span>
                {opcao === idioma ? <Check aria-hidden="true" className="h-4 w-4" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
