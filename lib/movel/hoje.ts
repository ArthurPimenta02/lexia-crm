import "server-only";

import { getMoedaDoCliente } from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerTemperaturas } from "@/lib/temperatura/leitura";

import { canalDe, quemEscreveu, telefoneDe, telefoneLegivel } from "./conversas";
import { esperasDe, lerMensagensDaEspera, resolvidasDesde } from "./esperas";
import { chaveDoDia, moedaDoCliente, partesNoFuso } from "./formato";

/**
 * Os dados da tela "Hoje" (desenho v6 aprovado a 14/11), todos de uma empresa:
 * - os agendamentos de hoje (quantos, quantos do agente, o próximo, a lista);
 * - conversas e leads de hoje (no fuso da empresa);
 * - anúncios dos últimos 7 dias (gasto, leads de anúncio, quantos agendaram);
 * - "Para fazer agora": a lista única de esperas (lib/movel/esperas.ts) e os
 *   leads quentes sem marcação futura;
 * - "Já resolvido hoje": esperas respondidas hoje e marcações do agente hoje.
 * `pendencias` e `amanha` continuam para o Analista Lexia (lib/ajudante).
 */

export type Pendencia =
  | { tipo: "espera"; conversa: string; canal: string; nome: string; desde: string; previa: string }
  | { tipo: "sinal"; conversa: string | null; nome: string; inicio: string; valor: number | null };

export type Marcacao = { id: string; inicio: string; fim: string; nome: string; servico: string | null; executor: string | null; valor: number | null; pendenteSinal: boolean; conversa: string | null; doAgente: boolean };

export type Espera = { conversa: string; canal: string; nome: string; desde: string; previa: string };
export type Quente = { conversa: string; canal: string; nome: string; motivo: string };
export type Resolvido = { tipo: "respondida"; conversa: string; nome: string } | { tipo: "marcou"; conversa: string | null; nome: string; servico: string | null };

export type DadosHoje = {
  agenda: Marcacao[];
  amanha: number;
  avisoRecente: boolean;
  campanhas: null | { agendaram: number; gasto: number; leads: number };
  conversasHoje: { total: number; peloAgente: number };
  esperas: Espera[];
  leadsHoje: { total: number; deAnuncio: number };
  moeda: string;
  pendencias: Pendencia[];
  quentes: Quente[];
  resolvidos: Resolvido[];
};

/** Início e fim (UTC) do dia `chave` no fuso. */
export function limitesDoDia(chave: string, fuso: string) {
  const base = Date.parse(`${chave}T00:00:00Z`);
  const desvio = (inst: number) => {
    const p = partesNoFuso(new Date(inst), fuso);
    const [h, m] = p.hora.split(":").map(Number);
    return Date.UTC(p.ano, p.mes - 1, p.dia, h, m) - Math.floor(inst / 60_000) * 60_000;
  };
  const inicio = base - desvio(base);
  const fim = base + 86_400_000 - desvio(base + 86_400_000);
  return { fim: new Date(fim).toISOString(), inicio: new Date(inicio).toISOString() };
}

export function somarDias(chave: string, n: number) {
  return new Date(Date.parse(`${chave}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** As 7 chaves de dia da semana (segunda a domingo) que contém `chave`. */
export function semanaDe(chave: string) {
  const dow = new Date(`${chave}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const segunda = somarDias(chave, dow === 0 ? -6 : 1 - dow);
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

/** O texto da mensagem guardada (às vezes vem em JSON com `texto`). */
function textoDe(conteudo: unknown) {
  let texto = String(conteudo ?? "");
  try { const j = JSON.parse(texto); if (j && typeof j === "object") texto = String(j.texto ?? ""); } catch { /* texto simples */ }
  return texto.replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function dadosHoje(clienteSlug: string, fuso: string, agora = new Date()): Promise<DadosHoje> {
  const base = createAdminClient();
  const hoje = chaveDoDia(agora, fuso);
  const dHoje = limitesDoDia(hoje, fuso);
  const amanhaLim = limitesDoDia(somarDias(hoje, 1), fuso);
  const sete = { fim: limitesDoDia(somarDias(hoje, -1), fuso).fim, inicio: limitesDoDia(somarDias(hoje, -7), fuso).inicio };
  const desde24h = new Date(agora.getTime() - 24 * 3600_000).toISOString();

  const [agendaHoje, espera, msgsHoje, contactosHoje, contactos7, criados7, custos, marcadosHoje, temperaturas, avisos] = await Promise.all([
    base.from("lexia_agendamentos").select("id, inicio, fim, titulo, nome_cliente, telefone_digitos, servico, executor, valor_previsto, origem, dados, dia_inteiro")
      .eq("cliente_slug", clienteSlug).gte("inicio", dHoje.inicio).lt("inicio", amanhaLim.fim).neq("estado", "cancelado").eq("dia_inteiro", false).order("inicio", { ascending: true }).limit(500),
    lerMensagensDaEspera(clienteSlug, agora),
    base.from("lexia_mensagens").select("identificador_conversa, direccao, origem").eq("cliente_slug", clienteSlug).gte("criado_em", dHoje.inicio).lt("criado_em", dHoje.fim).limit(20000),
    base.from("lexia_contactos").select("origem_tipo").eq("cliente_slug", clienteSlug).gte("criado_em", dHoje.inicio).lt("criado_em", dHoje.fim).limit(5000),
    base.from("lexia_contactos").select("origem_tipo, telefone_digitos").eq("cliente_slug", clienteSlug).gte("criado_em", sete.inicio).lt("criado_em", sete.fim).limit(5000),
    base.from("lexia_agendamentos").select("telefone_digitos").eq("cliente_slug", clienteSlug).neq("estado", "cancelado").gte("criado_no_google", sete.inicio).lt("criado_no_google", sete.fim).limit(2000),
    base.from("lexia_campanha_custos").select("gasto, moeda").eq("cliente_slug", clienteSlug).gte("dia", somarDias(hoje, -7)).lte("dia", somarDias(hoje, -1)).limit(2000),
    base.from("lexia_agendamentos").select("nome_cliente, titulo, servico, telefone_digitos, criado_no_google").eq("cliente_slug", clienteSlug).neq("estado", "cancelado").eq("dia_inteiro", false).eq("origem", "agente").gte("criado_no_google", dHoje.inicio).lt("criado_no_google", dHoje.fim).order("criado_no_google", { ascending: false }).limit(20),
    lerTemperaturas(base, clienteSlug).catch(() => new Map()),
    base.from("lexia_app_envios").select("id").eq("cliente_slug", clienteSlug).gte("criado_em", desde24h).limit(1),
  ]);

  // ---------------- agenda de hoje (e quantos amanhã)
  type LinhaAg = { id: string; inicio: string; fim: string; titulo: string | null; nome_cliente: string | null; telefone_digitos: string | null; servico: string | null; executor: string | null; valor_previsto: number | null; origem: string | null; dados: Record<string, unknown> | null };
  const linhas = (agendaHoje.data ?? []) as LinhaAg[];
  const agenda: Marcacao[] = linhas
    .filter((l) => l.inicio < dHoje.fim)
    .map((l) => ({
      conversa: l.telefone_digitos ? `whatsapp:${l.telefone_digitos}` : null,
      doAgente: l.origem === "agente",
      executor: l.executor,
      fim: l.fim,
      id: l.id,
      inicio: l.inicio,
      nome: (l.nome_cliente || l.titulo || "").trim(),
      pendenteSinal: (l.dados?.estado_cliente as string | undefined) === "pendente_sinal",
      servico: l.servico,
      valor: l.valor_previsto === null ? null : Number(l.valor_previsto),
    }));
  const amanha = linhas.filter((l) => l.inicio >= dHoje.fim).length;

  // ---------------- conversas e leads de hoje
  const recebidas = new Set<string>();
  const doAgente = new Set<string>();
  for (const m of (msgsHoje.data ?? []) as { identificador_conversa: string; direccao: string | null; origem: string | null }[]) {
    if (m.identificador_conversa.startsWith("teste:")) continue;
    if (m.direccao !== "enviada") recebidas.add(m.identificador_conversa);
    else if (quemEscreveu(m.direccao, m.origem) === "agente") doAgente.add(m.identificador_conversa);
  }
  const conversasHoje = { peloAgente: [...recebidas].filter((c) => doAgente.has(c)).length, total: recebidas.size };
  const deAnuncio = (o: string | null) => Boolean(o && o !== "organico");
  const leadsHoje = { deAnuncio: (contactosHoje.data ?? []).filter((c) => deAnuncio(c.origem_tipo)).length, total: (contactosHoje.data ?? []).length };

  // ---------------- anúncios (últimos 7 dias, sem hoje: o gasto da Meta só fecha no dia seguinte)
  const custosLinhas = (custos.data ?? []) as { gasto: number; moeda: string }[];
  const leadsAnuncio = (contactos7.data ?? []).filter((c) => deAnuncio(c.origem_tipo));
  const telefonesAnuncio = new Set(leadsAnuncio.map((c) => c.telefone_digitos).filter(Boolean));
  const gasto = custosLinhas.reduce((a, c) => a + Number(c.gasto || 0), 0);
  const campanhas = custosLinhas.length || leadsAnuncio.length
    ? { agendaram: (criados7.data ?? []).filter((c) => c.telefone_digitos && telefonesAnuncio.has(c.telefone_digitos)).length, gasto, leads: leadsAnuncio.length }
    : null;

  // ---------------- esperas (a lista única), quentes e já resolvidos
  const listaEspera = esperasDe(espera.naPausa, espera.enviadas, agora);
  const resolvidas = resolvidasDesde(espera.naPausa, espera.enviadas, dHoje.inicio, agora);
  const emEspera = new Set(listaEspera.map((e) => e.conversa));
  const limiteQuente = new Date(agora.getTime() - 7 * 86_400_000).toISOString();
  const candidatasQuentes = [...temperaturas.entries()]
    .filter(([conversa, v]) => v.temperatura === "quente" && v.em >= limiteQuente && !emEspera.has(conversa) && !conversa.startsWith("teste:"))
    .sort((a, b) => (a[1].em < b[1].em ? 1 : -1))
    .slice(0, 20);
  const conversasNomes = [...new Set([...listaEspera.map((e) => e.conversa), ...resolvidas, ...candidatasQuentes.map(([c]) => c)])];

  const [fichas, ultimas] = await Promise.all([
    conversasNomes.length
      ? base.from("lexia_contactos").select("identificador_conversa, nome, telefone_digitos").eq("cliente_slug", clienteSlug).in("identificador_conversa", conversasNomes)
      : Promise.resolve({ data: [] as { identificador_conversa: string; nome: string | null; telefone_digitos: string | null }[] }),
    listaEspera.length
      ? base.from("lexia_mensagens").select("identificador_conversa, conteudo, criado_em").eq("cliente_slug", clienteSlug).eq("direccao", "recebida").gte("criado_em", listaEspera[0].desde).in("identificador_conversa", listaEspera.map((e) => e.conversa)).order("criado_em", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as { identificador_conversa: string; conteudo: string | null; criado_em: string }[] }),
  ]);
  const fichaPor = new Map((fichas.data ?? []).map((f) => [f.identificador_conversa, f]));
  const nomeDe = (conversa: string) => (fichaPor.get(conversa)?.nome || "").trim() || telefoneLegivel(telefoneDe(conversa)) || "";
  const previaPor = new Map<string, string>();
  for (const m of ultimas.data ?? []) if (!previaPor.has(m.identificador_conversa)) previaPor.set(m.identificador_conversa, textoDe(m.conteudo));

  const esperas: Espera[] = listaEspera.map((e) => ({ canal: canalDe(e.conversa), conversa: e.conversa, desde: e.desde, nome: nomeDe(e.conversa), previa: previaPor.get(e.conversa) ?? "" }));

  // Quentes sem marcação futura (a ligação marcação ↔ conversa é o telefone, como na agenda).
  const telefoneDaConversa = (c: string) => telefoneDe(c) ?? fichaPor.get(c)?.telefone_digitos ?? null;
  const telefonesQuentes = candidatasQuentes.map(([c]) => telefoneDaConversa(c)).filter(Boolean) as string[];
  const futuras = telefonesQuentes.length
    ? await base.from("lexia_agendamentos").select("telefone_digitos").eq("cliente_slug", clienteSlug).neq("estado", "cancelado").gte("inicio", agora.toISOString()).in("telefone_digitos", telefonesQuentes).limit(500)
    : { data: [] as { telefone_digitos: string | null }[] };
  const comMarcacao = new Set((futuras.data ?? []).map((f) => f.telefone_digitos));
  const quentes: Quente[] = candidatasQuentes
    .filter(([c]) => { const tel = telefoneDaConversa(c); return !tel || !comMarcacao.has(tel); })
    .slice(0, 5)
    .map(([conversa, v]) => ({ canal: canalDe(conversa), conversa, motivo: v.motivo, nome: nomeDe(conversa) }));

  const resolvidos: Resolvido[] = [
    ...resolvidas.map((conversa) => ({ conversa, nome: nomeDe(conversa), tipo: "respondida" as const })),
    ...((marcadosHoje.data ?? []) as { nome_cliente: string | null; titulo: string | null; servico: string | null; telefone_digitos: string | null }[]).map((m) => ({
      conversa: m.telefone_digitos ? `whatsapp:${m.telefone_digitos}` : null,
      nome: (m.nome_cliente || m.titulo || "").trim(),
      servico: m.servico,
      tipo: "marcou" as const,
    })),
  ].slice(0, 8);

  // Para o Analista Lexia: esperas + sinais por pagar.
  const pendencias: Pendencia[] = [
    ...esperas.map((e) => ({ ...e, tipo: "espera" as const })),
    ...agenda.filter((m) => m.pendenteSinal && Date.parse(m.fim) > agora.getTime()).map((m) => ({ conversa: m.conversa, inicio: m.inicio, nome: m.nome, tipo: "sinal" as const, valor: m.valor })),
  ];

  return {
    agenda,
    amanha,
    avisoRecente: Boolean(avisos.data?.length),
    campanhas,
    conversasHoje,
    esperas,
    leadsHoje,
    moeda: custosLinhas[0]?.moeda ?? moedaDoCliente(getMoedaDoCliente(clienteSlug), fuso),
    pendencias,
    quentes,
    resolvidos,
  };
}
