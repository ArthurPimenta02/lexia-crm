/**
 * Registar um serviço num cliente que já está no painel.
 *
 * Este é o caso normal, e não o raro. O Martim também trata do CRM, e um
 * cliente com ficha é precisamente o que volta para fazer mais um serviço —
 * deixar isto só no formulário de criar obrigava-o a inventar um contacto
 * repetido para registar uma venda a sério.
 *
 * O que estes testes guardam são três coisas que, se cederem, estragam o
 * total gasto sem dar nas vistas:
 *
 * 1. A repetição é avisada antes de ser escrita. Carregar duas vezes no botão
 *    escreve a mesma venda duas vezes e o total passa a mentir — e um número
 *    errado continua a parecer um número. A primeira submissão devolve a
 *    lista do que já lá está; só a segunda escreve.
 * 2. O telefone, o nome e a viatura vêm da ficha lida no servidor, nunca do
 *    formulário. Um telefone vindo do navegador escrevia a venda no histórico
 *    de outra pessoa.
 * 3. O `contactoId` é autorizado pelo `cliente_slug`. É a `service_role` a
 *    escrever, que ignora o RLS: o filtro do cliente é a única coisa entre
 *    uma empresa e a agenda da outra.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const SLUG = "detail_by_cordeiro";
const OUTRO_SLUG = "miranda_skin_experts";
const SERVICO_ID = "servico-1";
const CATALOGO = "servicos_detail_by_cordeiro";
const CONTACTO_ID = "contacto-1";
const TELEFONE = "351912345678";

function contactoBase(): Linha {
  return {
    cliente_slug: SLUG,
    id: CONTACTO_ID,
    nome: "Martim Teste",
    telefone: TELEFONE,
    viatura: "BMW Série 3",
  };
}

let central = new FakeSupabase({ lexia_contactos: [contactoBase()] });
let doCliente = new FakeSupabase({
  [CATALOGO]: [{ id: SERVICO_ID, nome: "Lavagem Premium" }],
  marcacoes: [],
});

const configReal = await import("@/lib/servicos/config");

// A ficha passou a saber de que anúncio veio a pessoa, e essa leitura é
// "server-only". Sem isto o módulo recusa-se a carregar fora do Next.
mock.module("server-only", { namedExports: {} });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => central },
});
mock.module("@/lib/servicos/config", {
  namedExports: { ...configReal, createServicosClient: () => doCliente },
});

const write = await import("@/lib/clientes/write");

/** Um dia que já passou, para não depender da data em que o teste corre. */
function ontem() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function marcacoes() {
  return doCliente.linhasDe("marcacoes");
}

function reiniciar(opcoes: { contacto?: Linha; marcacoes?: Linha[] } = {}) {
  central = new FakeSupabase({
    lexia_contactos: [opcoes.contacto ?? contactoBase()],
  });
  doCliente = new FakeSupabase({
    [CATALOGO]: [{ id: SERVICO_ID, nome: "Lavagem Premium" }],
    marcacoes: opcoes.marcacoes ?? [],
  });
}

const comum = {
  caminhoParaRevalidar: "/app/clientes",
  clienteSlug: SLUG,
  confirmado: false,
  contactoId: CONTACTO_ID,
  servico: {
    dataBruto: ontem(),
    executorBruto: "roberto",
    servicoIdBruto: SERVICO_ID,
    valorBruto: "240",
  },
};

/** Uma venda que já está na agenda, no nome do mesmo número. */
function marcacaoAntiga(telefone = TELEFONE): Linha {
  return {
    cliente_slug: SLUG,
    data_inicio: "2026-09-01T11:00:00.000Z",
    estado: "confirmada",
    id: "marcacao-antiga",
    servico: "Polimento",
    sinal_valor: null,
    telefone,
    valor_previsto: 300,
  };
}

test("um cliente sem histórico recebe o serviço à primeira", async () => {
  reiniciar();

  const resultado = await write.registarServicoDeCliente(comum);

  assert.equal(resultado.ok, true, resultado.mensagem);
  assert.equal(marcacoes().length, 1);

  const linha = marcacoes()[0] as Linha;

  assert.equal(linha.servico, "Lavagem Premium");
  assert.equal(linha.valor_previsto, 240);
  assert.equal(linha.executor, "roberto");
  assert.equal(linha.tipo, "servico");
  assert.equal(linha.estado, "confirmada");
  assert.equal(linha.cliente_slug, SLUG);

  // Da ficha, não do formulário: é o que liga a venda a esta pessoa.
  assert.equal(linha.telefone, TELEFONE);
  assert.equal(linha.nome_cliente, "Martim Teste");
  assert.equal(linha.viatura, "BMW Série 3");
});

/**
 * O teste que interessa mais. Sem esta paragem, o segundo clique duplica a
 * venda e o total gasto deixa de ser verdade.
 */
test("quem já tem serviços é avisado antes de se escrever mais um", async () => {
  reiniciar({ marcacoes: [marcacaoAntiga()] });

  const resultado = await write.registarServicoDeCliente(comum);

  assert.equal(resultado.ok, false);
  assert.equal(
    marcacoes().length,
    1,
    "o aviso escreveu na agenda em vez de parar",
  );
  assert.equal(resultado.jaRegistados?.length, 1);
  assert.equal(resultado.jaRegistados?.[0]?.nome, "Polimento");
  assert.equal(resultado.jaRegistados?.[0]?.valor, 300);
});

test("depois do aviso, confirmar escreve mesmo", async () => {
  reiniciar({ marcacoes: [marcacaoAntiga()] });

  const resultado = await write.registarServicoDeCliente({
    ...comum,
    confirmado: true,
  });

  assert.equal(resultado.ok, true, resultado.mensagem);
  assert.equal(marcacoes().length, 2);
});

/**
 * O aviso tem de reconhecer o mesmo número escrito de outra maneira. São duas
 * bases sem chave estrangeira e o telefone vem escrito à mão nas duas: um
 * `.eq("telefone", …)` deixava passar exactamente as linhas que importa
 * apanhar, e o aviso não aparecia.
 */
test("o mesmo número noutro formato continua a ser o mesmo cliente", async () => {
  reiniciar({ marcacoes: [marcacaoAntiga("+351 912 345 678")] });

  const resultado = await write.registarServicoDeCliente(comum);

  assert.equal(resultado.ok, false);
  assert.equal(resultado.jaRegistados?.length, 1);
});

test("o histórico de outro número não dispara o aviso", async () => {
  reiniciar({ marcacoes: [marcacaoAntiga("351999888777")] });

  const resultado = await write.registarServicoDeCliente(comum);

  assert.equal(resultado.ok, true, resultado.mensagem);
  assert.equal(marcacoes().length, 2);
});

/**
 * A `service_role` ignora o RLS. O `.eq("cliente_slug", …)` na leitura da
 * ficha é a única coisa que impede uma empresa de escrever na agenda da outra.
 */
test("um contacto de outra empresa não se encontra", async () => {
  reiniciar({ contacto: { ...contactoBase(), cliente_slug: OUTRO_SLUG } });

  const resultado = await write.registarServicoDeCliente(comum);

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /não encontrado/i);
  assert.equal(marcacoes().length, 0);
});

test("uma ficha sem número a sério não regista nada", async () => {
  reiniciar({ contacto: { ...contactoBase(), telefone: null } });

  const resultado = await write.registarServicoDeCliente(comum);

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /telefone/i);
  assert.equal(marcacoes().length, 0);
});

/**
 * No formulário de criar o bloco do serviço é opcional — nem toda a gente que
 * entra no painel já comprou. Aqui não é: o formulário existe só para isto, e
 * responder "feito" sem escrever nada era mentir ao dono.
 */
test("o formulário vazio é um engano e diz-se que é", async () => {
  reiniciar();

  const resultado = await write.registarServicoDeCliente({
    ...comum,
    servico: {
      dataBruto: "",
      executorBruto: "",
      servicoIdBruto: "",
      valorBruto: "",
    },
  });

  assert.equal(resultado.ok, false);
  assert.equal(marcacoes().length, 0);
});

/**
 * A mesma regra do formulário de criar, e pela mesma razão medida na API do
 * n8n a 2026-10-16: o `AGENTE DE LEMBRETES — DETAIL BY CORDEIRO` está activo e
 * manda uma mensagem 24h antes de qualquer marcação futura. Uma linha escrita
 * aqui não tem evento no Google Calendar.
 */
test("uma data no futuro é recusada também na ficha", async () => {
  reiniciar();

  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const resultado = await write.registarServicoDeCliente({
    ...comum,
    servico: { ...comum.servico, dataBruto: amanha },
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /futuro/i);
  assert.equal(marcacoes().length, 0);
});

test("um serviço que não é do catálogo desta empresa é recusado", async () => {
  reiniciar();

  const resultado = await write.registarServicoDeCliente({
    ...comum,
    servico: { ...comum.servico, servicoIdBruto: "servico-de-outra-empresa" },
  });

  assert.equal(resultado.ok, false);
  assert.equal(marcacoes().length, 0);
});

/**
 * Se não se consegue ler o que o cliente já comprou, não se escreve. Tratar a
 * falha de leitura como "nunca comprou nada" era responder a uma pergunta que
 * ninguém respondeu — e logo a seguir escrever sem aviso nenhum, que é
 * exactamente o caso que o aviso existe para apanhar.
 */
test("se o histórico não se consegue ler, não se escreve às cegas", async () => {
  reiniciar({ marcacoes: [marcacaoAntiga()] });
  doCliente.falharEm("select", "marcacoes", "ligação perdida");

  const resultado = await write.registarServicoDeCliente(comum);

  assert.equal(resultado.ok, false);
  assert.equal(marcacoes().length, 1, "escreveu sem saber o que já lá estava");
});

test("se a agenda recusar a escrita, o dono fica a saber", async () => {
  reiniciar();
  doCliente.falharEm("insert", "marcacoes", "sem permissão");

  const resultado = await write.registarServicoDeCliente(comum);

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /não foi registado/i);
  assert.equal(marcacoes().length, 0);
});
