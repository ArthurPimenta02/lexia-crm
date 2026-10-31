/**
 * Bloqueios (Fase 21): de uma conversa para o identificador que o agente
 * compara ao receber uma mensagem.
 *
 * As conversas guardam `identificador_conversa` como "<canal>:<id>", medido a
 * 31/10/2026 em lexia_contactos: "whatsapp:<telefone>", "instagram:<IGSID>",
 * "messenger:<PSID>" (e "teste:…" para a Área de testes, que não se bloqueia).
 * O telefone fica só com dígitos, com DDI, que é como a Z-API o entrega.
 */

export const CANAIS_BLOQUEIO = ["whatsapp", "instagram", "messenger"] as const;
export type CanalBloqueio = (typeof CANAIS_BLOQUEIO)[number];

export function eCanalBloqueio(valor: string): valor is CanalBloqueio {
  return (CANAIS_BLOQUEIO as readonly string[]).includes(valor);
}

/** Só dígitos; aceita "+1 (555) 123-4567", "00 55 41…", etc. */
export function normalizarTelefone(valor: string) {
  return valor.replace(/\D/g, "").replace(/^00/, "");
}

/**
 * Normaliza e valida um identificador para o canal. Devolve null se não
 * servir: telefone com menos de 10 ou mais de 15 dígitos, ou IGSID/PSID que
 * não seja só dígitos.
 */
export function normalizarIdentificador(canal: CanalBloqueio, valor: string) {
  const limpo = canal === "whatsapp" ? normalizarTelefone(valor) : valor.trim();
  if (!/^\d+$/.test(limpo)) return null;
  if (canal === "whatsapp" && (limpo.length < 10 || limpo.length > 15)) return null;
  if (canal !== "whatsapp" && limpo.length < 6) return null;
  return limpo;
}

/** "whatsapp:15551234567" → { canal: "whatsapp", identificador: "15551234567" }. */
export function bloqueioDaConversa(identificadorConversa: string) {
  const separador = identificadorConversa.indexOf(":");
  if (separador < 1) return null;
  const canal = identificadorConversa.slice(0, separador);
  if (!eCanalBloqueio(canal)) return null;
  const identificador = normalizarIdentificador(canal, identificadorConversa.slice(separador + 1));
  return identificador ? { canal, identificador } : null;
}
