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
