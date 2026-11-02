"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Atualiza a página sozinha a cada `segundos` (pedido do Arthur, 02/11: não
 * ter de carregar F5 para ver mensagem nova).
 *
 * `router.refresh()` volta a buscar os dados do servidor e junta-os à página
 * sem perder a rolagem nem o que está nos campos. Mesmo assim:
 * - com a aba escondida não atualiza (não gasta o banco à toa) e, ao voltar
 *   para a aba, atualiza logo;
 * - enquanto há alguém a escrever num campo, espera (não mexe numa resposta a
 *   meio).
 */
export function AtualizacaoAutomatica({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter();
  const ultima = useRef(0);

  useEffect(() => {
    const escrevendo = () => {
      const ativo = document.activeElement;
      if (!ativo) return false;
      if (ativo instanceof HTMLTextAreaElement) return ativo.value.trim() !== "";
      if (ativo instanceof HTMLInputElement) return ativo.type !== "checkbox" && ativo.type !== "radio" && ativo.value.trim() !== "";
      return (ativo as HTMLElement).isContentEditable;
    };
    const atualizar = () => {
      if (document.visibilityState !== "visible" || escrevendo()) return;
      ultima.current = Date.now();
      router.refresh();
    };
    const relogio = window.setInterval(atualizar, segundos * 1000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultima.current > segundos * 1000) atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router, segundos]);

  return null;
}
