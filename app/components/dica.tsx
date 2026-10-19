"use client";

import { Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * O `?` que guarda a explicação que antes era um parágrafo.
 *
 * O dashboard tinha doze cartões, cada um com um parágrafo por baixo do número
 * a explicar de onde o número vem. Isso é uma página com mais texto do que
 * dados — ninguém lê doze explicações. Aqui a explicação não desaparece: fica
 * no ícone ao lado do título, a um gesto de distância de quem precisa dela.
 *
 * Porque é que o balão não é um `absolute` ao lado do ícone
 * ---------------------------------------------------------
 * Era, e não se via. As faixas de métricas são um cartão só com as células
 * separadas por linhas, e esse cartão tem `overflow-hidden` para cortar as
 * bordas que sobram na última coluna (ver `GrupoMetricas`). Um balão que se
 * abre para cima sai pelo topo da faixa — e é aí que o `overflow-hidden` lhe
 * corta a cabeça. Ficava a ponta de um rectângulo preto por baixo dos cartões
 * e mais nada.
 *
 * `overflow-hidden` só não corta quem estiver fora dele. Por isso o balão não
 * é desenhado aqui: é desenhado no fim do documento, e vem buscar a posição do
 * ícone a cada abertura. É `fixed`, por isso nenhum `overflow` pelo caminho o
 * alcança, e é a largura da janela que decide se ele cabe acima do ícone ou se
 * tem de abrir para baixo.
 */

const LARGURA = 240;
const MARGEM = 8;
/** Se não houver isto acima do ícone, o balão abre para baixo. */
const ESPACO_MINIMO = 96;

type Sitio = { abaixo: boolean; esquerda: number; largura: number; y: number };

function medir(botao: HTMLElement): Sitio {
  const caixa = botao.getBoundingClientRect();
  const largura = Math.min(LARGURA, window.innerWidth - MARGEM * 2);
  const centro = caixa.left + caixa.width / 2;
  const abaixo = caixa.top < ESPACO_MINIMO;

  return {
    abaixo,
    esquerda: Math.min(
      Math.max(centro - largura / 2, MARGEM),
      window.innerWidth - largura - MARGEM,
    ),
    largura,
    y: abaixo ? caixa.bottom + MARGEM : caixa.top - MARGEM,
  };
}

export function Dica({ texto }: { texto: string }) {
  const botao = useRef<HTMLButtonElement>(null);
  const [sitio, setSitio] = useState<Sitio | null>(null);

  const abrir = useCallback(() => {
    if (botao.current) {
      setSitio(medir(botao.current));
    }
  }, []);

  useEffect(() => {
    if (!sitio) {
      return;
    }

    // A página rola por dentro do `<main>`, não pela janela: sem o `true` do
    // modo de captura, o balão não dava pelo deslizar e ficava para trás.
    const acompanhar = () => {
      if (botao.current) {
        setSitio(medir(botao.current));
      }
    };

    window.addEventListener("scroll", acompanhar, true);
    window.addEventListener("resize", acompanhar);

    return () => {
      window.removeEventListener("scroll", acompanhar, true);
      window.removeEventListener("resize", acompanhar);
    };
  }, [sitio]);

  return (
    <>
      <button
        aria-label={texto}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/60 transition hover:text-foreground"
        onBlur={() => setSitio(null)}
        onFocus={abrir}
        onPointerEnter={(evento) => {
          if (evento.pointerType === "mouse") {
            abrir();
          }
        }}
        onPointerLeave={() => setSitio(null)}
        // No telemóvel não há rato que passe por cima: é o toque que abre, e
        // é o segundo toque que fecha.
        onPointerUp={(evento) => {
          if (evento.pointerType !== "mouse") {
            setSitio((anterior) =>
              anterior ? null : botao.current && medir(botao.current),
            );
          }
        }}
        ref={botao}
        type="button"
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>

      {sitio
        ? createPortal(
            <span
              aria-hidden="true"
              className="pointer-events-none fixed z-[90] block rounded-xl bg-foreground px-3 py-2 text-xs leading-relaxed font-normal text-background shadow-xl"
              style={{
                left: sitio.esquerda,
                top: sitio.y,
                transform: sitio.abaixo ? undefined : "translateY(-100%)",
                width: sitio.largura,
              }}
            >
              {texto}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
