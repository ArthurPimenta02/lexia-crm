"use client";

import { useEffect } from "react";

type PluginBarra = { setStyle?: (o: { style: string }) => Promise<void> };

/**
 * Põe a barra de estado do iPhone (hora, bateria) na cor certa para o modo:
 * texto claro no escuro e texto escuro no claro. Segue o `data-modo` da área
 * do app (que os Ajustes mudam na hora) e, no automático, o próprio iPhone.
 */
export function BarraDeEstado() {
  useEffect(() => {
    const raiz = document.querySelector(".m-app");
    const barra = (window as unknown as { Capacitor?: { Plugins?: { StatusBar?: PluginBarra } } }).Capacitor?.Plugins?.StatusBar;
    if (!raiz || !barra?.setStyle) return;
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const aplicar = () => {
      const modo = raiz.getAttribute("data-modo");
      const escuro = modo === "escuro" || (modo !== "claro" && consulta.matches);
      void barra.setStyle!({ style: escuro ? "DARK" : "LIGHT" }).catch(() => undefined);
    };
    aplicar();
    const vigia = new MutationObserver(aplicar);
    vigia.observe(raiz, { attributeFilter: ["data-modo"], attributes: true });
    consulta.addEventListener("change", aplicar);
    return () => {
      vigia.disconnect();
      consulta.removeEventListener("change", aplicar);
    };
  }, []);
  return null;
}
