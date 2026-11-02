import Link from "next/link";
import type { ReactNode } from "react";

import { GrupoMetricas, PaginaCabecalho } from "@/app/components/painel-ui";
import { Fluxo, OQueFez } from "@/app/admin/turnos/fluxo";
import { formatDateInTimezone, getClientTimezone } from "@/lib/clientes/timezone";
import { descreverEstado, formatarCusto, formatarDuracao, type TurnoCompleto } from "@/lib/turnos/formatar";
import { acoesVisiveis, ativoHa, haQuanto, montarFluxo } from "@/lib/turnos/mapa";
import type { ResumoConversa, TurnoNaConversa } from "@/lib/turnos/controle";

/**
 * O desenho do Controle do agente, sem acesso a dados: a página busca e passa
 * tudo por props (assim também se vê com conversas reais sem login).
 *
 * Um painel com três colunas: conversas · a conversa como no WhatsApp · o
 * caminho da resposta escolhida. O que o n8n respondeu (sombra) não entra no
 * chat: fica numa secção fechada da resposta, para comparar quando se quiser.
 */

const NOME_MODO: Record<string, string> = { producao: "Produção", sombra: "Sombra", teste: "Área de testes" };

const ROTA: Record<string, string> = {
  atendimento: "Atendimento",
  agendamento: "Agendamento",
  indefinido: "Sem assunto claro",
  followup: "Follow-up",
  lembrete: "Lembrete",
};

const CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger" };

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

function Estado({ ultima, nome }: { ultima: string | null; nome: string }) {
  const ativo = ativoHa(ultima);
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`size-1.5 rounded-full ${ativo ? "bg-positive" : "bg-border-strong"}`} />
      <span className="text-foreground">{nome}</span>
      <span>{ultima ? haQuanto(ultima) : "sem atividade"}</span>
    </span>
  );
}

function CabecaColuna({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-2 border-b border-border px-4">
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{children}</h2>
      {extra}
    </div>
  );
}

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
  const hora = (t: { criado_em: string; agente: string }) =>
    formatDateInTimezone(t.criado_em, getClientTimezone(t.agente), {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const conversaAtual = resumos.find((r) => r.id === conversaId);
  const n8n = turno?.modo === "sombra" ? textos(turno.resumo?.n8n_respondeu) : [];

  return (
    <section className="flex w-full min-w-0 flex-col gap-5">
      <PaginaCabecalho
        acoes={
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Estado nome="Produção" ultima={ultimaProducao} />
            <Estado nome="Sombra" ultima={ultimaSombra} />
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

      <div className="@container min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,19,26,0.04)]">
      <div className="grid min-w-0 @min-[720px]:grid-cols-[220px_minmax(0,1fr)] @min-[1040px]:grid-cols-[236px_minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Conversas */}
        <div className="flex min-w-0 flex-col">
          <CabecaColuna extra={<span className="text-xs text-muted-foreground tabular-nums">{resumos.length}</span>}>
            Conversas
          </CabecaColuna>
          {resumos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma conversa com estes filtros.</p>
          ) : (
            <ul className="max-h-[72vh] overflow-y-auto py-1">
              {resumos.map((r) => {
                const ativa = r.id === conversaId;
                const ultimaFala =
                  textos(r.ultimo.mensagens).at(-1) ?? r.ultimo.mensagem_cliente ?? r.ultimo.motivo ?? "";
                return (
                  <li key={r.id}>
                    <Link
                      aria-current={ativa ? "true" : undefined}
                      className={`mx-1.5 block rounded-xl px-3 py-2.5 transition-colors duration-150 ${
                        ativa ? "bg-primary-soft" : "hover:bg-muted"
                      }`}
                      href={href({ conversa: r.id })}
                      scroll={false}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{nomeDe(r.id)}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {haQuanto(r.ultimo.criado_em)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {r.erros ? <span aria-label="com erro" className="size-1.5 rounded-full bg-danger" /> : null}
                        <span className="min-w-0 truncate">{ultimaFala}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* A conversa */}
        <div className="flex min-w-0 flex-col border-t border-border @min-[720px]:border-t-0 @min-[720px]:border-l">
          <CabecaColuna
            extra={
              conversaAtual ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {CANAL[conversaAtual.ultimo.canal ?? ""] ?? conversaAtual.ultimo.canal} ·{" "}
                  {conversaAtual.modos.map((m) => NOME_MODO[m] ?? m).join(", ")}
                </span>
              ) : null
            }
          >
            {conversaId ? nomeDe(conversaId) : "Conversa"}
          </CabecaColuna>
          <div className="flex max-h-[72vh] flex-col gap-5 overflow-y-auto bg-background/60 px-4 py-5">
            {daConversa.length === 0 ? <p className="text-sm text-muted-foreground">Escolha uma conversa.</p> : null}
            {daConversa.map((t) => {
              const ativo = t.id === turnoId;
              const enviados = textos(t.mensagens);
              return (
                <div className="flex flex-col gap-1.5" key={t.id}>
                  <p className="text-center text-[11px] text-muted-foreground tabular-nums">{hora(t)}</p>
                  {t.mensagem_cliente ? (
                    <p className="max-w-[80%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2 text-sm text-foreground">
                      {t.mensagem_cliente}
                    </p>
                  ) : null}
                  <Link
                    aria-current={ativo ? "true" : undefined}
                    className="group flex max-w-[80%] flex-col items-end gap-1 self-end rounded-2xl"
                    href={href({ conversa: conversaId, turno: t.id })}
                    scroll={false}
                  >
                    {enviados.length ? (
                      enviados.map((m, i) => (
                        <span
                          className={`whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground transition-shadow duration-150 ${
                            ativo
                              ? "ring-2 ring-positive"
                              : "group-hover:ring-2 group-hover:ring-border-strong"
                          }`}
                          key={i}
                        >
                          {m}
                        </span>
                      ))
                    ) : (
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          t.estado === "erro" ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground"
                        } ${ativo ? "ring-2 ring-positive" : ""}`}
                      >
                        {t.rota === "followup" ? "Follow-up: " : ""}
                        {descreverEstado(t.estado).toLowerCase()}
                        {t.erro || t.motivo ? ` · ${t.erro || t.motivo}` : ""}
                      </span>
                    )}
                    <span
                      className={`text-[11px] ${ativo ? "font-medium text-positive" : "text-muted-foreground"} ${
                        enviados.length ? "" : "hidden"
                      }`}
                    >
                      {t.rota === "followup" ? "Follow-up automático" : (ROTA[t.rota ?? ""] ?? "Carol")}
                      {ativo ? " · aberta ao lado →" : ""}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {/* O caminho */}
        <div className="flex min-w-0 flex-col border-t border-border @min-[720px]:col-span-2 @min-[1040px]:col-span-1 @min-[1040px]:border-t-0 @min-[1040px]:border-l">
          <CabecaColuna
            extra={
              turno ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatarDuracao(turno.duracao_ms)} · {formatarCusto(turno.custo_usd)}
                </span>
              ) : null
            }
          >
            Como a Carol chegou a esta resposta
          </CabecaColuna>
          {!turno ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Clique numa resposta da Carol.</p>
          ) : (
            <div className="flex max-h-[72vh] flex-col gap-6 overflow-y-auto px-5 py-5">
              {fluxo ? (
                <Fluxo linhas={fluxo} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {turno.erro || turno.motivo || "Este turno não guardou passos."}
                  {/^contacto bloqueado/.test(turno.motivo ?? "")
                    ? " Por privacidade, de contactos bloqueados não se guarda nada."
                    : ""}
                </p>
              )}

              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {turno.modo === "sombra" ? "O que ela teria feito" : "O que ela fez"}
                </h3>
                <OQueFez acoes={acoesVisiveis(turno.resumo?.acoes)} />
                {turno.modo === "sombra" ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Sombra: nada disto saiu de verdade. Quem respondeu ao cliente foi o n8n.
                  </p>
                ) : null}
              </div>

              {turno.modo === "sombra" ? (
                <details className="border-t border-border pt-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
                    Comparar com o n8n
                    <span className="ml-2 font-normal text-muted-foreground">
                      {n8n.length ? `${n8n.length} ${n8n.length === 1 ? "balão enviado" : "balões enviados"}` : "não verificado"}
                    </span>
                  </summary>
                  <div className="mt-3 flex flex-col items-end gap-1">
                    {n8n.map((m, i) => (
                      <p
                        className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm text-foreground"
                        key={i}
                      >
                        {m}
                      </p>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    O registo do n8n pode trazer balões do turno anterior se as mensagens se cruzaram.
                  </p>
                </details>
              ) : null}

              <Link
                className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                href={`/admin/turnos/${turno.id}`}
              >
                Detalhe técnico completo
              </Link>
            </div>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
