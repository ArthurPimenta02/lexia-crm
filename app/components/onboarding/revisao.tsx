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

function Dobra({ titulo, nota, aberta = false, children }: { titulo: string; nota?: string; aberta?: boolean; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(aberta);
  return (
    <div className="min-w-0">
      <button aria-expanded={aberto} className="flex w-full min-w-0 items-center justify-between gap-3 py-3 text-left" onClick={() => setAberto(!aberto)} type="button">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{titulo}</span>
          {nota ? <span className="block text-[0.8125rem] text-muted-foreground">{nota}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto ? <div className="pb-2">{children}</div> : null}
    </div>
  );
}

export function FichaDoAgente({ ficha, salvar }: { ficha: SecaoDaFicha[]; salvar?: Salvar }) {
  const { t } = useIdioma();
  const nota = (campos: CampoDaFicha[]) => {
    const abertos = campos.filter((c) => c.aberto).length;
    return abertos ? t("{n} informações · {a} sem resposta", { n: campos.length, a: abertos }) : t("{n} informações", { n: campos.length });
  };
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
      {ficha.map((s) => {
        const todos = [...s.campos, ...s.grupos.flatMap((g) => g.itens.flatMap((i) => i.campos))];
        return (
          <section className="ds-cartao min-w-0 px-5 py-2" key={s.chave}>
            <Dobra nota={[...s.grupos.filter((g) => g.itens.length).map((g) => `${g.itens.length} ${g.titulo.toLowerCase()}`), nota(todos)].join(" · ")} titulo={s.titulo}>
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
                    {g.itens.map((i) => (
                      <Dobra key={i.id} nota={i.campos.length ? nota(i.campos) : undefined} titulo={i.nome || t("(sem nome)")}>
                        <div className="divide-y divide-[var(--ds-linha)] pl-3">
                          {i.campos.map((c) => (
                            <Linha campo={c} key={`${c.itemId ?? ""}|${c.campo}`} salvar={salvar} />
                          ))}
                        </div>
                      </Dobra>
                    ))}
                  </div>
                </div>
              ))}
            </Dobra>
          </section>
        );
      })}
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
