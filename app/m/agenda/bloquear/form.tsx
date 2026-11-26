"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { IcFechar } from "../../_c/icones";
import { bloquearMovel } from "./acoes";

type Textos = Record<"ate" | "bloquear" | "bloquearDia" | "bloqueado" | "de" | "dia" | "diaInteiro" | "dica" | "fechar" | "motivo" | "outro" | "outroMotivo" | "quem" | "semAgenda" | "titulo" | "todos", string>;

export function FormBloquear(props: { dia: string; hoje: string; motivos: string[]; pessoas: { chave: string; nome: string }[]; textos: Textos }) {
  const { textos: t } = props;
  const router = useRouter();
  const [motivo, setMotivo] = useState(props.motivos[0]);
  const [outro, setOutro] = useState(false);
  const [texto, setTexto] = useState("");
  const [quem, setQuem] = useState(props.pessoas.length === 1 ? props.pessoas[0].chave : props.pessoas[0]?.chave ?? "*");
  const [dia, setDia] = useState(props.dia);
  const [inteiro, setInteiro] = useState(false);
  const [de, setDe] = useState("12:00");
  const [ate, setAte] = useState("13:00");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, inicia] = useTransition();
  const volta = `/m/agenda?dia=${dia}`;

  if (!props.pessoas.length) {
    return (
      <main className="m-pagina sem-abas ag">
        <header className="ag-cab"><Link aria-label={t.fechar} className="ag-x" href="/m/agenda"><IcFechar tamanho={18} /></Link><b>{t.titulo}</b><span /></header>
        <div className="m-vazio" style={{ marginTop: 40 }}>{t.semAgenda}</div>
      </main>
    );
  }

  const enviar = () => inicia(async () => {
    setErro(null);
    const r = await bloquearMovel({ dia, executor: quem, fim: inteiro ? "23:59" : ate, inicio: inteiro ? "00:00" : de, motivo: outro ? texto : motivo });
    if (!r.ok) { setErro(r.erro); return; }
    setFeito(true);
    window.setTimeout(() => { router.push(volta); router.refresh(); }, 900);
  });

  return (
    <main className="m-pagina sem-abas ag">
      <header className="ag-cab">
        <Link aria-label={t.fechar} className="ag-x" href={volta}><IcFechar tamanho={18} /></Link>
        <b>{t.titulo}</b>
        <span />
      </header>

      <div className="ag-campo">
        <span className="ag-rot">{t.motivo}</span>
        <div className="ag-pilulas">
          {props.motivos.map((m) => <button className={!outro && motivo === m ? "on" : ""} key={m} onClick={() => { setOutro(false); setMotivo(m); }} type="button">{m}</button>)}
          <button className={outro ? "on" : ""} onClick={() => setOutro(true)} type="button">{t.outro}</button>
        </div>
        {outro ? <input aria-label={t.outroMotivo} className="ag-inp" maxLength={60} onChange={(e) => setTexto(e.target.value)} placeholder={t.outroMotivo} style={{ marginTop: 8 }} value={texto} /> : null}
      </div>

      {props.pessoas.length > 1 ? (
        <div className="ag-campo">
          <span className="ag-rot">{t.quem}</span>
          <div className="ag-pilulas">
            {props.pessoas.map((p) => <button className={quem === p.chave ? "on" : ""} key={p.chave} onClick={() => setQuem(p.chave)} type="button">{p.nome}</button>)}
            <button className={quem === "*" ? "on" : ""} onClick={() => setQuem("*")} type="button">{t.todos}</button>
          </div>
        </div>
      ) : null}

      <div className="ag-campo">
        <label className="ag-rot" htmlFor="bl-dia">{t.dia}</label>
        <input className="ag-inp" id="bl-dia" min={props.hoje} onChange={(e) => e.target.value && setDia(e.target.value)} type="date" value={dia} />
      </div>

      <div className="ag-campo">
        <label className="ag-interruptor">
          <span>{t.diaInteiro}</span>
          <input checked={inteiro} onChange={(e) => setInteiro(e.target.checked)} role="switch" type="checkbox" />
        </label>
      </div>

      {!inteiro ? (
        <div className="ag-campo ag-dois">
          <div><label className="ag-rot" htmlFor="bl-de">{t.de}</label><input className="ag-inp" id="bl-de" onChange={(e) => setDe(e.target.value)} step={900} type="time" value={de} /></div>
          <div><label className="ag-rot" htmlFor="bl-ate">{t.ate}</label><input className="ag-inp" id="bl-ate" onChange={(e) => setAte(e.target.value)} step={900} type="time" value={ate} /></div>
        </div>
      ) : null}

      <p className="ag-dica" style={{ margin: "16px 0 0", textAlign: "left" }}>{t.dica}</p>

      <div className="ag-rodape">
        {erro ? <p className="ag-erro" role="alert">{erro}</p> : null}
        <button className="m-botao" disabled={pendente || (outro && !texto.trim())} onClick={enviar} type="button">{inteiro ? t.bloquearDia : t.bloquear.replace("{de}", de).replace("{ate}", ate)}</button>
      </div>
      {feito ? <div className="m-toast" role="status">{t.bloqueado}</div> : null}
    </main>
  );
}
