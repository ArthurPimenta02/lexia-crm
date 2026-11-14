import "server-only";

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

export type MarcacaoFicha = { id: string; inicio: string; servico: string | null; titulo: string; valor: number | null };

export type DadosFicha = {
  agendamentos: { futuros: MarcacaoFicha[]; passados: MarcacaoFicha[] };
  anuncio: string | null;
  canal: Canal;
  contactoId: string | null;
  deAnuncio: boolean;
  gasto: { total: number; visitas: number };
  nome: string;
  primeiroContato: string | null;
  telefone: string | null;
  telefoneLegivel: string | null;
  temperatura: TemperaturaLead | null;
};

export async function lerFicha(clienteSlug: string, conversa: string, agora = new Date()): Promise<DadosFicha | null> {
  const base = createAdminClient();
  const [contacto, primeira, temperatura] = await Promise.all([
    base.from("lexia_contactos").select("id, nome, telefone, telefone_digitos, criado_em, origem_tipo, origem_source_id, origem_titulo").eq("cliente_slug", clienteSlug).eq("identificador_conversa", conversa).maybeSingle(),
    base.from("lexia_mensagens").select("criado_em").eq("cliente_slug", clienteSlug).eq("identificador_conversa", conversa).order("criado_em", { ascending: true }).limit(1),
    temperaturaDaConversa(clienteSlug, conversa).catch(() => null),
  ]);
  const ficha = contacto.data as null | { id: string; nome: string | null; telefone: string | null; telefone_digitos: string | null; criado_em: string | null; origem_tipo: string | null; origem_source_id: string | null; origem_titulo: string | null };
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
      .select("id, inicio, servico, titulo, valor_previsto")
      .eq("cliente_slug", clienteSlug)
      .eq("telefone_digitos", telefone)
      .neq("estado", "cancelado")
      .eq("dia_inteiro", false)
      .order("inicio", { ascending: false })
      .limit(60);
    marcacoes = (data ?? []).map((m) => ({ id: m.id, inicio: m.inicio, servico: m.servico, titulo: (m.titulo || "").trim(), valor: m.valor_previsto === null ? null : Number(m.valor_previsto) }));
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
    gasto: { total: passados.reduce((a, m) => a + (m.valor ?? 0), 0), visitas: passados.length },
    nome: (ficha?.nome || "").trim() || telefoneLegivel(telefone) || "",
    primeiroContato: datas.length ? datas.sort()[0] : null,
    telefone,
    telefoneLegivel: telefoneLegivel(telefone),
    temperatura,
  };
}
