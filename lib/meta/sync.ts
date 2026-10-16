import "server-only";

import { getDateInputValue } from "@/lib/dashboard/date-range";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  fetchMetaCampaigns,
  fetchMetaDailyInsights,
  getMetaAdsConfig,
  MetaAdsError,
  type MetaCampaign,
  type MetaDailyInsight,
} from "./ads";

/**
 * Espelha campanhas e gasto diário da Meta para o Supabase central.
 *
 * Reler é obrigatório, não uma opção: a Meta corrige os números de dias já
 * passados durante cerca de 28 dias, à medida que as janelas de atribuição
 * fecham. Por isso a janela padrão é 28 dias e a escrita é upsert — correr
 * esta sincronização duas vezes no mesmo dia tem de dar o mesmo resultado.
 */

const defaultLookbackDays = 28;
/** Teto só para o backfill inicial; não usar no agendamento diário. */
const maxLookbackDays = 730;

export type MetaSyncResult = {
  ate: string;
  campanhas: number;
  clienteSlug: string;
  desde: string;
  dias: number;
  gastoTotal: number;
  linhas: number;
  moeda: string;
};

type CampanhaDimensao = {
  campanha_externa_id: string;
  cliente_slug: string;
  criada_em_plataforma: string | null;
  estado: string | null;
  nome: string;
  objectivo: string | null;
  plataforma: "meta";
  sincronizada_em: string;
};

/**
 * A dimensão vem de duas fontes porque nenhuma é completa: `/campaigns` não
 * lista campanhas apagadas, e os insights de uma campanha apagada continuam a
 * aparecer. Perder a linha da dimensão apagaria o gasto histórico dela.
 */
function buildCampanhaRows(
  clienteSlug: string,
  campanhas: MetaCampaign[],
  insights: MetaDailyInsight[],
  agora: string,
): CampanhaDimensao[] {
  const porId = new Map<string, CampanhaDimensao>();

  for (const campanha of campanhas) {
    porId.set(campanha.externalId, {
      campanha_externa_id: campanha.externalId,
      cliente_slug: clienteSlug,
      criada_em_plataforma: campanha.createdTime,
      estado: campanha.estado,
      nome: campanha.nome.slice(0, 512),
      objectivo: campanha.objectivo,
      plataforma: "meta",
      sincronizada_em: agora,
    });
  }

  for (const insight of insights) {
    if (porId.has(insight.campanhaExternaId)) {
      continue;
    }

    porId.set(insight.campanhaExternaId, {
      campanha_externa_id: insight.campanhaExternaId,
      cliente_slug: clienteSlug,
      criada_em_plataforma: null,
      estado: null,
      nome: insight.campanhaNome.slice(0, 512),
      objectivo: insight.objectivo,
      plataforma: "meta",
      sincronizada_em: agora,
    });
  }

  return [...porId.values()];
}

export type MetaSyncInput = {
  clienteSlug: string;
  lookbackDays?: number;
};

export async function syncMetaCampanhas(
  input: MetaSyncInput,
): Promise<MetaSyncResult> {
  const clienteSlug = input.clienteSlug.trim();

  if (!clienteSlug) {
    throw new MetaAdsError("cliente_slug é obrigatório.", 400);
  }

  const config = getMetaAdsConfig(clienteSlug);

  if (!config) {
    throw new MetaAdsError(
      `O cliente ${clienteSlug} não tem conta de anúncios da Meta configurada.`,
      503,
    );
  }

  const lookbackDays = Math.max(
    1,
    Math.min(
      Number(input.lookbackDays ?? defaultLookbackDays) || defaultLookbackDays,
      maxLookbackDays,
    ),
  );

  // O dia tem de ser o do fuso da conta de anúncios, não o do servidor: às
  // 23h de Lisboa o servidor em UTC-? já pode estar noutro dia, e pedir um dia
  // futuro devolve zero.
  const timezone = getClientTimezone(clienteSlug);
  const agoraDate = new Date();
  const ate = getDateInputValue(agoraDate, timezone);
  const desde = getDateInputValue(
    new Date(agoraDate.getTime() - (lookbackDays - 1) * 24 * 60 * 60 * 1000),
    timezone,
  );
  const agora = agoraDate.toISOString();

  const [campanhas, insights] = await Promise.all([
    fetchMetaCampaigns(config),
    fetchMetaDailyInsights(config, { since: desde, until: ate }),
  ]);

  const admin = createAdminClient();
  const campanhaRows = buildCampanhaRows(clienteSlug, campanhas, insights, agora);

  if (campanhaRows.length === 0) {
    return {
      ate,
      campanhas: 0,
      clienteSlug,
      desde,
      dias: lookbackDays,
      gastoTotal: 0,
      linhas: 0,
      moeda: "EUR",
    };
  }

  const { data: campanhasGravadas, error: erroCampanhas } = await admin
    .from("lexia_campanhas")
    .upsert(campanhaRows, {
      onConflict: "cliente_slug,plataforma,campanha_externa_id",
    })
    .select("id, campanha_externa_id");

  if (erroCampanhas) {
    throw new MetaAdsError(
      `Não foi possível gravar as campanhas: ${erroCampanhas.message}`,
      500,
    );
  }

  const idPorExterno = new Map(
    (campanhasGravadas ?? []).map((row) => [
      String(row.campanha_externa_id),
      String(row.id),
    ]),
  );

  const custoRows = insights
    .map((insight) => {
      const campanhaId = idPorExterno.get(insight.campanhaExternaId);

      if (!campanhaId) {
        return null;
      }

      return {
        accoes: insight.accoes,
        alcance: insight.alcance,
        campanha_id: campanhaId,
        cliente_slug: clienteSlug,
        cliques: insight.cliques,
        cliques_link: insight.cliquesLink,
        cpm: insight.cpm,
        ctr: insight.ctr,
        dia: insight.dia,
        gasto: insight.gasto,
        impressoes: insight.impressoes,
        moeda: insight.moeda,
        sincronizado_em: agora,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (custoRows.length > 0) {
    const { error: erroCustos } = await admin
      .from("lexia_campanha_custos")
      .upsert(custoRows, { onConflict: "campanha_id,dia" });

    if (erroCustos) {
      throw new MetaAdsError(
        `Não foi possível gravar o gasto diário: ${erroCustos.message}`,
        500,
      );
    }
  }

  return {
    ate,
    campanhas: campanhaRows.length,
    clienteSlug,
    desde,
    dias: lookbackDays,
    gastoTotal:
      Math.round(custoRows.reduce((total, row) => total + row.gasto, 0) * 100) / 100,
    linhas: custoRows.length,
    moeda: custoRows[0]?.moeda ?? "EUR",
  };
}
