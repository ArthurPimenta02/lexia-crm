"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, FileText, Loader2, Upload } from "lucide-react";

import type { EstadoEtapa1 } from "@/lib/onboarding/etapa1-acoes";
import { useIdioma } from "@/app/components/idioma";
import { createClient } from "@/lib/supabase/client";
import type { Achados, EstadoOnboarding, Etapa1 } from "@/lib/onboarding/dados";

type Arquivo = { id: string; nome: string; tamanho: number; lido: boolean };
type Linha = { secao: string; grupo: string | null; itemId: string | null; chave: string; pergunta: string; valor: unknown; fonte: string };
type Numeros = { raizTotal: number; raizPreenchidos: number; servicos: number; servicosComPreco: number; servicosComDuracao: number; faqs: number; profissionais: number; promocoes: number };

const inicial: EstadoEtapa1 = { message: null, type: null };
const IDIOMAS = ["Português", "English", "Español"];
const ACEITA = "application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv";

function tamanhoLegivel(b: number) {
  return b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

function mostrar(valor: unknown): string {
  if (Array.isArray(valor)) return valor.join(", ");
  if (valor && typeof valor === "object") return Object.entries(valor as Record<string, string[]>).map(([d, h]) => `${d} ${h.join("–")}`).join(" · ");
  return String(valor ?? "");
}

function Campo({ ajuda, children, rotulo }: { ajuda?: string; children: React.ReactNode; rotulo: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[0.8125rem] font-medium text-foreground">
        {rotulo} {ajuda ? <span className="font-normal text-muted-foreground">{ajuda}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Etapa1Form({
  achado,
  achados,
  arquivos,
  clienteSlug,
  estado,
  etapa1,
  liberar,
  numeros,
  salvarAcao,
  temChaveDeIa,
}: {
  achado: Linha[];
  achados: Achados;
  arquivos: Arquivo[];
  /** Só o admin indica o cliente. No painel do cliente fica vazio: o servidor usa a empresa da sessão. */
  clienteSlug?: string;
  estado: EstadoOnboarding;
  liberar: () => Promise<EstadoEtapa1>;
  salvarAcao: (estado: EstadoEtapa1, formData: FormData) => Promise<EstadoEtapa1>;
  etapa1: Etapa1;
  numeros: Numeros | null;
  temChaveDeIa: boolean;
}) {
  const { t } = useIdioma();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [salvo, salvar, salvando] = useActionState(salvarAcao, inicial);
  const [enviando, setEnviando] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [liberando, iniciarLiberacao] = useTransition();
  const liberada = estado !== "etapa1" && estado !== "preparando";
  const temRascunho = !!achados.rascunho_em;

  async function enviarArquivos(lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null);
    for (const arquivo of Array.from(lista)) {
      setEnviando((e) => [...e, arquivo.name]);
      try {
        const base = { cliente: clienteSlug, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size };
        const p = await fetch("/api/onboarding/arquivo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, passo: "preparar" }) });
        const pj = (await p.json()) as { caminho?: string; token?: string; erro?: string };
        if (!p.ok || !pj.caminho || !pj.token) throw new Error(pj.erro ?? t("Não foi possível enviar o arquivo."));
        const { error } = await createClient().storage.from("onboarding").uploadToSignedUrl(pj.caminho, pj.token, arquivo, { contentType: arquivo.type });
        if (error) throw new Error(t("Não foi possível enviar o arquivo."));
        const r = await fetch("/api/onboarding/arquivo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, passo: "registar", caminho: pj.caminho }) });
        if (!r.ok) throw new Error(((await r.json()) as { erro?: string }).erro ?? t("Não foi possível enviar o arquivo."));
      } catch (e) {
        setErro(`${arquivo.name}: ${e instanceof Error ? e.message : t("Não foi possível enviar o arquivo.")}`);
      } finally {
        setEnviando((e) => e.filter((n) => n !== arquivo.name));
      }
    }
    router.refresh();
  }

  async function gerar() {
    if (!form.current) return;
    setErro(null);
    setGerando(true);
    try {
      // Primeiro grava o que está na tela: o rascunho lê o que está salvo.
      const s = await salvarAcao(inicial, new FormData(form.current));
      if (s.type === "error") throw new Error(s.message ?? "");
      const r = await fetch("/api/onboarding/rascunho", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cliente: clienteSlug }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; erro?: string };
      if (!r.ok || !j.ok) throw new Error(j.erro ?? t("Não foi possível gerar o rascunho."));
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : t("Não foi possível gerar o rascunho."));
    } finally {
      setGerando(false);
      router.refresh();
    }
  }

  // O que foi achado, agrupado para leitura: raiz por seção, itens por serviço/pergunta.
  const raiz = achado.filter((l) => !l.itemId);
  const secoes = [...new Set(raiz.map((l) => l.secao))];
  const itens = new Map<string, Linha[]>();
  for (const l of achado) if (l.itemId) itens.set(l.itemId, [...(itens.get(l.itemId) ?? []), l]);
  const NOME: Record<string, string> = { servicos: "nome", profissionais: "nome", faqs: "pergunta", objecoes: "objecao", promocoes: "nome" };
  const GRUPO: Record<string, string> = { servicos: t("Serviços"), profissionais: t("Profissionais"), faqs: t("Perguntas frequentes"), objecoes: t("Objeções"), promocoes: t("Promoções") };

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
      <form action={salvar} className="ds-cartao flex min-w-0 flex-col gap-6 p-5 sm:p-6" ref={form}>
        <fieldset className="flex min-w-0 flex-col gap-4" disabled={liberada}>
          <h2 className="ds-titulo-3 text-foreground">{t("Onde o negócio já está")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo={t("Instagram")}>
              <input className="ds-campo" defaultValue={etapa1.instagram ?? ""} name="instagram" placeholder="@" />
            </Campo>
            <Campo rotulo={t("Site")}>
              <input className="ds-campo" defaultValue={etapa1.site ?? ""} inputMode="url" name="site" placeholder="https://" />
            </Campo>
            <div className="sm:col-span-2">
              <Campo rotulo={t("Perfil no Google")}>
                <input className="ds-campo" defaultValue={etapa1.google ?? ""} name="google" placeholder="https://" />
            </Campo>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo={t("Tipo de negócio")}>
              <input className="ds-campo" defaultValue={etapa1.tipo_de_negocio ?? ""} name="tipo_de_negocio" placeholder={t("Clínica de estética")} />
            </Campo>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[0.8125rem] font-medium text-foreground">{t("Idiomas do atendimento")}</span>
              <div className="flex flex-wrap gap-2">
                {IDIOMAS.map((i) => (
                  <label className="ds-botao ds-botao-secundario cursor-pointer gap-2 has-[:checked]:border-[var(--ds-acao)] has-[:checked]:bg-[var(--ds-acao-fundo)] has-[:checked]:text-[var(--ds-acao)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2" key={i}>
                    <input className="peer sr-only" defaultChecked={(etapa1.idiomas ?? []).includes(i)} name="idiomas" type="checkbox" value={i} />
                    <Check aria-hidden="true" className="hidden h-3.5 w-3.5 peer-checked:block" strokeWidth={3} />
                    {i}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <Campo rotulo={t("O que a Lexia já sabe da cliente")}>
            <textarea
              className="ds-campo min-h-36 py-2.5 leading-relaxed"
              defaultValue={etapa1.notas ?? ""}
              name="notas"
              placeholder={t("Anotações da reunião de venda: o que ela mais quer vender, como atende hoje, o que pediu para o agente nunca fazer.")}
            />
          </Campo>

          <Campo ajuda={t("(bio, posts, avaliações do Google)")} rotulo={t("Texto colado")}>
            <textarea
              className="ds-campo min-h-28 py-2.5 leading-relaxed"
              defaultValue={etapa1.texto_colado ?? ""}
              name="texto_colado"
              placeholder={t("O Instagram e o Google não deixam ler o perfil por fora. Cole aqui a bio, as legendas dos posts principais e o horário do Google.")}
            />
          </Campo>
        </fieldset>

        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="ds-titulo-3 text-foreground">{t("Tabela de preços e materiais")}</h2>
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--ds-borda)] px-4 py-6 text-center aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            aria-disabled={liberada}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!liberada) void enviarArquivos(e.dataTransfer.files);
            }}
          >
            <Upload aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("Arraste fotos, PDFs ou prints. Pode ser a foto da tabela na parede.")}</span>
            <span className="ds-botao ds-botao-secundario">{t("Escolher arquivos")}</span>
            <input accept={ACEITA} className="sr-only" disabled={liberada} multiple onChange={(e) => { void enviarArquivos(e.target.files); e.target.value = ""; }} type="file" />
          </label>
          {arquivos.length || enviando.length ? (
            <ul className="flex flex-col gap-1.5">
              {arquivos.map((a) => (
                <li className="flex min-w-0 items-center gap-2.5 text-sm" key={a.id}>
                  <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{a.nome}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span>
                  {a.lido ? <span className="ds-selo ds-selo-verde shrink-0">{t("Lido")}</span> : null}
                </li>
              ))}
              {enviando.map((n) => (
                <li className="flex min-w-0 items-center gap-2.5 text-sm text-muted-foreground" key={n}>
                  <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
                  <span className="min-w-0 flex-1 truncate">{n}</span>
                  <span className="shrink-0">{t("Enviando…")}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {erro ? (
          <p className="tela-aviso tela-aviso-perigo flex items-start gap-2.5" role="alert">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">{erro}</span>
          </p>
        ) : null}
        {!temChaveDeIa ? (
          <p className="tela-aviso tela-aviso-alerta" role="status">{t("Falta a chave da IA deste cliente em Conexões. Sem ela o rascunho não é gerado.")}</p>
        ) : null}

        {!liberada ? (
          <div className="flex flex-wrap items-center gap-3">
            <button className="ds-botao ds-botao-primario" disabled={gerando || salvando || !temChaveDeIa || enviando.length > 0} onClick={() => void gerar()} type="button">
              {gerando ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {gerando ? t("Lendo as fontes…") : temRascunho ? t("Gerar rascunho de novo") : t("Gerar rascunho")}
            </button>
            <button className="ds-botao ds-botao-secundario" disabled={gerando || salvando} type="submit">
              {salvando ? t("Salvando…") : t("Salvar")}
            </button>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {gerando ? t("Leva de 1 a 2 minutos. Pode deixar esta tela aberta.") : salvo.message ? salvo.message : t("Leva de 1 a 2 minutos. Dá para acrescentar materiais depois.")}
            </p>
          </div>
        ) : null}
      </form>

      <aside className="ds-cartao flex min-w-0 flex-col gap-5 p-5 sm:p-6">
        <h2 className="ds-titulo-3 text-foreground">{t("O que a IA encontrou")}</h2>
        {!temRascunho ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{t("Ainda não há rascunho. Preencha o que tiver, envie os materiais e clique em “Gerar rascunho”.")}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {(achados.fontes ?? []).map((f, i) => (
                <li className="flex min-w-0 items-start gap-2.5" key={`${f.titulo}-${i}`}>
                  {f.ok ? <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-acao)]" strokeWidth={2.5} /> : <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-alerta)]" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{f.titulo}</p>
                    <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{f.detalhe}</p>
                  </div>
                </li>
              ))}
            </ul>
            {achados.resumo ? <p className="text-sm leading-relaxed text-foreground">{achados.resumo}</p> : null}
            {numeros ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="min-w-0">
                  <dt className="text-[0.8125rem] text-muted-foreground">{t("Informações do negócio")}</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                    {numeros.raizPreenchidos} <span className="text-sm font-normal text-muted-foreground">{t("de {total}", { total: numeros.raizTotal })}</span>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[0.8125rem] text-muted-foreground">{t("Serviços encontrados")}</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{numeros.servicos}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <div className="ds-barra" role="presentation">
                    <span style={{ width: `${numeros.raizTotal ? Math.round((numeros.raizPreenchidos / numeros.raizTotal) * 100) : 0}%` }} />
                  </div>
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
                    {t("Com preço: {preco} · com duração: {duracao} · perguntas frequentes: {faqs} · profissionais: {profissionais} · promoções: {promocoes}", { preco: numeros.servicosComPreco, duracao: numeros.servicosComDuracao, faqs: numeros.faqs, profissionais: numeros.profissionais, promocoes: numeros.promocoes })}
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">{t("A cliente só confirma o que está aqui. O que falta, a conversa pergunta.")}</p>
                </div>
              </dl>
            ) : null}

            <details className="group min-w-0">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ds-acao)]">{t("Ver o rascunho completo")}</summary>
              <div className="mt-3 flex max-h-[32rem] flex-col gap-5 overflow-y-auto rounded-xl border border-[var(--ds-borda)] p-4">
                {secoes.map((s) => (
                  <section className="min-w-0" key={s}>
                    <h3 className="ds-sobretitulo">{s}</h3>
                    <dl className="mt-2 flex flex-col gap-2">
                      {raiz.filter((l) => l.secao === s).map((l) => (
                        <div className="min-w-0" key={l.chave}>
                          <dt className="text-[0.8125rem] text-muted-foreground">{l.pergunta}</dt>
                          <dd className="break-words text-sm text-foreground">{mostrar(l.valor)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
                {Object.keys(GRUPO).map((g) => {
                  const doGrupo = [...itens.values()].filter((ls) => ls[0].grupo === g);
                  if (!doGrupo.length) return null;
                  return (
                    <section className="min-w-0" key={g}>
                      <h3 className="ds-sobretitulo">{GRUPO[g]} · {doGrupo.length}</h3>
                      <ul className="mt-2 flex flex-col gap-3">
                        {doGrupo.map((ls) => {
                          const titulo = ls.find((l) => l.chave === NOME[g]);
                          return (
                            <li className="min-w-0" key={ls[0].itemId}>
                              <p className="break-words text-sm font-medium text-foreground">{mostrar(titulo?.valor ?? "")}</p>
                              {ls.filter((l) => l !== titulo).map((l) => (
                                <p className="break-words text-[0.8125rem] leading-relaxed text-muted-foreground" key={l.chave}>
                                  {l.pergunta}: <span className="text-foreground">{mostrar(l.valor)}</span>
                                </p>
                              ))}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </details>

            {liberada ? (
              <p className="ds-selo ds-selo-verde self-start">{t("Conversa liberada para a cliente")}</p>
            ) : (
              <button
                className="ds-botao ds-botao-primario self-start"
                disabled={liberando || gerando}
                onClick={() => iniciarLiberacao(async () => { const r = await liberar(); if (r.type === "error") setErro(r.message); router.refresh(); })}
                type="button"
              >
                {t("Liberar a conversa para a cliente")}
              </button>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
