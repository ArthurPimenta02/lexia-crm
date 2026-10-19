/**
 * Marcar um atendimento pela aba Agenda.
 *
 * Isto escreve em três sítios sem transacção entre eles — a agenda do Google
 * (pelo n8n), a tabela de marcações do cliente (também pelo n8n) e o espelho
 * `lexia_agendamentos`. O que estes testes guardam é a ordem e as recusas, que
 * são as duas coisas que, se cederem, estragam a agenda do Martim sem dar nas
 * vistas:
 *
 * 1. **Nada chega ao Google antes de tudo estar validado.** Um id de serviço
 *    mal escrito a ser apanhado depois do evento criado deixava um buraco na
 *    agenda que ninguém sabia porque é que lá estava. Por isso vários testes
 *    verificam que o `fetch` não foi chamado uma única vez.
 * 2. **O `cliente_slug` é a única fronteira entre as duas empresas.** É a
 *    `service_role` a escrever, que ignora o RLS. O `contactoId` e o
 *    `servicoId` vêm do navegador e são autorizados por leituras filtradas
 *    pelo slug — se o filtro cair, estes testes falham.
 * 3. **O espelho fica com `origem: 'painel'`.** É esse valor que o gatilho
 *    `lexia_agendamentos_antes_de_escrever_trg` protege da sincronização. Com
 *    `manual` escrito aqui, a marcação do painel passava a indistinguível de
 *    uma escrita à mão no Google.
 * 4. **Os avisos são lidos antes e não depois.** Domingo, fora de horas ou 36
 *    horas seguidas devolvem aviso e não escrevem nada; o choque de horários
 *    tem a sua própria confirmação, separada, para confirmar o domingo não
 *    marcar por cima de outro trabalho.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const SLUG = "detail_by_cordeiro";
const OUTRO_SLUG = "miranda_skin_experts";
const CONTACTO_ID = "contacto-1";
const SERVICO_ID = "servico-1";
const AGENDAMENTO = "agendamento_servicos";
const TELEFONE = "351912345678";
const URL_DO_N8N = "https://n8n.exemplo.test/webhook/agenda";
const SEGREDO = "a".repeat(40);

/** Um dia de semana longe de feriados e de mudanças de hora. */
const DIA = "2026-11-18";

process.env.N8N_AGENDA_WEBHOOK_URL = URL_DO_N8N;
process.env.N8N_AGENDA_WEBHOOK_SECRET = SEGREDO;

function contactoBase(): Linha {
  return {
    cliente_slug: SLUG,
    id: CONTACTO_ID,
    nome: "Martim Teste",
    telefone: TELEFONE,
    viatura: null,
  };
}

/**
 * O serviço como está na tabela real do Detail, lida da execução 137283 do
 * n8n: a Lavagem Detalhada leva 225 minutos ao Martim e 285 ao Roberto.
 */
function servicoBase(): Linha {
  return {
    activo: true,
    duracao_martim_minutos: 225,
    duracao_roberto_minutos: 285,
    id: SERVICO_ID,
    martim_executa: true,
    nome: "Lavagem Detalhada",
    preco_base: 70,
    roberto_executa: true,
  };
}

let central = new FakeSupabase({
  lexia_agendamentos: [],
  lexia_contactos: [contactoBase()],
});
let doCliente = new FakeSupabase({ [AGENDAMENTO]: [servicoBase()] });

/** O que o `fetch` foi chamado com, e o que respondeu. */
let chamadas: { body: unknown; init: RequestInit; url: string }[] = [];
let resposta: () => Response = () => respostaCriada();

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

  return resposta();
}) as typeof fetch;

const marcar = await import("@/lib/agenda/marcar");

function respostaCriada(extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      calendario_id: "detailbycordeiro@gmail.com",
      event_id: "evento-google-1",
      link_google: "https://calendar.google.com/evento-1",
      marcacao_id: "marcacao-7",
      status: "CRIADO",
      ...extra,
    }),
    { headers: { "content-type": "application/json" }, status: 200 },
  );
}

function espelho() {
  return central.linhasDe("lexia_agendamentos");
}

function reiniciar(
  opcoes: { contacto?: Linha | null; servico?: Linha } = {},
) {
  central = new FakeSupabase({
    lexia_agendamentos: [],
    lexia_contactos:
      opcoes.contacto === null ? [] : [opcoes.contacto ?? contactoBase()],
  });
  doCliente = new FakeSupabase({
    [AGENDAMENTO]: [opcoes.servico ?? servicoBase()],
  });
  chamadas = [];
  resposta = () => respostaCriada();
}

const campos = {
  contactoId: CONTACTO_ID,
  dataBruto: DIA,
  duracaoBruto: "",
  executorBruto: "martim",
  horaBruto: "09:00",
  observacoesBruto: "",
  servicoIdBruto: SERVICO_ID,
  tituloBruto: "Lavagem Detalhada — Martim Teste",
  valorBruto: "70",
  viaturaBruto: "",
};

/**
 * Preparar e, se passar, marcar — que é o que a server action faz. Devolve as
 * duas metades para se poder afirmar sobre qualquer uma.
 */
async function marcarTudo(
  alteracoes: Partial<typeof campos> = {},
  opcoes: { confirmado?: boolean; ignorarConflito?: boolean } = {},
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
    ignorarConflito: opcoes.ignorarConflito ?? false,
    marcacao: preparacao.marcacao,
  });

  return { preparacao, resultado };
}

test("uma marcação válida entra no Google e deixa o espelho do painel", async () => {
  reiniciar();

  const { preparacao, resultado } = await marcarTudo();

  assert.equal(preparacao.erro, null);
  assert.deepEqual(preparacao.avisos, []);
  assert.equal(resultado?.ok, true, resultado?.erro ?? "");
  assert.equal(resultado?.linkGoogle, "https://calendar.google.com/evento-1");

  // O Google é chamado uma vez e só uma.
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, URL_DO_N8N);

  const corpo = chamadas[0].body as Record<string, unknown>;

  assert.equal(corpo.cliente_slug, SLUG);
  assert.equal(corpo.servico, "Lavagem Detalhada");
  assert.equal(corpo.executor, "martim");
  assert.equal(corpo.inicio_iso, "2026-11-18T09:00:00.000Z");
  // 225 minutos a partir das 09:00 dão 12:45.
  assert.equal(corpo.fim_iso, "2026-11-18T12:45:00.000Z");
  assert.equal(corpo.duracao_min, 225);
  assert.equal(corpo.valor, 70);

  // Da ficha, nunca do formulário: é o número que liga a marcação ao histórico.
  assert.equal(corpo.nome, "Martim Teste");
  assert.equal(corpo.telefone, TELEFONE);

  assert.equal(espelho().length, 1);

  const linha = espelho()[0] as Linha;

  assert.equal(linha.cliente_slug, SLUG);
  assert.equal(linha.event_id, "evento-google-1");
  assert.equal(linha.calendario_id, "detailbycordeiro@gmail.com");
  assert.equal(linha.inicio, "2026-11-18T09:00:00.000Z");
  assert.equal(linha.valor_previsto, 70);
  assert.equal(linha.referencia_cliente, "marcacao-7");
  assert.equal(linha.fuso, "Europe/Lisbon");

  // O que o gatilho da tabela protege da sincronização. Com "manual" aqui, a
  // marcação do painel passava a indistinguível de uma escrita à mão.
  assert.equal(linha.origem, "painel");
});

/** O segredo vai no cabeçalho e não no corpo, que é o que o n8n verifica. */
test("a chamada ao n8n vai assinada", async () => {
  reiniciar();

  await marcarTudo();

  const headers = chamadas[0].init.headers as Record<string, string>;

  assert.equal(headers.authorization, `Bearer ${SEGREDO}`);
  assert.equal(chamadas[0].init.method, "POST");
  // Uma redirecção levava o segredo para outro sítio qualquer.
  assert.equal(chamadas[0].init.redirect, "error");
});

/**
 * A `service_role` ignora o RLS: o `.eq("cliente_slug", …)` na leitura da ficha
 * é a única coisa entre uma empresa e a agenda da outra.
 */
test("um contacto de outra empresa não se encontra, e nada vai ao Google", async () => {
  reiniciar({ contacto: { ...contactoBase(), cliente_slug: OUTRO_SLUG } });

  const { preparacao } = await marcarTudo();

  assert.match(preparacao.erro ?? "", /não encontrado/i);
  assert.equal(chamadas.length, 0, "foi ao Google com uma ficha de outra empresa");
  assert.equal(espelho().length, 0);
});

/**
 * O mesmo para o serviço: a lista vem da tabela de agendamento do cliente, por
 * isso é ela a autorização sobre o id que o navegador mandou.
 */
test("um serviço que não é desta empresa é recusado", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({
    servicoIdBruto: "servico-de-outra-empresa",
  });

  assert.match(preparacao.erro ?? "", /desconhecido/i);
  assert.equal(chamadas.length, 0);
});

/**
 * Sem número não há ponte entre a marcação e a ficha. A marcação ficava na
 * agenda sem nunca aparecer no total gasto, que é a razão de ser disto tudo.
 */
test("uma ficha com um PSID da Meta em vez de telefone é recusada", async () => {
  reiniciar({
    contacto: { ...contactoBase(), telefone: "24609267549155376" },
  });

  const { preparacao } = await marcarTudo();

  assert.match(preparacao.erro ?? "", /número/i);
  assert.equal(chamadas.length, 0);
});

test("uma ficha sem nome é recusada antes de se marcar nada", async () => {
  reiniciar({ contacto: { ...contactoBase(), nome: "  " } });

  const { preparacao } = await marcarTudo();

  assert.match(preparacao.erro ?? "", /nome/i);
  assert.equal(chamadas.length, 0);
});

/**
 * O catálogo diz quem faz o quê. Aceitar um executor que não faz o serviço
 * punha o evento no calendário errado — e o calendário é o que o agente
 * consulta para saber se a hora está livre.
 */
test("um executor que não faz este serviço é recusado, com quem o faz", async () => {
  reiniciar({ servico: { ...servicoBase(), roberto_executa: false } });

  const { preparacao } = await marcarTudo({ executorBruto: "roberto" });

  assert.match(preparacao.erro ?? "", /Martim/);
  assert.equal(chamadas.length, 0);
});

test("a duração em branco vem do catálogo, para aquele executor", async () => {
  reiniciar();

  await marcarTudo({ executorBruto: "roberto" });

  assert.equal((chamadas[0].body as Record<string, unknown>).duracao_min, 285);
});

test("uma duração escrita à mão ganha ao catálogo", async () => {
  reiniciar();

  await marcarTudo({ duracaoBruto: "90" });

  const corpo = chamadas[0].body as Record<string, unknown>;

  assert.equal(corpo.duracao_min, 90);
  assert.equal(corpo.fim_iso, "2026-11-18T10:30:00.000Z");
});

/**
 * Às 01:30 de 2026-03-29 o relógio de Lisboa salta de 00:59 para 02:00. Essa
 * hora não existe, e deixá-la passar punha o evento numa hora que ninguém
 * escolheu.
 */
test("uma hora que não existe no fuso do cliente é recusada", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({
    dataBruto: "2026-03-29",
    horaBruto: "01:30",
  });

  assert.match(preparacao.erro ?? "", /não existem/i);
  assert.equal(chamadas.length, 0);
});

test("o nome do evento em branco é recusado", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ tituloBruto: "   " });

  assert.match(preparacao.erro ?? "", /nome do evento/i);
  assert.equal(chamadas.length, 0);
});

test("um valor que não é número é recusado", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ valorBruto: "setenta" });

  assert.match(preparacao.erro ?? "", /número/i);
  assert.equal(chamadas.length, 0);
});

test("sem valor escrito a marcação fica sem valor, e não com o do catálogo", async () => {
  reiniciar();

  await marcarTudo({ valorBruto: "" });

  assert.equal((chamadas[0].body as Record<string, unknown>).valor, null);
});

/**
 * 2026-11-22 é um domingo. O agente recusava; aqui avisa-se — mas nada é
 * escrito nesta passagem, porque o aviso existe para ser lido antes.
 */
test("ao domingo avisa-se, e nada é escrito até o dono confirmar", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ dataBruto: "2026-11-22" });

  assert.equal(preparacao.erro, null);
  assert.equal(preparacao.avisos.length, 1);
  assert.match(preparacao.avisos[0].texto, /não trabalha/i);
  assert.equal(chamadas.length, 0, "marcou ao domingo sem ninguém confirmar");
});

test("depois do aviso, confirmar marca mesmo", async () => {
  reiniciar();

  const { resultado } = await marcarTudo(
    { dataBruto: "2026-11-22" },
    { confirmado: true },
  );

  assert.equal(resultado?.ok, true, resultado?.erro ?? "");
  assert.equal(espelho().length, 1);
});

test("fora do horário do executor avisa-se, com as horas dele", async () => {
  reiniciar();

  const { preparacao } = await marcarTudo({ horaBruto: "07:00" });

  assert.equal(preparacao.avisos.length, 1);
  assert.match(preparacao.avisos[0].texto, /9h–18h/);
});

/**
 * O Polimento Técnico leva 2160 minutos ao Martim — 36 horas seguidas. É o que
 * torna 4 dos 14 serviços do Detail impossíveis de marcar pelo workflow do
 * agente, e aqui diz-se porquê em vez de se recusar.
 */
test("um serviço de vários dias avisa que são horas seguidas", async () => {
  reiniciar({
    servico: { ...servicoBase(), duracao_martim_minutos: 2160 },
  });

  const { preparacao } = await marcarTudo();

  assert.ok(
    preparacao.avisos.some((aviso) => /horas seguidas/.test(aviso.texto)),
    "não avisou das 36 horas",
  );
});

/**
 * O choque de horários é a coisa que custa dinheiro: dois trabalhos à mesma
 * hora. O espelho não se escreve, porque não há evento nenhum no Google.
 */
test("um choque de horários devolve o que já lá está e não escreve nada", async () => {
  reiniciar();
  resposta = () =>
    new Response(
      JSON.stringify({
        conflitos: [
          {
            fim: "2026-11-18T10:00:00.000Z",
            inicio: "2026-11-18T09:00:00.000Z",
            titulo: "Lavagem Express — Outro Cliente",
          },
        ],
        status: "CONFLITO",
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );

  const { resultado } = await marcarTudo();

  assert.equal(resultado?.ok, false);
  assert.equal(resultado?.erro, null);
  assert.equal(resultado?.conflitos.length, 1);
  assert.equal(
    resultado?.conflitos[0].titulo,
    "Lavagem Express — Outro Cliente",
  );
  assert.equal(espelho().length, 0, "escreveu o espelho de um evento que não existe");
});

/**
 * O `ignorar_conflito` é um campo próprio e não o mesmo do `confirmado`. Se
 * fosse um só, confirmar "é domingo" marcava por cima de outro trabalho sem o
 * dono o chegar a ver.
 */
test("insistir manda o ignorar_conflito ao n8n", async () => {
  reiniciar();

  await marcarTudo({}, { ignorarConflito: true });

  assert.equal(
    (chamadas[0].body as Record<string, unknown>).ignorar_conflito,
    true,
  );
});

test("sem insistir, o ignorar_conflito vai desligado", async () => {
  reiniciar();

  await marcarTudo();

  assert.equal(
    (chamadas[0].body as Record<string, unknown>).ignorar_conflito,
    false,
  );
});

/**
 * O evento existe no Google e a venda está na base do cliente. Responder "não
 * marcou" punha o dono a marcar outra vez e a ficar com o trabalho em
 * duplicado — e a sincronização seguinte apanha a linha de qualquer maneira,
 * só com um rótulo pior.
 */
test("se o espelho falhar, a marcação continua a valer", async () => {
  reiniciar();
  central.falharEm("upsert", "lexia_agendamentos", "sem permissão");

  const { resultado } = await marcarTudo();

  assert.equal(resultado?.ok, true, resultado?.erro ?? "");
  assert.equal(resultado?.linkGoogle, "https://calendar.google.com/evento-1");
});

/**
 * Sem `event_id` não se sabe que evento é que foi criado, e o espelho ficava
 * com uma chave inventada que a sincronização seguinte duplicava.
 */
test("uma resposta sem event_id não finge que marcou", async () => {
  reiniciar();
  resposta = () =>
    new Response(JSON.stringify({ status: "CRIADO" }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });

  const { resultado } = await marcarTudo();

  assert.equal(resultado?.ok, false);
  assert.match(resultado?.erro ?? "", /Confirma no Google/);
  assert.equal(espelho().length, 0);
});

/** O "Respond to Webhook" do n8n devolve uma lista quando traz mais de um item. */
test("uma resposta dentro de uma lista é lida à mesma", async () => {
  reiniciar();
  resposta = () =>
    new Response(
      JSON.stringify([
        {
          calendario_id: "detailbycordeiro@gmail.com",
          event_id: "evento-google-2",
          status: "CRIADO",
        },
      ]),
      { headers: { "content-type": "application/json" }, status: 200 },
    );

  const { resultado } = await marcarTudo();

  assert.equal(resultado?.ok, true, resultado?.erro ?? "");
  assert.equal(espelho()[0]?.event_id, "evento-google-2");
});

test("um erro do n8n não deixa o dono a achar que marcou", async () => {
  reiniciar();
  resposta = () => new Response("erro", { status: 500 });

  const { resultado } = await marcarTudo();

  assert.equal(resultado?.ok, false);
  assert.ok(resultado?.erro);
  assert.equal(espelho().length, 0);
});

test("se o n8n não responder, diz-se para confirmar no Google", async () => {
  reiniciar();
  resposta = () => {
    throw new Error("timeout");
  };

  const { resultado } = await marcarTudo();

  assert.equal(resultado?.ok, false);
  assert.match(resultado?.erro ?? "", /Confirma no Google/);
  assert.equal(espelho().length, 0);
});

/**
 * Um segredo curto é um segredo que se adivinha, e esta porta cria eventos na
 * agenda real. Sem configuração a sério, o formulário não aparece.
 */
test("sem a porta do n8n configurada, marcar está desligado", () => {
  const url = process.env.N8N_AGENDA_WEBHOOK_URL;
  const segredo = process.env.N8N_AGENDA_WEBHOOK_SECRET;

  try {
    assert.equal(marcar.marcarEstaLigado(), true);

    process.env.N8N_AGENDA_WEBHOOK_SECRET = "curto";
    assert.equal(marcar.marcarEstaLigado(), false);

    process.env.N8N_AGENDA_WEBHOOK_SECRET = segredo;
    delete process.env.N8N_AGENDA_WEBHOOK_URL;
    assert.equal(marcar.marcarEstaLigado(), false);
  } finally {
    process.env.N8N_AGENDA_WEBHOOK_URL = url;
    process.env.N8N_AGENDA_WEBHOOK_SECRET = segredo;
  }
});

/**
 * Nenhuma das leituras que autorizam o pedido pode correr sem o filtro da
 * empresa. É a afirmação sobre o conjunto todo e não sobre uma consulta: uma
 * leitura nova escrita sem o filtro falha aqui mesmo que o resto passe.
 */
test("nenhuma leitura da ficha corre sem o filtro do cliente", async () => {
  reiniciar();

  await marcarTudo();

  const leituras = central.registos.filter(
    (registo) =>
      registo.operacao === "select" && registo.tabela === "lexia_contactos",
  );

  assert.ok(leituras.length > 0, "não leu a ficha nenhuma vez");

  for (const leitura of leituras) {
    assert.ok(
      leitura.filtros.some(
        (filtro) => filtro.coluna === "cliente_slug" && filtro.valor === SLUG,
      ),
      "uma leitura da ficha correu sem o filtro do cliente",
    );
  }
});

test("o espelho é escrito sempre com o cliente_slug da sessão", async () => {
  reiniciar();

  await marcarTudo();

  const escritas = central.registos.filter(
    (registo) => registo.tabela === "lexia_agendamentos",
  );

  assert.equal(escritas.length, 1);
  assert.equal(
    (escritas[0].payload as Linha).cliente_slug,
    SLUG,
    "o espelho foi escrito sem o cliente da sessão",
  );
});
