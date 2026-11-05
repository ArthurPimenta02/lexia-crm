"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useIdioma } from "@/app/components/idioma";
import { createClient } from "@/lib/supabase/client";

/**
 * Responder ao cliente pelo painel do computador: texto, foto, vídeo,
 * documento e áudio gravado, pelo canal real do negócio (WhatsApp,
 * Instagram, Messenger). Usa o mesmo caminho do app do iPhone
 * (`/api/m/upload` → bucket privado → `/api/m/enviar` → VPS). Enviar daqui
 * pausa o agente nesta conversa, como responder pelo telemóvel.
 *
 * `cliente` só conta para a Lexia (admin): diz de que empresa é a página.
 * Para o dono, o servidor ignora-o e usa sempre a empresa dele.
 */
const BUCKET = "lexia-midia";
const MAXIMO = 25 * 1024 * 1024;

type Estado = { tipo: "livre" } | { tipo: "enviando"; rotulo: string } | { tipo: "erro"; mensagem: string; repetir: () => void };

export function CaixaDeEnvio({ cliente, conversa }: { cliente?: string; conversa: string }) {
  const { t } = useIdioma();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "livre" });
  const [gravando, setGravando] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const ficheiro = useRef<HTMLInputElement>(null);
  const gravador = useRef<{ rec: MediaRecorder; partes: Blob[]; stream: MediaStream; cancelado: boolean } | null>(null);

  useEffect(() => {
    if (gravando === null) return;
    const id = window.setInterval(() => setSegundos(Math.floor((Date.now() - gravando) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [gravando]);

  const pedir = async (caminho: string, corpo: Record<string, unknown>) => {
    const r = await fetch(caminho, { body: JSON.stringify({ cliente, conversa, ...corpo }), headers: { "content-type": "application/json" }, method: "POST" });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(typeof d.erro === "string" && d.erro ? d.erro : t("O envio falhou."));
    return d;
  };

  const correr = async (rotulo: string, accao: () => Promise<void>) => {
    const tentar = async () => {
      setEstado({ tipo: "enviando", rotulo });
      try {
        await accao();
        setEstado({ tipo: "livre" });
        router.refresh();
      } catch (e) {
        setEstado({ mensagem: e instanceof Error ? e.message : t("O envio falhou."), repetir: () => void tentar(), tipo: "erro" });
      }
    };
    await tentar();
  };

  const enviarTexto = () => {
    const valor = texto.trim();
    if (!valor || estado.tipo === "enviando") return;
    setTexto("");
    void correr(t("Enviando…"), async () => {
      await pedir("/api/m/enviar", { texto: valor });
    });
    campo.current?.focus();
  };

  const enviarFicheiro = (f: Blob, mime: string, legenda = "") => {
    let caminho: string | null = null;
    void correr(t("Enviando o arquivo…"), async () => {
      if (!caminho) {
        const d = await pedir("/api/m/upload", { mime, tamanho: f.size });
        const { error } = await createClient().storage.from(BUCKET).uploadToSignedUrl(String(d.caminho), String(d.token), f, { contentType: mime });
        if (error) throw new Error(t("O envio falhou."));
        caminho = String(d.caminho);
      }
      await pedir("/api/m/enviar", { midia: { caminho, mime }, texto: legenda });
    });
  };

  const escolheu = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAXIMO) {
      setEstado({ mensagem: t("O arquivo passa de 25 MB."), repetir: () => setEstado({ tipo: "livre" }), tipo: "erro" });
      return;
    }
    const legenda = texto.trim();
    setTexto("");
    enviarFicheiro(f, f.type || "application/octet-stream", legenda);
  };

  const comecarGravacao = async () => {
    if (gravador.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const g = { cancelado: false, partes: [] as Blob[], rec, stream };
      rec.ondataavailable = (ev) => { if (ev.data.size) g.partes.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        const tipo = (rec.mimeType || mime || "audio/mp4").split(";")[0];
        const blob = new Blob(g.partes, { type: tipo });
        if (!g.cancelado && blob.size > 1500) enviarFicheiro(blob, tipo);
      };
      rec.start(250);
      gravador.current = g;
      setSegundos(0);
      setGravando(Date.now());
    } catch {
      setEstado({ mensagem: t("Não foi possível usar o microfone."), repetir: () => setEstado({ tipo: "livre" }), tipo: "erro" });
    }
  };

  const pararGravacao = (cancelar: boolean) => {
    const g = gravador.current;
    if (!g) return;
    g.cancelado = cancelar;
    gravador.current = null;
    setGravando(null);
    try { g.rec.stop(); } catch { g.stream.getTracks().forEach((x) => x.stop()); }
  };

  const ocupado = estado.tipo === "enviando";
  const botao = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50";

  return (
    <div className="shrink-0 border-t border-border bg-surface px-2.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
      {estado.tipo === "erro" ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-danger-soft px-3 py-1.5 text-xs text-danger" role="alert">
          <span className="min-w-0 truncate">{estado.mensagem}</span>
          <button className="shrink-0 font-semibold underline" onClick={estado.repetir} type="button">{t("Tentar de novo")}</button>
        </div>
      ) : estado.tipo === "enviando" ? (
        <p className="mb-2 px-1 text-xs text-muted-foreground" role="status">{estado.rotulo}</p>
      ) : null}

      {gravando !== null ? (
        <div className="flex items-center gap-2">
          <button aria-label={t("Cancelar")} className={`${botao} text-muted-foreground hover:bg-muted`} onClick={() => pararGravacao(true)} type="button">
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-muted px-4 text-sm">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            <span className="font-medium tabular-nums">{Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}</span>
            <span className="text-muted-foreground">{t("Gravando áudio…")}</span>
          </div>
          <button aria-label={t("Enviar áudio")} className={`${botao} bg-primary text-primary-foreground hover:opacity-90`} onClick={() => pararGravacao(false)} type="button">
            <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12l-11.5 1.9z" /></svg>
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <button aria-label={t("Anexar foto, vídeo ou documento")} className={`${botao} text-muted-foreground hover:bg-muted`} disabled={ocupado} onClick={() => ficheiro.current?.click()} title={t("Anexar foto, vídeo ou documento")} type="button">
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" /></svg>
          </button>
          <input accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={escolheu} ref={ficheiro} type="file" />
          <textarea
            aria-label={t("Escreva uma mensagem")}
            className="max-h-36 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm leading-5 outline-none focus:border-primary"
            onChange={(e) => { setTexto(e.target.value); e.currentTarget.style.height = ""; e.currentTarget.style.height = `${Math.min(144, e.currentTarget.scrollHeight)}px`; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviarTexto(); } }}
            placeholder={t("Escreva uma mensagem")}
            ref={campo}
            rows={1}
            value={texto}
          />
          {texto.trim() ? (
            <button aria-label={t("Enviar")} className={`${botao} bg-primary text-primary-foreground hover:opacity-90`} disabled={ocupado} onClick={enviarTexto} type="button">
              <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12l-11.5 1.9z" /></svg>
            </button>
          ) : (
            <button aria-label={t("Gravar áudio")} className={`${botao} bg-primary text-primary-foreground hover:opacity-90`} disabled={ocupado} onClick={() => void comecarGravacao()} title={t("Gravar áudio")} type="button">
              <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" viewBox="0 0 24 24"><rect height="12" rx="3" width="6" x="9" y="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
          )}
        </div>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{t("Ao enviar daqui, o agente pausa nesta conversa. Enter envia; Shift+Enter muda de linha.")}</p>
    </div>
  );
}
