"use client";

import Link from "next/link";

import { IcMais } from "../_c/icones";
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
              <Link className={`m6-ev${e.passou || cancelado ? " passou" : ""}${cancelado ? " cancelado" : ""}`} href={`/m/agenda/${e.id}`} prefetch={false}>
                <span className="h">{e.rotuloHora ?? e.hora}</span>
                <span className="n">{e.nome || "—"}</span>
                {cancelado ? <span className="v">{t.cancelado}</span> : e.origem === "agente" ? <span className="v ag">{t.agenteTag}</span> : <span className="v">{e.valorTexto ?? ""}</span>}
                <span className="d">{[e.servico, e.executor, e.pendenteSinal ? t.faltaSinal : null].filter(Boolean).join(" · ") || " "}</span>
              </Link>
            </div>
          );
        })}
        {!props.agrupar && props.eHoje && ativos.length > 0 && ativos[ativos.length - 1].hora <= horaAgora ? <div aria-label={`${t.agora}, ${horaAgora}`} className="m6-agora"><span>{horaAgora}</span><i /></div> : null}
      </section>

      {props.hrefMarcar ? <Link className="m-flutuante" href={props.hrefMarcar}><IcMais tamanho={18} /> {t.marcar}</Link> : null}


    </>
  );
}
