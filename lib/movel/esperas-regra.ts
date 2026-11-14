/**
 * A regra de "à espera de uma pessoa", sem base de dados (para se poder
 * testar): uma conversa está à espera quando recebeu uma mensagem com origem
 * `recebida_na_pausa` nas últimas 48 h e não houve nenhuma `enviada` depois
 * dela. As conversas da Área de testes (`teste:…`) nunca contam.
 */

export const JANELA_ESPERA_MS = 48 * 3600_000;

export type MensagemCurta = { identificador_conversa: string; criado_em: string };

/** `desde` = a primeira "recebida na pausa" depois da última enviada; `ultima` = a mais recente. */
export type Espera = { conversa: string; desde: string; ultima: string };

function ultimaEnviadaPor(enviadas: MensagemCurta[]) {
  const ultima = new Map<string, string>();
  for (const m of enviadas) if ((ultima.get(m.identificador_conversa) ?? "") < m.criado_em) ultima.set(m.identificador_conversa, m.criado_em);
  return ultima;
}

export function esperasDe(naPausa: MensagemCurta[], enviadas: MensagemCurta[], agora: Date): Espera[] {
  const limite = new Date(agora.getTime() - JANELA_ESPERA_MS).toISOString();
  const ultimaEnviada = ultimaEnviadaPor(enviadas);
  const porConversa = new Map<string, Espera>();
  const ordenadas = [...naPausa].sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
  for (const m of ordenadas) {
    const conversa = m.identificador_conversa;
    if (!conversa || conversa.startsWith("teste:") || m.criado_em < limite) continue;
    if (m.criado_em <= (ultimaEnviada.get(conversa) ?? "")) continue;
    const atual = porConversa.get(conversa);
    porConversa.set(conversa, atual ? { ...atual, ultima: m.criado_em } : { conversa, desde: m.criado_em, ultima: m.criado_em });
  }
  return [...porConversa.values()].sort((a, b) => (a.desde < b.desde ? -1 : 1));
}

/**
 * Esperas que alguém já respondeu desde `inicio` (o "Já resolvido hoje"):
 * houve uma "recebida na pausa" e, depois dela, uma enviada a partir de
 * `inicio`; e a conversa não voltou a ficar à espera.
 */
export function resolvidasDesde(naPausa: MensagemCurta[], enviadas: MensagemCurta[], inicio: string, agora: Date): string[] {
  const aindaEspera = new Set(esperasDe(naPausa, enviadas, agora).map((e) => e.conversa));
  const primeiraPausa = new Map<string, string>();
  for (const m of naPausa) {
    if (m.identificador_conversa.startsWith("teste:")) continue;
    if ((primeiraPausa.get(m.identificador_conversa) ?? "￿") > m.criado_em) primeiraPausa.set(m.identificador_conversa, m.criado_em);
  }
  const fora = new Set<string>();
  for (const e of enviadas) {
    const p = primeiraPausa.get(e.identificador_conversa);
    if (p && e.criado_em >= inicio && e.criado_em > p && !aindaEspera.has(e.identificador_conversa)) fora.add(e.identificador_conversa);
  }
  return [...fora];
}
