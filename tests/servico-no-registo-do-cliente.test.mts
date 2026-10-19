/**
 * O serviço que o dono regista quando mete um cliente no painel à mão.
 *
 * O que estes testes existem para proteger é a decisão de onde o número vive.
 * O ticket não é uma coluna da ficha: é uma linha em `marcacoes`, na base do
 * PRÓPRIO cliente, que é de onde o histórico e o total gasto já saem. Se
 * alguém o mudar para uma coluna de `lexia_contactos`, passa a haver dois
 * totais a discordar um do outro e nenhum deles explicável.
 *
 * O segundo invariante é a data. Medido na API do n8n a 2026-10-16: o
 * workflow `AGENTE DE LEMBRETES — DETAIL BY CORDEIRO` está activo e manda uma
 * mensagem ao cliente 24h antes de qualquer linha de `marcacoes` com
 * `cliente_slug = detail_by_cordeiro`. As marcações do agente nascem com um
 * evento no Google Calendar; uma linha escrita aqui não nasce. Uma data futura
 * aceite neste formulário era um lembrete enviado a um cliente para uma hora
 * que não está na agenda de ninguém — por isso só se aceita o passado.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const SLUG = "detail_by_cordeiro";
const SERVICO_ID = "servico-1";
const CATALOGO = "servicos_detail_by_cordeiro";

let central = new FakeSupabase({ lexia_contactos: [] });
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

const fichaVazia = {
  emailBruto: "",
  idadeBruto: "",
  moradaBruto: "",
  notasBruto: "",
  origemManualBruto: "",
  origemManualNotaBruto: "",
  viaturaBruto: "",
};

const semServico = {
  dataBruto: "",
  executorBruto: "",
  servicoIdBruto: "",
  valorBruto: "",
};

const comum = {
  caminhoParaRevalidar: "/app/clientes",
  campos: fichaVazia,
  clienteSlug: SLUG,
  confirmado: false,
  indicativoBruto: "351",
  nomeBruto: "Martim Teste",
  telefoneBruto: "912345678",
  userId: "utilizador-1",
};

function marcacoes() {
  return doCliente.linhasDe("marcacoes");
}

function contactos() {
  return central.linhasDe("lexia_contactos");
}

function reiniciar() {
  central = new FakeSupabase({ lexia_contactos: [] });
  doCliente = new FakeSupabase({
    [CATALOGO]: [{ id: SERVICO_ID, nome: "Lavagem Premium" }],
    marcacoes: [],
  });
}

/** Um dia que já passou, para não depender da data em que o teste corre. */
function ontem() {
  const data = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return data.toISOString().slice(0, 10);
}

test("o serviço feito fica na agenda do cliente, não na ficha", async () => {
  reiniciar();

  const resultado = await write.criarCliente({
    ...comum,
    campos: { ...fichaVazia, viaturaBruto: "BMW Série 3" },
    servico: {
      dataBruto: ontem(),
      executorBruto: "martim",
      servicoIdBruto: SERVICO_ID,
      valorBruto: "180,50",
    },
  });

  assert.equal(resultado.ok, true, resultado.mensagem);
  assert.equal(marcacoes().length, 1);

  const linha = marcacoes()[0] as Linha;

  // O nome e não o id: `marcacoes.servico` guarda texto, e é por texto que o
  // histórico da ficha o mostra.
  assert.equal(linha.servico, "Lavagem Premium");
  assert.equal(linha.valor_previsto, 180.5);
  assert.equal(linha.executor, "martim");
  assert.equal(linha.tipo, "servico");
  assert.equal(linha.estado, "confirmada");
  assert.equal(linha.viatura, "BMW Série 3");

  // Sem slug, nem a leitura do painel nem o workflow de lembretes encontram a
  // linha: as duas filtram por ele.
  assert.equal(linha.cliente_slug, SLUG);

  // O telefone é a única ponte entre as duas bases. Tem de ser o número
  // completo e só dígitos, igual ao que ficou no contacto.
  assert.equal(linha.telefone, "351912345678");
  assert.equal(contactos()[0]?.telefone, "351912345678");

  // E o ticket não se duplicou para a ficha.
  assert.equal(contactos()[0]?.valor, undefined);
  assert.equal(contactos()[0]?.ticket, undefined);
});

test("uma data no futuro é recusada, e não deixa nada atrás", async () => {
  reiniciar();

  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const resultado = await write.criarCliente({
    ...comum,
    servico: {
      dataBruto: amanha,
      executorBruto: "",
      servicoIdBruto: SERVICO_ID,
      valorBruto: "100",
    },
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /não pode ser no futuro/);

  // Se isto falhar, o cliente recebe um lembrete automático de uma marcação
  // que não existe na agenda do Martim.
  assert.equal(marcacoes().length, 0);

  // E o contacto também não pode ter sido criado: a recusa tem de acontecer
  // antes da primeira escrita, porque não há transacção entre as duas bases.
  assert.equal(contactos().length, 0);
});

test("um serviço que não está no catálogo do cliente é recusado", async () => {
  reiniciar();

  const resultado = await write.criarCliente({
    ...comum,
    servico: {
      dataBruto: ontem(),
      executorBruto: "",
      servicoIdBruto: "servico-de-outra-empresa",
      valorBruto: "100",
    },
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /desconhecido/i);
  assert.equal(marcacoes().length, 0);
  assert.equal(contactos().length, 0);
});

test("sem serviço escolhido não se escreve marcação nenhuma", async () => {
  reiniciar();

  const resultado = await write.criarCliente({ ...comum, servico: semServico });

  assert.equal(resultado.ok, true, resultado.mensagem);
  assert.equal(contactos().length, 1);

  // Nem toda a gente que entra no painel já comprou.
  assert.equal(marcacoes().length, 0);
});

test("meio preenchido é recusado: serviço sem data, e data sem serviço", async () => {
  reiniciar();

  const semData = await write.criarCliente({
    ...comum,
    servico: { ...semServico, servicoIdBruto: SERVICO_ID },
  });

  assert.equal(semData.ok, false);
  assert.match(semData.mensagem, /data do serviço/i);

  const semNome = await write.criarCliente({
    ...comum,
    servico: { ...semServico, dataBruto: ontem() },
  });

  assert.equal(semNome.ok, false);
  assert.match(semNome.mensagem, /escolhe o serviço/i);
  assert.equal(contactos().length, 0);
});

test("se a agenda recusar a escrita, o contacto fica e o dono é avisado", async () => {
  reiniciar();
  doCliente.falharEm("insert", "marcacoes", "sem permissão");

  const resultado = await write.criarCliente({
    ...comum,
    servico: {
      dataBruto: ontem(),
      executorBruto: "",
      servicoIdBruto: SERVICO_ID,
      valorBruto: "90",
    },
  });

  // Não é `ok`: o dono tem de saber que o serviço não ficou registado.
  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /serviço não foi registado/i);

  // Mas o contacto não se apaga para "limpar" — isso perdia o email, a morada
  // e o canal de aquisição que o dono acabou de escrever.
  assert.equal(contactos().length, 1);
  assert.match(resultado.mensagem, /não o cries outra vez/i);
});

test("um cliente sem agenda ligada não finge que registou o serviço", async () => {
  reiniciar();

  const resultado = await write.criarCliente({
    ...comum,
    clienteSlug: "miranda_skin_experts",
    servico: {
      dataBruto: ontem(),
      executorBruto: "",
      servicoIdBruto: SERVICO_ID,
      valorBruto: "90",
    },
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /não tem agenda de serviços ligada/i);
  assert.equal(contactos().length, 0);
});

test("a data gravada cai no dia que o dono escolheu, no fuso do cliente", async () => {
  reiniciar();

  await write.criarCliente({
    ...comum,
    servico: {
      dataBruto: "2026-01-15",
      executorBruto: "",
      servicoIdBruto: SERVICO_ID,
      valorBruto: "",
    },
  });

  const gravada = String(marcacoes()[0]?.data_inicio);

  // O painel volta a mostrar este instante com o fuso do cliente. Encostado à
  // meia-noite, qualquer desvio punha o serviço a aparecer no dia anterior —
  // que é exactamente o bug que o fuso horário já deu uma vez.
  const noFuso = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Lisbon",
    year: "numeric",
  }).format(new Date(gravada));

  assert.equal(noFuso, "2026-01-15");
});

test("um ticket que não é número é recusado", async () => {
  reiniciar();

  const resultado = await write.criarCliente({
    ...comum,
    servico: {
      dataBruto: ontem(),
      executorBruto: "",
      servicoIdBruto: SERVICO_ID,
      valorBruto: "cento e vinte",
    },
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /ticket/i);
  assert.equal(contactos().length, 0);
});
