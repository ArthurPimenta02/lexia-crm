import {
  createServicosClient,
  getServicosConfig,
  normalizarNomeServico,
  toNumber,
  type EscalaoConfig,
  type ServicosClientConfig,
} from "@/lib/servicos/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Leitura do painel de serviços: junta o catálogo e o operacional da Supabase
 * DO CLIENTE com os custos da Supabase CENTRAL e calcula a margem.
 *
 * A margem nunca é guardada. Preço e duração vivem na base do cliente e mudam
 * lá; um valor gravado aqui ficava velho em silêncio.
 */

export const escalaoBase = "base";

export type ExecutorLinha = {
  chave: string;
  custoHora: number | null;
  custoMaoDeObra: number | null;
  duracaoMinutos: number | null;
  euroPorHora: number | null;
  executa: boolean;
  margem: number | null;
  margemPercent: number | null;
  nome: string;
};

export type ServicoLinha = {
  agendamentoId: string | null;
  categoria: string | null;
  custoActualizadoEm: string | null;
  custoProduto: number | null;
  descricaoCurta: string | null;
  executores: ExecutorLinha[];
  id: string;
  moeda: string;
  nome: string;
  notas: string | null;
  ordem: number;
  preco: number | null;
  precoBaseAgendamento: number | null;
  precoDivergente: boolean;
  precoEstimado: boolean;
  tipoPreco: string | null;
};

export type ExecutorCusto = {
  actualizadoEm: string | null;
  chave: string;
  custoHora: number | null;
  nome: string;
};

export type PainelServicos = {
  configurado: boolean;
  escalaoActivo: string;
  escaloes: EscalaoConfig[];
  executorPrincipal: string | null;
  executores: ExecutorCusto[];
  moeda: string;
  semCusto: number;
  servicos: ServicoLinha[];
  vazioMotivo: string | null;
};

type CatalogoRow = {
  activo: boolean | null;
  categoria: string | null;
  descricao_curta: string | null;
  id: string;
  nome: string | null;
  ordem: number | null;
  precos_por_categoria: unknown;
  tipo_preco: string | null;
  valor: number | string | null;
};

type AgendamentoRow = {
  activo: boolean | null;
  id: string;
  nome: string | null;
  preco_base: number | string | null;
} & Record<string, unknown>;

function painelVazio(motivo: string | null, config?: ServicosClientConfig | null): PainelServicos {
  return {
    configurado: Boolean(config),
    escalaoActivo: escalaoBase,
    escaloes: config?.escaloes ?? [],
    executorPrincipal: config?.executores[0]?.chave ?? null,
    executores: [],
    moeda: config?.moeda ?? "EUR",
    semCusto: 0,
    servicos: [],
    vazioMotivo: motivo,
  };
}

/**
 * Extrai o preço de um escalão do jsonb `precos_por_categoria`.
 *
 * Aceita várias formas de propósito: a coluna é jsonb livre e foi preenchida à
 * mão serviço a serviço. Se não encontrar um número para o escalão pedido,
 * devolve null e quem chama usa o `valor` base — melhor mostrar o preço base
 * assinalado como estimado do que inventar um número por escalão.
 */
function extrairPrecoDoEscalao(precos: unknown, chave: string): number | null {
  if (!precos || typeof precos !== "object") {
    return null;
  }

  if (Array.isArray(precos)) {
    for (const item of precos) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const registo = item as Record<string, unknown>;
      const nome = registo.categoria ?? registo.escalao ?? registo.chave;

      if (typeof nome === "string" && normalizarNomeServico(nome) === chave) {
        return lerNumero(registo.valor ?? registo.preco ?? registo.min);
      }
    }

    return null;
  }

  const registo = precos as Record<string, unknown>;
  const bruto = registo[chave];

  if (bruto === undefined || bruto === null) {
    return null;
  }

  if (typeof bruto === "object" && !Array.isArray(bruto)) {
    const interno = bruto as Record<string, unknown>;

    return lerNumero(interno.valor ?? interno.preco ?? interno.min);
  }

  return lerNumero(bruto);
}

function lerNumero(valor: unknown): number | null {
  if (typeof valor === "number" || typeof valor === "string") {
    return toNumber(valor);
  }

  return null;
}

function arredondar(valor: number) {
  return Math.round(valor * 100) / 100;
}

export async function getPainelServicos({
  clienteSlug,
  escalao,
}: {
  clienteSlug: string;
  escalao?: string;
}): Promise<PainelServicos> {
  const config = getServicosConfig(clienteSlug);

  if (!config) {
    return painelVazio(
      "Este cliente ainda não tem catálogo de serviços ligado ao painel.",
      null,
    );
  }

  const escalaoActivo =
    escalao && config.escaloes.some((item) => item.chave === escalao)
      ? escalao
      : escalaoBase;

  const externo = createServicosClient(config);

  if (!externo) {
    return {
      ...painelVazio(
        "Credenciais da base de dados do cliente não configuradas no servidor.",
        config,
      ),
      escalaoActivo,
    };
  }

  const central = await createClient();

  const colunasAgendamento = Array.from(
    new Set([
      "id",
      "nome",
      "preco_base",
      "activo",
      ...config.executores.flatMap((executor) => [
        executor.duracaoColumn,
        executor.executaColumn,
      ]),
    ]),
  ).join(", ");

  const [catalogo, agendamento, custos, executoresCusto] = await Promise.all([
    externo
      .from(config.catalogoTable)
      .select(
        "id, nome, ordem, categoria, tipo_preco, valor, precos_por_categoria, descricao_curta, activo",
      )
      .eq("activo", true)
      .order("ordem", { ascending: true }),
    externo.from(config.agendamentoTable).select(colunasAgendamento),
    central
      .from("lexia_servico_custos")
      .select("servico_id, custo_produto, notas, actualizado_em")
      .eq("cliente_slug", clienteSlug),
    central
      .from("lexia_executores_custo")
      .select("executor, nome, custo_hora, actualizado_em")
      .eq("cliente_slug", clienteSlug),
  ]);

  if (catalogo.error) {
    console.error("[servicos] falha a ler o catálogo do cliente", catalogo.error);

    return {
      ...painelVazio("Não foi possível ler o catálogo de serviços.", config),
      escalaoActivo,
    };
  }

  if (agendamento.error) {
    console.error(
      "[servicos] falha a ler as durações do cliente",
      agendamento.error,
    );
  }

  if (custos.error) {
    console.error("[servicos] falha a ler os custos centrais", custos.error);
  }

  if (executoresCusto.error) {
    console.error(
      "[servicos] falha a ler o custo por hora",
      executoresCusto.error,
    );
  }

  const custoPorHora = new Map<string, { actualizadoEm: string | null; custoHora: number | null }>();

  for (const linha of executoresCusto.data ?? []) {
    custoPorHora.set(String(linha.executor), {
      actualizadoEm: linha.actualizado_em ?? null,
      custoHora: toNumber(linha.custo_hora),
    });
  }

  const custoPorServico = new Map<
    string,
    { actualizadoEm: string | null; custoProduto: number | null; notas: string | null }
  >();

  for (const linha of custos.data ?? []) {
    custoPorServico.set(String(linha.servico_id), {
      actualizadoEm: linha.actualizado_em ?? null,
      custoProduto: toNumber(linha.custo_produto),
      notas: linha.notas ?? null,
    });
  }

  const agendamentoPorNome = new Map<string, AgendamentoRow>();

  for (const linha of (agendamento.data ?? []) as unknown as AgendamentoRow[]) {
    if (!linha.nome) {
      continue;
    }

    agendamentoPorNome.set(normalizarNomeServico(linha.nome), linha);
  }

  const servicos: ServicoLinha[] = [];

  for (const linha of (catalogo.data ?? []) as unknown as CatalogoRow[]) {
    const nome = linha.nome?.trim();

    if (!nome) {
      continue;
    }

    const operacional = agendamentoPorNome.get(normalizarNomeServico(nome)) ?? null;
    const valorBase = toNumber(linha.valor);
    const precoDoEscalao =
      escalaoActivo === escalaoBase
        ? null
        : extrairPrecoDoEscalao(linha.precos_por_categoria, escalaoActivo);
    const preco = precoDoEscalao ?? valorBase;
    const precoBaseAgendamento = operacional
      ? toNumber(operacional.preco_base)
      : null;
    const custo = custoPorServico.get(linha.id) ?? null;
    const custoProduto = custo?.custoProduto ?? null;

    const executores = config.executores.map<ExecutorLinha>((executor) => {
      const executa = operacional
        ? operacional[executor.executaColumn] === true
        : false;
      const duracaoMinutos = operacional
        ? toNumber(operacional[executor.duracaoColumn] as number | string | null)
        : null;
      const custoHora = custoPorHora.get(executor.chave)?.custoHora ?? null;
      const horas = duracaoMinutos !== null ? duracaoMinutos / 60 : null;

      const custoMaoDeObra =
        horas !== null && custoHora !== null ? arredondar(horas * custoHora) : null;
      const euroPorHora =
        preco !== null && horas !== null && horas > 0
          ? arredondar(preco / horas)
          : null;
      const margem =
        preco !== null && custoProduto !== null && custoMaoDeObra !== null
          ? arredondar(preco - custoProduto - custoMaoDeObra)
          : null;
      const margemPercent =
        margem !== null && preco !== null && preco > 0
          ? arredondar((margem / preco) * 100)
          : null;

      return {
        chave: executor.chave,
        custoHora,
        custoMaoDeObra,
        duracaoMinutos,
        euroPorHora,
        executa,
        margem,
        margemPercent,
        nome: executor.nome,
      };
    });

    servicos.push({
      agendamentoId: operacional?.id ?? null,
      categoria: linha.categoria ?? null,
      custoActualizadoEm: custo?.actualizadoEm ?? null,
      custoProduto,
      descricaoCurta: linha.descricao_curta ?? null,
      executores,
      id: linha.id,
      moeda: config.moeda,
      nome,
      notas: custo?.notas ?? null,
      ordem: linha.ordem ?? 0,
      preco,
      precoBaseAgendamento,
      // Hoje não há divergência nenhuma (medido a 15/10/2026, 14 de 14 iguais).
      // Este sinal existe para apanhar o dia em que alguém escrever só numa
      // das tabelas -- por exemplo direito na Supabase, fora deste painel.
      precoDivergente:
        valorBase !== null &&
        precoBaseAgendamento !== null &&
        arredondar(valorBase) !== arredondar(precoBaseAgendamento),
      precoEstimado: escalaoActivo !== escalaoBase && precoDoEscalao === null,
      tipoPreco: linha.tipo_preco ?? null,
    });
  }

  servicos.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"));

  return {
    configurado: true,
    escalaoActivo,
    escaloes: config.escaloes,
    executorPrincipal: config.executores[0]?.chave ?? null,
    executores: config.executores.map((executor) => ({
      actualizadoEm: custoPorHora.get(executor.chave)?.actualizadoEm ?? null,
      chave: executor.chave,
      custoHora: custoPorHora.get(executor.chave)?.custoHora ?? null,
      nome: executor.nome,
    })),
    moeda: config.moeda,
    semCusto: servicos.filter((servico) => servico.custoProduto === null).length,
    servicos,
    vazioMotivo: servicos.length === 0 ? "Sem serviços activos no catálogo." : null,
  };
}
