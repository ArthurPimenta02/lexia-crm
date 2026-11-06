import Link from "next/link";
import type { ReactNode } from "react";

import { BellRing, CalendarClock, Coins, Send } from "lucide-react";

import { CartaoMetrica } from "@/app/components/cartoes";
import { AvatarCanal, AvisoLinha, CabecalhoTela, GradeMetricas, VazioTela } from "@/app/components/tela";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import { Janela } from "@/app/admin/followups/janela";
import {
  emQuanto,
  estadoDoLembrete,
  explicarFollowup,
  LEMBRETE,
  motivoLegivel,
  type ConsultaLinha,
  type FollowupDetalhe,
  type FollowupLinha,
  type TurnoDoFollowup,
} from "@/lib/followups/leitura";
import { formatarCusto } from "@/lib/turnos/formatar";

/**
 * O desenho da tela Follow-ups e lembretes, sem acesso a dados (a página
 * busca e passa por props). Duas secções com a mesma forma: o que está
 * marcado para sair, e o que já saiu.
 */

type TurnoEnviado = {
  id: string;
  criado_em: string;
  identificador_conversa: string | null;
  estado: string;
  motivo: string | null;
  mensagens: unknown;
  custo_usd: number | string | null;
  rota: string;
};

export type FollowupsVistaProps = {
  agora: number;
  baseLigada: boolean;
  erroBase: boolean;
  cliente: string;
  nomeCliente: string;
  marcados: FollowupLinha[];
  encerrados: FollowupLinha[];
  consultas: ConsultaLinha[];
  turnos: TurnoEnviado[];
  nomes: Record<string, string>;
  /** O follow-up aberto na janela (?fu=<id>) e as mensagens que já lhe saíram. */
  selecionado?: FollowupDetalhe | null;
  turnosDoSelecionado?: TurnoDoFollowup[];
};

const CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger" };

function Seccao({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="ds-bloco min-w-0 overflow-hidden">
      <div className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 px-5 pt-4 pb-1">
        <h2 className="ds-titulo-3 min-w-0 flex-1 text-foreground">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="px-5 pt-1 pb-4 text-sm text-muted-foreground">{children}</p>;
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="pb-1">
      <h3 className="ds-sobretitulo px-5 pt-3 pb-1.5">{titulo}</h3>
      {children}
    </div>
  );
}

export async function FollowupsVista({
  agora,
  baseLigada,
  erroBase,
  cliente,
  nomeCliente,
  marcados,
  encerrados,
  consultas,
  turnos,
  nomes,
  selecionado = null,
  turnosDoSelecionado = [],
}: FollowupsVistaProps) {
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const custo = (v: number | string | null | undefined) => formatarCusto(v, locale, t);
  const fuso = getClientTimezone(cliente);
  const formatoData = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: fuso,
    weekday: "short",
  });
  const data = (iso: string | null) => (iso ? formatoData.format(new Date(iso)) : "—");
  const nomeDe = (id: string | null, nome?: string | null) =>
    nome || (id ? (nomes[id] ?? id.replace(/^(whatsapp|instagram|messenger):/, "")) : "—");
  const linkConversa = (id: string | null, turno?: string) =>
    id ? `/admin/turnos?conversa=${encodeURIComponent(id)}${turno ? `&turno=${turno}` : ""}` : "/admin/turnos";

  const canalDe = (id: string | null) => id?.match(/^(whatsapp|instagram|messenger):/)?.[1] ?? null;
  const abrir = (id: string) => `/admin/followups?fu=${encodeURIComponent(id)}`;
  const porConversa = new Map([...encerrados, ...marcados].map((f) => [f.identificador ?? "", f.id]));
  const desde24 = agora - 86400_000;
  const fuEnviados = turnos.filter((x) => x.rota === "followup" && x.estado === "respondido");
  const lemEnviados = turnos.filter((x) => x.rota === "lembrete" && x.estado === "respondido");
  const futuras = consultas.filter((c) => Date.parse(c.inicio) >= agora && c.status === "confirmado");
  const custo7 = turnos.reduce((s, x) => s + Number(x.custo_usd ?? 0), 0);

  return (
    <section className="flex w-full min-w-0 flex-col gap-5">
      <CabecalhoTela
        destaque={
          marcados.length > 0
            ? marcados.length === 1
              ? t("1 follow-up")
              : t("{n} follow-ups", { n: marcados.length })
            : undefined
        }
        resto={marcados.length > 0 ? t("marcados para sair.") : t("Nenhum follow-up marcado.")}
        sobretitulo={`${t("Follow-ups e lembretes")} · ${nomeCliente}`}
      />

      {!baseLigada || erroBase ? (
        <AvisoLinha>
          {baseLigada
            ? t("Não foi possível ler a base do cliente agora. Os envios continuam acontecendo; só esta tela é que não os mostra.")
            : t("A base deste cliente não está conectada neste ambiente.")}
        </AvisoLinha>
      ) : null}

      <GradeMetricas>
        <CartaoMetrica
          cor="var(--ds-acao)"
          icone={<Send aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("Follow-ups enviados (24 h)")}
          valor={String(fuEnviados.filter((x) => Date.parse(x.criado_em) >= desde24).length)}
        />
        <CartaoMetrica
          cor="var(--ds-info)"
          icone={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("Consultas a lembrar")}
          valor={String(futuras.length)}
        />
        <CartaoMetrica
          cor="var(--ds-destaque)"
          icone={<BellRing aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("Lembretes enviados (7 dias)")}
          valor={String(lemEnviados.length)}
        />
        <CartaoMetrica
          cor="var(--ds-ouro)"
          dica={t("Custo de IA dos follow-ups e lembretes dos últimos 7 dias (os lembretes não usam IA).")}
          icone={<Coins aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("Custo (7 dias)")}
          valor={custo(custo7)}
        />
      </GradeMetricas>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
        <Seccao
          extra={<span className="text-xs text-muted-foreground">{t("de 15 em 15 min")}</span>}
          titulo={t("Follow-ups")}
        >
          <Grupo titulo={t("Marcados para sair")}>
            {marcados.length === 0 ? (
              <VazioTela pose="feliz" titulo={t("Nenhum follow-up marcado.")} />
            ) : (
              <ul className="tela-lista px-1.5">
                {marcados.map((f) => (
                  <li key={f.id}>
                    <Link
                      className="tela-linha"
                      href={abrir(f.id)}
                      scroll={false}
                    >
                      <AvatarCanal canal={f.canal} nome={nomeDe(f.identificador, f.nome_contacto)} />
                      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5">
                      <span className="truncate text-sm font-semibold text-foreground">{nomeDe(f.identificador, f.nome_contacto)}</span>
                      <span className="text-right text-sm text-foreground tabular-nums">{data(f.proxima_tentativa_em)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {CANAL[f.canal ?? ""] ?? f.canal} · {t("tentativa {n}", { n: f.etapa ?? 1 })}
                        {f.dia_combinado
                          ? ` · ${t("combinou {dia}", {
                              dia: /^\d{4}-\d{2}-\d{2}T/.test(f.dia_combinado) ? data(f.dia_combinado) : f.dia_combinado,
                            })}`
                          : ""}
                        {f.motivo_encerramento ? ` · ${motivoLegivel(f.motivo_encerramento, t)}` : ""}
                      </span>
                      <span
                        className={`text-right text-xs font-medium tabular-nums ${
                          f.proxima_tentativa_em && Date.parse(f.proxima_tentativa_em) < agora
                            ? "text-[var(--ds-alerta)]"
                            : "text-[var(--ds-acao-forte)]"
                        }`}
                      >
                        {emQuanto(f.proxima_tentativa_em, agora, t)}
                      </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Grupo>

          <Grupo titulo={t("Enviados (7 dias)")}>
            {fuEnviados.length === 0 ? (
              <Vazio>{t("Nenhum follow-up enviado pelo agente em código ainda.")}</Vazio>
            ) : (
              <ul className="tela-lista px-1.5">
                {fuEnviados.map((x) => (
                  <li key={x.id}>
                    <Link
                      className="tela-linha items-start"
                      href={
                        porConversa.get(x.identificador_conversa ?? "")
                          ? abrir(porConversa.get(x.identificador_conversa ?? "")!)
                          : linkConversa(x.identificador_conversa, x.id)
                      }
                      scroll={false}
                    >
                      <AvatarCanal canal={canalDe(x.identificador_conversa)} nome={nomeDe(x.identificador_conversa)} />
                      <span className="block min-w-0 flex-1">
                      <span className="flex items-baseline gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {nomeDe(x.identificador_conversa)}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {data(x.criado_em)} · {custo(x.custo_usd)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {Array.isArray(x.mensagens) ? x.mensagens.map(String).join(" ") : ""}
                      </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Grupo>

          <details className="group" open={Boolean(selecionado && selecionado.status !== "agendado")}>
            <summary className="mx-5 mb-4 mt-1 cursor-pointer list-none rounded-[12px] bg-[color-mix(in_oklab,var(--ds-texto)_3%,transparent)] px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              {t("Encerrados nos últimos 7 dias ({n})", { n: encerrados.length })}
            </summary>
            <ul className="tela-lista px-1.5 pb-2">
              {encerrados.map((f) => (
                <li key={f.id}>
                  <Link
                    className="tela-linha grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-sm"
                    href={abrir(f.id)}
                    scroll={false}
                  >
                    <span className="truncate text-foreground">{nomeDe(f.identificador, f.nome_contacto)}</span>
                    <span className="text-right text-xs text-muted-foreground tabular-nums">{data(f.atualizado_em)}</span>
                    <span className="col-span-2 truncate text-xs text-muted-foreground">
                      {f.status === "cancelado"
                        ? t("Cancelado: {motivo}", { motivo: motivoLegivel(f.motivo_encerramento, t) })
                        : t("Encerrado: {motivo}", { motivo: motivoLegivel(f.motivo_encerramento, t) })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </Seccao>

        <Seccao
          extra={
            <span className="text-xs text-muted-foreground">
              {t("{horas} h antes · das {inicio}h às {fim}h", {
                fim: LEMBRETE.fimHora,
                horas: LEMBRETE.antesHoras,
                inicio: LEMBRETE.inicioHora,
              })}
            </span>
          }
          titulo={t("Lembretes de consulta")}
        >
          <Grupo titulo={t("Próximas consultas")}>
            {consultas.length === 0 ? (
              <VazioTela titulo={t("Nenhuma consulta marcada pela Carol.")} />
            ) : (
              <ul className="tela-lista px-1.5">
                {consultas.map((c) => {
                  const e = estadoDoLembrete(c, agora, t);
                  return (
                    <li className="tela-linha" key={c.id}>
                      <AvatarCanal nome={c.nome_cliente || "—"} />
                      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5">
                      <span className="truncate text-sm font-semibold text-foreground">{c.nome_cliente || "—"}</span>
                      <span className="text-right text-sm text-foreground tabular-nums">{data(c.inicio)}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.servico}</span>
                      <span
                        className={`text-right text-xs tabular-nums ${
                          e.tipo === "enviado" ? "text-[var(--ds-acao-forte)]" : e.tipo === "nao_sai" ? "text-[var(--ds-alerta)]" : "text-muted-foreground"
                        }`}
                      >
                        {e.tipo === "enviado"
                          ? t("Lembrete enviado {data}", { data: data(e.em) })
                          : e.tipo === "agendado"
                            ? t("Lembrete a partir de {data}", { data: data(e.aPartirDe) })
                            : e.tipo === "a_enviar"
                              ? t("Lembrete sai na próxima hora")
                              : t("Sem lembrete: {motivo}", { motivo: e.motivo })}
                      </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="px-5 pt-2 pb-3 text-xs text-muted-foreground">
              {t("Só as consultas marcadas pela Carol. As que o Samuel marca direto na agenda não recebem lembrete (igual ao n8n).")}
            </p>
          </Grupo>

          <Grupo titulo={t("Lembretes enviados (7 dias)")}>
            {lemEnviados.length === 0 ? (
              <Vazio>{t("Nenhum lembrete enviado pelo agente em código ainda.")}</Vazio>
            ) : (
              <ul className="tela-lista px-1.5 pb-2">
                {lemEnviados.map((x) => (
                  <li className="tela-linha items-start" key={x.id}>
                    <AvatarCanal canal={canalDe(x.identificador_conversa)} nome={nomeDe(x.identificador_conversa)} />
                    <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {nomeDe(x.identificador_conversa)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{data(x.criado_em)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {Array.isArray(x.mensagens) ? x.mensagens.map(String).join(" ") : ""}
                    </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Grupo>
        </Seccao>
      </div>

      {selecionado ? (
        <Janela fechar="/admin/followups" titulo={nomeDe(selecionado.identificador, selecionado.nome_contacto)}>
          <DetalheFollowup
            agora={agora}
            custo={custo}
            data={(iso) => data(iso)}
            f={selecionado}
            linkConversa={linkConversa(selecionado.identificador)}
            t={t}
            turnos={turnosDoSelecionado}
          />
        </Janela>
      ) : null}
    </section>
  );
}

function Lista({ titulo, itens, tom = "" }: { titulo: string; itens: string[]; tom?: string }) {
  if (!itens.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{titulo}</h3>
      <ul className={`flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed marker:text-border-strong ${tom || "text-foreground"}`}>
        {itens.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DetalheFollowup({
  f,
  turnos,
  agora,
  data,
  linkConversa,
  custo,
  t,
}: {
  f: FollowupDetalhe;
  turnos: TurnoDoFollowup[];
  agora: number;
  data: (iso: string) => string;
  linkConversa: string;
  custo: (v: number | string | null | undefined) => string;
  t: FuncaoT;
}) {
  const e = explicarFollowup(f, data, agora, t);
  const cor = e.tom === "aviso" ? "text-[var(--ds-alerta)]" : e.tom === "fim" ? "text-muted-foreground" : "text-[var(--ds-acao-forte)]";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-muted-foreground">
          {CANAL[f.canal ?? ""] ?? f.canal} · {f.status === "agendado" ? t("marcado") : f.status}
        </p>
        <p className={`mt-1 text-[15px] font-medium ${cor}`}>{e.resumo}</p>
      </div>

      <Lista itens={e.alertas} titulo={t("Atenção")} tom="text-[var(--ds-alerta)]" />
      <Lista itens={e.porque} titulo={f.status === "agendado" ? t("Por que está marcado") : t("Como terminou")} />
      <Lista itens={e.proximos} titulo={t("O que acontece em seguida")} />

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">{t("Follow-ups já enviados a este contato")}</h3>
        {turnos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nenhum enviado pelo agente em código ainda.")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {turnos.map((x) => {
              const msgs = Array.isArray(x.mensagens) ? x.mensagens.map(String) : [];
              return (
                <li className="rounded-[12px] bg-[color-mix(in_oklab,var(--ds-texto)_3%,transparent)] px-3.5 py-2.5" key={x.id}>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {data(x.criado_em)} · {x.estado === "respondido" ? t("enviado") : t("não enviado")} · {custo(x.custo_usd)}
                  </p>
                  <p className="mt-1 text-sm text-foreground">{msgs.length ? msgs.join(" ") : motivoLegivel(x.motivo, t)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-sm">
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={linkConversa}>
          {t("Abrir a conversa no Controle do agente")}
        </Link>
        {f.status === "agendado" ? (
          <Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/admin/bloqueios">
            {t("Para não enviar: bloquear o contato")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
