"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Clock, FileText, Loader2, Mic, Paperclip, RotateCcw, Send, Square, X } from "lucide-react";

import { useIdioma } from "@/app/components/idioma";
import { Mascote } from "@/app/components/mascote";
import type { CampoDoCartao, Cartao, MensagemDaConversa, Progresso, RespostaDesfeita } from "@/lib/onboarding/conversa";
import { ESQUEMA_ONBOARDING, type CampoOnboarding } from "@/lib/onboarding/esquema";
import { cartaoEditado, concluirEnvio, chaveDoCartao, chaveDoPendente, enviarTurno, estadoComDesfeita, estadoInicial, guardarCartao, guardarPendente, k, lerCartao, lerPendente, type Armazem, type EnvioGuardado, type EstadoDoCartao } from "@/lib/onboarding/tela";
import { createClient } from "@/lib/supabase/client";

/**
 * A conversa com a entrevistadora (Etapa 2).
 *
 * Regras desta tela:
 *  - nada do que a cliente escreveu ou gravou se perde (19/11/2026, ver `lib/onboarding/tela.ts`):
 *    o texto livre e o cartão em edição ficam gravados no aparelho a cada edição; a resposta só sai
 *    do cartão depois de o servidor confirmar que gravou; um envio que falha fica na tela com
 *    "Tentar de novo" (o mesmo envio, com o mesmo identificador, para o servidor não o duplicar),
 *    e com a sessão expirada fica guardado e é reenviado sozinho depois de ela entrar de novo;
 *  - "Corrigir a resposta anterior" não apaga nada e reabre o cartão com o que ela respondeu;
 *  - só o último cartão é respondível; os anteriores ficam como histórico;
 *  - nos cartões de escolha nada é enviado sem ela ver o que está marcado.
 */

type Envio = {
  id: string;
  texto: string;
  /** `blob` falta quando o envio foi retomado do aparelho (aí o arquivo já tinha subido e tem `id`). */
  arquivo?: { blob?: Blob; nome: string; mime: string; audio: boolean; id?: string };
  valores?: { campo: string; itemId: string | null; valor: unknown }[];
  lista?: { manter: string[]; novos: string[] };
  pular?: boolean;
  nenhum?: boolean;
  /** A fala da Lia a que responde. */
  falaId?: string;
};
type Pendente = Envio & { erro?: string; sessao?: boolean; guardada?: boolean };

/** Sessão expirada no meio de um envio (o servidor respondeu 401). */
class SessaoExpirada extends Error {}

/** O armazenamento do aparelho, ou null (navegação privada, bloqueado). */
function armazem(): Armazem | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
/** O envio como fica guardado no aparelho. Um arquivo que ainda não subiu não cabe lá: fica só na memória da página. */
const paraGuardar = (e: Envio): EnvioGuardado | null =>
  e.arquivo && !e.arquivo.id ? null : { id: e.id, texto: e.texto, ...(e.arquivo?.id ? { arquivo: { id: e.arquivo.id, nome: e.arquivo.nome, mime: e.arquivo.mime, audio: e.arquivo.audio } } : {}), valores: e.valores, lista: e.lista, pular: e.pular, nenhum: e.nenhum, falaId: e.falaId };
/** Renova a sessão antes de mandar (um painel aberto há dias tem o token vencido). */
const renovarSessao = () => createClient().auth.getSession();

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const GRUPO: Record<string, string> = { servicos: "Serviços", profissionais: "Profissionais", faqs: "Perguntas frequentes", objecoes: "Objeções", promocoes: "Promoções" };
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
const tempo = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function lerRascunho(chave: string) {
  try {
    return localStorage.getItem(chave) ?? "";
  } catch {
    return "";
  }
}
function guardarRascunho(chave: string, texto: string) {
  try {
    if (texto) localStorage.setItem(chave, texto);
    else localStorage.removeItem(chave);
  } catch {
    // sem armazenamento local: a tela funciona na mesma
  }
}

// ------------------------------------------------------------------ o microfone de cada campo

/** Sobe o áudio e devolve a transcrição. `null` = esta tela não transcreve (prévia, só leitura). */
const Transcritor = createContext<((blob: Blob, mime: string) => Promise<string>) | null>(null);

/**
 * Gravar a resposta de UM campo: ela fala, o áudio é transcrito e o texto aparece no campo, onde ela lê e corrige
 * antes de continuar (Arthur, 17/11/2026: é por áudio que a dona vai responder, e em cada pergunta).
 */
function MicDoCampo({ aoTexto }: { aoTexto: (texto: string) => void }) {
  const { t } = useIdioma();
  const transcrever = useContext(Transcritor);
  const [segundos, setSegundos] = useState<number | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const entregar = useRef(aoTexto);
  useEffect(() => {
    entregar.current = aoTexto;
  });
  useEffect(() => () => {
    if (relogio.current) clearInterval(relogio.current);
    if (gravador.current?.state === "recording") gravador.current.stop();
  }, []);
  // 10 minutos por áudio: é o que o transcritor ouve de uma vez.
  useEffect(() => {
    if (segundos !== null && segundos >= 600) gravador.current?.stop();
  }, [segundos]);
  if (!transcrever) return null;

  async function alternar() {
    if (segundos !== null) return gravador.current?.stop();
    setFalha(null);
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
      const g = new MediaRecorder(fluxo, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
      const pedacos: Blob[] = [];
      g.ondataavailable = (e) => {
        if (e.data.size) pedacos.push(e.data);
      };
      g.onstop = async () => {
        fluxo.getTracks().forEach((f) => f.stop());
        if (relogio.current) clearInterval(relogio.current);
        setSegundos(null);
        const tipo = (g.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(pedacos, { type: tipo });
        if (blob.size <= 1000) return;
        setOuvindo(true);
        try {
          const texto = (await transcrever!(blob, tipo)).trim();
          if (texto) entregar.current(texto);
          else setFalha(t("Não ouvi nada nesse áudio. Tente gravar de novo."));
        } catch (e) {
          setFalha(e instanceof Error ? e.message : t("Não consegui ouvir o áudio. Tente de novo."));
        } finally {
          setOuvindo(false);
        }
      };
      gravador.current = g;
      g.start(1000);
      setSegundos(0);
      relogio.current = setInterval(() => setSegundos((x) => (x === null ? null : x + 1)), 1000);
    } catch {
      setFalha(t("Não consegui usar o microfone. Libere o microfone no navegador ou responda por texto."));
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {ouvindo ? (
        <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground"><Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />{t("Escrevendo o que você falou…")}</span>
      ) : segundos !== null ? (
        <button className="ds-botao ds-botao-primario min-h-9 px-3 text-[0.8125rem]" onClick={() => void alternar()} type="button">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-[var(--ds-perigo)]" />
          <span className="tabular-nums">{tempo(segundos)}</span>
          <Square aria-hidden="true" className="h-3 w-3" />
          {t("Parar e escrever")}
        </button>
      ) : (
        <button className="ds-botao ds-botao-secundario min-h-9 px-3 text-[0.8125rem]" onClick={() => void alternar()} type="button">
          <Mic aria-hidden="true" className="h-3.5 w-3.5" />
          {t("Responder por áudio")}
        </button>
      )}
      {falha ? <span className="text-[0.8125rem] text-[var(--ds-perigo)]" role="alert">{falha}</span> : null}
    </div>
  );
}

/** O que ela falou entra no fim do que já está escrito (nunca apaga o que lá está). */
const juntarFala = (atual: unknown, fala: string) => (String(atual ?? "").trim() ? `${String(atual).trim()}\n${fala}` : fala);

// ------------------------------------------------------------------ o texto que abre ao escolher "Outro"

/** Para cada campo, os campos de texto que dependem de uma opção dele ("Outro", "Texto próprio"). */
const FILHOS = (() => {
  const mapa = new Map<string, { opcao: string; campo: CampoOnboarding }[]>();
  for (const lista of ESQUEMA_ONBOARDING.flatMap((s) => [s.campos, ...s.grupos.map((g) => g.campos)]))
    for (const c of lista)
      for (const q of c.quando ? ("algum" in c.quando ? c.quando.algum : [c.quando]) : [])
        if (q.valor !== undefined && c.tipo !== "number") mapa.set(q.campo, [...(mapa.get(q.campo) ?? []), { opcao: q.valor, campo: c }]);
  return mapa;
})();
/** Os filhos que a resposta atual de um campo abre. */
const filhosDe = (campo: string, valor: unknown) => (FILHOS.get(campo) ?? []).filter((f) => /^(outr[oa]\b|texto próprio)/i.test(f.opcao) && (Array.isArray(valor) ? valor.includes(f.opcao) : valor === f.opcao));
/** O estado do cartão, para os campos que abrem dentro de outro (ficam guardados com a chave `item|campo`). */
const Dependentes = createContext<{ valores: Record<string, unknown>; mudar: (chave: string, v: unknown) => void } | null>(null);

// ------------------------------------------------------------------ campos dos cartões

function Opcoes({ campo, valor, mudar }: { campo: CampoDoCartao; valor: unknown; mudar: (v: unknown) => void }) {
  const { t } = useIdioma();
  const varias = campo.tipo === "multi";
  const marcadas = new Set<string>(varias ? (Array.isArray(valor) ? (valor as string[]) : []) : typeof valor === "string" ? [valor] : []);
  const recomendadas = new Set<string>([campo.recomendado ?? []].flat());
  if (!varias && (campo.opcoes?.length ?? 0) > 10) {
    return (
      <select className="ds-campo" onChange={(e) => mudar(e.target.value || undefined)} value={typeof valor === "string" ? valor : ""}>
        <option value="">{t("Escolher…")}</option>
        {campo.opcoes!.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" role={varias ? "group" : "radiogroup"}>
      {campo.opcoes!.map((o) => {
        const marcada = marcadas.has(o);
        return (
          <button
            aria-checked={marcada}
            className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${marcada ? "border-[var(--ds-acao)] bg-[var(--ds-acao-fundo)] font-medium text-[var(--ds-acao)]" : "border-[var(--ds-linha-forte)] text-foreground hover:bg-muted"}`}
            key={o}
            onClick={() => {
              if (!varias) return mudar(marcada ? undefined : o);
              const novas = new Set(marcadas);
              if (marcada) novas.delete(o);
              else novas.add(o);
              mudar(campo.opcoes!.filter((x) => novas.has(x)));
            }}
            role={varias ? "checkbox" : "radio"}
            type="button"
          >
            {marcada ? <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={3} /> : null}
            <span className="min-w-0">{o}</span>
            {recomendadas.has(o) ? <span className="ds-selo ds-selo-verde shrink-0">{t("Recomendado")}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function Horarios({ valor, mudar }: { valor: unknown; mudar: (v: unknown) => void }) {
  const h = (valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {}) as Record<string, [string, string]>;
  return (
    <div className="flex flex-col gap-1.5">
      {DIAS.map((d) => {
        const aberto = !!h[d];
        return (
          <div className="flex min-h-10 items-center gap-2 text-sm" key={d}>
            <label className="flex w-16 shrink-0 items-center gap-2">
              <input
                checked={aberto}
                onChange={(e) => {
                  const novo = { ...h };
                  if (e.target.checked) novo[d] = ["09:00", "18:00"];
                  else delete novo[d];
                  mudar(novo);
                }}
                type="checkbox"
              />
              {d}
            </label>
            {aberto ? (
              <>
                <input aria-label={`${d} abre`} className="ds-campo h-9 w-28" onChange={(e) => mudar({ ...h, [d]: [e.target.value, h[d][1]] })} type="time" value={h[d][0]} />
                <span className="text-muted-foreground">–</span>
                <input aria-label={`${d} fecha`} className="ds-campo h-9 w-28" onChange={(e) => mudar({ ...h, [d]: [h[d][0], e.target.value] })} type="time" value={h[d][1]} />
              </>
            ) : (
              <span className="text-muted-foreground">fechado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Campo({ campo, valor, mudar, confirmar }: { campo: CampoDoCartao; valor: unknown; mudar: (v: unknown) => void; confirmar: boolean }) {
  const { t } = useIdioma();
  const dependentes = useContext(Dependentes);
  const descartado = valor === null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-foreground">
          {campo.pergunta}
          {confirmar && campo.fonte === "recomendacao" ? <span className="ds-selo ml-2 align-middle">{t("Rascunho da Lexia")}</span> : null}
        </p>
        {confirmar ? (
          <button className="shrink-0 text-[0.8125rem] text-muted-foreground underline-offset-2 hover:underline" onClick={() => mudar(descartado ? campo.valor : null)} type="button">
            {descartado ? t("Desfazer") : t("Não é isso")}
          </button>
        ) : null}
      </div>
      {confirmar && campo.atencao && !descartado ? (
        <p className="flex items-start gap-1.5 text-[0.8125rem] leading-relaxed text-[var(--ds-alerta)]">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("Informação de saúde: confira com atenção antes de continuar.")}
        </p>
      ) : null}
      {confirmar && campo.aConfirmar && !descartado ? (
        <p className="flex items-start gap-1.5 text-[0.8125rem] leading-relaxed text-[var(--ds-alerta)]">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("Não temos certeza desta informação: confira e corrija se for diferente.")}
        </p>
      ) : null}
      {descartado ? (
        <p className="text-[0.8125rem] text-muted-foreground">{t("Sem problema, eu pergunto isso na conversa.")}</p>
      ) : campo.tipo === "horarios" ? (
        <Horarios mudar={mudar} valor={valor} />
      ) : campo.tipo === "duracao" ? (
        <div className="max-w-xs"><Duracao mudar={(v) => mudar(v)} valor={String(valor ?? "")} /></div>
      ) : campo.opcoes?.length ? (
        <>
          <Opcoes campo={campo} mudar={mudar} valor={valor} />
          {dependentes
            ? filhosDe(campo.campo, valor).map((f) => {
                const chave = `${campo.itemId ?? ""}|${f.campo.chave}`;
                return (
                  <div className="flex min-w-0 flex-col gap-1.5" key={chave}>
                    <textarea aria-label={f.campo.pergunta} autoFocus className="ds-campo min-h-20 py-2 leading-relaxed" onChange={(e) => dependentes.mudar(chave, e.target.value)} placeholder={t("Escreva aqui como você quer")} value={String(dependentes.valores[chave] ?? "")} />
                    <MicDoCampo aoTexto={(fala) => dependentes.mudar(chave, juntarFala(dependentes.valores[chave], fala))} />
                  </div>
                );
              })
            : null}
        </>
      ) : campo.opcoesDe ? (
        <p className="text-[0.8125rem] text-muted-foreground">{t("Ainda não há serviços na lista.")}</p>
      ) : campo.tipo === "long" || String(valor ?? "").length > 70 ? (
        <>
          <textarea className="ds-campo min-h-20 py-2 leading-relaxed" onChange={(e) => mudar(e.target.value)} placeholder={t("Fale no microfone ou escreva aqui")} value={String(valor ?? "")} />
          <MicDoCampo aoTexto={(fala) => mudar(juntarFala(valor, fala))} />
        </>
      ) : (
        <>
          <input className="ds-campo" onChange={(e) => mudar(e.target.value)} value={String(valor ?? "")} />
          {campo.tipo === "number" || campo.tipo === "time" ? null : <MicDoCampo aoTexto={(fala) => mudar(juntarFala(valor, fala))} />}
        </>
      )}
    </div>
  );
}

/** Um rascunho já preenchido, fechado: mostra o começo do texto e abre para editar. */
function Resumo({ campo, valor, abrir, editado }: { campo: CampoDoCartao; valor: unknown; abrir: () => void; editado?: boolean }) {
  const { t } = useIdioma();
  const texto = valor === null ? t("Sem problema, eu pergunto isso na conversa.") : Array.isArray(valor) ? valor.join(", ") : String(valor ?? "");
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-semibold text-foreground">
          {campo.pergunta}
          {editado ? <span className="flex items-center gap-1 text-[0.75rem] font-normal text-[var(--ds-acao)]"><Check aria-hidden="true" className="h-3 w-3" />{t("editado por você")}</span> : null}
          {campo.atencao ? <span className="flex items-center gap-1 text-[0.75rem] font-normal text-[var(--ds-alerta)]"><AlertCircle aria-hidden="true" className="h-3 w-3" />{t("saúde: confira")}</span> : null}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted-foreground">{texto}</p>
      </div>
      <button className="shrink-0 text-[0.8125rem] font-medium text-[var(--ds-acao)] underline-offset-2 hover:underline" onClick={abrir} type="button">
        {t("Ver e editar")}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ o cartão ativo

const vazio = (v: unknown) => v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

// ------------------------------------------------------------------ a tabela dos serviços (preço e duração)

type LinhaDaTabela = Extract<Cartao, { tipo: "tabela" }>["linhas"][number];
const semValor = (opcao: unknown) => /orçamento|avalia/i.test(String(opcao ?? ""));

/** O tipo de preço de uma linha: o que ela escolheu ou, se só escreveu o valor, "preço fixo" (a primeira opção). */
function tipoDaLinha(l: LinhaDaTabela, valores: Record<string, unknown>): string | undefined {
  const tipo = l.campos.find((f) => f.campo === "tipo_de_preco");
  if (!tipo) return undefined;
  const escolhido = valores[k(tipo)];
  if (typeof escolhido === "string" && escolhido) return escolhido;
  const valor = l.campos.find((f) => f.campo === "valor");
  return valor && !vazio(valores[k(valor)]) ? tipo.opcoes?.[0] : undefined;
}

/** O que segue da tabela para o servidor: só as células preenchidas (o que ficar em branco é perguntado depois). */
function valoresDaTabela(linhas: LinhaDaTabela[], valores: Record<string, unknown>) {
  const out: { campo: string; itemId: string | null; valor: unknown }[] = [];
  for (const l of linhas) {
    const tipo = tipoDaLinha(l, valores);
    for (const f of l.campos) {
      if (f.campo === "tipo_de_preco") {
        if (tipo) out.push({ campo: f.campo, itemId: f.itemId, valor: tipo });
      } else if (f.campo === "valor") {
        if (!semValor(tipo) && !vazio(valores[k(f)])) out.push({ campo: f.campo, itemId: f.itemId, valor: String(valores[k(f)]).trim() });
      } else if (f.campo === "faixa_de_preco") {
        if (semValor(tipo) && !vazio(valores[k(f)])) out.push({ campo: f.campo, itemId: f.itemId, valor: String(valores[k(f)]).trim() });
      } else if (!vazio(valores[k(f)])) out.push({ campo: f.campo, itemId: f.itemId, valor: String(valores[k(f)]).trim() });
    }
  }
  return out.filter((v) => v.valor !== "");
}
const linhaCompleta = (l: LinhaDaTabela, valores: Record<string, unknown>) => l.campos.every((f) => (f.campo === "faixa_de_preco" ? true : f.campo === "tipo_de_preco" ? !!tipoDaLinha(l, valores) : f.campo === "valor" ? semValor(tipoDaLinha(l, valores)) || !vazio(valores[k(f)]) : !vazio(valores[k(f)])));

/** "1h45" a partir de horas e minutos (e de volta, para abrir o seletor já no valor que lá está). */
const formatarDuracao = (h: number, m: number) => (h && m ? `${h}h${String(m).padStart(2, "0")}` : h ? `${h}h` : m ? `${m} min` : "");
function lerDuracao(v: string): { h: number; m: number } | null {
  const x = v.trim().toLowerCase();
  const hm = /^(\d{1,2})\s*h(?:oras?)?\s*(?:e\s*)?(\d{1,2})?\s*(?:min(?:utos)?)?$/.exec(x);
  if (hm) return { h: Number(hm[1]), m: Number(hm[2] ?? 0) };
  const m = /^(\d{1,3})\s*min(?:utos)?$/.exec(x);
  return m ? { h: Math.floor(Number(m[1]) / 60), m: Number(m[1]) % 60 } : null;
}

/**
 * Escolher a duração com dois toques (horas e minutos), em vez de escrever "1h45min".
 * Uma duração que as fontes trouxeram em texto ("2 a 3 horas") aparece como está e continua valendo até ela escolher outra.
 */
function Duracao({ valor, mudar }: { valor: string; mudar: (v: string) => void }) {
  const { t } = useIdioma();
  const [aberto, setAberto] = useState(false);
  const atual = lerDuracao(valor) ?? { h: -1, m: -1 };
  const escolher = (h: number, m: number) => mudar(formatarDuracao(Math.max(h, 0), Math.max(m, 0)));
  const pastilha = (marcada: boolean) => `flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm tabular-nums transition ${marcada ? "bg-[var(--ds-acao)] font-medium text-[var(--ds-acao-texto)]" : "text-foreground hover:bg-muted"}`;
  return (
    <div className="relative min-w-0">
      <button aria-expanded={aberto} aria-label={t("Duração")} className={`ds-campo flex w-full items-center justify-between gap-2 text-left ${valor ? "" : "text-muted-foreground"}`} onClick={() => setAberto(!aberto)} type="button">
        <span className="min-w-0 truncate">{valor || t("Quanto tempo leva?")}</span>
        <Clock aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
      </button>
      {aberto ? (
        <>
          <button aria-label={t("Fechar")} className="fixed inset-0 z-30 cursor-default" onClick={() => setAberto(false)} type="button" />
          <div className="ds-cartao absolute right-0 top-full z-40 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3" role="dialog">
            <div>
              <p className="ds-sobretitulo mb-1.5">{t("Horas")}</p>
              <div className="flex flex-wrap gap-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                  <button className={pastilha(atual.h === h)} key={h} onClick={() => escolher(h, atual.m)} type="button">{h}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="ds-sobretitulo mb-1.5">{t("Minutos")}</p>
              <div className="flex flex-wrap gap-1">
                {[0, 15, 30, 45].map((m) => (
                  <button className={pastilha(atual.m === m)} key={m} onClick={() => escolher(atual.h, m)} type="button">{String(m).padStart(2, "0")}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-[var(--ds-linha)] pt-2">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{valor || "—"}</span>
              <button className="ds-botao ds-botao-primario min-h-9 px-3 text-[0.8125rem]" onClick={() => setAberto(false)} type="button">{t("Pronto")}</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** "300 a 600" a partir do mínimo e do máximo (só um deles também vale). */
const faixaDe = (min: string, max: string) => (min && max ? `${min} a ${max}` : min ? `a partir de ${min}` : max ? `até ${max}` : "");

const ROTULO_DO_TIPO = (opcao: string) => (/orçamento|avalia/i.test(opcao) ? "Só após avaliação" : /partir/i.test(opcao) ? "A partir de" : "Preço fixo");
const soNumero = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 12);

function CartaoAtivo({ cartao, estado, mudar, ocupado, enviar }: { cartao: Cartao; estado: EstadoDoCartao; mudar: (e: EstadoDoCartao) => void; ocupado: boolean; enviar: (e: Partial<Envio>) => void }) {
  const { t } = useIdioma();
  // O texto livre do próprio cartão fica no estado do cartão: é gravado no aparelho como o resto.
  const novo = estado.rascunho ?? "";
  const setNovo = (v: string) => mudar({ ...estado, rascunho: v });
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const set = (f: CampoDoCartao, v: unknown) => mudar({ ...estado, valores: { ...estado.valores, [k(f)]: v } });
  // Os dias de funcionamento saem do horário de cada dia: não se escolhem duas vezes.
  const semDias = (campos: CampoDoCartao[]) => (campos.some((f) => f.campo === "horario_por_dia") ? campos.filter((f) => f.campo !== "dias_de_funcionamento") : campos);
  const valoresDe = (campos: CampoDoCartao[]) => campos.filter((f) => !vazio(estado.valores[k(f)]) || estado.valores[k(f)] === null).map((f) => ({ campo: f.campo, itemId: f.itemId, valor: estado.valores[k(f)] }));

  if (cartao.tipo === "confirmar") {
    return (
      <div className="ds-cartao flex flex-col gap-4 p-4">
        {semDias(cartao.campos).map((f) => (
          <Campo campo={f} confirmar key={k(f)} mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} />
        ))}
        <button className="ds-botao ds-botao-primario self-start" disabled={ocupado} onClick={() => enviar({ valores: valoresDe(cartao.campos) })} type="button">
          {t("Está certo, continuar")}
        </button>
      </div>
    );
  }

  if (cartao.tipo === "cartoes" && cartao.secao === "recomendadas") {
    const faltam = cartao.campos.filter((f) => vazio(estado.valores[k(f)])).length;
    const mudadas = cartao.campos.filter((f) => JSON.stringify(estado.valores[k(f)]) !== JSON.stringify(f.recomendado)).length;
    return (
      <div className="ds-cartao flex flex-col gap-4 p-4">
        <p className="ds-sobretitulo">{t("Recomendações da Lexia")}</p>
        <ul className="flex flex-col divide-y divide-[var(--ds-linha)]">
          {cartao.campos.map((f) => {
            const v = estado.valores[k(f)];
            const aberto = abertos.has(k(f));
            return (
              <li className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0" key={k(f)}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] text-muted-foreground">{f.pergunta}</p>
                    {aberto ? null : <p className="mt-0.5 text-sm font-medium text-foreground">{vazio(v) ? t("Falta escolher") : Array.isArray(v) ? v.join(" · ") : String(v)}</p>}
                  </div>
                  <button
                    className="shrink-0 text-[0.8125rem] text-[var(--ds-acao)] underline-offset-2 hover:underline"
                    onClick={() => {
                      const n = new Set(abertos);
                      if (aberto) n.delete(k(f));
                      else n.add(k(f));
                      setAbertos(n);
                    }}
                    type="button"
                  >
                    {aberto ? t("Fechar") : t("Mudar")}
                  </button>
                </div>
                {aberto ? <Opcoes campo={f} mudar={(nv) => set(f, nv)} valor={v} /> : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button className="ds-botao ds-botao-primario" disabled={ocupado || faltam > 0} onClick={() => enviar({ valores: valoresDe(cartao.campos) })} type="button">
            {mudadas ? t("Confirmar escolhas") : t("Aceitar as recomendadas")}
          </button>
          {faltam > 0 ? <span className="text-[0.8125rem] text-muted-foreground">{t("Falta escolher {n}", { n: faltam })}</span> : mudadas ? <span className="text-[0.8125rem] text-muted-foreground">{t("Você mudou {n}", { n: mudadas })}</span> : null}
        </div>
      </div>
    );
  }

  if (cartao.tipo === "cartoes") {
    const faltam = cartao.campos.filter((f) => vazio(estado.valores[k(f)])).length;
    const comRecomendacao = cartao.campos.filter((f) => f.recomendado !== undefined);
    return (
      <div className="ds-cartao flex flex-col gap-5 p-4">
        {comRecomendacao.length ? (
          <button
            className="ds-botao ds-botao-secundario self-start"
            onClick={() => mudar({ ...estado, valores: { ...estado.valores, ...Object.fromEntries(comRecomendacao.map((f) => [k(f), f.recomendado])) } })}
            type="button"
          >
            {t("Marcar as recomendadas")}
          </button>
        ) : null}
        {semDias(cartao.campos).map((f) => (
          <Campo campo={f} confirmar={false} key={k(f)} mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} />
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button className="ds-botao ds-botao-primario" disabled={ocupado || faltam > 0} onClick={() => enviar({ valores: valoresDe(cartao.campos) })} type="button">
            {t("Confirmar escolhas")}
          </button>
          {faltam > 0 ? <span className="text-[0.8125rem] text-muted-foreground">{t("Falta escolher {n}", { n: faltam })}</span> : null}
        </div>
      </div>
    );
  }

  if (cartao.tipo === "lista") {
    const acrescentar = () => {
      const nome = novo.trim();
      mudar({ ...estado, novos: nome && !estado.novos.includes(nome) ? [...estado.novos, nome] : estado.novos, rascunho: "" });
    };
    return (
      <div className="ds-cartao flex flex-col gap-3 p-4">
        <p className="ds-sobretitulo">{GRUPO[cartao.grupo] ? t(GRUPO[cartao.grupo]) : cartao.grupo}</p>
        <ul className="flex flex-col">
          {cartao.itens.map((i) => (
            <li key={i.id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-foreground">
                <input
                  checked={estado.manter.has(i.id)}
                  onChange={(e) => {
                    const m = new Set(estado.manter);
                    if (e.target.checked) m.add(i.id);
                    else m.delete(i.id);
                    mudar({ ...estado, manter: m });
                  }}
                  type="checkbox"
                />
                <span className={`min-w-0 ${estado.manter.has(i.id) ? (i.campos?.length ? "font-medium" : "") : "text-muted-foreground line-through"}`}>{i.nome || t("(sem nome)")}</span>
              </label>
              {i.campos?.length && estado.manter.has(i.id) ? (
                <div className="mb-3 ml-7 flex flex-col gap-3">
                  {i.campos.map((f) => (
                    <label className="flex min-w-0 flex-col gap-1.5" key={k(f)}>
                      <span className="text-[0.8125rem] text-muted-foreground">
                        {f.pergunta}
                        {f.fonte === "recomendacao" ? <span className="ds-selo ml-2 align-middle">{t("Rascunho da Lexia")}</span> : null}
                      </span>
                      <textarea className="ds-campo min-h-20 py-2 leading-relaxed" onChange={(e) => set(f, e.target.value)} value={String(estado.valores[k(f)] ?? "")} />
                    </label>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
          {estado.novos.map((n) => (
            <li className="flex min-h-10 items-center gap-3 text-sm text-foreground" key={n}>
              <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ds-acao)]" />
              <span className="min-w-0 flex-1">{n}</span>
              <button aria-label={t("Tirar")} className="text-muted-foreground" onClick={() => mudar({ ...estado, novos: estado.novos.filter((x) => x !== n) })} type="button">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="ds-campo min-w-0 flex-1"
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                acrescentar();
              }
            }}
            placeholder={cartao.grupo === "profissionais" ? t("Nome de outra pessoa que atende") : t("Acrescentar um que faltou")}
            value={novo}
          />
          <button className="ds-botao ds-botao-secundario shrink-0" disabled={!novo.trim()} onClick={acrescentar} type="button">
            {t("Acrescentar")}
          </button>
        </div>
        <button className="ds-botao ds-botao-primario self-start" disabled={ocupado} onClick={() => enviar({ lista: { manter: [...estado.manter], novos: novo.trim() ? [...estado.novos, novo.trim()] : estado.novos }, valores: valoresDe(cartao.itens.filter((i) => estado.manter.has(i.id)).flatMap((i) => i.campos ?? [])) })} type="button">
          {t("Esta é a lista, continuar")}
        </button>
      </div>
    );
  }

  if (cartao.tipo === "tabela") {
    const emBranco = cartao.linhas.filter((l) => !linhaCompleta(l, estado.valores)).length;
    return (
      <div className="ds-cartao flex flex-col gap-4 p-4">
        {cartao.linhas.some((l) => semValor(tipoDaLinha(l, estado.valores))) ? (
          <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--ds-alerta)] bg-[color-mix(in_oklab,var(--ds-alerta)_10%,var(--ds-superficie))] px-4 py-3.5">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ds-alerta)]" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">{t("Coloque uma faixa de preço: isso traz mais agendamentos")}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{t("Quem pergunta o preço costuma precisar de pelo menos uma noção para marcar a avaliação. Se você tiver um mínimo e um máximo, coloque na linha do serviço: isso ajuda a fechar mais agendamentos.")}</p>
            </div>
          </div>
        ) : null}
        <ul className="flex flex-col divide-y divide-[var(--ds-linha)]">
          {cartao.linhas.map((l) => {
            const tipo = l.campos.find((f) => f.campo === "tipo_de_preco");
            const valor = l.campos.find((f) => f.campo === "valor");
            const duracao = l.campos.find((f) => f.campo === "duracao_media");
            const faixa = l.campos.find((f) => f.campo === "faixa_de_preco");
            const tipoAtual = tipoDaLinha(l, estado.valores);
            const min = faixa ? String(estado.valores[`${k(faixa)}#min`] ?? "") : "";
            const max = faixa ? String(estado.valores[`${k(faixa)}#max`] ?? "") : "";
            const mudarFaixa = (qual: "min" | "max", v: string) => {
              if (!faixa) return;
              const novoMin = qual === "min" ? soNumero(v) : min;
              const novoMax = qual === "max" ? soNumero(v) : max;
              mudar({ ...estado, valores: { ...estado.valores, [`${k(faixa)}#min`]: novoMin, [`${k(faixa)}#max`]: novoMax, [k(faixa)]: faixaDe(novoMin, novoMax) } });
            };
            return (
              <li className="flex min-w-0 flex-col gap-2.5 py-4 first:pt-0 last:pb-0" key={l.itemId}>
                <p className="min-w-0 text-sm font-semibold text-foreground">{l.nome || t("(sem nome)")}</p>
                {tipo ? (
                  <div aria-label={t("Tipo de preço")} className="flex min-w-0 flex-wrap gap-1 self-start rounded-xl bg-muted p-1" role="radiogroup">
                    {(tipo.opcoes ?? []).filter((o) => !/^outro/i.test(o)).map((o) => (
                      <button aria-checked={tipoAtual === o} className={`min-h-8 rounded-lg px-3 text-[0.8125rem] transition ${tipoAtual === o ? "bg-[var(--ds-superficie)] font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} key={o} onClick={() => set(tipo, o)} role="radio" type="button">
                        {t(ROTULO_DO_TIPO(o))}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:max-w-md">
                  {faixa && semValor(tipoAtual) ? (
                    <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
                      <p className="text-[0.8125rem] text-muted-foreground">{t("Se tiver, coloque um mínimo e um máximo (opcional)")}</p>
                      <div className="grid min-w-0 grid-cols-2 gap-2">
                        <input aria-label={t("Preço mínimo")} className="ds-campo tabular-nums" inputMode="decimal" onChange={(e) => mudarFaixa("min", e.target.value)} placeholder={t("Mínimo")} value={min} />
                        <input aria-label={t("Preço máximo")} className="ds-campo tabular-nums" inputMode="decimal" onChange={(e) => mudarFaixa("max", e.target.value)} placeholder={t("Máximo")} value={max} />
                      </div>
                    </div>
                  ) : null}
                  {valor && !(faixa && semValor(tipoAtual)) ? (
                    <input aria-label={t("Preço")} className="ds-campo tabular-nums disabled:opacity-50" disabled={semValor(tipoAtual)} inputMode="decimal" onChange={(e) => set(valor, soNumero(e.target.value))} placeholder={semValor(tipoAtual) ? t("Depois da avaliação") : t("Preço (só o número)")} value={semValor(tipoAtual) ? "" : String(estado.valores[k(valor)] ?? "")} />
                  ) : null}
                  {duracao ? <Duracao mudar={(v) => set(duracao, v)} valor={String(estado.valores[k(duracao)] ?? "")} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button className="ds-botao ds-botao-primario" disabled={ocupado || !valoresDaTabela(cartao.linhas, estado.valores).length} onClick={() => enviar({})} type="button">
            {t("Enviar a tabela")}
          </button>
          {emBranco > 0 ? <span className="flex items-center gap-1.5 text-[0.8125rem] text-[var(--ds-alerta)]"><AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{t("{n} em branco: o que faltar eu pergunto depois", { n: emBranco })}</span> : null}
        </div>
      </div>
    );
  }

  if (cartao.tipo === "pergunta") {
    return (
      <div className="ds-cartao flex flex-col gap-5 p-4">
        {semDias(cartao.campos).map((f) => (
          <Campo campo={f} confirmar={false} key={k(f)} mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} />
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button className="ds-botao ds-botao-primario" disabled={ocupado || !valoresDe(cartao.campos).length} onClick={() => enviar({ valores: valoresDe(cartao.campos) })} type="button">
            {t("Enviar")}
          </button>
          <button className="ds-botao ds-botao-secundario" disabled={ocupado} onClick={() => enviar({ pular: true })} type="button">
            {t("Não sei agora")}
          </button>
        </div>
      </div>
    );
  }

  if (cartao.tipo === "itens") {
    return (
      <div className="ds-cartao flex flex-col gap-3 p-4">
        <textarea className="ds-campo min-h-28 py-2 leading-relaxed" onChange={(e) => setNovo(e.target.value)} placeholder={t("Fale no microfone ou escreva aqui")} value={novo} />
        <MicDoCampo aoTexto={(fala) => setNovo(juntarFala(novo, fala))} />
        <div className="flex flex-wrap items-center gap-3">
          <button className="ds-botao ds-botao-primario" disabled={ocupado || !novo.trim()} onClick={() => enviar({ texto: novo.trim() })} type="button">
            {t("Enviar")}
          </button>
          <button className="ds-botao ds-botao-secundario" disabled={ocupado} onClick={() => enviar({ pular: true })} type="button">
            {t("Não sei agora")}
          </button>
          {!cartao.obrigatorio ? (
            <button className="ds-botao ds-botao-secundario" disabled={ocupado} onClick={() => enviar({ nenhum: true })} type="button">
              {t("Não tenho")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (cartao.tipo === "item") {
    // Três coisas diferentes: o que se marca com um toque, o que já veio das fontes dela (confere) e o que a
    // Lexia só sugeriu (isso é ela que conta; a sugestão fica fechada e só vale se ela abrir e aceitar).
    const tocar = [...cartao.faltam.filter((f) => f.opcoes?.length || f.campo === "valor"), ...cartao.cartoes];
    const contar = cartao.faltam.filter((f) => !tocar.includes(f));
    const achados = cartao.confirmar.filter((f) => f.fonte !== "recomendacao");
    const sugeridos = cartao.confirmar.filter((f) => f.fonte === "recomendacao");
    const tipo = tocar.find((f) => f.campo === "tipo_de_preco");
    const tipoAtual = tipo ? (estado.valores[k(tipo)] as string | undefined) : undefined;
    const pedeAudio = contar.length > 0;
    // Com o tipo de preço por escolher, o preço (ou a faixa) preenche-se aqui mesmo, sem uma tela só para ele.
    const precoJunto = !!tipo && !tocar.some((f) => f.campo === "valor");
    const kPreco = `${cartao.itemId}|valor`;
    const kFaixa = `${cartao.itemId}|faixa_de_preco`;
    const pontas = { min: String(estado.valores[`${kFaixa}#min`] ?? ""), max: String(estado.valores[`${kFaixa}#max`] ?? "") };
    const mudarFaixa = (qual: "min" | "max", v: string) => {
      const novas = { ...pontas, [qual]: soNumero(v) };
      mudar({ ...estado, valores: { ...estado.valores, [`${kFaixa}#min`]: novas.min, [`${kFaixa}#max`]: novas.max, [kFaixa]: faixaDe(novas.min, novas.max) } });
    };
    if (!tocar.length && !contar.length && !achados.length && !sugeridos.length) return null;
    return (
      <div className="ds-cartao flex flex-col gap-4 p-4">
        {tocar.map((f) =>
          f.campo === "valor" ? (
            semValor(tipoAtual) ? null : (
              <div className="flex min-w-0 flex-col gap-1.5" key={k(f)}>
                <p className="text-sm font-semibold text-foreground">{t("Quanto custa?")}</p>
                <input aria-label={t("Preço")} className="ds-campo max-w-xs" inputMode="decimal" onChange={(e) => set(f, e.target.value)} placeholder={t("Digite o preço (ex.: 650)")} value={String(estado.valores[k(f)] ?? "")} />
              </div>
            )
          ) : (
            <Campo campo={f.campo === "tipo_de_preco" ? { ...f, pergunta: t("Como é o preço deste serviço?"), opcoes: (f.opcoes ?? []).filter((o) => !/^outro/i.test(o)) } : f} confirmar={false} key={k(f)} mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} />
          ),
        )}
        {precoJunto && tipoAtual && !semValor(tipoAtual) ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm font-semibold text-foreground">{/partir/i.test(tipoAtual) ? t("A partir de quanto?") : t("Quanto custa?")}</p>
            <input aria-label={t("Preço")} className="ds-campo max-w-xs tabular-nums" inputMode="decimal" onChange={(e) => mudar({ ...estado, valores: { ...estado.valores, [kPreco]: soNumero(e.target.value) } })} placeholder={t("Preço (só o número)")} value={String(estado.valores[kPreco] ?? "")} />
          </div>
        ) : null}
        {precoJunto && semValor(tipoAtual) ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm font-semibold text-foreground">{t("Tem um mínimo e um máximo? (opcional)")}</p>
            <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("Quem pergunta o preço costuma precisar de pelo menos uma noção para marcar a avaliação. Uma faixa ajuda a fechar mais agendamentos.")}</p>
            <div className="grid max-w-xs min-w-0 grid-cols-2 gap-2">
              <input aria-label={t("Preço mínimo")} className="ds-campo tabular-nums" inputMode="decimal" onChange={(e) => mudarFaixa("min", e.target.value)} placeholder={t("Mínimo")} value={pontas.min} />
              <input aria-label={t("Preço máximo")} className="ds-campo tabular-nums" inputMode="decimal" onChange={(e) => mudarFaixa("max", e.target.value)} placeholder={t("Máximo")} value={pontas.max} />
            </div>
          </div>
        ) : null}
        {contar.map((f) => (
          <Campo campo={f} confirmar={false} key={k(f)} mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} />
        ))}
        {achados.length ? (
          <div className="flex flex-col gap-3">
            <p className="ds-sobretitulo">{t("O que eu já achei")}</p>
            <div className="flex flex-col divide-y divide-[var(--ds-linha)]">
              {achados.map((f) => (
                <div className="py-3 first:pt-0 last:pb-0" key={k(f)}>
                  {abertos.has(k(f)) ? (
                    <div className="flex flex-col gap-2">
                      <Campo campo={f} confirmar mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} />
                      <button className="ds-botao ds-botao-secundario self-start" onClick={() => setAbertos(new Set([...abertos].filter((x) => x !== k(f))))} type="button">
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                        {t("Salvar")}
                      </button>
                    </div>
                  ) : (
                    <Resumo abrir={() => setAbertos(new Set([...abertos, k(f)]))} campo={f} editado={JSON.stringify(estado.valores[k(f)]) !== JSON.stringify(f.valor)} valor={estado.valores[k(f)]} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {sugeridos.length ? (
          <div className="flex flex-col gap-3">
            <p className="ds-sobretitulo">{t("Sugestão da Lexia: confira e corrija")}</p>
            <div className="flex flex-col divide-y divide-[var(--ds-linha)]">
              {sugeridos.map((f) => (
                <div className="py-3 first:pt-0 last:pb-0" key={k(f)}>
                  {abertos.has(k(f)) ? (
                    <div className="flex flex-col gap-2">
                      <Campo campo={f} confirmar mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} />
                      <button className="ds-botao ds-botao-secundario self-start" onClick={() => setAbertos(new Set([...abertos].filter((x) => x !== k(f))))} type="button">
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                        {t("Salvar")}
                      </button>
                    </div>
                  ) : (
                    <Resumo abrir={() => setAbertos(new Set([...abertos, k(f)]))} campo={f} editado={JSON.stringify(estado.valores[k(f)]) !== JSON.stringify(f.valor)} valor={estado.valores[k(f)]} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button className="ds-botao ds-botao-primario" disabled={ocupado} onClick={() => enviar({})} type="button">
            {pedeAudio ? t("Enviar") : t("Está certo, continuar")}
          </button>
          {pedeAudio || tocar.length ? (
            <button className="ds-botao ds-botao-secundario" disabled={ocupado} onClick={() => enviar({ pular: true })} type="button">
              {t("Não sei agora")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  return null;
}

/** O nome curto de um passo já respondido, para o histórico. */
function tituloDoPasso(p: Cartao, t: (s: string, v?: Record<string, string | number>) => string): string {
  const grupos: Record<string, string> = { servicos: t("Serviços"), profissionais: t("Profissionais"), faqs: t("Perguntas frequentes"), objecoes: t("Objeções"), promocoes: t("Promoções") };
  switch (p.tipo) {
    case "confirmar":
      return t("Dados do negócio");
    case "lista":
    case "itens":
      return grupos[p.grupo] ?? t("Lista conferida");
    case "tabela":
      return t("Preço e duração");
    case "item":
      return p.nome || t("Respondido");
    case "cartoes":
      return p.titulo || t("Escolhas");
    default:
      return t("Respondido");
  }
}

// ------------------------------------------------------------------ a tela

export function ConversaOnboarding({
  clienteSlug,
  inicial,
  somenteLeitura = false,
}: {
  clienteSlug?: string;
  /** Conversa já carregada (para desenhar a tela sem ir ao servidor). */
  inicial?: { mensagens: MensagemDaConversa[]; progresso: Progresso };
  somenteLeitura?: boolean;
}) {
  const { t } = useIdioma();
  const chaveDoRascunho = `lexia_onboarding_rascunho_${clienteSlug ?? "eu"}`;
  const [mensagens, setMensagens] = useState<MensagemDaConversa[] | null>(inicial?.mensagens ?? null);
  const [progresso, setProgresso] = useState<Progresso | null>(inicial?.progresso ?? null);
  const [falha, setFalha] = useState<string | null>(null);
  const [texto, setTexto] = useState(() => lerRascunho(chaveDoRascunho));
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState<number | null>(null);
  const [falarComALia, setFalarComALia] = useState(false);
  const [estadoDoCartao, setEstadoDoCartao] = useState<EstadoDoCartao>({ valores: {}, manter: new Set(), novos: [] });
  /** De que fala da Lia é o estado do cartão (para nunca gravar o cartão de uma fala com a chave de outra). */
  const [estadoDe, setEstadoDe] = useState("");
  const [confirmarVoltar, setConfirmarVoltar] = useState(false);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const saindoParaEntrar = useRef(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  const ultimaDaLia = useMemo(() => [...(mensagens ?? [])].reverse().find((m) => m.autor === "entrevistadora") ?? null, [mensagens]);
  const cartao = (ultimaDaLia?.dados?.passo ?? null) as Cartao | null;
  const terminou = progresso?.terminou || cartao?.tipo === "fim";

  // Cartão novo: começa com o que ela já tinha mexido nele neste aparelho (recarregou, fechou, voltou) ou, se não mexeu,
  // com o que o rascunho achou (os de escolha começam vazios: nada é aceito sem ela marcar).
  // (Acerto de estado durante a renderização, como manda o React: o cartão só existe depois de a conversa chegar, já no navegador.)
  if (ultimaDaLia && cartao && estadoDe !== ultimaDaLia.id) {
    const guardado = somenteLeitura ? null : lerCartao(armazem(), chaveDoCartao(clienteSlug, ultimaDaLia.id));
    setEstadoDoCartao(guardado ?? estadoInicial(cartao));
    setEstadoDe(ultimaDaLia.id);
  }

  // Cada edição do cartão fica gravada no aparelho na hora.
  useEffect(() => {
    if (somenteLeitura || !ultimaDaLia || !cartao || estadoDe !== ultimaDaLia.id) return;
    guardarCartao(armazem(), chaveDoCartao(clienteSlug, ultimaDaLia.id), estadoDoCartao, cartao);
  }, [estadoDoCartao, estadoDe, ultimaDaLia, cartao, clienteSlug, somenteLeitura]);

  // Fechar ou recarregar com alguma coisa por enviar: o navegador avisa (o que está no aparelho volta na mesma).
  const porEnviar = !somenteLeitura && (!!pendente || !!texto.trim() || (!!cartao && !!ultimaDaLia && estadoDe === ultimaDaLia.id && cartaoEditado(estadoDoCartao, cartao)));
  useEffect(() => {
    if (!porEnviar) return;
    const avisar = (e: BeforeUnloadEvent) => {
      if (saindoParaEntrar.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [porEnviar]);

  /** Busca a conversa como está. Não mexe na tela: quem chama decide o que fazer com o resultado. */
  const buscar = useCallback(async (): Promise<{ mensagens: MensagemDaConversa[]; progresso: Progresso | null } | { erro: string }> => {
    try {
      const r = await fetch(`/api/onboarding/conversa${clienteSlug ? `?cliente=${encodeURIComponent(clienteSlug)}` : ""}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { mensagens?: MensagemDaConversa[]; progresso?: Progresso; erro?: string };
      if (r.status === 401) {
        setSessaoExpirada(true);
        return { erro: t("Sua sessão expirou. Entre de novo para continuar.") };
      }
      if (!r.ok || !j.mensagens) return { erro: j.erro ?? t("Não foi possível abrir a conversa.") };
      return { mensagens: j.mensagens, progresso: j.progresso ?? null };
    } catch {
      return { erro: t("Não foi possível abrir a conversa.") };
    }
  }, [clienteSlug, t]);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof buscar>>) => {
    if ("erro" in r) return setFalha(r.erro);
    setFalha(null);
    setMensagens(r.mensagens);
    setProgresso(r.progresso);
  }, []);
  const carregar = () => void buscar().then(aplicar);

  useEffect(() => {
    if (inicial) return;
    let vivo = true;
    void buscar().then((r) => {
      if (vivo) aplicar(r);
    });
    return () => {
      vivo = false;
    };
  }, [buscar, aplicar, inicial]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, pendente, enviando]);

  /**
   * Corrigir a resposta anterior: o servidor desfaz o último turno SEM APAGAR NADA e devolve o que ela tinha
   * respondido; o cartão reabre preenchido com isso (e o texto dela volta para a caixa), nunca com a sugestão.
   */
  const voltar = useCallback(async () => {
    setConfirmarVoltar(false);
    setEnviando(true);
    setFalha(null);
    try {
      await renovarSessao().catch(() => null);
      const r = await fetch("/api/onboarding/conversa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cliente: clienteSlug, voltar: true }) });
      const j = (await r.json().catch(() => ({}))) as { mensagens?: MensagemDaConversa[]; progresso?: Progresso; erro?: string; desfeita?: RespostaDesfeita };
      if (r.status === 401) {
        setSessaoExpirada(true);
        throw new Error(t("Sua sessão expirou. Entre de novo para continuar."));
      }
      if (!r.ok || !j.mensagens) throw new Error(j.erro ?? t("Não consegui voltar agora. Tente de novo."));
      const d = j.desfeita;
      const reaberto = d ? ((j.mensagens.find((m) => m.id === d.falaId)?.dados ?? {}) as { passo?: Cartao }).passo : undefined;
      if (d && reaberto) {
        const { estado, texto: escrito } = estadoComDesfeita(reaberto, d);
        // Gravado antes de mostrar: o cartão que reabre lê isto (e continua lá se ela recarregar).
        guardarCartao(armazem(), chaveDoCartao(clienteSlug, d.falaId), estado, reaberto);
        if (escrito) {
          setTexto(escrito);
          guardarRascunho(chaveDoRascunho, escrito);
        }
      }
      setMensagens(j.mensagens);
      setProgresso(j.progresso ?? null);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : t("Não consegui voltar agora. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  }, [clienteSlug, chaveDoRascunho, t]);

  const transcrever = useCallback(
    async (blob: Blob, mime: string) => {
      const base = { cliente: clienteSlug, origem: "conversa", nome: "audio", mime, tamanho: blob.size };
      const pedir = async (corpo: Record<string, unknown>) => {
        const r = await fetch("/api/onboarding/arquivo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
        const j = (await r.json().catch(() => ({}))) as { caminho?: string; token?: string; id?: string; texto?: string; erro?: string };
        if (!r.ok) throw new Error(j.erro ?? t("Não consegui ouvir o áudio. Tente de novo."));
        return j;
      };
      const p = await pedir({ ...base, passo: "preparar" });
      if (!p.caminho || !p.token) throw new Error(t("Não foi possível enviar o arquivo."));
      const { error } = await createClient().storage.from("onboarding").uploadToSignedUrl(p.caminho, p.token, blob, { contentType: mime });
      if (error) throw new Error(t("Não foi possível enviar o arquivo."));
      const reg = await pedir({ ...base, passo: "registar", caminho: p.caminho });
      if (!reg.id) throw new Error(t("Não foi possível enviar o arquivo."));
      return (await pedir({ cliente: clienteSlug, passo: "transcrever", arquivoId: reg.id })).texto ?? "";
    },
    [clienteSlug, t],
  );

  /**
   * Manda a resposta. Ela fica guardada no aparelho até o servidor confirmar que gravou; só então sai do cartão.
   * Com a sessão expirada, fica guardada e volta a ser enviada (o mesmo envio: o servidor não duplica) depois de ela entrar de novo.
   */
  const mandar = useCallback(
    async (envio: Envio) => {
      const chavePendente = chaveDoPendente(clienteSlug);
      setEnviando(true);
      setPendente({ ...envio, erro: undefined, sessao: false });
      const guardado = paraGuardar(envio);
      if (guardado) {
        guardarPendente(armazem(), chavePendente, guardado);
        // O texto livre agora está no envio guardado: a caixa pode ficar vazia sem se perder nada.
        guardarRascunho(chaveDoRascunho, "");
      }
      const pedirArquivo = async (corpo: Record<string, unknown>) => {
        const r = await fetch("/api/onboarding/arquivo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
        const j = (await r.json().catch(() => ({}))) as { caminho?: string; token?: string; id?: string; erro?: string };
        if (r.status === 401) throw new SessaoExpirada();
        if (!r.ok) throw new Error(j.erro ?? t("Não foi possível enviar o arquivo."));
        return j;
      };
      try {
        // 1) o arquivo (áudio, imagem, PDF) sobe primeiro; se já subiu numa tentativa anterior, não sobe de novo
        if (envio.arquivo && !envio.arquivo.id) {
          const a = envio.arquivo;
          if (!a.blob) throw new Error(t("Não foi possível enviar o arquivo."));
          await renovarSessao().catch(() => null);
          const base = { cliente: clienteSlug, origem: "conversa", nome: a.nome, mime: a.mime, tamanho: a.blob.size };
          const pj = await pedirArquivo({ ...base, passo: "preparar" });
          if (!pj.caminho || !pj.token) throw new Error(pj.erro ?? t("Não foi possível enviar o arquivo."));
          const { error } = await createClient().storage.from("onboarding").uploadToSignedUrl(pj.caminho, pj.token, a.blob, { contentType: a.mime.split(";")[0] });
          if (error) throw new Error(t("Não foi possível enviar o arquivo."));
          const rj = await pedirArquivo({ ...base, passo: "registar", caminho: pj.caminho });
          if (!rj.id) throw new Error(rj.erro ?? t("Não foi possível enviar o arquivo."));
          envio = { ...envio, arquivo: { ...a, id: rj.id } };
          setPendente({ ...envio });
          const agora = paraGuardar(envio);
          if (agora) {
            guardarPendente(armazem(), chavePendente, agora);
            guardarRascunho(chaveDoRascunho, "");
          }
        }
        // 2) o turno
        const final = paraGuardar(envio)!;
        const r = await enviarTurno(final, { cliente: clienteSlug, fetch, renovarSessao, textos: { falhou: t("Não foi possível enviar. Sua resposta continua aqui."), sessao: t("Sua sessão expirou. Entre de novo: sua resposta está guardada.") } });
        if (!r.ok) {
          if (r.sessao) setSessaoExpirada(true);
          setPendente({ ...envio, erro: r.erro, sessao: r.sessao, guardada: r.guardada });
          return;
        }
        // O servidor confirmou: só agora a resposta sai do cartão e do aparelho.
        setSessaoExpirada(false);
        concluirEnvio(armazem(), clienteSlug, final, r);
        setMensagens(r.mensagens);
        setProgresso(r.progresso);
        setPendente(null);
      } catch (e) {
        if (e instanceof SessaoExpirada) {
          setSessaoExpirada(true);
          setPendente({ ...envio, erro: t("Sua sessão expirou. Entre de novo: sua resposta está guardada."), sessao: true });
        } else setPendente({ ...envio, erro: e instanceof Error ? e.message : t("Não foi possível enviar. Sua resposta continua aqui.") });
      } finally {
        setEnviando(false);
      }
    },
    [clienteSlug, chaveDoRascunho, t],
  );

  // Ao abrir: uma resposta que ficou por confirmar (recarregou, a sessão tinha expirado) é enviada de novo, sozinha.
  const retomado = useRef(false);
  useEffect(() => {
    if (retomado.current || mensagens === null || somenteLeitura) return;
    retomado.current = true;
    const chave = chaveDoPendente(clienteSlug);
    const p = lerPendente(armazem(), chave);
    if (!p) return;
    const ultima = [...mensagens].reverse().find((m) => m.autor === "entrevistadora");
    // Fora do corpo do efeito (o envio mexe no estado da tela).
    void Promise.resolve().then(() => {
      if (!p.falaId || p.falaId === ultima?.id) return mandar({ ...p, arquivo: p.arquivo ? { ...p.arquivo } : undefined });
      // A conversa já seguiu (a resposta chegou e só a confirmação se perdeu): não se reenvia, mas o texto dela não se perde.
      guardarPendente(armazem(), chave, null);
      if (p.texto.trim() && !lerRascunho(chaveDoRascunho).trim()) {
        setTexto(p.texto);
        guardarRascunho(chaveDoRascunho, p.texto);
      }
    });
  }, [mensagens, somenteLeitura, clienteSlug, chaveDoRascunho, mandar]);

  // Voltou de entrar de novo (noutra aba ou depois de desbloquear o telefone): reenvia sozinha.
  useEffect(() => {
    if (!pendente?.sessao || enviando) return;
    const tentar = () => {
      if (document.visibilityState === "visible") void mandar(pendente);
    };
    window.addEventListener("focus", tentar);
    document.addEventListener("visibilitychange", tentar);
    return () => {
      window.removeEventListener("focus", tentar);
      document.removeEventListener("visibilitychange", tentar);
    };
  }, [pendente, enviando, mandar]);

  /** Junta o que está marcado no cartão do serviço com a resposta em texto, áudio ou arquivo. */
  const enviar = (extra: Partial<Envio>) => {
    if (enviando || pendente?.erro) return;
    const doItem =
      cartao?.tipo === "item" && !extra.pular
        ? [...cartao.confirmar, ...cartao.cartoes, ...cartao.faltam].filter((f) => estadoDoCartao.valores[k(f)] !== undefined && estadoDoCartao.valores[k(f)] !== "").map((f) => ({ campo: f.campo, itemId: f.itemId, valor: estadoDoCartao.valores[k(f)] }))
        : [];
    // Só o preço, sem dizer o tipo: é preço fixo (a primeira opção), como na tabela. Preço que depende de avaliação não leva valor.
    if (cartao?.tipo === "item") {
      const tipo = cartao.faltam.find((f) => f.campo === "tipo_de_preco");
      // O preço e a faixa preenchidos junto com o tipo de preço (não são campos do passo: vão à parte).
      if (tipo) {
        const escolhido = estadoDoCartao.valores[k(tipo)];
        const junto = (campo: string) => String(estadoDoCartao.valores[`${cartao.itemId}|${campo}`] ?? "").trim();
        if (!cartao.faltam.some((f) => f.campo === "valor") && junto("valor") && !semValor(escolhido)) doItem.push({ campo: "valor", itemId: cartao.itemId, valor: junto("valor") });
        if (semValor(escolhido) && junto("faixa_de_preco")) doItem.push({ campo: "faixa_de_preco", itemId: cartao.itemId, valor: junto("faixa_de_preco") });
      }
      const temPreco = doItem.some((v) => v.campo === "valor");
      const temTipo = doItem.find((v) => v.campo === "tipo_de_preco");
      if (tipo && temPreco && !temTipo && tipo.opcoes?.[0]) doItem.push({ campo: tipo.campo, itemId: tipo.itemId, valor: tipo.opcoes[0] });
      if (temTipo && semValor(temTipo.valor)) doItem.splice(0, doItem.length, ...doItem.filter((v) => v.campo !== "valor"));
    }
    // A tabela vai inteira com o que estiver preenchido, mesmo quando ela responde por texto ou áudio.
    const daTabela = cartao?.tipo === "tabela" && !extra.pular ? valoresDaTabela(cartao.linhas, estadoDoCartao.valores) : [];
    const doCartao = [...doItem, ...daTabela];
    let valores = extra.valores ?? (doCartao.length ? doCartao : undefined);
    if (valores && !extra.pular) {
      valores = [...valores];
      // O texto que abriu ao escolher "Outro" / "Texto próprio" vai junto com a escolha.
      for (const v of [...valores]) {
        for (const f of filhosDe(v.campo, v.valor)) {
          const escrito = String(estadoDoCartao.valores[`${v.itemId ?? ""}|${f.campo.chave}`] ?? "").trim();
          if (escrito && !valores.some((x) => x.campo === f.campo.chave && x.itemId === v.itemId)) valores.push({ campo: f.campo.chave, itemId: v.itemId, valor: escrito });
        }
      }
      // Os dias de funcionamento saem do horário de cada dia (não se escolhem duas vezes).
      const horario = valores.find((v) => v.campo === "horario_por_dia" && !v.itemId);
      const pedeDias = cartao && "campos" in cartao && cartao.campos.some((f) => f.campo === "dias_de_funcionamento");
      if (horario && pedeDias && horario.valor && typeof horario.valor === "object") {
        const dias = DIAS.filter((d) => d in (horario.valor as Record<string, unknown>));
        valores = [...valores.filter((v) => v.campo !== "dias_de_funcionamento"), { campo: "dias_de_funcionamento", itemId: null, valor: dias }];
      }
    }
    const envio: Envio = { id: novoId(), texto: texto.trim(), ...extra, valores, falaId: ultimaDaLia?.id };
    if (!envio.texto && !envio.arquivo && !envio.valores?.length && !envio.lista && !envio.pular && !envio.nenhum) return;
    // A caixa esvazia-se à vista; o texto fica guardado no envio (no aparelho) até o servidor confirmar.
    setTexto("");
    void mandar(envio);
  };

  // O áudio termina de gravar depois: quem o envia tem de ver o cartão e o texto de AGORA, não os de quando a gravação começou.
  const enviarAtual = useRef(enviar);
  useEffect(() => {
    enviarAtual.current = enviar;
  });

  async function gravar() {
    if (gravando !== null) {
      gravador.current?.stop();
      return;
    }
    setFalha(null);
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
      const g = new MediaRecorder(fluxo, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
      const pedacos: Blob[] = [];
      g.ondataavailable = (e) => {
        if (e.data.size) pedacos.push(e.data);
      };
      g.onstop = () => {
        fluxo.getTracks().forEach((f) => f.stop());
        if (relogio.current) clearInterval(relogio.current);
        setGravando(null);
        const tipo = (g.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(pedacos, { type: tipo });
        if (blob.size > 1000) enviarAtual.current({ arquivo: { blob, nome: "audio", mime: tipo, audio: true } });
      };
      gravador.current = g;
      g.start(1000);
      setGravando(0);
      relogio.current = setInterval(() => setGravando((s) => (s === null ? null : s + 1)), 1000);
    } catch {
      setFalha(t("Não consegui usar o microfone. Libere o microfone no navegador ou responda por texto."));
    }
  }
  // 10 minutos por áudio: é o que o transcritor ouve de uma vez.
  useEffect(() => {
    if (gravando !== null && gravando >= 600) gravador.current?.stop();
  }, [gravando]);

  /** Entrar de novo. Com um arquivo que ainda não subiu (só existe nesta página), abre noutra aba para a página não se perder. */
  const entrarDeNovo = (novaAba: boolean) => (
    <a className="ds-botao ds-botao-primario" href={`/login?destino=${encodeURIComponent(typeof window === "undefined" ? "/app/onboarding" : window.location.pathname)}`} onClick={() => { saindoParaEntrar.current = !novaAba; }} rel={novaAba ? "noopener" : undefined} target={novaAba ? "_blank" : undefined}>
      {t("Entrar de novo")}
    </a>
  );

  if (mensagens === null) {
    return (
      <div className="ds-cartao flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        {falha ? (
          <>
            <p role="alert">{falha}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {sessaoExpirada ? entrarDeNovo(false) : null}
              <button className="ds-botao ds-botao-secundario" onClick={carregar} type="button">
                {t("Tentar de novo")}
              </button>
            </div>
          </>
        ) : (
          <>
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
            <p>{t("Abrindo a conversa…")}</p>
          </>
        )}
      </div>
    );
  }

  // "Já feito": cada passo respondido aparece uma vez só; os itens de um grupo (serviços) viram uma contagem.
  const feitos: string[] = [];
  {
    const itensFeitos = new Map<string, Set<string>>();
    mensagens.forEach((m, i) => {
      const p = m.autor === "entrevistadora" ? ((m.dados ?? {}) as { passo?: Cartao }).passo : undefined;
      if (!p || mensagens[i + 1]?.autor !== "cliente") return;
      if (p.tipo === "item") {
        const nome = tituloDoPasso({ tipo: "lista", grupo: p.grupo, itens: [] } as Cartao, t);
        itensFeitos.set(nome, (itensFeitos.get(nome) ?? new Set()).add(p.itemId));
        return;
      }
      const titulo = tituloDoPasso(p, t);
      if (!feitos.includes(titulo)) feitos.push(titulo);
    });
    for (const [nome, ids] of itensFeitos) {
      const linha = t("{nome}: {n} com detalhes", { nome, n: ids.size });
      const i = feitos.indexOf(nome);
      if (i >= 0) feitos[i] = linha;
      else feitos.push(linha);
    }
  }

  const podeResponder = !somenteLeitura && !terminou;
  const bloqueado = enviando || !!pendente?.erro;

  return (
    <Transcritor.Provider value={podeResponder ? transcrever : null}>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <section className="flex min-w-0 flex-col gap-4">
        <ol aria-live="polite" className="flex flex-col gap-3">
          {mensagens.map((m, i) => {
            const minha = m.autor === "cliente";
            const seguinte = mensagens[i + 1];
            const anterior = mensagens[i - 1];
            const passoDe = (x?: MensagemDaConversa) => (x?.autor === "entrevistadora" ? ((x.dados ?? {}) as { passo?: Cartao }).passo : undefined);
            if (minha && !m.conteudo && passoDe(anterior)) return null;
            // O passo respondido só no cartão sai da conversa e vai para a lista "Já feito", ao lado.
            if (!minha && passoDe(m) && seguinte?.autor === "cliente" && !seguinte.conteudo) return null;
            // A fala de agora (a última da Lia, ainda sem resposta) é a instrução do passo: vai em destaque, com o beija-flor.
            if (!minha && i === mensagens.length - 1 && !pendente) {
              return (
                <li className="balao-lia" key={m.id}>
                  <Mascote className="balao-lia-ave" pose={i === 0 ? "ola" : "piscadinha"} tamanho={72} />
                  <div className="balao-lia-corpo text-foreground">
                    <span className="balao-lia-nome">{t("Lia")}</span>
                    <p className="balao-lia-texto">{m.conteudo}</p>
                  </div>
                </li>
              );
            }
            const dados = (m.dados ?? {}) as { valores?: unknown[]; lista?: unknown; pular?: boolean; nenhum?: boolean };
            const soCartao = minha && !m.conteudo;
            return (
              <li className={`flex ${minha ? "justify-end" : "justify-start"}`} key={m.id}>
                <div className={`max-w-[min(42rem,92%)] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${minha ? "bg-[var(--ds-acao)] text-[var(--ds-acao-texto)]" : "ds-cartao text-foreground"}`}>
                  {m.tipo === "audio" ? <p className="mb-1 flex items-center gap-1.5 text-[0.75rem] opacity-80"><Mic aria-hidden="true" className="h-3 w-3" />{t("Áudio transcrito")}</p> : null}
                  {m.tipo === "arquivo" ? <p className="mb-1 flex items-center gap-1.5 text-[0.75rem] opacity-80"><FileText aria-hidden="true" className="h-3 w-3" />{t("Arquivo enviado")}</p> : null}
                  {soCartao ? (dados.pular ? t("Não sei agora") : dados.nenhum ? t("Não tenho") : dados.lista ? t("Lista conferida") : t("Respondido no cartão")) : m.tipo === "arquivo" ? m.conteudo.split("\n")[0] : m.conteudo}
                </div>
              </li>
            );
          })}
          {pendente ? (
            <li className="flex flex-col items-end gap-1.5">
              <div className="max-w-[min(42rem,92%)] whitespace-pre-wrap break-words rounded-2xl bg-[var(--ds-acao)] px-4 py-2.5 text-sm leading-relaxed text-[var(--ds-acao-texto)] opacity-80">
                {pendente.arquivo ? <p className="flex items-center gap-1.5">{pendente.arquivo.audio ? <Mic aria-hidden="true" className="h-3.5 w-3.5" /> : <FileText aria-hidden="true" className="h-3.5 w-3.5" />}{pendente.arquivo.audio ? t("Áudio") : pendente.arquivo.nome}</p> : null}
                {pendente.texto || (!pendente.arquivo ? t("Respondido no cartão") : null)}
              </div>
              {pendente.erro ? (
                <div className="flex max-w-[min(42rem,92%)] flex-wrap items-center justify-end gap-2 text-[0.8125rem] text-[var(--ds-perigo)]" role="alert">
                  <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{pendente.erro}</span>
                  {pendente.sessao ? entrarDeNovo(!!pendente.arquivo && !pendente.arquivo.id) : null}
                  <button className="ds-botao ds-botao-secundario" onClick={() => void mandar(pendente)} type="button">
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    {t("Tentar de novo")}
                  </button>
                  {!pendente.sessao && !pendente.guardada ? (
                    <button
                      className="ds-botao ds-botao-secundario"
                      onClick={() => {
                        // Desiste deste envio para mudar a resposta: o cartão continua como estava e o texto volta para a caixa.
                        guardarPendente(armazem(), chaveDoPendente(clienteSlug), null);
                        if (pendente.texto) {
                          setTexto(pendente.texto);
                          guardarRascunho(chaveDoRascunho, pendente.texto);
                        }
                        setPendente(null);
                      }}
                      type="button"
                    >
                      {t("Editar a resposta")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ) : null}
          {enviando ? (
            <li className="flex justify-start">
              <div className="ds-cartao flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                {pendente?.arquivo?.audio ? t("Ouvindo o seu áudio…") : t("Anotando…")}
              </div>
            </li>
          ) : null}
        </ol>

        {podeResponder && !pendente && mensagens.at(-1)?.autor === "entrevistadora" && (mensagens.at(-1)!.dados as { volta?: unknown }).volta && mensagens.at(-2)?.autor === "cliente" ? (
          confirmarVoltar ? (
            <div className="ds-cartao flex flex-col gap-3 p-3" role="alertdialog">
              <p className="text-sm text-foreground">{t("Corrigir a resposta anterior? O que você respondeu volta para o cartão, para você mudar o que quiser.")}</p>
              <div className="flex flex-wrap gap-2">
                <button className="ds-botao ds-botao-primario" disabled={bloqueado} onClick={() => void voltar()} type="button">
                  {t("Sim, corrigir")}
                </button>
                <button className="ds-botao ds-botao-secundario" onClick={() => setConfirmarVoltar(false)} type="button">
                  {t("Cancelar")}
                </button>
              </div>
            </div>
          ) : (
            <button className="flex items-center gap-1.5 self-start px-1 text-[0.8125rem] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50" disabled={bloqueado} onClick={() => setConfirmarVoltar(true)} type="button">
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              {t("Corrigir a resposta anterior")}
            </button>
          )
        ) : null}
        {falha && !falarComALia ? (
          <div className="flex flex-wrap items-center gap-2 px-1" role="alert">
            <p className="text-[0.8125rem] text-[var(--ds-perigo)]">{falha}</p>
            {sessaoExpirada ? entrarDeNovo(false) : null}
          </div>
        ) : null}
        {terminou && !somenteLeitura ? (
          <button className="ds-botao ds-botao-primario self-start" onClick={() => window.location.reload()} type="button">
            {t("Revisar e enviar")}
          </button>
        ) : null}
        {/* O cartão só sai depois de o servidor confirmar: enquanto envia (ou se falhar) continua à vista, com o que ela marcou. */}
        {podeResponder && cartao ? (
          <Dependentes.Provider value={{ valores: estadoDoCartao.valores, mudar: (chave, v) => setEstadoDoCartao((e) => ({ ...e, valores: { ...e.valores, [chave]: v } })) }}>
            <CartaoAtivo cartao={cartao} enviar={enviar} estado={estadoDoCartao} mudar={setEstadoDoCartao} ocupado={bloqueado} />
          </Dependentes.Provider>
        ) : null}

        {podeResponder && !falarComALia && gravando === null && !texto.trim() ? (
          <button className="self-start px-1 text-[0.8125rem] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setFalarComALia(true)} type="button">
            {t("Enviar um arquivo ou tirar uma dúvida com a Lia")}
          </button>
        ) : null}
        {podeResponder && (falarComALia || gravando !== null || texto.trim()) ? (
          <div className="ds-cartao flex flex-col gap-2 p-3">
            {falha ? <p className="text-[0.8125rem] text-[var(--ds-perigo)]" role="alert">{falha}</p> : null}
            {gravando !== null ? (
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[var(--ds-perigo)]" />
                <span className="flex-1 text-sm tabular-nums text-foreground">{t("Gravando")} {tempo(gravando)}</span>
                <button className="ds-botao ds-botao-primario" onClick={() => void gravar()} type="button">
                  <Square aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("Parar e enviar")}
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <label aria-label={t("Anexar arquivo")} className={`ds-botao ds-botao-secundario h-11 w-11 shrink-0 cursor-pointer px-0 ${bloqueado ? "pointer-events-none opacity-50" : ""}`}>
                  <Paperclip aria-hidden="true" className="h-4 w-4" />
                  <input
                    accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv"
                    className="sr-only"
                    disabled={bloqueado}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) enviar({ arquivo: { blob: f, nome: f.name, mime: f.type, audio: false } });
                    }}
                    type="file"
                  />
                </label>
                <textarea
                  aria-label={t("Sua resposta")}
                  className="ds-campo max-h-48 min-h-11 flex-1 resize-none py-2.5 leading-relaxed"
                  disabled={bloqueado}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    guardarRascunho(chaveDoRascunho, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      enviar({});
                    }
                  }}
                  placeholder={t("Escreva a sua dúvida, ou anexe um arquivo (tabela de preços, PDF, foto)")}
                  rows={1}
                  value={texto}
                />
                {texto.trim() ? (
                  <button aria-label={t("Enviar")} className="ds-botao ds-botao-primario h-11 w-11 shrink-0 px-0" disabled={bloqueado} onClick={() => enviar({})} type="button">
                    <Send aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : (
                  <button aria-label={t("Gravar áudio")} className="ds-botao ds-botao-primario h-11 w-11 shrink-0 px-0" disabled={bloqueado} onClick={() => void gravar()} type="button">
                    <Mic aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
        <div ref={fim} />
      </section>

      <aside className="ds-cartao flex min-w-0 flex-col gap-3 p-5 lg:sticky lg:top-4">
        <h2 className="ds-titulo-3 text-foreground">{t("Sua ficha")}</h2>
        {progresso ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">{progresso.percentual}%</span>
              <span className="text-sm text-muted-foreground">{t("preenchida")}</span>
            </p>
            <div className="ds-barra" role="presentation">
              <span style={{ width: `${progresso.percentual}%` }} />
            </div>
            <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
              {t("{resolvidos} de {total} informações", { resolvidos: progresso.resolvidos, total: progresso.total })}
              {progresso.pendencias ? ` · ${t("{n} para ver com a Lexia", { n: progresso.pendencias })}` : ""}
            </p>
          </>
        ) : null}
        {feitos.length ? (
          <ul className="flex flex-col gap-1.5 border-t border-[var(--ds-linha)] pt-3">
            {feitos.map((f) => (
              <li className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted-foreground" key={f}>
                <Check aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--ds-acao)]" />
                <span className="min-w-0">{f}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("Tudo fica salvo a cada resposta. Pode fechar e voltar quando quiser: a conversa continua de onde parou.")}</p>
      </aside>
    </div>
    </Transcritor.Provider>
  );
}
