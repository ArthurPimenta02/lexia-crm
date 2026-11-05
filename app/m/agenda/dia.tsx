"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { IcCalendario, IcCheck, IcConversa, IcMais, IcTelefone } from "../_c/icones";
import { marcarMovel } from "./acoes";

type Evento = {
  conversa: string | null;
  cor: string;
  estado: string;
  executor: string | null;
  hora: string;
  horaFim: string;
  id: string;
  link: string | null;
  nome: string;
  origem: string;
  pendenteSinal: boolean;
  servico: string | null;
  telefone: string | null;
  valorTexto: string | null;
};
type Servico = { id: string; nome: string; preco: number | null; precoTexto: string | null; executores: { chave: string; nome: string; duracaoMinutos: number }[] };
type Contacto = { id: string; nome: string; telefone: string };
type Textos = Record<
  | "abrirGoogle" | "agente" | "cancelado" | "cliente" | "confirmar" | "conversa" | "dia" | "erroGeral" | "escolhaCliente" | "faltaSinal" | "fechar" | "hora"
  | "ligar" | "manual" | "marcado" | "marcar" | "marcarMesmoAssim" | "nenhum" | "novaMarcacao" | "ocupado" | "procurarCliente" | "profissional" | "servico",
  string
>;

const semAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function DiaAgenda(props: {
  abrirMarcar: boolean; horaAgora: string; contactos: Contacto[]; dia: string; eHoje: boolean; eventos: Evento[]; podeMarcar: boolean; servicos: Servico[]; textos: Textos;
}) {
  const { textos: t } = props;
  const router = useRouter();
  const [aberto, setAberto] = useState<Evento | null>(null);
  const [marcar, setMarcar] = useState(props.abrirMarcar && props.podeMarcar);
  const [aviso, setAviso] = useState<string | null>(null);

  const horaAgora = props.horaAgora;
  const ativos = props.eventos;

  return (
    <>
      <div style={{ marginTop: 14 }}>
        {ativos.length === 0 ? <div className="m-vazio">{t.nenhum}</div> : ativos.map((e, i) => {
          const linhaAgora = props.eHoje && e.hora > horaAgora && (i === 0 || ativos[i - 1].hora <= horaAgora);
          return (
            <div key={e.id}>
              {linhaAgora ? <div aria-hidden="true" style={{ alignItems: "center", display: "flex", gap: 6, margin: "2px 0 6px 54px" }}><i style={{ background: "var(--m-vermelho)", borderRadius: "50%", height: 9, width: 9 }} /><span style={{ background: "var(--m-vermelho)", flex: 1, height: 2 }} /></div> : null}
              <div className="m-linha-t">
                <div className="hh">{e.hora}</div>
                <div className="sl">
                  <button className={`m-evento ${e.cor}${e.estado === "cancelado" ? " cancelado" : ""}`} onClick={() => setAberto(e)} type="button">
                    <span className="barra" />
                    <span style={{ minWidth: 0 }}>
                      <b>{e.nome || "—"}</b>
                      <span style={{ textTransform: "none" }}>{[e.servico, e.executor, e.valorTexto, e.pendenteSinal ? t.faltaSinal : null, e.estado === "cancelado" ? t.cancelado : null].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {props.podeMarcar ? <button className="m-flutuante" onClick={() => setMarcar(true)} type="button"><IcMais /> {t.marcar}</button> : null}

      {aberto ? (
        <>
          <div className="m-veu" onClick={() => setAberto(null)} />
          <div aria-label={aberto.nome} className="m-folha" role="dialog">
            <div className="m-pega" />
            <h3>{aberto.nome || "—"}</h3>
            <p className="d">{[`${aberto.hora}–${aberto.horaFim}`, aberto.servico, aberto.executor, aberto.valorTexto].filter(Boolean).join(" · ")}<br />{aberto.origem === "agente" ? t.agente : t.manual}{aberto.pendenteSinal ? ` · ${t.faltaSinal}` : ""}</p>
            <div className="m-grade-acoes" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {aberto.conversa ? <Link href={`/m/conversas/${encodeURIComponent(aberto.conversa)}`}><IcConversa />{t.conversa}</Link> : <span style={{ opacity: 0.4 }}><IcConversa />{t.conversa}</span>}
              {aberto.telefone ? <a href={`tel:+${aberto.telefone}`}><IcTelefone />{t.ligar}</a> : <span style={{ opacity: 0.4 }}><IcTelefone />{t.ligar}</span>}
              {aberto.link ? <a href={aberto.link} rel="noreferrer" target="_blank"><IcCalendario />Google</a> : <span style={{ opacity: 0.4 }}><IcCalendario />Google</span>}
            </div>
            <button className="m-botao" onClick={() => setAberto(null)} type="button">{t.fechar}</button>
          </div>
        </>
      ) : null}

      {marcar ? (
        <FormMarcar
          contactos={props.contactos}
          dia={props.dia}
          onFechar={() => setMarcar(false)}
          onMarcado={() => { setMarcar(false); setAviso(t.marcado); window.setTimeout(() => setAviso(null), 3000); router.refresh(); }}
          servicos={props.servicos}
          textos={t}
        />
      ) : null}

      {aviso ? <div className="m-toast" role="status">{aviso}</div> : null}
    </>
  );
}

function FormMarcar({ contactos, dia, onFechar, onMarcado, servicos, textos: t }: { contactos: Contacto[]; dia: string; onFechar: () => void; onMarcado: () => void; servicos: Servico[]; textos: Textos }) {
  const [busca, setBusca] = useState("");
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [servicoId, setServicoId] = useState(servicos[0]?.id ?? "");
  const servico = servicos.find((s) => s.id === servicoId) ?? null;
  const [executor, setExecutor] = useState(servico?.executores[0]?.chave ?? "");
  const [data, setData] = useState(dia);
  const [hora, setHora] = useState("10:00");
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [conflitos, setConflitos] = useState<string[]>([]);
  const [pendente, inicia] = useTransition();

  const encontrados = useMemo(() => {
    const q = semAcentos(busca.trim());
    if (!q) return contactos.slice(0, 6);
    return contactos.filter((c) => semAcentos(`${c.nome} ${c.telefone}`).includes(q)).slice(0, 8);
  }, [busca, contactos]);
  const exec = servico?.executores.find((e) => e.chave === executor) ?? servico?.executores[0] ?? null;

  const enviar = (extra: Record<string, string> = {}) => {
    if (!contacto || !servico || !exec) { setErro(t.escolhaCliente); return; }
    const f = new FormData();
    f.set("contacto_id", contacto.id);
    f.set("servico_id", servico.id);
    f.set("executor", exec.chave);
    f.set("duracao", String(exec.duracaoMinutos));
    f.set("data", data);
    f.set("hora", hora);
    if (servico.preco) f.set("valor", String(servico.preco));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    setErro(null);
    inicia(async () => {
      const r = await marcarMovel(f);
      if (r.ok) { onMarcado(); return; }
      setAvisos(r.avisos);
      setConflitos(r.conflitos);
      if (r.erro && !r.conflitos.length) setErro(r.erro);
    });
  };

  return (
    <>
      <div className="m-veu" onClick={onFechar} />
      <div aria-label={t.novaMarcacao} className="m-folha" role="dialog">
        <div className="m-pega" />
        <h3 style={{ marginBottom: 14 }}>{t.novaMarcacao}</h3>

        {contacto ? (
          <button className="m-campo" onClick={() => setContacto(null)} style={{ textAlign: "left" }} type="button"><small>{t.cliente}</small><b>{contacto.nome}</b></button>
        ) : (
          <>
            <label className="m-campo"><small>{t.cliente}</small><input autoComplete="off" enterKeyHint="search" onChange={(e) => setBusca(e.target.value)} placeholder={t.procurarCliente} value={busca} /></label>
            <div className="m-caixa" style={{ marginBottom: 8 }}>
              {encontrados.map((c) => (
                <button className="m-opcao" key={c.id} onClick={() => setContacto(c)} type="button"><div><b>{c.nome}</b><span>{c.telefone}</span></div></button>
              ))}
            </div>
          </>
        )}

        <label className="m-campo"><small>{t.servico}</small>
          <select onChange={(e) => { setServicoId(e.target.value); const s = servicos.find((x) => x.id === e.target.value); setExecutor(s?.executores[0]?.chave ?? ""); }} value={servicoId}>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.precoTexto ? ` · ${s.precoTexto}` : ""}</option>)}
          </select>
        </label>
        {servico && servico.executores.length > 1 ? (
          <div className="m-segm" style={{ margin: "4px 0 10px" }}>
            {servico.executores.map((e) => <button className={exec?.chave === e.chave ? "on" : ""} key={e.chave} onClick={() => setExecutor(e.chave)} type="button">{e.nome}</button>)}
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <label className="m-campo"><small>{t.dia}</small><input onChange={(e) => setData(e.target.value)} type="date" value={data} /></label>
          <label className="m-campo"><small>{t.hora}</small><input onChange={(e) => setHora(e.target.value)} step={900} type="time" value={hora} /></label>
        </div>

        {avisos.length ? <div className="m-faixa" style={{ background: "var(--m-laranja-claro)", margin: "6px 0 10px" }}><div className="txt">{avisos.map((a) => <span key={a} style={{ color: "var(--m-texto)", display: "block" }}>{a}</span>)}</div></div> : null}
        {conflitos.length ? <div className="m-faixa" style={{ background: "var(--m-laranja-claro)", margin: "6px 0 10px" }}><div className="txt"><b>{t.ocupado}</b>{conflitos.map((a) => <span key={a} style={{ color: "var(--m-texto)", display: "block" }}>{a}</span>)}</div></div> : null}
        {erro ? <p style={{ color: "var(--m-vermelho)", fontSize: 14, margin: "6px 4px 10px" }}>{erro}</p> : null}

        <button className="m-botao verde" disabled={pendente} onClick={() => enviar(conflitos.length ? { confirmado: "sim", ignorar_conflito: "sim" } : avisos.length ? { confirmado: "sim" } : {})} style={{ marginTop: 8 }} type="button">
          <IcCheck /> {conflitos.length ? t.marcarMesmoAssim : avisos.length ? t.confirmar : t.marcar}
        </button>
      </div>
    </>
  );
}
