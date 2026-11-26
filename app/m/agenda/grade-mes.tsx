"use client";

import Link from "next/link";
import { useState } from "react";

import { IcCalendario, IcMais } from "../_c/icones";

export type DiaDaGrade = { atual: boolean; chave: string; fora: boolean; hoje: boolean; marcarHref: string | null; n: number; numero: number; titulo: string; verHref: string };

/**
 * A grade do mês no app (26/11, pedido do Arthur): tocar num dia abre uma
 * folha curta com "Ver agendamentos do dia" e "Marcar agendamento" (este só
 * de hoje em diante e quando a empresa marca pelo app).
 */
export function GradeMes({ cabecalho, dias, textos: t }: { cabecalho: string[]; dias: DiaDaGrade[]; textos: { fechar: string; marcar: string; nenhum: string; um: string; varios: string; ver: string } }) {
  const [aberto, setAberto] = useState<DiaDaGrade | null>(null);

  return (
    <>
      <div className="m6-mes">
        {cabecalho.map((c, i) => <span className="cab" key={`c-${i}`}>{c}</span>)}
        {dias.map((d) => (
          <button aria-current={d.atual ? "date" : undefined} aria-label={d.titulo} className={`dia${d.fora ? " fora" : ""}${d.hoje ? " hoje" : ""}`} key={d.chave} onClick={() => setAberto(d)} type="button">
            <b>{d.numero}</b>
            <i style={d.n ? undefined : { visibility: "hidden" }} />
          </button>
        ))}
      </div>

      {aberto ? (
        <>
          <div className="m-veu" onClick={() => setAberto(null)} />
          <div aria-label={aberto.titulo} className="m-folha ag-escolha" role="dialog">
            <div className="m-pega" />
            <h3>{aberto.titulo}</h3>
            <p className="d">{aberto.n === 0 ? t.nenhum : aberto.n === 1 ? t.um : t.varios.replace("{n}", String(aberto.n))}</p>
            <Link className="ag-escolha-op" href={aberto.verHref} onClick={() => setAberto(null)} replace>
              <span className="c"><IcCalendario tamanho={20} /></span>{t.ver}
            </Link>
            {aberto.marcarHref ? (
              <Link className="ag-escolha-op verde" href={aberto.marcarHref} onClick={() => setAberto(null)}>
                <span className="c"><IcMais tamanho={20} /></span>{t.marcar}
              </Link>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
