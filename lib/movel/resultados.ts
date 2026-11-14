import "server-only";

import { getMoedaDoCliente } from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";

import { chaveDoDia, moedaDoCliente } from "./formato";
import { limitesDoDia, semanaDe, somarDias } from "./hoje";

/**
 * Resultados do app. O destaque é o NÚMERO de agendamentos e não o valor:
 * a maioria das marcações é feita à mão no Google e não tem preço (medido a
 * 05/11 — só as do agente trazem valor), por isso um valor em euros mentia.
 * O valor só aparece como nota, quando existe.
 */

export type ChavePeriodo = "hoje" | "ontem" | "semana" | "mes" | "personalizado" | "tudo";
export type Intervalo = { chave: ChavePeriodo; de: string; ate: string };

type Numeros = {
  agendamentos: number;
  /** Agendamentos marcados por quem chegou de anúncio no mesmo período (pelo telefone). */
  agendaramAnuncio: number;
  doAgente: number;
  aMao: number;
  cancelados: number;
  conversas: number;
  leads: number;
  leadsAnuncio: number;
  valor: number;
  vieram: number;
};

export type DadosResultados = {
  anterior: Numeros;
  anuncios: { nome: string; leads: number }[];
  atual: Numeros;
  dias: number;
  gasto: number;
  leadsPorDia: { dia: string; n: number }[];
  moeda: string;
};

const MAX_DIAS = 92;
const diaOk = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** O intervalo de dias pedido, no fuso do cliente. Personalizado: no máximo 92 dias e nunca depois de hoje. */
export function intervaloDe(p: unknown, de: unknown, ate: unknown, hoje: string): Intervalo {
  if (p === "hoje") return { ate: hoje, chave: "hoje", de: hoje };
  if (p === "ontem") return { ate: somarDias(hoje, -1), chave: "ontem", de: somarDias(hoje, -1) };
  if (p === "mes") return { ate: hoje, chave: "mes", de: `${hoje.slice(0, 8)}01` };
  // 13/11/2026: "Uma semana" = últimos 7 dias; "Período total" desde 01/2025 (antes disso não há dados).
  if (p === "semana") return { ate: hoje, chave: "semana", de: somarDias(hoje, -6) };
  if (p === "tudo") return { ate: hoje, chave: "tudo", de: "2025-01-01" };
  if (p === "personalizado" && diaOk(de) && diaOk(ate)) {
    let [a, b] = de <= ate ? [de, ate] : [ate, de];
    if (b > hoje) b = hoje;
    if (a > b) a = b;
    const minimo = somarDias(b, -(MAX_DIAS - 1));
    if (a < minimo) a = minimo;
    return { ate: b, chave: "personalizado", de: a };
  }
  return { ate: hoje, chave: "semana", de: semanaDe(hoje)[0] };
}

export function diasDoIntervalo(i: { de: string; ate: string }) {
  return Math.round((Date.parse(`${i.ate}T12:00:00Z`) - Date.parse(`${i.de}T12:00:00Z`)) / 86_400_000) + 1;
}

async function numeros(clienteSlug: string, inicio: string, fim: string, agora: Date) {
  const base = createAdminClient();
  const [contactos, criados, noIntervalo, recebidas] = await Promise.all([
    base.from("lexia_contactos").select("criado_em, origem_tipo, origem_source_id, origem_titulo, telefone_digitos").eq("cliente_slug", clienteSlug).gte("criado_em", inicio).lt("criado_em", fim).limit(10000),
    base.from("lexia_agendamentos").select("valor_previsto, fim, origem, telefone_digitos").eq("cliente_slug", clienteSlug).gte("criado_no_google", inicio).lt("criado_no_google", fim).neq("estado", "cancelado").eq("dia_inteiro", false).limit(5000),
    base.from("lexia_agendamentos").select("estado").eq("cliente_slug", clienteSlug).gte("inicio", inicio).lt("inicio", fim).eq("estado", "cancelado").eq("dia_inteiro", false).limit(5000),
    base.from("lexia_mensagens").select("identificador_conversa").eq("cliente_slug", clienteSlug).eq("direccao", "recebida").gte("criado_em", inicio).lt("criado_em", fim).limit(30000),
  ]);
  const ags = criados.data ?? [];
  const cs = contactos.data ?? [];
  const doAgente = ags.filter((x) => x.origem === "agente");
  const telefonesAnuncio = new Set(cs.filter((c) => c.origem_tipo && c.origem_tipo !== "organico").map((c) => c.telefone_digitos).filter(Boolean));
  const n: Numeros = {
    aMao: ags.length - doAgente.length,
    agendamentos: ags.length,
    agendaramAnuncio: ags.filter((x) => x.telefone_digitos && telefonesAnuncio.has(x.telefone_digitos)).length,
    cancelados: (noIntervalo.data ?? []).length,
    conversas: new Set((recebidas.data ?? []).map((m) => m.identificador_conversa)).size,
    doAgente: doAgente.length,
    leads: cs.length,
    leadsAnuncio: cs.filter((c) => c.origem_tipo && c.origem_tipo !== "organico").length,
    valor: ags.reduce((a, x) => a + (Number(x.valor_previsto) || 0), 0),
    vieram: doAgente.filter((x) => Date.parse(x.fim) < agora.getTime()).length,
  };
  return { contactos: cs, n };
}

export async function dadosResultados(clienteSlug: string, fuso: string, intervalo: Intervalo, agora = new Date()): Promise<DadosResultados> {
  const base = createAdminClient();
  const dias = diasDoIntervalo(intervalo);
  const atual = { fim: limitesDoDia(intervalo.ate, fuso).fim, inicio: limitesDoDia(intervalo.de, fuso).inicio };
  const antesDe = somarDias(intervalo.de, -dias);
  const antes = { fim: atual.inicio, inicio: limitesDoDia(antesDe, fuso).inicio };

  const [a, b, custos, anuncios] = await Promise.all([
    numeros(clienteSlug, atual.inicio, atual.fim, agora),
    numeros(clienteSlug, antes.inicio, antes.fim, agora),
    base.from("lexia_campanha_custos").select("gasto, moeda").eq("cliente_slug", clienteSlug).gte("dia", intervalo.de).lte("dia", intervalo.ate).limit(5000),
    base.from("lexia_anuncios").select("anuncio_externo_id, nome").eq("cliente_slug", clienteSlug).eq("plataforma", "meta").limit(500),
  ]);

  const nomes = new Map((anuncios.data ?? []).map((x) => [x.anuncio_externo_id, x.nome as string]));
  const porAnuncio = new Map<string, number>();
  for (const c of a.contactos) {
    if (!c.origem_tipo || c.origem_tipo === "organico") continue;
    const nome = (c.origem_source_id && nomes.get(c.origem_source_id)) || c.origem_titulo || "Anúncio";
    porAnuncio.set(nome, (porAnuncio.get(nome) ?? 0) + 1);
  }
  const listaDias = Array.from({ length: dias }, (_, i) => somarDias(intervalo.de, i));

  return {
    anterior: b.n,
    anuncios: [...porAnuncio.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([nome, leads]) => ({ leads, nome })),
    atual: a.n,
    dias,
    gasto: (custos.data ?? []).reduce((s, x) => s + Number(x.gasto || 0), 0),
    leadsPorDia: listaDias.map((d) => ({ dia: d, n: a.contactos.filter((c) => chaveDoDia(c.criado_em, fuso) === d).length })),
    moeda: custos.data?.[0]?.moeda ?? moedaDoCliente(getMoedaDoCliente(clienteSlug), fuso),
  };
}
