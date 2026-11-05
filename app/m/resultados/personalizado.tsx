"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** O chip "Personalizado": escolhe duas datas e mostra os resultados desse período. */
export function Personalizado({ activo, caminho = "/m/resultados", de, ate, hoje, textos }: { activo: boolean; caminho?: string; de: string; ate: string; hoje: string; textos: Record<"aplicar" | "ate" | "de" | "personalizado", string> }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState(de);
  const [fim, setFim] = useState(ate);

  return (
    <>
      <button className={`m-chip${activo ? " on" : ""}`} onClick={() => setAberto(true)} type="button">{textos.personalizado}</button>
      {aberto ? (
        <>
          <div className="m-veu" onClick={() => setAberto(false)} />
          <div aria-label={textos.personalizado} className="m-folha" role="dialog">
            <div className="m-pega" />
            <h3 style={{ marginBottom: 14 }}>{textos.personalizado}</h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <label className="m-campo"><small>{textos.de}</small><input max={hoje} onChange={(e) => setInicio(e.target.value)} type="date" value={inicio} /></label>
              <label className="m-campo"><small>{textos.ate}</small><input max={hoje} onChange={(e) => setFim(e.target.value)} type="date" value={fim} /></label>
            </div>
            <button className="m-botao verde" disabled={!inicio || !fim} onClick={() => { setAberto(false); router.replace(`${caminho}?p=personalizado&de=${inicio}&ate=${fim}`); }} style={{ marginTop: 10 }} type="button">{textos.aplicar}</button>
          </div>
        </>
      ) : null}
    </>
  );
}
