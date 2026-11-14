import type { SupabaseClient } from "@supabase/supabase-js";

import { getClientTimezone } from "@/lib/clientes/timezone";

/**
 * "Hoje" do admin (14/11/2026): o que o Arthur precisa de ver ao acordar,
 * cliente a cliente — quem está sem resposta (e quem tem de responder: a
 * equipe ou a agente), marcações novas, handoffs com o motivo, a agenda de
 * hoje e os problemas. Nada de totais só para enfeitar.
 *
 * Tudo lido com a service_role (tela só do lexia_admin), sempre filtrado
 * pelos slugs dos clientes listados.
 */

export const CONTAS_INTERNAS = new Set(["cliente_teste", "clinica_teste"]);
const ESPERA_MIN_MS = 20 * 60_000;
const JANELA_MS = 4 * 86_400_000;

export type Mensagem = {
  cliente_slug: string;
  identificador_conversa: string;
  direccao: string;
  origem: string | null;
  conteudo: string | null;
  criado_em: string;
};
export type Turno = { cliente_slug: string; identificador_conversa: string | null; estado: string | null; motivo: string | null; criado_em: string };

export type Espera = {
  slug: string;
  conversa: string;
  quem: "equipe" | "agente" | "defeito";
  irritado: boolean;
  desdeMs: number;
  texto: string;
};

const IRRITADO = /\b(puto|put[ao]s|absurd|palha[cç]ad|rid[ií]cul|p[eé]ssim|vergonha|desrespeit|deixando a desejar|reclama|enganad|cancelar (o|a|meu|minha)|nunca mais|lament[aá]vel|horr[ií]vel|descaso)/i;
const PAUSA = /equipe|samuel|martim|claudia|humano|pausad|pausa |em pausa|interven/i;
/** Fechos de conversa ("ok, obrigada", "👍", "Combinado"): não pedem resposta. */
const FECHO = /^(ok+|okay|okey|ok obrigad[oa]s?|ok perfe[ci]to|obrigad[oa]s?|muito obrigad[oa]s?|obg|valeu|combinado|perfeito|perfecto|perfect|que bom|um abra[cç]o|abra[cç]o|beleza|blz|show|top|certo|certinho|[oó]timo|great|thanks?|thank you|thx|gracias|muchas gracias|de nada|at[eé] (logo|j[aá]|amanh[aã]|l[aá])|tchau)$/i;
/** O cliente disse que volta ele ("eu depois mando a foto", "te aviso"): não está à espera. */
const PROMESSA = /\b(depois (te |eu )?(mando|envio|falo|digo|ligo|vejo|aviso)|vou ver( e)?|te aviso|eu aviso|i('|’| wi)ll let you know|i('|’)ll get back|te escribo|le aviso|te confirmo depois)\b/i;
export function pedeResposta(texto: string | null) {
  const limpo = String(texto ?? "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/[!.,;:?…\s]+/g, " ").trim();
  if (!limpo) return false;                       // só emoji
  if (FECHO.test(limpo)) return false;
  if (PROMESSA.test(limpo)) return false;
  return true;
}

/** Conversas cuja última mensagem é do cliente, há mais de 20 min, e quem tem de responder. */
export function semResposta(mensagens: Mensagem[], ultimoTurno: Map<string, Turno>, agora: number): Espera[] {
  const ultima = new Map<string, Mensagem>();
  for (const m of mensagens) {
    if (m.identificador_conversa.startsWith("teste:")) continue;
    const k = `${m.cliente_slug}|${m.identificador_conversa}`;
    const atual = ultima.get(k);
    if (!atual || m.criado_em >= atual.criado_em) ultima.set(k, m);
  }
  const out: Espera[] = [];
  for (const [k, m] of ultima) {
    if (m.direccao !== "recebida") continue;
    const t = Date.parse(m.criado_em);
    if (!Number.isFinite(t) || agora - t < ESPERA_MIN_MS) continue;
    const turno = ultimoTurno.get(k);
    if (turno && /bloquead/i.test(turno.motivo ?? "")) continue;
    if (!pedeResposta(m.conteudo)) continue;
    const numero = m.identificador_conversa.split(":")[1] ?? "";
    const quem: Espera["quem"] = !numero
      ? "defeito"
      : m.origem === "recebida_na_pausa" || PAUSA.test(turno?.motivo ?? "")
        ? "equipe"
        : "agente";
    out.push({ slug: m.cliente_slug, conversa: m.identificador_conversa, quem, irritado: IRRITADO.test(m.conteudo ?? ""), desdeMs: t, texto: String(m.conteudo ?? "").slice(0, 160) });
  }
  return out.sort((a, b) => a.desdeMs - b.desdeMs);
}

export type Cartao = {
  slug: string;
  nome: string;
  situacao: "no_ar" | "teste";
  esperas: Espera[];
  marcacoesNovas: number;
  tom: "perigo" | "alerta" | "ouro" | "positivo";
  numero: number;
  frase: string;
  linhas: string[];
};

type Traduzir = (texto: string, vars?: Record<string, string | number>) => string;

export function horasDesde(ms: number, agora: number) {
  return Math.max(1, Math.round((agora - ms) / 3_600_000));
}

/** O cartão de um cliente: o número que pede ação, na cor da urgência, e duas linhas de contexto. */
export function montarCartao(o: { slug: string; nome: string; situacao: Cartao["situacao"]; esperas: Espera[]; marcacoesNovas: number; agora: number; t: Traduzir }): Cartao {
  const { esperas, t } = o;
  const agente = esperas.filter((e) => e.quem === "agente").length;
  const equipe = esperas.filter((e) => e.quem === "equipe").length;
  const defeito = esperas.filter((e) => e.quem === "defeito").length;
  const irritados = esperas.filter((e) => e.irritado).length;
  const numero = esperas.length;
  const tom: Cartao["tom"] = numero === 0 ? "positivo" : agente > 0 ? "perigo" : equipe > 0 ? "alerta" : "ouro";
  const frase =
    numero === 0 ? t("tudo em dia")
    : agente === numero ? t("a agente não respondeu")
    : equipe === numero ? t("à espera da equipe")
    : t("sem resposta");
  const linhas: string[] = [];
  if (irritados > 0) linhas.push(irritados === 1 ? t("1 cliente irritado") : t("{n} clientes irritados", { n: irritados }));
  const partes = [
    equipe && agente + defeito > 0 ? t("{n} à espera da equipe", { n: equipe }) : "",
    agente && equipe + defeito > 0 ? t("{n} sem resposta da agente", { n: agente }) : "",
    defeito ? (defeito === 1 ? t("1 conversa com defeito") : t("{n} conversas com defeito", { n: defeito })) : "",
  ].filter(Boolean);
  if (partes.length) linhas.push(partes.join(" · "));
  if (o.marcacoesNovas > 0) linhas.push(o.marcacoesNovas === 1 ? t("1 marcação nova") : t("{n} marcações novas", { n: o.marcacoesNovas }));
  if (numero > 0 && linhas.length < 2) linhas.push(t("a mais antiga há {n} h", { n: horasDesde(esperas[0].desdeMs, o.agora) }));
  return { slug: o.slug, nome: o.nome, situacao: o.situacao, esperas, marcacoesNovas: o.marcacoesNovas, tom, numero, frase, linhas: linhas.slice(0, 2) };
}

const ORDEM_TOM = { perigo: 0, alerta: 1, ouro: 2, positivo: 3 } as const;
export const ordenarCartoes = (cs: Cartao[]) =>
  [...cs].sort((a, b) => ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom] || b.numero - a.numero || a.nome.localeCompare(b.nome));

// ---------------------------------------------------------------- agenda
/** Eventos da agenda que não são atendimentos (pessoais, feriados, bloqueios). */
const NAO_ATENDIMENTO = /presta[cç][aã]o|vence|pagamento|thanksgiving|feriado|almo[cç]o|folga|pessoal|m[eé]dic|dentista|anivers|banco|bloque|f[eé]rias|consulta ortop/i;
export const ehAtendimento = (titulo: string | null) => !NAO_ATENDIMENTO.test(titulo ?? "");

export function mesmoDiaLocal(iso: string, agora: number, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(iso)) === f.format(new Date(agora));
}

export type ItemAgenda = { slug: string; inicio: string; titulo: string; pelaAgente: boolean; timeZone: string };
export type Marcacao = { slug: string; inicio: string; titulo: string; criadoEm: string; timeZone: string };
export type Handoff = { slug: string; conversa: string | null; motivo: string; prioridade: string | null; em: string };
export type Problema = { slug: string; quantos: number; primeiro: string; ultimo: string; erro: string };

export type Hoje = {
  cartoes: Cartao[];
  marcacoes: Marcacao[];
  handoffs: Handoff[];
  agenda: ItemAgenda[];
  problemas: Problema[];
  nomes: Record<string, string>;
  /** O momento em que foi lido (as idades "há N h" contam a partir daqui). */
  agora: number;
};

type Linhas<T> = { data: T[] | null; error: unknown };

/** Lê tudo o que o "Hoje" precisa. Uma consulta que falhe deixa o seu bloco vazio, nunca a página. */
export async function lerHoje(supabase: SupabaseClient, t: Traduzir, agora = Date.now()): Promise<Hoje> {
  const desde = (ms: number) => new Date(agora - ms).toISOString();
  const { data: clientesData } = await supabase.from("lexia_clientes").select("slug, nome, status, modo_teste").eq("status", "ativo").order("nome");
  const clientes = ((clientesData ?? []) as { slug: string; nome: string | null; modo_teste: boolean | null }[]).filter((c) => !CONTAS_INTERNAS.has(c.slug));
  const slugs = clientes.map((c) => c.slug);
  const nomes = Object.fromEntries(clientes.map((c) => [c.slug, c.nome ?? c.slug]));
  if (!slugs.length) return { cartoes: [], marcacoes: [], handoffs: [], agenda: [], problemas: [], nomes, agora };

  const mensagens: Mensagem[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const r = (await supabase.from("lexia_mensagens").select("cliente_slug, identificador_conversa, direccao, origem, conteudo, criado_em")
      .in("cliente_slug", slugs).gte("criado_em", desde(JANELA_MS)).order("criado_em", { ascending: true }).range(de, de + 999)) as Linhas<Mensagem>;
    if (r.error || !r.data) break;
    mensagens.push(...r.data);
    if (r.data.length < 1000) break;
  }

  const [turnos, agendamentos, handoffsTurnos, handoffsTabela, erros] = await Promise.all([
    supabase.from("lexia_turnos").select("cliente_slug, identificador_conversa, estado, motivo, criado_em").in("cliente_slug", slugs).eq("modo", "producao")
      .gte("criado_em", desde(JANELA_MS)).order("criado_em", { ascending: false }).limit(5000) as unknown as Promise<Linhas<Turno>>,
    supabase.from("lexia_agendamentos").select("cliente_slug, inicio, titulo, origem, estado, criado_em").in("cliente_slug", slugs).neq("estado", "cancelado")
      .or(`criado_em.gte.${desde(86_400_000)},and(inicio.gte.${desde(86_400_000)},inicio.lte.${new Date(agora + 36 * 3_600_000).toISOString()})`).limit(500) as unknown as Promise<Linhas<{ cliente_slug: string; inicio: string; titulo: string | null; origem: string | null; estado: string | null; criado_em: string }>>,
    supabase.from("lexia_turnos").select("cliente_slug, identificador_conversa, handoff, criado_em").in("cliente_slug", slugs).eq("modo", "producao")
      .eq("handoff->>necessario", "true").gte("criado_em", desde(86_400_000)).order("criado_em", { ascending: false }).limit(100) as unknown as Promise<Linhas<{ cliente_slug: string; identificador_conversa: string | null; handoff: { motivo?: string; prioridade?: string } | null; criado_em: string }>>,
    supabase.from("lexia_handoffs").select("cliente_slug, session_id, motivo, prioridade, criado_em").in("cliente_slug", slugs).gte("criado_em", desde(86_400_000)).limit(100) as unknown as Promise<Linhas<{ cliente_slug: string; session_id: string | null; motivo: string | null; prioridade: string | null; criado_em: string }>>,
    supabase.from("lexia_turnos").select("cliente_slug, erro, criado_em").in("cliente_slug", slugs).eq("modo", "producao").eq("estado", "erro")
      .gte("criado_em", desde(86_400_000)).order("criado_em", { ascending: true }).limit(500) as unknown as Promise<Linhas<{ cliente_slug: string; erro: string | null; criado_em: string }>>,
  ]);

  const ultimoTurno = new Map<string, Turno>();
  for (const tr of turnos.data ?? []) {
    const k = `${tr.cliente_slug}|${tr.identificador_conversa}`;
    if (!ultimoTurno.has(k)) ultimoTurno.set(k, tr);
  }
  const esperas = semResposta(mensagens, ultimoTurno, agora);
  const porCliente = new Map<string, Espera[]>();
  for (const e of esperas) {
    porCliente.set(e.slug, [...(porCliente.get(e.slug) ?? []), e]);
  }

  const ags = agendamentos.data ?? [];
  const marcacoes: Marcacao[] = ags
    .filter((a) => a.origem === "agente" && Date.parse(a.criado_em) >= agora - 86_400_000)
    .map((a) => ({ slug: a.cliente_slug, inicio: a.inicio, titulo: a.titulo ?? "", criadoEm: a.criado_em, timeZone: getClientTimezone(a.cliente_slug) }))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const agenda: ItemAgenda[] = ags
    .filter((a) => ehAtendimento(a.titulo) && mesmoDiaLocal(a.inicio, agora, getClientTimezone(a.cliente_slug)))
    .map((a) => ({ slug: a.cliente_slug, inicio: a.inicio, titulo: a.titulo ?? "", pelaAgente: a.origem === "agente", timeZone: getClientTimezone(a.cliente_slug) }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const vistos = new Set<string>();
  const handoffs: Handoff[] = [];
  for (const h of handoffsTurnos.data ?? []) {
    const motivo = String(h.handoff?.motivo ?? "").trim();
    if (!motivo || /^guardrail/i.test(motivo)) continue;   // corte interno de frase, não é pedido para a equipe
    const k = `${h.cliente_slug}|${h.identificador_conversa}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    handoffs.push({ slug: h.cliente_slug, conversa: h.identificador_conversa, motivo, prioridade: h.handoff?.prioridade ?? null, em: h.criado_em });
  }
  for (const h of handoffsTabela.data ?? []) {
    const k = `${h.cliente_slug}|${h.session_id}`;
    if (vistos.has(k) || !h.motivo) continue;
    vistos.add(k);
    handoffs.push({ slug: h.cliente_slug, conversa: h.session_id, motivo: h.motivo, prioridade: h.prioridade, em: h.criado_em });
  }
  handoffs.sort((a, b) => b.em.localeCompare(a.em));

  const problemas: Problema[] = [];
  for (const e of erros.data ?? []) {
    const p = problemas.find((x) => x.slug === e.cliente_slug);
    if (p) { p.quantos++; p.ultimo = e.criado_em; } else problemas.push({ slug: e.cliente_slug, quantos: 1, primeiro: e.criado_em, ultimo: e.criado_em, erro: String(e.erro ?? "").slice(0, 160) });
  }

  const cartoes = ordenarCartoes(clientes.map((c) => montarCartao({
    slug: c.slug, nome: c.nome ?? c.slug, situacao: c.modo_teste ? "teste" : "no_ar",
    esperas: porCliente.get(c.slug) ?? [], marcacoesNovas: marcacoes.filter((m) => m.slug === c.slug).length, agora, t,
  })));
  return { cartoes, marcacoes, handoffs, agenda, problemas, nomes, agora };
}
