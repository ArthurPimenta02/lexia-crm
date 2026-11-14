"use client";

import { useEffect, useState } from "react";

import { IcRosto } from "../_c/icones";

type Plugin = {
  lerBloqueio?: () => Promise<{ disponivel: boolean; ligado: boolean; tipo: string }>;
  definirBloqueio?: (o: { ligado: boolean }) => Promise<{ ligado: boolean }>;
};

/**
 * "Pedir Face ID ao abrir": só aparece dentro do app do iPhone (casca com o
 * plugin LexiaNativo) e num aparelho com Face ID, Touch ID ou código.
 * Ligar pede o Face ID na hora, para confirmar que funciona.
 */
export function FaceId({ textos }: { textos: Record<"faceid" | "touchid" | "codigo", string> }) {
  const [estado, setEstado] = useState<null | { ligado: boolean; tipo: string }>(null);

  useEffect(() => {
    const p = (window as unknown as { Capacitor?: { Plugins?: { LexiaNativo?: Plugin } } }).Capacitor?.Plugins?.LexiaNativo;
    void p?.lerBloqueio?.().then((r) => { if (r.disponivel) setEstado({ ligado: r.ligado, tipo: r.tipo }); }).catch(() => undefined);
  }, []);

  if (!estado) return null;
  const mudar = async () => {
    const p = (window as unknown as { Capacitor?: { Plugins?: { LexiaNativo?: Plugin } } }).Capacitor?.Plugins?.LexiaNativo;
    const r = await p?.definirBloqueio?.({ ligado: !estado.ligado }).catch(() => null);
    if (r) setEstado({ ...estado, ligado: r.ligado });
  };
  const titulo = estado.tipo === "faceid" ? textos.faceid : estado.tipo === "touchid" ? textos.touchid : textos.codigo;
  return (
    <button aria-pressed={estado.ligado} className="m-opcao" onClick={() => void mudar()} type="button">
      <div className="ic"><IcRosto /></div>
      <div><b>{titulo}</b></div>
      <span className={`m-interr${estado.ligado ? " on" : ""}`} />
    </button>
  );
}
