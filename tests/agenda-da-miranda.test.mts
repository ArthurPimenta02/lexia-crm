/**
 * Marcar na agenda da Miranda Skin Experts.
 *
 * O painel passou a servir duas empresas com tabelas de serviços que não se
 * parecem. Isto guarda as diferenças que, se cederem, falham em silêncio —
 * nenhuma delas dá erro, todas dão uma marcação errada:
 *
 * 1. **A coluna do activo chama-se `ativo` na Miranda e `activo` no Detail.**
 *    Um filtro pela coluna errada na Supabase devolve erro; dentro do painel
 *    isso vira uma lista vazia e o formulário de marcar desaparece sem dizer
 *    porquê.
 * 2. **O profissional dela é texto numa coluna, não uma coluna por pessoa.**
 *    Cada linha é de uma pessoa só, e um nome fora da lista é ignorado em vez
 *    de passar — o `executor` que sai daqui é o que o workflow do n8n usa para
 *    escolher o calendário, e um nome que ele não conheça é recusado lá.
 * 3. **A chave do executor dela é "Samuel" com maiúscula.** As 172 marcações
 *    que já existem na `lexia_agendamentos` têm esse valor na coluna
 *    `executor`. Passá-la a minúsculas, como no Detail, partia o filtro por
 *    pessoa no painel sem mexer em linha nenhuma.
 * 4. **O horário dela é 9h–22h e não as 10h–20h que ela declara.** As
 *    marcações reais começam às 9h e acabam às 22h; com a janela declarada, um
 *    terço das marcações normais levava aviso, e um aviso que aparece sempre
 *    deixa de ser lido.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const SLUG = "miranda_skin_experts";
const CONTACTO_ID = "contacto-m1";
const SERVICO_ID = "7";
const TABELA = "servicos_miranda";
const TELEFONE = "15081234567";
const URL_DO_N8N = "https://n8n.exemplo.test/webhook/agenda";
const SEGREDO = "b".repeat(40);

/** Uma quarta-feira, longe de mudanças de hora em Boston. */
const DIA = "2026-11-18";

process.env.N8N_AGENDA_WEBHOOK_URL = URL_DO_N8N;
process.env.N8N_AGENDA_WEBHOOK_SECRET = SEGREDO;

function contactoBase(): Linha {
  return {
    cliente_slug: SLUG,
    id: CONTACTO_ID,
    nome: "Ana Teste",
    telefone: TELEFONE,
    viatura: null,
  };
}

/**
 * O serviço como está na tabela real dela, lido a 2026-10-19: a Limpeza de
 * Pele é do Samuel e leva 60 minutos. A linha traz `activo` a mais, com o
 * valor contrário ao do `ativo`, para que um filtro pela coluna do Detail se
 * veja aqui em vez de passar.
 */
function servicoBase(): Linha {
  return {
    activo: false,
    ativo: true,
    duracao_agenda_min: 60,
    id: SERVICO_ID,
    nome: "Limpeza de Pele",
    preco: 150,
    profissional: "Samuel",
  };
}

let central = new FakeSupabase({
  lexia_agendamentos: [],
  lexia_contactos: [contactoBase()],
});
let doCliente = new FakeSupabase({ [TABELA]: [servicoBase()] });

let chamadas: { body: unknown; init: RequestInit; url: string }[] = [];

const configReal = await import("@/lib/servicos/config");

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => central },
});
mock.module("@/lib/servicos/config", {
  namedExports: { ...configReal, createServicosClient: () => doCliente },
});

globalThis.fetch = (async (entrada: string, init: RequestInit) => {
  chamadas.push({
    body: JSON.parse(String(init.body)),
    init,
    url: String(entrada),
  });

  return new Response(
    JSON.stringify({
      calendario_id: "smouramiranda@gmail.com",
      event_id: "evento-miranda-1",
      link_google: "https://calendar.google.com/evento-m1",
      marcacao_id: "agendamento-m7",
      status: "CRIADO",
    }),
    { headers: { "content-type": "application/json" }, status: 200 },
  );
}) as typeof fetch;

const marcar = await import("@/lib/agenda/marcar");
const { getServicosAgendaveis } = await import("@/lib/servicos/read");
const { getMoedaDoCliente } = configReal;

function reiniciar(servicos?: Linha[]) {
  central = new FakeSupabase({
    lexia_agendamentos: [],
    lexia_contactos: [contactoBase()],
  });
  doCliente = new FakeSupabase({ [TABELA]: servicos ?? [servicoBase()] });
  chamadas = [];
}

const campos = {
  contactoId: CONTACTO_ID,
  dataBruto: DIA,
  duracaoBruto: "",
  executorBruto: "Samuel",
  horaBruto: "14:00",
  observacoesBruto: "",
  servicoIdBruto: SERVICO_ID,
  tituloBruto: "Limpeza de Pele — Ana Teste",
  valorBruto: "150",
  viaturaBruto: "",
};

async function marcarTudo(
  alteracoes: Partial<typeof campos> = {},
  opcoes: { confirmado?: boolean } = {},
) {
  const preparacao = await marcar.prepararNovaMarcacao({
    campos: { ...campos, ...alteracoes },
    clienteSlug: SLUG,
  });

  if (
    preparacao.erro ||
    !preparacao.marcacao ||
    (preparacao.avisos.length > 0 && !opcoes.confirmado)
  ) {
    return { preparacao, resultado: null };
  }

  const resultado = await marcar.marcarNaAgenda({
    clienteSlug: SLUG,
    ignorarConflito: false,
    marcacao: preparacao.marcacao,
  });

  return { preparacao, resultado };
}

test("os serviços dela vêm da tabela dela, pelas colunas dela", async () => {
  reiniciar();

  const servicos = await getServicosAgendaveis(SLUG);

  assert.equal(servicos.length, 1);
  assert.equal(servicos[0].id, SERVICO_ID);
  assert.equal(servicos[0].nome, "Limpeza de Pele");
  assert.equal(servicos[0].precoBase, 150);
  assert.deepEqual(servicos[0].executores, [
    { chave: "Samuel", duracaoMinutos: 60, nome: "Samuel" },
  ]);

  const leitura = doCliente.registos.at(0);

  assert.equal(leitura?.tabela, TABELA);

  // As colunas pedidas são as dela. Pedir uma coluna que não existe faz a
  // Supabase devolver erro, e o erro aqui vira uma lista vazia.
  for (const coluna of ["preco", "ativo", "profissional", "duracao_agenda_min"]) {
    assert.ok(
      leitura?.colunas?.includes(coluna),
      `não pediu a coluna ${coluna}`,
    );
  }
});

/**
 * A linha de prova tem `ativo: true` e `activo: false`. Filtrar pela coluna do
 * Detail devolvia-a à mesma na Supabase a sério (erro), mas aqui some.
 */
test("o filtro do activo é o `ativo` dela, e não o `activo` do Detail", async () => {
  reiniciar();

  await getServicosAgendaveis(SLUG);

  const filtros = doCliente.registos.at(0)?.filtros ?? [];

  assert.deepEqual(filtros, [{ coluna: "ativo", valor: true }]);
});

test("um serviço desligado não aparece para marcar", async () => {
  reiniciar([{ ...servicoBase(), activo: true, ativo: false }]);

  assert.deepEqual(await getServicosAgendaveis(SLUG), []);
});

/**
 * O `profissional` é texto escrito à mão. Uma profissional nova que ainda não
 * tem calendário ligado não pode virar um `executor`: o workflow do n8n
 * recusa-o, e o dono só descobria ao clicar em marcar.
 */
test("um profissional que não está na lista é ignorado", async () => {
  reiniciar([{ ...servicoBase(), profissional: "Carla" }]);

  assert.deepEqual(await getServicosAgendaveis(SLUG), []);
});

test("o nome do profissional é lido com espaços a mais e maiúsculas trocadas", async () => {
  reiniciar([{ ...servicoBase(), profissional: "  bruna " }]);

  const servicos = await getServicosAgendaveis(SLUG);

  assert.deepEqual(servicos[0]?.executores, [
    { chave: "Bruna", duracaoMinutos: 60, nome: "Bruna" },
  ]);
});

/**
 * Ela tem 4 serviços sob avaliação, sem preço de tabela. Esconder um serviço
 * que ela vende era pior do que deixar o campo do valor em branco.
 */
test("um serviço sem preço continua a dar para marcar", async () => {
  reiniciar([{ ...servicoBase(), preco: null }]);

  const servicos = await getServicosAgendaveis(SLUG);

  assert.equal(servicos.length, 1);
  assert.equal(servicos[0].precoBase, null);
});

/** Sem duração não se sabe a que horas acaba, e o evento não bloqueia nada. */
test("um serviço sem duração de agenda não aparece", async () => {
  reiniciar([{ ...servicoBase(), duracao_agenda_min: 0 }]);

  assert.deepEqual(await getServicosAgendaveis(SLUG), []);
});

test("uma empresa sem agenda configurada não devolve serviços", async () => {
  reiniciar();

  assert.deepEqual(await getServicosAgendaveis("clinica_que_nao_existe"), []);
});

/** Ela cobra em Boston. Mostrar euros era mostrar o preço errado. */
test("a moeda dela é dólares e a do Detail euros", () => {
  assert.equal(getMoedaDoCliente(SLUG), "USD");
  assert.equal(getMoedaDoCliente("detail_by_cordeiro"), "EUR");
  assert.equal(getMoedaDoCliente("clinica_que_nao_existe"), null);
});

test("uma marcação dela entra no Google e deixa o espelho no fuso de Boston", async () => {
  reiniciar();

  const { preparacao, resultado } = await marcarTudo();

  assert.equal(preparacao.erro, null);
  assert.deepEqual(preparacao.avisos, []);
  assert.equal(resultado?.ok, true, resultado?.erro ?? "");

  const corpo = chamadas[0].body as Record<string, unknown>;

  assert.equal(corpo.cliente_slug, SLUG);
  assert.equal(corpo.servico, "Limpeza de Pele");
  // Com maiúscula, que é o que o workflow dela conhece e o que as 172 linhas
  // que já lá estão têm.
  assert.equal(corpo.executor, "Samuel");
  assert.equal(corpo.duracao_min, 60);
  // 14:00 em Boston em Novembro são 19:00 em UTC.
  assert.equal(corpo.inicio_iso, "2026-11-18T19:00:00.000Z");
  assert.equal(corpo.fim_iso, "2026-11-18T20:00:00.000Z");
  assert.equal(corpo.nome, "Ana Teste");
  assert.equal(corpo.telefone, TELEFONE);

  const linha = central.linhasDe("lexia_agendamentos")[0] as Linha;

  assert.equal(linha.cliente_slug, SLUG);
  assert.equal(linha.calendario_id, "smouramiranda@gmail.com");
  assert.equal(linha.event_id, "evento-miranda-1");
  assert.equal(linha.executor, "Samuel");
  assert.equal(linha.valor_previsto, 150);
  assert.equal(linha.fuso, "America/New_York");
  assert.equal(linha.origem, "painel");
});

/**
 * Ela declara 10h–20h, mas marca das 9h às 22h. Às 21:00 com uma hora de
 * serviço, a janela declarada dava aviso numa marcação perfeitamente normal.
 */
test("às 21:00 não há aviso nenhum, porque ela trabalha até às 22h", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ horaBruto: "21:00" });

  assert.deepEqual(preparacao.avisos, []);
});

test("antes das 9h avisa-se, com as horas dela", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ horaBruto: "08:00" });

  assert.equal(preparacao.avisos.length, 1);
  assert.match(preparacao.avisos[0].texto, /9h–22h/);
});

/** 2026-11-22 é um domingo, e ao domingo ela não abre. */
test("ao domingo avisa-se, e nada vai ao Google até confirmar", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ dataBruto: "2026-11-22" });

  assert.equal(preparacao.avisos.length, 1);
  assert.match(preparacao.avisos[0].texto, /Samuel não trabalha/);
  assert.equal(chamadas.length, 0);
});

/** Ao sábado ela abre, e o horário do Detail ao sábado fecha às 13h. */
test("ao sábado à tarde não há aviso, que é o horário do Detail e não o dela", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ dataBruto: "2026-11-21" });

  assert.deepEqual(preparacao.avisos, []);
});

/**
 * O `cliente_slug` é a única fronteira entre as duas empresas: é a
 * `service_role` a escrever, que ignora o RLS.
 */
test("um contacto do Detail não se marca na agenda dela", async () => {
  reiniciar();
  central = new FakeSupabase({
    lexia_agendamentos: [],
    lexia_contactos: [{ ...contactoBase(), cliente_slug: "detail_by_cordeiro" }],
  });

  const { preparacao } = await marcarTudo();

  assert.match(preparacao.erro ?? "", /não encontrado/i);
  assert.equal(chamadas.length, 0);
});

/** O catálogo do Detail não autoriza nada na agenda dela. */
test("o Martim não faz serviços dela", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ executorBruto: "martim" });

  assert.match(preparacao.erro ?? "", /Samuel/);
  assert.equal(chamadas.length, 0);
});
