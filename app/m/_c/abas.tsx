"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { IcBarras, IcBusca, IcCalendario, IcCasa, IcConversa } from "./icones";

/**
 * A barra de abas em cápsula (desenho aprovado a 05/11). O número vermelho em
 * Conversas é quantos clientes estão à espera de uma pessoa; atualiza-se a
 * cada 30 s, só com a página visível.
 */
export function AbasMovel({ rotulos }: { rotulos: { hoje: string; conversas: string; agenda: string; resultados: string; busca: string } }) {
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

  // O chat e os ajustes ocupam a tela inteira, como no WhatsApp.
  if (/^\/m\/conversas\/.+/.test(caminho) || caminho.startsWith("/m/ajustes")) return null;

  const abas = [
    { href: "/m", icone: <IcCasa tamanho={22} />, rotulo: rotulos.hoje },
    { href: "/m/conversas", icone: <IcConversa tamanho={22} />, rotulo: rotulos.conversas, emblema: espera },
    { href: "/m/agenda", icone: <IcCalendario tamanho={22} />, rotulo: rotulos.agenda },
    { href: "/m/resultados", icone: <IcBarras tamanho={22} />, rotulo: rotulos.resultados },
    { href: "/m/busca", icone: <IcBusca tamanho={22} />, rotulo: rotulos.busca },
  ];

  return (
    <nav aria-label={rotulos.hoje} className="m-abas">
      {abas.map((aba) => {
        const activa = aba.href === "/m" ? caminho === "/m" : caminho.startsWith(aba.href);
        return (
          <Link aria-current={activa ? "page" : undefined} className={`m-aba${activa ? " on" : ""}`} href={aba.href} key={aba.href}>
            {aba.icone}
            {aba.emblema ? <span className="emb">{aba.emblema > 99 ? "99+" : aba.emblema}</span> : null}
            <span className="m-sr">{aba.rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
