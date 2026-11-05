"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { IcBusca, IcCanal } from "../_c/icones";

export type ItemLista = {
  canal: string;
  cor: string;
  conversa: string;
  espera: string | null;
  estado: "espera" | "comigo" | "agente";
  iniciais: string;
  nome: string;
  previa: string;
  previaDe: "cliente" | "agente" | "equipe";
  quando: string;
  telefone: string | null;
};

type Textos = Record<"agente" | "agenteDiz" | "comigo" | "conversas" | "espera" | "nenhuma" | "procurar" | "todas" | "voce", string>;

const semAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ListaConversas({ erro, itens, textos }: { erro: string | null; itens: ItemLista[]; textos: Textos }) {
  const [filtro, setFiltro] = useState<"todas" | "espera" | "comigo" | "agente">("todas");
  const [busca, setBusca] = useState("");
  const contagem = useMemo(() => ({ espera: itens.filter((i) => i.estado === "espera").length }), [itens]);
  const visiveis = useMemo(() => {
    const q = semAcentos(busca.trim());
    return itens.filter((i) => (filtro === "todas" || i.estado === filtro) && (!q || semAcentos(`${i.nome} ${i.previa} ${i.telefone ?? ""}`).includes(q)));
  }, [itens, filtro, busca]);

  return (
    <>
      <div className="m-titulo"><h1>{textos.conversas}</h1></div>
      <label className="m-busca">
        <IcBusca />
        <input aria-label={textos.procurar} enterKeyHint="search" inputMode="search" onChange={(e) => setBusca(e.target.value)} placeholder={textos.procurar} type="search" value={busca} />
      </label>
      <div className="m-chips" role="tablist">
        {([["todas", textos.todas], ["espera", textos.espera], ["comigo", textos.comigo], ["agente", textos.agente]] as const).map(([chave, rotulo]) => (
          <button aria-selected={filtro === chave} className={`m-chip${filtro === chave ? " on" : ""}`} key={chave} onClick={() => setFiltro(chave)} role="tab" type="button">
            {rotulo}
            {chave === "espera" && contagem.espera ? <span className="n">{contagem.espera}</span> : null}
          </button>
        ))}
      </div>
      {erro ? <div className="m-vazio">{erro}</div> : visiveis.length === 0 ? <div className="m-vazio">{textos.nenhuma}</div> : (
        <div className="m-caixa">
          {visiveis.map((i) => (
            <Link className="m-conv" href={`/m/conversas/${encodeURIComponent(i.conversa)}`} key={i.conversa} prefetch={false}>
              <div className="m-av" style={{ background: i.cor }}>
                {i.iniciais}
                <i className={`canal ${i.canal}`}><IcCanal canal={i.canal} tamanho={10} /></i>
              </div>
              <div className="m-meio">
                <b>{i.nome}</b>
                <span>
                  {i.previaDe === "agente" ? <span style={{ color: "var(--m-acento)" }}>{textos.agenteDiz} </span> : i.previaDe === "equipe" ? <span>{textos.voce} </span> : null}
                  {i.previa}
                </span>
              </div>
              <div className="dir">
                <span className="h">{i.quando}</span>
                {i.estado === "espera" ? <span className="m-etq esp">{i.espera}</span> : i.estado === "comigo" ? <span className="m-etq eq">{textos.comigo}</span> : <span className="m-etq ag">{textos.agente}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
