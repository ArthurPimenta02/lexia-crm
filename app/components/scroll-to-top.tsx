"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Põe a página no topo sempre que se muda de ecrã.
 *
 * O Next já restaura o scroll entre navegações, mas restaura o da *janela* — e
 * neste produto a janela nunca rola. O layout é `h-dvh overflow-hidden` para
 * que a barra lateral fique fixa e o "Sair" não fuja para baixo, o que deixa
 * um `<main>` interno como único elemento que rola. Esse mantém o `scrollTop`
 * entre páginas, e por isso dava-se o caso de abrir um ecrã já a meio, numa
 * posição herdada do ecrã anterior.
 *
 * Reage só ao caminho, e não aos parâmetros de pesquisa, porque a instrução é
 * "abrir no topo": escolher uma conversa ou trocar um filtro muda a query sem
 * mudar de ecrã, e aí puxar a página para cima seria atrapalhar quem está a
 * trabalhar.
 */
export function ScrollToTop({ alvoId }: { alvoId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    document.getElementById(alvoId)?.scrollTo({ behavior: "instant", top: 0 });
  }, [alvoId, pathname]);

  return null;
}
