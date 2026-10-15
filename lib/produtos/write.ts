import { revalidatePath } from "next/cache";

import { createServicosClient, getServicosConfig } from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Escritas dos produtos e do stock.
 *
 * Tudo o que mexe no stock entra como um movimento. Não há nenhuma coluna de
 * stock para actualizar, por isso não há o problema clássico de ler-somar-
 * escrever: duas execuções registadas ao mesmo tempo dão duas linhas, não uma
 * corrida perdida.
 *
 * A autorização fica a cargo de quem chama, como no painel de serviços: a
 * action do cliente tira o slug do perfil e a do admin do selector.
 */

export type GravarProdutoResultado = {
  mensagem: string;
  ok: boolean;
};

const unidadesValidas = ["ml", "l", "g", "kg", "un"] as const;

export type Unidade = (typeof unidadesValidas)[number];

const limiteQuantidade = 1_000_000;

function validarQuantidade(bruto: string, etiqueta: string) {
  const normalizado = bruto.trim().replace(",", ".");

  if (normalizado === "") {
    return { erro: `Preenche ${etiqueta}.`, valor: null };
  }

  const valor = Number(normalizado);

  if (!Number.isFinite(valor) || valor <= 0) {
    return { erro: `${etiqueta} tem de ser um número maior que zero.`, valor: null };
  }

  if (valor > limiteQuantidade) {
    return { erro: `${etiqueta} está fora do intervalo aceitável.`, valor: null };
  }

  return { erro: null, valor: Math.round(valor * 1000) / 1000 };
}

/**
 * Confirma que o serviço existe no catálogo do CLIENTE e devolve o nome.
 *
 * Esta leitura é a autorização real sobre o `servicoId` que veio do
 * formulário: se o id não for um serviço desta empresa, não aparece aqui.
 */
async function lerServico(clienteSlug: string, servicoId: string) {
  const config = getServicosConfig(clienteSlug);

  if (!config) {
    return { erro: "Este cliente não tem catálogo de serviços ligado.", nome: null };
  }

  const externo = createServicosClient(config);

  if (!externo) {
    return {
      erro: "Credenciais da base de dados do cliente não configuradas.",
      nome: null,
    };
  }

  const { data, error } = await externo
    .from(config.catalogoTable)
    .select("id, nome")
    .eq("id", servicoId)
    .maybeSingle();

  if (error) {
    console.error("[produtos] falha a ler o serviço", error);

    return { erro: "Não foi possível ler o serviço.", nome: null };
  }

  if (!data?.nome) {
    return { erro: "Serviço desconhecido.", nome: null };
  }

  return { erro: null, nome: String(data.nome) };
}

export async function criarProduto({
  caminhoParaRevalidar,
  clienteSlug,
  nomeBruto,
  notasBruto,
  unidadeBruta,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  nomeBruto: string;
  notasBruto: string;
  unidadeBruta: string;
  userId: string;
}): Promise<GravarProdutoResultado> {
  const nome = nomeBruto.trim();

  if (nome === "" || nome.length > 256) {
    return { mensagem: "Dá um nome ao produto.", ok: false };
  }

  if (!unidadesValidas.includes(unidadeBruta as Unidade)) {
    return { mensagem: "Escolhe uma unidade válida.", ok: false };
  }

  const notas = notasBruto.trim();
  const admin = createAdminClient();

  const { error } = await admin.from("lexia_produtos").insert({
    actualizado_por: userId,
    cliente_slug: clienteSlug,
    nome,
    notas: notas === "" ? null : notas,
    unidade: unidadeBruta,
  });

  if (error) {
    console.error("[produtos] falha a criar o produto", error);

    // 23505 é a unicidade (cliente_slug, nome).
    if (error.code === "23505") {
      return { mensagem: `Já existe um produto chamado "${nome}".`, ok: false };
    }

    return { mensagem: "Não foi possível criar o produto.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return { mensagem: `"${nome}" criado.`, ok: true };
}

/**
 * Compra: entra quantidade no stock e fixa o custo unitário dali para a frente.
 */
export async function registarCompra({
  caminhoParaRevalidar,
  clienteSlug,
  custoTotalBruto,
  produtoId,
  quantidadeBruta,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  custoTotalBruto: string;
  produtoId: string;
  quantidadeBruta: string;
  userId: string;
}): Promise<GravarProdutoResultado> {
  const quantidade = validarQuantidade(quantidadeBruta, "a quantidade comprada");

  if (quantidade.erro || quantidade.valor === null) {
    return { mensagem: quantidade.erro ?? "Quantidade inválida.", ok: false };
  }

  const custo = validarQuantidade(custoTotalBruto, "o que pagaste");

  if (custo.erro || custo.valor === null) {
    return { mensagem: custo.erro ?? "Valor inválido.", ok: false };
  }

  const admin = createAdminClient();
  const produto = await lerProdutoDoCliente(admin, clienteSlug, produtoId);

  if (!produto) {
    return { mensagem: "Produto desconhecido.", ok: false };
  }

  const { error } = await admin.from("lexia_produto_movimentos").insert({
    cliente_slug: clienteSlug,
    criado_por: userId,
    custo_total: Math.round(custo.valor * 100) / 100,
    produto_id: produtoId,
    quantidade: quantidade.valor,
    tipo: "compra",
  });

  if (error) {
    console.error("[produtos] falha a registar a compra", error);

    return { mensagem: "Não foi possível registar a compra.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  const unitario = custo.valor / quantidade.valor;

  return {
    mensagem: `Compra registada: ${quantidade.valor} ${produto.unidade} de ${produto.nome} a ${unitario.toFixed(4)} €/${produto.unidade}.`,
    ok: true,
  };
}

/**
 * Ajuste: corrige o stock sem ser compra nem consumo.
 *
 * Existe porque o registo é manual e vai haver enganos — uma execução marcada
 * duas vezes, um frasco entornado, uma contagem física que não bate. Sem isto
 * o único remédio seria mexer na base à mão.
 */
export async function registarAjuste({
  caminhoParaRevalidar,
  clienteSlug,
  direccao,
  notaBruta,
  produtoId,
  quantidadeBruta,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  direccao: string;
  notaBruta: string;
  produtoId: string;
  quantidadeBruta: string;
  userId: string;
}): Promise<GravarProdutoResultado> {
  const quantidade = validarQuantidade(quantidadeBruta, "a quantidade");

  if (quantidade.erro || quantidade.valor === null) {
    return { mensagem: quantidade.erro ?? "Quantidade inválida.", ok: false };
  }

  if (direccao !== "entrada" && direccao !== "saida") {
    return { mensagem: "Escolhe se o ajuste soma ou subtrai.", ok: false };
  }

  const admin = createAdminClient();
  const produto = await lerProdutoDoCliente(admin, clienteSlug, produtoId);

  if (!produto) {
    return { mensagem: "Produto desconhecido.", ok: false };
  }

  const nota = notaBruta.trim();

  const { error } = await admin.from("lexia_produto_movimentos").insert({
    cliente_slug: clienteSlug,
    criado_por: userId,
    nota: nota === "" ? null : nota,
    produto_id: produtoId,
    quantidade: direccao === "entrada" ? quantidade.valor : -quantidade.valor,
    tipo: "ajuste",
  });

  if (error) {
    console.error("[produtos] falha a registar o ajuste", error);

    return { mensagem: "Não foi possível registar o ajuste.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return { mensagem: `Stock de ${produto.nome} ajustado.`, ok: true };
}

/**
 * Receita: quanto de um produto entra num serviço.
 *
 * Quantidade zero apaga a linha. É a forma mais directa de tirar um produto da
 * receita sem inventar um segundo botão.
 */
export async function definirReceita({
  caminhoParaRevalidar,
  clienteSlug,
  produtoId,
  quantidadeBruta,
  servicoId,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  produtoId: string;
  quantidadeBruta: string;
  servicoId: string;
  userId: string;
}): Promise<GravarProdutoResultado> {
  const servico = await lerServico(clienteSlug, servicoId);

  if (servico.erro || !servico.nome) {
    return { mensagem: servico.erro ?? "Serviço desconhecido.", ok: false };
  }

  const admin = createAdminClient();
  const produto = await lerProdutoDoCliente(admin, clienteSlug, produtoId);

  if (!produto) {
    return { mensagem: "Produto desconhecido.", ok: false };
  }

  const normalizado = quantidadeBruta.trim().replace(",", ".");

  if (normalizado === "" || Number(normalizado) === 0) {
    const { error } = await admin
      .from("lexia_servico_produtos")
      .delete()
      .eq("cliente_slug", clienteSlug)
      .eq("servico_id", servicoId)
      .eq("produto_id", produtoId);

    if (error) {
      console.error("[produtos] falha a remover o produto da receita", error);

      return { mensagem: "Não foi possível remover o produto.", ok: false };
    }

    revalidatePath(caminhoParaRevalidar);

    return {
      mensagem: `${produto.nome} saiu da receita de "${servico.nome}".`,
      ok: true,
    };
  }

  const quantidade = validarQuantidade(quantidadeBruta, "a quantidade");

  if (quantidade.erro || quantidade.valor === null) {
    return { mensagem: quantidade.erro ?? "Quantidade inválida.", ok: false };
  }

  const { error } = await admin.from("lexia_servico_produtos").upsert(
    {
      actualizado_em: new Date().toISOString(),
      actualizado_por: userId,
      cliente_slug: clienteSlug,
      produto_id: produtoId,
      quantidade: quantidade.valor,
      servico_id: servicoId,
      servico_nome: servico.nome,
    },
    { onConflict: "cliente_slug,servico_id,produto_id" },
  );

  if (error) {
    console.error("[produtos] falha a gravar a receita", error);

    return { mensagem: "Não foi possível gravar a receita.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    mensagem: `"${servico.nome}" passa a gastar ${quantidade.valor} ${produto.unidade} de ${produto.nome}.`,
    ok: true,
  };
}

/**
 * Serviço realizado: tira do stock tudo o que a receita diz.
 *
 * Insere todas as saídas numa só instrução. Se uma falhar, nenhuma entra — é a
 * garantia que queremos aqui, senão metade dos produtos saía do stock e a
 * outra metade não, e o dono não tinha como saber qual.
 *
 * O stock pode ficar negativo de propósito. Significa que ele usou produto que
 * nunca registou ter comprado, e esconder isso com uma recusa só o obrigava a
 * inventar uma compra para poder trabalhar.
 */
export async function registarExecucao({
  caminhoParaRevalidar,
  clienteSlug,
  servicoId,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  servicoId: string;
  userId: string;
}): Promise<GravarProdutoResultado> {
  const servico = await lerServico(clienteSlug, servicoId);

  if (servico.erro || !servico.nome) {
    return { mensagem: servico.erro ?? "Serviço desconhecido.", ok: false };
  }

  const admin = createAdminClient();

  const { data: receita, error: erroReceita } = await admin
    .from("lexia_servico_produtos")
    .select("produto_id, quantidade")
    .eq("cliente_slug", clienteSlug)
    .eq("servico_id", servicoId);

  if (erroReceita) {
    console.error("[produtos] falha a ler a receita", erroReceita);

    return { mensagem: "Não foi possível ler a receita do serviço.", ok: false };
  }

  if (!receita || receita.length === 0) {
    return {
      mensagem: `"${servico.nome}" ainda não tem produtos associados — nada para descontar.`,
      ok: false,
    };
  }

  const agora = new Date().toISOString();

  const { error } = await admin.from("lexia_produto_movimentos").insert(
    receita.map((item) => ({
      cliente_slug: clienteSlug,
      criado_por: userId,
      ocorrido_em: agora,
      produto_id: item.produto_id,
      quantidade: -Math.abs(Number(item.quantidade)),
      servico_id: servicoId,
      servico_nome: servico.nome,
      tipo: "consumo",
    })),
  );

  if (error) {
    console.error("[produtos] falha a registar o consumo", error);

    return { mensagem: "Não foi possível descontar do stock.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    mensagem: `"${servico.nome}" registado: ${receita.length} ${receita.length === 1 ? "produto descontado" : "produtos descontados"} do stock.`,
    ok: true,
  };
}

async function lerProdutoDoCliente(
  admin: ReturnType<typeof createAdminClient>,
  clienteSlug: string,
  produtoId: string,
) {
  const { data, error } = await admin
    .from("lexia_produtos")
    .select("id, nome, unidade")
    .eq("cliente_slug", clienteSlug)
    .eq("id", produtoId)
    .maybeSingle();

  if (error) {
    console.error("[produtos] falha a ler o produto", error);

    return null;
  }

  return data ? { nome: String(data.nome), unidade: String(data.unidade) } : null;
}
