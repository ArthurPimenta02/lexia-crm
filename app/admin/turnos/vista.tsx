import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardTitulo, GrupoMetricas, PaginaCabecalho } from "@/app/components/painel-ui";
import { Fluxo, Legenda, OQueFez } from "@/app/admin/turnos/fluxo";
import { formatDateInTimezone, getClientTimezone } from "@/lib/clientes/timezone";
import { descreverEstado, formatarCusto, formatarDuracao, type TurnoCompleto } from "@/lib/turnos/formatar";
import { acoesVisiveis, haQuanto, montarFluxo } from "@/lib/turnos/mapa";
import type { ResumoConversa, TurnoNaConversa } from "@/lib/turnos/controle";

/**
 * O desenho do Controle do agente, sem acesso a dados: a página busca e passa
 * tudo por props. Separado para se poder ver com conversas reais sem login.
 */

const NOME_MODO: Record<string, string> = { producao: "Produção", sombra: "Sombra", teste: "Área de testes" };

const ROTA: Record<string, string> = {
  atendimento: "Atendimento",
  agendamento: "Agendamento",
  indefinido: "Sem assunto claro",
  followup: "Follow-up",
  lembrete: "Lembrete",
};

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export type ControleVistaProps = {
  filtros: ReactNode;
  filtroAtual: { cliente: string; modo: string; so: string };
  recentes: TurnoNaConversa[];
  resumos: ResumoConversa[];
  conversaId: string;
  daConversa: TurnoNaConversa[];
  turnoId: string | undefined;
  turno: TurnoCompleto | null;
  nomes: Record<string, string>;
  ultimaProducao: string | null;
  ultimaSombra: string | null;
};

export function ControleVista({
  filtros,
  filtroAtual: { cliente, modo, so },
  recentes,
  resumos,
  conversaId,
  daConversa,
  turnoId,
  turno,
  nomes,
  ultimaProducao,
  ultimaSombra,
}: ControleVistaProps) {
  const fluxo = turno ? montarFluxo(turno) : null;
  const conversas24 = new Set(recentes.map((t) => t.identificador_conversa).filter(Boolean));
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (cliente) q.set("cliente", cliente);
    if (modo) q.set("modo", modo);
    if (so) q.set("so", so);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `/admin/turnos?${q.toString()}`;
  };
  const nomeDe = (id: string) => nomes[id] ?? id.replace(/^(whatsapp|instagram|messenger):/, "");
  const fusoDe = (t: { agente: string }) => getClientTimezone(t.agente);
  const hora = (t: { criado_em: string; agente: string }) =>
    formatDateInTimezone(t.criado_em, fusoDe(t), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const estadoAgente = (u: string | null, nome: string) => {
    return u ? `${nome}: última atividade ${haQuanto(u)}` : `${nome}: sem atividade`;
  };


  return (
    <section className="flex w-full min-w-0 flex-col gap-5">
      <PaginaCabecalho
        acoes={
          <div className="flex flex-col items-start gap-0.5 text-xs text-muted-foreground sm:items-end">
            <span>{estadoAgente(ultimaProducao, "Produção")}</span>
            <span>{estadoAgente(ultimaSombra, "Sombra")}</span>
          </div>
        }
        titulo="Controle do agente"
      />

      <GrupoMetricas
        itens={[
          { label: "Conversas (24 h)", valor: conversas24.size },
          { label: "Respostas (24 h)", valor: recentes.filter((t) => t.estado === "respondido").length },
          {
            dica: "Mensagens a que o agente decidiu não responder: contacto bloqueado, conversa pausada, Samuel já respondeu, follow-up fora de horário.",
            label: "Não respondeu (24 h)",
            valor: recentes.filter((t) => t.estado === "parado").length,
          },
          { label: "Erros (24 h)", valor: recentes.filter((t) => t.estado === "erro").length },
          {
            dica: "Custo de IA das últimas 24 h. Modelos sem preço na tabela não entram.",
            label: "Custo de IA (24 h)",
            valor: formatarCusto(recentes.reduce((s, t) => s + Number(t.custo_usd ?? 0), 0)),
          },
        ]}
      />

      {filtros}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Conversas */}
        <Card className="min-w-0 self-start overflow-hidden">
          <CardTitulo>Conversas</CardTitulo>
          {resumos.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-muted-foreground">Nenhuma conversa com estes filtros.</p>
          ) : (
            <ul className="max-h-[75vh] overflow-y-auto">
              {resumos.map((r) => {
                const ativa = r.id === conversaId;
                const ultimaFala = textos(r.ultimo.mensagens).at(-1) ?? r.ultimo.mensagem_cliente ?? r.ultimo.motivo ?? "";
                return (
                  <li key={r.id}>
                    <Link
                      className={`block border-t border-border px-4 py-2.5 hover:bg-muted ${ativa ? "bg-primary-soft" : ""}`}
                      href={href({ conversa: r.id })}
                      scroll={false}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{nomeDe(r.id)}</span>
                        {r.erros ? <span aria-label="com erro" className="size-2 rounded-full bg-danger" /> : null}
                        <span className="shrink-0 text-[11px] text-muted-foreground">{haQuanto(r.ultimo.criado_em)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.ultimo.canal ?? "?"} · {r.modos.map((m) => NOME_MODO[m] ?? m).join(", ")}
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{ultimaFala}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* A conversa */}
        <Card className="min-w-0 self-start">
          <CardTitulo dica="Cada bloco é uma vez em que a Carol recebeu mensagem e decidiu o que fazer. Clique num bloco para ver à direita o caminho que ela fez.">
            {conversaId ? nomeDe(conversaId) : "Conversa"}
          </CardTitulo>
          <div className="flex max-h-[75vh] flex-col gap-2 overflow-y-auto px-3 pb-4">
            {daConversa.length === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">Escolha uma conversa.</p>
            ) : null}
            {daConversa.map((t) => {
              const ativo = t.id === turnoId;
              const enviados = textos(t.mensagens);
              const n8n = textos(t.n8n);
              return (
                <Link
                  className={`block rounded-xl border p-2.5 transition-colors ${
                    ativo ? "border-foreground bg-surface" : "border-transparent hover:border-border hover:bg-muted/50"
                  }`}
                  href={href({ conversa: conversaId, turno: t.id })}
                  key={t.id}
                  scroll={false}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span>{hora(t)}</span>
                    <span>· {NOME_MODO[t.modo] ?? t.modo}</span>
                    {t.rota ? <span>· {ROTA[t.rota] ?? t.rota}</span> : null}
                  </div>
                  {t.mensagem_cliente ? (
                    <div className="mb-1.5 w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-muted px-3 py-1.5 text-sm text-foreground">
                      {t.mensagem_cliente}
                    </div>
                  ) : t.rota === "followup" ? (
                    <div className="mb-1.5 text-xs text-muted-foreground">Follow-up automático (o cliente não respondeu)</div>
                  ) : null}
                  {enviados.length ? (
                    <div className="flex flex-col items-end gap-1">
                      {enviados.map((m, i) => (
                        <div
                          className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary-soft px-3 py-1.5 text-sm text-foreground"
                          key={i}
                        >
                          {m}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`text-xs ${t.estado === "erro" ? "text-danger" : "text-warning"}`}>
                      {descreverEstado(t.estado)}
                      {t.erro || t.motivo ? `: ${t.erro || t.motivo}` : ""}
                    </div>
                  )}
                  {t.modo === "sombra" && n8n.length ? (
                    <div className="mt-1.5 flex flex-col items-end gap-1">
                      <span className="text-[11px] text-muted-foreground">o n8n enviou ao cliente:</span>
                      {n8n.map((m, i) => (
                        <div
                          className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-dashed border-border-strong px-3 py-1.5 text-xs text-muted-foreground"
                          key={i}
                        >
                          {m}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </Card>

        {/* O caminho */}
        <Card className="min-w-0 self-start">
          <CardTitulo dica="As etapas por onde a Carol passou para esta resposta. Abra 'Ver os passos' numa etapa para ver o que cada nó devolveu, como no n8n.">
            Como a Carol montou esta resposta
          </CardTitulo>
          {!turno ? (
            <p className="px-5 pb-4 text-sm text-muted-foreground">Escolha uma resposta na conversa.</p>
          ) : (
            <div className="flex flex-col gap-4 px-5 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-foreground">
                  <span className={turno.estado === "erro" ? "text-danger" : turno.estado === "parado" ? "text-warning" : ""}>
                    {descreverEstado(turno.estado)}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {hora(turno)} · {NOME_MODO[turno.modo] ?? turno.modo} · {formatarDuracao(turno.duracao_ms)} ·{" "}
                    {formatarCusto(turno.custo_usd)}
                  </span>
                </p>
                <Legenda />
              </div>

              {fluxo ? (
                <Fluxo linhas={fluxo} />
              ) : (
                <p className="rounded-xl border border-warning px-3 py-2 text-sm text-foreground">
                  {turno.erro || turno.motivo || "Este turno não guardou passos."}
                  {/^contacto bloqueado/.test(turno.motivo ?? "")
                    ? " Por privacidade, de contactos bloqueados não se guarda nada."
                    : ""}
                </p>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">O que ela fez</p>
                <OQueFez acoes={acoesVisiveis(turno.resumo?.acoes)} sombra={turno.modo === "sombra"} />
              </div>

              <Link
                className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                href={`/admin/turnos/${turno.id}`}
              >
                Abrir o detalhe técnico completo →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
