import {
  getProdutos,
  getReceitas,
  type ItemReceita,
  type ProdutoLinha,
} from "@/lib/produtos/read";
import {
  createServicosClient,
  getServicosAgendaveisConfig,
  getServicosConfig,
  normalizarNomeServico,
  toNumber,
  type EscalaoConfig,
  type ServicosAgendaveisConfig,
  type ServicosClientConfig,
} from "@/lib/servicos/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Leitura do painel de serviços: junta o catálogo e o operacional da Supabase
 * DO CLIENTE com a receita de produtos da Supabase CENTRAL e calcula a margem.
 *
 * Nada disto é guardado. Preço e duração vivem na base do cliente e mudam lá;
 * o custo de produto sai da receita ao preço da última compra. Um valor
 * gravado aqui ficava velho em silêncio.
 */

export const escalaoBase = "base";

export type ExecutorLinha = {
  chave: string;
  duracaoMinutos: number | null;
  euroPorHora: number | null;
  executa: boolean;
  nome: string;
};

export type ServicoLinha = {
  agendamentoId: string | null;
  categoria: string | null;
  /** Soma da receita ao custo unitário actual. Null se a receita está vazia. */
  custoProduto: number | null;
  /** Há produtos na receita sem compra registada, logo sem preço. */
  custoProdutoIncompleto: boolean;
  descricaoCurta: string | null;
  executores: ExecutorLinha[];
  id: string;
  margem: number | null;
  margemPercent: number | null;
  moeda: string;
  nome: string;
  notas: string | null;
  /** Texto que o catálogo guarda dentro do campo de preços. */
  notasCatalogo: string[];
  ordem: number;
  preco: number | null;
  precoBaseAgendamento: number | null;
  precoDivergente: boolean;
  precoEstimado: boolean;
  /** O preço não varia com nada: o catálogo tem `preco_unico`. */
  precoUnico: boolean;
  /**
   * Preços que estão no jsonb mas não correspondem a escalões de viatura.
   * Ver `extrairPrecosAlternativos`.
   */
  precosAlternativos: { label: string; valor: number }[];
  /** Que produtos este serviço consome e quanto. */
  receita: ItemReceita[];
  tipoPreco: string | null;
};

/** Serviço do catálogo, sem o resto do painel. */
export type ServicoSimples = {
  id: string;
  nome: string;
};

export type PainelServicos = {
  configurado: boolean;
  escalaoActivo: string;
  escaloes: EscalaoConfig[];
  /** Serviços com `activo = false`, para poderem ser repostos. */
  excluidos: ServicoSimples[];
  executorPrincipal: string | null;
  moeda: string;
  /** Produtos activos do cliente, para montar a receita de cada serviço. */
  produtos: ProdutoLinha[];
  semReceita: number;
  servicos: ServicoLinha[];
  /**
   * O painel mostra mas não deixa mexer.
   *
   * É o caso de quem só tem tabela de agendamento: as escritas desta aba
   * assumem as colunas do catálogo de venda do Detail (`valor`, `ordem`,
   * `descricao_curta`, `preco_base` noutra tabela) e numa base que não as tem
   * davam erro — ou, pior, escreviam metade.
   */
  somenteLeitura: boolean;
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
    excluidos: [],
    executorPrincipal: config?.executores[0]?.chave ?? null,
    moeda: config?.moeda ?? "EUR",
    produtos: [],
    semReceita: 0,
    servicos: [],
    somenteLeitura: false,
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

const chavePrecoUnico = "preco_unico";

/**
 * Preços que existem no jsonb mas não são escalões de viatura.
 *
 * Medido a 15/10/2026 nos 15 serviços activos do Detail que têm este campo
 * preenchido, e são três padrões diferentes, não um:
 *
 *   - 7 por escalão de viatura (as 4 chaves conhecidas). O Polimento Técnico
 *     tem as 4 mais uma `nota_ceramica` em texto.
 *   - 6 com `preco_unico`: o preço não varia com nada. Vão por `precoUnico`,
 *     não por aqui, senão o painel repetia o preço base como se fosse uma
 *     alternativa.
 *   - 1 por tipo de trabalho (Impermeabilização: `capota_parcial` 60,
 *     `capota_completa` 80, `bancos_tecido` 100, `carpetes_tapetes` 150).
 *   - 1 por plano (Plano de Manutenção: mensal, anual, equivalente mensal).
 *
 * Os dois últimos são o motivo desta função: sem ela, o painel mostrava só o
 * preço base e escondia preços reais que vão de 60 a 150 EUR.
 *
 * Ignora chaves que não dão número (todas as `nota*`, tratadas em
 * `extrairNotasDoCatalogo`) e valores iguais ao preço base, que não são
 * alternativa nenhuma.
 */
function extrairPrecosAlternativos(
  precos: unknown,
  escaloesConhecidos: Set<string>,
  precoBase: number | null,
) {
  if (!precos || typeof precos !== "object" || Array.isArray(precos)) {
    return [];
  }

  const alternativos: { label: string; valor: number }[] = [];

  for (const [chave, bruto] of Object.entries(precos as Record<string, unknown>)) {
    if (escaloesConhecidos.has(chave) || chave === chavePrecoUnico) {
      continue;
    }

    const valor = lerNumero(bruto);

    if (valor === null) {
      continue;
    }

    if (precoBase !== null && arredondar(valor) === arredondar(precoBase)) {
      continue;
    }

    const label = chave.replace(/_/g, " ");

    alternativos.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      valor,
    });
  }

  return alternativos.sort((a, b) => a.valor - b.valor);
}

function temPrecoUnico(precos: unknown) {
  if (!precos || typeof precos !== "object" || Array.isArray(precos)) {
    return false;
  }

  return (
    lerNumero((precos as Record<string, unknown>)[chavePrecoUnico]) !== null
  );
}

/**
 * Texto que o catálogo guarda dentro do próprio campo de preços.
 *
 * Todos os 15 serviços têm uma chave `nota` ou `nota_ceramica` em texto, e não
 * é decoração: a do Polimento Técnico fala do cerâmico, que é exactamente o
 * custo que faz do serviço de 500 EUR o pior euro-por-hora da casa. Esconder
 * isto do ecrã de margem seria esconder a explicação ao lado do número.
 */
function extrairNotasDoCatalogo(precos: unknown) {
  if (!precos || typeof precos !== "object" || Array.isArray(precos)) {
    return [];
  }

  const notas: string[] = [];

  for (const bruto of Object.values(precos as Record<string, unknown>)) {
    if (typeof bruto !== "string") {
      continue;
    }

    const texto = bruto.trim();

    if (texto !== "") {
      notas.push(texto);
    }
  }

  return notas;
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

/**
 * O painel de Serviços de um cliente que só tem a tabela de agendamento.
 *
 * A Miranda tem **uma** tabela onde o Detail tem duas: o que ela vende e o
 * que ela marca é a mesma linha. Não há catálogo de venda à parte, não há
 * escalões de viatura, não há coluna de custo por profissional — e por isso
 * também não há margem de produto, que é o que a aba calcula para o Detail.
 *
 * Mesmo assim mostra-se: ela tem 25 serviços vivos, com preço, profissional e
 * duração, e esconder isso atrás de "ainda não tem catálogo ligado" era
 * esconder dela o que ela própria lá pôs. O que não se faz é deixar editar
 * — ver `somenteLeitura`.
 */
async function painelPelaTabelaDeAgendamento(
  clienteSlug: string,
): Promise<PainelServicos | null> {
  const config = getServicosAgendaveisConfig(clienteSlug);

  if (!config?.catalogo) {
    return null;
  }

  const externo = createServicosClient(config);

  if (!externo) {
    return null;
  }

  const { catalogo } = config;
  const colunas = Array.from(
    new Set(
      [
        colunasAgendaveis(config),
        catalogo.categoriaColumn,
        catalogo.descricaoColumn,
        catalogo.ordemColumn,
        catalogo.precosVariantesColumn,
        catalogo.tipoPrecoColumn,
      ]
        .filter((coluna): coluna is string => Boolean(coluna))
        .flatMap((coluna) => coluna.split(", ")),
    ),
  ).join(", ");

  const { data, error } = await externo
    .from(config.tabela)
    .select(colunas)
    .eq(config.activoColumn, true);

  if (error) {
    console.error("[servicos] falha a ler a tabela de agendamento", error);

    return {
      ...painelVazio("Não foi possível ler o catálogo de serviços."),
      moeda: config.moeda,
      somenteLeitura: true,
    };
  }

  const servicos: ServicoLinha[] = [];

  for (const linha of (data ?? []) as unknown as LinhaAgendavel[]) {
    const nome = String(linha.nome ?? "").trim();

    if (!linha.id || !nome) {
      continue;
    }

    const agendaveis =
      config.executores.modo === "colunas"
        ? executoresPorColuna(linha, config.executores)
        : executoresPorTexto(linha, config.executores);

    const preco = toNumber(linha[config.precoColumn] as number | string | null);
    const variantes = catalogo.precosVariantesColumn
      ? linha[catalogo.precosVariantesColumn]
      : null;

    // Cada pessoa da configuração aparece, faça ou não o serviço: é o mesmo
    // que o Detail mostra, e é assim que se vê de relance quem é que está
    // sobrecarregado com que tipo de trabalho.
    const executores = listaDeExecutores(config).map<ExecutorLinha>(
      (pessoa) => {
        const agendavel = agendaveis.find(
          (candidato) => candidato.chave === pessoa.chave,
        );
        const horas = agendavel ? agendavel.duracaoMinutos / 60 : null;

        return {
          chave: pessoa.chave,
          duracaoMinutos: agendavel?.duracaoMinutos ?? null,
          euroPorHora:
            preco !== null && horas !== null && horas > 0
              ? arredondar(preco / horas)
              : null,
          executa: Boolean(agendavel),
          nome: pessoa.nome,
        };
      },
    );

    servicos.push({
      agendamentoId: String(linha.id),
      categoria: catalogo.categoriaColumn
        ? ((linha[catalogo.categoriaColumn] as string | null) ?? null)
        : null,
      custoProduto: null,
      custoProdutoIncompleto: false,
      descricaoCurta: catalogo.descricaoColumn
        ? ((linha[catalogo.descricaoColumn] as string | null) ?? null)
        : null,
      executores,
      id: String(linha.id),
      margem: null,
      margemPercent: null,
      moeda: config.moeda,
      nome,
      notas: null,
      notasCatalogo: extrairNotasDoCatalogo(variantes),
      ordem: catalogo.ordemColumn
        ? (toNumber(linha[catalogo.ordemColumn] as number | string | null) ?? 0)
        : 0,
      preco,
      precoBaseAgendamento: preco,
      precoDivergente: false,
      precoEstimado: false,
      precoUnico: false,
      precosAlternativos: extrairPrecosAlternativos(variantes, new Set(), preco),
      receita: [],
      tipoPreco: catalogo.tipoPrecoColumn
        ? ((linha[catalogo.tipoPrecoColumn] as string | null) ?? null)
        : null,
    });
  }

  servicos.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"));

  return {
    ...painelVazio(servicos.length === 0 ? "Sem serviços activos." : null),
    configurado: true,
    executorPrincipal: listaDeExecutores(config)[0]?.chave ?? null,
    moeda: config.moeda,
    servicos,
    somenteLeitura: true,
  };
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
    return (
      (await painelPelaTabelaDeAgendamento(clienteSlug)) ??
      painelVazio(
        "Este cliente ainda não tem catálogo de serviços ligado ao painel.",
        null,
      )
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

  const [catalogo, agendamento, custos, produtos, excluidos] = await Promise.all([
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
      .select("servico_id, notas, actualizado_em")
      .eq("cliente_slug", clienteSlug),
    getProdutos(clienteSlug),
    getServicosExcluidos(clienteSlug),
  ]);

  // Depende dos produtos: o custo de cada linha da receita é o custo unitário
  // da última compra desse produto.
  const receitas = await getReceitas(clienteSlug, produtos);

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
    console.error("[servicos] falha a ler as notas centrais", custos.error);
  }

  const notasPorServico = new Map<string, string | null>();

  for (const linha of custos.data ?? []) {
    notasPorServico.set(String(linha.servico_id), linha.notas ?? null);
  }

  const agendamentoPorNome = new Map<string, AgendamentoRow>();

  for (const linha of (agendamento.data ?? []) as unknown as AgendamentoRow[]) {
    if (!linha.nome) {
      continue;
    }

    agendamentoPorNome.set(normalizarNomeServico(linha.nome), linha);
  }

  const servicos: ServicoLinha[] = [];
  const escaloesConhecidos = new Set(
    config.escaloes.map((escalao) => escalao.chave),
  );

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
    const receita = receitas.get(linha.id) ?? [];

    // Com um produto sem compra registada, a soma seria mentira por omissão:
    // dava um custo mais baixo do que o real e a margem aparecia melhor do que
    // é. Nesse caso não há número, há o aviso de que falta registar a compra.
    const custoProdutoIncompleto = receita.some((item) => item.custo === null);
    const custoProduto =
      receita.length === 0 || custoProdutoIncompleto
        ? null
        : arredondar(receita.reduce((total, item) => total + (item.custo ?? 0), 0));

    const margem =
      preco !== null && custoProduto !== null
        ? arredondar(preco - custoProduto)
        : null;
    const margemPercent =
      margem !== null && preco !== null && preco > 0
        ? arredondar((margem / preco) * 100)
        : null;

    const executores = config.executores.map<ExecutorLinha>((executor) => {
      const executa = operacional
        ? operacional[executor.executaColumn] === true
        : false;
      const duracaoMinutos = operacional
        ? toNumber(operacional[executor.duracaoColumn] as number | string | null)
        : null;
      const horas = duracaoMinutos !== null ? duracaoMinutos / 60 : null;
      const euroPorHora =
        preco !== null && horas !== null && horas > 0
          ? arredondar(preco / horas)
          : null;

      return {
        chave: executor.chave,
        duracaoMinutos,
        euroPorHora,
        executa,
        nome: executor.nome,
      };
    });

    servicos.push({
      agendamentoId: operacional?.id ?? null,
      categoria: linha.categoria ?? null,
      custoProduto,
      custoProdutoIncompleto,
      descricaoCurta: linha.descricao_curta ?? null,
      executores,
      id: linha.id,
      margem,
      margemPercent,
      moeda: config.moeda,
      nome,
      notas: notasPorServico.get(linha.id) ?? null,
      notasCatalogo: extrairNotasDoCatalogo(linha.precos_por_categoria),
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
      precoUnico: temPrecoUnico(linha.precos_por_categoria),
      precosAlternativos: extrairPrecosAlternativos(
        linha.precos_por_categoria,
        escaloesConhecidos,
        valorBase,
      ),
      receita,
      tipoPreco: linha.tipo_preco ?? null,
    });
  }

  servicos.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"));

  return {
    configurado: true,
    escalaoActivo,
    escaloes: config.escaloes,
    excluidos,
    executorPrincipal: config.executores[0]?.chave ?? null,
    moeda: config.moeda,
    produtos,
    semReceita: servicos.filter((servico) => servico.receita.length === 0).length,
    servicos,
    somenteLeitura: false,
    vazioMotivo: servicos.length === 0 ? "Sem serviços activos no catálogo." : null,
  };
}

/**
 * Catálogo do cliente reduzido a id e nome.
 *
 * Existe para a página de Produtos poder oferecer a lista de serviços a ligar
 * sem arrastar o painel inteiro — que lê duas tabelas do cliente, calcula
 * margens e monta receitas. Para encher um `<select>` nada disso é preciso.
 */
export async function getServicosSimples(
  clienteSlug: string,
): Promise<ServicoSimples[]> {
  return await lerCatalogoPorEstado(clienteSlug, true);
}

/**
 * Serviços excluídos (`activo = false`), para poderem ser repostos.
 *
 * Sem esta lista, excluir um serviço era uma porta que só abria num sentido: o
 * painel só mostra os activos, e o dono ficava sem caminho de volta a não ser
 * mexer na Supabase à mão.
 */
export async function getServicosExcluidos(
  clienteSlug: string,
): Promise<ServicoSimples[]> {
  return await lerCatalogoPorEstado(clienteSlug, false);
}

/** Um executor, no que interessa para marcar: se faz, e em quanto tempo. */
export type ExecutorAgendavel = {
  chave: string;
  duracaoMinutos: number;
  nome: string;
};

/** Um serviço que se pode pôr na agenda, com quem o faz e quanto custa. */
export type ServicoAgendavel = {
  executores: ExecutorAgendavel[];
  id: string;
  nome: string;
  precoBase: number | null;
};

/**
 * Uma linha da tabela de serviços do cliente. Só o `id` e o `nome` se sabem
 * pelo nome: tudo o resto tem o nome que a configuração do cliente disser.
 */
type LinhaAgendavel = {
  id: string | number;
  nome: string | null;
} & Record<string, unknown>;

/** Toda a gente da configuração, nos dois modos, pela ordem em que lá está. */
function listaDeExecutores(config: ServicosAgendaveisConfig) {
  return config.executores.lista.map((pessoa) => ({
    chave: pessoa.chave,
    nome: pessoa.nome,
  }));
}

/**
 * As colunas que a tabela do cliente tem de dar para se poder marcar.
 */
function colunasAgendaveis(config: ServicosAgendaveisConfig) {
  const extra =
    config.executores.modo === "colunas"
      ? config.executores.lista.flatMap((executor) => [
          executor.duracaoColumn,
          executor.executaColumn,
        ])
      : [config.executores.coluna, config.executores.duracaoColumn];

  return Array.from(
    new Set(["id", "nome", config.precoColumn, config.activoColumn, ...extra]),
  ).join(", ");
}

/**
 * Quem faz este serviço, e em quanto tempo, numa tabela com uma coluna
 * booleana e uma de duração por pessoa.
 */
function executoresPorColuna(
  linha: LinhaAgendavel,
  executores: Extract<ServicosAgendaveisConfig["executores"], { modo: "colunas" }>,
): ExecutorAgendavel[] {
  const lidos: ExecutorAgendavel[] = [];

  for (const executor of executores.lista) {
    if (linha[executor.executaColumn] !== true) {
      continue;
    }

    const duracao = toNumber(
      linha[executor.duracaoColumn] as number | string | null,
    );

    // Sem duração não se sabe a que horas o trabalho acaba, e um evento sem
    // fim no Google não bloqueia a agenda de ninguém.
    if (!duracao || duracao <= 0) {
      continue;
    }

    lidos.push({
      chave: executor.chave,
      duracaoMinutos: Math.round(duracao),
      nome: executor.nome,
    });
  }

  return lidos;
}

/**
 * O mesmo, numa tabela que escreve o nome do profissional numa coluna de
 * texto. Dá sempre zero ou um: cada linha é de uma pessoa.
 *
 * Um nome que não esteja na lista da configuração é ignorado em vez de passar.
 * O que lá está é texto escrito à mão — um "samuel " com espaço a mais, ou uma
 * profissional nova que ainda não tem agenda ligada, não pode virar um
 * `executor` que o workflow do n8n depois não sabe encaminhar.
 */
function executoresPorTexto(
  linha: LinhaAgendavel,
  executores: Extract<ServicosAgendaveisConfig["executores"], { modo: "texto" }>,
): ExecutorAgendavel[] {
  const escrito = String(linha[executores.coluna] ?? "")
    .trim()
    .toLowerCase();

  const executor = executores.lista.find(
    (candidato) => candidato.valor.toLowerCase() === escrito,
  );

  if (!executor) {
    return [];
  }

  const duracao = toNumber(
    linha[executores.duracaoColumn] as number | string | null,
  );

  if (!duracao || duracao <= 0) {
    return [];
  }

  return [
    {
      chave: executor.chave,
      duracaoMinutos: Math.round(duracao),
      nome: executor.nome,
    },
  ];
}

/**
 * Os serviços que dá para marcar, lidos da Supabase do próprio cliente.
 *
 * Não é o `getServicosSimples`, e a diferença não é cosmética. O `<select>` da
 * ficha do cliente só precisa de um nome, porque lá regista-se uma venda que
 * já aconteceu. Marcar precisa de três coisas: **quem** faz o serviço,
 * **quanto tempo** leva e **quanto** custa.
 *
 * A duração é o que decide a hora de fim do evento no Google. Vem daqui e não
 * da coluna `duracao` do catálogo, que é texto livre e aceita coisas como
 * "2 a 3 semanas" — inútil para somar minutos a uma hora.
 *
 * Um serviço que nenhum executor faça não é devolvido: oferecê-lo era deixar
 * escolher uma opção que só podia acabar em erro. Um serviço sem preço **é**
 * devolvido, com `precoBase` a `null` — na Miranda há 4 sob avaliação, e
 * esconder um serviço que ela vende por não ter preço de tabela era pior do
 * que deixar o campo do valor vazio para ela escrever.
 */
export async function getServicosAgendaveis(
  clienteSlug: string,
): Promise<ServicoAgendavel[]> {
  const config = getServicosAgendaveisConfig(clienteSlug);

  if (!config) {
    return [];
  }

  const externo = createServicosClient(config);

  if (!externo) {
    return [];
  }

  const { data, error } = await externo
    .from(config.tabela)
    .select(colunasAgendaveis(config))
    .eq(config.activoColumn, true);

  if (error) {
    console.error("[servicos] falha a ler os serviços agendáveis", error);

    return [];
  }

  const servicos: ServicoAgendavel[] = [];

  for (const linha of (data ?? []) as unknown as LinhaAgendavel[]) {
    const nome = String(linha.nome ?? "").trim();

    if (!linha.id || !nome) {
      continue;
    }

    const executores =
      config.executores.modo === "colunas"
        ? executoresPorColuna(linha, config.executores)
        : executoresPorTexto(linha, config.executores);

    if (executores.length === 0) {
      continue;
    }

    servicos.push({
      executores,
      id: String(linha.id),
      nome,
      precoBase: toNumber(
        linha[config.precoColumn] as number | string | null,
      ),
    });
  }

  return servicos.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
}

async function lerCatalogoPorEstado(
  clienteSlug: string,
  activo: boolean,
): Promise<ServicoSimples[]> {
  const config = getServicosConfig(clienteSlug);

  if (!config) {
    return [];
  }

  const externo = createServicosClient(config);

  if (!externo) {
    return [];
  }

  const { data, error } = await externo
    .from(config.catalogoTable)
    .select("id, nome")
    .eq("activo", activo)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("[servicos] falha a ler o catálogo reduzido", error);

    return [];
  }

  return (data ?? [])
    .filter((linha): linha is { id: string; nome: string } =>
      Boolean(linha.id && typeof linha.nome === "string" && linha.nome.trim()),
    )
    .map((linha) => ({ id: linha.id, nome: linha.nome.trim() }));
}
