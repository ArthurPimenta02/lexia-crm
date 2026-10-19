/**
 * A aba Serviços de um cliente que só tem a tabela de agendamento.
 *
 * O Detail tem duas tabelas — um catálogo de venda com custos e um operacional
 * com durações — e a aba Serviços foi escrita para esse par. A Miranda tem uma
 * tabela só: o que ela vende e o que ela marca é a mesma linha. Antes disto, a
 * aba dela dizia "este cliente ainda não tem catálogo de serviços ligado ao
 * painel" com 25 serviços vivos na base dela.
 *
 * O que estes testes guardam, e que falha em silêncio se ceder:
 *
 * 1. **A coluna do activo é `ativo` nela e `activo` no Detail.** Filtrar pela
 *    errada devolve erro da Supabase, e o painel transforma isso numa lista
 *    vazia — exactamente o ecrã que se estava a corrigir.
 * 2. **Ela não tem escalões de viatura.** A lista vazia é o que apaga a caixa
 *    "Escalão de viatura" do topo do ecrã; se vier com um escalão qualquer, a
 *    caixa volta e uma clínica de estética fica a escolher tipo de carro.
 * 3. **Não se deixa editar.** As escritas desta aba assumem as colunas do
 *    Detail (`valor`, `ordem`, `descricao_curta`). Correr contra a tabela dela
 *    dava erro — ou, pior, escrevia metade. O `somenteLeitura` é o que desliga
 *    os botões, nas duas páginas que montam o painel.
 * 4. **A margem fica vazia e não a zero.** Ela não tem coluna de custo. Um
 *    zero aqui lia-se como "este serviço não gasta nada", que é uma margem de
 *    100% inventada.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mts";

const SLUG = "miranda_skin_experts";
const TABELA = "servicos_miranda";

/**
 * Três linhas como estão na tabela real dela, lidas a 2026-10-19. O `activo`
 * a mais traz o valor contrário ao do `ativo`, para que um filtro pela coluna
 * do Detail se veja aqui em vez de passar sem se notar.
 */
function servicosBase(): Linha[] {
  return [
    {
      activo: false,
      ativo: true,
      categoria: "facial",
      descricao: "Limpeza profunda com extracção.",
      duracao_agenda_min: 90,
      id: "3",
      nome: "Limpeza de Pele Profunda",
      preco: 120,
      precos_variantes: null,
      prioridade_recomendacao: 2,
      profissional: "Samuel",
      tipo_preco: "fixo",
    },
    {
      activo: false,
      ativo: true,
      categoria: "injetavel",
      descricao: "Toxina botulínica.",
      duracao_agenda_min: 30,
      id: "9",
      nome: "Botox",
      preco: 450,
      precos_variantes: null,
      prioridade_recomendacao: 2,
      profissional: "Bruna",
      tipo_preco: "fixo",
    },
    {
      activo: false,
      ativo: true,
      categoria: "avaliacao",
      descricao: "Primeira consulta.",
      duracao_agenda_min: 45,
      id: "1",
      nome: "Consulta de Avaliação",
      preco: 40,
      precos_variantes: null,
      prioridade_recomendacao: 1,
      profissional: "Samuel",
      tipo_preco: "fixo",
    },
    // A única linha dela com `precos_variantes`. Está aqui porque é o que faz
    // aparecer a caixa "Outros preços deste serviço" — e essa caixa tinha uma
    // dica que falava de viaturas.
    {
      activo: false,
      ativo: true,
      categoria: "corporal",
      descricao: "Massagem de corpo inteiro.",
      duracao_agenda_min: 60,
      id: "15",
      nome: "Massagem Relaxante",
      preco: 90,
      precos_variantes: { estendida: 120, padrao: 90 },
      prioridade_recomendacao: 3,
      profissional: "Samuel",
      tipo_preco: "a_partir",
    },
  ];
}

let doCliente = new FakeSupabase({ [TABELA]: servicosBase() });

const configReal = await import("@/lib/servicos/config");

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/servicos/config", {
  namedExports: { ...configReal, createServicosClient: () => doCliente },
});

const { escalaoBase, getPainelServicos } = await import("@/lib/servicos/read");
const { ServicosPanel } = await import("@/app/components/servicos-panel");

function reiniciar(servicos?: Linha[]) {
  doCliente = new FakeSupabase({ [TABELA]: servicos ?? servicosBase() });
}

/**
 * O HTML do painel, como sai do servidor.
 *
 * Desenha-se a sério em vez de se afirmar sobre os dados: a caixa do escalão
 * de viatura é uma condição dentro do JSX, e nenhuma asserção sobre o
 * `painel.escaloes` repara se essa condição desaparecer.
 */
async function desenhar(clienteSlug: string) {
  const naoFaz = (async () => ({})) as never;
  const painel = await getPainelServicos({ clienteSlug });

  return renderToStaticMarkup(
    createElement(ServicosPanel, {
      action: naoFaz,
      actionExcluir: naoFaz,
      actionExecucao: naoFaz,
      actionReceita: naoFaz,
      actionRepor: naoFaz,
      basePath: "/app/servicos",
      painel,
      podeEditar: !painel.somenteLeitura,
    }),
  );
}

test("os serviços dela aparecem na aba, em vez da mensagem de vazio", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: SLUG });

  assert.equal(painel.configurado, true);
  assert.equal(painel.vazioMotivo, null);
  assert.equal(painel.servicos.length, 4);
  assert.equal(painel.moeda, "USD");
});

test("a leitura filtra pela coluna `ativo` dela, não pela do Detail", async () => {
  reiniciar();

  await getPainelServicos({ clienteSlug: SLUG });

  const leitura = doCliente.registos.find(
    (registo) => registo.tabela === TABELA && registo.operacao === "select",
  );

  assert.ok(leitura);
  assert.deepEqual(leitura.filtros, [{ coluna: "ativo", valor: true }]);
});

test("pede as colunas do catálogo dela e as do agendamento, sem repetir", async () => {
  reiniciar();

  await getPainelServicos({ clienteSlug: SLUG });

  const leitura = doCliente.registos.find(
    (registo) => registo.tabela === TABELA && registo.operacao === "select",
  );
  const pedidas = String(leitura?.colunas ?? "").split(", ");

  for (const coluna of [
    "id",
    "nome",
    "preco",
    "ativo",
    "profissional",
    "duracao_agenda_min",
    "categoria",
    "descricao",
    "prioridade_recomendacao",
    "precos_variantes",
    "tipo_preco",
  ]) {
    assert.ok(pedidas.includes(coluna), `falta a coluna ${coluna}`);
  }

  assert.equal(new Set(pedidas).size, pedidas.length);
});

test("um serviço desligado não entra na aba", async () => {
  const servicos = servicosBase();
  servicos[0].ativo = false;
  reiniciar(servicos);

  const painel = await getPainelServicos({ clienteSlug: SLUG });

  assert.deepEqual(
    painel.servicos.map((servico) => servico.nome),
    ["Consulta de Avaliação", "Botox", "Massagem Relaxante"],
  );
});

test("não há escalões de viatura — é o que apaga a caixa do topo", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: SLUG });

  assert.deepEqual(painel.escaloes, []);
});

test("o painel dela é só de leitura", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: SLUG });

  assert.equal(painel.somenteLeitura, true);
});

test("um cliente sem tabela nenhuma continua a ver a mensagem de vazio", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: "cliente_que_nao_ha" });

  assert.equal(painel.configurado, false);
  assert.equal(painel.servicos.length, 0);
  assert.match(painel.vazioMotivo ?? "", /ainda não tem catálogo/);
  // Sem isto, a página de admin desligava os botões de todos os clientes que
  // ainda não estão ligados — incluindo o Detail no dia em que a leitura dele
  // falhasse.
  assert.equal(painel.somenteLeitura, false);
});

test("cada serviço mostra as duas pessoas, e só uma é que executa", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: SLUG });
  const botox = painel.servicos.find((servico) => servico.nome === "Botox");

  assert.deepEqual(
    botox?.executores.map((pessoa) => ({
      duracaoMinutos: pessoa.duracaoMinutos,
      executa: pessoa.executa,
      nome: pessoa.nome,
    })),
    [
      { duracaoMinutos: null, executa: false, nome: "Samuel" },
      { duracaoMinutos: 30, executa: true, nome: "Bruna" },
    ],
  );
});

test("o valor por hora é o preço dividido pelas horas da marcação", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: SLUG });
  const botox = painel.servicos.find((servico) => servico.nome === "Botox");
  const bruna = botox?.executores.find((pessoa) => pessoa.nome === "Bruna");
  const samuel = botox?.executores.find((pessoa) => pessoa.nome === "Samuel");

  // 450 em meia hora dá 900 por hora.
  assert.equal(bruna?.euroPorHora, 900);
  // Quem não faz o serviço não tem valor por hora: um zero aqui lia-se como
  // "o Samuel faz isto de graça".
  assert.equal(samuel?.euroPorHora, null);
});

test("a ordem é a da prioridade dela, e o empate desfaz-se pelo nome", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: SLUG });

  assert.deepEqual(
    painel.servicos.map((servico) => servico.nome),
    [
      "Consulta de Avaliação",
      "Botox",
      "Limpeza de Pele Profunda",
      "Massagem Relaxante",
    ],
  );
});

test("a margem fica vazia, porque ela não tem coluna de custo", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: SLUG });
  const [primeiro] = painel.servicos;

  assert.equal(primeiro.custoProduto, null);
  assert.equal(primeiro.margem, null);
  assert.equal(primeiro.margemPercent, null);
  assert.deepEqual(primeiro.receita, []);
});

test("a categoria, a descrição e o tipo de preço dela chegam ao ecrã", async () => {
  reiniciar();

  const painel = await getPainelServicos({ clienteSlug: SLUG });
  const limpeza = painel.servicos.find(
    (servico) => servico.nome === "Limpeza de Pele Profunda",
  );

  assert.equal(limpeza?.categoria, "facial");
  assert.equal(limpeza?.descricaoCurta, "Limpeza profunda com extracção.");
  assert.equal(limpeza?.tipoPreco, "fixo");
  assert.equal(limpeza?.preco, 120);
});

test("um serviço sob avaliação aparece sem preço em vez de desaparecer", async () => {
  const servicos = servicosBase();
  servicos[0].preco = null;
  servicos[0].tipo_preco = "sob_avaliacao";
  reiniciar(servicos);

  const painel = await getPainelServicos({ clienteSlug: SLUG });
  const limpeza = painel.servicos.find(
    (servico) => servico.nome === "Limpeza de Pele Profunda",
  );

  assert.ok(limpeza);
  assert.equal(limpeza.preco, null);
  assert.equal(limpeza.tipoPreco, "sob_avaliacao");
  assert.equal(
    limpeza.executores.find((pessoa) => pessoa.nome === "Samuel")?.euroPorHora,
    null,
  );
});

test("o ecrã dela não fala de viaturas em sítio nenhum", async () => {
  reiniciar();

  const html = await desenhar(SLUG);

  assert.doesNotMatch(html, /viatura/i);
  assert.doesNotMatch(html, /Escalão/i);
  // E mostra mesmo os tratamentos — senão este teste passava com o ecrã vazio
  // que se estava a corrigir.
  assert.match(html, /Limpeza de Pele Profunda/);
  // Com a caixa dos outros preços desenhada: é lá que estava a dica a dizer
  // que os preços "não variam com a viatura".
  assert.match(html, /Outros preços deste serviço/);
  assert.match(html, /Estendida/);
});

test("no ecrã dela não há nada para gravar nem para excluir", async () => {
  reiniciar();

  const html = await desenhar(SLUG);

  // As escritas desta aba assumem as colunas do Detail. Na tabela dela davam
  // erro, ou escreviam metade — por isso não há por onde as disparar.
  assert.doesNotMatch(html, /Guardar/i);
  assert.doesNotMatch(html, /Excluir/i);
  assert.doesNotMatch(html, /Repor/i);
  assert.doesNotMatch(html, /Registar execução/i);
  // Nenhum botão que submeta: os que sobram são as dicas de ajuda, que são
  // `type="button"` e não disparam nada.
  assert.doesNotMatch(html, /type="submit"/);
  // O campo do preço continua a mostrar o número, mas trancado.
  assert.match(html, /name="preco"[^>]*value="40"/);
  // Dois campos trancados por serviço, nos quatro serviços.
  assert.equal((html.match(/disabled=""/g) ?? []).length, 8);
});

test("com escalões a caixa de viatura continua lá — é o ecrã do Detail", async () => {
  reiniciar();

  const naoFaz = (async () => ({})) as never;
  const base = await getPainelServicos({ clienteSlug: SLUG });
  const html = renderToStaticMarkup(
    createElement(ServicosPanel, {
      action: naoFaz,
      actionExcluir: naoFaz,
      actionExecucao: naoFaz,
      actionReceita: naoFaz,
      actionRepor: naoFaz,
      basePath: "/app/servicos",
      painel: {
        ...base,
        escalaoActivo: escalaoBase,
        escaloes: [{ chave: "citadino", label: "Citadino" }],
      },
      podeEditar: false,
    }),
  );

  assert.match(html, /Escalão de viatura/);
  assert.match(html, /Citadino/);
});

test("se a leitura falhar, a aba diz isso e não finge que não há serviços", async () => {
  reiniciar();
  doCliente.falharEm("select", TABELA, "coluna inexistente");

  const painel = await getPainelServicos({ clienteSlug: SLUG });

  assert.equal(painel.servicos.length, 0);
  assert.match(painel.vazioMotivo ?? "", /Não foi possível/);
  assert.equal(painel.somenteLeitura, true);
});
