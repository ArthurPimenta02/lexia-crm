import "server-only";

import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * Leitura do painel de campanhas (Fase 8).
 *
 * Lê com o cliente autenticado, não com o service_role: as policies de
 * lexia_campanhas e lexia_campanha_custos são a defesa real do isolamento
 * entre empresas, e usar a chave de serviço aqui passaria por cima delas.
 */

type CustoRow = {
  campanha_id: string;
  cliques: number | null;
  cliques_link: number | null;
  dia: string;
  gasto: number | string | null;
  impressoes: number | null;
  moeda: string | null;
  sincronizado_em: string | null;
};

type CampanhaRow = {
  estado: string | null;
  id: string;
  nome: string;
  objectivo: string | null;
};

export type CampanhaResumo = {
  cliques: number;
  estado: string | null;
  gasto: number;
  id: string;
  impressoes: number;
  nome: string;
  objectivo: string | null;
};

export type PainelCampanhas = {
  atualizadoEm: string | null;
  cliques: number;
  cliquesLink: number;
  contactosNovos: number;
  cpm: number | null;
  ctr: number | null;
  custoPorContacto: number | null;
  diario: { contactos: number; dia: string; gasto: number }[];
  gasto: number;
  impressoes: number;
  moeda: string;
  porCampanha: CampanhaResumo[];
  temDados: boolean;
};

const painelVazio: PainelCampanhas = {
  atualizadoEm: null,
  cliques: 0,
  cliquesLink: 0,
  contactosNovos: 0,
  cpm: null,
  ctr: null,
  custoPorContacto: null,
  diario: [],
  gasto: 0,
  impressoes: 0,
  moeda: "EUR",
  porCampanha: [],
  temDados: false,
};

function toNumber(value: number | string | null) {
  if (value === null) {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Conta os contactos criados em cada dia do período.
 *
 * É daqui que sai "mensagens" e "custo por mensagem", e não da Meta: nesta
 * conta a Meta não devolve conversas iniciadas em nenhum dia do histórico
 * (ver o cabeçalho da migration 202610140002). Contar do nosso lado dá um
 * número maior do que o real por campanha — inclui quem chegou sem anúncio —
 * por isso o rótulo no ecrã é "contactos novos", nunca "mensagens do anúncio".
 */
async function contarContactosPorDia(
  clienteSlug: string,
  inicioIso: string,
  fimIso: string,
  timezone: string,
) {
  const supabase = await createClient();
  const { data, error } = await fetchAllSupabaseRows<{ criado_em: string | null }>(
    (from, to) =>
      supabase
        .from("lexia_contactos")
        .select("criado_em")
        .eq("cliente_slug", clienteSlug)
        .gte("criado_em", inicioIso)
        .lte("criado_em", fimIso)
        .range(from, to),
  );

  if (error) {
    return new Map<string, number>();
  }

  const formatador = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const porDia = new Map<string, number>();

  for (const linha of data) {
    if (!linha.criado_em) {
      continue;
    }

    // O dia tem de ser calculado no fuso do cliente para alinhar com o `dia`
    // que a Meta devolve. Somar um contacto no dia errado desloca o custo.
    const dia = formatador.format(new Date(linha.criado_em));

    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }

  return porDia;
}

export async function getPainelCampanhas({
  clienteSlug,
  fim,
  fimIso,
  inicio,
  inicioIso,
  timezone,
}: {
  clienteSlug: string;
  /** Dia final inclusivo, YYYY-MM-DD no fuso do cliente. */
  fim: string;
  fimIso: string;
  /** Dia inicial inclusivo, YYYY-MM-DD no fuso do cliente. */
  inicio: string;
  inicioIso: string;
  timezone: string;
}): Promise<PainelCampanhas> {
  const supabase = await createClient();

  const [custosResultado, campanhasResultado, contactosPorDia] = await Promise.all([
    supabase
      .from("lexia_campanha_custos")
      .select(
        "campanha_id, cliques, cliques_link, dia, gasto, impressoes, moeda, sincronizado_em",
      )
      .eq("cliente_slug", clienteSlug)
      .gte("dia", inicio)
      .lte("dia", fim)
      .order("dia", { ascending: true }),
    supabase
      .from("lexia_campanhas")
      .select("estado, id, nome, objectivo")
      .eq("cliente_slug", clienteSlug),
    contarContactosPorDia(clienteSlug, inicioIso, fimIso, timezone),
  ]);

  if (custosResultado.error || campanhasResultado.error) {
    return painelVazio;
  }

  const custos = (custosResultado.data ?? []) as CustoRow[];
  const campanhas = (campanhasResultado.data ?? []) as CampanhaRow[];

  if (custos.length === 0) {
    return {
      ...painelVazio,
      contactosNovos: [...contactosPorDia.values()].reduce(
        (total, valor) => total + valor,
        0,
      ),
      temDados: campanhas.length > 0,
    };
  }

  const porCampanhaId = new Map(campanhas.map((campanha) => [campanha.id, campanha]));
  const acumuladoPorCampanha = new Map<string, CampanhaResumo>();
  const acumuladoPorDia = new Map<string, { contactos: number; gasto: number }>();

  let gasto = 0;
  let impressoes = 0;
  let cliques = 0;
  let cliquesLink = 0;
  let atualizadoEm: string | null = null;

  for (const custo of custos) {
    const gastoLinha = toNumber(custo.gasto);
    const impressoesLinha = toNumber(custo.impressoes);
    const cliquesLinha = toNumber(custo.cliques);

    gasto += gastoLinha;
    impressoes += impressoesLinha;
    cliques += cliquesLinha;
    cliquesLink += toNumber(custo.cliques_link);

    if (
      custo.sincronizado_em &&
      (!atualizadoEm || custo.sincronizado_em > atualizadoEm)
    ) {
      atualizadoEm = custo.sincronizado_em;
    }

    const diaAtual = acumuladoPorDia.get(custo.dia) ?? {
      contactos: contactosPorDia.get(custo.dia) ?? 0,
      gasto: 0,
    };

    diaAtual.gasto += gastoLinha;
    acumuladoPorDia.set(custo.dia, diaAtual);

    const campanha = porCampanhaId.get(custo.campanha_id);
    const resumo = acumuladoPorCampanha.get(custo.campanha_id) ?? {
      cliques: 0,
      estado: campanha?.estado ?? null,
      gasto: 0,
      id: custo.campanha_id,
      impressoes: 0,
      nome: campanha?.nome ?? "Campanha removida da Meta",
      objectivo: campanha?.objectivo ?? null,
    };

    resumo.gasto += gastoLinha;
    resumo.impressoes += impressoesLinha;
    resumo.cliques += cliquesLinha;
    acumuladoPorCampanha.set(custo.campanha_id, resumo);
  }

  // Dias sem gasto ainda podem ter contactos: o gráfico tem de os mostrar,
  // senão um dia com leads orgânicos desaparece do período.
  for (const [dia, contactos] of contactosPorDia) {
    if (dia >= inicio && dia <= fim && !acumuladoPorDia.has(dia)) {
      acumuladoPorDia.set(dia, { contactos, gasto: 0 });
    }
  }

  const contactosNovos = [...contactosPorDia.values()].reduce(
    (total, valor) => total + valor,
    0,
  );

  return {
    atualizadoEm,
    cliques,
    cliquesLink,
    contactosNovos,
    // CPM e CTR do período recalculam-se dos totais. Fazer a média das médias
    // diárias daria um número diferente e errado: cada dia tem peso distinto.
    cpm: impressoes > 0 ? (gasto / impressoes) * 1000 : null,
    ctr: impressoes > 0 ? (cliques / impressoes) * 100 : null,
    custoPorContacto: contactosNovos > 0 ? gasto / contactosNovos : null,
    diario: [...acumuladoPorDia.entries()]
      .map(([dia, valores]) => ({ dia, ...valores }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    gasto,
    impressoes,
    moeda: custos.find((custo) => custo.moeda)?.moeda ?? "EUR",
    porCampanha: [...acumuladoPorCampanha.values()].sort(
      (a, b) => b.gasto - a.gasto,
    ),
    temDados: true,
  };
}
