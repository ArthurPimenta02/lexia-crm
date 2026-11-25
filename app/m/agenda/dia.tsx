"use client";

import Link from "next/link";
import { useState } from "react";

import { IcCalendario, IcConversa, IcMais, IcTelefone } from "../_c/icones";
import { VazioMascote } from "@/app/m/_c/vazio";

type Evento = {
  conversa: string | null;
  dia: string;
  rotuloDia: string;
  estado: string;
  executor: string | null;
  hora: string;
  horaFim: string;
  id: string;
  link: string | null;
  nome: string;
  origem: string;
  passou: boolean;
  /** O que mostrar em vez da hora nos dias de continuação de um evento de vários dias. */
  rotuloHora?: string | null;
  /** Início e fim com as datas, quando o evento dura vários dias. */
  periodo?: string | null;
  pendenteSinal: boolean;
  servico: string | null;
  telefone: string | null;
  valorTexto: string | null;
};
type Textos = Record<
  | "abrirGoogle" | "agente" | "agenteTag" | "agora" | "cancelado" | "conversa" | "dia" | "faltaSinal" | "fechar"
  | "ligar" | "manual" | "marcar" | "marcarNeste" | "nenhum",
  string
>;

export function DiaAgenda(props: {
  agrupar: boolean; horaAgora: string; dia: string; eHoje: boolean; eventos: Evento[]; hrefMarcar: string | null; textos: Textos;
}) {
  const { textos: t } = props;
  const [aberto, setAberto] = useState<Evento | null>(null);

  const horaAgora = props.horaAgora;
  const ativos = props.eventos;

  return (
    <>
      <section aria-label={t.dia} className="m6-eventos">
        {ativos.length === 0 ? (props.hrefMarcar ? <Link className="ag-vazio-toque" href={props.hrefMarcar}><VazioMascote>{t.nenhum}</VazioMascote><span>{t.marcarNeste}</span></Link> : <VazioMascote>{t.nenhum}</VazioMascote>) : ativos.map((e, i) => {
          const linhaAgora = !props.agrupar && props.eHoje && e.hora > horaAgora && (i === 0 || ativos[i - 1].hora <= horaAgora);
          const novoDia = props.agrupar && (i === 0 || ativos[i - 1].dia !== e.dia);
          const cancelado = e.estado === "cancelado";
          return (
            <div key={`${e.id}-${e.dia}`}>
              {novoDia ? <p className="m6-rotulo m6-grupo">{e.rotuloDia}</p> : null}
              {linhaAgora ? <div aria-label={`${t.agora}, ${horaAgora}`} className="m6-agora"><span>{horaAgora}</span><i /></div> : null}
              <button className={`m6-ev${e.passou || cancelado ? " passou" : ""}${cancelado ? " cancelado" : ""}`} onClick={() => setAberto(e)} type="button">
                <span className="h">{e.rotuloHora ?? e.hora}</span>
                <span className="n">{e.nome || "—"}</span>
                {cancelado ? <span className="v">{t.cancelado}</span> : e.origem === "agente" ? <span className="v ag">{t.agenteTag}</span> : <span className="v">{e.valorTexto ?? ""}</span>}
                <span className="d">{[e.servico, e.executor, e.pendenteSinal ? t.faltaSinal : null].filter(Boolean).join(" · ") || " "}</span>
              </button>
            </div>
          );
        })}
        {!props.agrupar && props.eHoje && ativos.length > 0 && ativos[ativos.length - 1].hora <= horaAgora ? <div aria-label={`${t.agora}, ${horaAgora}`} className="m6-agora"><span>{horaAgora}</span><i /></div> : null}
      </section>

      {props.hrefMarcar ? <Link className="m-flutuante" href={props.hrefMarcar}><IcMais tamanho={18} /> {t.marcar}</Link> : null}

      {aberto ? (
        <>
          <div className="m-veu" onClick={() => setAberto(null)} />
          <div aria-label={aberto.nome} className="m-folha" role="dialog">
            <div className="m-pega" />
            <h3>{aberto.nome || "—"}</h3>
            <p className="d">{[aberto.periodo ?? `${aberto.hora}–${aberto.horaFim}`, aberto.servico, aberto.executor, aberto.valorTexto].filter(Boolean).join(" · ")}<br />{aberto.origem === "agente" ? t.agente : t.manual}{aberto.pendenteSinal ? ` · ${t.faltaSinal}` : ""}</p>
            <div className="m-grade-acoes" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {aberto.conversa ? <Link href={`/m/conversas/${encodeURIComponent(aberto.conversa)}`}><span className="c"><IcConversa /></span>{t.conversa}</Link> : <span style={{ opacity: 0.4 }}><span className="c"><IcConversa /></span>{t.conversa}</span>}
              {aberto.telefone ? <a href={`tel:+${aberto.telefone}`}><span className="c"><IcTelefone /></span>{t.ligar}</a> : <span style={{ opacity: 0.4 }}><span className="c"><IcTelefone /></span>{t.ligar}</span>}
              {aberto.link ? <a href={aberto.link} rel="noreferrer" target="_blank"><span className="c"><IcCalendario /></span>Google</a> : <span style={{ opacity: 0.4 }}><span className="c"><IcCalendario /></span>Google</span>}
            </div>
            <button className="m-botao" onClick={() => setAberto(null)} type="button">{t.fechar}</button>
          </div>
        </>
      ) : null}

    </>
  );
}
