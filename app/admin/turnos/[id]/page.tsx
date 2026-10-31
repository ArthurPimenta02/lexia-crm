import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  Card,
  CardTitulo,
  GrupoMetricas,
  PaginaCabecalho,
} from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  formatDateInTimezone,
  getClientTimezone,
} from "@/lib/clientes/timezone";
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
    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 font-mono text-xs text-foreground">
      {children}
    </pre>
  );
}

function Linha({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border px-5 py-3 text-sm sm:grid-cols-[180px_1fr]">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

function Baloes({ textos }: { textos: string[] }) {
  if (!textos.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-2">
      {textos.map((t, i) => (
        <div className="w-fit max-w-full whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2" key={i}>
          {t}
        </div>
      ))}
    </div>
  );
}

export default async function TurnoPage({ params }: TurnoPageProps) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data, error } = await createAdminClient()
    .from("lexia_turnos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Não foi possível buscar o turno.");
  if (!data) notFound();

  const t = data as TurnoCompleto;
  const fuso = getClientTimezone(t.agente);
  const r = t.resumo ?? {};
  const enviados = Array.isArray(t.mensagens) ? (t.mensagens as unknown[]).map(String) : [];
  const redator = textosDoRedator(r.texto_do_redator);
  const ia = t.ia ?? [];
  const ferramentas = t.ferramentas ?? [];
  const passos = t.passos ?? [];

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <PaginaCabecalho
        acoes={
          <Link
            className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
            href={
              t.identificador_conversa
                ? `/admin/turnos?conversa=${encodeURIComponent(t.identificador_conversa)}`
                : "/admin/turnos"
            }
          >
            {t.identificador_conversa ? "Outros turnos desta conversa" : "Voltar aos turnos"}
          </Link>
        }
        titulo="Passo a passo do turno"
      />

      <GrupoMetricas
        itens={[
          { label: "Resultado", valor: descreverEstado(t.estado) },
          { label: "Quando", valor: formatDateInTimezone(t.criado_em, fuso) },
          {
            dica: "Do momento em que a mensagem chegou até a resposta estar pronta, incluindo a espera por mais mensagens do cliente.",
            label: "Duração",
            valor: formatarDuracao(t.duracao_ms),
          },
          {
            dica: t.custo_sem_preco?.length
              ? `Não inclui ${t.custo_sem_preco.join(", ")}: sem preço na tabela.`
              : "Custo das chamadas de IA deste turno.",
            label: "Custo de IA",
            valor: formatarCusto(t.custo_usd),
          },
        ]}
      />

      <Card>
        <CardTitulo>A conversa</CardTitulo>
        <Linha label="Cliente disse">
          <div className="whitespace-pre-wrap">{t.mensagem_cliente || "—"}</div>
        </Linha>
        <Linha label={t.modo === "sombra" ? "Agente em código respondeu (não enviado)" : "Agente respondeu"}>
          <Baloes textos={enviados} />
        </Linha>
        {t.modo === "sombra" ? (
          <Linha label="O n8n respondeu (enviado ao cliente)">
            {r.n8n_respondeu === undefined ? (
              <span className="text-muted-foreground">não verificado</span>
            ) : (
              <Baloes textos={r.n8n_respondeu} />
            )}
          </Linha>
        ) : null}
        {t.estado !== "respondido" ? (
          <Linha label="Porque não respondeu">
            <span className={t.estado === "erro" ? "text-danger" : ""}>{t.erro || t.motivo || "—"}</span>
          </Linha>
        ) : null}
        {t.handoff?.necessario ? (
          <Linha label="Chamou a equipe">
            Prioridade {t.handoff.prioridade ?? "normal"}: {t.handoff.motivo}
            {t.handoff.resumo_para_equipa ? (
              <div className="mt-1 text-muted-foreground">{t.handoff.resumo_para_equipa}</div>
            ) : null}
          </Linha>
        ) : null}
        <Linha label="Conversa · canal · modo">
          {t.identificador_conversa ?? "—"} · {t.canal ?? "?"} · {t.modo}
        </Linha>
      </Card>

      <Card>
        <CardTitulo dica="O que a agente entendeu e decidiu antes de escrever. A trava é uma regra em código que corta ou troca a resposta, por exemplo um preço que não está no catálogo.">
          Como ela decidiu
        </CardTitulo>
        <Linha label="Assunto entendido">
          {r.assunto ?? "—"}
          {r.trava_roteamento ? (
            <span className="text-muted-foreground"> (forçado pela regra: {r.trava_roteamento})</span>
          ) : null}
        </Linha>
        <Linha label="Idioma">{r.idioma ?? "—"}</Linha>
        <Linha label="Agentes que pensaram">{r.agentes?.length ? r.agentes.join(" → ") : "—"}</Linha>
        {r.briefing ? (
          <>
            <Linha label="Objetivo do turno">{r.briefing.objectivo || "—"}</Linha>
            <Linha label="Factos que podia usar">
              {r.briefing.factos?.length ? <Bloco>{legivel(r.briefing.factos)}</Bloco> : "nenhum"}
            </Linha>
            <Linha label="Pergunta a fazer">{r.briefing.pergunta_a_fazer || "—"}</Linha>
            {r.briefing.notas_para_redator?.length ? (
              <Linha label="Notas ao Redator">
                <Bloco>{legivel(r.briefing.notas_para_redator)}</Bloco>
              </Linha>
            ) : null}
          </>
        ) : null}
        <Linha label="O Redator escreveu">
          <Baloes textos={redator} />
        </Linha>
        <Linha label="Travas que agiram">
          {r.travas?.length ? (
            <ul className="list-disc pl-5 text-danger">
              {r.travas.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            "nenhuma"
          )}
        </Linha>
      </Card>

      <Card>
        <CardTitulo dica="Cada vez que um modelo de IA foi chamado, e cada consulta que ele fez (catálogo, agenda, promoções).">
          IA e consultas
        </CardTitulo>
        {ia.map((e, i) => (
          <details className="border-t border-border px-5 py-3 text-sm" key={`ia-${i}`}>
            <summary className="cursor-pointer">
              <span className="font-medium">{e.agente}</span>
              <span className="text-muted-foreground">
                {" "}
                · {e.modelo} · {formatarDuracao(e.ms)} · {e.tokens.entrada + e.tokens.cache + e.tokens.gravado} tokens lidos, {e.tokens.saida} escritos
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
              <span className="text-muted-foreground"> · pedida por {f.agente} · {formatarDuracao(f.ms)}</span>
              {f.erro ? <span className="text-danger"> · erro</span> : null}
            </summary>
            <div className="mt-2 grid gap-2">
              <div className="text-xs text-muted-foreground">Pediu</div>
              <Bloco>{legivel(f.entrada)}</Bloco>
              <div className="text-xs text-muted-foreground">Recebeu</div>
              <Bloco>{f.erro ? f.erro : legivel(f.saida)}</Bloco>
            </div>
          </details>
        ))}
        {!ia.length && !ferramentas.length ? (
          <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
            Nenhuma IA correu neste turno.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardTitulo dica="A saída de cada passo, na ordem em que correu. É o mesmo que a tela de execuções do n8n mostra. O histórico da conversa não é repetido aqui.">
          Detalhe técnico ({passos.length} passos)
        </CardTitulo>
        {passos.map((p, i) => (
          <details className="border-t border-border px-5 py-2 text-sm" key={i}>
            <summary className="cursor-pointer">
              <span className="text-muted-foreground">{p.workflow} · </span>
              {p.no}
              <span className="text-muted-foreground"> · {formatarDuracao(p.ms)}</span>
            </summary>
            <div className="mt-2">
              <Bloco>{legivel(p.saida)}</Bloco>
            </div>
          </details>
        ))}
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Versão do agente: {t.versao ?? "—"}
          {t.run_id ? ` · teste ${t.run_id}` : ""}
        </p>
      </Card>
    </section>
  );
}
