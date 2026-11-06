import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ArrowLeft, Coins, ListOrdered, Sparkles, Timer } from "lucide-react";

import { CartaoMetrica } from "@/app/components/cartoes";
import { Card, CardTitulo } from "@/app/components/painel-ui";
import { CabecalhoTela, GradeMetricas } from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  descreverEstado,
  formatarCusto,
  formatarDuracao,
  legivel,
  textosDoRedator,
  type TurnoCompleto,
} from "@/lib/turnos/formatar";

/**
 * O passo a passo de um turno, de cima para baixo na ordem em que se lê uma
 * queixa: o que o cliente disse, o que a agente respondeu, porque é que
 * respondeu isso (assunto, briefing, Redator, travas) e, no fim, o detalhe
 * técnico de cada passo para quando o resumo não chega.
 */

type TurnoPageProps = { params: Promise<{ id: string }> };

function Bloco({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[color-mix(in_oklab,var(--ds-texto)_4%,transparent)] p-3 font-mono text-xs text-foreground">
      {children}
    </pre>
  );
}

function Linha({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-[var(--ds-linha)] px-5 py-3 text-sm sm:grid-cols-[180px_1fr]">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

function Baloes({ textos }: { textos: string[] }) {
  if (!textos.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-2">
      {textos.map((texto, i) => (
        <div className="w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--ds-acao-fundo)] px-3.5 py-2" key={i}>
          {texto}
        </div>
      ))}
    </div>
  );
}

export default async function TurnoPage({ params }: TurnoPageProps) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const duracao = (ms: number | null | undefined) => formatarDuracao(ms, locale);

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data, error } = await createAdminClient()
    .from("lexia_turnos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(t("Não foi possível buscar o turno."));
  if (!data) notFound();

  const turno = data as TurnoCompleto;
  const fuso = getClientTimezone(turno.agente);
  const r = turno.resumo ?? {};
  const enviados = Array.isArray(turno.mensagens) ? (turno.mensagens as unknown[]).map(String) : [];
  const redator = textosDoRedator(r.texto_do_redator);
  const ia = turno.ia ?? [];
  const ferramentas = turno.ferramentas ?? [];
  const passos = turno.passos ?? [];
  const quando = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: fuso }).format(
    new Date(turno.criado_em),
  );

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        acoes={
          <Link
            className="ds-botao ds-botao-secundario ds-botao-p"
            href={
              turno.identificador_conversa
                ? `/admin/turnos?conversa=${encodeURIComponent(turno.identificador_conversa)}`
                : "/admin/turnos"
            }
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            {turno.identificador_conversa ? t("Outros turnos desta conversa") : t("Voltar aos turnos")}
          </Link>
        }
        destaque={descreverEstado(turno.estado, t)}
        resto={`· ${quando}`}
        sobretitulo={`${t("Controle do agente")} · ${t("Passo a passo do turno")}`}
      />

      <GradeMetricas>
        <CartaoMetrica
          cor="var(--ds-acao)"
          dica={t("Do momento em que a mensagem chegou até a resposta ficar pronta, incluindo a espera por mais mensagens do cliente.")}
          icone={<Timer aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("Duração")}
          valor={duracao(turno.duracao_ms)}
        />
        <CartaoMetrica
          cor="var(--ds-ouro)"
          dica={
            turno.custo_sem_preco?.length
              ? t("Não inclui {modelos}: sem preço na tabela.", { modelos: turno.custo_sem_preco.join(", ") })
              : t("Custo das chamadas de IA deste turno.")
          }
          icone={<Coins aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("Custo de IA")}
          valor={formatarCusto(turno.custo_usd, locale, t)}
        />
        <CartaoMetrica
          cor="var(--ds-info)"
          icone={<Sparkles aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("IA e consultas")}
          valor={String(ia.length + ferramentas.length)}
        />
        <CartaoMetrica
          cor="var(--ds-destaque)"
          icone={<ListOrdered aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("Passos")}
          valor={String(passos.length)}
        />
      </GradeMetricas>

      <Card>
        <CardTitulo>{t("A conversa")}</CardTitulo>
        <Linha label={t("Cliente disse")}>
          <div className="whitespace-pre-wrap">{turno.mensagem_cliente || "—"}</div>
        </Linha>
        <Linha label={turno.modo === "sombra" ? t("Agente em código respondeu (não enviado)") : t("Agente respondeu")}>
          <Baloes textos={enviados} />
        </Linha>
        {turno.modo === "sombra" ? (
          <Linha label={t("O n8n respondeu (enviado ao cliente)")}>
            {r.n8n_respondeu === undefined ? (
              <span className="text-muted-foreground">{t("não verificado")}</span>
            ) : (
              <Baloes textos={r.n8n_respondeu} />
            )}
          </Linha>
        ) : null}
        {turno.estado !== "respondido" ? (
          <Linha label={t("Por que não respondeu")}>
            <span className={turno.estado === "erro" ? "text-danger" : ""}>{turno.erro || turno.motivo || "—"}</span>
          </Linha>
        ) : null}
        {turno.handoff?.necessario ? (
          <Linha label={t("Chamou a equipe")}>
            {t("Prioridade {prioridade}: {motivo}", {
              motivo: turno.handoff.motivo ?? "",
              prioridade: turno.handoff.prioridade ?? t("normal"),
            })}
            {turno.handoff.resumo_para_equipa ? (
              <div className="mt-1 text-muted-foreground">{turno.handoff.resumo_para_equipa}</div>
            ) : null}
          </Linha>
        ) : null}
        <Linha label={t("Conversa · canal · modo")}>
          {turno.identificador_conversa ?? "—"} · {turno.canal ?? "?"} · {turno.modo}
        </Linha>
      </Card>

      <Card>
        <CardTitulo dica={t("O que a agente entendeu e decidiu antes de escrever. A trava é uma regra em código que corta ou troca a resposta, por exemplo um preço que não está no catálogo.")}>
          {t("Como ela decidiu")}
        </CardTitulo>
        <Linha label={t("Assunto entendido")}>
          {r.assunto ?? "—"}
          {r.trava_roteamento ? (
            <span className="text-muted-foreground"> {t("(forçado pela regra: {regra})", { regra: r.trava_roteamento })}</span>
          ) : null}
        </Linha>
        <Linha label={t("Idioma")}>{r.idioma ?? "—"}</Linha>
        <Linha label={t("Agentes que pensaram")}>{r.agentes?.length ? r.agentes.join(" → ") : "—"}</Linha>
        {r.briefing ? (
          <>
            <Linha label={t("Objetivo do turno")}>{r.briefing.objectivo || "—"}</Linha>
            <Linha label={t("Fatos que podia usar")}>
              {r.briefing.factos?.length ? <Bloco>{legivel(r.briefing.factos)}</Bloco> : t("nenhum")}
            </Linha>
            <Linha label={t("Pergunta a fazer")}>{r.briefing.pergunta_a_fazer || "—"}</Linha>
            {r.briefing.notas_para_redator?.length ? (
              <Linha label={t("Notas ao Redator")}>
                <Bloco>{legivel(r.briefing.notas_para_redator)}</Bloco>
              </Linha>
            ) : null}
          </>
        ) : null}
        <Linha label={t("O Redator escreveu")}>
          <Baloes textos={redator} />
        </Linha>
        <Linha label={t("Travas que agiram")}>
          {r.travas?.length ? (
            <ul className="list-disc pl-5 text-danger">
              {r.travas.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            t("nenhuma")
          )}
        </Linha>
      </Card>

      <Card>
        <CardTitulo dica={t("Cada vez que um modelo de IA foi chamado, e cada consulta que ele fez (catálogo, agenda, promoções).")}>
          {t("IA e consultas")}
        </CardTitulo>
        {ia.map((e, i) => (
          <details className="border-t border-border px-5 py-3 text-sm" key={`ia-${i}`}>
            <summary className="cursor-pointer">
              <span className="font-medium">{e.agente}</span>
              <span className="text-muted-foreground">
                {" "}
                · {e.modelo} · {duracao(e.ms)} ·{" "}
                {t("{lidos} tokens lidos, {escritos} escritos", {
                  escritos: e.tokens.saida.toLocaleString(locale),
                  lidos: (e.tokens.entrada + e.tokens.cache + e.tokens.gravado).toLocaleString(locale),
                })}
              </span>
            </summary>
            <div className="mt-2">
              <Bloco>{legivel(e.saida)}</Bloco>
            </div>
          </details>
        ))}
        {ferramentas.map((f, i) => (
          <details className="border-t border-border px-5 py-3 text-sm" key={`f-${i}`}>
            <summary className="cursor-pointer">
              <span className="font-medium">{f.nome}</span>
              <span className="text-muted-foreground">
                {" "}
                · {t("pedida por {agente}", { agente: f.agente })} · {duracao(f.ms)}
              </span>
              {f.erro ? <span className="text-danger"> · {t("erro")}</span> : null}
            </summary>
            <div className="mt-2 grid gap-2">
              <div className="text-xs text-muted-foreground">{t("Pediu")}</div>
              <Bloco>{legivel(f.entrada)}</Bloco>
              <div className="text-xs text-muted-foreground">{t("Recebeu")}</div>
              <Bloco>{f.erro ? f.erro : legivel(f.saida)}</Bloco>
            </div>
          </details>
        ))}
        {!ia.length && !ferramentas.length ? (
          <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
            {t("Nenhuma IA rodou neste turno.")}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardTitulo dica={t("A saída de cada passo, na ordem em que rodou. É o mesmo que a tela de execuções do n8n mostra. O histórico da conversa não é repetido aqui.")}>
          {t("Detalhe técnico ({n} passos)", { n: passos.length })}
        </CardTitulo>
        {passos.map((p, i) => (
          <details className="border-t border-border px-5 py-2 text-sm" key={i}>
            <summary className="cursor-pointer">
              <span className="text-muted-foreground">{p.workflow} · </span>
              {p.no}
              <span className="text-muted-foreground"> · {duracao(p.ms)}</span>
            </summary>
            <div className="mt-2">
              <Bloco>{legivel(p.saida)}</Bloco>
            </div>
          </details>
        ))}
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {t("Versão do agente: {versao}", { versao: turno.versao ?? "—" })}
          {turno.run_id ? ` · ${t("teste {id}", { id: turno.run_id })}` : ""}
        </p>
      </Card>
    </section>
  );
}
