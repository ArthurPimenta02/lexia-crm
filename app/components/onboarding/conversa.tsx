"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, FileText, Loader2, Mic, Paperclip, RotateCcw, Send, Square, X } from "lucide-react";

import { useIdioma } from "@/app/components/idioma";
import type { CampoDoCartao, Cartao, MensagemDaConversa, Progresso } from "@/lib/onboarding/conversa";
import { createClient } from "@/lib/supabase/client";

/**
 * A conversa com a entrevistadora (Etapa 2).
 *
 * Regras desta tela:
 *  - nada do que a cliente escreveu ou gravou se perde: o rascunho do texto fica
 *    no navegador, e um envio que falha fica na tela com "Tentar de novo" (o
 *    mesmo envio, com o mesmo identificador, para o servidor não o duplicar);
 *  - só o último cartão é respondível; os anteriores ficam como histórico;
 *  - nos cartões de escolha nada é enviado sem ela ver o que está marcado.
 */

type Envio = {
  id: string;
  texto: string;
  arquivo?: { blob: Blob; nome: string; mime: string; audio: boolean; id?: string };
  valores?: { campo: string; itemId: string | null; valor: unknown }[];
  lista?: { manter: string[]; novos: string[] };
  pular?: boolean;
  nenhum?: boolean;
};

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const GRUPO: Record<string, string> = { servicos: "Serviços", profissionais: "Profissionais", faqs: "Perguntas frequentes", objecoes: "Objeções", promocoes: "Promoções" };
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
const k = (c: { campo: string; itemId: string | null }) => `${c.itemId ?? ""}|${c.campo}`;
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

// ------------------------------------------------------------------ campos dos cartões

function Opcoes({ campo, valor, mudar }: { campo: CampoDoCartao; valor: unknown; mudar: (v: unknown) => void }) {
  const { t } = useIdioma();
  const varias = campo.tipo === "multi";
  const marcadas = new Set<string>(varias ? (Array.isArray(valor) ? (valor as string[]) : []) : typeof valor === "string" ? [valor] : []);
  const recomendadas = new Set<string>([campo.recomendado ?? []].flat());
  if ((campo.opcoes?.length ?? 0) > 10) {
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

function Campo({ campo, valor, mudar, confirmar }: { campo: CampoDoCartao; valor: unknown; mudar: (v: unknown) => void; confirmar: boolean }) {
  const { t } = useIdioma();
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
      ) : campo.opcoes?.length ? (
        <Opcoes campo={campo} mudar={mudar} valor={valor} />
      ) : campo.tipo === "long" || String(valor ?? "").length > 70 ? (
        <textarea className="ds-campo min-h-20 py-2 leading-relaxed" onChange={(e) => mudar(e.target.value)} value={String(valor ?? "")} />
      ) : (
        <input className="ds-campo" onChange={(e) => mudar(e.target.value)} value={String(valor ?? "")} />
      )}
    </div>
  );
}

/** A instrução do cartão: uma frase que diz exatamente o que fazer agora. */
function OQueFazer({ children }: { children: React.ReactNode }) {
  const { t } = useIdioma();
  return (
    <div className="rounded-xl bg-[var(--ds-acao-fundo)] px-3.5 py-3">
      <p className="ds-sobretitulo text-[var(--ds-acao)]">{t("O que fazer agora")}</p>
      <p className="mt-1 text-sm font-medium leading-relaxed text-foreground">{children}</p>
    </div>
  );
}

/** Um rascunho já preenchido, fechado: mostra o começo do texto e abre para editar. */
function Resumo({ campo, valor, abrir }: { campo: CampoDoCartao; valor: unknown; abrir: () => void }) {
  const { t } = useIdioma();
  const texto = valor === null ? t("Sem problema, eu pergunto isso na conversa.") : Array.isArray(valor) ? valor.join(", ") : String(valor ?? "");
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-semibold text-foreground">
          {campo.pergunta}
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

type EstadoDoCartao = { valores: Record<string, unknown>; manter: Set<string>; novos: string[] };

function estadoInicial(c: Cartao): EstadoDoCartao {
  const valores: Record<string, unknown> = {};
  const confirmar = c.tipo === "confirmar" ? c.campos : c.tipo === "item" ? c.confirmar : [];
  for (const f of confirmar) valores[k(f)] = f.valor;
  // Na tabela, o que as fontes acharam já vem escrito na linha do serviço.
  // Na lista de perguntas frequentes, objeções e profissionais, a resposta sugerida de cada item já vem escrita.
  if (c.tipo === "lista") for (const f of c.itens.flatMap((i) => i.campos ?? [])) valores[k(f)] = f.valor;
  // Nas escolhas com recomendação, a recomendada já vem marcada (e fica à vista o que está sendo aceito).
  if (c.tipo === "cartoes" && c.secao === "recomendadas") for (const f of c.campos) valores[k(f)] = f.recomendado;
  if (c.tipo === "tabela") for (const f of c.linhas.flatMap((l) => l.campos)) if (f.valor !== undefined && f.valor !== null) valores[k(f)] = f.valor;
  return { valores, manter: new Set(c.tipo === "lista" ? c.itens.map((i) => i.id) : []), novos: [] };
}

const vazio = (v: unknown) => v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

// ------------------------------------------------------------------ a tabela dos serviços (preço e duração)

type LinhaDaTabela = Extract<Cartao, { tipo: "tabela" }>["linhas"][number];
const semValor = (opcao: unknown) => /orçamento|avalia/i.test(String(opcao ?? ""));
const rotuloCurto = (opcao: string) => opcao.split(" (")[0].split(" — ")[0];

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
      } else if (!vazio(valores[k(f)])) out.push({ campo: f.campo, itemId: f.itemId, valor: String(valores[k(f)]).trim() });
    }
  }
  return out.filter((v) => v.valor !== "");
}
const linhaCompleta = (l: LinhaDaTabela, valores: Record<string, unknown>) => l.campos.every((f) => (f.campo === "tipo_de_preco" ? !!tipoDaLinha(l, valores) : f.campo === "valor" ? semValor(tipoDaLinha(l, valores)) || !vazio(valores[k(f)]) : !vazio(valores[k(f)])));

function CartaoAtivo({ cartao, estado, mudar, ocupado, enviar }: { cartao: Cartao; estado: EstadoDoCartao; mudar: (e: EstadoDoCartao) => void; ocupado: boolean; enviar: (e: Partial<Envio>) => void }) {
  const { t } = useIdioma();
  const [novo, setNovo] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const set = (f: CampoDoCartao, v: unknown) => mudar({ ...estado, valores: { ...estado.valores, [k(f)]: v } });
  const valoresDe = (campos: CampoDoCartao[]) => campos.filter((f) => !vazio(estado.valores[k(f)]) || estado.valores[k(f)] === null).map((f) => ({ campo: f.campo, itemId: f.itemId, valor: estado.valores[k(f)] }));

  if (cartao.tipo === "confirmar") {
    return (
      <div className="ds-cartao flex flex-col gap-4 p-4">
        <OQueFazer>{t("Leia os dados abaixo. Se algo estiver errado, corrija no próprio campo. Depois toque em \"Está certo, continuar\".")}</OQueFazer>
        {cartao.campos.map((f) => (
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
        {cartao.campos.map((f) => (
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
      if (nome && !estado.novos.includes(nome)) mudar({ ...estado, novos: [...estado.novos, nome] });
      setNovo("");
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
            placeholder={t("Acrescentar um que faltou")}
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
        <OQueFazer>{t("Digite o preço e a duração de cada serviço. Se o preço de algum depende de avaliação, escolha isso na linha dele. Depois toque em \"Enviar a tabela\".")}</OQueFazer>
        <div aria-hidden="true" className="hidden min-w-0 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[0.75rem] font-medium text-muted-foreground sm:grid">
          <span>{t("Como é o preço")}</span>
          <span>{t("Preço")}</span>
          <span>{t("Duração")}</span>
        </div>
        <ul className="flex flex-col divide-y divide-[var(--ds-linha)]">
          {cartao.linhas.map((l) => {
            const tipo = l.campos.find((f) => f.campo === "tipo_de_preco");
            const valor = l.campos.find((f) => f.campo === "valor");
            const duracao = l.campos.find((f) => f.campo === "duracao_media");
            const tipoAtual = tipoDaLinha(l, estado.valores);
            return (
              <li className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0" key={l.itemId}>
                <p className="min-w-0 text-sm font-medium text-foreground">{l.nome || t("(sem nome)")}</p>
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  {tipo ? (
                    <select aria-label={t("Tipo de preço")} className="ds-campo col-span-2 sm:col-span-1" onChange={(e) => set(tipo, e.target.value || undefined)} value={typeof estado.valores[k(tipo)] === "string" ? (estado.valores[k(tipo)] as string) : ""}>
                      <option value="">{rotuloCurto(tipo.opcoes?.[0] ?? "")}</option>
                      {(tipo.opcoes ?? []).slice(1).filter((o) => !/^outro/i.test(o)).map((o) => (
                        <option key={o} value={o}>{rotuloCurto(o)}</option>
                      ))}
                    </select>
                  ) : null}
                  {valor ? (
                    <input aria-label={t("Preço")} className="ds-campo disabled:opacity-50" disabled={semValor(tipoAtual)} inputMode="decimal" onChange={(e) => set(valor, e.target.value)} placeholder={semValor(tipoAtual) ? t("Depois da avaliação") : t("Digite o preço (ex.: 650)")} value={semValor(tipoAtual) ? "" : String(estado.valores[k(valor)] ?? "")} />
                  ) : null}
                  {duracao ? (
                    <input aria-label={t("Duração")} className="ds-campo" onChange={(e) => set(duracao, e.target.value)} placeholder={t("Duração (ex.: 1h30)")} value={String(estado.valores[k(duracao)] ?? "")} />
                  ) : null}
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

  if (cartao.tipo === "item") {
    const tipo = cartao.faltam.find((f) => f.campo === "tipo_de_preco");
    const preco = cartao.faltam.find((f) => f.campo === "valor");
    const outros = cartao.faltam.filter((f) => f !== tipo && f !== preco);
    const tipoAtual = tipo ? (estado.valores[k(tipo)] as string | undefined) : undefined;
    const temFalta = cartao.faltam.length > 0 || cartao.cartoes.length > 0;
    return (
      <div className="ds-cartao flex flex-col gap-4 p-4">
        <p className="ds-titulo-3 text-foreground">{cartao.nome}</p>
        <OQueFazer>
          {preco
            ? t("Digite o preço deste serviço e toque em \"Continuar\". O resto já está preenchido: só mexa se estiver errado.")
            : tipo
              ? t("Escolha como é o preço deste serviço e toque em \"Continuar\". O resto já está preenchido: só mexa se estiver errado.")
            : temFalta
              ? t("Responda o que está em \"Falta só isto\" e toque em \"Continuar\". O resto já está preenchido: só mexa se estiver errado.")
              : t("Já está tudo preenchido. Dê uma olhada: se estiver certo, toque em \"Está certo, continuar\".")}
        </OQueFazer>
        {temFalta ? (
          <div className="flex flex-col gap-4">
            <p className="ds-sobretitulo">{t("Falta só isto")}</p>
            {tipo || preco ? (
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">{preco ? t("Quanto custa?") : t("Como é o preço deste serviço?")}</p>
                {tipo ? <Opcoes campo={{ ...tipo, opcoes: (tipo.opcoes ?? []).filter((o) => !/^outro/i.test(o)) }} mudar={(v) => set(tipo, v)} valor={estado.valores[k(tipo)]} /> : null}
                {preco && !semValor(tipoAtual) ? (
                  <input aria-label={t("Preço")} className="ds-campo max-w-xs" inputMode="decimal" onChange={(e) => set(preco, e.target.value)} placeholder={t("Digite o preço (ex.: 650)")} value={String(estado.valores[k(preco)] ?? "")} />
                ) : null}
              </div>
            ) : null}
            {[...outros, ...cartao.cartoes].map((f) => (
              <Campo campo={f} confirmar={false} key={k(f)} mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} />
            ))}
          </div>
        ) : null}
        {cartao.confirmar.length ? (
          <div className="flex flex-col gap-3">
            <p className="ds-sobretitulo">{t("Já preenchido")}</p>
            <div className="flex flex-col divide-y divide-[var(--ds-linha)]">
              {cartao.confirmar.map((f) => (
                <div className="py-3 first:pt-0 last:pb-0" key={k(f)}>
                  {abertos.has(k(f)) ? <Campo campo={f} confirmar mudar={(v) => set(f, v)} valor={estado.valores[k(f)]} /> : <Resumo abrir={() => setAbertos(new Set([...abertos, k(f)]))} campo={f} valor={estado.valores[k(f)]} />}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button className="ds-botao ds-botao-primario" disabled={ocupado} onClick={() => enviar({})} type="button">
            {temFalta ? t("Continuar") : t("Está certo, continuar")}
          </button>
          {temFalta ? (
            <>
              <button className="ds-botao ds-botao-secundario" disabled={ocupado} onClick={() => enviar({ pular: true })} type="button">
                {t("Não sei agora")}
              </button>
              <span className="text-[0.8125rem] text-muted-foreground">{t("Se preferir, responda por áudio ou texto aí embaixo.")}</span>
            </>
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
      return t("Dados do negócio conferidos");
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
  const [pendente, setPendente] = useState<(Envio & { erro?: string }) | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState<number | null>(null);
  const [estadoDoCartao, setEstadoDoCartao] = useState<EstadoDoCartao>({ valores: {}, manter: new Set(), novos: [] });
  const gravador = useRef<MediaRecorder | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const cartaoDe = useRef<string>("");

  const ultimaDaLia = useMemo(() => [...(mensagens ?? [])].reverse().find((m) => m.autor === "entrevistadora") ?? null, [mensagens]);
  const cartao = (ultimaDaLia?.dados?.passo ?? null) as Cartao | null;
  const terminou = progresso?.terminou || cartao?.tipo === "fim";

  // Cartão novo: começa com o que o rascunho achou (os de escolha começam vazios: nada é aceito sem ela marcar).
  useEffect(() => {
    if (ultimaDaLia && cartao && cartaoDe.current !== ultimaDaLia.id) {
      cartaoDe.current = ultimaDaLia.id;
      setEstadoDoCartao(estadoInicial(cartao));
    }
  }, [ultimaDaLia, cartao]);

  /** Busca a conversa como está. Não mexe na tela: quem chama decide o que fazer com o resultado. */
  const buscar = useCallback(async (): Promise<{ mensagens: MensagemDaConversa[]; progresso: Progresso | null } | { erro: string }> => {
    try {
      const r = await fetch(`/api/onboarding/conversa${clienteSlug ? `?cliente=${encodeURIComponent(clienteSlug)}` : ""}`, { cache: "no-store" });
      const j = (await r.json()) as { mensagens?: MensagemDaConversa[]; progresso?: Progresso; erro?: string };
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

  const mandar = useCallback(
    async (envio: Envio) => {
      setEnviando(true);
      setPendente({ ...envio, erro: undefined });
      try {
        // 1) o arquivo (áudio, imagem, PDF) sobe primeiro; se já subiu numa tentativa anterior, não sobe de novo
        if (envio.arquivo && !envio.arquivo.id) {
          const a = envio.arquivo;
          const base = { cliente: clienteSlug, origem: "conversa", nome: a.nome, mime: a.mime, tamanho: a.blob.size };
          const p = await fetch("/api/onboarding/arquivo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, passo: "preparar" }) });
          const pj = (await p.json()) as { caminho?: string; token?: string; erro?: string };
          if (!p.ok || !pj.caminho || !pj.token) throw new Error(pj.erro ?? t("Não foi possível enviar o arquivo."));
          const { error } = await createClient().storage.from("onboarding").uploadToSignedUrl(pj.caminho, pj.token, a.blob, { contentType: a.mime.split(";")[0] });
          if (error) throw new Error(t("Não foi possível enviar o arquivo."));
          const r = await fetch("/api/onboarding/arquivo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, passo: "registar", caminho: pj.caminho }) });
          const rj = (await r.json()) as { id?: string; erro?: string };
          if (!r.ok || !rj.id) throw new Error(rj.erro ?? t("Não foi possível enviar o arquivo."));
          envio = { ...envio, arquivo: { ...a, id: rj.id } };
          setPendente({ ...envio });
        }
        // 2) o turno
        const r = await fetch("/api/onboarding/conversa", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cliente: clienteSlug, idDoAparelho: envio.id, texto: envio.texto, arquivoId: envio.arquivo?.id, valores: envio.valores, lista: envio.lista, pular: envio.pular, nenhum: envio.nenhum }),
        });
        const j = (await r.json().catch(() => ({}))) as { mensagens?: MensagemDaConversa[]; progresso?: Progresso; erro?: string };
        if (!r.ok || !j.mensagens) throw new Error(j.erro ?? t("Não foi possível enviar. Sua resposta continua aqui."));
        setMensagens(j.mensagens);
        setProgresso(j.progresso ?? null);
        setPendente(null);
      } catch (e) {
        setPendente({ ...envio, erro: e instanceof Error ? e.message : t("Não foi possível enviar. Sua resposta continua aqui.") });
      } finally {
        setEnviando(false);
      }
    },
    [clienteSlug, t],
  );

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
      const temPreco = doItem.some((v) => v.campo === "valor");
      const temTipo = doItem.find((v) => v.campo === "tipo_de_preco");
      if (tipo && temPreco && !temTipo && tipo.opcoes?.[0]) doItem.push({ campo: tipo.campo, itemId: tipo.itemId, valor: tipo.opcoes[0] });
      if (temTipo && semValor(temTipo.valor)) doItem.splice(0, doItem.length, ...doItem.filter((v) => v.campo !== "valor"));
    }
    // A tabela vai inteira com o que estiver preenchido, mesmo quando ela responde por texto ou áudio.
    const daTabela = cartao?.tipo === "tabela" && !extra.pular ? valoresDaTabela(cartao.linhas, estadoDoCartao.valores) : [];
    const doCartao = [...doItem, ...daTabela];
    const envio: Envio = { id: novoId(), texto: texto.trim(), ...extra, valores: extra.valores ?? (doCartao.length ? doCartao : undefined) };
    if (!envio.texto && !envio.arquivo && !envio.valores?.length && !envio.lista && !envio.pular && !envio.nenhum) return;
    setTexto("");
    guardarRascunho(chaveDoRascunho, "");
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

  if (mensagens === null) {
    return (
      <div className="ds-cartao flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        {falha ? (
          <>
            <p role="alert">{falha}</p>
            <button className="ds-botao ds-botao-secundario" onClick={carregar} type="button">
              {t("Tentar de novo")}
            </button>
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

  const podeResponder = !somenteLeitura && !terminou;
  const pedeTexto = cartao?.tipo === "item" ? cartao.faltam.length > 0 : cartao?.tipo === "pergunta" || cartao?.tipo === "itens";
  const bloqueado = enviando || !!pendente?.erro;

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <section className="flex min-w-0 flex-col gap-4">
        <ol aria-live="polite" className="flex flex-col gap-3">
          {mensagens.map((m, i) => {
            const minha = m.autor === "cliente";
            // Um passo já respondido no cartão ocupa uma linha só: o que fica à vista é a pergunta de agora.
            const seguinte = mensagens[i + 1];
            const anterior = mensagens[i - 1];
            const passoDe = (x?: MensagemDaConversa) => (x?.autor === "entrevistadora" ? ((x.dados ?? {}) as { passo?: Cartao }).passo : undefined);
            if (minha && !m.conteudo && passoDe(anterior)) return null;
            if (!minha && passoDe(m) && seguinte?.autor === "cliente" && !seguinte.conteudo) {
              const d = (seguinte.dados ?? {}) as { pular?: boolean; nenhum?: boolean };
              return (
                <li className="flex items-center gap-2 px-1 text-[0.8125rem] text-muted-foreground" key={m.id}>
                  <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--ds-acao)]" />
                  <span className="min-w-0 truncate">{tituloDoPasso(passoDe(m)!, t)}{d.pular ? ` · ${t("Não sei agora")}` : d.nenhum ? ` · ${t("Não tenho")}` : ""}</span>
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
                  <button className="ds-botao ds-botao-secundario" onClick={() => void mandar(pendente)} type="button">
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    {t("Tentar de novo")}
                  </button>
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

        {podeResponder && cartao && !pendente ? <CartaoAtivo cartao={cartao} enviar={enviar} estado={estadoDoCartao} mudar={setEstadoDoCartao} ocupado={bloqueado} /> : null}

        {podeResponder ? (
          <div className="ds-cartao sticky bottom-3 flex flex-col gap-2 p-3">
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
                  placeholder={pedeTexto ? t("Escreva aqui ou, se preferir, grave um áudio") : t("Se quiser, escreva algo a mais")}
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
            {pedeTexto && cartao?.tipo !== "item" && gravando === null ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
                <button className="text-muted-foreground underline-offset-2 hover:underline" disabled={bloqueado} onClick={() => enviar({ pular: true })} type="button">
                  {t("Não sei agora")}
                </button>
                {cartao?.tipo === "itens" && !cartao.obrigatorio ? (
                  <button className="text-muted-foreground underline-offset-2 hover:underline" disabled={bloqueado} onClick={() => enviar({ nenhum: true })} type="button">
                    {t("Não tenho")}
                  </button>
                ) : null}
              </div>
            ) : null}
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
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("Tudo fica salvo a cada resposta. Pode fechar e voltar quando quiser: a conversa continua de onde parou.")}</p>
      </aside>
    </div>
  );
}
