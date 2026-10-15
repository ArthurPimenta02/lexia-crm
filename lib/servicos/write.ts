import { revalidatePath } from "next/cache";

import {
  createServicosClient,
  getServicosConfig,
  normalizarNomeServico,
  toNumber,
} from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gravação do painel de serviços.
 *
 * Escreve em duas bases de dados diferentes:
 *   - custo de produto e custo/hora  -> Supabase CENTRAL da Lexia
 *   - preço                          -> Supabase DO CLIENTE, nas DUAS tabelas
 *
 * A autorização é deliberadamente deixada a quem chama. As server actions do
 * cliente e do admin validam o perfil de maneiras diferentes (uma tira o slug
 * do perfil, a outra do selector) e é lá que a decisão tem de estar.
 */

export type GravarServicoResultado = {
  mensagem: string;
  ok: boolean;
};

const limiteValor = 1_000_000;

function validarValor(bruto: string, etiqueta: string) {
  const normalizado = bruto.trim().replace(",", ".");

  if (normalizado === "") {
    return { erro: `Preenche o ${etiqueta}.`, valor: null };
  }

  const valor = Number(normalizado);

  if (!Number.isFinite(valor) || valor < 0) {
    return { erro: `O ${etiqueta} tem de ser um número igual ou maior que zero.`, valor: null };
  }

  if (valor > limiteValor) {
    return { erro: `O ${etiqueta} está fora do intervalo aceitável.`, valor: null };
  }

  return { erro: null, valor: Math.round(valor * 100) / 100 };
}

export async function gravarCustoHoraDoExecutor({
  caminhoParaRevalidar,
  clienteSlug,
  custoHoraBruto,
  executor,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  custoHoraBruto: string;
  executor: string;
  userId: string;
}): Promise<GravarServicoResultado> {
  const config = getServicosConfig(clienteSlug);

  if (!config) {
    return { mensagem: "Este cliente não tem painel de serviços.", ok: false };
  }

  const definicao = config.executores.find((item) => item.chave === executor);

  if (!definicao) {
    return { mensagem: "Executor desconhecido.", ok: false };
  }

  const { erro, valor } = validarValor(custoHoraBruto, "custo por hora");

  if (erro || valor === null) {
    return { mensagem: erro ?? "Valor inválido.", ok: false };
  }

  const admin = createAdminClient();

  const { error } = await admin.from("lexia_executores_custo").upsert(
    {
      actualizado_em: new Date().toISOString(),
      actualizado_por: userId,
      cliente_slug: clienteSlug,
      custo_hora: valor,
      executor: definicao.chave,
      nome: definicao.nome,
    },
    { onConflict: "cliente_slug,executor" },
  );

  if (error) {
    console.error("[servicos] falha a gravar o custo por hora", error);

    return { mensagem: "Não foi possível gravar o custo por hora.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    mensagem: `Custo por hora do ${definicao.nome} gravado.`,
    ok: true,
  };
}

export async function gravarCustoDoServico({
  caminhoParaRevalidar,
  clienteSlug,
  custoProdutoBruto,
  notasBruto,
  precoBruto,
  servicoId,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  custoProdutoBruto: string;
  notasBruto: string;
  precoBruto: string;
  servicoId: string;
  userId: string;
}): Promise<GravarServicoResultado> {
  const config = getServicosConfig(clienteSlug);

  if (!config) {
    return { mensagem: "Este cliente não tem painel de serviços.", ok: false };
  }

  const externo = createServicosClient(config);

  if (!externo) {
    return {
      mensagem: "Credenciais da base de dados do cliente não configuradas.",
      ok: false,
    };
  }

  const custo = validarValor(custoProdutoBruto, "custo de produto");

  if (custo.erro || custo.valor === null) {
    return { mensagem: custo.erro ?? "Valor inválido.", ok: false };
  }

  const notas = notasBruto.trim();

  if (notas.length > 2000) {
    return { mensagem: "As notas são demasiado longas.", ok: false };
  }

  // O serviço tem de existir no catálogo do cliente. É esta leitura que
  // garante que o `servicoId` que veio do formulário é mesmo um serviço desta
  // empresa, e é dela que sai o nome para encontrar a linha operacional.
  const { data: servico, error: erroServico } = await externo
    .from(config.catalogoTable)
    .select("id, nome, valor")
    .eq("id", servicoId)
    .maybeSingle();

  if (erroServico) {
    console.error("[servicos] falha a ler o serviço antes de gravar", erroServico);

    return { mensagem: "Não foi possível ler o serviço.", ok: false };
  }

  if (!servico?.nome) {
    return { mensagem: "Serviço desconhecido.", ok: false };
  }

  const admin = createAdminClient();

  const { error: erroCusto } = await admin.from("lexia_servico_custos").upsert(
    {
      actualizado_em: new Date().toISOString(),
      actualizado_por: userId,
      cliente_slug: clienteSlug,
      custo_produto: custo.valor,
      notas: notas === "" ? null : notas,
      servico_id: servicoId,
      servico_nome: servico.nome,
    },
    { onConflict: "cliente_slug,servico_id" },
  );

  if (erroCusto) {
    console.error("[servicos] falha a gravar o custo do serviço", erroCusto);

    return { mensagem: "Não foi possível gravar o custo.", ok: false };
  }

  const precoPedido = precoBruto.trim();

  if (precoPedido === "") {
    revalidatePath(caminhoParaRevalidar);

    return { mensagem: `Custo de "${servico.nome}" gravado.`, ok: true };
  }

  const preco = validarValor(precoPedido, "preço");

  if (preco.erro || preco.valor === null) {
    return {
      mensagem: `Custo gravado, mas o preço não: ${preco.erro}`,
      ok: false,
    };
  }

  const precoAnterior = toNumber(servico.valor as number | string | null);

  if (precoAnterior !== null && precoAnterior === preco.valor) {
    revalidatePath(caminhoParaRevalidar);

    return { mensagem: `Custo de "${servico.nome}" gravado.`, ok: true };
  }

  const resultadoPreco = await sincronizarPreco({
    config,
    externo,
    nome: servico.nome,
    preco: preco.valor,
    precoAnterior,
    servicoId,
  });

  revalidatePath(caminhoParaRevalidar);

  return resultadoPreco;
}

/**
 * Escreve o preço nas duas tabelas do cliente.
 *
 * Porque é que isto é delicado: as duas tabelas estão hoje em sintonia (medido
 * a 15/10/2026: 14 serviços, 14 preços iguais) e são lidas por caminhos
 * diferentes -- o catálogo alimenta o RAG do agente de vendas, o operacional
 * alimenta o agendamento. Escrever só numa deixaria o agente a vender a um
 * preço e a marcação a cobrar outro.
 *
 * Não há transacção possível entre duas chamadas PostgREST. Se a segunda
 * falhar, desfazemos a primeira e dizemos que nada mudou, em vez de deixar a
 * divergência instalada sem ninguém saber.
 */
async function sincronizarPreco({
  config,
  externo,
  nome,
  preco,
  precoAnterior,
  servicoId,
}: {
  config: NonNullable<ReturnType<typeof getServicosConfig>>;
  externo: NonNullable<ReturnType<typeof createServicosClient>>;
  nome: string;
  preco: number;
  precoAnterior: number | null;
  servicoId: string;
}): Promise<GravarServicoResultado> {
  const { error: erroCatalogo } = await externo
    .from(config.catalogoTable)
    .update({ valor: preco })
    .eq("id", servicoId);

  if (erroCatalogo) {
    console.error("[servicos] falha a gravar o preço no catálogo", erroCatalogo);

    return {
      mensagem: "Custo gravado, mas o preço não foi alterado.",
      ok: false,
    };
  }

  // A ligação entre as duas tabelas é o nome: não há chave comum.
  const { data: operacionais, error: erroLeitura } = await externo
    .from(config.agendamentoTable)
    .select("id, nome");

  if (erroLeitura) {
    console.error("[servicos] falha a ler a tabela operacional", erroLeitura);

    return await reverterCatalogo({
      config,
      externo,
      mensagem:
        "Preço não alterado: não foi possível confirmar a linha de agendamento.",
      precoAnterior,
      servicoId,
    });
  }

  const alvo = (operacionais ?? []).find(
    (linha) =>
      typeof linha.nome === "string" &&
      normalizarNomeServico(linha.nome) === normalizarNomeServico(nome),
  );

  if (!alvo) {
    return await reverterCatalogo({
      config,
      externo,
      mensagem: `Preço não alterado: "${nome}" não tem linha em ${config.agendamentoTable}, e mudar só o catálogo punha o agente a vender um preço que o agendamento não cobra.`,
      precoAnterior,
      servicoId,
    });
  }

  const { error: erroOperacional } = await externo
    .from(config.agendamentoTable)
    .update({ preco_base: preco })
    .eq("id", alvo.id);

  if (erroOperacional) {
    console.error(
      "[servicos] falha a gravar o preço no operacional",
      erroOperacional,
    );

    return await reverterCatalogo({
      config,
      externo,
      mensagem: "Preço não alterado: a tabela de agendamento recusou a escrita.",
      precoAnterior,
      servicoId,
    });
  }

  return {
    mensagem: `"${nome}" gravado: custo e preço actualizados nas duas tabelas.`,
    ok: true,
  };
}

async function reverterCatalogo({
  config,
  externo,
  mensagem,
  precoAnterior,
  servicoId,
}: {
  config: NonNullable<ReturnType<typeof getServicosConfig>>;
  externo: NonNullable<ReturnType<typeof createServicosClient>>;
  mensagem: string;
  precoAnterior: number | null;
  servicoId: string;
}): Promise<GravarServicoResultado> {
  const { error } = await externo
    .from(config.catalogoTable)
    .update({ valor: precoAnterior })
    .eq("id", servicoId);

  if (error) {
    console.error("[servicos] falha a reverter o preço do catálogo", error);

    return {
      mensagem:
        "O preço ficou gravado só no catálogo e não foi possível desfazer. Verifica o serviço na Supabase antes de voltar a gravar.",
      ok: false,
    };
  }

  return { mensagem, ok: false };
}
