import "server-only";

import { getMoedaDoCliente } from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";

import { chaveDoDia, moedaDoCliente } from "./formato";
import { limitesDoDia, somarDias } from "./hoje";

export type Periodo = 1 | 7 | 30;

type Numeros = { agendaram: number; conversas: number; leads: number; leadsAnuncio: number; valor: number; vieram: number };

export type DadosResultados = {
  anterior: Numeros;
  anuncios: { nome: string; leads: number }[];
  atual: Numeros;
  gasto: number;
  leadsPorDia: { dia: string; n: number }[];
  moeda: string;
};

async function numeros(clienteSlug: string, inicio: string, fim: string, agora: Date) {
  const base = createAdminClient();
  const [contactos, agendamentos, recebidas] = await Promise.all([
    base.from("lexia_contactos").select("criado_em, origem_tipo, origem_source_id, origem_titulo").eq("cliente_slug", clienteSlug).gte("criado_em", inicio).lt("criado_em", fim).limit(10000),
    base.from("lexia_agendamentos").select("valor_previsto, fim, estado").eq("cliente_slug", clienteSlug).gte("criado_no_google", inicio).lt("criado_no_google", fim).neq("estado", "cancelado").eq("dia_inteiro", false).limit(5000),
    base.from("lexia_mensagens").select("identificador_conversa").eq("cliente_slug", clienteSlug).eq("direccao", "recebida").gte("criado_em", inicio).lt("criado_em", fim).limit(20000),
  ]);
  const ags = agendamentos.data ?? [];
  const cs = contactos.data ?? [];
  const n: Numeros = {
    agendaram: ags.length,
    conversas: new Set((recebidas.data ?? []).map((m) => m.identificador_conversa)).size,
    leads: cs.length,
    leadsAnuncio: cs.filter((c) => c.origem_tipo && c.origem_tipo !== "organico").length,
    valor: ags.reduce((a, x) => a + (Number(x.valor_previsto) || 0), 0),
    vieram: ags.filter((x) => Date.parse(x.fim) < agora.getTime()).length,
  };
  return { contactos: cs, n };
}

export async function dadosResultados(clienteSlug: string, fuso: string, periodo: Periodo, agora = new Date()): Promise<DadosResultados> {
  const base = createAdminClient();
  const hoje = chaveDoDia(agora, fuso);
  const ultimo = somarDias(hoje, -1);
  const primeiro = somarDias(hoje, -periodo);
  const atual = { fim: limitesDoDia(ultimo, fuso).fim, inicio: limitesDoDia(primeiro, fuso).inicio };
  const antes = { fim: atual.inicio, inicio: limitesDoDia(somarDias(primeiro, -periodo), fuso).inicio };

  const [a, b, custos, anuncios] = await Promise.all([
    numeros(clienteSlug, atual.inicio, atual.fim, agora),
    numeros(clienteSlug, antes.inicio, antes.fim, agora),
    base.from("lexia_campanha_custos").select("gasto, moeda").eq("cliente_slug", clienteSlug).gte("dia", primeiro).lte("dia", ultimo).limit(5000),
    base.from("lexia_anuncios").select("anuncio_externo_id, nome").eq("cliente_slug", clienteSlug).eq("plataforma", "meta").limit(500),
  ]);

  const nomes = new Map((anuncios.data ?? []).map((x) => [x.anuncio_externo_id, x.nome as string]));
  const porAnuncio = new Map<string, number>();
  for (const c of a.contactos) {
    if (!c.origem_tipo || c.origem_tipo === "organico") continue;
    const nome = (c.origem_source_id && nomes.get(c.origem_source_id)) || c.origem_titulo || "Anúncio";
    porAnuncio.set(nome, (porAnuncio.get(nome) ?? 0) + 1);
  }
  const dias = Array.from({ length: periodo }, (_, i) => somarDias(primeiro, i));

  return {
    anterior: b.n,
    anuncios: [...porAnuncio.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([nome, leads]) => ({ leads, nome })),
    atual: a.n,
    gasto: (custos.data ?? []).reduce((s, x) => s + Number(x.gasto || 0), 0),
    leadsPorDia: dias.map((d) => ({ dia: d, n: a.contactos.filter((c) => chaveDoDia(c.criado_em, fuso) === d).length })),
    moeda: custos.data?.[0]?.moeda ?? moedaDoCliente(getMoedaDoCliente(clienteSlug), fuso),
  };
}
