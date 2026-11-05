"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { IcBusca } from "../_c/icones";
import { VazioMascote } from "@/app/m/_c/vazio";

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
      {erro ? <div className="m-vazio">{erro}</div> : visiveis.length === 0 ? <VazioMascote>{textos.nenhuma}</VazioMascote> : (
        <div className="m-lista-conv">
          {visiveis.map((i) => (
            <Link className="m-conv" href={`/m/conversas/${encodeURIComponent(i.conversa)}`} key={i.conversa} prefetch={false}>
              <div className="m-av" style={{ background: i.cor }}>
                {i.iniciais}
                <i className={`canal ${i.canal}`} />
              </div>
              <div className="m-meio">
                <b>{i.nome}</b>
                <span>
                  {i.estado === "espera" && i.espera ? <span className="m-tempo">{i.espera} · </span> : null}
                  {i.previaDe === "agente" ? <span className="m-de-agente">{textos.agenteDiz} </span> : i.previaDe === "equipe" ? <span>{textos.voce} </span> : null}
                  {i.previa}
                </span>
              </div>
              <div className="dir">
                <span className="h">{i.quando}</span>
                <span aria-label={i.estado === "espera" ? textos.espera : i.estado === "comigo" ? textos.comigo : textos.agente} className={`m-estado ${i.estado}`} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
