import "server-only";

import { chavePresenca, presencasDe, type Presenca } from "@/lib/agenda/presenca";
import { getCanalLabel } from "@/lib/clientes/ficha";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TemperaturaLead } from "@/lib/temperatura/leitura";

import { canalDe, telefoneDe, telefoneLegivel, temperaturaDaConversa, type Canal } from "./conversas";

/**
 * A ficha de um cliente no app (desenho v6, 14/11), aberta pelo nome no chat.
 * Tudo preso ao `clienteSlug` da sessão.
 *
 * Agendamentos ↔ conversa: a MESMA ligação que a agenda do app já usa
 * (lib/movel/agenda.ts e hoje.ts) — o `telefone_digitos` da marcação é o
 * telefone da conversa (`whatsapp:<dígitos>`) ou o da ficha do contacto.
 * Instagram e Messenger não têm telefone: sem telefone na ficha não há
 * ligação fiável, e a ficha mostra só o resto (nada de adivinhar pelo nome).
 */

export type MarcacaoFicha = { id: string; inicio: string; presenca: Presenca | null; servico: string | null; titulo: string; valor: number | null };

export type DadosFicha = {
  agendamentos: { futuros: MarcacaoFicha[]; passados: MarcacaoFicha[] };
  anuncio: string | null;
  canal: Canal;
  contactoId: string | null;
  deAnuncio: boolean;
  /** Faltas marcadas no app (compareceu/faltou, 25/11). */
  faltas: number;
  gasto: { total: number; visitas: number };
  notas: string | null;
  /** O que a equipa disse de onde veio (sobrepõe-se ao detetado). */
  origemManual: { nota: string | null; rotulo: string; valor: string } | null;
  nome: string;
  primeiroContato: string | null;
  telefone: string | null;
  telefoneLegivel: string | null;
  temperatura: TemperaturaLead | null;
};

export async function lerFicha(clienteSlug: string, conversa: string, agora = new Date()): Promise<DadosFicha | null> {
  const base = createAdminClient();
  const [contacto, primeira, temperatura] = await Promise.all([
    base.from("lexia_contactos").select("id, nome, telefone, telefone_digitos, criado_em, origem_tipo, origem_source_id, origem_titulo, origem_manual, origem_manual_nota, notas").eq("cliente_slug", clienteSlug).eq("identificador_conversa", conversa).maybeSingle(),
    base.from("lexia_mensagens").select("criado_em").eq("cliente_slug", clienteSlug).eq("identificador_conversa", conversa).order("criado_em", { ascending: true }).limit(1),
    temperaturaDaConversa(clienteSlug, conversa).catch(() => null),
  ]);
  const ficha = contacto.data as null | { id: string; nome: string | null; telefone: string | null; telefone_digitos: string | null; criado_em: string | null; origem_tipo: string | null; origem_source_id: string | null; origem_titulo: string | null; origem_manual: string | null; origem_manual_nota: string | null; notas: string | null };
  const primeiraMsg = (primeira.data?.[0]?.criado_em as string | undefined) ?? null;
  if (!ficha && !primeiraMsg) return null;

  const telefone = telefoneDe(conversa) ?? (ficha?.telefone_digitos || (ficha?.telefone ? String(ficha.telefone).replace(/\D/g, "") : "") || null);
  const deAnuncio = Boolean(ficha?.origem_tipo && ficha.origem_tipo !== "organico");

  let anuncio: string | null = null;
  if (deAnuncio && ficha?.origem_source_id) {
    const { data } = await base.from("lexia_anuncios").select("nome").eq("cliente_slug", clienteSlug).eq("anuncio_externo_id", ficha.origem_source_id).limit(1);
    anuncio = (data?.[0]?.nome as string | undefined) ?? null;
  }
  if (deAnuncio && !anuncio) anuncio = ficha?.origem_titulo?.trim() || null;

  let marcacoes: MarcacaoFicha[] = [];
  if (telefone && telefone.length >= 6) {
    const { data } = await base
      .from("lexia_agendamentos")
      .select("id, inicio, servico, titulo, valor_previsto, calendario_id, event_id")
      .eq("cliente_slug", clienteSlug)
      .eq("telefone_digitos", telefone)
      .neq("estado", "cancelado")
      .eq("dia_inteiro", false)
      .order("inicio", { ascending: false })
      .limit(60);
    const presencas = await presencasDe(clienteSlug, (data ?? []) as { calendario_id: string; event_id: string }[]);
    marcacoes = (data ?? []).map((m) => ({ id: m.id, inicio: m.inicio, presenca: presencas.get(chavePresenca(String(m.calendario_id), String(m.event_id))) ?? null, servico: m.servico, titulo: (m.titulo || "").trim(), valor: m.valor_previsto === null ? null : Number(m.valor_previsto) }));
  }
  const agoraIso = agora.toISOString();
  const futuros = marcacoes.filter((m) => m.inicio >= agoraIso).reverse();
  const passados = marcacoes.filter((m) => m.inicio < agoraIso);

  const datas = [ficha?.criado_em, primeiraMsg].filter(Boolean) as string[];
  return {
    agendamentos: { futuros, passados },
    anuncio,
    canal: canalDe(conversa),
    contactoId: ficha?.id ?? null,
    deAnuncio,
    faltas: passados.filter((m) => m.presenca === "faltou").length,
    // Uma falta não é visita nem dinheiro gasto.
    gasto: { total: passados.filter((m) => m.presenca !== "faltou").reduce((a, m) => a + (m.valor ?? 0), 0), visitas: passados.filter((m) => m.presenca !== "faltou").length },
    notas: ficha?.notas?.trim() || null,
    origemManual: ficha?.origem_manual ? { nota: ficha.origem_manual_nota ?? null, rotulo: getCanalLabel(ficha.origem_manual) ?? ficha.origem_manual, valor: ficha.origem_manual } : null,
    nome: (ficha?.nome || "").trim() || telefoneLegivel(telefone) || "",
    primeiroContato: datas.length ? datas.sort()[0] : null,
    telefone,
    telefoneLegivel: telefoneLegivel(telefone),
    temperatura,
  };
}
