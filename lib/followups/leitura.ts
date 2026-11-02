/**
 * Follow-ups e lembretes do agente em código (tela /admin/followups).
 *
 * O que está MARCADO vive na base do cliente: `lexia_followups` (um por
 * conversa) e a tabela de marcações (lembrete único por consulta). O que já
 * SAIU vive no CRM: os turnos com rota `followup`/`lembrete` em `lexia_turnos`.
 * Aqui só se traduz para a tela; quem decide e envia é o lexia-agente.
 */

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
export function estadoDoLembrete(c: ConsultaLinha, agora = Date.now()): EstadoLembrete {
  if (c.lembrete_enviado_em) return { tipo: "enviado", em: c.lembrete_enviado_em };
  if (c.status !== "confirmado") return { tipo: "nao_sai", motivo: `consulta ${c.status}` };
  if ((c.telefone ?? "").replace(/\D/g, "").length < 10) return { tipo: "nao_sai", motivo: "sem telefone válido" };
  const inicio = Date.parse(c.inicio);
  const faltam = (inicio - agora) / 3600_000;
  if (faltam < LEMBRETE.minimoHoras) return { tipo: "nao_sai", motivo: "marcada em cima da hora" };
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

export function motivoLegivel(m: string | null) {
  if (!m) return "—";
  return MOTIVOS[m] ?? m;
}

/** "daqui a 3 h", "daqui a 2 dias", "atrasado 20 min". */
export function emQuanto(iso: string | null, agora = Date.now()) {
  if (!iso) return "—";
  const s = Math.round((Date.parse(iso) - agora) / 1000);
  const abs = Math.abs(s);
  const txt = abs < 3600 ? `${Math.max(1, Math.round(abs / 60))} min` : abs < 172800 ? `${Math.round(abs / 3600)} h` : `${Math.round(abs / 86400)} dias`;
  return s >= 0 ? `daqui a ${txt}` : `atrasado ${txt}`;
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

const ordinal = (n: number) => `${n}.ª`;

/**
 * Explica um follow-up em português simples, com as regras do agente.
 * `data` formata um instante no fuso do cliente.
 */
export function explicarFollowup(
  f: FollowupDetalhe,
  data: (iso: string) => string,
  agora = Date.now(),
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
    const fim = f.status === "cancelado" ? "Cancelado" : "Encerrado";
    porque.push(`${fim}${f.atualizado_em ? ` em ${data(f.atualizado_em)}` : ""}: ${motivoLegivel(f.motivo_encerramento)}.`);
    if (f.tentativas_enviadas) porque.push(`A Carol chegou a enviar ${f.tentativas_enviadas} ${f.tentativas_enviadas === 1 ? "mensagem" : "mensagens"} de follow-up.`);
    if (f.motivo_juiz) porque.push(`O Juiz disse: "${f.motivo_juiz}"`);
    return { resumo: `${fim}: ${motivoLegivel(f.motivo_encerramento)}`, tom: "fim", porque, proximos, alertas };
  }

  if (f.ultima_msg_agente_em) porque.push(`A Carol escreveu por último em ${data(f.ultima_msg_agente_em)}.`);
  if (f.ultima_msg_cliente_em) porque.push(`O cliente não responde desde ${data(f.ultima_msg_cliente_em)}.`);
  if (f.dia_combinado) {
    const dia = /^\d{4}-\d{2}-\d{2}T/.test(f.dia_combinado) ? data(f.dia_combinado) : f.dia_combinado;
    porque.push(`O cliente combinou ser contactado em ${dia}, por isso o follow-up foi marcado para esse dia.`);
  }
  if (f.motivo_encerramento) porque.push(`Última decisão: ${motivoLegivel(f.motivo_encerramento)}.`);
  if (f.motivo_juiz) porque.push(`O Juiz disse da última vez: "${f.motivo_juiz}"`);

  proximos.push(
    `Antes de enviar, a Carol confere se o contacto está bloqueado, se o Samuel pausou a conversa e se está no horário comercial (${FOLLOWUP.inicioHora}h às ${FOLLOWUP.fimHora}h, segunda a sábado, Boston). Fora do horário, adia para o próximo.`,
  );
  if (meta) {
    proximos.push(
      `No Instagram a Meta só deixa escrever até 24 h depois da última mensagem do cliente${fechaMeta ? `: essa janela fecha em ${data(new Date(fechaMeta).toISOString())}` : ""}.`,
    );
  } else {
    proximos.push("No WhatsApp não há janela de 24 h: pode sair a qualquer dia útil.");
  }
  proximos.push("Um Juiz (IA) lê a conversa e decide se vale a pena escrever e com que abordagem. Se a conversa já terminou (por exemplo, consulta marcada), ele encerra sem enviar.");
  if (etapa >= FOLLOWUP.maxTentativas + 1) {
    proximos.push("Já passou das 2 tentativas: no próximo ciclo este follow-up encerra sem enviar.");
  } else if (etapa === FOLLOWUP.maxTentativas) {
    proximos.push("É a última tentativa. Se o cliente não responder, o follow-up termina.");
  } else {
    proximos.push(`Se o cliente não responder, há uma ${ordinal(etapa + 1)} tentativa cerca de 24 h depois. Depois disso, o follow-up termina.`);
  }
  proximos.push("Se o cliente responder antes, o follow-up é cancelado e a conversa segue normalmente.");

  const sai = f.proxima_tentativa_em ? Date.parse(f.proxima_tentativa_em) : null;
  if (meta && fechaMeta && sai && sai > fechaMeta) {
    alertas.push(
      f.dia_combinado
        ? "A janela da Meta fecha antes do envio: a Carol não poderá escrever, e o Samuel recebe um aviso no WhatsApp para retomar à mão."
        : "A janela da Meta fecha antes do envio: o follow-up vai encerrar sem enviar.",
    );
  }
  if (sai && sai < agora - 30 * 60_000) alertas.push("Está atrasado mais de 30 minutos. O ciclo corre de 15 em 15 minutos; se continuar assim, vale verificar.");

  const quando = f.proxima_tentativa_em ? data(f.proxima_tentativa_em) : "sem data";
  return {
    resumo: `${ordinal(Math.min(etapa, FOLLOWUP.maxTentativas))} de ${FOLLOWUP.maxTentativas} tentativas · sai ${quando} (${emQuanto(f.proxima_tentativa_em, agora)})`,
    tom: alertas.length ? "aviso" : "normal",
    porque,
    proximos,
    alertas,
  };
}
