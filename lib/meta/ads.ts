import "server-only";

/**
 * Leitura da Marketing API da Meta (Fase 8 — campanhas e CAC).
 *
 * Só lê. Nada aqui cria, pausa ou altera anúncios: o token do system user
 * "Lexia AI Bot" é usado exclusivamente para espelhar números para o painel.
 *
 * A conta de anúncios é por cliente, no padrão `${PREFIX}_META_ADS_ACCOUNT_ID`
 * já usado em lib/metrics/external-client-metrics.ts.
 *
 * O TOKEN TAMBÉM PODE SER POR CLIENTE, E ISSO NÃO É UM LUXO
 * Medido a 19/10/2026: o `META_ADS_TOKEN` que está em produção é um system user
 * da app "Messenger Detail By Cordeiro" e `/me/adaccounts` devolve-lhe uma
 * única conta — a do Detail. Um token assim não consegue ler a conta de outro
 * cliente, e não devia: cada cliente tem o seu negócio na Meta, e partilhar um
 * token obrigaria o dono de um a dar acesso ao negócio do outro.
 *
 * Por isso `${PREFIX}_META_ADS_TOKEN` ganha ao global. O global continua a
 * servir de recurso para não quebrar quem já está configurado.
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

/**
 * Campos do anúncio, medidos contra act_713888634370334 em 19/10/2026: 73
 * anúncios numa só página, todos com `adset` e `campaign` preenchidos.
 *
 * O `adset{...}` e o `campaign{...}` são expansões de campo: pedi-los aqui
 * poupa duas voltas à API por anúncio. Valem a mesma regra do `insightFields`
 * — um campo inválido faz a Meta recusar o pedido inteiro (#100), por isso não
 * se acrescenta nada sem medir.
 */
const adFields = [
  "id",
  "name",
  "status",
  "adset{id,name}",
  "campaign{id,name}",
].join(",");

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
 * Nome exacto da variável de ambiente que liga este cliente a uma conta de
 * anúncios. O painel do admin mostra-a quando falta, para não obrigar a
 * adivinhar a convenção do nome.
 */
export function getMetaAdsAccountEnvName(clienteSlug: string) {
  return `${envPrefix(clienteSlug)}_META_ADS_ACCOUNT_ID`;
}

/**
 * Nome exacto da variável com o token deste cliente. Devolver o nome mesmo
 * quando ela não existe é de propósito: é isto que o painel do admin mostra a
 * quem tem de a criar.
 */
export function getMetaAdsTokenEnvName(clienteSlug: string) {
  return `${envPrefix(clienteSlug)}_META_ADS_TOKEN`;
}

/**
 * As variáveis que faltam para este cliente, pelo nome exacto, por ordem de
 * quem as tem de criar.
 *
 * Existe porque dizer só "falta a conta de anúncios" manda a pessoa errada à
 * procura: para um cliente com negócio próprio na Meta faltam DUAS coisas — a
 * conta e um token que a consiga ler — e o painel tem de dizer as duas.
 *
 * O token do cliente só conta como em falta se também não houver global: quem
 * já funciona com o global não deve ver um aviso a pedir-lhe uma variável nova.
 */
export function getMetaAdsVariaveisEmFalta(clienteSlug: string): string[] {
  const emFalta: string[] = [];

  if (!process.env[getMetaAdsAccountEnvName(clienteSlug)]?.trim()) {
    emFalta.push(getMetaAdsAccountEnvName(clienteSlug));
  }

  const temToken =
    Boolean(process.env[getMetaAdsTokenEnvName(clienteSlug)]?.trim()) ||
    Boolean(process.env.META_ADS_TOKEN?.trim());

  if (!temToken) {
    emFalta.push(getMetaAdsTokenEnvName(clienteSlug));
  }

  return emFalta;
}

/**
 * Devolve `null` — e não um erro — quando o cliente não tem conta de anúncios
 * configurada. Um cliente sem Meta Ads não é uma avaria; é o caso normal de
 * quem ainda não anuncia, e o painel tem de saber mostrar "sem dados".
 */
export function getMetaAdsConfig(clienteSlug: string): MetaAdsConfig | null {
  // O token do cliente ganha ao global. Um cliente com negócio próprio na Meta
  // tem de poder ter o seu, sem depender do token de outro cliente.
  const token =
    process.env[getMetaAdsTokenEnvName(clienteSlug)]?.trim() ||
    process.env.META_ADS_TOKEN?.trim();
  const accountIdRaw =
    process.env[getMetaAdsAccountEnvName(clienteSlug)]?.trim();

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

/**
 * Um anúncio e a árvore a que pertence.
 *
 * É isto que dá nome ao `origem_source_id` que o agente guarda na ficha: o
 * referral da Meta traz o id do ANÚNCIO, nunca o da campanha. Sem este
 * espelho, o painel tem um número de 18 dígitos e mais nada.
 */
export type MetaAd = {
  campanhaExternaId: string | null;
  campanhaNome: string | null;
  conjuntoExternoId: string | null;
  conjuntoNome: string | null;
  estado: string | null;
  externalId: string;
  nome: string;
};

export async function fetchMetaAds(config: MetaAdsConfig): Promise<MetaAd[]> {
  const rows = await graphCollect<{
    adset?: { id?: string; name?: string };
    campaign?: { id?: string; name?: string };
    id?: string;
    name?: string;
    status?: string;
  }>(config, `${config.accountId}/ads`, { fields: adFields });

  return rows
    .filter((row): row is { id: string } & typeof row => Boolean(row.id))
    .map((row) => ({
      campanhaExternaId: row.campaign?.id ? String(row.campaign.id) : null,
      campanhaNome: row.campaign?.name?.trim() || null,
      conjuntoExternoId: row.adset?.id ? String(row.adset.id) : null,
      conjuntoNome: row.adset?.name?.trim() || null,
      estado: row.status ?? null,
      externalId: String(row.id),
      nome: row.name?.trim() || String(row.id),
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
