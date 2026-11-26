"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { IcFechar } from "../../../../_c/icones";
import { gravarFichaMovel } from "./acoes";

type Textos = Record<"automatico" | "deOnde" | "deOutro" | "fechar" | "guardado" | "notas" | "notasDica" | "salvar", string>;

export function FormEditarFicha(props: { contactoId: string; detetado: string | null; nome: string; notas: string; opcoes: { rotulo: string; valor: string }[]; origem: string; origemNota: string; textos: Textos; volta: string }) {
  const { textos: t } = props;
  const router = useRouter();
  const [origem, setOrigem] = useState(props.origem);
  const [nota, setNota] = useState(props.origemNota);
  const [notas, setNotas] = useState(props.notas);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, inicia] = useTransition();

  const salvar = () => inicia(async () => {
    const r = await gravarFichaMovel(props.contactoId, origem, nota, notas);
    if (!r.ok) { setErro(r.erro); return; }
    setFeito(true);
    window.setTimeout(() => { router.push(props.volta); router.refresh(); }, 700);
  });

  return (
    <main className="m-pagina sem-abas ag">
      <header className="ag-cab">
        <Link aria-label={t.fechar} className="ag-x" href={props.volta}><IcFechar tamanho={18} /></Link>
        <b>{props.nome}</b>
        <span />
      </header>

      {props.detetado ? <div className="ag-faixa" style={{ marginTop: 4 }}>{props.detetado}</div> : null}

      <div className="ag-campo">
        <span className="ag-rot">{t.deOnde}</span>
        <div className="ag-radios" role="radiogroup">
          <label><input checked={origem === ""} name="origem" onChange={() => setOrigem("")} type="radio" /><span>{t.automatico}</span></label>
          {props.opcoes.map((o) => (
            <label key={o.valor}><input checked={origem === o.valor} name="origem" onChange={() => setOrigem(o.valor)} type="radio" /><span>{o.rotulo}</span></label>
          ))}
        </div>
        {origem === "outro" ? <input aria-label={t.deOutro} className="ag-inp" maxLength={200} onChange={(e) => setNota(e.target.value)} placeholder={t.deOutro} style={{ marginTop: 8 }} value={nota} /> : null}
      </div>

      <div className="ag-campo">
        <label className="ag-rot" htmlFor="ag-notas">{t.notas}</label>
        <textarea className="ag-inp ag-area" id="ag-notas" maxLength={4000} onChange={(e) => setNotas(e.target.value)} placeholder={t.notasDica} value={notas} />
      </div>

      <div className="ag-rodape">
        {erro ? <p className="ag-erro" role="alert">{erro}</p> : null}
        <button className="m-botao verde" disabled={pendente} onClick={salvar} type="button">{t.salvar}</button>
      </div>
      {feito ? <div className="m-toast" role="status">{t.guardado}</div> : null}
    </main>
  );
}
