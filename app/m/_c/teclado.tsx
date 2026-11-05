"use client";

import { useEffect, type RefObject } from "react";

/**
 * O teclado do iPhone, como no WhatsApp.
 *
 * Casca nova (plugin Keyboard em modo "none"): o iPhone avisa ANTES de o
 * teclado subir, com a altura; a tela encolhe na mesma hora e com a mesma
 * curva do teclado, e a página não é empurrada para cima (setScroll). É o que
 * tira o "salto".
 *
 * Casca antiga ou navegador: segue a área visível (visualViewport) depois de
 * o teclado subir, como antes.
 */
type Info = { keyboardHeight: number };
type Pega = { remove: () => Promise<void> | void };
type PluginTeclado = {
  getResizeMode?: () => Promise<{ mode: string }>;
  setScroll?: (o: { isDisabled: boolean }) => Promise<void>;
  addListener?: (evento: string, f: (info: Info) => void) => Promise<Pega> | Pega;
};

// A curva e o tempo do teclado do iOS.
export const CURVA_TECLADO = "260ms cubic-bezier(0.38, 0.7, 0.125, 1)";

/** Muda o estilo de um elemento da página (fora do React, de propósito: é a cada frame do teclado). */
function pintar(el: HTMLElement, estilo: Partial<Record<"height" | "transform" | "transition", string>>) {
  Object.assign(el.style, estilo);
}

function plugin(): PluginTeclado | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { Keyboard?: PluginTeclado } } }).Capacitor?.Plugins?.Keyboard;
}

async function modoJs() {
  try {
    return (await plugin()?.getResizeMode?.())?.mode === "none";
  } catch {
    return false;
  }
}

/** Para telas de chat (ocupam a tela toda): a altura acompanha o teclado. */
export function useTecladoDoChat(raiz: RefObject<HTMLElement | null>, aoMudar: () => void) {
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    let vivo = true;
    let js = false;
    const pegas: Pega[] = [];
    const vv = window.visualViewport;

    const porVV = () => {
      if (!vv) return;
      // No modo novo só se corrige um eventual empurrão da página.
      pintar(el, { transform: `translateY(${vv.offsetTop}px)` });
      if (js) return;
      pintar(el, { height: `${vv.height}px` });
      aoMudar();
    };

    void modoJs().then(async (sim) => {
      if (!vivo || !sim) return;
      js = true;
      const k = plugin()!;
      void k.setScroll?.({ isDisabled: true });
      const mover = (altura: number) => {
        pintar(el, { height: `${window.innerHeight - altura}px`, transition: `height ${CURVA_TECLADO}` });
        aoMudar();
        window.setTimeout(aoMudar, 280);
      };
      for (const [evento, altura] of [["keyboardWillShow", null], ["keyboardWillHide", 0]] as const) {
        const p = await k.addListener?.(evento, (info) => mover(altura ?? info.keyboardHeight ?? 0));
        if (p) pegas.push(p);
      }
      if (!vivo) pegas.forEach((p) => void p.remove());
    });

    porVV();
    vv?.addEventListener("resize", porVV);
    vv?.addEventListener("scroll", porVV);
    return () => {
      vivo = false;
      vv?.removeEventListener("resize", porVV);
      vv?.removeEventListener("scroll", porVV);
      pegas.forEach((p) => void p.remove());
      if (js) void plugin()?.setScroll?.({ isDisabled: false });
    };
  }, [raiz, aoMudar]);
}

/**
 * Para o resto do app: com a casca nova, as folhas que sobem de baixo
 * (marcar, período) sobem também acima do teclado (`--m-teclado`).
 */
export function TecladoGlobal() {
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>(".m-app");
    if (!raiz) return;
    let vivo = true;
    const pegas: Pega[] = [];
    void modoJs().then(async (sim) => {
      if (!vivo || !sim) return;
      raiz.dataset.teclado = "js";
      const k = plugin()!;
      for (const [evento, mostrar] of [["keyboardWillShow", true], ["keyboardWillHide", false]] as const) {
        const p = await k.addListener?.(evento, (info) => raiz.style.setProperty("--m-teclado", mostrar ? `${info.keyboardHeight ?? 0}px` : "0px"));
        if (p) pegas.push(p);
      }
      if (!vivo) pegas.forEach((p) => void p.remove());
    });
    return () => {
      vivo = false;
      pegas.forEach((p) => void p.remove());
    };
  }, []);
  return null;
}
