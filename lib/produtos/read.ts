import { toNumber } from "@/lib/servicos/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Leitura dos produtos e do stock.
 *
 * Três regras que explicam tudo o que está aqui:
 *
 * 1. O stock é a soma de `lexia_produto_movimentos`, nunca uma coluna. Uma
 *    compra entra positiva, um consumo sai negativo.
 * 2. O custo unitário vem da compra mais recente — `custo_total / quantidade`.
 *    É o número que o dono reconhece, e actualiza-se sozinho quando ele
 *    volta a comprar mais caro.
 * 3. O ritmo de consumo só existe depois de o dono registar execuções. Não há
 *    histórico importado: a plataforma conta a partir do dia em que ele começa.
 *    Enquanto não houver duas saídas, a previsão devolve null em vez de um
 *    número inventado a partir de uma amostra de um.
 */

const umDiaEmMs = 24 * 60 * 60 * 1000;

export type MovimentoLinha = {
  custoTotal: number | null;
  id: string;
  nota: string | null;
  ocorridoEm: string;
  quantidade: number;
  servicoNome: string | null;
  tipo: "compra" | "consumo" | "ajuste";
};

export type ProdutoLinha = {
  /** Dias até o stock acabar ao ritmo actual. Null enquanto não há ritmo. */
  diasRestantes: number | null;
  id: string;
  /** Média diária de consumo desde a primeira saída registada. */
  consumoPorDia: number | null;
  custoUnitario: number | null;
  movimentos: MovimentoLinha[];
  nome: string;
  notas: string | null;
  /** Quantas saídas já foram registadas. Abaixo de 2 não há previsão. */
  saidasRegistadas: number;
  stock: number;
  unidade: string;
};

export type ItemReceita = {
  custo: number | null;
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  unidade: string;
};

export type ReceitasPorServico = Map<string, ItemReceita[]>;

type ProdutoRow = {
  id: string;
  nome: string;
  notas: string | null;
  unidade: string;
};

type MovimentoRow = {
  custo_total: number | string | null;
  id: string;
  nota: string | null;
  ocorrido_em: string;
  produto_id: string;
  quantidade: number | string;
  servico_nome: string | null;
  tipo: "compra" | "consumo" | "ajuste";
};

type ReceitaRow = {
  produto_id: string;
  quantidade: number | string;
  servico_id: string;
};

function arredondar(valor: number, casas = 2) {
  const factor = 10 ** casas;

  return Math.round(valor * factor) / factor;
}

/**
 * Produtos do cliente com stock, custo unitário e previsão de duração.
 *
 * Devolve sempre a lista completa de produtos activos, mesmo os que nunca
 * tiveram movimento: um produto registado e sem compra é informação útil
 * (está em falta), não é ruído.
 */
export async function getProdutos(clienteSlug: string): Promise<ProdutoLinha[]> {
  const central = await createClient();

  const [produtos, movimentos] = await Promise.all([
    central
      .from("lexia_produtos")
      .select("id, nome, unidade, notas")
      .eq("cliente_slug", clienteSlug)
      .eq("activo", true)
      .order("nome", { ascending: true }),
    central
      .from("lexia_produto_movimentos")
      .select("id, produto_id, tipo, quantidade, custo_total, servico_nome, nota, ocorrido_em")
      .eq("cliente_slug", clienteSlug)
      .order("ocorrido_em", { ascending: false }),
  ]);

  if (produtos.error) {
    console.error("[produtos] falha a ler os produtos", produtos.error);

    return [];
  }

  if (movimentos.error) {
    console.error("[produtos] falha a ler os movimentos", movimentos.error);
  }

  const porProduto = new Map<string, MovimentoRow[]>();

  for (const linha of (movimentos.data ?? []) as unknown as MovimentoRow[]) {
    const lista = porProduto.get(linha.produto_id);

    if (lista) {
      lista.push(linha);
    } else {
      porProduto.set(linha.produto_id, [linha]);
    }
  }

  const agora = Date.now();

  return ((produtos.data ?? []) as unknown as ProdutoRow[]).map((produto) => {
    // Já vêm ordenados do mais recente para o mais antigo.
    const linhas = porProduto.get(produto.id) ?? [];

    let stock = 0;
    let custoUnitario: number | null = null;
    let totalConsumido = 0;
    let saidasRegistadas = 0;
    let primeiraSaidaEmMs: number | null = null;

    for (const linha of linhas) {
      const quantidade = toNumber(linha.quantidade) ?? 0;

      stock += quantidade;

      if (linha.tipo === "compra" && custoUnitario === null && quantidade > 0) {
        const custoTotal = toNumber(linha.custo_total);

        if (custoTotal !== null) {
          custoUnitario = custoTotal / quantidade;
        }
      }

      if (linha.tipo === "consumo") {
        totalConsumido += Math.abs(quantidade);
        saidasRegistadas += 1;
        primeiraSaidaEmMs = new Date(linha.ocorrido_em).getTime();
      }
    }

    let consumoPorDia: number | null = null;
    let diasRestantes: number | null = null;

    if (saidasRegistadas >= 2 && primeiraSaidaEmMs !== null && totalConsumido > 0) {
      const dias = Math.max(1, (agora - primeiraSaidaEmMs) / umDiaEmMs);

      consumoPorDia = totalConsumido / dias;

      if (consumoPorDia > 0) {
        diasRestantes = Math.max(0, Math.floor(stock / consumoPorDia));
      }
    }

    return {
      consumoPorDia: consumoPorDia === null ? null : arredondar(consumoPorDia, 3),
      custoUnitario: custoUnitario === null ? null : arredondar(custoUnitario, 4),
      diasRestantes,
      id: produto.id,
      movimentos: linhas.slice(0, 8).map((linha) => ({
        custoTotal: toNumber(linha.custo_total),
        id: linha.id,
        nota: linha.nota,
        ocorridoEm: linha.ocorrido_em,
        quantidade: toNumber(linha.quantidade) ?? 0,
        servicoNome: linha.servico_nome,
        tipo: linha.tipo,
      })),
      nome: produto.nome,
      notas: produto.notas,
      saidasRegistadas,
      stock: arredondar(stock, 3),
      unidade: produto.unidade,
    };
  });
}

/**
 * Receita de cada serviço, com o custo já calculado ao preço actual.
 *
 * O custo de produto de um serviço nunca é guardado: muda sozinho quando o
 * dono compra o mesmo produto mais caro, e um valor gravado ficava velho sem
 * ninguém dar por isso.
 */
export function montarReceitas(
  receitas: ReceitaRow[],
  produtos: ProdutoLinha[],
): ReceitasPorServico {
  const porId = new Map(produtos.map((produto) => [produto.id, produto]));
  const mapa: ReceitasPorServico = new Map();

  for (const linha of receitas) {
    const produto = porId.get(linha.produto_id);

    if (!produto) {
      continue;
    }

    const quantidade = toNumber(linha.quantidade) ?? 0;
    const custo =
      produto.custoUnitario === null
        ? null
        : arredondar(quantidade * produto.custoUnitario);

    const item: ItemReceita = {
      custo,
      produtoId: produto.id,
      produtoNome: produto.nome,
      quantidade,
      unidade: produto.unidade,
    };

    const lista = mapa.get(linha.servico_id);

    if (lista) {
      lista.push(item);
    } else {
      mapa.set(linha.servico_id, [item]);
    }
  }

  for (const lista of mapa.values()) {
    lista.sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt"));
  }

  return mapa;
}

export async function getReceitas(
  clienteSlug: string,
  produtos: ProdutoLinha[],
): Promise<ReceitasPorServico> {
  const central = await createClient();

  const { data, error } = await central
    .from("lexia_servico_produtos")
    .select("servico_id, produto_id, quantidade")
    .eq("cliente_slug", clienteSlug);

  if (error) {
    console.error("[produtos] falha a ler as receitas", error);

    return new Map();
  }

  return montarReceitas((data ?? []) as unknown as ReceitaRow[], produtos);
}
