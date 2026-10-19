/**
 * De que campanha veio esta pessoa.
 *
 * Quatro coisas aqui não são óbvias e um teste tem de as guardar.
 *
 * 1. O que a Meta manda é o id do ANÚNCIO, não o da campanha. Toda esta
 *    funcionalidade existe para traduzir um número de 18 dígitos em três
 *    nomes, e a tradução passa por anúncio → conjunto → campanha. Quem trocar
 *    `origem_source_id` por uma junção directa a `lexia_campanhas` encontra
 *    zero linhas e um ecrã vazio sem erro nenhum.
 *
 * 2. Os campos pedidos à Meta são um contrato, não uma preferência. Um campo
 *    inválido faz a Meta recusar o pedido INTEIRO com o erro #100, em vez de
 *    ignorar só esse campo — por isso `adset{id,name}` e `campaign{id,name}`
 *    estão aqui afirmados à letra.
 *
 * 3. A ligação da marcação à ficha é pelos ÚLTIMOS 9 DÍGITOS. Medido no Detail
 *    a 2026-10-19: 16 de 19 marcações casam pelo número exacto e 18 pelos
 *    últimos 9 — o indicativo 351 não é escrito igual nos dois lados. Trocar
 *    isto por igualdade exacta não dá erro; dá um número mais pequeno, que é
 *    pior porque passa por verdade.
 *
 * 4. Os números são um PISO. 13 contactos em 1.028 têm anúncio identificado,
 *    porque o Instagram Direct e o Messenger não enviam referral e é para lá
 *    que vai 76% do gasto. Um contacto cujo anúncio já não existe na Meta
 *    conta para o total de identificados — isso é verdade — mas não se atribui
 *    a campanha nenhuma.
 *
 * E, como em todo o resto: estas leituras correm com o cliente autenticado, e
 * o isolamento é o `.eq("cliente_slug", …)` em cada consulta mais as policies.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const A = "empresa_a";
const B = "empresa_b";

/** Tabelas que, lidas sem filtro, mostravam dados da outra empresa. */
const tabelasDoInquilino = [
  "lexia_agendamentos",
  "lexia_anuncios",
  "lexia_campanha_custos",
  "lexia_campanhas",
  "lexia_contactos",
];

function anuncio(
  slug: string,
  anuncioId: string,
  campanhaId: string,
  nomes: { campanha: string; conjunto: string; criativo: string },
): Linha {
  return {
    anuncio_externo_id: anuncioId,
    campanha_externa_id: campanhaId,
    campanha_nome: nomes.campanha,
    cliente_slug: slug,
    conjunto_externo_id: `${campanhaId}-cj`,
    conjunto_nome: nomes.conjunto,
    nome: nomes.criativo,
    plataforma: "meta",
  };
}

function contacto(
  slug: string,
  id: string,
  criadoEm: string,
  anuncioId: string | null,
  telefoneDigitos: string | null,
): Linha {
  return {
    cliente_slug: slug,
    criado_em: criadoEm,
    id,
    origem_source_id: anuncioId,
    telefone_digitos: telefoneDigitos,
  };
}

const DENTRO = "2026-10-15T10:00:00.000Z";

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_agendamentos: [
      // Marcação do Sérgio, com indicativo. A ficha dele não o tem.
      {
        cliente_slug: A,
        estado: "confirmado",
        telefone_digitos: "351916005334",
      },
      // Marcação do Kevin, igual nos dois lados.
      {
        cliente_slug: A,
        estado: "confirmado",
        telefone_digitos: "351919968201",
      },
      // Desmarcada: não conta.
      {
        cliente_slug: A,
        estado: "cancelado",
        telefone_digitos: "351911779181",
      },
      // Da outra empresa, com o telefone do Sérgio: não pode contar para o A.
      {
        cliente_slug: B,
        estado: "confirmado",
        telefone_digitos: "351924363462",
      },
    ],
    lexia_anuncios: [
      anuncio(A, "anuncio-1", "campanha-prospecao", {
        campanha: "Prospeção Detail | 25-11",
        conjunto: "FB+IG - Pub quente [Lisboa 40km] 18-65",
        criativo: "ad - V1",
      }),
      anuncio(A, "anuncio-2", "campanha-prospecao", {
        campanha: "Prospeção Detail | 25-11",
        conjunto: "WA - advt+ ab [Lisboa 40km] 22-55 - Higien",
        criativo: "ad - estilo tiktok",
      }),
      anuncio(A, "anuncio-3", "campanha-mensagens", {
        campanha: "[MENSAGENS] [CAPTAÇÃO DE LEADS]",
        conjunto: "[WPP] [ABERTO - 22 A 55] [25KM] [FB E IG]",
        criativo: "AD 3 - 12 Jul",
      }),
      anuncio(B, "anuncio-do-b", "campanha-do-b", {
        campanha: "Campanha da outra empresa",
        conjunto: "Conjunto da outra empresa",
        criativo: "Criativo da outra empresa",
      }),
    ],
    lexia_campanha_custos: [
      {
        campanha_id: "uuid-prospecao",
        cliente_slug: A,
        cliques: 100,
        cliques_link: 40,
        dia: "2026-10-15",
        gasto: 50,
        impressoes: 10_000,
        moeda: "EUR",
        sincronizado_em: "2026-10-19T08:00:00.000Z",
      },
      {
        campanha_id: "uuid-mensagens",
        cliente_slug: A,
        cliques: 50,
        cliques_link: 20,
        dia: "2026-10-15",
        gasto: 25,
        impressoes: 5_000,
        moeda: "EUR",
        sincronizado_em: "2026-10-19T08:00:00.000Z",
      },
    ],
    lexia_campanhas: [
      {
        campanha_externa_id: "campanha-prospecao",
        cliente_slug: A,
        estado: "ACTIVE",
        id: "uuid-prospecao",
        nome: "Prospeção Detail | 25-11",
        objectivo: "OUTCOME_ENGAGEMENT",
      },
      {
        campanha_externa_id: "campanha-mensagens",
        cliente_slug: A,
        estado: "PAUSED",
        id: "uuid-mensagens",
        nome: "[MENSAGENS] [CAPTAÇÃO DE LEADS]",
        objectivo: "OUTCOME_ENGAGEMENT",
      },
    ],
    lexia_contactos: [
      // Sérgio: anúncio da Prospeção, e marcou — mas sem o 351 na ficha.
      contacto(A, "c-sergio", DENTRO, "anuncio-1", "916005334"),
      // Kevin: o mesmo conjunto, e marcou com o número igual nos dois lados.
      contacto(A, "c-kevin", DENTRO, "anuncio-2", "351919968201"),
      // Ricardo: anúncio da Prospeção, e a marcação dele foi desmarcada.
      contacto(A, "c-ricardo", DENTRO, "anuncio-1", "351911779181"),
      // Célia: campanha de mensagens, sem marcação nenhuma.
      contacto(A, "c-celia", DENTRO, "anuncio-3", "351919583132"),
      // Anúncio que já não existe no espelho: conta como identificado, mas não
      // se atribui a campanha nenhuma.
      contacto(A, "c-apagado", DENTRO, "anuncio-que-a-meta-apagou", "351912404474"),
      // Sem anúncio: a maioria real. Não entra em contagem nenhuma de campanha.
      contacto(A, "c-organico", DENTRO, null, "351933786089"),
      // Fora do período.
      contacto(A, "c-antigo", "2026-09-01T10:00:00.000Z", "anuncio-1", "351961111111"),
      // Da outra empresa, com o anúncio do A: o filtro tem de o deixar fora.
      contacto(B, "c-do-b", DENTRO, "anuncio-1", "351924363462"),
    ],
  };
}

let base = new FakeSupabase(estadoInicial());
let escrita = new FakeSupabase({});

/**
 * Tudo o que é mocado é-o AQUI, uma vez só, e nenhum teste chama
 * `mock.restoreAll()`.
 *
 * Custou dois testes a descobrir: o `restoreAll` de um teste desfazia o mock
 * de `server-only` montado no topo, e o teste seguinte explodia com "cannot be
 * imported from a Client Component". E o `mock.module` recusa mocar o mesmo
 * caminho duas vezes. O estado por teste muda-se trocando as variáveis acima,
 * não voltando a mocar.
 */
mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/server", {
  namedExports: { createClient: async () => base },
});
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => escrita },
});
mock.module("@/lib/clientes/timezone", {
  namedExports: { getClientTimezone: () => "Europe/Lisbon" },
});

/**
 * A Meta é substituída no `fetch` e não no módulo `lib/meta/ads`.
 *
 * De propósito: mocar o módulo deixava o teste da sincronização a afirmar
 * coisas sobre um duplo meu, e a chamada verdadeira — com os campos que a Meta
 * recusa quando estão mal escritos — ficava sem ninguém a olhar por ela. Daqui,
 * o mesmo teste atravessa `fetchMetaAds` a sério.
 */
const pedidos: string[] = [];
let anunciosDaMeta: unknown[] = [];

globalThis.fetch = (async (url: string | URL) => {
  const texto = String(url);

  pedidos.push(texto);

  const caminho = new URL(texto).pathname;
  const corpo = caminho.endsWith("/ads") ? { data: anunciosDaMeta } : { data: [] };

  return new Response(JSON.stringify(corpo), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}) as typeof fetch;

process.env.META_ADS_TOKEN = "token-de-teste";
process.env.EMPRESA_A_META_ADS_ACCOUNT_ID = "act_1";

const campaigns = await import("@/lib/campaigns/read");
const atribuicao = await import("@/lib/meta/atribuicao");
const ads = await import("@/lib/meta/ads");
const sync = await import("@/lib/meta/sync");

function reiniciar() {
  base = new FakeSupabase(estadoInicial());
  pedidos.length = 0;
  anunciosDaMeta = [];
}

const periodo = {
  fim: "2026-10-19",
  fimIso: "2026-10-19T23:59:59.999Z",
  inicio: "2026-10-13",
  inicioIso: "2026-10-13T00:00:00.000Z",
  timezone: "Europe/Lisbon",
};

function assertTudoFiltradoPorCliente(slug: string) {
  for (const registo of base.registos) {
    if (!tabelasDoInquilino.includes(registo.tabela)) {
      continue;
    }

    assert.ok(
      registo.filtros.some(
        (filtro) => filtro.coluna === "cliente_slug" && filtro.valor === slug,
      ),
      `A consulta a ${registo.tabela} correu sem o filtro de ${slug}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// A chamada à Meta: o contrato dos campos e a árvore que ela devolve.
// ---------------------------------------------------------------------------

test("o pedido à Meta leva o conjunto e a campanha dentro do anúncio", async () => {
  reiniciar();

  await ads.fetchMetaAds({
    accountId: "act_1",
    apiVersion: "v26.0",
    token: "token-de-teste",
  });

  assert.equal(pedidos.length, 1);

  const pedido = new URL(pedidos[0]!);
  const campos = pedido.searchParams.get("fields") ?? "";

  // À letra: a Meta recusa o pedido inteiro (#100) por um campo mal escrito, e
  // o sintoma é o painel ficar sem anúncios sem dizer porquê.
  assert.ok(
    campos.includes("adset{id,name}"),
    `Faltou adset{id,name} nos campos pedidos: ${campos}`,
  );
  assert.ok(
    campos.includes("campaign{id,name}"),
    `Faltou campaign{id,name} nos campos pedidos: ${campos}`,
  );
  assert.ok(pedido.pathname.endsWith("/act_1/ads"));
});

test("um anúncio da Meta vira criativo, conjunto e campanha", async () => {
  reiniciar();
  anunciosDaMeta = [
    {
      adset: { id: "cj-1", name: "FB+IG - Pub quente [Lisboa 40km] 18-65" },
      campaign: { id: "cp-1", name: "Prospeção Detail | 25-11" },
      id: "120237312707190118",
      name: "ad - V1",
      status: "ACTIVE",
    },
    // Sem nome: o id serve de nome, para a linha não desaparecer.
    { id: "120237316848600118" },
    // Sem id: não há o que traduzir, fica de fora.
    { name: "anúncio sem id" },
  ];

  const anuncios = await ads.fetchMetaAds({
    accountId: "act_1",
    apiVersion: "v26.0",
    token: "token-de-teste",
  });

  assert.equal(anuncios.length, 2);
  assert.deepEqual(anuncios[0], {
    campanhaExternaId: "cp-1",
    campanhaNome: "Prospeção Detail | 25-11",
    conjuntoExternoId: "cj-1",
    conjuntoNome: "FB+IG - Pub quente [Lisboa 40km] 18-65",
    estado: "ACTIVE",
    externalId: "120237312707190118",
    nome: "ad - V1",
  });
  assert.equal(anuncios[1]?.nome, "120237316848600118");
  assert.equal(anuncios[1]?.campanhaNome, null);
});

// ---------------------------------------------------------------------------
// A tradução para a ficha do cliente.
// ---------------------------------------------------------------------------

test("o id do anúncio da ficha traduz-se em campanha, conjunto e criativo", async () => {
  reiniciar();

  const mapa = await atribuicao.getAtribuicaoPorAnuncio(A, [
    "anuncio-1",
    "anuncio-3",
    "anuncio-que-a-meta-apagou",
  ]);

  assert.deepEqual(mapa.get("anuncio-1"), {
    campanhaExternaId: "campanha-prospecao",
    campanhaNome: "Prospeção Detail | 25-11",
    conjuntoNome: "FB+IG - Pub quente [Lisboa 40km] 18-65",
    criativoNome: "ad - V1",
  });
  assert.equal(mapa.get("anuncio-3")?.criativoNome, "AD 3 - 12 Jul");

  // Anúncio que o espelho não tem: fica fora do mapa, e quem mostra tem de
  // saber lidar com a ausência em vez de escrever "undefined" no ecrã.
  assert.equal(mapa.has("anuncio-que-a-meta-apagou"), false);
  assertTudoFiltradoPorCliente(A);
});

test("uma empresa não traduz o anúncio da outra", async () => {
  reiniciar();

  const mapa = await atribuicao.getAtribuicaoPorAnuncio(B, ["anuncio-1"]);

  assert.equal(mapa.size, 0);
  assertTudoFiltradoPorCliente(B);
});

test("sem ids para traduzir não se vai à base de dados", async () => {
  reiniciar();

  const mapa = await atribuicao.getAtribuicaoPorAnuncio(A, [null, undefined, " "]);

  assert.equal(mapa.size, 0);
  assert.equal(
    base.registos.length,
    0,
    "Uma lista vazia de ids não justifica uma leitura.",
  );
});

test("um erro na tabela de anúncios cala a origem, não parte a ficha", async () => {
  reiniciar();
  base.falharEm("select", "lexia_anuncios", "permission denied");

  const mapa = await atribuicao.getAtribuicaoPorAnuncio(A, ["anuncio-1"]);

  assert.equal(mapa.size, 0);
});

// ---------------------------------------------------------------------------
// As contagens por campanha no ecrã de Campanhas.
// ---------------------------------------------------------------------------

test("cada campanha mostra os contactos que trouxe e as marcações deles", async () => {
  reiniciar();

  const painel = await campaigns.getPainelCampanhas({
    clienteSlug: A,
    ...periodo,
  });

  const prospecao = painel.porCampanha.find((c) => c.id === "uuid-prospecao");
  const mensagens = painel.porCampanha.find((c) => c.id === "uuid-mensagens");

  // Sérgio e Ricardo vieram do anuncio-1, Kevin do anuncio-2 — os três da
  // mesma campanha.
  assert.equal(prospecao?.contactosAtribuidos, 3);
  // Sérgio e Kevin marcaram. O Ricardo desmarcou, por isso não conta.
  assert.equal(prospecao?.marcacoesAtribuidas, 2);

  // A Célia veio desta e não marcou.
  assert.equal(mensagens?.contactosAtribuidos, 1);
  assert.equal(mensagens?.marcacoesAtribuidas, 0);

  assertTudoFiltradoPorCliente(A);
});

test("a marcação liga à ficha pelos últimos 9 dígitos", async () => {
  reiniciar();

  const comIndicativo = await campaigns.getPainelCampanhas({
    clienteSlug: A,
    ...periodo,
  });

  assert.equal(
    comIndicativo.porCampanha.find((c) => c.id === "uuid-prospecao")
      ?.marcacoesAtribuidas,
    2,
    "O Sérgio tem 916005334 na ficha e 351916005334 na agenda: tem de casar.",
  );

  // A prova pela negativa: se o telefone perder os 9 dígitos, deixa de haver
  // chave e a marcação dele desaparece da contagem.
  reiniciar();
  const fichas = base.linhasDe("lexia_contactos");
  const sergio = fichas.find((linha) => linha.id === "c-sergio")!;
  sergio.telefone_digitos = "5334";

  const curto = await campaigns.getPainelCampanhas({
    clienteSlug: A,
    ...periodo,
  });

  assert.equal(
    curto.porCampanha.find((c) => c.id === "uuid-prospecao")
      ?.marcacoesAtribuidas,
    1,
  );
});

test("o total de identificados conta o anúncio apagado, a campanha não", async () => {
  reiniciar();

  const painel = await campaigns.getPainelCampanhas({
    clienteSlug: A,
    ...periodo,
  });

  // Sérgio, Kevin, Ricardo, Célia e o do anúncio apagado. O orgânico e o
  // contacto antigo ficam de fora.
  assert.equal(painel.contactosComAnuncio, 5);

  const atribuidos = painel.porCampanha.reduce(
    (total, campanha) => total + campanha.contactosAtribuidos,
    0,
  );

  assert.equal(
    atribuidos,
    4,
    "O contacto cujo anúncio desapareceu da Meta não se atribui a campanha nenhuma.",
  );
});

test("as contagens de uma empresa não aparecem na outra", async () => {
  reiniciar();

  const painel = await campaigns.getPainelCampanhas({
    clienteSlug: B,
    ...periodo,
  });

  // O contacto da empresa B carrega, de propósito no estado inicial, o id de
  // um anúncio da empresa A. Ele conta como identificado — isso é um facto da
  // ficha dele — mas a tradução não o pode resolver, porque o espelho de
  // anúncios é lido com `.eq("cliente_slug", B)`.
  assert.equal(painel.contactosComAnuncio, 1);
  assert.equal(
    painel.porCampanha.length,
    0,
    "A empresa B não tem custos nem campanhas: não pode herdar as do A.",
  );
  assertTudoFiltradoPorCliente(B);
});

test("um erro na agenda deixa os contactos de pé e as marcações a zero", async () => {
  reiniciar();
  base.falharEm("select", "lexia_agendamentos", "indisponível");

  const painel = await campaigns.getPainelCampanhas({
    clienteSlug: A,
    ...periodo,
  });

  const prospecao = painel.porCampanha.find((c) => c.id === "uuid-prospecao");

  assert.equal(prospecao?.contactosAtribuidos, 3);
  assert.equal(prospecao?.marcacoesAtribuidas, 0);
});

test("sem espelho de anúncios o ecrã mostra zero, não mostra erro", async () => {
  reiniciar();
  base.substituir("lexia_anuncios", []);

  const painel = await campaigns.getPainelCampanhas({
    clienteSlug: A,
    ...periodo,
  });

  assert.equal(painel.temDados, true);
  assert.equal(painel.gasto, 75);
  // Os contactos continuam a ter anúncio; o que falta é quem o traduza.
  assert.equal(painel.contactosComAnuncio, 5);
  assert.equal(
    painel.porCampanha.every((c) => c.contactosAtribuidos === 0),
    true,
  );
});

// ---------------------------------------------------------------------------
// A gravação: o que a sincronização escreve, e o que nunca apaga.
// ---------------------------------------------------------------------------

test("a sincronização grava o anúncio sem nunca apagar o que deixou de vir", async () => {
  reiniciar();
  escrita = new FakeSupabase({
    lexia_anuncios: [
      anuncio(A, "anuncio-ja-apagado-na-meta", "campanha-antiga", {
        campanha: "Campanha de Março",
        conjunto: "Conjunto de Março",
        criativo: "ad - Março",
      }),
    ],
  });
  anunciosDaMeta = [
    {
      adset: { id: "cj-1", name: "FB+IG - Pub quente [Lisboa 40km] 18-65" },
      campaign: { id: "campanha-prospecao", name: "Prospeção Detail | 25-11" },
      id: "anuncio-1",
      name: "ad - V1",
      status: "ACTIVE",
    },
  ];

  const resultado = await sync.syncMetaCampanhas({ clienteSlug: A });

  assert.equal(resultado.anuncios, 1);

  const gravacao = escrita.registos.find(
    (registo) =>
      registo.tabela === "lexia_anuncios" && registo.operacao === "upsert",
  );

  assert.ok(gravacao, "A sincronização tem de gravar os anúncios.");

  const linhas = escrita.linhasDe("lexia_anuncios");

  // Correr a sincronização duas vezes não pode duplicar nem mudar o número.
  assert.equal(
    linhas.filter((linha) => linha.anuncio_externo_id === "anuncio-1").length,
    1,
  );
  // E — a razão de haver um teste para isto — o anúncio que a Meta já não
  // devolve TEM de ficar. Um delete aqui apagava a origem de todas as fichas
  // antigas de uma vez, sem aviso e sem erro.
  assert.ok(
    linhas.some(
      (linha) => linha.anuncio_externo_id === "anuncio-ja-apagado-na-meta",
    ),
    "Um anúncio apagado na Meta não pode desaparecer do espelho.",
  );
  assert.equal(
    escrita.registos.some(
      (registo) =>
        registo.tabela === "lexia_anuncios" && registo.operacao === "delete",
    ),
    false,
  );
});

test("a sincronização dos anúncios diz de que cliente é", async () => {
  reiniciar();
  escrita = new FakeSupabase({});
  anunciosDaMeta = [
    {
      adset: { id: "cj-1", name: "Conjunto" },
      campaign: { id: "cp-1", name: "Campanha" },
      id: "anuncio-1",
      name: "Criativo",
      status: "ACTIVE",
    },
  ];

  await sync.syncMetaCampanhas({ clienteSlug: A });

  // A `service_role` ignora o RLS: o `cliente_slug` em cada linha é a única
  // coisa que impede o anúncio de uma empresa de ser lido por outra.
  for (const linha of escrita.linhasDe("lexia_anuncios")) {
    assert.equal(linha.cliente_slug, A);
    assert.equal(linha.plataforma, "meta");
  }
});
