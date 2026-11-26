/**
 * Um evento da agenda é um atendimento de um cliente? E qual o nome dele? (26/11/2026)
 *
 * A maior parte das marcações é posta à mão no Google ("Pedro St Iria",
 * "(Samuel) Atendimento Alex Vidal (first laser)"): o espelho não tem
 * nome_cliente nem telefone, só o título. Estas regras são as MESMAS do
 * serviço de avisos na VPS (lexia-agente/plataforma/avisos/aviso.ts:
 * NAO_ATENDIMENTO, ehAtendimento, nomeLimpo) — mudar lá e cá juntos.
 */

const NAO_ATENDIMENTO = /presta[cç][aã]o|vence|pagamento|thanksgiving|feriado|almo[cç]o|folga|pessoal|m[eé]dic|dentista|anivers|banco|bloque|f[eé]rias|natal|christmas|holiday|day off/i;

type EventoCurto = { nome_cliente?: string | null; servico?: string | null; titulo?: string | null };

/** "(Samuel) Atendimento Jalk Raony (first depil)" → "Jalk Raony"; "Botox — Ana" → "Ana". Vazio se não houver nada. */
export function nomeDoEvento(e: EventoCurto): string {
  const bruto = (e.nome_cliente || e.titulo || "").trim();
  let s = bruto.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(atendimento|agendamento|avalia[cç][aã]o|consulta|marca[cç][aã]o)\b\s*[-:–—]?\s*/i, "").trim();
  const partes = s.split(/\s+[-–—]\s+/);
  if (partes.length > 1 && !e.nome_cliente) s = partes[partes.length - 1].trim();
  return s || bruto;
}

/** Tem cliente: nome/telefone no espelho, ou um título com nome que não é evento pessoal/feriado/bloqueio. */
export function eventoDeCliente(e: EventoCurto & { telefone_digitos?: string | null }): boolean {
  if (e.nome_cliente || e.telefone_digitos) return true;
  if (!e.titulo?.trim() || NAO_ATENDIMENTO.test(`${e.titulo} ${e.servico ?? ""}`)) return false;
  return Boolean(nomeDoEvento(e));
}
