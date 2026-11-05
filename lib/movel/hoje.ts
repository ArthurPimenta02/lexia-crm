import "server-only";

import { getMoedaDoCliente } from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";

import { canalDe, telefoneDe, telefoneLegivel } from "./conversas";
import { chaveDoDia, moedaDoCliente, partesNoFuso } from "./formato";

/**
 * Os dados da tela "Hoje" (desenho aprovado a 05/11), todos de uma empresa:
 * - quem precisa do dono (clientes à espera de uma pessoa, sinal por pagar);
 * - a agenda do dia (o próximo em destaque) e o valor previsto;
 * - ontem em números, com os leads dos últimos 7 dias;
 * - campanhas dos últimos 7 dias (gasto, leads de anúncio, custo por lead).
 * Leituras curtas: só as colunas que a tela mostra.
 */

export type Pendencia =
  | { tipo: "espera"; conversa: string; canal: string; nome: string; desde: string; previa: string }
  | { tipo: "sinal"; conversa: string | null; nome: string; inicio: string; valor: number | null };

export type Marcacao = { id: string; inicio: string; fim: string; nome: string; servico: string | null; executor: string | null; valor: number | null; pendenteSinal: boolean; conversa: string | null };

export type DadosHoje = {
  agenda: Marcacao[];
  amanha: number;
  campanhas: null | {
    anuncios: { nome: string; leads: number }[];
    ativos: number;
    gasto: number;
    gastoPorDia: number[];
    leads: number;
    agendaram: number;
    valorAgendado: number;
  };
  diasComMarcacao: string[]; // chaves AAAA-MM-DD desta semana
  moeda: string;
  ontem: { leads: number; agendaram: number; valor: number; leadsPorDia: number[]; mediaLeads: number };
  pendencias: Pendencia[];
  semana: string[]; // as 7 chaves de dia (segunda a domingo) da semana de hoje
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

export async function dadosHoje(clienteSlug: string, fuso: string, agora = new Date()): Promise<DadosHoje> {
  const base = createAdminClient();
  const hoje = chaveDoDia(agora, fuso);
  const semana = semanaDe(hoje);
  const dHoje = limitesDoDia(hoje, fuso);
  const dSemana = { fim: limitesDoDia(semana[6], fuso).fim, inicio: limitesDoDia(semana[0], fuso).inicio };
  const sete = { fim: limitesDoDia(somarDias(hoje, -1), fuso).fim, inicio: limitesDoDia(somarDias(hoje, -7), fuso).inicio };
  const ontem = limitesDoDia(somarDias(hoje, -1), fuso);
  const desde48h = new Date(agora.getTime() - 48 * 3600_000).toISOString();

  const [agendaSemana, naPausa, contactos7, criadosOntem, custos, anunciosAtivos] = await Promise.all([
    base.from("lexia_agendamentos").select("id, inicio, fim, titulo, nome_cliente, telefone_digitos, servico, executor, valor_previsto, estado, dados, dia_inteiro")
      .eq("cliente_slug", clienteSlug).gte("inicio", dSemana.inicio).lt("inicio", limitesDoDia(somarDias(semana[6], 1), fuso).fim).neq("estado", "cancelado").order("inicio", { ascending: true }).limit(500),
    base.from("lexia_mensagens").select("identificador_conversa, criado_em").eq("cliente_slug", clienteSlug).eq("origem", "recebida_na_pausa").gte("criado_em", desde48h).order("criado_em", { ascending: true }).limit(500),
    base.from("lexia_contactos").select("criado_em, origem_tipo, origem_source_id, origem_titulo, telefone_digitos").eq("cliente_slug", clienteSlug).gte("criado_em", sete.inicio).lt("criado_em", sete.fim).limit(5000),
    base.from("lexia_agendamentos").select("valor_previsto, telefone_digitos, criado_no_google").eq("cliente_slug", clienteSlug).neq("estado", "cancelado").gte("criado_no_google", sete.inicio).lt("criado_no_google", sete.fim).limit(2000),
    base.from("lexia_campanha_custos").select("dia, gasto, moeda").eq("cliente_slug", clienteSlug).gte("dia", somarDias(hoje, -7)).lte("dia", somarDias(hoje, -1)).limit(2000),
    base.from("lexia_anuncios").select("anuncio_externo_id, nome, estado").eq("cliente_slug", clienteSlug).eq("plataforma", "meta").limit(500),
  ]);

  // ---------------- precisa de si: à espera
  const pendencias: Pendencia[] = [];
  const primeira = new Map<string, string>();
  for (const m of naPausa.data ?? []) if (!primeira.has(m.identificador_conversa)) primeira.set(m.identificador_conversa, m.criado_em);
  const conversasEspera = [...primeira.keys()];
  if (conversasEspera.length) {
    const [enviadas, fichas, ultimas] = await Promise.all([
      base.from("lexia_mensagens").select("identificador_conversa, criado_em").eq("cliente_slug", clienteSlug).eq("direccao", "enviada").gte("criado_em", desde48h).in("identificador_conversa", conversasEspera).limit(2000),
      base.from("lexia_contactos").select("identificador_conversa, nome, telefone").eq("cliente_slug", clienteSlug).in("identificador_conversa", conversasEspera),
      base.from("lexia_mensagens").select("identificador_conversa, conteudo, criado_em").eq("cliente_slug", clienteSlug).eq("direccao", "recebida").gte("criado_em", desde48h).in("identificador_conversa", conversasEspera).order("criado_em", { ascending: false }).limit(300),
    ]);
    const ultimaEnviada = new Map<string, string>();
    for (const m of enviadas.data ?? []) if ((ultimaEnviada.get(m.identificador_conversa) ?? "") < m.criado_em) ultimaEnviada.set(m.identificador_conversa, m.criado_em);
    const nomes = new Map((fichas.data ?? []).map((f) => [f.identificador_conversa, f]));
    const previa = new Map<string, string>();
    for (const m of ultimas.data ?? []) if (!previa.has(m.identificador_conversa)) previa.set(m.identificador_conversa, String(m.conteudo ?? ""));
    for (const conversa of conversasEspera) {
      // início do episódio: primeira "recebida na pausa" depois da última enviada
      const env = ultimaEnviada.get(conversa) ?? "";
      const episodio = (naPausa.data ?? []).filter((m) => m.identificador_conversa === conversa && m.criado_em > env);
      if (!episodio.length) continue;
      const ficha = nomes.get(conversa);
      const tel = telefoneDe(conversa);
      let texto = previa.get(conversa) ?? "";
      try { const j = JSON.parse(texto); if (j && typeof j === "object") texto = String(j.texto ?? ""); } catch { /* texto simples */ }
      pendencias.push({
        canal: canalDe(conversa), conversa, desde: episodio[0].criado_em, nome: (ficha?.nome || "").trim() || telefoneLegivel(tel) || "Cliente",
        previa: texto.replace(/\s+/g, " ").slice(0, 120), tipo: "espera",
      });
    }
    pendencias.sort((a, b) => ((a as { desde: string }).desde < (b as { desde: string }).desde ? -1 : 1));
  }

  // ---------------- agenda
  type LinhaAg = { id: string; inicio: string; fim: string; titulo: string | null; nome_cliente: string | null; telefone_digitos: string | null; servico: string | null; executor: string | null; valor_previsto: number | null; dados: Record<string, unknown> | null; dia_inteiro: boolean };
  const linhasSemana = (agendaSemana.data ?? []) as LinhaAg[];
  const diasComMarcacao = [...new Set(linhasSemana.filter((l) => !l.dia_inteiro).map((l) => chaveDoDia(l.inicio, fuso)))];
  const agenda: Marcacao[] = linhasSemana
    .filter((l) => !l.dia_inteiro && l.inicio >= dHoje.inicio && l.inicio < dHoje.fim)
    .map((l) => ({
      conversa: l.telefone_digitos ? `whatsapp:${l.telefone_digitos}` : null,
      executor: l.executor,
      fim: l.fim,
      id: l.id,
      inicio: l.inicio,
      nome: (l.nome_cliente || l.titulo || "").trim(),
      pendenteSinal: (l.dados?.estado_cliente as string | undefined) === "pendente_sinal",
      servico: l.servico,
      valor: l.valor_previsto === null ? null : Number(l.valor_previsto),
    }));
  const amanha = linhasSemana.filter((l) => !l.dia_inteiro && chaveDoDia(l.inicio, fuso) === somarDias(hoje, 1)).length;
  for (const m of agenda) {
    if (m.pendenteSinal && Date.parse(m.fim) > agora.getTime()) pendencias.push({ conversa: m.conversa, inicio: m.inicio, nome: m.nome, tipo: "sinal", valor: m.valor });
  }

  // ---------------- ontem e últimos 7 dias
  const dias7 = Array.from({ length: 7 }, (_, i) => somarDias(hoje, i - 7));
  const leadsPorDia = dias7.map((d) => (contactos7.data ?? []).filter((c) => chaveDoDia(c.criado_em, fuso) === d).length);
  const criados = (criadosOntem.data ?? []) as { valor_previsto: number | null; telefone_digitos: string | null; criado_no_google: string }[];
  const deOntem = criados.filter((c) => c.criado_no_google >= ontem.inicio && c.criado_no_google < ontem.fim);
  const ontemDados = {
    agendaram: deOntem.length,
    leads: leadsPorDia[6],
    leadsPorDia,
    mediaLeads: leadsPorDia.slice(0, 6).reduce((a, b) => a + b, 0) / 6,
    valor: deOntem.reduce((a, c) => a + (Number(c.valor_previsto) || 0), 0),
  };

  // ---------------- campanhas (7 dias)
  const custosLinhas = (custos.data ?? []) as { dia: string; gasto: number; moeda: string }[];
  let campanhas: DadosHoje["campanhas"] = null;
  const deAnuncio = (contactos7.data ?? []).filter((c) => c.origem_tipo && c.origem_tipo !== "organico");
  if (custosLinhas.length || deAnuncio.length) {
    const nomesAnuncio = new Map((anunciosAtivos.data ?? []).map((a) => [a.anuncio_externo_id, a.nome as string]));
    const porAnuncio = new Map<string, number>();
    for (const c of deAnuncio) {
      const nome = (c.origem_source_id && nomesAnuncio.get(c.origem_source_id)) || c.origem_titulo || "Anúncio";
      porAnuncio.set(nome, (porAnuncio.get(nome) ?? 0) + 1);
    }
    const telefonesAnuncio = new Set(deAnuncio.map((c) => c.telefone_digitos).filter(Boolean));
    const agendaramDeAnuncio = criados.filter((c) => c.telefone_digitos && telefonesAnuncio.has(c.telefone_digitos));
    campanhas = {
      agendaram: agendaramDeAnuncio.length,
      anuncios: [...porAnuncio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nome, leads]) => ({ leads, nome })),
      ativos: (anunciosAtivos.data ?? []).filter((a) => a.estado === "ACTIVE").length,
      gasto: custosLinhas.reduce((a, c) => a + Number(c.gasto || 0), 0),
      gastoPorDia: dias7.map((d) => custosLinhas.filter((c) => c.dia === d).reduce((a, c) => a + Number(c.gasto || 0), 0)),
      leads: deAnuncio.length,
      valorAgendado: agendaramDeAnuncio.reduce((a, c) => a + (Number(c.valor_previsto) || 0), 0),
    };
  }

  return {
    agenda,
    amanha,
    campanhas,
    diasComMarcacao,
    moeda: custosLinhas[0]?.moeda ?? moedaDoCliente(getMoedaDoCliente(clienteSlug), fuso),
    ontem: ontemDados,
    pendencias,
    semana,
  };
}
