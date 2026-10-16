/**
 * Isolamento entre clientes nas escritas de produtos e stock.
 *
 * O risco concreto: `lib/produtos/write.ts` escreve com `createAdminClient()`,
 * que usa a `service_role` e portanto **ignora o RLS**. Não há segunda linha de
 * defesa. Se uma consulta perder o `.eq("cliente_slug", …)`, o Detail passa a
 * poder apagar a receita da Miranda, e nada no Postgres o impede.
 *
 * Por isso os testes aqui não verificam mensagens bonitas: verificam que as
 * linhas da outra empresa continuam exactamente onde estavam.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const A = "empresa_a";
const B = "empresa_b";

// Mesmo id em empresas diferentes nunca acontece na prática (é uuid), mas o
// catálogo de serviços é partilhado por id e as receitas são indexadas por
// (cliente_slug, servico_id, produto_id). Usar ids iguais nos dois lados é o
// que revela um filtro de cliente em falta.
const PRODUTO_A = "produto-a";
const PRODUTO_B = "produto-b";
const SERVICO = "servico-1";

const tenantTables = [
  "lexia_produtos",
  "lexia_produto_movimentos",
  "lexia_servico_produtos",
];

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_produto_movimentos: [],
    lexia_produtos: [
      {
        activo: true,
        cliente_slug: A,
        id: PRODUTO_A,
        nome: "Champô A",
        unidade: "ml",
      },
      {
        activo: true,
        cliente_slug: B,
        id: PRODUTO_B,
        nome: "Champô B",
        unidade: "ml",
      },
    ],
    lexia_servico_produtos: [
      {
        cliente_slug: A,
        produto_id: PRODUTO_A,
        quantidade: 10,
        servico_id: SERVICO,
        servico_nome: "Lavagem",
      },
      {
        cliente_slug: B,
        produto_id: PRODUTO_A,
        quantidade: 99,
        servico_id: SERVICO,
        servico_nome: "Lavagem da outra empresa",
      },
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});
mock.module("@/lib/servicos/config", {
  namedExports: {
    createServicosClient: () =>
      new FakeSupabase({
        catalogo: [{ id: SERVICO, nome: "Lavagem" }],
      }),
    getServicosConfig: (slug: string) =>
      slug === A || slug === B ? { catalogoTable: "catalogo" } : null,
  },
});

const write = await import("@/lib/produtos/write");

function reiniciar() {
  base = new FakeSupabase(estadoInicial());
}

function linhas(tabela: string) {
  return base.linhasDe(tabela);
}

/**
 * A verificação transversal: nenhuma consulta às tabelas do inquilino pode
 * correr sem dizer de que cliente é. Ou traz o filtro, ou traz o slug na linha
 * que grava.
 */
function assertTudoFiltradoPorCliente(slug: string) {
  for (const registo of base.registos) {
    if (!tenantTables.includes(registo.tabela)) {
      continue;
    }

    const temFiltro = registo.filtros.some(
      (filtro) => filtro.coluna === "cliente_slug" && filtro.valor === slug,
    );

    if (temFiltro) {
      continue;
    }

    const payload = (
      Array.isArray(registo.payload) ? registo.payload : [registo.payload]
    ) as Linha[];
    const temSlugNaLinha =
      payload.length > 0 &&
      payload.every((linha) => linha?.cliente_slug === slug);

    assert.ok(
      temSlugNaLinha,
      `${registo.operacao} em ${registo.tabela} correu sem amarrar o cliente ${slug}: ${JSON.stringify(registo)}`,
    );
  }
}

const comum = {
  caminhoParaRevalidar: "/app/produtos",
  userId: "utilizador-1",
};

test("compra num produto de outra empresa é recusada e não cria movimento", async () => {
  reiniciar();

  const resultado = await write.registarCompra({
    ...comum,
    clienteSlug: A,
    custoTotalBruto: "50",
    produtoId: PRODUTO_B,
    quantidadeBruta: "1000",
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.mensagem, "Produto desconhecido.");
  assert.equal(linhas("lexia_produto_movimentos").length, 0);
  assertTudoFiltradoPorCliente(A);
});

test("compra no produto próprio grava o movimento com o slug do cliente", async () => {
  reiniciar();

  const resultado = await write.registarCompra({
    ...comum,
    clienteSlug: A,
    custoTotalBruto: "50",
    produtoId: PRODUTO_A,
    quantidadeBruta: "1000",
  });

  assert.equal(resultado.ok, true);

  const movimentos = linhas("lexia_produto_movimentos");
  assert.equal(movimentos.length, 1);
  assert.equal(movimentos[0].cliente_slug, A);
  assert.equal(movimentos[0].produto_id, PRODUTO_A);
  assert.equal(movimentos[0].tipo, "compra");
  assertTudoFiltradoPorCliente(A);
});

test("ajuste num produto de outra empresa é recusado", async () => {
  reiniciar();

  const resultado = await write.registarAjuste({
    ...comum,
    clienteSlug: A,
    direccao: "saida",
    notaBruta: "",
    produtoId: PRODUTO_B,
    quantidadeBruta: "10",
  });

  assert.equal(resultado.ok, false);
  assert.equal(linhas("lexia_produto_movimentos").length, 0);
  assertTudoFiltradoPorCliente(A);
});

test("excluir um produto de outra empresa não o desactiva nem lhe toca na receita", async () => {
  reiniciar();

  const resultado = await write.excluirProduto({
    ...comum,
    clienteSlug: A,
    produtoId: PRODUTO_B,
  });

  assert.equal(resultado.ok, false);

  const produtoB = linhas("lexia_produtos").find(
    (linha) => linha.id === PRODUTO_B,
  );
  assert.equal(produtoB?.activo, true);
  assert.equal(linhas("lexia_servico_produtos").length, 2);
  assertTudoFiltradoPorCliente(A);
});

test("excluir o produto próprio apaga só as receitas do próprio cliente", async () => {
  reiniciar();

  const resultado = await write.excluirProduto({
    ...comum,
    clienteSlug: A,
    produtoId: PRODUTO_A,
  });

  assert.equal(resultado.ok, true);

  const produtoA = linhas("lexia_produtos").find(
    (linha) => linha.id === PRODUTO_A,
  );
  assert.equal(produtoA?.activo, false);

  // A linha da empresa B tem o mesmo produto_id. Sem o filtro de cliente no
  // delete, desaparecia aqui — e o stock dela passava a drenar em silêncio.
  const receitas = linhas("lexia_servico_produtos");
  assert.equal(receitas.length, 1);
  assert.equal(receitas[0].cliente_slug, B);
  assert.equal(receitas[0].quantidade, 99);
  assertTudoFiltradoPorCliente(A);
});

test("repor um produto de outra empresa é recusado", async () => {
  reiniciar();
  const produtoB = linhas("lexia_produtos").find(
    (linha) => linha.id === PRODUTO_B,
  )!;
  produtoB.activo = false;

  const resultado = await write.reporProduto({
    ...comum,
    clienteSlug: A,
    produtoId: PRODUTO_B,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.mensagem, "Produto desconhecido.");
  assert.equal(produtoB.activo, false);
  assertTudoFiltradoPorCliente(A);
});

test("definir receita com produto de outra empresa é recusado", async () => {
  reiniciar();

  const resultado = await write.definirReceita({
    ...comum,
    clienteSlug: A,
    produtoId: PRODUTO_B,
    quantidadeBruta: "5",
    servicoId: SERVICO,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.mensagem, "Produto desconhecido.");
  assertTudoFiltradoPorCliente(A);
});

test("definir receita recusa um produto excluído", async () => {
  reiniciar();
  const produtoA = linhas("lexia_produtos").find(
    (linha) => linha.id === PRODUTO_A,
  )!;
  produtoA.activo = false;

  const resultado = await write.definirReceita({
    ...comum,
    clienteSlug: A,
    produtoId: PRODUTO_A,
    quantidadeBruta: "5",
    servicoId: SERVICO,
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /excluído/);
});

test("registar execução desconta só a receita do próprio cliente", async () => {
  reiniciar();

  const resultado = await write.registarExecucao({
    ...comum,
    clienteSlug: A,
    servicoId: SERVICO,
  });

  assert.equal(resultado.ok, true);

  const movimentos = linhas("lexia_produto_movimentos");

  // A empresa B tem uma linha de receita para o mesmo serviço. Se a leitura
  // não filtrasse por cliente, saíam aqui dois consumos em vez de um.
  assert.equal(movimentos.length, 1);
  assert.equal(movimentos[0].cliente_slug, A);
  assert.equal(movimentos[0].quantidade, -10);
  assertTudoFiltradoPorCliente(A);
});
