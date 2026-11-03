import { revalidatePath } from "next/cache";

import {
  createServicosClient,
  getServicosConfig,
  normalizarNomeServico,
  toNumber,
} from "@/lib/servicos/config";
import { mensagemCom, type TextoDaMensagem } from "@/lib/catalogo/mensagem";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gravação do painel de serviços.
 *
 * Escreve em duas bases de dados diferentes:
 *   - notas do serviço  -> Supabase CENTRAL da Lexia
 *   - preço             -> Supabase DO CLIENTE, nas DUAS tabelas
 *
 * O custo de produto NÃO se escreve aqui: sai da receita (`lib/produtos`)
 * multiplicada pelo custo da última compra, e muda sozinho quando o dono volta
 * a comprar. Um número escrito à mão ficava velho sem ninguém dar por isso.
 *
 * A autorização é deliberadamente deixada a quem chama. As server actions do
 * cliente e do admin validam o perfil de maneiras diferentes (uma tira o slug
 * do perfil, a outra do selector) e é lá que a decisão tem de estar.
 */

export type GravarServicoResultado = {
  /** Já em pt-BR; a server action traduz com `texto` antes de a mostrar. */
  mensagem: string;
  ok: boolean;
  texto?: TextoDaMensagem;
};

const limiteValor = 1_000_000;

/**
 * Valida o preço. Os erros já são a mensagem inteira que vai para o ecrã
 * (e a chave da tradução): juntar um pedaço traduzido a outro partia a ordem
 * das palavras noutras línguas.
 */
function validarPreco(bruto: string) {
  const normalizado = bruto.trim().replace(",", ".");

  if (normalizado === "") {
    return { erro: "Notas salvas, mas o preço não: preencha o preço.", valor: null };
  }

  const valor = Number(normalizado);

  if (!Number.isFinite(valor) || valor < 0) {
    return {
      erro: "Notas salvas, mas o preço não: tem de ser um número igual ou maior que zero.",
      valor: null,
    };
  }

  if (valor > limiteValor) {
    return {
      erro: "Notas salvas, mas o preço não: está fora do intervalo aceitável.",
      valor: null,
    };
  }

  return { erro: null, valor: Math.round(valor * 100) / 100 };
}

export async function gravarPrecoENotas({
  caminhoParaRevalidar,
  clienteSlug,
  notasBruto,
  precoBruto,
  servicoId,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
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
      mensagem: "Credenciais do banco de dados do cliente não configuradas.",
      ok: false,
    };
  }

  const notas = notasBruto.trim();

  if (notas.length > 2000) {
    return { mensagem: "As notas estão longas demais.", ok: false };
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

  const { error: erroNotas } = await admin.from("lexia_servico_custos").upsert(
    {
      actualizado_em: new Date().toISOString(),
      actualizado_por: userId,
      cliente_slug: clienteSlug,
      notas: notas === "" ? null : notas,
      servico_id: servicoId,
      servico_nome: servico.nome,
    },
    { onConflict: "cliente_slug,servico_id" },
  );

  if (erroNotas) {
    console.error("[servicos] falha a gravar as notas do serviço", erroNotas);

    return { mensagem: "Não foi possível salvar as notas.", ok: false };
  }

  const precoPedido = precoBruto.trim();

  if (precoPedido === "") {
    revalidatePath(caminhoParaRevalidar);

    return {
      ...mensagemCom('Notas de "{nome}" salvas.', { nome: String(servico.nome) }),
      ok: true,
    };
  }

  const preco = validarPreco(precoPedido);

  if (preco.erro || preco.valor === null) {
    return {
      mensagem: preco.erro ?? "Notas salvas, mas o preço não foi alterado.",
      ok: false,
    };
  }

  const precoAnterior = toNumber(servico.valor as number | string | null);

  if (precoAnterior !== null && precoAnterior === preco.valor) {
    revalidatePath(caminhoParaRevalidar);

    return {
      ...mensagemCom('Notas de "{nome}" salvas.', { nome: String(servico.nome) }),
      ok: true,
    };
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
 * Excluir um serviço: `activo = false` nas duas tabelas do cliente.
 *
 * Nunca é um `delete`. A linha do catálogo é a fonte de venda do agente e está
 * referida por `lexia_servico_produtos` e pelo histórico de consumos em
 * `lexia_produto_movimentos`; apagá-la era irreversível e deixava o histórico
 * a apontar para o nada.
 *
 * Medido a 15/10/2026 nos workflows do n8n: os três workflows activos que leem
 * estas tabelas filtram todos `activo = true` (`Cérebro — Detail By Cordeiro
 * V2`, `verificar_disponibilidade` e `criar_marcacao`). Logo `activo = false`
 * tira o serviço do que o agente vende e do que o agendamento aceita, de
 * imediato.
 *
 * **A ordem das duas escritas é deliberada e não se inverte.** O catálogo é
 * desactivado primeiro. Se a segunda escrita falhar, fica um serviço que o
 * agente já não vende mas que o agendamento ainda aceitaria — inofensivo,
 * porque ninguém chega ao agendamento sem passar pela venda. Ao contrário: se
 * o agendamento fosse desactivado primeiro e o catálogo falhasse, o agente
 * continuava a vender um serviço que já não se consegue marcar, e o cliente
 * ouvia "sim" e ficava sem marcação. Por isso aqui não se reverte nada — a
 * reversão é que seria o estado perigoso.
 */
export async function excluirServico({
  caminhoParaRevalidar,
  clienteSlug,
  servicoId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  servicoId: string;
}): Promise<GravarServicoResultado> {
  return await definirEstadoDoServico({
    activo: false,
    caminhoParaRevalidar,
    clienteSlug,
    servicoId,
  });
}

/**
 * Repor um serviço excluído. Volta a aparecer no painel, volta a ser vendido
 * pelo agente e volta a ser marcável — com a receita de produtos que tinha,
 * porque excluir o serviço não lhe apaga a receita.
 */
export async function reporServico({
  caminhoParaRevalidar,
  clienteSlug,
  servicoId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  servicoId: string;
}): Promise<GravarServicoResultado> {
  return await definirEstadoDoServico({
    activo: true,
    caminhoParaRevalidar,
    clienteSlug,
    servicoId,
  });
}

async function definirEstadoDoServico({
  activo,
  caminhoParaRevalidar,
  clienteSlug,
  servicoId,
}: {
  activo: boolean;
  caminhoParaRevalidar: string;
  clienteSlug: string;
  servicoId: string;
}): Promise<GravarServicoResultado> {
  const config = getServicosConfig(clienteSlug);

  if (!config) {
    return { mensagem: "Este cliente não tem painel de serviços.", ok: false };
  }

  const externo = createServicosClient(config);

  if (!externo) {
    return {
      mensagem: "Credenciais do banco de dados do cliente não configuradas.",
      ok: false,
    };
  }

  // Esta leitura é a autorização sobre o `servicoId` que veio do formulário: se
  // o id não for um serviço desta empresa, não aparece aqui.
  const { data: servico, error: erroServico } = await externo
    .from(config.catalogoTable)
    .select("id, nome")
    .eq("id", servicoId)
    .maybeSingle();

  if (erroServico) {
    console.error("[servicos] falha a ler o serviço antes de mudar o estado", erroServico);

    return { mensagem: "Não foi possível ler o serviço.", ok: false };
  }

  if (!servico?.nome) {
    return { mensagem: "Serviço desconhecido.", ok: false };
  }

  const nome = String(servico.nome);

  const { error: erroCatalogo } = await externo
    .from(config.catalogoTable)
    .update({ activo })
    .eq("id", servicoId);

  if (erroCatalogo) {
    console.error("[servicos] falha a mudar o estado no catálogo", erroCatalogo);

    return {
      ...mensagemCom(
        activo
          ? '"{nome}" não foi restaurado: o catálogo recusou a gravação.'
          : '"{nome}" não foi excluído: o catálogo recusou a gravação.',
        { nome },
      ),
      ok: false,
    };
  }

  // A ligação entre as duas tabelas é o nome: não há chave comum.
  const { data: operacionais, error: erroLeitura } = await externo
    .from(config.agendamentoTable)
    .select("id, nome");

  if (erroLeitura) {
    console.error("[servicos] falha a ler a tabela operacional", erroLeitura);

    revalidatePath(caminhoParaRevalidar);

    return {
      ...mensagemCom(
        activo
          ? '"{nome}" foi restaurado no catálogo, mas não foi possível confirmar a linha de agendamento. Verifique {tabela} no Supabase.'
          : '"{nome}" foi excluído no catálogo, mas não foi possível confirmar a linha de agendamento. Verifique {tabela} no Supabase.',
        { nome, tabela: config.agendamentoTable },
      ),
      ok: false,
    };
  }

  const alvo = (operacionais ?? []).find(
    (linha) =>
      typeof linha.nome === "string" &&
      normalizarNomeServico(linha.nome) === normalizarNomeServico(nome),
  );

  if (!alvo) {
    revalidatePath(caminhoParaRevalidar);

    return {
      ...mensagemCom(
        activo
          ? '"{nome}" restaurado. Não tinha linha em {tabela}, por isso só o catálogo mudou.'
          : '"{nome}" excluído. Não tinha linha em {tabela}, por isso só o catálogo mudou.',
        { nome, tabela: config.agendamentoTable },
      ),
      ok: true,
    };
  }

  const { error: erroOperacional } = await externo
    .from(config.agendamentoTable)
    .update({ activo })
    .eq("id", alvo.id);

  revalidatePath(caminhoParaRevalidar);

  if (erroOperacional) {
    console.error(
      "[servicos] falha a mudar o estado no operacional",
      erroOperacional,
    );

    return {
      ...mensagemCom(
        activo
          ? '"{nome}" foi restaurado no catálogo, mas a tabela de agendamento recusou a gravação. Verifique {tabela} no Supabase.'
          : '"{nome}" foi excluído no catálogo, mas a tabela de agendamento recusou a gravação. Verifique {tabela} no Supabase.',
        { nome, tabela: config.agendamentoTable },
      ),
      ok: false,
    };
  }

  return {
    ...mensagemCom(
      activo
        ? '"{nome}" restaurado: volta a ser vendido pelo agente e a aceitar agendamentos.'
        : '"{nome}" excluído: sai do painel e o agente deixa de vendê-lo. Você pode restaurá-lo logo abaixo.',
      { nome },
    ),
    ok: true,
  };
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
      mensagem: "Notas salvas, mas o preço não foi alterado.",
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
      mensagem: 'Preço não alterado: "{nome}" não tem linha em {tabela}, e mudar só o catálogo faria o agente vender um preço que o agendamento não cobra.',
      precoAnterior,
      variaveis: { nome, tabela: config.agendamentoTable },
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
      mensagem: "Preço não alterado: a tabela de agendamento recusou a gravação.",
      precoAnterior,
      servicoId,
    });
  }

  return {
    ...mensagemCom('"{nome}" salvo: preço atualizado nas duas tabelas do cliente.', {
      nome,
    }),
    ok: true,
  };
}

async function reverterCatalogo({
  config,
  externo,
  mensagem,
  precoAnterior,
  servicoId,
  variaveis,
}: {
  config: NonNullable<ReturnType<typeof getServicosConfig>>;
  externo: NonNullable<ReturnType<typeof createServicosClient>>;
  mensagem: string;
  precoAnterior: number | null;
  servicoId: string;
  /** Quando a `mensagem` é uma chave com `{nome}` e afins. */
  variaveis?: Record<string, string>;
}): Promise<GravarServicoResultado> {
  const { error } = await externo
    .from(config.catalogoTable)
    .update({ valor: precoAnterior })
    .eq("id", servicoId);

  if (error) {
    console.error("[servicos] falha a reverter o preço do catálogo", error);

    return {
      mensagem:
        "O preço ficou salvo só no catálogo e não foi possível desfazer. Verifique o serviço no Supabase antes de salvar de novo.",
      ok: false,
    };
  }

  return variaveis
    ? { ...mensagemCom(mensagem, variaveis), ok: false }
    : { mensagem, ok: false };
}
