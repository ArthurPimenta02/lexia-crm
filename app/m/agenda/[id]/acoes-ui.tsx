"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { IcCalendario, IcCheck, IcConversa, IcFechar, IcTelefone } from "../../_c/icones";
import { cancelarMovel, presencaMovel } from "./acoes";

type Presenca = "compareceu" | "faltou";
type Textos = Record<"cancelar" | "cancelarPergunta" | "cancelarTexto" | "compareceu" | "desfazer" | "faltou" | "ligar" | "manter" | "pergunta" | "remarcar" | "simCancelar" | "whatsapp", string>;

export function AcoesAgendamento(props: { children: React.ReactNode; conversa: string | null; id: string; pedePresenca: boolean; podeMudar: boolean; presenca: Presenca | null; telefone: string | null; textos: Textos }) {
  const { textos: t } = props;
  const router = useRouter();
  const [presenca, setPresenca] = useState<Presenca | null>(props.presenca);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, inicia] = useTransition();

  const marcar = (p: Presenca | null) => {
    const antes = presenca;
    setPresenca(p);
    setErro(null);
    inicia(async () => {
      const r = await presencaMovel(props.id, p);
      if (!r.ok) { setPresenca(antes); setErro(r.erro); return; }
      router.refresh();
    });
  };
  const cancelar = () => inicia(async () => {
    const r = await cancelarMovel(props.id);
    if (!r.ok) { setErro(r.erro); setConfirmarCancelar(false); return; }
    setConfirmarCancelar(false);
    router.refresh();
  });

  return (
    <>
      {props.pedePresenca ? (
        presenca ? (
          <div className={`ag-presenca feito ${presenca}`}>
            <span>{presenca === "compareceu" ? <IcCheck tamanho={18} /> : <IcFechar tamanho={18} />}{presenca === "compareceu" ? t.compareceu : t.faltou}</span>
            <button disabled={pendente} onClick={() => marcar(null)} type="button">{t.desfazer}</button>
          </div>
        ) : (
          <div className="ag-presenca">
            <b>{t.pergunta}</b>
            <div>
              <button className="sim" disabled={pendente} onClick={() => marcar("compareceu")} type="button"><IcCheck tamanho={18} />{t.compareceu}</button>
              <button className="nao" disabled={pendente} onClick={() => marcar("faltou")} type="button"><IcFechar tamanho={18} />{t.faltou}</button>
            </div>
          </div>
        )
      ) : null}

      {props.children}

      <div className="ag-det-acoes">
        {props.conversa ? <Link href={`/m/conversas/${encodeURIComponent(props.conversa)}`}><IcConversa tamanho={22} />{t.whatsapp}</Link> : null}
        {props.telefone ? <a href={`tel:+${props.telefone}`}><IcTelefone tamanho={22} />{t.ligar}</a> : null}
        {props.podeMudar ? <Link href={`/m/agenda/${props.id}/remarcar`}><IcCalendario tamanho={22} />{t.remarcar}</Link> : null}
        {props.podeMudar ? <button className="perigo" onClick={() => setConfirmarCancelar(true)} type="button"><IcFechar tamanho={22} />{t.cancelar}</button> : null}
      </div>

      {erro ? <p className="ag-erro" role="alert" style={{ marginTop: 12 }}>{erro}</p> : null}

      {confirmarCancelar ? (
        <>
          <div className="m-veu" onClick={() => setConfirmarCancelar(false)} />
          <div aria-label={t.cancelarPergunta} className="m-folha" role="dialog">
            <div className="m-pega" />
            <h3>{t.cancelarPergunta}</h3>
            <p className="d">{t.cancelarTexto}</p>
            <button className="m-botao ag-perigo" disabled={pendente} onClick={cancelar} type="button">{t.simCancelar}</button>
            <button className="m-botao" onClick={() => setConfirmarCancelar(false)} style={{ background: "var(--m-sup)", color: "var(--m-texto)", marginTop: 8 }} type="button">{t.manter}</button>
          </div>
        </>
      ) : null}
    </>
  );
}
