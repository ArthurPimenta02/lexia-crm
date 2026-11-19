import "server-only";

import type { Escopo } from "@/lib/ajudante/ferramentas";
import { createAdminClient } from "@/lib/supabase/admin";

import { VISTAS } from "./consulta-esquema";

/**
 * Consulta livre do Analista: o modelo escreve UM SELECT sobre as vistas do
 * schema `analista` e recebe as linhas (no máximo 200, com o total).
 *
 * A empresa NUNCA vem do modelo: vai `escopo.clienteSlug` (da sessão) para a
 * função `public.analista_consultar`, que a fixa na transacção antes de correr.
 * Todas as travas estão na base (papel sem privilégios, vistas filtradas,
 * filtro de texto, transacção só de leitura, custo e tempo máximos): ver a
 * migração 202611190021_analista_consulta_livre.sql. Aqui só se limpa a
 * entrada e se encurta a saída.
 */

type Saida = { dados: unknown };
type Resultado = { erro?: string; linhas?: unknown[]; total?: number; mostradas?: number; truncado?: boolean };

export const MAX_SQL = 8000;
/** PostgREST quando a função não existe (PGRST202) ou o Postgres quando falta o schema/função (42883, 3F000). */
const FALTA_FUNCAO = /PGRST202|42883|3F000|could not find the function|function .*does not exist|schema "?analista"? does not exist/i;
export const INDISPONIVEL = "A consulta livre ainda não está ativada nesta conta. Não tente de novo: responda com as outras ferramentas e, se não der, diga ao dono com simplicidade que essa pergunta ainda não dá para responder aqui (sem falar em consultas, bases ou SQL).";
/** O motor corta cada resultado em 60 000 caracteres; aqui fica-se bem abaixo e sem partir o JSON. */
export const MAX_CARACTERES = 40_000;

/** Tira espaços e um ';' final (o resto das regras é a base que aplica). */
export function limparSql(v: unknown) {
  if (typeof v !== "string") return "";
  return v.trim().replace(/;\s*$/, "").trim();
}

/** Encurta as linhas até o JSON caber, avisando que cortou. */
export function caber(r: Resultado, max = MAX_CARACTERES) {
  const linhas = Array.isArray(r.linhas) ? [...r.linhas] : [];
  const base = { mostradas: linhas.length, total: r.total ?? linhas.length, truncado: Boolean(r.truncado) };
  let saida: Record<string, unknown> = { ...base, linhas };
  while (linhas.length > 1 && JSON.stringify(saida).length > max) {
    linhas.length = Math.max(1, Math.floor(linhas.length * 0.7));
    saida = { ...base, aviso: "Resultado grande demais: só vêm as primeiras linhas. Agregue ou escolha menos colunas.", linhas, mostradas: linhas.length, truncado: true };
  }
  if (JSON.stringify(saida).length > max) {
    saida = { ...base, aviso: "Uma linha só já é grande demais. Escolha menos colunas ou use left(conteudo, 300).", linhas: [], mostradas: 0, truncado: true };
  }
  return saida;
}

const COMPACTO = Object.entries(VISTAS)
  .map(([nome, v]) => `analista.${nome}(${v.colunas.join(", ")})`)
  .join("; ");

export const consultaLivre = {
  consulta_livre: {
    descricao:
      "Consulta livre, só de leitura: escreva UM SELECT (PostgreSQL) sobre os dados desta empresa quando nenhuma outra ferramenta dá a resposta (funil, contagens por origem/campanha/dia/hora, follow-ups, quem não agendou, tempos de resposta, cruzamentos). " +
      "Só as vistas abaixo, sempre com o prefixo analista.; já vêm filtradas pela empresa. Datas em UTC (use at time zone). Agregue no SQL; vêm no máximo 200 linhas e o total. Se der erro, corrija e tente de novo. " +
      `Vistas: ${COMPACTO}.`,
    executar: async (e: Escopo, a: Record<string, unknown>): Promise<Saida> => {
      const sql = limparSql(a.sql);
      if (!sql) return { dados: { erro: "Escreva a consulta SELECT no campo sql." } };
      if (sql.length > MAX_SQL) return { dados: { erro: `Consulta longa demais (máx. ${MAX_SQL} caracteres).` } };
      const { data, error } = await createAdminClient().rpc("analista_consultar", { p_cliente: e.clienteSlug, p_sql: sql });
      if (error) {
        if (/statement timeout|canceling statement/i.test(error.message ?? "")) return { dados: { erro: "A consulta demorou demais (máx. 8 s). Filtre por datas ou agregue." } };
        // A migração ainda não foi corrida (a função não existe): não é um erro do modelo nem da rede.
        if (FALTA_FUNCAO.test(`${(error as { code?: string }).code ?? ""} ${error.message ?? ""}`)) return { dados: { erro: INDISPONIVEL, indisponivel: true } };
        throw new Error("consulta_livre");
      }
      const r = (data ?? {}) as Resultado;
      if (r.erro) return { dados: { erro: r.erro } };
      return { dados: caber(r) };
    },
    parametros: {
      additionalProperties: false,
      properties: { sql: { description: "Uma instrução SELECT ou WITH sobre as vistas analista.*", type: "string" } },
      required: ["sql"],
      type: "object",
    },
    rotulo: "Consultando os dados",
  },
};
