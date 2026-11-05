"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { IcEnviar, IcMais, IcRobo, IcVoltar } from "../_c/icones";
import { enviarTeste, lerConversaTeste, novaConversaTeste } from "./actions";
import { bolhasDe, SEM_SESSAO, type ExecucaoTeste } from "./bolhas";

type Textos = Record<
  | "agente" | "aguardando" | "demorou" | "enviar" | "erroEnvio" | "hoje" | "mensagem" | "nova" | "novaFeita" | "ontem"
  | "semMensagens" | "semSessao" | "semWorkflow" | "subtitulo" | "titulo" | "voltar",
  string
>;
type Workflow = { id: string; nome: string };

/** Mensagem que o dono mandou e cuja resposta ainda não foi gravada pelo n8n. */
type Pendente = { id: string; texto: string; runId: string | null; desde: number; estado: "enviando" | "aguardando" | "demorou" | "falhou"; erro?: string };

/** O n8n junta mensagens 60 s antes de responder (~70 s por resposta): espera até 3 min. */
const ATUALIZAR_MS = 2500;
const DESISTIR_MS = 180_000;
const CHAVE_WORKFLOW = "lexia_m_testes_workflow";

function horaNoFuso(iso: string | null, fuso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}
function diaNoFuso(iso: string | null, fuso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: fuso, year: "numeric" }).format(new Date(iso));
}

export function ChatTeste({ execucoes, fuso, hoje, locale, sessao: sessaoInicial, textos, workflows }: {
  execucoes: ExecucaoTeste[];
  fuso: string;
  hoje: string;
  locale: string;
  sessao: string | null;
  textos: Textos;
  workflows: Workflow[];
}) {
  const router = useRouter();
  const [sessao, setSessao] = useState(sessaoInicial);
  const [lista, setLista] = useState(execucoes);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [texto, setTexto] = useState("");
  const [workflow, setWorkflow] = useState(workflows[0]?.id ?? "");
  const [aviso, setAviso] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const msgs = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const perto = useRef(true);
  const sessaoRef = useRef(sessao);
  sessaoRef.current = sessao;

  // A escolha do workflow (quando a empresa tem mais de um) fica no aparelho.
  useEffect(() => {
    const guardado = window.localStorage.getItem(CHAVE_WORKFLOW);
    if (guardado && workflows.some((w) => w.id === guardado)) setWorkflow(guardado);
  }, [workflows]);

  // Teclado como no chat real: o topo fica parado e só a lista encolhe.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = raiz.current;
    if (!vv || !el) return;
    const ajustar = () => {
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
      if (perto.current) msgs.current?.scrollTo({ top: msgs.current.scrollHeight });
    };
    ajustar();
    vv.addEventListener("resize", ajustar);
    vv.addEventListener("scroll", ajustar);
    return () => { vv.removeEventListener("resize", ajustar); vv.removeEventListener("scroll", ajustar); };
  }, []);

  const descer = useCallback((suave = false) => {
    const el = msgs.current;
    if (el) el.scrollTo({ behavior: suave ? "smooth" : "auto", top: el.scrollHeight });
  }, []);
  useLayoutEffect(() => descer(false), [descer]);

  const mostrarAviso = useCallback((t: string) => {
    setAviso(t);
    window.setTimeout(() => setAviso(null), 3500);
  }, []);
  const traduzErro = useCallback((e: string) => (e === SEM_SESSAO ? textos.semSessao : e), [textos.semSessao]);

  // Polling leve: só enquanto há resposta por chegar e com a tela visível.
  const esperando = pendentes.some((p) => p.estado === "aguardando");
  const atualizar = useCallback(async () => {
    const s = sessaoRef.current;
    if (!s || document.visibilityState !== "visible") return;
    try {
      const r = await lerConversaTeste(s);
      if (!r.dados || sessaoRef.current !== s) return;
      const chegaram = new Set(r.dados.map((e) => e.run_id).filter(Boolean));
      setLista(r.dados);
      setPendentes((ps) =>
        ps
          .filter((p) => !(p.runId && chegaram.has(p.runId)))
          .map((p) => (p.estado === "aguardando" && Date.now() - p.desde > DESISTIR_MS ? { ...p, estado: "demorou" } : p)),
      );
    } catch {
      // sem rede: tenta na próxima volta
    }
  }, []);

  useEffect(() => {
    if (!esperando) return;
    const id = window.setInterval(atualizar, ATUALIZAR_MS);
    document.addEventListener("visibilitychange", atualizar);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", atualizar); };
  }, [atualizar, esperando]);

  const bolhas = useMemo(() => bolhasDe(lista), [lista]);
  useEffect(() => { if (perto.current) descer(true); }, [bolhas.length, pendentes.length, descer]);

  const mandar = useCallback(async (p: Pendente) => {
    setPendentes((ps) => [...ps.filter((x) => x.id !== p.id), { ...p, desde: Date.now(), erro: undefined, estado: "enviando" }]);
    try {
      const r = await enviarTeste(sessaoRef.current, p.texto, workflow);
      if (!r.dados) throw new Error(traduzErro(r.erro));
      sessaoRef.current = r.dados.sessao;
      setSessao(r.dados.sessao);
      setPendentes((ps) => ps.map((x) => (x.id === p.id ? { ...x, desde: Date.now(), estado: "aguardando", runId: r.dados.runId } : x)));
    } catch (e) {
      setPendentes((ps) => ps.map((x) => (x.id === p.id ? { ...x, erro: e instanceof Error && e.message ? e.message : textos.erroEnvio, estado: "falhou" } : x)));
    }
  }, [textos.erroEnvio, traduzErro, workflow]);

  const enviarTexto = () => {
    const t = texto.trim();
    if (!t) return;
    if (!workflow) { mostrarAviso(textos.semWorkflow); return; }
    setTexto("");
    if (campo.current) campo.current.style.height = "";
    perto.current = true;
    void mandar({ desde: Date.now(), estado: "enviando", id: crypto.randomUUID(), runId: null, texto: t });
    campo.current?.focus();
  };

  const tocarPendente = (p: Pendente) => {
    if (p.estado === "falhou") void mandar(p);
    if (p.estado === "demorou") {
      setPendentes((ps) => ps.map((x) => (x.id === p.id ? { ...x, desde: Date.now(), estado: "aguardando" } : x)));
      void atualizar();
    }
  };

  const nova = async () => {
    if (abrindo) return;
    setAbrindo(true);
    try {
      const r = await novaConversaTeste();
      if (!r.dados) { mostrarAviso(traduzErro(r.erro)); return; }
      sessaoRef.current = r.dados.sessao;
      setSessao(r.dados.sessao);
      setLista([]);
      setPendentes([]);
      mostrarAviso(textos.novaFeita);
    } catch {
      mostrarAviso(textos.erroEnvio);
    } finally {
      setAbrindo(false);
    }
  };

  const voltar = () => {
    if (window.history.length > 1) router.back();
    else router.push("/m");
  };

  // ------------------------------------------------------------ desenho
  const linhas: React.ReactNode[] = [];
  let diaAnterior = "";
  for (const b of bolhas) {
    const dia = diaNoFuso(b.quando, fuso);
    if (dia && dia !== diaAnterior) {
      diaAnterior = dia;
      const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      const rotulo = dia === hoje ? textos.hoje : dia === ontem ? textos.ontem : new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: fuso, weekday: "short" }).format(new Date(b.quando ?? ""));
      linhas.push(<div className="m-data" key={`d-${dia}`}>{rotulo}</div>);
    }
    // Aqui o dono faz de cliente: o agente fica à esquerda, o dono à direita.
    linhas.push(
      <div className={`m-b ${b.lado === "agente" ? "cli" : "eq"}`} key={b.id}>
        {b.texto}
        <small>{horaNoFuso(b.quando, fuso)}</small>
      </div>,
    );
  }

  return (
    // zIndex: cobre a barra de abas, como o chat das conversas (tela inteira).
    <div className="m-chat" ref={raiz} style={{ zIndex: 55 }}>
      <header className="m-chat-cab">
        <button aria-label={textos.voltar} className="m-redondo" onClick={voltar} type="button"><IcVoltar /></button>
        <div className="m-meio">
          <b>{textos.titulo}</b>
          {workflows.length > 1 ? (
            <span>
              <select
                aria-label={textos.subtitulo}
                onChange={(e) => { setWorkflow(e.target.value); window.localStorage.setItem(CHAVE_WORKFLOW, e.target.value); }}
                style={{ appearance: "none", background: "transparent", border: 0, color: "inherit", font: "inherit", maxWidth: "100%", padding: 0 }}
                value={workflow}
              >
                {workflows.map((w) => <option key={w.id} value={w.id}>{w.nome} ▾</option>)}
              </select>
            </span>
          ) : (
            <span>{textos.subtitulo}</span>
          )}
        </div>
        <button aria-label={textos.nova} className="m-redondo" disabled={abrindo} onClick={() => void nova()} type="button"><IcMais /></button>
      </header>

      <div className="m-msgs" onScroll={(e) => { const el = e.currentTarget; perto.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; }} ref={msgs}>
        {bolhas.length === 0 && pendentes.length === 0 ? <div className="m-data" style={{ textAlign: "center" }}>{workflows.length ? textos.semMensagens : textos.semWorkflow}</div> : null}
        {linhas}
        {pendentes.map((p) => (
          <div key={p.id} style={{ display: "contents" }}>
            <button className={`m-b eq${p.estado === "enviando" ? " enviando" : p.estado === "falhou" ? " falhou" : ""}`} onClick={() => tocarPendente(p)} style={{ textAlign: "left" }} type="button">
              {p.texto}
              {p.estado === "falhou" ? <span className="erro">{p.erro || textos.erroEnvio}</span> : <small>…</small>}
            </button>
            {p.estado === "aguardando" ? (
              <div aria-live="polite" className="m-b cli" style={{ opacity: 0.7 }}>
                <span style={{ alignItems: "center", display: "inline-flex", gap: 6 }}><IcRobo /> {textos.aguardando}</span>
              </div>
            ) : null}
            {p.estado === "demorou" ? (
              <button className="m-b cli" onClick={() => tocarPendente(p)} style={{ opacity: 0.8, textAlign: "left" }} type="button">{textos.demorou}</button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="m-compor">
        <textarea
          aria-label={textos.mensagem}
          disabled={!workflows.length}
          enterKeyHint="send"
          onChange={(e) => { setTexto(e.target.value); e.currentTarget.style.height = ""; e.currentTarget.style.height = `${Math.min(140, e.currentTarget.scrollHeight)}px`; }}
          onFocus={() => window.setTimeout(() => descer(true), 250)}
          placeholder={textos.mensagem}
          ref={campo}
          rows={1}
          value={texto}
        />
        <button aria-label={textos.enviar} className="m-mic" disabled={!texto.trim() || !workflows.length} onClick={enviarTexto} onMouseDown={(e) => e.preventDefault()} type="button"><IcEnviar /></button>
      </div>

      {aviso ? <div className="m-toast" role="status">{aviso}</div> : null}
    </div>
  );
}
