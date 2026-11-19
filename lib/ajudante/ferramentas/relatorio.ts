import "server-only";

import { getPainelCampanhas } from "@/lib/campaigns/read";
import { moeda, partesNoFuso } from "@/lib/movel/formato";
import { limitesDoDia, semanaDe, somarDias } from "@/lib/movel/hoje";
import { dadosResultados, diasDoIntervalo } from "@/lib/movel/resultados";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Escopo } from "../ferramentas";
import { DATA, type DefinicaoLeitura, hojeNoFuso, objeto, periodoAte } from "./comum";

/**
 * `relatorio_do_periodo`: um relatório pronto para o DONO mandar ou
 * apresentar (semana, mês ou período), em markdown simples (títulos, negrito
 * e listas: é o que a tela desenha e o que se cola no WhatsApp/email).
 *
 * Os números saem das mesmas funções das telas (Resultados e Campanhas), e
 * o texto ("deu certo", "melhorar", "próximos passos") é montado em código a
 * partir deles: nada de IA aqui, nada inventado, custo zero.
 *
 * Ponto de ligação para a ferramenta `numeros_do_negocio` (feita noutra
 * frente): `usarNumerosDoNegocio(fn)` regista uma fonte extra; quando existe,
 * os números dela entram numa secção "Outros números". Sem ela, nada muda.
 */

export type FonteDeNumeros = (escopo: Escopo, periodo: { de: string; ate: string }) => Promise<Record<string, unknown> | null>;
let fonteExtra: FonteDeNumeros | null = null;
/** Regista (ou tira, com null) a fonte de `numeros_do_negocio`. */
export function usarNumerosDoNegocio(fn: FonteDeNumeros | null) {
  fonteExtra = fn;
}

export type TipoPeriodo = "semana" | "semana_passada" | "mes" | "mes_passado" | "personalizado";

/** O intervalo do relatório. Semana = segunda até hoje; mês = dia 1 até hoje (como no resto do Analista). */
export function intervaloDoRelatorio(tipo: unknown, a: Record<string, unknown>, hoje: string) {
  if (tipo === "semana") return { ate: hoje, de: semanaDe(hoje)[0] };
  if (tipo === "semana_passada") {
    const segunda = semanaDe(hoje)[0];
    return { ate: somarDias(segunda, -1), de: somarDias(segunda, -7) };
  }
  if (tipo === "mes_passado") {
    const ate = somarDias(`${hoje.slice(0, 8)}01`, -1);
    return { ate, de: `${ate.slice(0, 8)}01` };
  }
  if (tipo === "personalizado") return periodoAte(a, hoje, 30, 92);
  return { ate: hoje, de: `${hoje.slice(0, 8)}01` };
}

const variacao = (agora: number, antes: number) => {
  if (!antes) return agora ? null : 0;
  return Math.round(((agora - antes) / antes) * 100);
};
const sinal = (v: number | null) => (v === null ? "novo" : v > 0 ? `+${v}%` : `${v}%`);
const dataCurta = (chave: string, locale: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${chave}T12:00:00Z`));

type Faixa = "madrugada" | "manhã" | "tarde" | "noite";
const faixaDe = (hora: string): Faixa => {
  const h = Number(hora.slice(0, 2));
  return h < 6 ? "madrugada" : h < 12 ? "manhã" : h < 18 ? "tarde" : "noite";
};

/** Em que dia da semana e em que parte do dia chegaram mais leads (só com 10 ou mais). */
async function quandoChegam(e: Escopo, p: { de: string; ate: string }) {
  const { data } = await createAdminClient()
    .from("lexia_contactos")
    .select("criado_em, origem_tipo")
    .eq("cliente_slug", e.clienteSlug)
    .gte("criado_em", limitesDoDia(p.de, e.fuso).inicio)
    .lt("criado_em", limitesDoDia(p.ate, e.fuso).fim)
    .limit(10_000);
  const linhas = (data ?? []) as { criado_em: string; origem_tipo: string | null }[];
  if (linhas.length < 10) return null;
  const nomeDia = new Intl.DateTimeFormat(e.locale, { timeZone: e.fuso, weekday: "long" });
  const dias = new Map<string, number>();
  const faixas = new Map<Faixa, number>();
  for (const l of linhas) {
    const d = nomeDia.format(new Date(l.criado_em));
    dias.set(d, (dias.get(d) ?? 0) + 1);
    const f = faixaDe(partesNoFuso(l.criado_em, e.fuso).hora);
    faixas.set(f, (faixas.get(f) ?? 0) + 1);
  }
  const ordenar = <K,>(m: Map<K, number>) => [...m.entries()].sort((x, y) => y[1] - x[1]);
  return { dias: ordenar(dias), faixas: ordenar(faixas), total: linhas.length };
}

async function principaisObjecoes(e: Escopo, p: { de: string; ate: string }) {
  const { data } = await createAdminClient()
    .from("lexia_conversation_insights")
    .select("objecoes")
    .eq("cliente_slug", e.clienteSlug)
    .gte("ultima_mensagem_em", limitesDoDia(p.de, e.fuso).inicio)
    .lt("ultima_mensagem_em", limitesDoDia(p.ate, e.fuso).fim)
    .limit(500);
  const contagem = new Map<string, number>();
  for (const l of (data ?? []) as { objecoes: unknown }[]) {
    for (const o of Array.isArray(l.objecoes) ? l.objecoes : []) {
      const t = typeof o === "string" ? o : String((o as { tipo?: string; descricao?: string })?.tipo ?? (o as { descricao?: string })?.descricao ?? "");
      if (t.trim()) contagem.set(t.trim(), (contagem.get(t.trim()) ?? 0) + 1);
    }
  }
  return [...contagem.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
}

async function montar(e: Escopo, a: Record<string, unknown>) {
  const hoje = hojeNoFuso(e);
  const p = intervaloDoRelatorio(a.periodo, a, hoje);
  const [r, campanhas, quando, objecoes, extra] = await Promise.all([
    dadosResultados(e.clienteSlug, e.fuso, { ...p, chave: "personalizado" }),
    getPainelCampanhas({ clienteSlug: e.clienteSlug, fim: p.ate, fimIso: limitesDoDia(p.ate, e.fuso).fim, inicio: p.de, inicioIso: limitesDoDia(p.de, e.fuso).inicio, timezone: e.fuso }).catch(() => null),
    quandoChegam(e, p).catch(() => null),
    principaisObjecoes(e, p).catch(() => []),
    fonteExtra ? fonteExtra(e, p).catch(() => null) : Promise.resolve(null),
  ]);
  const { atual: n, anterior: ant } = r;
  const dinheiro = (v: number) => moeda(v, e.locale, r.moeda);
  const dias = diasDoIntervalo(p);
  const titulo = `# Relatório de ${e.clienteNome}: ${dataCurta(p.de, e.locale)} a ${dataCurta(p.ate, e.locale)}`;

  const conversao = n.leads ? Math.round((n.agendamentos / n.leads) * 100) : null;
  const custoLead = r.gasto && n.leadsAnuncio ? r.gasto / n.leadsAnuncio : null;
  const camp = campanhas?.temDados ? campanhas.porCampanha.filter((c) => c.gasto > 0 || c.contactosAtribuidos > 0) : [];

  // ---- Resumo
  const resumo = [
    `${n.leads} leads novos (${sinal(variacao(n.leads, ant.leads))} em relação aos ${dias} dias anteriores) e ${n.agendamentos} agendamentos (${sinal(variacao(n.agendamentos, ant.agendamentos))}).`,
    n.agendamentos ? `${n.doAgente} dos agendamentos foram marcados pelo agente${n.aMao ? ` e ${n.aMao} à mão` : ""}.` : "",
    r.gasto ? `Investimento em anúncios: ${dinheiro(r.gasto)}${custoLead ? `, cerca de ${dinheiro(Math.round(custoLead * 100) / 100)} por lead de anúncio` : ""}.` : "",
  ].filter(Boolean);

  // ---- Números
  const linha = (rotulo: string, agora: number, antes: number) => `- **${rotulo}:** ${agora} (antes ${antes}, ${sinal(variacao(agora, antes))})`;
  const numeros = [
    linha("Conversas com clientes", n.conversas, ant.conversas),
    linha("Leads novos", n.leads, ant.leads),
    linha("Leads vindos de anúncio", n.leadsAnuncio, ant.leadsAnuncio),
    linha("Agendamentos", n.agendamentos, ant.agendamentos),
    `- **Marcados pelo agente:** ${n.doAgente} · **à mão:** ${n.aMao}`,
    linha("Cancelamentos", n.cancelados, ant.cancelados),
    n.agendaramAnuncio ? `- **Agendaram vindos de anúncio:** ${n.agendaramAnuncio}` : "",
    conversao !== null ? `- **Leads que viraram agendamento:** cerca de ${conversao}%` : "",
    n.valor ? `- **Valor previsto (só das marcações com preço):** ${dinheiro(n.valor)}` : "",
    r.gasto ? `- **Gasto em anúncios:** ${dinheiro(r.gasto)}` : "",
  ].filter(Boolean);

  // ---- Campanhas
  const campanhasTxt = camp
    .sort((x, y) => y.gasto - x.gasto)
    .slice(0, 6)
    .map((c) => `- **${c.nome}:** ${dinheiro(c.gasto)} gastos, ${c.contactosAtribuidos} leads identificados, ${c.marcacoesAtribuidas} agendaram`);

  // ---- O que deu certo / o que melhorar / próximos passos (regras simples sobre os números)
  const bem: string[] = [];
  const melhorar: string[] = [];
  const passos: string[] = [];
  const vLeads = variacao(n.leads, ant.leads);
  const vAg = variacao(n.agendamentos, ant.agendamentos);
  const vCanc = variacao(n.cancelados, ant.cancelados);
  if (vLeads === null || (vLeads ?? 0) >= 10) bem.push(`Mais leads: ${n.leads} contra ${ant.leads} no período anterior.`);
  if (vAg === null || (vAg ?? 0) >= 10) bem.push(`Mais agendamentos: ${n.agendamentos} contra ${ant.agendamentos}.`);
  if (n.agendamentos && n.doAgente / n.agendamentos >= 0.3) bem.push(`O agente marcou ${n.doAgente} de ${n.agendamentos} agendamentos sozinho.`);
  if (ant.cancelados && n.cancelados < ant.cancelados) bem.push(`Menos cancelamentos: ${n.cancelados} contra ${ant.cancelados}.`);
  const melhorCamp = [...camp].sort((x, y) => y.marcacoesAtribuidas - x.marcacoesAtribuidas)[0];
  if (melhorCamp?.marcacoesAtribuidas) bem.push(`A campanha "${melhorCamp.nome}" foi a que trouxe mais agendamentos identificados (${melhorCamp.marcacoesAtribuidas}).`);

  if (vLeads !== null && vLeads <= -10) {
    melhorar.push(`Menos leads: ${n.leads} contra ${ant.leads}.`);
    passos.push(r.gasto ? "Rever os anúncios que perderam força e reforçar os que ainda trazem leads." : "Voltar a atrair contatos: um anúncio simples ou uma publicação com chamada para o WhatsApp.");
  }
  if (vAg !== null && vAg <= -10) melhorar.push(`Menos agendamentos: ${n.agendamentos} contra ${ant.agendamentos}.`);
  if (n.cancelados && (vCanc === null || vCanc > 0)) {
    melhorar.push(`Cancelamentos subiram para ${n.cancelados}.`);
    passos.push("Perguntar ao Analista o motivo dos cancelamentos (ele lê as conversas de quem cancelou) e confirmar as marcações na véspera.");
  }
  const semRetorno = camp.filter((c) => c.gasto > 0 && c.marcacoesAtribuidas === 0 && c.contactosAtribuidos > 0);
  if (semRetorno.length) {
    melhorar.push(`Campanhas com gasto e sem agendamento identificado: ${semRetorno.map((c) => `"${c.nome}"`).join(", ")}.`);
    passos.push("Ver as conversas que vieram dessas campanhas antes de decidir se pausam (o número identificado é um mínimo).");
  }
  if (conversao !== null && n.leads >= 10 && conversao < 20) {
    melhorar.push(`Poucos leads viram agendamento (cerca de ${conversao}%).`);
    passos.push("Pedir ao Analista as objeções dos leads de anúncio que não agendaram, para ajustar a oferta ou a resposta.");
  }
  if (objecoes.length) melhorar.push(`Objeções mais ouvidas: ${objecoes.map(([o, c]) => `${o} (${c})`).join(", ")}.`);
  if (quando && r.gasto) passos.push(`Concentrar o orçamento em ${quando.dias[0][0]} e na parte da ${quando.faixas[0][0]}, quando chegam mais leads.`);

  // ---- Quando chegam os leads (melhor dia/horário para anunciar)
  const quandoTxt = quando
    ? [
        `- **Dias com mais leads:** ${quando.dias.slice(0, 3).map(([d, c]) => `${d} (${c})`).join(", ")}`,
        `- **Parte do dia:** ${quando.faixas.map(([f, c]) => `${f} ${Math.round((c / quando.total) * 100)}%`).join(", ")}`,
      ]
    : [];

  // ---- Outros números (numeros_do_negocio, quando existir)
  const extraTxt = extra
    ? Object.entries(extra)
        .filter(([, v]) => typeof v === "number" || (typeof v === "string" && v.length < 120))
        .slice(0, 12)
        .map(([k, v]) => `- **${k.replace(/_/g, " ")}:** ${v}`)
    : [];

  const secao = (t: string, linhas: string[], vazio?: string) => (linhas.length ? [`## ${t}`, ...linhas, ""] : vazio ? [`## ${t}`, vazio, ""] : []);
  const markdown = [
    titulo,
    "",
    ...secao("Resumo", resumo),
    ...secao("Números", numeros),
    ...secao("Campanhas", campanhasTxt),
    ...secao("Quando chegam os leads", quandoTxt),
    ...secao("Outros números", extraTxt),
    ...secao("O que deu certo", bem.map((x) => `- ${x}`), "- Período estável, sem destaques."),
    ...secao("O que melhorar", melhorar.map((x) => `- ${x}`), "- Nada preocupante nos números."),
    ...secao("Próximos passos", (passos.length ? passos : ["Manter o que está funcionando e voltar a ver os números na próxima semana."]).map((x) => `- ${x}`)),
    `_Comparação com os ${dias} dias anteriores. Leads por campanha são um mínimo: nem todos os canais dizem de que anúncio a pessoa veio._`,
  ].join("\n");

  return {
    numeros: { anterior: ant, atual: n, gasto: r.gasto, moeda: r.moeda },
    periodo: p,
    relatorio: markdown,
    ...(extra ? { numeros_do_negocio: extra } : {}),
  };
}

export const relatorioDoPeriodo: DefinicaoLeitura = {
  descricao:
    "Monta um relatório pronto para o dono mandar ou apresentar (semana, semana passada, mês, mês passado ou período): resumo, números com a comparação com o período anterior, campanhas, quando chegam os leads (melhor dia e parte do dia para anunciar), o que deu certo, o que melhorar e próximos passos. Mostre o relatório INTEIRO, começando pela linha de título com '# ' (a tela põe um botão de copiar). Pode melhorar a redação do resumo e dos pontos, mas os números ficam exatamente iguais; se o dono escreve noutra língua, traduza tudo.",
  executar: async (e, a) => ({ dados: await montar(e, a) }),
  parametros: objeto(
    {
      ate: DATA,
      de: DATA,
      periodo: { description: "semana (segunda até hoje), semana_passada, mes (dia 1 até hoje), mes_passado ou personalizado (usa de/ate, máx. 92 dias)", enum: ["semana", "semana_passada", "mes", "mes_passado", "personalizado"], type: "string" },
    },
    ["periodo"],
  ),
  rotulo: "Montando o relatório",
};
