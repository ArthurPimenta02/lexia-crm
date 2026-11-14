"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { IcBusca, IcFechar } from "../_c/icones";
import { Iniciais } from "../_c/pecas";
import { VazioMascote } from "@/app/m/_c/vazio";

export type ItemLista = {
  canal: string;
  conversa: string;
  espera: string | null;
  estado: "espera" | "comigo" | "agente";
  grupo: "espera" | "hoje" | "ontem" | "antes";
  iniciais: string;
  nome: string;
  previa: string;
  previaDe: "cliente" | "agente" | "equipe";
  quando: string;
  quente: boolean;
  telefone: string | null;
};

type Textos = Record<
  "agenteDiz" | "anteriores" | "comVoce" | "conversas" | "esperando" | "esperandoVoce" | "fechar" | "hoje" | "mostrar" | "nenhuma" | "ontem" | "procurar" | "quente" | "quentes" | "todas" | "voce",
  string
>;
type Filtro = "todas" | "espera" | "comigo" | "quentes";

const semAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ListaConversas({ erro, itens, textos }: { erro: string | null; itens: ItemLista[]; textos: Textos }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [procurando, setProcurando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const esperando = useMemo(() => itens.filter((i) => i.estado === "espera").length, [itens]);
  const visiveis = useMemo(() => {
    const q = semAcentos(busca.trim());
    return itens.filter((i) =>
      (filtro === "todas" || (filtro === "espera" && i.estado === "espera") || (filtro === "comigo" && i.estado === "comigo") || (filtro === "quentes" && i.quente)) &&
      (!q || semAcentos(`${i.nome} ${i.previa} ${i.telefone ?? ""}`).includes(q)));
  }, [itens, filtro, busca]);
  const grupos = ([
    ["espera", textos.esperandoVoce],
    ["hoje", textos.hoje],
    ["ontem", textos.ontem],
    ["antes", textos.anteriores],
  ] as const).map(([chave, rotulo]) => ({ chave, itens: visiveis.filter((i) => i.grupo === chave), rotulo })).filter((g) => g.itens.length);

  return (
    <>
      <header className="m6-cab">
        <h1>{textos.conversas}</h1>
        <button
          aria-expanded={procurando}
          aria-label={procurando ? textos.fechar : textos.procurar}
          className="m-ic sup"
          onClick={() => { const abrir = !procurando; setProcurando(abrir); if (!abrir) setBusca(""); else window.setTimeout(() => campo.current?.focus(), 30); }}
          type="button"
        >
          {procurando ? <IcFechar tamanho={16} /> : <IcBusca tamanho={18} />}
        </button>
      </header>
      {procurando ? (
        <label className="m6-busca">
          <IcBusca tamanho={17} />
          <input aria-label={textos.procurar} enterKeyHint="search" inputMode="search" onChange={(e) => setBusca(e.target.value)} placeholder={textos.procurar} ref={campo} type="search" value={busca} />
        </label>
      ) : null}
      <nav aria-label={textos.mostrar} className="m6-chips">
        {([["todas", textos.todas], ["espera", textos.esperando], ["comigo", textos.comVoce], ["quentes", textos.quentes]] as const).map(([chave, rotulo]) => (
          <button aria-pressed={filtro === chave} className={`m6-chip${filtro === chave ? " on" : ""}`} key={chave} onClick={() => setFiltro(chave)} type="button">
            {rotulo}
            {chave === "espera" && esperando ? <span className="n">{esperando}</span> : null}
          </button>
        ))}
      </nav>
      {erro ? <div className="m-vazio">{erro}</div> : grupos.length === 0 ? <VazioMascote>{textos.nenhuma}</VazioMascote> : grupos.map((g) => (
        <section aria-label={g.rotulo} key={g.chave}>
          <p className={`m6-rotulo m6-grupo${g.chave === "espera" ? " alerta" : ""}`}>{g.rotulo}</p>
          {g.itens.map((i) => (
            <Link className="m6-conv" href={`/m/conversas/${encodeURIComponent(i.conversa)}`} key={i.conversa} prefetch={false}>
              <Iniciais canal={i.canal} texto={i.iniciais} />
              <span className="nome">{i.nome}{i.quente ? <span className="m6-tag">{textos.quente}</span> : null}</span>
              <span className={`hora${i.estado === "espera" && i.espera ? " alerta" : ""}`}>{i.estado === "espera" && i.espera ? i.espera : i.quando}</span>
              <span className="prev">{i.previaDe === "agente" ? `${textos.agenteDiz} ` : i.previaDe === "equipe" ? `${textos.voce} ` : ""}{i.previa}</span>
            </Link>
          ))}
        </section>
      ))}
    </>
  );
}
