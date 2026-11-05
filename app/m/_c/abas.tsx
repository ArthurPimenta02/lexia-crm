"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { IcBarras, IcCasa, IcConversa, IcGrade, IcMais } from "./icones";

/**
 * A barra de abas flutuante (desenho v5, 05/11): Hoje, Conversas, o botão
 * verde de marcar ao centro, Resultados e Mais. O número vermelho em Conversas
 * é quantos clientes estão à espera de uma pessoa; atualiza-se a cada 30 s,
 * só com a página visível.
 */
type Rotulos = { conversas: string; hoje: string; marcar: string; mais: string; menu: string; resultados: string };

// Telas que vivem dentro de "Mais": a aba Mais fica acesa nelas.
const DO_MAIS = ["/m/mais", "/m/campanhas", "/m/clientes", "/m/agenda", "/m/busca"];

export function AbasMovel({ rotulos }: { rotulos: Rotulos }) {
  const caminho = usePathname();
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/m/contagem", { cache: "no-store" });
        if (r.ok && vivo) setEspera(Number((await r.json()).esperas) || 0);
      } catch {
        // sem rede: fica o último número
      }
    };
    void ler();
    const id = setInterval(ler, 30_000);
    document.addEventListener("visibilitychange", ler);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", ler);
    };
  }, []);

  // O chat, a área de testes e os ajustes ocupam a tela inteira, como no WhatsApp.
  if (/^\/m\/conversas\/.+/.test(caminho) || caminho.startsWith("/m/ajustes") || caminho.startsWith("/m/testes")) return null;

  const aba = (href: string, icone: React.ReactNode, rotulo: string, activa: boolean, emblema = 0) => (
    <Link aria-current={activa ? "page" : undefined} className={`m-aba${activa ? " on" : ""}`} href={href} key={href}>
      {icone}
      {emblema ? <span className="emb">{emblema > 99 ? "99+" : emblema}</span> : null}
      <span className="m-sr">{rotulo}</span>
    </Link>
  );

  return (
    <nav aria-label={rotulos.menu} className="m-abas">
      {aba("/m", <IcCasa tamanho={22} />, rotulos.hoje, caminho === "/m")}
      {aba("/m/conversas", <IcConversa tamanho={22} />, rotulos.conversas, caminho.startsWith("/m/conversas"), espera)}
      <Link aria-label={rotulos.marcar} className="m-aba-centro" href="/m/agenda?nova=1"><IcMais tamanho={22} /></Link>
      {aba("/m/resultados", <IcBarras tamanho={22} />, rotulos.resultados, caminho.startsWith("/m/resultados"))}
      {aba("/m/mais", <IcGrade tamanho={22} />, rotulos.mais, DO_MAIS.some((p) => caminho.startsWith(p)))}
    </nav>
  );
}
