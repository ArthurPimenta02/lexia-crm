import "server-only";

import { chaveTelefone } from "@/lib/pipeline/etapas";
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
  campanha_externa_id: string | null;
  estado: string | null;
  id: string;
  nome: string;
  objectivo: string | null;
};

export type CampanhaResumo = {
  cliques: number;
  /**
   * Contactos do período cujo referral da Meta aponta para um anúncio desta
   * campanha. É um PISO, não o total: ver `contarAtribuicaoPorCampanha`.
   */
  contactosAtribuidos: number;
  estado: string | null;
  gasto: number;
  id: string;
  impressoes: number;
  /** Desses contactos, quantos chegaram a ter marcação. Também um piso. */
  marcacoesAtribuidas: number;
  nome: string;
  objectivo: string | null;
};

export type PainelCampanhas = {
  atualizadoEm: string | null;
  cliques: number;
  cliquesLink: number;
  /**
   * Quantos dos contactos novos do período trazem anúncio identificado.
   *
   * Serve para o ecrã poder dizer em quantos é que a atribuição por campanha se
   * apoia. Sem este número, as contagens por campanha pareciam o total.
   */
  contactosComAnuncio: number;
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
  contactosComAnuncio: 0,
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

export type AtribuicaoPorCampanha = {
  /** Contactos do período com anúncio desta campanha. */
  contactos: number;
  /** Desses, quantos já têm marcação na agenda. */
  marcacoes: number;
};

/**
 * Quantos contactos — e quantas marcações — cada campanha trouxe.
 *
 * COMO SE CHEGA AQUI, E PORQUE É UM PISO E NÃO UM TOTAL
 * O referral da Meta traz o id do ANÚNCIO, e só quando a pessoa clica num
 * anúncio de clique-para-WhatsApp. O Instagram Direct e o Messenger não o
 * enviam, e 76% do gasto do Detail vai justamente para Instagram Direct.
 * Medido a 2026-10-19: 13 contactos em 1.028 têm id de anúncio. Portanto o
 * número aqui diz "pelo menos tantos", nunca "foram só estes".
 *
 * Porque serve ainda assim: a mesma regra falha igual para todas as campanhas,
 * logo comparar campanhas entre si é legítimo. O que não é legítimo é dividir
 * isto pelo total de contactos e chamar-lhe percentagem de pago.
 *
 * A LIGAÇÃO À MARCAÇÃO É PELOS ÚLTIMOS 9 DÍGITOS, com `chaveTelefone`. Medido:
 * 16 de 19 marcações do Detail casam pelo número exacto e 18 pelos últimos 9 —
 * o indicativo 351 não é escrito de forma consistente nos dois lados.
 */
async function contarAtribuicaoPorCampanha(
  clienteSlug: string,
  inicioIso: string,
  fimIso: string,
): Promise<{
  contactosComAnuncio: number;
  porCampanhaExterna: Map<string, AtribuicaoPorCampanha>;
}> {
  const vazio = {
    contactosComAnuncio: 0,
    porCampanhaExterna: new Map<string, AtribuicaoPorCampanha>(),
  };
  const supabase = await createClient();

  const [contactosResultado, anunciosResultado, marcacoesResultado] =
    await Promise.all([
      fetchAllSupabaseRows<{
        origem_source_id: string | null;
        telefone_digitos: string | null;
      }>((from, to) =>
        supabase
          .from("lexia_contactos")
          .select("origem_source_id, telefone_digitos")
          .eq("cliente_slug", clienteSlug)
          .gte("criado_em", inicioIso)
          .lte("criado_em", fimIso)
          .not("origem_source_id", "is", null)
          .range(from, to),
      ),
      // Todos os anúncios do cliente, e não só os do período: o contacto de
      // hoje pode vir de um anúncio criado há meses.
      fetchAllSupabaseRows<{
        anuncio_externo_id: string | null;
        campanha_externa_id: string | null;
      }>((from, to) =>
        supabase
          .from("lexia_anuncios")
          .select("anuncio_externo_id, campanha_externa_id")
          .eq("cliente_slug", clienteSlug)
          .eq("plataforma", "meta")
          .range(from, to),
      ),
      // Todas as marcações, sem janela: a pessoa que falou hoje pode marcar
      // para o mês que vem, e essa marcação é da campanha que a trouxe.
      fetchAllSupabaseRows<{ telefone_digitos: string | null }>((from, to) =>
        supabase
          .from("lexia_agendamentos")
          .select("telefone_digitos")
          .eq("cliente_slug", clienteSlug)
          .not("telefone_digitos", "is", null)
          .neq("estado", "cancelado")
          .range(from, to),
      ),
    ]);

  if (contactosResultado.error || anunciosResultado.error) {
    return vazio;
  }

  const campanhaPorAnuncio = new Map<string, string>();

  for (const anuncio of anunciosResultado.data) {
    if (anuncio.anuncio_externo_id && anuncio.campanha_externa_id) {
      campanhaPorAnuncio.set(
        anuncio.anuncio_externo_id,
        anuncio.campanha_externa_id,
      );
    }
  }

  const telefonesComMarcacao = new Set<string>();

  // Erro nas marcações não apaga a contagem de contactos: fica a coluna de
  // marcações a zero, que é verdade na ausência de dados, e a de contactos
  // continua a valer.
  if (!marcacoesResultado.error) {
    for (const marcacao of marcacoesResultado.data) {
      const chave = chaveTelefone(marcacao.telefone_digitos);

      if (chave) {
        telefonesComMarcacao.add(chave);
      }
    }
  }

  const porCampanhaExterna = new Map<string, AtribuicaoPorCampanha>();
  let contactosComAnuncio = 0;

  for (const contacto of contactosResultado.data) {
    const anuncioId = contacto.origem_source_id?.trim();

    if (!anuncioId) {
      continue;
    }

    contactosComAnuncio += 1;

    const campanhaId = campanhaPorAnuncio.get(anuncioId);

    if (!campanhaId) {
      // Anúncio que a sincronização nunca viu — apagado na Meta antes da
      // primeira passagem. Conta para o total de contactos com anúncio, porque
      // isso é verdade, mas não há campanha a quem o atribuir.
      continue;
    }

    const actual = porCampanhaExterna.get(campanhaId) ?? {
      contactos: 0,
      marcacoes: 0,
    };

    actual.contactos += 1;

    const chave = chaveTelefone(contacto.telefone_digitos);

    if (chave && telefonesComMarcacao.has(chave)) {
      actual.marcacoes += 1;
    }

    porCampanhaExterna.set(campanhaId, actual);
  }

  return { contactosComAnuncio, porCampanhaExterna };
}

export type ResumoCampanhas = {
  atualizadoEm: string | null;
  cliques: number;
  cliquesLink: number;
  gasto: number;
  impressoes: number;
  moeda: string;
  temDados: boolean;
};

type ResumoCustoRow = Pick<
  CustoRow,
  "cliques" | "cliques_link" | "gasto" | "impressoes" | "moeda" | "sincronizado_em"
>;

/**
 * Os totais de gasto do período, sem o detalhe por campanha nem por dia.
 *
 * O `getPainelCampanhas` já devolve isto e muito mais, mas para calcular o
 * custo por contacto varre a tabela de contactos inteira do período — e o
 * dashboard varre-a de qualquer maneira para as contas dele. Chamá-lo lá só
 * para mostrar o investido duplicava a leitura mais pesada da página. Aqui
 * leem-se só os custos, e o denominador do custo por conversa vem das
 * conversas que o dashboard já contou.
 */
export async function getResumoCampanhas({
  clienteSlug,
  fim,
  inicio,
}: {
  clienteSlug: string;
  /** Dia final inclusivo, YYYY-MM-DD no fuso do cliente. */
  fim: string;
  /** Dia inicial inclusivo, YYYY-MM-DD no fuso do cliente. */
  inicio: string;
}): Promise<ResumoCampanhas> {
  const supabase = await createClient();
  const { data, error } = await fetchAllSupabaseRows<ResumoCustoRow>(
    (from, to) =>
      supabase
        .from("lexia_campanha_custos")
        .select("cliques, cliques_link, gasto, impressoes, moeda, sincronizado_em")
        .eq("cliente_slug", clienteSlug)
        .gte("dia", inicio)
        .lte("dia", fim)
        .range(from, to),
  );

  const vazio: ResumoCampanhas = {
    atualizadoEm: null,
    cliques: 0,
    cliquesLink: 0,
    gasto: 0,
    impressoes: 0,
    moeda: "EUR",
    temDados: false,
  };

  if (error || data.length === 0) {
    return vazio;
  }

  const resumo: ResumoCampanhas = { ...vazio, temDados: true };

  for (const linha of data) {
    resumo.gasto += toNumber(linha.gasto);
    resumo.impressoes += toNumber(linha.impressoes);
    resumo.cliques += toNumber(linha.cliques);
    resumo.cliquesLink += toNumber(linha.cliques_link);

    if (
      linha.sincronizado_em &&
      (!resumo.atualizadoEm || linha.sincronizado_em > resumo.atualizadoEm)
    ) {
      resumo.atualizadoEm = linha.sincronizado_em;
    }
  }

  resumo.moeda = data.find((linha) => linha.moeda)?.moeda ?? "EUR";

  return resumo;
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

  const [custosResultado, campanhasResultado, contactosPorDia, atribuicao] =
    await Promise.all([
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
        .select("campanha_externa_id, estado, id, nome, objectivo")
        .eq("cliente_slug", clienteSlug),
      contarContactosPorDia(clienteSlug, inicioIso, fimIso, timezone),
      contarAtribuicaoPorCampanha(clienteSlug, inicioIso, fimIso),
    ]);

  if (custosResultado.error || campanhasResultado.error) {
    return painelVazio;
  }

  const custos = (custosResultado.data ?? []) as CustoRow[];
  const campanhas = (campanhasResultado.data ?? []) as CampanhaRow[];

  if (custos.length === 0) {
    return {
      ...painelVazio,
      contactosComAnuncio: atribuicao.contactosComAnuncio,
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
    // A atribuição vem indexada pelo id da campanha NA META, porque é esse que
    // o anúncio carrega; aqui a chave é o uuid da nossa tabela. A dimensão é a
    // ponte entre os dois.
    const atribuida = campanha?.campanha_externa_id
      ? atribuicao.porCampanhaExterna.get(campanha.campanha_externa_id)
      : undefined;
    const resumo = acumuladoPorCampanha.get(custo.campanha_id) ?? {
      cliques: 0,
      contactosAtribuidos: atribuida?.contactos ?? 0,
      estado: campanha?.estado ?? null,
      gasto: 0,
      id: custo.campanha_id,
      impressoes: 0,
      marcacoesAtribuidas: atribuida?.marcacoes ?? 0,
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
    contactosComAnuncio: atribuicao.contactosComAnuncio,
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
