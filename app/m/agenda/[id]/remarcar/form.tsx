"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { IcFechar } from "../../../_c/icones";
import { livresAgendar } from "../../../agendar/acoes";
import { remarcarMovel } from "../acoes";

type Textos = Record<"confirmar" | "dia" | "escolha" | "fechar" | "agoraEsta" | "horario" | "maisHorarios" | "mesmoAssim" | "nenhumLivre" | "ocupado" | "outroDia" | "outroHorario" | "remarcado" | "titulo", string>;

export function FormRemarcar(props: { agora: string; dia: string; dias: { chave: string; rotulo: string }[]; duracaoMinutos: number; executor: string; hoje: string; id: string; nome: string; textos: Textos }) {
  const { textos: t } = props;
  const router = useRouter();
  // Começa no dia em que está marcado (é o mais comum: mudar só a hora).
  const [dia, setDia] = useState(props.dia < props.hoje ? props.hoje : props.dia);
  const [outroDia, setOutroDia] = useState(!props.dias.some((d) => d.chave === props.dia) && props.dia >= props.hoje);
  const [hora, setHora] = useState("");
  const [outroHorario, setOutroHorario] = useState(false);
  const [todos, setTodos] = useState(false);
  const [livresDe, setLivresDe] = useState<{ lista: string[]; pergunta: string } | null>(null);
  const [conflitos, setConflitos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, inicia] = useTransition();

  const pergunta = `${dia}|${props.executor}|${props.duracaoMinutos}`;
  useEffect(() => {
    const [d, ex, min] = pergunta.split("|");
    let vivo = true;
    livresAgendar(d, ex, Number(min))
      .then((lista) => { if (vivo) setLivresDe({ lista, pergunta }); })
      .catch(() => { if (vivo) setLivresDe({ lista: [], pergunta }); });
    return () => { vivo = false; };
  }, [pergunta]);
  const livres = livresDe && livresDe.pergunta === pergunta ? livresDe.lista : null;
  const rotuloDoDia = props.dias.find((d) => d.chave === dia)?.rotulo.toLowerCase() ?? dia.split("-").reverse().slice(0, 2).join("/");

  const enviar = () => {
    if (!hora) return;
    setErro(null);
    inicia(async () => {
      const r = await remarcarMovel(props.id, dia, hora, conflitos.length > 0);
      if (r.ok) { setFeito(true); window.setTimeout(() => { router.push(`/m/agenda/${props.id}`); router.refresh(); }, 1000); return; }
      setConflitos(r.conflitos ?? []);
      setErro(r.erro);
    });
  };

  return (
    <main className="m-pagina sem-abas ag">
      <header className="ag-cab">
        <Link aria-label={t.fechar} className="ag-x" href={`/m/agenda/${props.id}`}><IcFechar tamanho={18} /></Link>
        <div className="ag-titulo"><small>{props.nome}</small><b>{t.titulo}</b></div>
        <span />
      </header>
      <p className="ag-dica" style={{ margin: "4px 0 0" }}>{t.agoraEsta.replace("{quando}", props.agora)}</p>

      <div className="ag-campo">
        <span className="ag-rot">{t.dia}</span>
        <div className="ag-pilulas">
          {props.dias.map((d) => <button className={!outroDia && dia === d.chave ? "on" : ""} key={d.chave} onClick={() => { setOutroDia(false); setDia(d.chave); setHora(""); setConflitos([]); }} type="button">{d.rotulo}</button>)}
          <button className={outroDia ? "on" : ""} onClick={() => setOutroDia(true)} type="button">{t.outroDia}</button>
        </div>
        {outroDia ? <input aria-label={t.outroDia} className="ag-inp" min={props.hoje} onChange={(e) => { if (e.target.value) { setDia(e.target.value); setHora(""); setConflitos([]); } }} style={{ marginTop: 8 }} type="date" value={dia} /> : null}
      </div>

      <div className="ag-campo">
        <span className="ag-rot">{t.horario}</span>
        {livres === null ? <div className="ag-pilulas ag-carregando"><span /><span /><span /><span /></div> : (
          <div className="ag-horas">
            {livres.length === 0 && !outroHorario ? <p className="ag-nada">{t.nenhumLivre}</p> : null}
            {!outroHorario && (todos ? livres : livres.slice(0, 8)).map((h) => <button className={hora === h ? "on" : ""} key={h} onClick={() => { setHora(h); setConflitos([]); }} type="button">{h}</button>)}
            {!outroHorario && !todos && livres.length > 8 ? <button className="ag-outro" onClick={() => setTodos(true)} type="button">{t.maisHorarios}</button> : null}
            <button className={`ag-outro${outroHorario ? " on" : ""}`} onClick={() => { setOutroHorario(!outroHorario); setHora(""); }} type="button">{t.outroHorario}</button>
          </div>
        )}
        {outroHorario ? <input aria-label={t.outroHorario} className="ag-inp" onChange={(e) => { setHora(e.target.value); setConflitos([]); }} step={900} style={{ marginTop: 8 }} type="time" value={hora} /> : null}
      </div>

      <div className="ag-rodape">
        {conflitos.length ? <div className="ag-alerta" role="alert"><b>{t.ocupado}</b>{conflitos.map((a) => <span key={a}>{a}</span>)}</div> : null}
        {erro ? <p className="ag-erro" role="alert">{erro}</p> : null}
        <button className="m-botao verde" disabled={pendente || !hora} onClick={enviar} type="button">
          {conflitos.length ? t.mesmoAssim : hora ? t.confirmar.replace("{dia}", rotuloDoDia).replace("{hora}", hora) : t.escolha}
        </button>
      </div>
      {feito ? <div className="m-toast" role="status">{t.remarcado}</div> : null}
    </main>
  );
}
