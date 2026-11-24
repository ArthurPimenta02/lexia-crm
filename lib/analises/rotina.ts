/**
 * A porta da rotina de análise na nuvem (24/11/2026).
 *
 * A rotina corre num ambiente do Claude na nuvem que só deixa sair HTTPS: a
 * ligação direta ao Postgres (porta 5432) é recusada mesmo com "Acesso à rede:
 * Total" (medido nas execuções de 20 a 24/11, todas com "connection refused").
 * Por isso a rotina lê e grava pelo painel, em `/api/analises/rotina`, com um
 * token próprio (`ANALISE_ROTINA_TOKEN`) que só serve para isto.
 *
 * Aqui ficam as regras puras (sem acesso a dados), para se poderem testar:
 * - o token;
 * - que bases e tabelas a rotina pode ler, e com que filtro de data;
 * - a validação do relatório que ela grava.
 */
import { timingSafeEqual } from "node:crypto";

import { eGravidade } from "@/lib/analises/regras";

/** As bases que a rotina lê. `crm` é a central; as outras são a base própria de cada cliente. */
export const BASES_DA_ROTINA = {
  asteric: "asteric",
  claudia: "claudia_leite_spa",
  crm: null,
  detail: "detail_by_cordeiro",
  jessica: "jessica_beauty",
  miranda: "miranda_skin_experts",
} as const satisfies Record<string, string | null>;
export type BaseDaRotina = keyof typeof BASES_DA_ROTINA;
export const eBase = (v: unknown): v is BaseDaRotina => typeof v === "string" && Object.hasOwn(BASES_DA_ROTINA, v);

/**
 * Na base central só estas tabelas: as conversas, o que cada turno decidiu e as
 * próprias análises. Nada de conexões, perfis, chaves ou onboarding.
 */
export const TABELAS_CRM = [
  "lexia_analises",
  "lexia_analises_itens",
  "lexia_clientes",
  "lexia_contactos",
  "lexia_mensagens",
  "lexia_turnos",
] as const;

/** Colunas proibidas na base central mesmo dentro das tabelas permitidas. */
export const COLUNAS_ESCONDIDAS = new Set(["segredos", "token", "password", "senha", "service_role_key", "api_key"]);

/** As colunas de data por ordem de preferência (a mesma ordem do ler.mjs antigo). */
export const COLUNAS_DE_DATA = ["criado_em", "created_at", "atualizado_em", "updated_at", "data_hora", "inicio"] as const;

/** Tabelas até este tamanho vêm inteiras (catálogos, preços, regras). */
export const TABELA_PEQUENA = 3000;
/** Linhas por página na resposta (a Vercel corta respostas acima de ~4,5 MB). */
export const PAGINA = 500;
export const HORAS_MAXIMAS = 24 * 31;

/** O filtro de leitura de uma tabela: inteira, por data, ou não lida (grande e sem data). */
export function filtroDaTabela(total: number, colunas: string[], desde: string) {
  if (total <= TABELA_PEQUENA) return { tipo: "inteira" as const };
  const coluna = COLUNAS_DE_DATA.find((c) => colunas.includes(c));
  if (coluna) return { coluna, desde, tipo: "desde" as const };
  return { tipo: "nao_lida" as const };
}

export function horasPedidas(v: string | null) {
  const n = Number(v ?? 24);
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.min(Math.ceil(n), HORAS_MAXIMAS);
}

/** Compara o token sem vazar, pelo tempo de resposta, quantos caracteres acertou. */
export function tokenValido(recebido: string | null, esperado: string | undefined) {
  const e = esperado?.trim();
  if (!e || e.length < 32) return false;
  const r = (recebido ?? "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(r);
  const b = Buffer.from(e);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tira das linhas as colunas que nunca devem sair (defesa a mais na base central). */
export function semColunasEscondidas(linhas: Record<string, unknown>[]) {
  return linhas.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !COLUNAS_ESCONDIDAS.has(k))));
}

export type ItemRelatorio = {
  causa: string | null;
  citacao: string | null;
  cliente_slug: string;
  gravidade: "grave" | "medio" | "detalhe" | "positivo";
  identificador_conversa: string | null;
  o_que_a_ia_decidiu: string | null;
  o_que_o_codigo_fez: string | null;
  onde_corrigir: string | null;
  titulo: string;
};

export type Relatorio = {
  analise_id: string | null;
  custo_estimado: number | null;
  erro: string | null;
  itens: ItemRelatorio[];
  periodo_fim: string | null;
  periodo_inicio: string | null;
  resumo: string | null;
  tipo: "diaria" | "geral" | "especifica";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, limite: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, limite) : null);
const data = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** Valida o relatorio.json da rotina (o mesmo formato do gravar.mjs). */
export function validarRelatorio(corpo: unknown): { ok: true; relatorio: Relatorio } | { erro: string; ok: false } {
  const c = (corpo && typeof corpo === "object" ? corpo : null) as Record<string, unknown> | null;
  if (!c) return { erro: "corpo vazio", ok: false };
  const analiseId = c.analise_id == null ? null : String(c.analise_id);
  if (analiseId !== null && !UUID.test(analiseId)) return { erro: "analise_id inválido", ok: false };
  const tipo = c.tipo ?? "diaria";
  if (tipo !== "diaria" && tipo !== "geral" && tipo !== "especifica") return { erro: "tipo inválido", ok: false };
  if (!Array.isArray(c.itens ?? [])) return { erro: "itens tem de ser uma lista", ok: false };
  const brutos = (c.itens ?? []) as unknown[];
  if (brutos.length > 300) return { erro: "itens demais (máximo 300)", ok: false };

  const itens: ItemRelatorio[] = [];
  for (const [i, b] of brutos.entries()) {
    const it = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const cliente = txt(it.cliente_slug, 80);
    const titulo = txt(it.titulo, 300);
    if (!cliente) return { erro: `item ${i}: falta cliente_slug`, ok: false };
    if (!titulo) return { erro: `item ${i}: falta titulo`, ok: false };
    if (!eGravidade(it.gravidade)) return { erro: `item ${i}: gravidade inválida`, ok: false };
    itens.push({
      causa: txt(it.causa, 4000),
      citacao: txt(it.citacao, 4000),
      cliente_slug: cliente,
      gravidade: it.gravidade,
      identificador_conversa: txt(it.identificador_conversa, 200),
      o_que_a_ia_decidiu: txt(it.o_que_a_ia_decidiu, 4000),
      o_que_o_codigo_fez: txt(it.o_que_o_codigo_fez, 4000),
      onde_corrigir: txt(it.onde_corrigir, 1000),
      titulo,
    });
  }

  const custo = typeof c.custo_estimado === "number" && Number.isFinite(c.custo_estimado) ? c.custo_estimado : null;
  return {
    ok: true,
    relatorio: {
      analise_id: analiseId,
      custo_estimado: custo,
      erro: txt(c.erro, 2000),
      itens,
      periodo_fim: data(c.periodo_fim),
      periodo_inicio: data(c.periodo_inicio),
      resumo: txt(c.resumo, 8000),
      tipo,
    },
  };
}
