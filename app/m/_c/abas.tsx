"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { IcCalendario, IcCasa, IcConversa, IcMais, IcPontos } from "./icones";

/**
 * A barra de abas de baixo. Desde 25/11 (app focado na agenda): Hoje · Agenda
 * · (+) · Conversas · Mais. O + do meio abre o Novo agendamento de qualquer
 * tela; Resultados passou para dentro do Mais. O Analista Lexia, no Mais.
 *
 * O número em Conversas é a lista única de lib/movel/esperas.ts (o mesmo do
 * chip "Esperando" e do "Para fazer agora"). O número no ícone do iPhone vem
 * de /api/m/contagem em `emblema` e é escrito SEMPRE que o app abre ou volta
 * a ficar visível, também quando é 0 — assim um número velho nunca fica lá.
 */
type Rotulos = { agenda: string; conversas: string; hoje: string; mais: string; menu: string; novo: string };

// Telas que vivem dentro de "Mais": a aba Mais fica acesa nelas.
const DO_MAIS = ["/m/mais", "/m/campanhas", "/m/clientes", "/m/resultados", "/m/busca", "/m/testes", "/m/avisos"];

type Nativo = { definirEmblema?: (o: { n: number }) => Promise<void> };

export function AbasMovel({ rotulos, podeAgenda }: { rotulos: Rotulos; podeAgenda: boolean }) {
  const caminho = usePathname();
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/m/contagem", { cache: "no-store" });
        if (!r.ok || !vivo) return;
        const d = (await r.json()) as { esperas?: number; emblema?: number };
        setEspera(Number(d.esperas) || 0);
        const nativo = (window as unknown as { Capacitor?: { Plugins?: { LexiaNativo?: Nativo } } }).Capacitor?.Plugins?.LexiaNativo;
        void nativo?.definirEmblema?.({ n: Math.max(0, Number(d.emblema ?? d.esperas) || 0) }).catch(() => undefined);
      } catch {
        // sem rede: fica o último número
      }
    };
    void ler();
    const id = setInterval(ler, 30_000);
    document.addEventListener("visibilitychange", ler);
    window.addEventListener("focus", ler);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", ler);
      window.removeEventListener("focus", ler);
    };
  }, []);

  // O chat, a ficha, a área de testes e os ajustes ocupam a tela inteira, como no WhatsApp.
  if (/^\/m\/conversas\/.+/.test(caminho) || caminho.startsWith("/m/agendar") || /^\/m\/agenda\/.+/.test(caminho) || caminho.startsWith("/m/ajustes") || /^\/m\/testes\/.+/.test(caminho) || caminho.startsWith("/m/ajudante")) return null;

  const aba = (href: string, icone: React.ReactNode, rotulo: string, activa: boolean, emblema = 0) => (
    <Link aria-current={activa ? "page" : undefined} className={`m-aba${activa ? " on" : ""}`} href={href} key={href} prefetch>
      <span className="ic">
        {icone}
        {emblema ? <span className="emb">{emblema > 99 ? "99+" : emblema}</span> : null}
      </span>
      {rotulo}
    </Link>
  );

  return (
    <nav aria-label={rotulos.menu} className="m-abas">
      {aba("/m", <IcCasa tamanho={22} />, rotulos.hoje, caminho === "/m")}
      {podeAgenda ? aba("/m/agenda", <IcCalendario tamanho={22} />, rotulos.agenda, caminho.startsWith("/m/agenda")) : null}
      {podeAgenda ? (
        <Link aria-label={rotulos.novo} className="m-aba m-aba-mais" href="/m/agendar" key="novo" prefetch>
          <span><IcMais tamanho={24} /></span>
        </Link>
      ) : null}
      {aba("/m/conversas", <IcConversa tamanho={22} />, rotulos.conversas, caminho.startsWith("/m/conversas"), espera)}
      {aba("/m/mais", <IcPontos tamanho={22} />, rotulos.mais, DO_MAIS.some((p) => caminho.startsWith(p)))}
    </nav>
  );
}
