"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { DisplayConversationMessage } from "@/lib/conversations/message-display";
import { createClient } from "@/lib/supabase/client";

import { duracaoCurta } from "@/lib/movel/formato";

import { IcCamara, IcDocumento, IcEnviar, IcFechar, IcGaleria, IcMais, IcMic, IcPausa, IcPlay, IcTelefone, IcVoltar } from "../../_c/icones";
import { useTecladoDoChat } from "../../_c/teclado";

type Estado = "espera" | "comigo" | "agente";
type Inicial = {
  canal: string;
  conversa: string;
  esperaDesde: string | null;
  estado: Estado;
  ficha: string;
  iniciais: string;
  mensagens: DisplayConversationMessage[];
  nome: string;
  telefone: string | null;
  quente: boolean;
  subtitulo: string;
  temperatura: string | null;
  ultimaRecebida: string | null;
};
type Textos = Record<
  | "agente" | "agenteResponde" | "anexar" | "assumir" | "audio" | "camara" | "cancelar" | "devolver" | "documento" | "enviar"
  | "erroEnvio" | "estaConsigo" | "ficha" | "galeria" | "gravando" | "hoje" | "ligar" | "mensagem" | "ontem" | "semMicrofone"
  | "semMensagens" | "voltar" | "audioIndisponivel" | "fotoIndisponivel" | "videoIndisponivel",
  string
>;

/** Mensagem que o aparelho mandou e ainda não voltou do servidor. */
type Pendente = { id: string; texto: string; tipo: "texto" | "imagem" | "audio" | "video" | "documento"; urlLocal?: string; mime?: string; estado: "enviando" | "falhou"; erro?: string; repetir: () => void };

const ATUALIZAR_MS = 3000;
const BUCKET = "lexia-midia";

function quem(m: DisplayConversationMessage): "cli" | "ag" | "eq" {
  if (m.direccao !== "enviada") return "cli";
  return m.origem === "humano" ? "eq" : "ag";
}

/**
 * Na Meta, o agente às vezes grava o eco da mensagem que o dono mandou pelo
 * app (que o painel também gravou). Duas mensagens da equipa iguais em menos
 * de 2 minutos contam como uma.
 */
export function semEcos(ms: DisplayConversationMessage[]) {
  const out: DisplayConversationMessage[] = [];
  for (const m of ms) {
    const ant = out[out.length - 1];
    if (ant && quem(ant) === "eq" && quem(m) === "eq" && (ant.content ?? "") === (m.content ?? "") && (ant.mediaPath ?? "") === (m.mediaPath ?? "") &&
      Math.abs(Date.parse(m.criado_em ?? "") - Date.parse(ant.criado_em ?? "")) < 120_000) continue;
    out.push(m);
  }
  return out;
}

function horaNoFuso(iso: string | null, fuso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}
function diaNoFuso(iso: string | null, fuso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: fuso, year: "numeric" }).format(new Date(iso));
}

/** Alturas da onda do áudio, estáveis para a mesma mensagem. */
export function alturasDaOnda(chave: string, n = 26) {
  const alturas: number[] = [];
  let h = 7;
  for (let i = 0; i < n; i++) {
    h = (h * 31 + chave.charCodeAt(i % Math.max(1, chave.length))) % 97;
    alturas.push(25 + (h % 70));
  }
  return alturas;
}

function Onda({ chave, progresso = 0 }: { chave: string; progresso?: number }) {
  const barras = useMemo(() => alturasDaOnda(chave), [chave]);
  return (
    <div aria-hidden="true" className="m-onda">
      {barras.map((b, i) => <i className={i / barras.length < progresso ? "f" : ""} key={i} style={{ height: `${b}%` }} />)}
    </div>
  );
}

function Audio({ src, chave, onFalha }: { src: string; chave: string; onFalha?: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [prog, setProg] = useState(0);
  const [dur, setDur] = useState(0);
  return (
    <div className="m-audio">
      <button aria-label={tocando ? "Pause" : "Play"} className="m-play" onClick={() => { const a = ref.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }} type="button">
        {tocando ? <IcPausa tamanho={14} /> : <IcPlay />}
      </button>
      <Onda chave={chave} progresso={prog} />
      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", opacity: 0.7, minWidth: 30 }}>{dur ? `${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")}` : ""}</span>
      <audio
        onEnded={() => { setTocando(false); setProg(0); }}
        onError={onFalha}
        onLoadedMetadata={(e) => setDur(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onPause={() => setTocando(false)}
        onPlay={() => setTocando(true)}
        onTimeUpdate={(e) => setProg(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        preload="metadata"
        ref={ref}
        src={src}
      />
    </div>
  );
}

function Indisponivel({ rotulo, texto }: { rotulo: string; texto: string | null }) {
  return <span style={{ display: "block", padding: "6px 9px" }}><span style={{ opacity: 0.6 }}>{rotulo}</span>{texto ? <span style={{ display: "block", marginTop: 4 }}>{texto}</span> : null}</span>;
}

function Conteudo({ tipo, url, texto, chave, mime, rotulos }: { tipo: string; url: string | null; texto: string | null; chave: string; mime?: string; rotulos: { foto: string; video: string; audio: string } }) {
  // Links antigos do WhatsApp vêm cifrados e nenhum navegador os abre: mostra o que era, em vez de uma bolha vazia.
  const [falhou, setFalhou] = useState(false);
  if (tipo === "imagem" && url && !falhou) {
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket, de 1 h: o otimizador da Vercel não ajuda aqui
    return <><img alt="" className="m-midia-img" loading="lazy" onError={() => setFalhou(true)} src={url} />{texto ? <span className="legenda">{texto}</span> : null}</>;
  }
  if (tipo === "video" && url && !falhou) return <><video className="m-midia-video" controls onError={() => setFalhou(true)} playsInline preload="metadata" src={url} />{texto ? <span className="legenda">{texto}</span> : null}</>;
  if (tipo === "audio" && url && !falhou) return <><Audio chave={chave} onFalha={() => setFalhou(true)} src={url} />{texto ? <span className="legenda" style={{ opacity: 0.75, fontSize: 14 }}>{texto}</span> : null}</>;
  if (tipo === "documento" && url) return <a className="m-doc" href={url} rel="noreferrer" target="_blank"><IcDocumento /><span>{texto || mime || "PDF"}</span></a>;
  if (tipo === "imagem") return <Indisponivel rotulo={rotulos.foto} texto={texto} />;
  if (tipo === "video") return <Indisponivel rotulo={rotulos.video} texto={texto} />;
  if (tipo === "audio") return <Indisponivel rotulo={rotulos.audio} texto={texto} />;
  return <>{texto}</>;
}

export function Chat({ inicial, hoje, fuso, locale, textos }: { inicial: Inicial; hoje: string; fuso: string; locale: string; textos: Textos }) {
  const [mensagens, setMensagens] = useState(inicial.mensagens);
  const [estado, setEstado] = useState<Estado>(inicial.estado);
  const [esperaDesde, setEsperaDesde] = useState<string | null>(inicial.esperaDesde);
  const [, setRelogio] = useState(0);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState(false);
  const [gravando, setGravando] = useState<null | { inicio: number; travado: boolean }>(null);
  const [segundos, setSegundos] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mudandoEstado, setMudandoEstado] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const gravador = useRef<{ rec: MediaRecorder; partes: Blob[]; stream: MediaStream; cancelado: boolean } | null>(null);
  const toqueMic = useRef<{ x: number; t: number } | null>(null);
  const inputCamara = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);
  const inputDoc = useRef<HTMLInputElement>(null);
  const ultimoQuando = useRef<string | null>(inicial.mensagens.at(-1)?.criado_em ?? null);
  const perto = useRef(true);

  const raiz = useRef<HTMLDivElement>(null);
  const visiveis = useMemo(() => semEcos(mensagens), [mensagens]);

  // Teclado como no WhatsApp: o topo fica parado e só a lista encolhe. No
  // iPhone o teclado não muda o tamanho da página, empurra-a para cima; aqui o
  // chat acompanha a área visível (visualViewport) em vez de deixar a página
  // subir. Com o plugin de teclado da casca em modo "native" isto não mexe.
  const aoMudarTeclado = useCallback(() => {
    if (perto.current) lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, []);
  useTecladoDoChat(raiz, aoMudarTeclado);
  // O "· N min" da faixa anda sozinho.
  useEffect(() => {
    const id = window.setInterval(() => setRelogio((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const descer = useCallback((suave = false) => {
    const el = lista.current;
    if (el) el.scrollTo({ behavior: suave ? "smooth" : "auto", top: el.scrollHeight });
  }, []);
  useLayoutEffect(() => descer(false), [descer]);

  const mostrarAviso = useCallback((t: string) => {
    setAviso(t);
    window.setTimeout(() => setAviso(null), 3500);
  }, []);

  // Atualização a cada 3 s, só com a tela visível; pede só o que chegou depois.
  const atualizar = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const q = new URLSearchParams({ c: inicial.conversa });
      if (ultimoQuando.current) q.set("desde", ultimoQuando.current);
      const r = await fetch(`/api/m/conversa?${q}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { esperaDesde?: string | null; estado: Estado | null; mensagens: DisplayConversationMessage[] };
      if (d.estado) setEstado(d.estado);
      if (d.estado === "espera" && d.esperaDesde) setEsperaDesde((antes) => antes ?? d.esperaDesde ?? null);
      if (d.estado === "agente") setEsperaDesde(null);
      if (d.mensagens.length) {
        ultimoQuando.current = d.mensagens.at(-1)?.criado_em ?? ultimoQuando.current;
        setMensagens((ant) => {
          const ids = new Set(ant.map((m) => m.displayId));
          return [...ant, ...d.mensagens.filter((m) => !ids.has(m.displayId))];
        });
        // A mensagem que este aparelho mandou já voltou do servidor: tira o "a enviar".
        setPendentes((ps) => ps.filter((p) => p.estado === "falhou"));
      }
    } catch {
      // sem rede: tenta na próxima volta
    }
  }, [inicial.conversa]);

  useEffect(() => {
    const id = window.setInterval(atualizar, ATUALIZAR_MS);
    document.addEventListener("visibilitychange", atualizar);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", atualizar); };
  }, [atualizar]);

  useEffect(() => { if (perto.current) descer(true); }, [visiveis.length, pendentes.length, descer]);

  // ------------------------------------------------------------ enviar
  const enviar = useCallback(async (corpo: { texto?: string; midia?: { caminho: string; mime: string } }, pendente: Omit<Pendente, "estado" | "repetir">) => {
    const tentar = async () => {
      setPendentes((ps) => [...ps.filter((p) => p.id !== pendente.id), { ...pendente, estado: "enviando", repetir: tentar }]);
      try {
        const r = await fetch("/api/m/enviar", { body: JSON.stringify({ conversa: inicial.conversa, ...corpo }), headers: { "content-type": "application/json" }, method: "POST" });
        const d = (await r.json().catch(() => ({}))) as { erro?: string };
        if (!r.ok) throw new Error(d.erro || textos.erroEnvio);
        setEstado("comigo");
        setEsperaDesde(null);
        await atualizar();
        setPendentes((ps) => ps.filter((p) => p.id !== pendente.id));
      } catch (e) {
        setPendentes((ps) => ps.map((p) => (p.id === pendente.id ? { ...p, erro: e instanceof Error ? e.message : textos.erroEnvio, estado: "falhou" } : p)));
      }
    };
    perto.current = true;
    await tentar();
  }, [atualizar, inicial.conversa, textos.erroEnvio]);

  const enviarTexto = () => {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    if (campo.current) campo.current.style.height = "";
    void enviar({ texto: t }, { id: crypto.randomUUID(), texto: t, tipo: "texto" });
    campo.current?.focus();
  };

  const subir = useCallback(async (ficheiro: Blob, mime: string) => {
    const r = await fetch("/api/m/upload", { body: JSON.stringify({ conversa: inicial.conversa, mime, tamanho: ficheiro.size }), headers: { "content-type": "application/json" }, method: "POST" });
    const d = (await r.json().catch(() => ({}))) as { caminho?: string; token?: string; erro?: string };
    if (!r.ok || !d.caminho || !d.token) throw new Error(d.erro || textos.erroEnvio);
    const { error } = await createClient().storage.from(BUCKET).uploadToSignedUrl(d.caminho, d.token, ficheiro, { contentType: mime });
    if (error) throw new Error(textos.erroEnvio);
    return d.caminho;
  }, [inicial.conversa, textos.erroEnvio]);

  const enviarFicheiro = useCallback((ficheiro: Blob, mime: string, legenda = "") => {
    const tipo = mime.startsWith("image/") ? "imagem" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "documento";
    const id = crypto.randomUUID();
    const urlLocal = URL.createObjectURL(ficheiro);
    let caminho: string | null = null;
    const tentar = async () => {
      setPendentes((ps) => [...ps.filter((p) => p.id !== id), { estado: "enviando", id, mime, repetir: tentar, texto: legenda, tipo, urlLocal }]);
      try {
        caminho = caminho ?? (await subir(ficheiro, mime));
        const r = await fetch("/api/m/enviar", { body: JSON.stringify({ conversa: inicial.conversa, midia: { caminho, mime }, texto: legenda }), headers: { "content-type": "application/json" }, method: "POST" });
        const d = (await r.json().catch(() => ({}))) as { erro?: string };
        if (!r.ok) throw new Error(d.erro || textos.erroEnvio);
        setEstado("comigo");
        setEsperaDesde(null);
        await atualizar();
        setPendentes((ps) => ps.filter((p) => p.id !== id));
      } catch (e) {
        setPendentes((ps) => ps.map((p) => (p.id === id ? { ...p, erro: e instanceof Error ? e.message : textos.erroEnvio, estado: "falhou" } : p)));
      }
    };
    perto.current = true;
    void tentar();
  }, [atualizar, inicial.conversa, subir, textos.erroEnvio]);

  const escolheu = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setAnexos(false);
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { mostrarAviso("25 MB"); return; }
    enviarFicheiro(f, f.type || "application/octet-stream", texto.trim());
    setTexto("");
  };

  // ------------------------------------------------------------ gravar áudio
  useEffect(() => {
    if (!gravando) return;
    const id = window.setInterval(() => setSegundos(Math.floor((Date.now() - gravando.inicio) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [gravando]);

  const comecarGravacao = async (travado: boolean) => {
    if (gravador.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const g = { cancelado: false, partes: [] as Blob[], rec, stream };
      rec.ondataavailable = (ev) => { if (ev.data.size) g.partes.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const tipo = (rec.mimeType || mime || "audio/mp4").split(";")[0];
        const blob = new Blob(g.partes, { type: tipo });
        if (!g.cancelado && blob.size > 1500) enviarFicheiro(blob, tipo);
      };
      rec.start(250);
      gravador.current = g;
      setSegundos(0);
      setGravando({ inicio: Date.now(), travado });
      navigator.vibrate?.(10);
    } catch {
      mostrarAviso(textos.semMicrofone);
    }
  };
  const pararGravacao = (cancelar: boolean) => {
    const g = gravador.current;
    if (!g) return;
    g.cancelado = cancelar;
    gravador.current = null;
    setGravando(null);
    try { g.rec.stop(); } catch { g.stream.getTracks().forEach((t) => t.stop()); }
  };

  // Segurar = grava; soltar = envia; arrastar para a esquerda = cancela. Toque curto = grava sem segurar.
  const micDown = (e: React.PointerEvent) => {
    toqueMic.current = { t: Date.now(), x: e.clientX };
    void comecarGravacao(false);
  };
  const micUp = (e: React.PointerEvent) => {
    const t = toqueMic.current;
    toqueMic.current = null;
    if (!t) return;
    if (t.x - e.clientX > 80) { pararGravacao(true); return; }
    if (Date.now() - t.t < 450) { setGravando((g) => (g ? { ...g, travado: true } : g)); return; }
    pararGravacao(false);
  };

  // ------------------------------------------------------------ assumir / devolver
  const mudarEstado = async (accao: "assumir" | "devolver") => {
    setMudandoEstado(true);
    try {
      const r = await fetch("/api/m/conversa/estado", { body: JSON.stringify({ accao, conversa: inicial.conversa }), headers: { "content-type": "application/json" }, method: "POST" });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) throw new Error(d.erro || "");
      setEstado(accao === "assumir" ? "comigo" : "agente");
      if (accao === "devolver") setEsperaDesde(null);
    } catch (e) {
      mostrarAviso(e instanceof Error && e.message ? e.message : textos.erroEnvio);
    } finally {
      setMudandoEstado(false);
    }
  };

  // ------------------------------------------------------------ desenho
  const rotulosMidia = { audio: textos.audioIndisponivel, foto: textos.fotoIndisponivel, video: textos.videoIndisponivel };
  const linhas: React.ReactNode[] = [];
  let diaAnterior = "";
  for (const m of visiveis) {
    const dia = diaNoFuso(m.criado_em, fuso);
    if (dia !== diaAnterior) {
      diaAnterior = dia;
      const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      const rotulo = dia === hoje ? textos.hoje : dia === ontem ? textos.ontem : new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: fuso, weekday: "short" }).format(new Date(m.criado_em ?? ""));
      linhas.push(<div className="m-data" key={`d-${dia}`}>{rotulo}</div>);
    }
    const q = quem(m);
    const temMidia = Boolean(m.mediaUrl) && m.displayType !== "texto";
    linhas.push(
      <div className={`m-b ${q}${temMidia ? " midia" : ""}`} key={m.displayId}>
        <Conteudo chave={m.displayId} rotulos={rotulosMidia} texto={m.content} tipo={m.displayType} url={m.mediaUrl} />
        <small>{q === "ag" ? `${textos.agente} · ` : ""}{horaNoFuso(m.criado_em, fuso)}</small>
      </div>,
    );
  }

  const comigo = estado !== "agente";

  return (
    <div className="m-chat" ref={raiz}>
      <header className="m-chat-cab">
        <Link aria-label={textos.voltar} className="m-ic" href="/m/conversas"><IcVoltar tamanho={22} /></Link>
        <Link aria-label={textos.ficha} className="m-chat-quem" href={inicial.ficha}>
          <span aria-hidden="true" className="m-ini m">{inicial.iniciais}</span>
          <span className="tx">
            <b>{inicial.nome}</b>
            <span>{gravando ? textos.gravando : <>{inicial.subtitulo}{inicial.temperatura ? <> · <em className={inicial.quente ? "q" : undefined}>{inicial.temperatura}</em></> : null}</>}</span>
          </span>
        </Link>
        {inicial.telefone ? <a aria-label={textos.ligar} className="m-ic" href={`tel:+${inicial.telefone}`}><IcTelefone /></a> : null}
      </header>

      <div className={`m-estado-faixa${comigo ? " comigo" : ""}`}>
        <span aria-hidden="true" className="ponto" />
        <span className="tx">{comigo ? <>{textos.estaConsigo}{esperaDesde ? <span className="min"> · {duracaoCurta(esperaDesde, new Date())}</span> : null}</> : textos.agenteResponde}</span>
        <button disabled={mudandoEstado} onClick={() => void mudarEstado(comigo ? "devolver" : "assumir")} type="button">{comigo ? textos.devolver : textos.assumir}</button>
      </div>

      <div className="m-msgs" onScroll={(e) => { const el = e.currentTarget; perto.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; }} ref={lista}>
        {visiveis.length === 0 && pendentes.length === 0 ? <div className="m-data">{textos.semMensagens}</div> : null}
        {linhas}
        {pendentes.map((p) => (
          <button className={`m-b eq${p.urlLocal && p.tipo !== "documento" ? " midia" : ""} ${p.estado}`} key={p.id} onClick={() => p.estado === "falhou" && p.repetir()} style={{ textAlign: "left" }} type="button">
            <Conteudo chave={p.id} mime={p.mime} rotulos={rotulosMidia} texto={p.texto} tipo={p.tipo} url={p.urlLocal ?? null} />
            {p.estado === "falhou" ? <span className="erro">{p.erro || textos.erroEnvio}</span> : <small>…</small>}
          </button>
        ))}
      </div>

      <div className="m-compor">
        {gravando ? (
          <>
            <button aria-label={textos.cancelar} className="m-ic sup" onClick={() => pararGravacao(true)} type="button" style={{ color: "var(--m-vermelho)" }}><IcFechar tamanho={18} /></button>
            <div className="m-gravacao"><span className="bola" /><span className="t">{Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}</span><span style={{ flex: 1, color: "var(--m-texto2)", fontSize: 14 }}>{gravando.travado ? "" : `‹ ${textos.cancelar}`}</span></div>
            {gravando.travado ? <button aria-label={textos.enviar} className="m-mic" onClick={() => pararGravacao(false)} type="button"><IcEnviar /></button> : <button aria-label={textos.audio} className="m-mic gravando" onPointerCancel={() => pararGravacao(true)} onPointerUp={micUp} type="button"><IcMic /></button>}
          </>
        ) : (
          <>
            <button aria-label={textos.anexar} className="m-ic sup" onClick={() => setAnexos(true)} type="button"><IcMais tamanho={20} /></button>
            <textarea
              aria-label={textos.mensagem}
              enterKeyHint="send"
              onChange={(e) => { setTexto(e.target.value); e.currentTarget.style.height = ""; e.currentTarget.style.height = `${Math.min(140, e.currentTarget.scrollHeight)}px`; }}
              onFocus={() => window.setTimeout(() => descer(true), 250)}
              placeholder={textos.mensagem}
              ref={campo}
              rows={1}
              value={texto}
            />
            {texto.trim() ? (
              <button aria-label={textos.enviar} className="m-mic" onClick={enviarTexto} onMouseDown={(e) => e.preventDefault()} type="button"><IcEnviar /></button>
            ) : (
              <button aria-label={textos.audio} className="m-mic" onContextMenu={(e) => e.preventDefault()} onPointerDown={micDown} onPointerUp={micUp} style={{ touchAction: "none" }} type="button"><IcMic /></button>
            )}
          </>
        )}
      </div>

      <input accept="image/*,video/*" capture="environment" hidden onChange={escolheu} ref={inputCamara} type="file" />
      <input accept="image/*,video/*" hidden onChange={escolheu} ref={inputGaleria} type="file" />
      <input accept="application/pdf,.doc,.docx,.xls,.xlsx" hidden onChange={escolheu} ref={inputDoc} type="file" />

      {anexos ? (
        <>
          <div className="m-veu" onClick={() => setAnexos(false)} />
          <div className="m-folha" role="dialog">
            <div className="m-pega" />
            <div className="m-grade-acoes" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 0 }}>
              <button onClick={() => inputCamara.current?.click()} type="button"><span className="c"><IcCamara /></span>{textos.camara}</button>
              <button onClick={() => inputGaleria.current?.click()} type="button"><span className="c"><IcGaleria /></span>{textos.galeria}</button>
              <button onClick={() => inputDoc.current?.click()} type="button"><span className="c"><IcDocumento /></span>{textos.documento}</button>
            </div>
            <button className="m-botao" onClick={() => setAnexos(false)} type="button">{textos.cancelar}</button>
          </div>
        </>
      ) : null}

      {aviso ? <div className="m-toast" role="status">{aviso}</div> : null}
    </div>
  );
}
