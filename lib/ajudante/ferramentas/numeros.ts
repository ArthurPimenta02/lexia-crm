import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Escopo } from "@/lib/ajudante/ferramentas";
import { horarioPorCliente } from "@/lib/agenda/marcar";
import { instanteNoFuso } from "@/lib/clientes/timezone";
import { canalDe, telefoneDe } from "@/lib/movel/conversas";
import { esperasDe, type MensagemCurta } from "@/lib/movel/esperas-regra";
import { chaveDoDia } from "@/lib/movel/formato";
import { limitesDoDia, semanaDe, somarDias } from "@/lib/movel/hoje";
import { diasDoIntervalo } from "@/lib/movel/resultados";
import { chaveTelefone } from "@/lib/pipeline/etapas";
import {
  createServicosClient,
  getServicosAgendaveisConfig,
  getServicosConfig,
  moedaPadraoDoCliente,
  normalizarNomeServico,
} from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { lerTemperaturas } from "@/lib/temperatura/leitura";

/**
 * O PAINEL DE NÚMEROS do Analista Lexia (19/11/2026).
 *
 * Porque existe: perguntado sobre CAC e agendamentos por origem, o modelo fez
 * as contas de cabeça e deu números diferentes em respostas diferentes, disse
 * que a agenda "não mostra a origem" e somou só as marcações com valor. Aqui
 * as contas são CÓDIGO: o modelo só lê o resultado, e o mesmo pedido dá sempre
 * o mesmo número.
 *
 * As regras (e o que cada número quer dizer, que vai também no resultado):
 * - leads novos = fichas (`lexia_contactos`) criadas no período, sem as fundidas.
 * - conversas = conversas com pelo menos uma mensagem recebida no período.
 * - conversas com pessoa = conversas onde o cliente escreveu com o agente em
 *   pausa (`origem = recebida_na_pausa`): pediu uma pessoa ou a equipa
 *   assumiu. A `lexia_handoffs` está vazia (o handoff vive no Redis), por isso
 *   é este o sinal comum a todos os clientes.
 * - marcados = marcações CRIADAS no período (`criado_no_google`), não
 *   canceladas — a mesma regra da tela Resultados.
 * - realizados / cancelados = marcações com o ATENDIMENTO no período; realizado
 *   = já passou e não foi cancelado. O espelho do Google não diz se a pessoa
 *   veio, por isso "faltas" é sempre `null` (sem dado), nunca zero.
 * - ligação marcação → ficha → origem: últimos 9 dígitos do telefone
 *   (`chaveTelefone`, a mesma do painel de campanhas). Sem ficha que bata, a
 *   marcação conta como "sem ficha" e nunca é atribuída a nada. Por isso os
 *   "atribuídos" são um MÍNIMO e o CAC por anúncio um MÁXIMO.
 * - valor: o real (`valor_previsto` do espelho, ou da base própria do cliente
 *   quando há) e, sem ele, o preço base da tabela de serviços pelo nome do
 *   serviço. Quantos são estimados e quantos ficaram sem valor vai no resultado.
 */

type Base = Pick<SupabaseClient, "from">;

/** Quem lê. Os testes passam duplos; em produção são as bases verdadeiras. */
export type Dependencias = {
  agora?: Date;
  base?: Base;
  /** A base própria do cliente (preços, e no Detail a tabela `marcacoes`). `null` = sem credenciais. */
  baseDoCliente?: (envPrefix: string) => Base | null;
};

export const MAX_DIAS_NUMEROS = 180;
const AGRUPAMENTOS = ["canal", "origem", "campanha", "servico", "dia", "semana", "nenhum"] as const;
type Agrupar = (typeof AGRUPAMENTOS)[number];
const FOLGA_MS = 86_400_000; // uma marcação criada até 1 dia antes da ficha ainda conta como dela (a ficha às vezes nasce depois)
const ORIGENS_PAGAS = new Set(["ctwa", "instagram_ad", "messenger_ad", "anuncio"]);

const diaOk = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const div = (a: number, b: number) => (b > 0 ? r2(a / b) : null);

/** O período pedido, limpo: datas válidas, no máximo 180 dias, nunca invertido nem depois de hoje. Por omissão, os últimos 30 dias. */
export function periodoNumeros(args: Record<string, unknown>, hoje: string) {
  let de = diaOk(args.de) ? args.de : somarDias(hoje, -29);
  let ate = diaOk(args.ate) ? args.ate : hoje;
  if (de > ate) [de, ate] = [ate, de];
  if (ate > hoje) ate = hoje;
  if (de > ate) de = ate;
  const minimo = somarDias(ate, -(MAX_DIAS_NUMEROS - 1));
  if (de < minimo) de = minimo;
  return { ate, de };
}

// ----------------------------------------------------------------- linhas lidas

export type Ficha = { identificador_conversa: string | null; telefone_digitos: string | null; origem_tipo: string | null; origem_source_id: string | null; criado_em: string; canal: string | null; fundido_em?: string | null; nome?: string | null };
export type Marcacao = { id: string; inicio: string; fim: string | null; estado: string | null; servico: string | null; executor: string | null; valor_previsto: number | string | null; telefone_digitos: string | null; criado_no_google: string | null; criado_em?: string | null; dia_inteiro?: boolean | null };
export type Mensagem = { identificador_conversa: string; criado_em: string; origem: string | null };
export type Custo = { campanha_id: string; dia: string; gasto: number | string | null; moeda: string | null };
export type Campanha = { id: string; campanha_externa_id: string | null; nome: string | null };
export type Anuncio = { anuncio_externo_id: string | null; campanha_externa_id: string | null; campanha_nome: string | null };
/** Linha da `marcacoes` da base própria (só o Detail tem). */
export type MarcacaoPropria = { telefone: string | null; data_inicio: string | null; valor_previsto: number | string | null; estado: string | null };

export type Dados = {
  anuncios: Anuncio[];
  campanhas: Campanha[];
  custos: Custo[];
  fichas: Ficha[];
  marcacoes: Marcacao[];
  marcacoesProprias: MarcacaoPropria[] | null;
  mensagens: Mensagem[];
  /** nome normalizado → preço base. `null` = não há tabela de serviços ligada (ou faltam credenciais). */
  precos: Map<string, number> | null;
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

// ----------------------------------------------------------------- contas (puras)

type Valor = { real: number; estimado: number; n_real: number; n_estimado: number; n_sem_valor: number };
const valorVazio = (): Valor => ({ n_estimado: 0, n_real: 0, n_sem_valor: 0, estimado: 0, real: 0 });

type Contagem = {
  leads: number;
  leadsAnuncio: number;
  leadsQueMarcaram: number;
  conversas: Set<string>;
  comPessoa: Set<string>;
  marcados: number;
  marcadosAnuncio: number;
  realizados: number;
  cancelados: number;
  valorRealizados: Valor;
  valorMarcados: Valor;
  gasto: number;
  /** Só no agrupamento por campanha: o grupo é uma campanha da Meta (tem gasto); os outros não têm gasto que se lhes possa dar. */
  ehCampanha?: boolean;
};
const contagemVazia = (): Contagem => ({ cancelados: 0, comPessoa: new Set(), conversas: new Set(), gasto: 0, leads: 0, leadsAnuncio: 0, leadsQueMarcaram: 0, marcados: 0, marcadosAnuncio: 0, realizados: 0, valorMarcados: valorVazio(), valorRealizados: valorVazio() });

type Contexto = {
  agoraMs: number;
  fichas: Ficha[];
  fuso: string;
  fichaPorConversa: Map<string, Ficha>;
  fichaPorTelefone: Map<string, Ficha>;
  campanhaDoAnuncio: Map<string, { id: string; nome: string }>;
  nomeDaCampanha: Map<string, string>; // campanha_externa_id → nome
  externaDaCampanha: Map<string, string>; // lexia_campanhas.id → campanha_externa_id
  valorDe: (m: Marcacao) => { valor: number | null; tipo: "real" | "estimado" | "sem_valor" };
  marcacoesPorTelefone: Map<string, Marcacao[]>;
};

const deAnuncio = (f: Ficha | null) => Boolean(f?.origem_tipo && ORIGENS_PAGAS.has(f.origem_tipo));
const naoCancelada = (m: Marcacao) => m.estado !== "cancelado";
const criadaEm = (m: Marcacao) => m.criado_no_google ?? m.criado_em ?? m.inicio;

function montarContexto(d: Dados, fuso: string, agora: Date): Contexto {
  // Fichas sem as fundidas e sem a Área de testes. Por telefone fica a MAIS ANTIGA (a origem é a do 1.º contacto).
  const fichas = d.fichas.filter((f) => !f.fundido_em && !String(f.identificador_conversa ?? "").startsWith("teste:")).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
  const fichaPorConversa = new Map<string, Ficha>();
  const fichaPorTelefone = new Map<string, Ficha>();
  for (const f of fichas) {
    if (f.identificador_conversa && !fichaPorConversa.has(f.identificador_conversa)) fichaPorConversa.set(f.identificador_conversa, f);
    const t = chaveTelefone(f.telefone_digitos) ?? chaveTelefone(f.identificador_conversa ? telefoneDe(f.identificador_conversa) : null);
    if (t && !fichaPorTelefone.has(t)) fichaPorTelefone.set(t, f);
  }
  const nomeDaCampanha = new Map<string, string>();
  const externaDaCampanha = new Map<string, string>();
  for (const c of d.campanhas) {
    if (c.campanha_externa_id) {
      nomeDaCampanha.set(c.campanha_externa_id, (c.nome ?? "").trim() || c.campanha_externa_id);
      externaDaCampanha.set(c.id, c.campanha_externa_id);
    }
  }
  const campanhaDoAnuncio = new Map<string, { id: string; nome: string }>();
  for (const a of d.anuncios) {
    if (!a.anuncio_externo_id || !a.campanha_externa_id) continue;
    campanhaDoAnuncio.set(a.anuncio_externo_id.trim(), { id: a.campanha_externa_id, nome: nomeDaCampanha.get(a.campanha_externa_id) || (a.campanha_nome ?? "").trim() || a.campanha_externa_id });
  }
  // Valor real da base própria (Detail: `marcacoes`), pelo telefone e pelo dia do atendimento.
  const propria = new Map<string, number>();
  for (const p of d.marcacoesProprias ?? []) {
    const t = chaveTelefone(p.telefone);
    const v = num(p.valor_previsto);
    if (!t || !p.data_inicio || v === null || p.estado === "cancelada" || p.estado === "cancelado") continue;
    propria.set(`${t}|${chaveDoDia(p.data_inicio, fuso)}`, v);
  }
  const valorDe = (m: Marcacao) => {
    const v = num(m.valor_previsto);
    if (v !== null && v > 0) return { tipo: "real" as const, valor: v };
    const t = chaveTelefone(m.telefone_digitos);
    const p = t ? propria.get(`${t}|${chaveDoDia(m.inicio, fuso)}`) : undefined;
    if (p !== undefined) return { tipo: "real" as const, valor: p };
    const preco = m.servico && d.precos ? d.precos.get(normalizarNomeServico(m.servico)) : undefined;
    if (preco !== undefined && preco > 0) return { tipo: "estimado" as const, valor: preco };
    return { tipo: "sem_valor" as const, valor: null };
  };
  const marcacoesPorTelefone = new Map<string, Marcacao[]>();
  for (const m of d.marcacoes) {
    const t = chaveTelefone(m.telefone_digitos);
    if (!t || !naoCancelada(m)) continue;
    marcacoesPorTelefone.set(t, [...(marcacoesPorTelefone.get(t) ?? []), m]);
  }
  return { agoraMs: agora.getTime(), campanhaDoAnuncio, fichas, externaDaCampanha, fichaPorConversa, fichaPorTelefone, fuso, marcacoesPorTelefone, nomeDaCampanha, valorDe };
}

const fichaDaMarcacao = (c: Contexto, m: Marcacao) => {
  const t = chaveTelefone(m.telefone_digitos);
  return t ? c.fichaPorTelefone.get(t) ?? null : null;
};
const fichaDaConversa = (c: Contexto, conversa: string) => c.fichaPorConversa.get(conversa) ?? (() => {
  const t = chaveTelefone(telefoneDe(conversa));
  return t ? c.fichaPorTelefone.get(t) ?? null : null;
})();

const SEM_FICHA = "sem ficha (telefone não bate com nenhum contacto)";

function campanhaDe(c: Contexto, f: Ficha | null) {
  if (!f) return { chave: SEM_FICHA };
  if (!deAnuncio(f)) return { chave: "sem anúncio (orgânico ou origem desconhecida)" };
  const camp = f.origem_source_id ? c.campanhaDoAnuncio.get(f.origem_source_id.trim()) : undefined;
  return camp ? { chave: camp.nome, externa: camp.id } : { chave: "anúncio sem campanha identificada" };
}

/** A chave do grupo de um facto, a partir da ficha ligada (ou da marcação, para serviço) e do dia. */
function chaveDe(agrupar: Agrupar, c: Contexto, f: Ficha | null, extra: { conversa?: string; servico?: string | null; quando: string }) {
  switch (agrupar) {
    case "canal":
      return f?.canal || (f?.identificador_conversa ? canalDe(f.identificador_conversa) : extra.conversa ? canalDe(extra.conversa) : SEM_FICHA);
    case "origem":
      return f ? f.origem_tipo || "desconhecida" : SEM_FICHA;
    case "campanha":
      return campanhaDe(c, f).chave;
    case "servico":
      return extra.servico === undefined ? null : (extra.servico ?? "").trim() || "sem serviço indicado";
    case "dia":
      return chaveDoDia(extra.quando, c.fuso);
    case "semana":
      return semanaDe(chaveDoDia(extra.quando, c.fuso))[0];
    default:
      return "total";
  }
}

function somarValor(v: Valor, x: ReturnType<Contexto["valorDe"]>) {
  if (x.tipo === "real") { v.real += x.valor ?? 0; v.n_real += 1; }
  else if (x.tipo === "estimado") { v.estimado += x.valor ?? 0; v.n_estimado += 1; }
  else v.n_sem_valor += 1;
}

type Intervalo = { de: string; ate: string; inicio: string; fim: string };

/** Contagens de UM período, por grupo e no total. Pura: tudo o que precisa vem em `d`. */
export function contarPeriodo(d: Dados, c: Contexto, p: Intervalo, agrupar: Agrupar) {
  const grupos = new Map<string, Contagem>();
  const total = contagemVazia();
  const externas = new Map<string, string>(); // chave de grupo → campanha externa (para o gasto)
  // Comparar instantes e não texto: a base devolve "+00:00" e os limites vêm em ".000Z".
  const ini = Date.parse(p.inicio), fim = Date.parse(p.fim);
  const dentro = (iso: string | null) => { const t = iso ? Date.parse(iso) : NaN; return t >= ini && t < fim; };
  const em = (k: string | null, f: (x: Contagem) => void) => {
    f(total);
    if (k === null || agrupar === "nenhum") return;
    if (!grupos.has(k)) grupos.set(k, contagemVazia());
    f(grupos.get(k)!);
  };
  // atribuição das marcações do período (o mínimo atribuído vs sem origem)
  const atrib = { de_anuncio: 0, organico: 0, origem_desconhecida: 0, sem_ficha: 0 };

  // leads novos (fichas criadas no período)
  for (const f of c.fichas) {
    if (!dentro(f.criado_em)) continue;
    const t = chaveTelefone(f.telefone_digitos) ?? chaveTelefone(f.identificador_conversa ? telefoneDe(f.identificador_conversa) : null);
    const limite = Date.parse(f.criado_em) - FOLGA_MS;
    const marcou = Boolean(t && (c.marcacoesPorTelefone.get(t) ?? []).some((m) => Date.parse(criadaEm(m)) >= limite));
    const k = chaveDe(agrupar, c, f, { quando: f.criado_em });
    if (agrupar === "campanha") { const cp = campanhaDe(c, f); if (cp.externa) externas.set(cp.chave, cp.externa); }
    em(k, (x) => { x.leads += 1; if (deAnuncio(f)) x.leadsAnuncio += 1; if (marcou) x.leadsQueMarcaram += 1; });
  }

  // conversas e conversas com pessoa
  for (const m of d.mensagens) {
    if (m.identificador_conversa.startsWith("teste:") || !dentro(m.criado_em)) continue;
    const f = fichaDaConversa(c, m.identificador_conversa);
    const k = chaveDe(agrupar, c, f, { conversa: m.identificador_conversa, quando: m.criado_em });
    em(k, (x) => { x.conversas.add(m.identificador_conversa); if (m.origem === "recebida_na_pausa") x.comPessoa.add(m.identificador_conversa); });
  }

  // marcações
  for (const m of d.marcacoes) {
    if (m.dia_inteiro) continue;
    const f = fichaDaMarcacao(c, m);
    if (agrupar === "campanha") { const cp = campanhaDe(c, f); if (cp.externa) externas.set(cp.chave, cp.externa); }
    const valor = c.valorDe(m);
    if (dentro(criadaEm(m)) && naoCancelada(m)) {
      const k = chaveDe(agrupar, c, f, { quando: criadaEm(m), servico: m.servico });
      em(k, (x) => { x.marcados += 1; if (deAnuncio(f)) x.marcadosAnuncio += 1; somarValor(x.valorMarcados, valor); });
      if (!f) atrib.sem_ficha += 1;
      else if (deAnuncio(f)) atrib.de_anuncio += 1;
      else if (f.origem_tipo === "organico" || f.origem_tipo === "instagram_post") atrib.organico += 1;
      else atrib.origem_desconhecida += 1;
    }
    if (dentro(m.inicio)) {
      const k = chaveDe(agrupar, c, f, { quando: m.inicio, servico: m.servico });
      if (!naoCancelada(m)) em(k, (x) => { x.cancelados += 1; });
      else if (Date.parse(m.inicio) <= c.agoraMs) em(k, (x) => { x.realizados += 1; somarValor(x.valorRealizados, valor); });
    }
  }

  // gasto em anúncios (dia a dia, da Meta)
  const gastoPorExterna = new Map<string, number>();
  for (const g of d.custos) {
    if (g.dia < p.de || g.dia > p.ate) continue;
    const v = num(g.gasto) ?? 0;
    total.gasto += v;
    const ext = c.externaDaCampanha.get(g.campanha_id);
    if (ext) gastoPorExterna.set(ext, (gastoPorExterna.get(ext) ?? 0) + v);
    if (agrupar === "dia" || agrupar === "semana") {
      const k = agrupar === "dia" ? g.dia : semanaDe(g.dia)[0];
      if (!grupos.has(k)) grupos.set(k, contagemVazia());
      grupos.get(k)!.gasto += v;
    }
  }
  if (agrupar === "campanha") {
    for (const ext of gastoPorExterna.keys()) {
      const nome = c.nomeDaCampanha.get(ext) ?? ext;
      externas.set(nome, ext);
      if (!grupos.has(nome)) grupos.set(nome, contagemVazia());
    }
    for (const [nome, g] of grupos) { const ext = externas.get(nome); if (ext) { g.gasto = gastoPorExterna.get(ext) ?? 0; g.ehCampanha = true; } }
  }
  return { atrib, grupos, total };
}

const valorSaida = (v: Valor) => ({
  estimado: r2(v.estimado),
  marcacoes_com_valor_estimado: v.n_estimado,
  marcacoes_com_valor_real: v.n_real,
  marcacoes_sem_valor: v.n_sem_valor,
  real: r2(v.real),
  total: r2(v.real + v.estimado),
});

/** O bloco de saída de um grupo. `servico` não tem leads nem conversas (um lead ainda não tem serviço). */
function saida(x: Contagem, agrupar: Agrupar, nivel: "grupo" | "total") {
  const semLeads = agrupar === "servico" && nivel === "grupo";
  const temGasto = nivel === "total" || (agrupar === "campanha" && x.ehCampanha) || agrupar === "dia" || agrupar === "semana";
  return {
    ...(semLeads
      ? {}
      : {
          conversas: x.conversas.size,
          conversas_com_pessoa: x.comPessoa.size,
          conversao_lead_para_agendamento_pct: pct(x.leadsQueMarcaram, x.leads),
          leads_de_anuncio: x.leadsAnuncio,
          leads_novos: x.leads,
          leads_que_marcaram: x.leadsQueMarcaram,
        }),
    agendamentos_marcados: x.marcados,
    agendamentos_marcados_de_anuncio: x.marcadosAnuncio,
    cancelados: x.cancelados,
    faltas: null,
    faturamento_dos_realizados: valorSaida(x.valorRealizados),
    realizados: x.realizados,
    valor_dos_marcados: valorSaida(x.valorMarcados),
    ...(temGasto
      ? {
          cac_por_agendamento_de_anuncio: div(x.gasto, x.marcadosAnuncio),
          custo_por_lead_de_anuncio: div(x.gasto, x.leadsAnuncio),
          gasto_anuncios: r2(x.gasto),
          ...(nivel === "total" ? { cac_sobre_todos_os_agendamentos: div(x.gasto, x.marcados), custo_por_lead_todos: div(x.gasto, x.leads) } : {}),
        }
      : {}),
  };
}

type Saida = ReturnType<typeof saida>;

/** Diferença entre dois blocos, só nos números (e nos totais do valor). */
function variacao(atual: Saida, antes: Saida) {
  const out: Record<string, { antes: number | null; agora: number | null; diferenca: number | null; pct: number | null }> = {};
  const pares: [string, unknown, unknown][] = Object.keys(atual).map((k) => [k, (atual as Record<string, unknown>)[k], (antes as Record<string, unknown>)[k]]);
  for (const [k, a, b] of pares) {
    const na = k.startsWith("faturamento") || k.startsWith("valor") ? (a as { total: number }).total : typeof a === "number" ? a : null;
    const nb = k.startsWith("faturamento") || k.startsWith("valor") ? (b as { total: number } | undefined)?.total ?? null : typeof b === "number" ? b : null;
    if (na === null && nb === null) continue;
    out[k] = { agora: na, antes: nb, diferenca: na !== null && nb !== null ? r2(na - nb) : null, pct: na !== null && nb !== null && nb !== 0 ? Math.round(((na - nb) / Math.abs(nb)) * 1000) / 10 : null };
  }
  return out;
}

/** A conta toda, a partir dos dados já lidos. Exportada para os testes. */
export function calcularNumeros(d: Dados, o: { fuso: string; agora: Date; atual: Intervalo; anterior: Intervalo | null; agrupar: Agrupar }) {
  const c = montarContexto(d, o.fuso, o.agora);
  const a = contarPeriodo(d, c, o.atual, o.agrupar);
  const b = o.anterior ? contarPeriodo(d, c, o.anterior, o.agrupar) : null;
  const ordenar = (lista: [string, Contagem][]) =>
    o.agrupar === "dia" || o.agrupar === "semana"
      ? lista.sort((x, y) => (x[0] < y[0] ? -1 : 1))
      : lista.sort((x, y) => y[1].marcados - x[1].marcados || y[1].leads - x[1].leads || y[1].gasto - x[1].gasto);
  const comparaGrupos = b && o.agrupar !== "dia" && o.agrupar !== "semana" && o.agrupar !== "nenhum";
  const grupos = ordenar([...a.grupos.entries()]).map(([nome, x]) => {
    const s = saida(x, o.agrupar, "grupo");
    const antes = comparaGrupos ? b!.grupos.get(nome) : undefined;
    return { grupo: nome, ...s, ...(comparaGrupos ? { variacao: variacao(s, saida(antes ?? contagemVazia(), o.agrupar, "grupo")) } : {}) };
  });
  const total = saida(a.total, o.agrupar, "total");
  const anuncios = o.agrupar === "origem" ? (() => {
    // O gasto da Meta não se divide por tipo de origem; junta-se aqui todas as origens pagas.
    const pagos = [...a.grupos.entries()].filter(([k]) => ORIGENS_PAGAS.has(k)).map(([, x]) => x);
    const leads = pagos.reduce((s, x) => s + x.leads, 0);
    const marcados = pagos.reduce((s, x) => s + x.marcados, 0);
    return { agendamentos_marcados: marcados, cac_por_agendamento_de_anuncio: div(a.total.gasto, marcados), custo_por_lead_de_anuncio: div(a.total.gasto, leads), gasto_anuncios: r2(a.total.gasto), leads_novos: leads, origens: [...ORIGENS_PAGAS] };
  })() : undefined;
  return {
    atribuicao_dos_agendamentos_marcados: {
      ...a.atrib,
      nota: "de_anuncio é um MÍNIMO: só conta quem tem ficha com o anúncio identificado e o mesmo telefone da marcação. 'sem_ficha' são marcações cujo telefone não bate com nenhum contacto (marcadas à mão, sem número, ou eventos pessoais na agenda). Por isso o CAC por agendamento de anúncio é um MÁXIMO e o CAC sobre todos os agendamentos é um MÍNIMO: o real está entre os dois.",
    },
    grupos: o.agrupar === "nenhum" ? undefined : grupos,
    ...(anuncios ? { todas_as_origens_pagas: anuncios } : {}),
    total,
    ...(b ? { variacao_total: variacao(total, saida(b.total, o.agrupar, "total")) } : {}),
  };
}

// ----------------------------------------------------------------- ocupação e esperas (puras)

/** Horas marcadas vs horas abertas nos próximos 14 dias, por profissional. `null` quando não há horário conhecido. */
export function ocupacao(slug: string, marcacoes: Marcacao[], fuso: string, hoje: string, dias = 14) {
  const horario = horarioPorCliente[slug];
  if (!horario) return { motivo: "Não há horário de trabalho registado para esta empresa no painel, por isso não se sabe quantas horas estão abertas.", disponivel: false as const };
  const profissionais = Object.entries(horario).filter((x): x is [string, NonNullable<(typeof x)[1]>] => Boolean(x[1]));
  const linhas = profissionais.map(([quem, janela]) => {
    let aberto = 0;
    let marcado = 0;
    for (let i = 0; i < dias; i++) {
      const dia = somarDias(hoje, i);
      const dow = new Date(`${dia}T12:00:00Z`).getUTCDay() || 7; // 1 = segunda … 7 = domingo
      const j = janela(dow);
      if (!j) continue;
      const ini = instanteNoFuso(dia, `${String(j[0]).padStart(2, "0")}:00`, fuso);
      const fim = instanteNoFuso(dia, `${String(j[1] % 24).padStart(2, "0")}:00`, fuso);
      if (!ini || !fim) continue;
      const a = Date.parse(ini), b = Date.parse(fim);
      aberto += b - a;
      // União dos eventos (sobreposições não contam duas vezes), cortada à janela do dia.
      const pedacos = marcacoes
        .filter((m) => !m.dia_inteiro && naoCancelada(m) && m.fim && (m.executor ?? "").toLowerCase() === quem.toLowerCase())
        .map((m) => [Math.max(a, Date.parse(m.inicio)), Math.min(b, Date.parse(m.fim!))] as const)
        .filter(([x, y]) => y > x)
        .sort((x, y) => x[0] - y[0]);
      let fimAte = -Infinity;
      for (const [x, y] of pedacos) {
        const desde = Math.max(x, fimAte);
        if (y > desde) marcado += y - desde;
        fimAte = Math.max(fimAte, y);
      }
    }
    return { horas_abertas: r2(aberto / 3_600_000), horas_marcadas: r2(marcado / 3_600_000), ocupacao_pct: pct(marcado, aberto), profissional: quem };
  });
  const aberto = linhas.reduce((s, l) => s + l.horas_abertas, 0);
  const marcado = linhas.reduce((s, l) => s + l.horas_marcadas, 0);
  return {
    de: hoje,
    disponivel: true as const,
    nota: "Horas abertas = horário de trabalho conhecido de cada profissional; horas marcadas = eventos da agenda (Google) dentro desse horário, sem contar duas vezes os que se sobrepõem. Eventos pessoais na agenda também ocupam.",
    ocupacao_pct: pct(marcado, aberto),
    por_profissional: linhas,
    total_horas_abertas: r2(aberto),
    total_horas_marcadas: r2(marcado),
    ate: somarDias(hoje, dias - 1),
  };
}

// ----------------------------------------------------------------- leitura

async function tudo<T>(q: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>, onde: string) {
  const r = await fetchAllSupabaseRows<T>(q);
  if (r.error) throw new Error(`numeros: ${onde}`);
  return r.data;
}

export async function lerDados(base: Base, slug: string, inicioIso: string, fimIso: string, deDia: string, ateDia: string, baseDoCliente: Dependencias["baseDoCliente"]): Promise<Dados> {
  const [fichas, anuncios, campanhas, custos, criadas, porInicio, mensagens] = await Promise.all([
    tudo<Ficha>((a, b) => base.from("lexia_contactos").select("identificador_conversa, telefone_digitos, origem_tipo, origem_source_id, criado_em, canal, fundido_em, nome").eq("cliente_slug", slug).order("criado_em", { ascending: true }).range(a, b), "fichas"),
    tudo<Anuncio>((a, b) => base.from("lexia_anuncios").select("anuncio_externo_id, campanha_externa_id, campanha_nome").eq("cliente_slug", slug).range(a, b), "anuncios"),
    tudo<Campanha>((a, b) => base.from("lexia_campanhas").select("id, campanha_externa_id, nome").eq("cliente_slug", slug).range(a, b), "campanhas"),
    tudo<Custo>((a, b) => base.from("lexia_campanha_custos").select("campanha_id, dia, gasto, moeda").eq("cliente_slug", slug).gte("dia", deDia).lte("dia", ateDia).range(a, b), "custos"),
    // Marcações criadas desde o início (inclui as do futuro: a conversão do lead conta-as).
    tudo<Marcacao>((a, b) => base.from("lexia_agendamentos").select("id, inicio, fim, estado, servico, executor, valor_previsto, telefone_digitos, criado_no_google, criado_em, dia_inteiro").eq("cliente_slug", slug).gte("criado_no_google", inicioIso).order("inicio", { ascending: true }).range(a, b), "agendamentos criados"),
    // E as com atendimento desde o início (realizados, cancelados e a ocupação dos próximos 14 dias).
    tudo<Marcacao>((a, b) => base.from("lexia_agendamentos").select("id, inicio, fim, estado, servico, executor, valor_previsto, telefone_digitos, criado_no_google, criado_em, dia_inteiro").eq("cliente_slug", slug).gte("inicio", inicioIso).order("inicio", { ascending: true }).range(a, b), "agendamentos"),
    tudo<Mensagem>((a, b) => base.from("lexia_mensagens").select("identificador_conversa, criado_em, origem").eq("cliente_slug", slug).eq("direccao", "recebida").gte("criado_em", inicioIso).lt("criado_em", fimIso).order("criado_em", { ascending: true }).range(a, b), "mensagens"),
  ]);
  const marcacoes = [...new Map([...criadas, ...porInicio].map((m) => [m.id, m])).values()];

  // Preço base: a tabela de serviços da base própria do cliente, quando há credenciais.
  let precos: Map<string, number> | null = null;
  const cfg = getServicosAgendaveisConfig(slug);
  const ext = cfg && baseDoCliente ? baseDoCliente(cfg.envPrefix) : null;
  if (cfg && ext) {
    const { data, error } = await ext.from(cfg.tabela).select(`nome, ${cfg.precoColumn}, ${cfg.activoColumn}`);
    if (!error) {
      precos = new Map();
      // Os activos primeiro: um nome repetido fica com o preço do serviço vivo.
      const linhas = ((data ?? []) as unknown as Record<string, unknown>[]).sort((x, y) => Number(Boolean(y[cfg.activoColumn])) - Number(Boolean(x[cfg.activoColumn])));
      for (const l of linhas) {
        const nome = String(l.nome ?? "").trim();
        const p = num(l[cfg.precoColumn]);
        if (nome && p !== null && !precos.has(normalizarNomeServico(nome))) precos.set(normalizarNomeServico(nome), p);
      }
    }
  }
  // O Detail guarda o valor de cada venda na `marcacoes` da base dele.
  let marcacoesProprias: MarcacaoPropria[] | null = null;
  const cfgVendas = getServicosConfig(slug);
  const extVendas = cfgVendas && baseDoCliente ? baseDoCliente(cfgVendas.envPrefix) : null;
  if (extVendas) {
    const r = await fetchAllSupabaseRows<MarcacaoPropria>((a, b) => extVendas.from("marcacoes").select("telefone, data_inicio, valor_previsto, estado").eq("cliente_slug", slug).gte("data_inicio", inicioIso).range(a, b));
    if (!r.error) marcacoesProprias = r.data;
  }
  return { anuncios, campanhas, custos, fichas, marcacoes, marcacoesProprias, mensagens, precos };
}

/** Conversas à espera de uma pessoa há mais de `horas` (a regra única do painel, `esperasDe`: janela de 48 h). */
async function esperasLongas(base: Base, slug: string, agora: Date, horas: number, fichas: Ficha[]) {
  const desde = new Date(agora.getTime() - 48 * 3600_000).toISOString();
  const naPausa = await tudo<MensagemCurta>((a, b) => base.from("lexia_mensagens").select("identificador_conversa, criado_em").eq("cliente_slug", slug).eq("origem", "recebida_na_pausa").gte("criado_em", desde).order("criado_em", { ascending: true }).range(a, b), "esperas");
  const conversas = [...new Set(naPausa.map((m) => m.identificador_conversa))];
  const enviadas: MensagemCurta[] = [];
  for (let i = 0; i < conversas.length; i += 200) {
    enviadas.push(...(await tudo<MensagemCurta>((a, b) => base.from("lexia_mensagens").select("identificador_conversa, criado_em").eq("cliente_slug", slug).eq("direccao", "enviada").gte("criado_em", desde).in("identificador_conversa", conversas.slice(i, i + 200)).range(a, b), "esperas enviadas")));
  }
  const limite = agora.getTime() - horas * 3600_000;
  const lista = esperasDe(naPausa, enviadas, agora).filter((e) => Date.parse(e.desde) <= limite);
  const temperaturas = lista.length ? await lerTemperaturas(base as SupabaseClient, slug).catch(() => new Map()) : new Map();
  const fichaPor = new Map(fichas.map((f) => [f.identificador_conversa, f]));
  return {
    conversas: lista.slice(0, 30).map((e) => ({
      conversa: e.conversa,
      espera_ha_horas: Math.round(((agora.getTime() - Date.parse(e.desde)) / 3_600_000) * 10) / 10,
      nome: (fichaPor.get(e.conversa)?.nome ?? "").trim() || null,
      origem: fichaPor.get(e.conversa)?.origem_tipo ?? null,
      temperatura: (temperaturas.get(e.conversa) as { temperatura?: string } | undefined)?.temperatura ?? null,
    })),
    horas_minimas: horas,
    nota: "Conversas em que o cliente escreveu com o agente em pausa e ninguém respondeu depois. Só se olham as últimas 48 h (a mesma regra do número 'à espera' do app).",
    total: lista.length,
  };
}

// ----------------------------------------------------------------- a ferramenta

export async function numerosDoNegocio(e: Escopo, args: Record<string, unknown>, deps: Dependencias = {}) {
  const agora = deps.agora ?? new Date();
  const base = deps.base ?? createAdminClient();
  const baseDoCliente = deps.baseDoCliente ?? ((envPrefix: string) => createServicosClient({ envPrefix }));
  const hoje = chaveDoDia(agora, e.fuso);
  const p = periodoNumeros(args, hoje);
  const agrupar: Agrupar = (AGRUPAMENTOS as readonly string[]).includes(String(args.agrupar_por)) ? (args.agrupar_por as Agrupar) : "nenhum";
  const comparar = args.comparar_com_periodo_anterior !== false;
  const horasPedidas = Number(args.horas_sem_resposta);
  const horas = Math.min(48, Math.max(0, args.horas_sem_resposta !== undefined && args.horas_sem_resposta !== null && Number.isFinite(horasPedidas) ? horasPedidas : 2));
  const dias = diasDoIntervalo(p);
  const atual: Intervalo = { ...p, fim: limitesDoDia(p.ate, e.fuso).fim, inicio: limitesDoDia(p.de, e.fuso).inicio };
  const deAnt = somarDias(p.de, -dias);
  const anterior: Intervalo | null = comparar ? { ate: somarDias(p.de, -1), de: deAnt, fim: atual.inicio, inicio: limitesDoDia(deAnt, e.fuso).inicio } : null;
  // A leitura por início não tem limite superior: traz também os próximos 14 dias da ocupação.
  const inicioLeitura = anterior?.inicio ?? atual.inicio;
  const d = await lerDados(base, e.clienteSlug, inicioLeitura, atual.fim, anterior?.de ?? p.de, p.ate, baseDoCliente);
  const contas = calcularNumeros(d, { agora, agrupar, anterior, atual, fuso: e.fuso });
  const espera = await esperasLongas(base, e.clienteSlug, agora, horas, d.fichas);
  const moeda = d.custos.find((c) => c.moeda)?.moeda ?? moedaPadraoDoCliente(e.clienteSlug);
  return {
    agrupado_por: agrupar,
    como_ler: {
      agendamentos_marcados: "Marcações CRIADAS no período (não canceladas), quer o atendimento seja no período quer depois.",
      cac: "gasto ÷ agendamentos marcados por quem veio de anúncio. Como a atribuição é um mínimo, este CAC é um máximo; o 'cac_sobre_todos_os_agendamentos' (gasto ÷ todos) é o mínimo.",
      conversas_com_pessoa: "Conversas em que o cliente escreveu com o agente em pausa: pediu uma pessoa ou a equipa assumiu.",
      faltas: "null = sem dado: a agenda (Google) não regista se a pessoa veio ou faltou.",
      faturamento: "Dos REALIZADOS (atendimento no período e já passou). 'real' = valor registado; 'estimado' = preço base da tabela de serviços pelo nome do serviço; 'marcacoes_sem_valor' = sem valor nem serviço reconhecido (não entram na soma).",
      realizados: "Atendimento no período, já passou e não foi cancelado (presumido: a agenda não diz se a pessoa compareceu).",
      regra: "Use estes números tal como vêm; não refaça contas nem some números de respostas diferentes.",
    },
    leads_quentes_sem_resposta: espera,
    moeda,
    numeros: contas,
    ocupacao_proximos_14_dias: ocupacao(e.clienteSlug, d.marcacoes, e.fuso, hoje),
    periodo: { ...p, dias },
    ...(anterior ? { periodo_anterior: { ate: anterior.ate, de: anterior.de } } : {}),
    tabela_de_precos: d.precos ? `ligada (${d.precos.size} serviços com preço)` : "não disponível: os valores em falta não puderam ser estimados",
  };
}

const DATA = { description: "Data AAAA-MM-DD no fuso da empresa", type: "string" };

export const numeros = {
  numeros_do_negocio: {
    descricao:
      "O PAINEL DE NÚMEROS, calculado em código (use-o para qualquer conta: CAC, custo por lead, conversão, faturamento, agendamentos por origem/canal/campanha/serviço, comparação com o período anterior; NUNCA faça estas contas de cabeça). Devolve por grupo: leads novos, conversas, conversas com pessoa, agendamentos marcados, realizados, cancelados, faltas (sem dado), conversão lead→agendamento, faturamento (real + estimado pela tabela, com quantos são estimados), gasto em anúncios, custo por lead e CAC; diz quanto está atribuído a uma origem e quanto ficou sem origem. Traz também a ocupação da agenda nos próximos 14 dias e as conversas à espera de uma pessoa há mais de X horas. Período até 180 dias (por omissão os últimos 30).",
    executar: async (e: Escopo, a: Record<string, unknown>) => ({ dados: await numerosDoNegocio(e, a) }),
    parametros: {
      additionalProperties: false,
      properties: {
        agrupar_por: { description: "canal (WhatsApp/Instagram/Messenger), origem (tipo de origem do lead), campanha, servico, dia, semana ou nenhum", enum: [...AGRUPAMENTOS], type: "string" },
        ate: DATA,
        comparar_com_periodo_anterior: { description: "true = traz as variações face ao período anterior do mesmo tamanho", type: "boolean" },
        de: DATA,
        horas_sem_resposta: { description: "Para a lista de conversas à espera: há quantas horas, no mínimo (por omissão 2)", type: "integer" },
      },
      required: ["de", "ate", "agrupar_por", "comparar_com_periodo_anterior"],
      type: "object",
    },
    rotulo: "Calculando os números",
  },
};
