import Link from "next/link";
import type { ReactNode } from "react";

import { GrupoMetricas, PaginaCabecalho } from "@/app/components/painel-ui";
import { formatDateInTimezone, getClientTimezone } from "@/lib/clientes/timezone";
import { emQuanto, estadoDoLembrete, LEMBRETE, motivoLegivel, type ConsultaLinha, type FollowupLinha } from "@/lib/followups/leitura";
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
};

const CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger" };

function Seccao({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,19,26,0.04)]">
      <div className="flex min-h-12 items-center gap-2 border-b border-border px-5">
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-sm text-muted-foreground">{children}</p>;
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border-b border-border last:border-b-0">
      <h3 className="px-5 pt-4 pb-1 text-xs font-medium text-muted-foreground">{titulo}</h3>
      {children}
    </div>
  );
}

export function FollowupsVista({
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
}: FollowupsVistaProps) {
  const fuso = getClientTimezone(cliente);
  const data = (iso: string | null) =>
    iso
      ? formatDateInTimezone(iso, fuso, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "—";
  const nomeDe = (id: string | null, nome?: string | null) =>
    nome || (id ? (nomes[id] ?? id.replace(/^(whatsapp|instagram|messenger):/, "")) : "—");
  const linkConversa = (id: string | null, turno?: string) =>
    id ? `/admin/turnos?conversa=${encodeURIComponent(id)}${turno ? `&turno=${turno}` : ""}` : "/admin/turnos";

  const desde24 = agora - 86400_000;
  const fuEnviados = turnos.filter((t) => t.rota === "followup" && t.estado === "respondido");
  const lemEnviados = turnos.filter((t) => t.rota === "lembrete" && t.estado === "respondido");
  const futuras = consultas.filter((c) => Date.parse(c.inicio) >= agora && c.status === "confirmado");
  const custo7 = turnos.reduce((s, t) => s + Number(t.custo_usd ?? 0), 0);

  return (
    <section className="flex w-full min-w-0 flex-col gap-5">
      <PaginaCabecalho
        acoes={<span className="text-xs text-muted-foreground">{nomeCliente}</span>}
        titulo="Follow-ups e lembretes"
      />

      {!baseLigada || erroBase ? (
        <p className="rounded-xl border border-warning px-4 py-3 text-sm text-foreground">
          {baseLigada
            ? "Não foi possível ler a base do cliente agora. Os envios continuam a acontecer; só esta tela é que não os mostra."
            : "A base deste cliente não está ligada neste ambiente."}
        </p>
      ) : null}

      <GrupoMetricas
        itens={[
          {
            dica: "Conversas em que a Carol volta a escrever se o cliente não responder.",
            label: "Follow-ups marcados",
            valor: marcados.length,
          },
          {
            label: "Follow-ups enviados (24 h)",
            valor: fuEnviados.filter((t) => Date.parse(t.criado_em) >= desde24).length,
          },
          { label: "Consultas a lembrar", valor: futuras.length },
          { label: "Lembretes enviados (7 dias)", valor: lemEnviados.length },
          {
            dica: "Custo de IA dos follow-ups e lembretes dos últimos 7 dias (os lembretes não usam IA).",
            label: "Custo (7 dias)",
            valor: formatarCusto(custo7),
          },
        ]}
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Seccao
          extra={<span className="text-xs text-muted-foreground">de 15 em 15 min</span>}
          titulo="Follow-ups"
        >
          <Grupo titulo="Marcados para sair">
            {marcados.length === 0 ? (
              <Vazio>Nenhum follow-up marcado.</Vazio>
            ) : (
              <ul className="divide-y divide-border">
                {marcados.map((f) => (
                  <li key={f.id}>
                    <Link
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 px-5 py-3 transition-colors duration-150 hover:bg-muted"
                      href={linkConversa(f.identificador)}
                    >
                      <span className="truncate text-sm font-medium text-foreground">{nomeDe(f.identificador, f.nome_contacto)}</span>
                      <span className="text-right text-sm text-foreground tabular-nums">{data(f.proxima_tentativa_em)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {CANAL[f.canal ?? ""] ?? f.canal} · tentativa {f.etapa ?? 1}
                        {f.dia_combinado ? ` · combinou ${/^\d{4}-\d{2}-\d{2}T/.test(f.dia_combinado) ? data(f.dia_combinado) : f.dia_combinado}` : ""}
                        {f.motivo_encerramento ? ` · ${motivoLegivel(f.motivo_encerramento)}` : ""}
                      </span>
                      <span className="text-right text-xs text-muted-foreground tabular-nums">
                        {emQuanto(f.proxima_tentativa_em, agora)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Grupo>

          <Grupo titulo="Enviados (7 dias)">
            {fuEnviados.length === 0 ? (
              <Vazio>Nenhum follow-up enviado pelo agente em código ainda.</Vazio>
            ) : (
              <ul className="divide-y divide-border">
                {fuEnviados.map((t) => (
                  <li key={t.id}>
                    <Link
                      className="block px-5 py-3 transition-colors duration-150 hover:bg-muted"
                      href={linkConversa(t.identificador_conversa, t.id)}
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {nomeDe(t.identificador_conversa)}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {data(t.criado_em)} · {formatarCusto(t.custo_usd)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {Array.isArray(t.mensagens) ? t.mensagens.map(String).join(" ") : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Grupo>

          <details className="group">
            <summary className="cursor-pointer list-none px-5 py-3 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              Encerrados nos últimos 7 dias ({encerrados.length})
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {encerrados.map((f) => (
                <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-2.5 text-sm" key={f.id}>
                  <span className="truncate text-foreground">{nomeDe(f.identificador, f.nome_contacto)}</span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">{data(f.atualizado_em)}</span>
                  <span className="col-span-2 truncate text-xs text-muted-foreground">
                    {f.status === "cancelado" ? "Cancelado" : "Encerrado"}: {motivoLegivel(f.motivo_encerramento)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </Seccao>

        <Seccao
          extra={
            <span className="text-xs text-muted-foreground">
              {LEMBRETE.antesHoras} h antes · das {LEMBRETE.inicioHora}h às {LEMBRETE.fimHora}h
            </span>
          }
          titulo="Lembretes de consulta"
        >
          <Grupo titulo="Próximas consultas">
            {consultas.length === 0 ? (
              <Vazio>Nenhuma consulta marcada pela Carol.</Vazio>
            ) : (
              <ul className="divide-y divide-border">
                {consultas.map((c) => {
                  const e = estadoDoLembrete(c, agora);
                  return (
                    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 px-5 py-3" key={c.id}>
                      <span className="truncate text-sm font-medium text-foreground">{c.nome_cliente || "—"}</span>
                      <span className="text-right text-sm text-foreground tabular-nums">{data(c.inicio)}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.servico}</span>
                      <span
                        className={`text-right text-xs tabular-nums ${
                          e.tipo === "enviado" ? "text-positive" : e.tipo === "nao_sai" ? "text-warning" : "text-muted-foreground"
                        }`}
                      >
                        {e.tipo === "enviado"
                          ? `Lembrete enviado ${data(e.em)}`
                          : e.tipo === "agendado"
                            ? `Lembrete a partir de ${data(e.aPartirDe)}`
                            : e.tipo === "a_enviar"
                              ? "Lembrete sai na próxima hora"
                              : `Sem lembrete: ${e.motivo}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="px-5 pt-1 pb-4 text-xs text-muted-foreground">
              Só as consultas marcadas pela Carol. As que o Samuel marca direto na agenda não recebem lembrete (igual ao n8n).
            </p>
          </Grupo>

          <Grupo titulo="Lembretes enviados (7 dias)">
            {lemEnviados.length === 0 ? (
              <Vazio>Nenhum lembrete enviado pelo agente em código ainda.</Vazio>
            ) : (
              <ul className="divide-y divide-border">
                {lemEnviados.map((t) => (
                  <li className="px-5 py-3" key={t.id}>
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {nomeDe(t.identificador_conversa)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{data(t.criado_em)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {Array.isArray(t.mensagens) ? t.mensagens.map(String).join(" ") : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Grupo>
        </Seccao>
      </div>
    </section>
  );
}
