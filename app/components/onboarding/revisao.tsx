"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronDown, Loader2, MessageCircle, Pencil } from "lucide-react";

import { useIdioma } from "@/app/components/idioma";
import { Mascote } from "@/app/components/mascote";
import { Campo } from "@/app/components/onboarding/conversa";
import type { CampoDaFicha, SecaoDaFicha } from "@/lib/onboarding/ficha";

/**
 * A revisão (Etapa 3) e a tela de depois do envio.
 *
 * - `FichaDoAgente`: tudo o que a cliente ensinou, seção a seção. Com `salvar`, cada linha pode ser corrigida;
 *   sem ele, é só leitura (depois de enviar, e para a equipe da Lexia).
 * - `RevisaoOnboarding`: a ficha editável e o "Enviar para a equipe".
 * - `AgenteEmTreino`: "Seu agente está sendo treinado", com a ficha em leitura e o aviso do grupo de WhatsApp.
 */

type Resultado = { ok: boolean; erro?: string };
type Salvar = (pedido: { campo: string; itemId: string | null; valor: unknown }) => Promise<Resultado>;

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const vazio = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

function texto(v: unknown): string {
  if (vazio(v)) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    const h = v as Record<string, [string, string]>;
    return DIAS.filter((d) => h[d]).map((d) => `${d} ${h[d][0]}–${h[d][1]}`).join("  ·  ");
  }
  return String(v);
}

function Linha({ campo, salvar }: { campo: CampoDaFicha; salvar?: Salvar }) {
  const { t } = useIdioma();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<unknown>(campo.valor);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, iniciar] = useTransition();
  const mostrado = texto(campo.valor);

  if (editando && salvar) {
    return (
      <div className="flex min-w-0 flex-col gap-2 py-3">
        <Campo campo={campo} confirmar={false} mudar={setValor} valor={valor} />
        {erro ? <p className="text-[0.8125rem] text-[var(--ds-perigo)]" role="alert">{erro}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            className="ds-botao ds-botao-primario min-h-9 px-3 text-[0.8125rem]"
            disabled={gravando || vazio(valor)}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await salvar({ campo: campo.campo, itemId: campo.itemId, valor });
                if (!r.ok) return setErro(r.erro ?? t("Não foi possível salvar. Tente de novo."));
                setEditando(false);
                router.refresh();
              })
            }
            type="button"
          >
            {gravando ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Check aria-hidden="true" className="h-3.5 w-3.5" />}
            {t("Salvar")}
          </button>
          <button className="ds-botao ds-botao-secundario min-h-9 px-3 text-[0.8125rem]" disabled={gravando} onClick={() => { setValor(campo.valor); setEditando(false); setErro(null); }} type="button">
            {t("Cancelar")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-[0.8125rem] text-muted-foreground">{campo.pergunta}</p>
        {mostrado ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{mostrado}</p>
        ) : (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[var(--ds-alerta)]"><AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />{t("Ainda sem resposta")}</p>
        )}
      </div>
      {salvar ? (
        <button className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-medium text-[var(--ds-acao)] underline-offset-2 hover:underline" onClick={() => { setValor(campo.valor); setEditando(true); }} type="button">
          <Pencil aria-hidden="true" className="h-3 w-3" />
          {mostrado ? t("Editar") : t("Responder")}
        </button>
      ) : null}
    </div>
  );
}

/** Anel de progresso: a parte preenchida em Jade; o resto, em cor de alerta quando falta algo. */
function Anel({ feitos, total, tamanho = 56, espessura = 6, children }: { feitos: number; total: number; tamanho?: number; espessura?: number; children?: React.ReactNode }) {
  const r = (tamanho - espessura) / 2;
  const volta = 2 * Math.PI * r;
  const parte = total ? feitos / total : 1;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: tamanho, height: tamanho }}>
      <svg aria-hidden="true" className="-rotate-90" height={tamanho} width={tamanho}>
        <circle cx={tamanho / 2} cy={tamanho / 2} fill="none" r={r} stroke={parte < 1 ? "color-mix(in oklab, var(--ds-alerta) 55%, transparent)" : "var(--ds-linha)"} strokeWidth={espessura} />
        <circle cx={tamanho / 2} cy={tamanho / 2} fill="none" r={r} stroke="var(--ds-acao)" strokeDasharray={`${volta * parte} ${volta}`} strokeLinecap="round" strokeWidth={espessura} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

const camposDe = (s: SecaoDaFicha) => [...s.campos, ...s.grupos.flatMap((g) => g.itens.flatMap((i) => i.campos))];

function Dobra({ titulo, nota, aberta = false, antes, alerta, children }: { titulo: string; nota?: string; aberta?: boolean; antes?: React.ReactNode; alerta?: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(aberta);
  return (
    <div className="min-w-0">
      <button aria-expanded={aberto} className="flex w-full min-w-0 items-center justify-between gap-3 py-3 text-left" onClick={() => setAberto(!aberto)} type="button">
        <span className="flex min-w-0 items-center gap-3">
          {antes}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{titulo}</span>
            {nota ? <span className="block text-[0.8125rem] text-muted-foreground">{nota}</span> : null}
            {alerta ? <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--ds-alerta)_14%,transparent)] px-2 py-0.5 text-[0.75rem] font-medium text-[var(--ds-alerta)]"><AlertCircle aria-hidden="true" className="h-3 w-3" />{alerta}</span> : null}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto ? <div className="pb-2">{children}</div> : null}
    </div>
  );
}

export function FichaDoAgente({ ficha, salvar }: { ficha: SecaoDaFicha[]; salvar?: Salvar }) {
  const { t } = useIdioma();
  const todos = ficha.flatMap(camposDe);
  const feitos = todos.filter((c) => !c.aberto).length;
  const comFalta = ficha.filter((s) => camposDe(s).some((c) => c.aberto));
  const pct = todos.length ? Math.round((feitos / todos.length) * 100) : 100;
  const nomeDoItem = new Map(ficha.flatMap((s) => s.grupos.flatMap((g) => g.itens.map((i) => [i.id, i.nome] as const))));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* O retrato de tudo: quanto está preenchido e em que áreas falta algo. */}
      <section className="ds-cartao flex min-w-0 flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <Anel espessura={12} feitos={feitos} tamanho={132} total={todos.length}>
          <span className="text-center">
            <span className="block text-3xl font-semibold tabular-nums tracking-tight text-foreground">{pct}%</span>
            <span className="block text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{t("preenchida")}</span>
          </span>
        </Anel>
        <div className="min-w-0 flex-1">
          <p className="ds-titulo-3 text-foreground">{comFalta.length ? t("Falta pouco") : t("Ficha completa")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("{f} de {n} informações preenchidas", { f: feitos, n: todos.length })}
            {comFalta.length ? ` · ${t("{a} sem resposta em {s} áreas", { a: todos.length - feitos, s: comFalta.length })}` : ""}
          </p>
          <ul className="mt-3 flex min-w-0 flex-wrap gap-2">
            {ficha.map((s) => {
              const cs = camposDe(s);
              const ok = cs.filter((c) => !c.aberto).length;
              return (
                <li className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--ds-linha)] py-1 pl-1 pr-3" key={s.chave}>
                  <Anel espessura={3.5} feitos={ok} tamanho={26} total={cs.length}>{ok === cs.length ? <Check aria-hidden="true" className="h-3 w-3 text-[var(--ds-acao)]" /> : null}</Anel>
                  <span className="min-w-0 truncate text-[0.8125rem] text-foreground">{s.titulo}</span>
                  {ok < cs.length ? <span className="text-[0.75rem] font-medium tabular-nums text-[var(--ds-alerta)]">{cs.length - ok}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* O que ficou sem resposta, tudo junto: não é preciso procurar abrindo área por área. */}
      {comFalta.length ? (
        <section className="ds-cartao min-w-0 border-2 border-[color-mix(in_oklab,var(--ds-alerta)_45%,transparent)] px-5 py-4">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground"><AlertCircle aria-hidden="true" className="h-4 w-4 text-[var(--ds-alerta)]" />{t("O que ficou sem resposta")}</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">{salvar ? t("Responda aqui mesmo, ou envie assim: a equipe vê com você depois.") : t("A equipe da Lexia vê estes pontos com a cliente.")}</p>
          <div className="mt-2 flex flex-col">
            {comFalta.map((s) => (
              <div className="min-w-0 border-t border-[var(--ds-linha)] pt-2 first:border-t-0" key={s.chave}>
                <p className="ds-sobretitulo pt-1">{s.titulo}</p>
                <div className="divide-y divide-[var(--ds-linha)]">
                  {camposDe(s).filter((c) => c.aberto).map((c) => (
                    <Linha campo={c.itemId && nomeDoItem.get(c.itemId) ? { ...c, pergunta: `${nomeDoItem.get(c.itemId)} · ${c.pergunta}` } : c} key={`${c.itemId ?? ""}|${c.campo}`} salvar={salvar} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
        {ficha.map((s) => {
          const cs = camposDe(s);
          const ok = cs.filter((c) => !c.aberto).length;
          const itens = s.grupos.filter((g) => g.itens.length).map((g) => `${g.itens.length} ${g.titulo.toLowerCase()}`);
          return (
            <section className="ds-cartao min-w-0 px-5 py-2" key={s.chave}>
              <Dobra
                alerta={ok < cs.length ? t("{a} sem resposta", { a: cs.length - ok }) : undefined}
                antes={<Anel feitos={ok} total={cs.length}><span className="text-[0.75rem] font-semibold tabular-nums text-foreground">{cs.length ? Math.round((ok / cs.length) * 100) : 100}%</span></Anel>}
                nota={[...itens, t("{n} informações", { n: cs.length })].join(" · ")}
                titulo={s.titulo}
              >
                {s.campos.length ? (
                  <div className="divide-y divide-[var(--ds-linha)]">
                    {s.campos.map((c) => (
                      <Linha campo={c} key={`${c.itemId ?? ""}|${c.campo}`} salvar={salvar} />
                    ))}
                  </div>
                ) : null}
                {s.grupos.filter((g) => g.itens.length).map((g) => (
                  <div className="mt-2" key={g.chave}>
                    <p className="ds-sobretitulo pt-2">{g.titulo}</p>
                    <div className="divide-y divide-[var(--ds-linha)]">
                      {g.itens.map((i) => {
                        const faltam = i.campos.filter((c) => c.aberto).length;
                        return (
                          <Dobra alerta={faltam ? t("{a} sem resposta", { a: faltam }) : undefined} key={i.id} nota={i.campos.length ? t("{n} informações", { n: i.campos.length }) : undefined} titulo={i.nome || t("(sem nome)")}>
                            <div className="divide-y divide-[var(--ds-linha)] pl-3">
                              {i.campos.map((c) => (
                                <Linha campo={c} key={`${c.itemId ?? ""}|${c.campo}`} salvar={salvar} />
                              ))}
                            </div>
                          </Dobra>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </Dobra>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function RevisaoOnboarding({ ficha, salvar, enviar }: { ficha: SecaoDaFicha[]; salvar: Salvar; enviar: () => Promise<Resultado> }) {
  const { t } = useIdioma();
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const abertos = ficha.flatMap((s) => [...s.campos, ...s.grupos.flatMap((g) => g.itens.flatMap((i) => i.campos))]).filter((c) => c.aberto).length;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="balao-lia">
        <Mascote className="balao-lia-ave" pose="feliz" tamanho={72} />
        <div className="balao-lia-corpo text-foreground">
          <span className="balao-lia-nome">{t("Lia")}</span>
          <p className="balao-lia-texto">{t("Aqui está tudo o que você me ensinou. Abra cada parte para conferir e toque em Editar no que quiser mudar. Quando estiver tudo certo, envie para a equipe: é com isso que a sua assistente vai ser treinada.")}</p>
        </div>
      </div>
      <FichaDoAgente ficha={ficha} salvar={salvar} />
      <div className="ds-cartao flex min-w-0 flex-col gap-3 p-5">
        {abertos ? <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-alerta)]" />{t("{n} informações ficaram sem resposta. Você pode responder agora ou enviar assim: a equipe vê com você depois.", { n: abertos })}</p> : null}
        {erro ? <p className="text-sm text-[var(--ds-perigo)]" role="alert">{erro}</p> : null}
        {confirmando ? (
          <>
            <p className="text-sm font-medium leading-relaxed text-foreground">{t("Depois de enviar, você não consegue mais alterar por aqui. Se precisar mudar algo, é só avisar a equipe. Enviar agora?")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="ds-botao ds-botao-primario"
                disabled={enviando}
                onClick={() =>
                  iniciar(async () => {
                    setErro(null);
                    const r = await enviar();
                    if (!r.ok) return setErro(r.erro ?? t("Não foi possível enviar agora. Tente de novo."));
                    router.refresh();
                  })
                }
                type="button"
              >
                {enviando ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                {t("Sim, enviar para a equipe")}
              </button>
              <button className="ds-botao ds-botao-secundario" disabled={enviando} onClick={() => setConfirmando(false)} type="button">{t("Ainda não")}</button>
            </div>
          </>
        ) : (
          <button className="ds-botao ds-botao-primario self-start" onClick={() => setConfirmando(true)} type="button">{t("Está tudo certo, enviar para a equipe")}</button>
        )}
      </div>
    </div>
  );
}

export function AgenteEmTreino({ ficha, whatsapp }: { ficha: SecaoDaFicha[]; whatsapp?: string }) {
  const { t } = useIdioma();
  const [vendo, setVendo] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="ds-cartao flex min-w-0 flex-col items-center gap-4 overflow-hidden px-6 py-12 text-center" style={{ background: "radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--ds-acao) 16%, var(--ds-superficie)) 0%, var(--ds-superficie) 70%)" }}>
        <Mascote pose="voando" tamanho={168} />
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("Seu agente está sendo treinado")}</h2>
        <p className="max-w-lg text-base leading-relaxed text-muted-foreground">{t("Recebemos tudo o que você ensinou. Agora a equipe da Lexia prepara a sua assistente e avisa você quando ela estiver pronta para testar.")}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button className="ds-botao ds-botao-primario" onClick={() => setVendo(!vendo)} type="button">{vendo ? t("Esconder as informações") : t("Ver informações do agente")}</button>
          {whatsapp ? (
            <a className="ds-botao ds-botao-secundario" href={whatsapp} rel="noreferrer" target="_blank">
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              {t("Falar no grupo de WhatsApp")}
            </a>
          ) : null}
        </div>
        <p className="max-w-lg text-[0.8125rem] leading-relaxed text-muted-foreground">{t("Precisa de alguma alteração? Avise no nosso grupo de WhatsApp.")}</p>
      </div>
      {vendo ? <FichaDoAgente ficha={ficha} /> : null}
    </div>
  );
}
