"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useIdioma } from "@/app/components/idioma";

import { blocosDe, partesDe, useAjudante } from "./usar-ajudante";
import { AvatarMascote } from "@/app/components/mascote";

/**
 * O Analista Lexia no painel do computador: a mesma conversa serve o painel
 * lateral (sempre à mão, tipo Sidekick) e a tela inteira (/app/analista).
 */
export function PainelAjudante({ cliente, modo, onFechar, tela, telaInteira }: { cliente?: string; modo: "lateral" | "tela"; onFechar?: () => void; tela?: string; telaInteira?: string }) {
  const { t } = useIdioma();
  const a = useAjudante({ cliente, tela, textos: { desligado: t("O Analista Lexia ainda não está ligado."), erro: t("Não consegui responder agora. Tente de novo.") } });
  const [texto, setTexto] = useState("");
  const [historico, setHistorico] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [a.mensagens.length, a.aPensar]);

  const enviar = (valor = texto) => {
    if (!valor.trim()) return;
    setTexto("");
    void a.perguntar(valor);
    campo.current?.focus();
  };
  const sugestoes = [t("Como foi esta semana?"), t("Quem está esperando resposta?"), t("Qual campanha está trazendo mais leads?"), t("Escreva uma resposta para quem espera há mais tempo")];

  return (
    <div className={`flex h-full min-h-0 flex-col bg-surface ${modo === "lateral" ? "border-l border-border shadow-2xl" : "rounded-2xl border border-border"}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <AvatarMascote tamanho={34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t("Analista Lexia")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("Pergunte qualquer coisa sobre o seu negócio")}</p>
        </div>
        <button className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted" onClick={() => setHistorico((v) => !v)} type="button">{t("Conversas")}</button>
        <button aria-label={t("Nova conversa")} className="rounded-lg px-2 py-1 text-lg leading-none text-muted-foreground hover:bg-muted" onClick={() => { a.nova(); setHistorico(false); }} title={t("Nova conversa")} type="button">+</button>
        {telaInteira ? <Link aria-label={t("Abrir em tela inteira")} className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted" href={telaInteira} title={t("Abrir em tela inteira")}>⤢</Link> : null}
        {onFechar ? <button aria-label={t("Fechar")} className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted" onClick={onFechar} type="button">✕</button> : null}
      </div>

      {historico ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {a.sessoes.length ? a.sessoes.map((s) => (
            <button className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${a.sessao === s.id ? "bg-muted font-medium" : ""}`} key={s.id} onClick={() => { void a.abrir(s.id); setHistorico(false); }} type="button">{s.titulo || t("Conversa")}</button>
          )) : <p className="p-3 text-sm text-muted-foreground">{t("Ainda não há conversas.")}</p>}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {a.mensagens.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="mb-1 text-sm text-muted-foreground">{a.ligado === false ? t("O Analista Lexia ainda não está ligado.") : t("Consulto a agenda, as conversas, os leads e as campanhas, e preparo respostas para você confirmar.")}</p>
              {sugestoes.map((s) => <button className="rounded-xl border border-border px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50" disabled={a.ligado === false} key={s} onClick={() => enviar(s)} type="button">{s}</button>)}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {a.mensagens.map((m) => m.papel === "usuario" ? (
                <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground" key={m.id}>{m.conteudo}</div>
              ) : (
                <div className={`max-w-[95%] self-start text-sm leading-relaxed ${m.erro ? "text-danger" : "text-foreground"}`} key={m.id}>
                  {blocosDe(m.conteudo).map((b, i) => b.tipo === "lista" ? (
                    <ul className="my-1.5 list-disc space-y-1 pl-5" key={i}>{b.linhas.map((l, j) => <li key={j}>{partesDe(l).map((p, k) => p.negrito ? <strong key={k}>{p.t}</strong> : <span key={k}>{p.t}</span>)}</li>)}</ul>
                  ) : (
                    <p className="my-1.5" key={i}>{b.linhas.map((l, j) => <span key={j}>{j ? <br /> : null}{partesDe(l).map((p, k) => p.negrito ? <strong key={k}>{p.t}</strong> : <span key={k}>{p.t}</span>)}</span>)}</p>
                  ))}
                  {m.propostas.map((p, i) => (
                    <div className="mt-2 rounded-xl border border-border bg-background p-3" key={i}>
                      <p className="text-xs font-medium text-muted-foreground">{t("Mensagem para {nome}", { nome: p.nome || t("Cliente") })}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{p.texto}</p>
                      <div className="mt-2 flex items-center gap-2">
                        {p.estado === "enviada" ? <span className="text-xs font-medium text-primary">{t("Enviada ✓")}</span> : (
                          <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60" disabled={p.estado === "enviando"} onClick={() => void a.confirmar(m.id, i)} type="button">{p.estado === "enviando" ? t("Enviando…") : t("Enviar")}</button>
                        )}
                        {p.estado === "erro" ? <span className="text-xs text-danger">{t("O envio falhou.")}</span> : null}
                        <Link className="text-xs text-muted-foreground underline" href={`${cliente ? "/admin" : "/app"}/conversas?conversa=${encodeURIComponent(p.conversa)}${cliente ? `&cliente=${encodeURIComponent(cliente)}` : ""}`}>{t("Ver conversa")}</Link>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {a.aPensar ? <p className="self-start animate-pulse text-xs text-muted-foreground">{a.aPensar === "…" ? t("Pensando…") : `${a.aPensar}…`}</p> : null}
              <div ref={fim} />
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            aria-label={t("Pergunte à Lexia")}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            disabled={a.ligado === false}
            onChange={(e) => { setTexto(e.target.value); e.currentTarget.style.height = ""; e.currentTarget.style.height = `${Math.min(128, e.currentTarget.scrollHeight)}px`; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); } }}
            placeholder={t("Pergunte à Lexia")}
            ref={campo}
            rows={1}
            value={texto}
          />
          <button aria-label={t("Enviar")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50" disabled={!texto.trim() || Boolean(a.aPensar)} onClick={() => enviar()} type="button">
            <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12l-11.5 1.9z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
