/**
 * Follow-ups e lembretes do agente em código (tela /admin/followups).
 *
 * O que está MARCADO vive na base do cliente: `lexia_followups` (um por
 * conversa) e a tabela de marcações (lembrete único por consulta). O que já
 * SAIU vive no CRM: os turnos com rota `followup`/`lembrete` em `lexia_turnos`.
 * Aqui só se traduz para a tela; quem decide e envia é o lexia-agente.
 *
 * As funções que escrevem texto recebem o `t` do idioma de quem vê; sem ele
 * escrevem em português do Brasil (o texto-fonte).
 */

import { criarT, type FuncaoT } from "../i18n/traduzir";

const PT_BR = criarT(null);

export type FollowupLinha = {
  id: string;
  canal: string | null;
  identificador: string | null;
  nome_contacto: string | null;
  etapa: number | null;
  status: string;
  ultima_msg_cliente_em: string | null;
  proxima_tentativa_em: string | null;
  tentativas_enviadas: number | null;
  motivo_encerramento: string | null;
  dia_combinado: string | null;
  atualizado_em: string | null;
};

export type ConsultaLinha = {
  id: string;
  nome_cliente: string | null;
  telefone: string | null;
  servico: string | null;
  inicio: string;
  status: string;
  lembrete_enviado_em: string | null;
  criado_via: string | null;
};

/** Regras do lembrete no agente (nó "Travas de Lembrete"): 24 h antes, nunca a menos de 2 h, só das 7h às 20h. */
export const LEMBRETE = { antesHoras: 24, minimoHoras: 2, inicioHora: 7, fimHora: 20 };

export type EstadoLembrete =
  | { tipo: "enviado"; em: string }
  | { tipo: "agendado"; aPartirDe: string }
  | { tipo: "a_enviar" }
  | { tipo: "nao_sai"; motivo: string };

/** O que vai acontecer com o lembrete desta consulta. */
export function estadoDoLembrete(c: ConsultaLinha, agora = Date.now(), t: FuncaoT = PT_BR): EstadoLembrete {
  if (c.lembrete_enviado_em) return { tipo: "enviado", em: c.lembrete_enviado_em };
  if (c.status !== "confirmado") return { tipo: "nao_sai", motivo: t("consulta {status}", { status: c.status }) };
  if ((c.telefone ?? "").replace(/\D/g, "").length < 10) return { tipo: "nao_sai", motivo: t("sem telefone válido") };
  const inicio = Date.parse(c.inicio);
  const faltam = (inicio - agora) / 3600_000;
  if (faltam < LEMBRETE.minimoHoras) return { tipo: "nao_sai", motivo: t("marcada em cima da hora") };
  if (faltam <= LEMBRETE.antesHoras) return { tipo: "a_enviar" };
  return { tipo: "agendado", aPartirDe: new Date(inicio - LEMBRETE.antesHoras * 3600_000).toISOString() };
}

const MOTIVOS: Record<string, string> = {
  "nova mensagem na conversa": "o cliente respondeu",
  "ciclo completo (2 tentativas)": "fez as 2 tentativas, sem resposta",
  "ciclo completo (max 2 tentativas)": "fez as 2 tentativas, sem resposta",
  "ciclo completo: Samuel avisado nas etapas 3 e 4": "fez as tentativas e avisou o Samuel",
  "sem horario comercial dentro da janela da Meta": "não houve horário comercial dentro das 24 h da Meta",
  "fora do horario comercial": "fora do horário comercial, sai no próximo",
  "trava: contato salvo na agenda do Samuel — follow-up proibido": "contato salvo na agenda do Samuel",
  "janela da Meta fechou antes da etapa 1": "as 24 h da Meta acabaram antes da 1.ª tentativa",
  "janela da Meta fechou antes da etapa 2": "as 24 h da Meta acabaram antes da 2.ª tentativa",
};

export function motivoLegivel(m: string | null, t: FuncaoT = PT_BR) {
  if (!m) return "—";
  return MOTIVOS[m] ? t(MOTIVOS[m]) : m;
}

/** "daqui a 3 h", "daqui a 2 dias", "atrasado 20 min". */
export function emQuanto(iso: string | null, agora = Date.now(), t: FuncaoT = PT_BR) {
  if (!iso) return "—";
  const s = Math.round((Date.parse(iso) - agora) / 1000);
  const abs = Math.abs(s);
  const txt =
    abs < 3600
      ? `${Math.max(1, Math.round(abs / 60))} min`
      : abs < 172800
        ? `${Math.round(abs / 3600)} h`
        : t("{n} dias", { n: Math.round(abs / 86400) });
  return s >= 0 ? t("daqui a {tempo}", { tempo: txt }) : t("atrasado {tempo}", { tempo: txt });
}

export function agoraMs() {
  return Date.now();
}

/** Regras do follow-up no agente (nó "Travas de Follow-up" v3). */
export const FOLLOWUP = { maxTentativas: 2, janelaMetaHoras: 23.5, inicioHora: 7, fimHora: 20 };

export type FollowupDetalhe = FollowupLinha & {
  ultima_msg_agente_em?: string | null;
  motivo_juiz?: string | null;
};

export type TurnoDoFollowup = {
  id: string;
  criado_em: string;
  estado: string;
  motivo: string | null;
  mensagens: unknown;
  custo_usd: number | string | null;
};

export type Explicacao = {
  /** Uma frase: o que se passa com este follow-up agora. */
  resumo: string;
  tom: "normal" | "aviso" | "fim";
  porque: string[];
  proximos: string[];
  alertas: string[];
};

/**
 * Explica um follow-up em português simples, com as regras do agente.
 * `data` formata um instante no fuso do cliente.
 */
export function explicarFollowup(
  f: FollowupDetalhe,
  data: (iso: string) => string,
  agora = Date.now(),
  t: FuncaoT = PT_BR,
): Explicacao {
  const etapa = f.etapa ?? 1;
  const meta = f.canal === "instagram" || f.canal === "messenger";
  const fechaMeta = f.ultima_msg_cliente_em
    ? Date.parse(f.ultima_msg_cliente_em) + FOLLOWUP.janelaMetaHoras * 3600_000
    : null;
  const porque: string[] = [];
  const proximos: string[] = [];
  const alertas: string[] = [];

  if (f.status !== "agendado") {
    const cancelado = f.status === "cancelado";
    const motivo = motivoLegivel(f.motivo_encerramento, t);
    if (f.atualizado_em) {
      const quando = data(f.atualizado_em);
      porque.push(
        cancelado
          ? t("Cancelado em {data}: {motivo}.", { data: quando, motivo })
          : t("Encerrado em {data}: {motivo}.", { data: quando, motivo }),
      );
    } else {
      porque.push(cancelado ? t("Cancelado: {motivo}.", { motivo }) : t("Encerrado: {motivo}.", { motivo }));
    }
    if (f.tentativas_enviadas) {
      porque.push(
        f.tentativas_enviadas === 1
          ? t("A Carol chegou a enviar 1 mensagem de follow-up.")
          : t("A Carol chegou a enviar {n} mensagens de follow-up.", { n: f.tentativas_enviadas }),
      );
    }
    if (f.motivo_juiz) porque.push(t("O Juiz disse: \"{motivo}\"", { motivo: f.motivo_juiz }));
    const resumo = cancelado ? t("Cancelado: {motivo}", { motivo }) : t("Encerrado: {motivo}", { motivo });
    return { resumo, tom: "fim", porque, proximos, alertas };
  }

  if (f.ultima_msg_agente_em) porque.push(t("A Carol escreveu por último em {data}.", { data: data(f.ultima_msg_agente_em) }));
  if (f.ultima_msg_cliente_em) porque.push(t("O cliente não responde desde {data}.", { data: data(f.ultima_msg_cliente_em) }));
  if (f.dia_combinado) {
    const dia = /^\d{4}-\d{2}-\d{2}T/.test(f.dia_combinado) ? data(f.dia_combinado) : f.dia_combinado;
    porque.push(t("O cliente combinou ser contatado em {dia}, por isso o follow-up foi marcado para esse dia.", { dia }));
  }
  if (f.motivo_encerramento) porque.push(t("Última decisão: {motivo}.", { motivo: motivoLegivel(f.motivo_encerramento, t) }));
  if (f.motivo_juiz) porque.push(t("O Juiz disse da última vez: \"{motivo}\"", { motivo: f.motivo_juiz }));

  proximos.push(
    t(
      "Antes de enviar, a Carol confere se o contato está bloqueado, se o Samuel pausou a conversa e se está no horário comercial ({inicio}h às {fim}h, segunda a sábado, Boston). Fora do horário, adia para o próximo.",
      { fim: FOLLOWUP.fimHora, inicio: FOLLOWUP.inicioHora },
    ),
  );
  if (meta) {
    proximos.push(
      fechaMeta
        ? t("No Instagram a Meta só deixa escrever até 24 h depois da última mensagem do cliente: essa janela fecha em {data}.", {
            data: data(new Date(fechaMeta).toISOString()),
          })
        : t("No Instagram a Meta só deixa escrever até 24 h depois da última mensagem do cliente."),
    );
  } else {
    proximos.push(t("No WhatsApp não há janela de 24 h: pode sair a qualquer dia útil."));
  }
  proximos.push(t("Um Juiz (IA) lê a conversa e decide se vale a pena escrever e com que abordagem. Se a conversa já terminou (por exemplo, consulta marcada), ele encerra sem enviar."));
  if (etapa >= FOLLOWUP.maxTentativas + 1) {
    proximos.push(t("Já passou das 2 tentativas: no próximo ciclo este follow-up encerra sem enviar."));
  } else if (etapa === FOLLOWUP.maxTentativas) {
    proximos.push(t("É a última tentativa. Se o cliente não responder, o follow-up termina."));
  } else {
    proximos.push(
      t("Se o cliente não responder, há uma {n}.ª tentativa cerca de 24 h depois. Depois disso, o follow-up termina.", { n: etapa + 1 }),
    );
  }
  proximos.push(t("Se o cliente responder antes, o follow-up é cancelado e a conversa segue normalmente."));

  const sai = f.proxima_tentativa_em ? Date.parse(f.proxima_tentativa_em) : null;
  if (meta && fechaMeta && sai && sai > fechaMeta) {
    alertas.push(
      f.dia_combinado
        ? t("A janela da Meta fecha antes do envio: a Carol não poderá escrever, e o Samuel recebe um aviso no WhatsApp para retomar manualmente.")
        : t("A janela da Meta fecha antes do envio: o follow-up vai encerrar sem enviar."),
    );
  }
  if (sai && sai < agora - 30 * 60_000) alertas.push(t("Está atrasado mais de 30 minutos. O ciclo roda de 15 em 15 minutos; se continuar assim, vale verificar."));

  const quando = f.proxima_tentativa_em ? data(f.proxima_tentativa_em) : t("sem data");
  return {
    resumo: t("{n}.ª de {total} tentativas · sai {quando} ({emQuanto})", {
      emQuanto: emQuanto(f.proxima_tentativa_em, agora, t),
      n: Math.min(etapa, FOLLOWUP.maxTentativas),
      quando,
      total: FOLLOWUP.maxTentativas,
    }),
    tom: alertas.length ? "aviso" : "normal",
    porque,
    proximos,
    alertas,
  };
}
