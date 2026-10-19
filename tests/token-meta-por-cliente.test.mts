/**
 * Cada cliente pode ter o seu token da Meta.
 *
 * Isto não é uma preferência de arrumação. Medido a 19/10/2026 contra a API da
 * Meta: o `META_ADS_TOKEN` que está em produção é um system user da app
 * "Messenger Detail By Cordeiro" e `/me/adaccounts` devolve-lhe uma única conta
 * — a do Detail. Ligar as campanhas de outro cliente só com o
 * `${SLUG}_META_ADS_ACCOUNT_ID` daria zero linhas e nenhum erro visível: o
 * token não tem o asset, e não devia ter.
 *
 * Três coisas aqui têm de ficar presas por um teste.
 *
 * 1. O token do cliente GANHA ao global. Se o global ganhasse, acrescentar
 *    `MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN` não mudava nada e a pessoa ficava a
 *    olhar para um painel vazio sem saber porquê.
 *
 * 2. O global continua a servir de recurso. O Detail está a funcionar com ele
 *    hoje; uma mudança que o ignore apaga as campanhas de quem já funciona.
 *
 * 3. O nome da variável deriva do slug e não se escreve à mão.
 *    `miranda_skin_experts` dá `MIRANDA_SKIN_EXPERTS_...`, não `MIRANDA_...`.
 *    Perdi uma volta inteira a confiar no nome deduzido em vez de executar a
 *    função.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

const DETAIL = "detail_by_cordeiro";
const MIRANDA = "miranda_skin_experts";

// `lib/meta/ads.ts` começa com `import "server-only"`, que fora do Next se
// recusa a carregar. Sem isto o ficheiro inteiro explode na primeira linha.
mock.module("server-only", { namedExports: {} });

const ads = await import("@/lib/meta/ads");

/**
 * As variáveis que estes testes mexem. Guardadas e repostas a cada teste para
 * que a ordem dos testes não mude o resultado de nenhum.
 */
const variaveis = [
  "META_ADS_TOKEN",
  "DETAIL_BY_CORDEIRO_META_ADS_ACCOUNT_ID",
  "DETAIL_BY_CORDEIRO_META_ADS_TOKEN",
  "MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID",
  "MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN",
];

function limpar() {
  for (const nome of variaveis) {
    delete process.env[nome];
  }
}

// ---------------------------------------------------------------------------
// Os nomes das variáveis. Derivados, nunca escritos à mão.
// ---------------------------------------------------------------------------

test("o nome da variável do token sai do slug inteiro", () => {
  assert.equal(
    ads.getMetaAdsTokenEnvName(MIRANDA),
    "MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN",
  );
  assert.equal(
    ads.getMetaAdsTokenEnvName(DETAIL),
    "DETAIL_BY_CORDEIRO_META_ADS_TOKEN",
  );
});

test("a conta e o token usam o mesmo prefixo", () => {
  for (const slug of [DETAIL, MIRANDA, "asteric"]) {
    const conta = ads.getMetaAdsAccountEnvName(slug);
    const token = ads.getMetaAdsTokenEnvName(slug);

    assert.equal(
      conta.replace(/_META_ADS_ACCOUNT_ID$/, ""),
      token.replace(/_META_ADS_TOKEN$/, ""),
      `O prefixo de ${slug} não é o mesmo nas duas variáveis.`,
    );
  }
});

// ---------------------------------------------------------------------------
// Qual token é que a configuração escolhe.
// ---------------------------------------------------------------------------

test("o token do cliente ganha ao global", () => {
  limpar();
  process.env.META_ADS_TOKEN = "token-do-detail";
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID = "act_222";
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN = "token-da-miranda";

  const config = ads.getMetaAdsConfig(MIRANDA);

  assert.equal(config?.token, "token-da-miranda");
  limpar();
});

test("o global serve de recurso a quem não tem token próprio", () => {
  limpar();
  process.env.META_ADS_TOKEN = "token-do-detail";
  process.env.DETAIL_BY_CORDEIRO_META_ADS_ACCOUNT_ID = "act_111";

  const config = ads.getMetaAdsConfig(DETAIL);

  assert.equal(config?.token, "token-do-detail");
  assert.equal(config?.accountId, "act_111");
  limpar();
});

test("o token de um cliente não serve a conta de outro", () => {
  limpar();
  process.env.DETAIL_BY_CORDEIRO_META_ADS_TOKEN = "token-do-detail";
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID = "act_222";

  // Sem global e sem token dela, a Miranda fica sem configuração em vez de ir
  // bater à Meta com o token do Detail — que receberia #190 ou zero linhas.
  assert.equal(ads.getMetaAdsConfig(MIRANDA), null);
  limpar();
});

test("sem conta de anúncios não há configuração, mesmo com token", () => {
  limpar();
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN = "token-da-miranda";

  assert.equal(ads.getMetaAdsConfig(MIRANDA), null);
  limpar();
});

test("um token só de espaços conta como ausente", () => {
  limpar();
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID = "act_222";
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN = "   ";
  process.env.META_ADS_TOKEN = "token-do-detail";

  // Uma variável criada e deixada vazia na Vercel é o erro mais fácil de
  // cometer. Tratá-la como presente dava um 401 da Meta sem explicação.
  assert.equal(ads.getMetaAdsConfig(MIRANDA)?.token, "token-do-detail");
  limpar();
});

test("a conta aceita o número sem o act_ à frente", () => {
  limpar();
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID = "222";
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN = "token-da-miranda";

  assert.equal(ads.getMetaAdsConfig(MIRANDA)?.accountId, "act_222");
  limpar();
});

// ---------------------------------------------------------------------------
// O que o painel do admin diz a quem tem de criar as variáveis.
// ---------------------------------------------------------------------------

test("sem nada configurado faltam as duas variáveis, pelo nome", () => {
  limpar();

  assert.deepEqual(ads.getMetaAdsVariaveisEmFalta(MIRANDA), [
    "MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID",
    "MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN",
  ]);
});

test("com o global lá, só falta a conta", () => {
  limpar();
  process.env.META_ADS_TOKEN = "token-do-detail";

  // Quem já funciona com o global não deve ver um aviso a pedir-lhe uma
  // variável nova que não precisa de criar.
  assert.deepEqual(ads.getMetaAdsVariaveisEmFalta(MIRANDA), [
    "MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID",
  ]);
  limpar();
});

test("com a conta lá e sem token nenhum, só falta o token", () => {
  limpar();
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID = "act_222";

  assert.deepEqual(ads.getMetaAdsVariaveisEmFalta(MIRANDA), [
    "MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN",
  ]);
  limpar();
});

test("configurado a sério não falta nada", () => {
  limpar();
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID = "act_222";
  process.env.MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN = "token-da-miranda";

  assert.deepEqual(ads.getMetaAdsVariaveisEmFalta(MIRANDA), []);
  assert.notEqual(ads.getMetaAdsConfig(MIRANDA), null);
  limpar();
});

test("a lista do que falta e a configuração nunca se contradizem", () => {
  limpar();

  // O painel decide por `getMetaAdsConfig` se mostra "sem conta ligada" e por
  // `getMetaAdsVariaveisEmFalta` o que diz a seguir. Se as duas discordassem, o
  // ecrã dizia "não está ligado" e "não falta nada" na mesma frase.
  for (const conta of [null, "act_222"]) {
    for (const tokenCliente of [null, "token-da-miranda"]) {
      for (const tokenGlobal of [null, "token-do-detail"]) {
        limpar();

        if (conta) {
          process.env.MIRANDA_SKIN_EXPERTS_META_ADS_ACCOUNT_ID = conta;
        }

        if (tokenCliente) {
          process.env.MIRANDA_SKIN_EXPERTS_META_ADS_TOKEN = tokenCliente;
        }

        if (tokenGlobal) {
          process.env.META_ADS_TOKEN = tokenGlobal;
        }

        const ligado = ads.getMetaAdsConfig(MIRANDA) !== null;
        const faltam = ads.getMetaAdsVariaveisEmFalta(MIRANDA);

        assert.equal(
          ligado,
          faltam.length === 0,
          `conta=${conta} cliente=${tokenCliente} global=${tokenGlobal}: ligado=${ligado} mas faltam ${faltam.length}.`,
        );
      }
    }
  }

  limpar();
});
