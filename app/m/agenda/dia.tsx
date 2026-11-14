"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { IcCalendario, IcCheck, IcConversa, IcMais, IcTelefone } from "../_c/icones";
import { marcarMovel } from "./acoes";
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
  pendenteSinal: boolean;
  servico: string | null;
  telefone: string | null;
  valorTexto: string | null;
};
type Servico = { id: string; nome: string; preco: number | null; precoTexto: string | null; executores: { chave: string; nome: string; duracaoMinutos: number }[] };
type Contacto = { id: string; nome: string; telefone: string };
type Textos = Record<
  | "abrirGoogle" | "agente" | "agenteTag" | "agora" | "cancelado" | "cliente" | "confirmar" | "conversa" | "dia" | "erroGeral" | "escolhaCliente" | "faltaSinal" | "fechar" | "hora"
  | "ligar" | "manual" | "marcado" | "marcar" | "marcarMesmoAssim" | "nenhum" | "novaMarcacao" | "ocupado" | "procurarCliente" | "profissional" | "servico",
  string
>;

const semAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function DiaAgenda(props: {
  abrirMarcar: boolean; agrupar: boolean; contactoInicial: string | null; horaAgora: string; contactos: Contacto[]; dia: string; eHoje: boolean; eventos: Evento[]; podeMarcar: boolean; servicos: Servico[]; textos: Textos;
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
      <section aria-label={t.dia} className="m6-eventos">
        {ativos.length === 0 ? <VazioMascote>{t.nenhum}</VazioMascote> : ativos.map((e, i) => {
          const linhaAgora = !props.agrupar && props.eHoje && e.hora > horaAgora && (i === 0 || ativos[i - 1].hora <= horaAgora);
          const novoDia = props.agrupar && (i === 0 || ativos[i - 1].dia !== e.dia);
          const cancelado = e.estado === "cancelado";
          return (
            <div key={e.id}>
              {novoDia ? <p className="m6-rotulo m6-grupo">{e.rotuloDia}</p> : null}
              {linhaAgora ? <div aria-label={`${t.agora}, ${horaAgora}`} className="m6-agora"><span>{horaAgora}</span><i /></div> : null}
              <button className={`m6-ev${e.passou || cancelado ? " passou" : ""}${cancelado ? " cancelado" : ""}`} onClick={() => setAberto(e)} type="button">
                <span className="h">{e.hora}</span>
                <span className="n">{e.nome || "—"}</span>
                {cancelado ? <span className="v">{t.cancelado}</span> : e.origem === "agente" ? <span className="v ag">{t.agenteTag}</span> : <span className="v">{e.valorTexto ?? ""}</span>}
                <span className="d">{[e.servico, e.executor, e.pendenteSinal ? t.faltaSinal : null].filter(Boolean).join(" · ") || " "}</span>
              </button>
            </div>
          );
        })}
        {!props.agrupar && props.eHoje && ativos.length > 0 && ativos[ativos.length - 1].hora <= horaAgora ? <div aria-label={`${t.agora}, ${horaAgora}`} className="m6-agora"><span>{horaAgora}</span><i /></div> : null}
      </section>

      {props.podeMarcar ? <button className="m-flutuante" onClick={() => setMarcar(true)} type="button"><IcMais tamanho={18} /> {t.marcar}</button> : null}

      {aberto ? (
        <>
          <div className="m-veu" onClick={() => setAberto(null)} />
          <div aria-label={aberto.nome} className="m-folha" role="dialog">
            <div className="m-pega" />
            <h3>{aberto.nome || "—"}</h3>
            <p className="d">{[`${aberto.hora}–${aberto.horaFim}`, aberto.servico, aberto.executor, aberto.valorTexto].filter(Boolean).join(" · ")}<br />{aberto.origem === "agente" ? t.agente : t.manual}{aberto.pendenteSinal ? ` · ${t.faltaSinal}` : ""}</p>
            <div className="m-grade-acoes" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {aberto.conversa ? <Link href={`/m/conversas/${encodeURIComponent(aberto.conversa)}`}><span className="c"><IcConversa /></span>{t.conversa}</Link> : <span style={{ opacity: 0.4 }}><span className="c"><IcConversa /></span>{t.conversa}</span>}
              {aberto.telefone ? <a href={`tel:+${aberto.telefone}`}><span className="c"><IcTelefone /></span>{t.ligar}</a> : <span style={{ opacity: 0.4 }}><span className="c"><IcTelefone /></span>{t.ligar}</span>}
              {aberto.link ? <a href={aberto.link} rel="noreferrer" target="_blank"><span className="c"><IcCalendario /></span>Google</a> : <span style={{ opacity: 0.4 }}><span className="c"><IcCalendario /></span>Google</span>}
            </div>
            <button className="m-botao" onClick={() => setAberto(null)} type="button">{t.fechar}</button>
          </div>
        </>
      ) : null}

      {marcar ? (
        <FormMarcar
          contactoInicial={props.contactoInicial}
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

function FormMarcar({ contactoInicial, contactos, dia, onFechar, onMarcado, servicos, textos: t }: { contactoInicial: string | null; contactos: Contacto[]; dia: string; onFechar: () => void; onMarcado: () => void; servicos: Servico[]; textos: Textos }) {
  const [busca, setBusca] = useState("");
  // Vindo da ficha de um cliente (?contacto=…): já escolhido.
  const [contacto, setContacto] = useState<Contacto | null>(() => contactos.find((c) => c.id === contactoInicial) ?? null);
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
          <IcCheck tamanho={18} /> {conflitos.length ? t.marcarMesmoAssim : avisos.length ? t.confirmar : t.marcar}
        </button>
      </div>
    </>
  );
}
