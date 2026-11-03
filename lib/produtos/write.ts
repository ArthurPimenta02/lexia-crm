import { revalidatePath } from "next/cache";

import { mensagemCom, type TextoDaMensagem } from "@/lib/catalogo/mensagem";
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
  /** Já em pt-BR; a server action traduz com `texto` antes de a mostrar. */
  mensagem: string;
  ok: boolean;
  texto?: TextoDaMensagem;
};

const unidadesValidas = ["ml", "l", "g", "kg", "un"] as const;

export type Unidade = (typeof unidadesValidas)[number];

const limiteQuantidade = 1_000_000;

/**
 * Os erros de cada campo, já como frase inteira: é a frase que se traduz, e
 * colar "a quantidade" a "tem de ser…" partia a ordem das palavras noutras
 * línguas.
 */
const errosDoCampo = {
  pago: {
    fora: "O valor pago está fora do intervalo aceitável.",
    invalido: "O valor pago tem de ser um número maior que zero.",
    vazio: "Preencha quanto você pagou.",
  },
  quantidade: {
    fora: "A quantidade está fora do intervalo aceitável.",
    invalido: "A quantidade tem de ser um número maior que zero.",
    vazio: "Preencha a quantidade.",
  },
  quantidadeComprada: {
    fora: "A quantidade comprada está fora do intervalo aceitável.",
    invalido: "A quantidade comprada tem de ser um número maior que zero.",
    vazio: "Preencha a quantidade comprada.",
  },
} as const;

function validarQuantidade(bruto: string, campo: keyof typeof errosDoCampo) {
  const normalizado = bruto.trim().replace(",", ".");
  const erros = errosDoCampo[campo];

  if (normalizado === "") {
    return { erro: erros.vazio, valor: null };
  }

  const valor = Number(normalizado);

  if (!Number.isFinite(valor) || valor <= 0) {
    return { erro: erros.invalido, valor: null };
  }

  if (valor > limiteQuantidade) {
    return { erro: erros.fora, valor: null };
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
      erro: "Credenciais do banco de dados do cliente não configuradas.",
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
    return { mensagem: "Dê um nome ao produto.", ok: false };
  }

  if (!unidadesValidas.includes(unidadeBruta as Unidade)) {
    return { mensagem: "Escolha uma unidade válida.", ok: false };
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
      return {
        ...mensagemCom('Já existe um produto chamado "{nome}".', { nome }),
        ok: false,
      };
    }

    return { mensagem: "Não foi possível criar o produto.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return { ...mensagemCom('"{nome}" criado.', { nome }), ok: true };
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
  const quantidade = validarQuantidade(quantidadeBruta, "quantidadeComprada");

  if (quantidade.erro || quantidade.valor === null) {
    return { mensagem: quantidade.erro ?? "Quantidade inválida.", ok: false };
  }

  const custo = validarQuantidade(custoTotalBruto, "pago");

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

    return { mensagem: "Não foi possível registrar a compra.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  const unitario = custo.valor / quantidade.valor;

  return {
    ...mensagemCom(
      "Compra registrada: {quantidade} {unidade} de {produto} a {unitario} €/{unidade}.",
      {
        produto: produto.nome,
        quantidade: quantidade.valor,
        unidade: produto.unidade,
        unitario: unitario.toFixed(4),
      },
    ),
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
  const quantidade = validarQuantidade(quantidadeBruta, "quantidade");

  if (quantidade.erro || quantidade.valor === null) {
    return { mensagem: quantidade.erro ?? "Quantidade inválida.", ok: false };
  }

  if (direccao !== "entrada" && direccao !== "saida") {
    return { mensagem: "Escolha se o ajuste soma ou subtrai.", ok: false };
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

    return { mensagem: "Não foi possível registrar o ajuste.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    ...mensagemCom("Estoque de {produto} ajustado.", { produto: produto.nome }),
    ok: true,
  };
}

/**
 * Excluir um produto: sai do ecrã e de todas as receitas, mas a linha fica.
 *
 * Nunca é um `delete`. Os movimentos são o próprio livro de stock e estão
 * ligados ao produto com `on delete cascade`: apagar a linha levava com ela o
 * histórico de compras e de consumos, e com ele o custo unitário que alimenta
 * a margem de serviços que já foram vendidos. `activo = false` esconde o
 * produto e deixa a conta de pé.
 *
 * As linhas da receita, ao contrário, são apagadas de verdade. Se ficassem, o
 * `registarExecucao` continuava a descontar um produto que já não aparece em
 * ecrã nenhum — stock a desaparecer sem o dono ter onde o ver.
 */
export async function excluirProduto({
  caminhoParaRevalidar,
  clienteSlug,
  produtoId,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  produtoId: string;
  userId: string;
}): Promise<GravarProdutoResultado> {
  const admin = createAdminClient();
  const produto = await lerProdutoDoCliente(admin, clienteSlug, produtoId);

  if (!produto) {
    return { mensagem: "Produto desconhecido.", ok: false };
  }

  const { data: receitas, error: erroReceita } = await admin
    .from("lexia_servico_produtos")
    .delete()
    .eq("cliente_slug", clienteSlug)
    .eq("produto_id", produtoId)
    .select("servico_id");

  if (erroReceita) {
    console.error("[produtos] falha a limpar as receitas do produto", erroReceita);

    return {
      mensagem: "Não foi possível tirar o produto das receitas dos serviços.",
      ok: false,
    };
  }

  const { error } = await admin
    .from("lexia_produtos")
    .update({
      activo: false,
      actualizado_em: new Date().toISOString(),
      actualizado_por: userId,
    })
    .eq("cliente_slug", clienteSlug)
    .eq("id", produtoId);

  if (error) {
    console.error("[produtos] falha a excluir o produto", error);

    return { mensagem: "Não foi possível excluir o produto.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  const afectados = receitas?.length ?? 0;

  return {
    ...(afectados === 0
      ? mensagemCom(
          '"{nome}" excluído. O histórico fica guardado e você pode restaurá-lo logo abaixo.',
          { nome: produto.nome },
        )
      : mensagemCom(
          afectados === 1
            ? '"{nome}" excluído e tirado de {n} serviço. Se você restaurá-lo, a quantidade em cada serviço precisa ser definida de novo.'
            : '"{nome}" excluído e tirado de {n} serviços. Se você restaurá-lo, a quantidade em cada serviço precisa ser definida de novo.',
          { n: afectados, nome: produto.nome },
        )),
    ok: true,
  };
}

/**
 * Repor um produto excluído. O stock e o histórico voltam intactos; a receita
 * dos serviços não, porque foi apagada ao excluir.
 */
export async function reporProduto({
  caminhoParaRevalidar,
  clienteSlug,
  produtoId,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  produtoId: string;
  userId: string;
}): Promise<GravarProdutoResultado> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("lexia_produtos")
    .update({
      activo: true,
      actualizado_em: new Date().toISOString(),
      actualizado_por: userId,
    })
    .eq("cliente_slug", clienteSlug)
    .eq("id", produtoId)
    .select("nome")
    .maybeSingle();

  if (error) {
    console.error("[produtos] falha a repor o produto", error);

    return { mensagem: "Não foi possível restaurar o produto.", ok: false };
  }

  if (!data) {
    return { mensagem: "Produto desconhecido.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    ...mensagemCom(
      '"{nome}" restaurado. Diga de novo quanto cada serviço gasta dele.',
      { nome: String(data.nome) },
    ),
    ok: true,
  };
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

  // Um produto excluído não volta à receita por aqui. O ecrã não o oferece,
  // mas o id vem do formulário: sem esta recusa, um separador aberto antes da
  // exclusão punha de novo a descontar stock de um produto invisível.
  if (!produto.activo) {
    return {
      ...mensagemCom(
        '"{nome}" está excluído. Restaure-o na página Produtos antes de usá-lo num serviço.',
        { nome: produto.nome },
      ),
      ok: false,
    };
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
      ...mensagemCom('{produto} saiu da receita de "{servico}".', {
        produto: produto.nome,
        servico: servico.nome,
      }),
      ok: true,
    };
  }

  const quantidade = validarQuantidade(quantidadeBruta, "quantidade");

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

    return { mensagem: "Não foi possível salvar a receita.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    ...mensagemCom(
      '"{servico}" passa a gastar {quantidade} {unidade} de {produto}.',
      {
        produto: produto.nome,
        quantidade: quantidade.valor,
        servico: servico.nome,
        unidade: produto.unidade,
      },
    ),
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
      ...mensagemCom(
        '"{servico}" ainda não tem produtos associados, nada para descontar.',
        { servico: servico.nome },
      ),
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

    return { mensagem: "Não foi possível descontar do estoque.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    ...mensagemCom(
      receita.length === 1
        ? '"{servico}" registrado: {n} produto descontado do estoque.'
        : '"{servico}" registrado: {n} produtos descontados do estoque.',
      { n: receita.length, servico: servico.nome },
    ),
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
    .select("id, nome, unidade, activo")
    .eq("cliente_slug", clienteSlug)
    .eq("id", produtoId)
    .maybeSingle();

  if (error) {
    console.error("[produtos] falha a ler o produto", error);

    return null;
  }

  return data
    ? {
        activo: data.activo === true,
        nome: String(data.nome),
        unidade: String(data.unidade),
      }
    : null;
}
