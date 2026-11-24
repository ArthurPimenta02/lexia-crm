import "server-only";

/**
 * A passagem automática (Etapa 3), do lado do servidor: lê a ficha no Supabase CENTRAL, converte
 * (lib/onboarding/exportar.ts) e grava na base PRÓPRIA do cliente (conexão `supabase_cliente` dele).
 *
 * Cada cliente é separado:
 *  - a base de destino é SEMPRE a conexão `supabase_cliente` do slug do pedido (o `acesso`), nunca outra;
 *  - recusa-se se essa URL for a base central ou estiver ligada também a outro cliente;
 *  - as tabelas têm o sufixo do mapa explícito em `exportar.ts` (sem sufixo configurado → recusa).
 * Só a equipe da Lexia (`acesso.lexia`) faz prévia ou grava.
 *
 * Nunca se apaga nada na base do cliente: upsert por `origem_item_id` (grupos) ou `chave` (info/config);
 * item removido no onboarding ou chave que a conversão deixou de produzir → `ativo=false`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getClientTimezone } from "@/lib/clientes/timezone";
import { decifrar } from "@/lib/conexoes/cifra";
import type { AcessoAoOnboarding } from "@/lib/onboarding/acesso";
import { lerItens, lerLinhas, lerOnboarding } from "@/lib/onboarding/dados";
import {
  CATEGORIAS,
  clienteDaExportacao,
  COLUNAS,
  exportar,
  ORIGEM,
  type Exportacao,
  type IaDaExportacao,
  type LinhaChave,
  type RespostaPromocaoIa,
  type RespostaServicoIa,
} from "@/lib/onboarding/exportar";
import { chaveDoCliente, perguntar, type ChaveDeIa } from "@/lib/onboarding/ia";

type Base = Pick<SupabaseClient, "from">;
type Acesso = Pick<AcessoAoOnboarding, "admin" | "clienteSlug" | "lexia"> | null;
export type CriarCliente = (url: string, chave: string) => Base;
const criarClientePadrao: CriarCliente = (url, chave) => createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });

export type Dependencias = {
  /** `null` = sem IA; omitido = a IA real com a chave do próprio cliente. */
  ia?: IaDaExportacao | null;
  agora?: Date;
};

// ------------------------------------------------------------------ a base do cliente

export type BaseAberta = { ok: true; base: Base; url: string } | { ok: false; erro: string };

const normalizarUrl = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();

/** A base Supabase do cliente `slug`, pela conexão `supabase_cliente` DELE. */
export async function abrirBaseDoCliente(admin: SupabaseClient, slug: string, criar: CriarCliente = criarClientePadrao): Promise<BaseAberta> {
  const { data, error } = await admin.from("lexia_conexoes").select("cliente_slug, campos, segredos").eq("tipo", "supabase_cliente").eq("cliente_slug", slug).maybeSingle();
  if (error) return { ok: false, erro: "Não consegui ler a conexão da base do cliente." };
  const linha = data as { cliente_slug: string; campos: Record<string, string> | null; segredos: string | null } | null;
  if (!linha?.segredos || linha.cliente_slug !== slug) return { ok: false, erro: "Este cliente não tem a base ligada (conexão “Base de dados do cliente” em /admin/conexoes)." };
  let segredos: Record<string, string>;
  try {
    segredos = decifrar(linha.segredos);
  } catch {
    return { ok: false, erro: "Não consegui abrir a chave da base do cliente." };
  }
  const url = (linha.campos?.url || segredos.url || "").trim().replace(/\/+$/, "");
  const chave = segredos.service_role_key;
  if (!url || !chave) return { ok: false, erro: "A conexão da base do cliente está incompleta (falta a URL ou a chave)." };
  const central = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (central && normalizarUrl(central) === normalizarUrl(url)) return { ok: false, erro: "A conexão aponta para a base central da Lexia: recusado." };
  // A mesma base ligada a outro cliente = misturar empresas. Recusa.
  const { data: outras } = await admin.from("lexia_conexoes").select("cliente_slug, campos").eq("tipo", "supabase_cliente");
  const partilhada = ((outras ?? []) as { cliente_slug: string | null; campos: Record<string, string> | null }[]).find((o) => o.cliente_slug !== slug && o.campos?.url && normalizarUrl(o.campos.url) === normalizarUrl(url));
  if (partilhada) return { ok: false, erro: `Esta base também está ligada a outro cliente (${partilhada.cliente_slug}): recusado para não misturar.` };
  return { ok: true, url, base: criar(url, chave) };
}

// ------------------------------------------------------------------ a IA real (chave do próprio cliente)

const SISTEMA_SERVICOS = `Você prepara o catálogo de serviços de uma clínica de estética para a assistente virtual dela.
Para cada serviço recebido devolva:
- nome_es: o nome traduzido para espanhol (curto, natural; marcas como Botox, Dysport, Sculptra ficam iguais);
- aliases: até 8 apelidos que clientes usam em português, inglês e espanhol (ex.: "tox", "botox", "preenchimento labial", "relleno de labios");
- categoria: uma das categorias permitidas;
- preparo_pre e cuidados_pos: separe o texto "preparo_e_cuidados" na parte de ANTES do procedimento e na de DEPOIS, sem inventar nada nem resumir; se uma parte não existir, devolva "".
Nunca invente informação que não está no texto. Devolva um item por serviço, com o mesmo id.`;

const SISTEMA_PROMOCOES = `Você prepara as promoções de uma clínica de estética para a assistente virtual dela.
Para cada promoção devolva:
- campanha: nome curto da campanha (ex.: "Holiday", "New Client Special");
- servico_ids: os ids do CATÁLOGO que a promoção inclui (só ids que existem no catálogo; se nenhum servir, lista vazia);
- brinde_pt, brinde_en, brinde_es: o que é dado de graça na promoção, nas 3 línguas ("" se nada é grátis);
- apelidos: até 6 formas como clientes chamariam a promoção.
Nunca invente informação que não está no texto. Devolva um item por promoção, com o mesmo id.`;

const str = { type: "string" };
const listaStr = { type: "array", items: str };
const objeto = (props: Record<string, unknown>) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
const ESQUEMA_SERVICOS = objeto({ servicos: { type: "array", items: objeto({ id: str, nome_es: str, aliases: listaStr, categoria: { type: "string", enum: Object.keys(CATEGORIAS) }, preparo_pre: str, cuidados_pos: str }) } });
const ESQUEMA_PROMOCOES = objeto({ promocoes: { type: "array", items: objeto({ id: str, campanha: str, servico_ids: listaStr, brinde_pt: str, brinde_en: str, brinde_es: str, apelidos: listaStr }) } });
const LOTE_IA = 15;

/** A IA da conversão, com a chave Anthropic do próprio cliente. Os lotes correm em paralelo. */
export function iaDaExportacao(chave: ChaveDeIa): IaDaExportacao {
  return {
    async servicos(itens) {
      const lotes: (typeof itens)[] = [];
      for (let i = 0; i < itens.length; i += LOTE_IA) lotes.push(itens.slice(i, i + LOTE_IA));
      const respostas = await Promise.all(
        lotes.map(async (lote) => {
          const r = await perguntar(chave, { sistema: SISTEMA_SERVICOS, conteudo: [{ type: "text", text: JSON.stringify({ categorias: Object.keys(CATEGORIAS), servicos: lote }) }], esquema: ESQUEMA_SERVICOS, maxTokens: 16000, semPensar: true });
          return (JSON.parse(r.texto) as { servicos: RespostaServicoIa[] }).servicos;
        }),
      );
      return respostas.flat();
    },
    async promocoes(pedido) {
      const r = await perguntar(chave, { sistema: SISTEMA_PROMOCOES, conteudo: [{ type: "text", text: JSON.stringify(pedido) }], esquema: ESQUEMA_PROMOCOES, maxTokens: 8000, semPensar: true });
      return (JSON.parse(r.texto) as { promocoes: RespostaPromocaoIa[] }).promocoes;
    },
  };
}

// ------------------------------------------------------------------ ler e converter

const diaNoFuso = (agora: Date, fuso: string) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  } catch {
    return agora.toISOString().slice(0, 10);
  }
};

async function converterDoCentral(acesso: NonNullable<Acesso>, deps: Dependencias): Promise<{ ok: true; ex: Exportacao } | { ok: false; erro: string }> {
  if (!clienteDaExportacao(acesso.clienteSlug)) return { ok: false, erro: "Este cliente ainda não tem as tabelas da base do agente configuradas na plataforma (sufixo das tabelas)." };
  const onb = await lerOnboarding(acesso.admin, acesso.clienteSlug);
  if (!onb) return { ok: false, erro: "Este cliente ainda não tem onboarding." };
  const [linhas, itens] = await Promise.all([lerLinhas(acesso.admin, acesso.clienteSlug, onb.id), lerItens(acesso.admin, acesso.clienteSlug, onb.id)]);
  const agora = deps.agora ?? new Date();
  const fuso = linhas.find((l) => l.campo === "fuso_horario" && !l.item_id && typeof l.valor === "string")?.valor as string | undefined;
  let ia = deps.ia;
  if (ia === undefined) {
    const chave = await chaveDoCliente(acesso.admin, acesso.clienteSlug);
    ia = chave ? iaDaExportacao(chave) : null;
  }
  const ex = await exportar({ clienteSlug: acesso.clienteSlug, linhas, itens, etapa1: onb.etapa1, hoje: diaNoFuso(agora, fuso || getClientTimezone(acesso.clienteSlug)), agora: agora.toISOString() }, ia);
  return { ok: true, ex };
}

// ------------------------------------------------------------------ a prévia (não grava nada)

export type Previa = {
  ok: boolean;
  erro?: string;
  exportacao?: Exportacao;
};

/** A prévia: as linhas por tabela, o que ficaria sem destino e o preço como o agente o vai dizer. Não grava. */
export async function previaDaBaseDoAgente(acesso: Acesso, deps: Dependencias = {}): Promise<Previa> {
  if (!acesso?.lexia) return { ok: false, erro: "Só a equipe da Lexia." };
  try {
    const r = await converterDoCentral(acesso, deps);
    if (!r.ok) return r;
    // A ficha completa é grande: na prévia mostra-se só o tamanho (é gravada inteira).
    const ex = { ...r.ex, config: r.ex.config.map((c) => (c.chave === "ficha_onboarding_completa" ? { ...c, valor: `(JSON com a ficha inteira: ${(c.valor.length / 1024).toFixed(0)} KB)` } : c)) };
    return { ok: true, exportacao: ex };
  } catch (e) {
    return { ok: false, erro: `Não foi possível montar a prévia: ${e instanceof Error ? e.message : "erro"}` };
  }
}

// ------------------------------------------------------------------ a gravação

export type ResultadoDaGravacao = {
  ok: boolean;
  erro?: string;
  /** Por tabela: criadas, atualizadas e desativadas (ativo=false). */
  tabelas?: Record<string, { criadas: number; atualizadas: number; desativadas: number }>;
  avisos?: string[];
};

class ErroDeGravacao extends Error {}

type ErroPg = { code?: string; message?: string } | null;
function traduzirErro(tabela: string, e: ErroPg, sql: string): string {
  const m = e?.message ?? "";
  if (e?.code === "PGRST205" || e?.code === "42P01" || /could not find the table|does not exist|schema cache/i.test(m))
    return `Falta criar as tabelas na base da cliente (${tabela} não existe). Rode o ${sql} no SQL Editor do Supabase dela e tente de novo.`;
  if (e?.code === "PGRST204" || /could not find the .* column/i.test(m)) return `Falta atualizar as tabelas na base da cliente (coluna nova em ${tabela}). Rode de novo o ${sql} e tente de novo.`;
  if (e?.code === "23505" || /duplicate key/i.test(m)) return `${tabela}: dois registos com o mesmo nome ou chave (${m.slice(0, 160)}).`;
  return `${tabela}: ${m.slice(0, 200) || "erro ao gravar"}`;
}

const assinatura = (o: Record<string, unknown>) => Object.keys(o).sort().join(",");
const escolher = (o: Record<string, unknown>, colunas: readonly string[]) => Object.fromEntries(colunas.filter((c) => o[c] !== undefined).map((c) => [c, o[c]]));

/** Upsert em grupos com as MESMAS colunas: assim uma coluna ausente nunca vira NULL noutra linha. */
async function upsert(base: Base, tabela: string, linhas: Record<string, unknown>[], conflito: string, sql: string) {
  const grupos = new Map<string, Record<string, unknown>[]>();
  for (const l of linhas) grupos.set(assinatura(l), [...(grupos.get(assinatura(l)) ?? []), l]);
  for (const grupo of grupos.values()) {
    for (let i = 0; i < grupo.length; i += 200) {
      const { error } = await base.from(tabela).upsert(grupo.slice(i, i + 200), { onConflict: conflito, defaultToNull: false });
      if (error) throw new ErroDeGravacao(traduzirErro(tabela, error, sql));
    }
  }
}

async function ler<T>(base: Base, tabela: string, colunas: string, sql: string): Promise<T[]> {
  const { data, error } = await base.from(tabela).select(colunas);
  if (error) throw new ErroDeGravacao(traduzirErro(tabela, error, sql));
  return (data ?? []) as T[];
}

async function desativar(base: Base, tabela: string, coluna: string, valores: string[], sql: string) {
  for (let i = 0; i < valores.length; i += 100) {
    const { error } = await base.from(tabela).update({ ativo: false }).in(coluna, valores.slice(i, i + 100));
    if (error) throw new ErroDeGravacao(traduzirErro(tabela, error, sql));
  }
}

/** Grupos (serviços, profissionais, promoções): upsert por origem_item_id; os que já não estão ativos → ativo=false. */
async function gravarGrupo(base: Base, tabela: string, linhas: Record<string, unknown>[], sql: string) {
  const antes = await ler<{ origem_item_id: string | null; ativo: boolean | null }>(base, tabela, "origem_item_id, ativo", sql);
  const existentes = new Set(antes.map((r) => r.origem_item_id).filter(Boolean));
  if (linhas.length) await upsert(base, tabela, linhas, "origem_item_id", sql);
  const novos = new Set(linhas.map((l) => l.origem_item_id as string));
  const sair = antes.filter((r) => r.origem_item_id && !novos.has(r.origem_item_id) && r.ativo !== false).map((r) => r.origem_item_id as string);
  await desativar(base, tabela, "origem_item_id", sair, sql);
  const criadas = [...novos].filter((id) => !existentes.has(id)).length;
  return { criadas, atualizadas: novos.size - criadas, desativadas: sair.length };
}

/** Chave → valor (info, config): upsert por chave; chaves que esta conversão escreveu antes e já não produz → ativo=false. */
async function gravarChaves(base: Base, tabela: string, linhas: LinhaChave[], sql: string, avisos: string[]) {
  const antes = await ler<{ chave: string; origem: string | null; ativo: boolean | null }>(base, tabela, "chave, origem, ativo", sql);
  const porChave = new Map(antes.map((r) => [r.chave, r]));
  const manuais = linhas.filter((l) => porChave.has(l.chave) && !String(porChave.get(l.chave)?.origem ?? "").startsWith(ORIGEM)).map((l) => l.chave);
  if (manuais.length) avisos.push(`${tabela}: ${manuais.length} chave(s) que tinham sido escritas à mão foram substituídas pela resposta da entrevista: ${manuais.join(", ")}.`);
  await upsert(base, tabela, linhas.map((l) => escolher(l, COLUNAS.chave)), "chave", sql);
  const novas = new Set(linhas.map((l) => l.chave));
  const sair = antes.filter((r) => !novas.has(r.chave) && String(r.origem ?? "").startsWith(ORIGEM) && r.ativo !== false).map((r) => r.chave);
  await desativar(base, tabela, "chave", sair, sql);
  const criadas = linhas.filter((l) => !porChave.has(l.chave)).length;
  return { criadas, atualizadas: linhas.length - criadas, desativadas: sair.length };
}

/** Grava uma exportação numa base já aberta (a do cliente). Só chamar com uma exportação SEM erros. */
export async function gravarExportacao(base: Base, ex: Exportacao): Promise<ResultadoDaGravacao> {
  if (ex.erros.length) return { ok: false, erro: "A prévia tem erros: corrija antes de gravar." };
  const t = ex.tabelas;
  const sql = ex.cliente.sql;
  const avisos: string[] = [];
  try {
    // Ver primeiro se as 5 tabelas existem: uma mensagem clara em vez de gravar metade.
    for (const tabela of Object.values(t)) {
      const { error } = await base.from(tabela).select("*").limit(1);
      if (error) return { ok: false, erro: traduzirErro(tabela, error, sql) };
    }
    const tabelas: NonNullable<ResultadoDaGravacao["tabelas"]> = {};
    tabelas[t.servicos] = await gravarGrupo(base, t.servicos, ex.servicos.map((s) => escolher(s, COLUNAS.servicos)), sql);
    tabelas[t.profissionais] = await gravarGrupo(base, t.profissionais, ex.profissionais.map((p) => escolher(p, COLUNAS.profissionais)), sql);
    // As promoções apontam para o id NUMÉRICO do serviço na base: lê-se depois de gravar os serviços.
    const ids = await ler<{ id: number; origem_item_id: string | null }>(base, t.servicos, "id, origem_item_id", sql);
    const idDe = new Map(ids.filter((r) => r.origem_item_id).map((r) => [r.origem_item_id as string, r.id]));
    tabelas[t.promocoes] = await gravarGrupo(
      base,
      t.promocoes,
      ex.promocoes.map((p) => ({ ...escolher(p, COLUNAS.promocoes), servico_ids: p.servicos_origem.map((o) => idDe.get(o)).filter((x): x is number => typeof x === "number") })),
      sql,
    );
    tabelas[t.info] = await gravarChaves(base, t.info, ex.info, sql, avisos);
    tabelas[t.config] = await gravarChaves(base, t.config, ex.config, sql, avisos);
    return { ok: true, tabelas, avisos };
  } catch (e) {
    if (e instanceof ErroDeGravacao) return { ok: false, erro: e.message };
    throw e;
  }
}

/** "Gravar na base do agente": converte de novo (o estado atual da ficha), recusa se houver erros, grava na base DESTE cliente. */
export async function gravarNaBaseDoAgente(acesso: Acesso, deps: Dependencias & { criarCliente?: CriarCliente } = {}): Promise<ResultadoDaGravacao> {
  if (!acesso?.lexia) return { ok: false, erro: "Só a equipe da Lexia." };
  try {
    const r = await converterDoCentral(acesso, deps);
    if (!r.ok) return r;
    if (r.ex.cliente.slug !== acesso.clienteSlug) return { ok: false, erro: "Cliente trocado na conversão: recusado." };
    if (r.ex.erros.length) return { ok: false, erro: `A prévia tem ${r.ex.erros.length} erro(s): ${r.ex.erros[0].slice(0, 300)}` };
    const aberta = await abrirBaseDoCliente(acesso.admin, acesso.clienteSlug, deps.criarCliente);
    if (!aberta.ok) return aberta;
    const g = await gravarExportacao(aberta.base, r.ex);
    return g.ok ? { ...g, avisos: [...r.ex.avisos, ...(g.avisos ?? [])] } : g;
  } catch (e) {
    return { ok: false, erro: `Não foi possível gravar: ${e instanceof Error ? e.message : "erro"}` };
  }
}
