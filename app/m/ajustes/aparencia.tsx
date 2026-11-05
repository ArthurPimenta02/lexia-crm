"use client";

import { useEffect, useRef, useState } from "react";

import { COOKIE_MODO_MOVEL, type ModoMovel } from "@/lib/movel/modo";

/** Automático / Claro / Escuro. Muda na hora e fica guardado neste aparelho. */
export function Aparencia({ inicial, textos }: { inicial: ModoMovel; textos: Record<ModoMovel, string> }) {
  const [modo, setModo] = useState(inicial);
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    window.document.cookie = `${COOKIE_MODO_MOVEL}=${modo}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax; secure`;
    window.document.querySelector(".m-app")?.setAttribute("data-modo", modo);
  }, [modo]);
  const escolher = (m: ModoMovel) => setModo(m);
  return (
    <div className="m-seg3" role="radiogroup">
      {(["auto", "claro", "escuro"] as const).map((m) => (
        <button aria-checked={modo === m} className={modo === m ? "on" : ""} key={m} onClick={() => escolher(m)} role="radio" type="button">{textos[m]}</button>
      ))}
    </div>
  );
}
