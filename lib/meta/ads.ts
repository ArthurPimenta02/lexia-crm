import "server-only";

/**
 * Leitura da Marketing API da Meta (Fase 8 — campanhas e CAC).
 *
 * Só lê. Nada aqui cria, pausa ou altera anúncios: o token do system user
 * "Lexia AI Bot" é usado exclusivamente para espelhar números para o painel.
 *
 * O token é um só, da Lexia; a conta de anúncios é por cliente, no padrão
 * `${PREFIX}_META_ADS_ACCOUNT_ID` já usado em lib/metrics/external-client-metrics.ts.
 */

const graphBase = "https://graph.facebook.com";

/**
 * Campos medidos contra act_713888634370334 em 14/10/2026. Todos devolvem
 * valor ao nível de campanha com time_increment=1. Não acrescentar campos sem
 * testar: a Meta rejeita o pedido inteiro (#100) por um campo inválido, em vez
 * de ignorar só esse campo.
 */
const insightFields = [
  "campaign_id",
  "campaign_name",
  // Também vem nos insights, e é a única via para o objectivo de uma campanha
  // já apagada na Meta: essa não aparece em /campaigns, mas o gasto dela fica.
  "objective",
  "date_start",
  "spend",
  "reach",
  "impressions",
  "clicks",
  "inline_link_clicks",
  "cpm",
  "ctr",
  "actions",
  "account_currency",
].join(",");

const campaignFields = ["id", "name", "objective", "status", "created_time"].join(",");

/** Limite de páginas por pedido. 500 linhas/página cobre meses de histórico. */
const maxPages = 20;
const pageSize = 500;

export class MetaAdsError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "MetaAdsError";
    this.status = status;
  }
}

export type MetaAdsConfig = {
  accountId: string;
  apiVersion: string;
  token: string;
};

/**
 * Prefixo de ambiente a partir do slug: `detail_by_cordeiro` →
 * `DETAIL_BY_CORDEIRO`. Mesma regra do resto do repo.
 */
function envPrefix(clienteSlug: string) {
  return clienteSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * Devolve `null` — e não um erro — quando o cliente não tem conta de anúncios
 * configurada. Um cliente sem Meta Ads não é uma avaria; é o caso normal de
 * quem ainda não anuncia, e o painel tem de saber mostrar "sem dados".
 */
export function getMetaAdsConfig(clienteSlug: string): MetaAdsConfig | null {
  const token = process.env.META_ADS_TOKEN?.trim();
  const accountIdRaw =
    process.env[`${envPrefix(clienteSlug)}_META_ADS_ACCOUNT_ID`]?.trim();

  if (!token || !accountIdRaw) {
    return null;
  }

  // A Meta exige o prefixo `act_`. Aceitar os dois formatos evita um erro
  // silencioso de 0 linhas se alguém colar só o número da conta.
  const accountId = accountIdRaw.startsWith("act_")
    ? accountIdRaw
    : `act_${accountIdRaw}`;

  return {
    accountId,
    apiVersion: process.env.META_API_VERSION?.trim() || "v26.0",
    token,
  };
}

type GraphPage<T> = {
  data?: T[];
  error?: { code?: number; message?: string; type?: string };
  paging?: { next?: string };
};

async function graphRequest<T>(url: string): Promise<GraphPage<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new MetaAdsError("Não foi possível contactar a API da Meta.", 504);
  }

  let payload: GraphPage<T>;

  try {
    payload = (await response.json()) as GraphPage<T>;
  } catch {
    throw new MetaAdsError("A Meta devolveu uma resposta ilegível.", 502);
  }

  if (payload.error) {
    // A mensagem da Meta é a única pista útil quando o token perde um asset ou
    // a versão da API expira. Propagar em claro, sem o token no texto.
    const detail = payload.error.message || "erro sem descrição";
    throw new MetaAdsError(
      `A Meta recusou o pedido: ${detail}`,
      response.status === 401 || response.status === 403 ? 403 : 502,
    );
  }

  if (!response.ok) {
    throw new MetaAdsError(`A Meta respondeu ${response.status}.`, 502);
  }

  return payload;
}

/**
 * Percorre a paginação por cursor. A Meta devolve o URL completo em
 * `paging.next`, já com o token, por isso não se reconstrói o pedido.
 */
async function graphCollect<T>(
  config: MetaAdsConfig,
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const query = new URLSearchParams({
    ...params,
    access_token: config.token,
    limit: String(pageSize),
  });

  let url: string | undefined =
    `${graphBase}/${config.apiVersion}/${path}?${query.toString()}`;
  const rows: T[] = [];

  for (let page = 0; page < maxPages && url; page += 1) {
    const payload: GraphPage<T> = await graphRequest<T>(url);
    rows.push(...(payload.data ?? []));
    url = payload.paging?.next;
  }

  return rows;
}

export type MetaCampaign = {
  createdTime: string | null;
  externalId: string;
  nome: string;
  objectivo: string | null;
  estado: string | null;
};

export async function fetchMetaCampaigns(
  config: MetaAdsConfig,
): Promise<MetaCampaign[]> {
  const rows = await graphCollect<{
    created_time?: string;
    id?: string;
    name?: string;
    objective?: string;
    status?: string;
  }>(config, `${config.accountId}/campaigns`, { fields: campaignFields });

  return rows
    .filter((row): row is { id: string } & typeof row => Boolean(row.id))
    .map((row) => ({
      createdTime: row.created_time ?? null,
      estado: row.status ?? null,
      externalId: String(row.id),
      nome: row.name?.trim() || String(row.id),
      objectivo: row.objective ?? null,
    }));
}

export type MetaAction = { action_type: string; value: string };

export type MetaDailyInsight = {
  accoes: MetaAction[] | null;
  alcance: number | null;
  campanhaExternaId: string;
  campanhaNome: string;
  cliques: number | null;
  cliquesLink: number | null;
  cpm: number | null;
  ctr: number | null;
  dia: string;
  gasto: number;
  impressoes: number | null;
  moeda: string;
  objectivo: string | null;
};

/** A Meta devolve números como string, e omite o campo quando é zero. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchMetaDailyInsights(
  config: MetaAdsConfig,
  range: { since: string; until: string },
): Promise<MetaDailyInsight[]> {
  const rows = await graphCollect<Record<string, unknown>>(
    config,
    `${config.accountId}/insights`,
    {
      fields: insightFields,
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: range.since, until: range.until }),
    },
  );

  return rows
    .filter((row) => Boolean(row.campaign_id) && Boolean(row.date_start))
    .map((row) => {
      const accoes = Array.isArray(row.actions)
        ? (row.actions as MetaAction[])
        : null;

      return {
        accoes,
        alcance: toNumber(row.reach),
        campanhaExternaId: String(row.campaign_id),
        campanhaNome:
          String(row.campaign_name ?? "").trim() || String(row.campaign_id),
        cliques: toNumber(row.clicks),
        cliquesLink: toNumber(row.inline_link_clicks),
        cpm: toNumber(row.cpm),
        ctr: toNumber(row.ctr),
        // `date_start` com time_increment=1 é o próprio dia, no fuso da conta.
        dia: String(row.date_start),
        gasto: toNumber(row.spend) ?? 0,
        impressoes: toNumber(row.impressions),
        moeda: String(row.account_currency ?? "EUR").toUpperCase(),
        objectivo: row.objective ? String(row.objective) : null,
      };
    });
}
