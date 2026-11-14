"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { blocosDe, partesDe, useAjudante } from "@/app/components/ajudante/usar-ajudante";

import { IcEnviar, IcMais, IcVoltar } from "../_c/icones";
import { useTecladoDoChat } from "../_c/teclado";
import { AvatarMascote } from "@/app/components/mascote";

type Textos = Record<"titulo" | "sub" | "pergunte" | "enviar" | "voltar" | "nova" | "conversas" | "semConversas" | "desligado" | "erro" | "aPensar" | "mensagemPara" | "cliente" | "enviada" | "enviando" | "falhou" | "verConversa", string>;

/** O Analista Lexia no iPhone: tela inteira, como um chat. */
export function ConversaAjudante({ sugestoes, tela, textos: x }: { sugestoes: string[]; tela?: string; textos: Textos }) {
  const router = useRouter();
  const a = useAjudante({ tela, textos: { desligado: x.desligado, erro: x.erro } });
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const msgs = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  const descer = useCallback(() => msgs.current?.scrollTo({ behavior: "smooth", top: msgs.current.scrollHeight }), []);
  useTecladoDoChat(raiz, descer);
  useEffect(() => { descer(); }, [a.mensagens.length, a.aPensar, descer]);

  const enviar = (valor = texto) => {
    if (!valor.trim()) return;
    setTexto("");
    if (campo.current) campo.current.style.height = "";
    void a.perguntar(valor);
  };
  const linha = (l: string) => partesDe(l).map((p, k) => (p.negrito ? <strong key={k}>{p.t}</strong> : <span key={k}>{p.t}</span>));

  return (
    <div className="m-chat" ref={raiz} style={{ zIndex: 55 }}>
      <header className="m-chat-cab">
        <button aria-label={x.voltar} className="m-redondo" onClick={() => (window.history.length > 1 ? router.back() : router.replace("/m"))} type="button"><IcVoltar /></button>
        <AvatarMascote tamanho={38} />
        <div className="m-meio"><b>{x.titulo}</b><span>{x.sub}</span></div>
        <button className="m-pill" onClick={() => setLista((v) => !v)} type="button">{x.conversas}</button>
        <button aria-label={x.nova} className="m-redondo" onClick={() => { a.nova(); setLista(false); }} type="button"><IcMais /></button>
      </header>

      {lista ? (
        <div className="m-msgs">
          {a.sessoes.length ? a.sessoes.map((s) => (
            <button className="m-aj-sessao" key={s.id} onClick={() => { void a.abrir(s.id); setLista(false); }} type="button">{s.titulo || x.conversas}</button>
          )) : <p className="m-data">{x.semConversas}</p>}
        </div>
      ) : (
        <div className="m-msgs" ref={msgs}>
          {a.mensagens.length === 0 ? (
            <div className="m-aj-vazio">
              {a.ligado === false ? <p>{x.desligado}</p> : null}
              {sugestoes.map((s) => <button disabled={a.ligado === false} key={s} onClick={() => enviar(s)} type="button">{s}</button>)}
            </div>
          ) : null}
          {a.mensagens.map((m) => m.papel === "usuario" ? (
            <div className="m-b eq" key={m.id}>{m.conteudo}</div>
          ) : (
            <div className={`m-aj-resp${m.erro ? " erro" : ""}`} key={m.id}>
              {blocosDe(m.conteudo).map((b, i) => b.tipo === "lista"
                ? <ul key={i}>{b.linhas.map((l, j) => <li key={j}>{linha(l)}</li>)}</ul>
                : <p key={i}>{b.linhas.map((l, j) => <span key={j}>{j ? <br /> : null}{linha(l)}</span>)}</p>)}
              {m.propostas.map((p, i) => (
                <div className="m-aj-proposta" key={i}>
                  <small>{x.mensagemPara.replace("{nome}", p.nome || x.cliente)}</small>
                  <p>{p.texto}</p>
                  <div className="acoes">
                    {p.estado === "enviada" ? <span className="ok">{x.enviada}</span> : <button className="m-pill jade" disabled={p.estado === "enviando"} onClick={() => void a.confirmar(m.id, i)} type="button">{p.estado === "enviando" ? x.enviando : x.enviar}</button>}
                    {p.estado === "erro" ? <span className="falhou">{x.falhou}</span> : null}
                    <Link className="m-pill" href={`/m/conversas/${encodeURIComponent(p.conversa)}`}>{x.verConversa}</Link>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {a.aPensar ? <p className="m-aj-pensar">{a.aPensar === "…" ? x.aPensar : `${a.aPensar}…`}</p> : null}
        </div>
      )}

      <div className="m-compor">
        <textarea
          aria-label={x.pergunte}
          disabled={a.ligado === false}
          enterKeyHint="send"
          onChange={(e) => { setTexto(e.target.value); e.currentTarget.style.height = ""; e.currentTarget.style.height = `${Math.min(140, e.currentTarget.scrollHeight)}px`; }}
          placeholder={x.pergunte}
          ref={campo}
          rows={1}
          value={texto}
        />
        <button aria-label={x.enviar} className="m-mic" disabled={!texto.trim() || Boolean(a.aPensar)} onClick={() => enviar()} onMouseDown={(e) => e.preventDefault()} type="button"><IcEnviar /></button>
      </div>
    </div>
  );
}
