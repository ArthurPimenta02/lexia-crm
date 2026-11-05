"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useIdioma } from "@/app/components/idioma";

import { PainelAjudante } from "./painel-ajudante";
import { CabecaMascoteFab } from "@/app/components/mascote";

/**
 * O botão do Analista Lexia, sempre no canto do painel (como o Sidekick):
 * abre a conversa num painel ao lado, sem sair da tela onde se está.
 * Na Lexia (admin) a conversa é sobre a empresa da página (`?cliente=`).
 */
function Lancador({ base }: { base: "/app" | "/admin" }) {
  const { t } = useIdioma();
  const caminho = usePathname();
  const params = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const cliente = base === "/admin" ? params.get("cliente") ?? undefined : undefined;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setAberto((v) => !v); }
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  // Na tela inteira do Analista o botão não faz falta.
  if (caminho.startsWith(`${base}/analista`)) return null;

  return (
    <>
      {aberto ? (
        <aside aria-label={t("Analista Lexia")} className="fixed inset-y-0 right-0 z-50 w-full max-w-[440px] pt-[env(safe-area-inset-top,0px)]">
          <PainelAjudante
            cliente={cliente}
            modo="lateral"
            onFechar={() => setAberto(false)}
            tela={caminho}
            telaInteira={`${base}/analista${cliente ? `?cliente=${encodeURIComponent(cliente)}` : ""}`}
          />
        </aside>
      ) : (
        <button
          aria-label={t("Analista Lexia")}
          className="fixed right-6 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 flex rounded-full transition hover:scale-105 active:scale-95"
          onClick={() => setAberto(true)}
          title={`${t("Pergunte à Lexia")} (⌘J)`}
          type="button"
        >
          <CabecaMascoteFab tamanho={58} />
        </button>
      )}
    </>
  );
}

export function LancadorAjudante({ base }: { base: "/app" | "/admin" }) {
  return (
    <Suspense fallback={null}>
      <Lancador base={base} />
    </Suspense>
  );
}
