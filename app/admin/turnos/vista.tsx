import Link from "next/link";
import type { ReactNode } from "react";

import { GrupoMetricas, PaginaCabecalho } from "@/app/components/painel-ui";
import { Fluxo, OQueFez } from "@/app/admin/turnos/fluxo";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
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

function Estado({ ultima, nome, t }: { ultima: string | null; nome: string; t: FuncaoT }) {
  const ativo = ativoHa(ultima);
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`size-1.5 rounded-full ${ativo ? "bg-positive" : "bg-border-strong"}`} />
      <span className="text-foreground">{nome}</span>
      <span>{ultima ? haQuanto(ultima, undefined, t) : t("sem atividade")}</span>
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

export async function ControleVista({
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
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const custo = (v: number | string | null | undefined) => formatarCusto(v, locale, t);
  const fluxo = turno ? montarFluxo(turno, t) : null;
  const conversas24 = new Set(recentes.map((x) => x.identificador_conversa).filter(Boolean));
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (cliente) q.set("cliente", cliente);
    if (modo) q.set("modo", modo);
    if (so) q.set("so", so);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `/admin/turnos?${q.toString()}`;
  };
  const nomeDe = (id: string) => nomes[id] ?? id.replace(/^(whatsapp|instagram|messenger):/, "");
  const hora = (x: { criado_em: string; agente: string }) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: getClientTimezone(x.agente),
    }).format(new Date(x.criado_em));
  const conversaAtual = resumos.find((r) => r.id === conversaId);
  const custo24 = recentes.reduce((s, x) => s + Number(x.custo_usd ?? 0), 0);
  const respondidas24 = recentes.filter((x) => x.estado === "respondido").length;
  const custoConversa = daConversa.reduce((s, x) => s + Number(x.custo_usd ?? 0), 0);
  const n8n = turno?.modo === "sombra" ? textos(turno.resumo?.n8n_respondeu) : [];

  return (
    <section className="flex w-full min-w-0 flex-col gap-5">
      <PaginaCabecalho
        acoes={
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Estado nome={t("Produção")} t={t} ultima={ultimaProducao} />
            <Estado nome={t("Sombra")} t={t} ultima={ultimaSombra} />
          </div>
        }
        titulo={t("Controle do agente")}
      />

      <GrupoMetricas
        itens={[
          { label: t("Conversas (24 h)"), valor: conversas24.size },
          { label: t("Respostas (24 h)"), valor: respondidas24 },
          {
            dica: t("Mensagens que o agente decidiu não responder: contato bloqueado, conversa pausada, Samuel já respondeu, follow-up fora do horário."),
            label: t("Não respondeu (24 h)"),
            valor: recentes.filter((x) => x.estado === "parado").length,
          },
          { label: t("Erros (24 h)"), valor: recentes.filter((x) => x.estado === "erro").length },
          {
            dica: t("Custo de IA das últimas 24 h. Modelos sem preço na tabela não entram."),
            label: t("Custo de IA (24 h)"),
            valor: custo(custo24),
          },
          {
            dica: t("Custo de IA dividido pelas respostas enviadas nas últimas 24 h. Inclui o que não gerou resposta (follow-ups avaliados, mensagens juntadas)."),
            label: t("Custo por resposta"),
            valor: respondidas24 ? custo(custo24 / respondidas24) : "—",
          },
        ]}
      />

      {filtros}

      <div className="@container min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,19,26,0.04)]">
      <div className="grid min-w-0 @min-[720px]:grid-cols-[220px_minmax(0,1fr)] @min-[1040px]:grid-cols-[236px_minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Conversas */}
        <div className="flex min-w-0 flex-col">
          <CabecaColuna extra={<span className="text-xs text-muted-foreground tabular-nums">{resumos.length}</span>}>
            {t("Conversas")}
          </CabecaColuna>
          {resumos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("Nenhuma conversa com estes filtros.")}</p>
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
                          {haQuanto(r.ultimo.criado_em, undefined, t)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {r.erros ? <span aria-label={t("com erro")} className="size-1.5 rounded-full bg-danger" /> : null}
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
                  {conversaAtual.modos.map((m) => (NOME_MODO[m] ? t(NOME_MODO[m]) : m)).join(", ")} ·{" "}
                  <span className="tabular-nums" title={t("Custo de IA de todas as respostas desta conversa")}>
                    {t("{valor} nesta conversa", { valor: custo(custoConversa) })}
                  </span>
                </span>
              ) : null
            }
          >
            {conversaId ? nomeDe(conversaId) : t("Conversa")}
          </CabecaColuna>
          <div className="flex max-h-[72vh] flex-col gap-5 overflow-y-auto bg-background/60 px-4 py-5">
            {daConversa.length === 0 ? <p className="text-sm text-muted-foreground">{t("Escolha uma conversa.")}</p> : null}
            {daConversa.map((tn) => {
              const ativo = tn.id === turnoId;
              const enviados = textos(tn.mensagens);
              return (
                <div className="flex flex-col gap-1.5" key={tn.id}>
                  <p className="text-center text-[11px] text-muted-foreground tabular-nums">{hora(tn)}</p>
                  {tn.mensagem_cliente ? (
                    <p className="max-w-[80%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2 text-sm text-foreground">
                      {tn.mensagem_cliente}
                    </p>
                  ) : null}
                  <Link
                    aria-current={ativo ? "true" : undefined}
                    className="group flex max-w-[80%] flex-col items-end gap-1 self-end rounded-2xl"
                    href={href({ conversa: conversaId, turno: tn.id })}
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
                          tn.estado === "erro" ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground"
                        } ${ativo ? "ring-2 ring-positive" : ""}`}
                      >
                        {tn.rota === "followup" ? `${t("Follow-up")}: ` : ""}
                        {descreverEstado(tn.estado, t).toLocaleLowerCase(locale)}
                        {tn.erro || tn.motivo ? ` · ${tn.erro || tn.motivo}` : ""}
                      </span>
                    )}
                    <span
                      className={`text-[11px] tabular-nums ${ativo ? "font-medium text-positive" : "text-muted-foreground"}`}
                    >
                      {enviados.length
                        ? tn.rota === "followup"
                          ? t("Follow-up automático")
                          : ROTA[tn.rota ?? ""]
                            ? t(ROTA[tn.rota ?? ""])
                            : "Carol"
                        : null}
                      {enviados.length && Number(tn.custo_usd) > 0 ? " · " : ""}
                      {Number(tn.custo_usd) > 0 ? custo(tn.custo_usd) : ""}
                      {ativo && enviados.length ? ` · ${t("aberta ao lado →")}` : ""}
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
                  {formatarDuracao(turno.duracao_ms, locale)} · {custo(turno.custo_usd)}
                </span>
              ) : null
            }
          >
            {t("Como a Carol chegou a esta resposta")}
          </CabecaColuna>
          {!turno ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("Clique em uma resposta da Carol.")}</p>
          ) : (
            <div className="flex max-h-[72vh] flex-col gap-6 overflow-y-auto px-5 py-5">
              {fluxo ? (
                <Fluxo linhas={fluxo} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {turno.erro || turno.motivo || t("Este turno não salvou passos.")}
                  {/^contacto bloqueado/.test(turno.motivo ?? "")
                    ? ` ${t("Por privacidade, nada é salvo de contatos bloqueados.")}`
                    : ""}
                </p>
              )}

              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {turno.modo === "sombra" ? t("O que ela teria feito") : t("O que ela fez")}
                </h3>
                <OQueFez acoes={acoesVisiveis(turno.resumo?.acoes, t)} />
                {turno.modo === "sombra" ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("Sombra: nada disso saiu de verdade. Quem respondeu ao cliente foi o n8n.")}
                  </p>
                ) : null}
              </div>

              {turno.modo === "sombra" ? (
                <details className="border-t border-border pt-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
                    {t("Comparar com o n8n")}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {n8n.length
                        ? n8n.length === 1
                          ? t("1 balão enviado")
                          : t("{n} balões enviados", { n: n8n.length })
                        : t("não verificado")}
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
                    {t("O registro do n8n pode trazer balões do turno anterior se as mensagens se cruzaram.")}
                  </p>
                </details>
              ) : null}

              <Link
                className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                href={`/admin/turnos/${turno.id}`}
              >
                {t("Detalhe técnico completo")}
              </Link>
            </div>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
