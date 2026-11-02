"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A página atualiza-se sozinha quando há novidade (Arthur, 02/11).
 *
 * Verificação leve: a cada `segundos` pergunta ao servidor o `sinal` da tela
 * (uma linha: a última mensagem, o último turno…). Só quando o sinal muda é
 * que faz `router.refresh()`, que volta a buscar os dados completos sem perder
 * a rolagem nem os campos. O Supabase e a Vercel estão no plano gratuito: sem
 * novidade, cada verificação custa uma linha, não a página inteira.
 *
 * - Aba escondida: não verifica; ao voltar, verifica logo.
 * - Alguém a escrever num campo: a atualização espera.
 */
export function AtualizacaoAutomatica({
  segundos = 5,
  sinal,
}: {
  segundos?: number;
  sinal: () => Promise<string>;
}) {
  const router = useRouter();
  const ultimo = useRef<string | null>(null);
  const pendente = useRef(false);
  const ocupado = useRef(false);

  useEffect(() => {
    const escrevendo = () => {
      const ativo = document.activeElement;
      if (!ativo) return false;
      if (ativo instanceof HTMLTextAreaElement) return ativo.value.trim() !== "";
      if (ativo instanceof HTMLInputElement) return ativo.type !== "checkbox" && ativo.type !== "radio" && ativo.value.trim() !== "";
      return (ativo as HTMLElement).isContentEditable;
    };
    const verificar = async () => {
      if (document.visibilityState !== "visible" || ocupado.current) return;
      ocupado.current = true;
      try {
        const agora = await sinal();
        if (ultimo.current !== null && agora !== ultimo.current) pendente.current = true;
        ultimo.current = agora;
        if (pendente.current && !escrevendo()) {
          pendente.current = false;
          router.refresh();
        }
      } catch {
        // sem rede ou sessão expirada: tenta na próxima
      } finally {
        ocupado.current = false;
      }
    };
    void verificar();
    const relogio = window.setInterval(verificar, segundos * 1000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void verificar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router, segundos, sinal]);

  return null;
}
