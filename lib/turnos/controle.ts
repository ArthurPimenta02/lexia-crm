/**
 * Agrupa os turnos do agente por conversa, para a lista da esquerda do
 * Controle do agente (/admin/turnos).
 */

import type { TurnoLinha } from "@/lib/turnos/formatar";

export type TurnoNaConversa = TurnoLinha & { rota: string | null; n8n?: string[] | null };

export type ResumoConversa = {
  id: string;
  /** O turno mais recente da conversa. */
  ultimo: TurnoNaConversa;
  turnos: number;
  erros: number;
  parados: number;
  modos: string[];
};

/** `turnos` vem do mais recente para o mais antigo; a ordem das conversas segue essa. */
export function agruparConversas(turnos: TurnoNaConversa[], soComErro = false): ResumoConversa[] {
  const porConversa = new Map<string, ResumoConversa>();
  for (const t of turnos) {
    if (!t.identificador_conversa) continue;
    let r = porConversa.get(t.identificador_conversa);
    if (!r) {
      r = { id: t.identificador_conversa, ultimo: t, turnos: 0, erros: 0, parados: 0, modos: [] };
      porConversa.set(t.identificador_conversa, r);
    }
    r.turnos += 1;
    if (t.estado === "erro") r.erros += 1;
    if (t.estado === "parado") r.parados += 1;
    if (!r.modos.includes(t.modo)) r.modos.push(t.modo);
  }
  const todas = [...porConversa.values()];
  return soComErro ? todas.filter((r) => r.erros > 0) : todas;
}

/** A resposta que abre por omissão: a última que a Carol enviou, ou o último turno. */
export function turnoEscolhido(daConversa: TurnoNaConversa[], pedido: string) {
  if (pedido && daConversa.some((t) => t.id === pedido)) return pedido;
  return ([...daConversa].reverse().find((t) => t.estado === "respondido") ?? daConversa.at(-1))?.id;
}
