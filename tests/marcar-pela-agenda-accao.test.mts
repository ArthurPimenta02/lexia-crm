/**
 * A porta de entrada do formulário de marcar: quem pode, e com que slug.
 *
 * Isto testa a `marcarNaAgendaAction` e não a camada de escrita — a camada tem
 * os seus testes no `marcar-na-agenda.test.mts`. O que vive só aqui são três
 * coisas, e as três estragam-se em silêncio:
 *
 * 1. **O `cliente_slug` vem do perfil no servidor e nunca do formulário.** Um
 *    slug aceito do navegador deixava alguém escrever um evento na agenda do
 *    Google de outra empresa. O formulário destes testes manda de propósito um
 *    slug de outra empresa, para se ver que é ignorado.
 * 2. **Os avisos travam a escrita nessa passagem.** "É domingo" devolve o
 *    aviso e não marca nada; só o segundo pedido, com `confirmado=sim`, chega
 *    ao Google. Com o aviso a passar à frente, o dono lia-o depois do evento
 *    já estar criado.
 * 3. **`confirmado` e `ignorar_conflito` são dois campos.** Confirmar o
 *    domingo não pode marcar por cima de outro trabalho. Se algum refactor os
 *    juntar num só, o teste do fim falha.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

const SLUG = "detail_by_cordeiro";
const OUTRO_SLUG = "miranda_skin_experts";

type Perfil = {
  cliente_slug: string | null;
  role: string;
} | null;

let perfil: Perfil = { cliente_slug: SLUG, role: "cliente_admin" };

/** O que cada camada foi chamada com, em ordem. */
let preparacoes: { campos: Record<string, string>; clienteSlug: string }[] = [];
let marcacoes: { clienteSlug: string; ignorarConflito: boolean }[] = [];
let revalidados: string[] = [];

let avisos: { texto: string }[] = [];
let erroDaPreparacao: string | null = null;
let conflitos: { fim: string | null; inicio: string | null; titulo: string | null }[] =
  [];
let erroDaEscrita: string | null = null;

const marcacaoFalsa = {
  duracaoMinutos: 225,
  executorChave: "martim",
  executorNome: "Martim",
  fimIso: "2026-11-18T12:45:00.000Z",
  inicioIso: "2026-11-18T09:00:00.000Z",
  nomeCliente: "Martim Teste",
  observacoes: null,
  servicoNome: "Lavagem Detalhada",
  telefone: "351912345678",
  titulo: "Lavagem Detalhada — Martim Teste",
  valor: 70,
  viatura: null,
};

mock.module("next/cache", {
  namedExports: {
    revalidatePath: (caminho: string) => revalidados.push(caminho),
  },
});
mock.module("@/lib/auth/profile", {
  namedExports: {
    getLoggedInUserProfile: async () => ({ profile: perfil, user: null }),
    isClientRole: (role: string) =>
      role === "cliente_admin" || role === "cliente_operador",
  },
});
mock.module("@/lib/agenda/marcar", {
  namedExports: {
    marcarEstaLigado: () => true,
    marcarNaAgenda: async ({
      clienteSlug,
      ignorarConflito,
    }: {
      clienteSlug: string;
      ignorarConflito: boolean;
    }) => {
      marcacoes.push({ clienteSlug, ignorarConflito });

      return {
        conflitos,
        erro: erroDaEscrita,
        linkGoogle: erroDaEscrita || conflitos.length > 0 ? null : "https://g/1",
        ok: !erroDaEscrita && conflitos.length === 0,
      };
    },
    prepararNovaMarcacao: async ({
      campos,
      clienteSlug,
    }: {
      campos: Record<string, string>;
      clienteSlug: string;
    }) => {
      preparacoes.push({ campos, clienteSlug });

      return {
        avisos,
        erro: erroDaPreparacao,
        marcacao: erroDaPreparacao ? null : marcacaoFalsa,
      };
    },
  },
});

const accoes = await import("@/app/app/agenda/actions");

/**
 * O formulário, com um `cliente_slug` de outra empresa lá dentro de propósito.
 * Nenhum campo do formulário devia conseguir mudar em que agenda se escreve.
 */
function formulario(extra: Record<string, string> = {}) {
  const dados = new FormData();

  dados.set("cliente_slug", OUTRO_SLUG);
  dados.set("contacto_id", "contacto-1");
  dados.set("data", "2026-11-18");
  dados.set("duracao", "");
  dados.set("executor", "martim");
  dados.set("hora", "09:00");
  dados.set("observacoes", "");
  dados.set("servico_id", "servico-1");
  dados.set("titulo", "Lavagem Detalhada — Martim Teste");
  dados.set("valor", "70");
  dados.set("viatura", "");

  for (const [chave, valor] of Object.entries(extra)) {
    dados.set(chave, valor);
  }

  return dados;
}

function reiniciar(novoPerfil: Perfil = { cliente_slug: SLUG, role: "cliente_admin" }) {
  perfil = novoPerfil;
  preparacoes = [];
  marcacoes = [];
  revalidados = [];
  avisos = [];
  conflitos = [];
  erroDaPreparacao = null;
  erroDaEscrita = null;
}

test("uma marcação válida é escrita e a página da agenda é refrescada", async () => {
  reiniciar();

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, true, resultado.mensagem);
  assert.match(resultado.mensagem, /Lavagem Detalhada/);
  assert.match(resultado.mensagem, /Martim Teste/);
  assert.equal(resultado.linkGoogle, "https://g/1");
  assert.deepEqual(revalidados, ["/app/agenda"]);
});

/**
 * A regra que não pode ceder. O `cliente_slug` do formulário é lixo: a agenda
 * em que se escreve é a do perfil autenticado.
 */
test("o cliente_slug vem do perfil e não do formulário", async () => {
  reiniciar();

  await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(preparacoes.length, 1);
  assert.equal(preparacoes[0].clienteSlug, SLUG);
  assert.equal(marcacoes[0].clienteSlug, SLUG);
});

test("sem sessão não se prepara nem se marca nada", async () => {
  reiniciar(null);

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /permissão/i);
  assert.equal(preparacoes.length, 0);
  assert.equal(marcacoes.length, 0);
});

/**
 * Marcar escreve na agenda do Google e cria uma venda. É do dono, não de quem
 * só lê as conversas.
 */
test("um operador do cliente não marca", async () => {
  reiniciar({ cliente_slug: SLUG, role: "cliente_operador" });

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, false);
  assert.equal(marcacoes.length, 0);
});

test("o admin da Lexia não marca pela aba do cliente", async () => {
  reiniciar({ cliente_slug: null, role: "lexia_admin" });

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, false);
  assert.equal(marcacoes.length, 0);
});

test("um perfil de cliente sem slug não marca em agenda nenhuma", async () => {
  reiniciar({ cliente_slug: null, role: "cliente_admin" });

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, false);
  assert.equal(preparacoes.length, 0);
});

test("um erro de validação não chega ao Google", async () => {
  reiniciar();
  erroDaPreparacao = "Escolhe o cliente.";

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, false);
  assert.equal(resultado.mensagem, "Escolhe o cliente.");
  assert.equal(marcacoes.length, 0);
  assert.deepEqual(revalidados, []);
});

/**
 * O teste que mais interessa dos três. Nada é escrito nesta passagem: os
 * avisos existem para serem lidos antes de o evento entrar na agenda.
 */
test("com avisos, nada vai ao Google e o dono recebe-os para ler", async () => {
  reiniciar();
  avisos = [{ texto: "Martim não trabalha neste dia da semana." }];

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, false);
  assert.deepEqual(resultado.avisos, [
    "Martim não trabalha neste dia da semana.",
  ]);
  assert.equal(marcacoes.length, 0, "marcou sem ninguém confirmar o aviso");
  assert.deepEqual(revalidados, []);
});

test("dois avisos dizem-se no plural, para se perceber que são dois", async () => {
  reiniciar();
  avisos = [{ texto: "Esta hora já passou." }, { texto: "É domingo." }];

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.match(resultado.mensagem, /2 coisas/);
  assert.equal(resultado.avisos.length, 2);
});

test("confirmado=sim passa à frente dos avisos e marca", async () => {
  reiniciar();
  avisos = [{ texto: "É domingo." }];

  const resultado = await accoes.marcarNaAgendaAction(
    null,
    formulario({ confirmado: "sim" }),
  );

  assert.equal(resultado.ok, true, resultado.mensagem);
  assert.equal(marcacoes.length, 1);
});

/**
 * Os dois campos são separados por isto: confirmar o aviso de horário não pode
 * arrastar consigo a autorização para marcar por cima de outro trabalho.
 */
test("confirmar os avisos não liga o ignorar_conflito", async () => {
  reiniciar();
  avisos = [{ texto: "É domingo." }];

  await accoes.marcarNaAgendaAction(null, formulario({ confirmado: "sim" }));

  assert.equal(marcacoes[0].ignorarConflito, false);
});

test("ignorar_conflito=sim é o que deixa marcar à mesma hora", async () => {
  reiniciar();

  await accoes.marcarNaAgendaAction(
    null,
    formulario({ ignorar_conflito: "sim" }),
  );

  assert.equal(marcacoes[0].ignorarConflito, true);
});

test("qualquer outro valor em ignorar_conflito não conta como sim", async () => {
  reiniciar();

  await accoes.marcarNaAgendaAction(
    null,
    formulario({ ignorar_conflito: "true" }),
  );

  assert.equal(marcacoes[0].ignorarConflito, false);
});

/**
 * Um choque de horários não é um erro a dizer "não deu": é a lista do que já
 * lá está, para o dono decidir. E a página não se refresca, porque não entrou
 * nada.
 */
test("um choque de horários devolve o que já está marcado", async () => {
  reiniciar();
  conflitos = [
    {
      fim: "2026-11-18T10:00:00.000Z",
      inicio: "2026-11-18T09:00:00.000Z",
      titulo: "Lavagem Express",
    },
  ];

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, false);
  assert.equal(resultado.conflitos.length, 1);
  assert.match(resultado.mensagem, /Martim/);
  assert.deepEqual(revalidados, []);
});

test("se a escrita falhar, a página não é refrescada e diz-se o motivo", async () => {
  reiniciar();
  erroDaEscrita = "A agenda não respondeu a tempo.";

  const resultado = await accoes.marcarNaAgendaAction(null, formulario());

  assert.equal(resultado.ok, false);
  assert.equal(resultado.mensagem, "A agenda não respondeu a tempo.");
  assert.deepEqual(revalidados, []);
});
