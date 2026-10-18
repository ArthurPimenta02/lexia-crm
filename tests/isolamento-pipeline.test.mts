/**
 * Isolamento entre clientes na leitura do pipeline.
 *
 * O risco concreto: `lib/pipeline/read.ts` lê quatro tabelas com
 * `createAdminClient()`, que usa a `service_role` e portanto **ignora o RLS**.
 * As políticas que estão na migration não valem nada neste caminho — a única
 * coisa que impede o quadro do Detail de mostrar os leads da Miranda é cada
 * uma das quatro consultas trazer o seu `.eq("cliente_slug", …)`.
 *
 * E não é só o cartão aparecer na lista. A ponte com a agenda são os últimos 9
 * dígitos do telefone; se a leitura da agenda perdesse o filtro, uma marcação
 * de outra empresa com um número parecido punha um lead na coluna "Agendado"
 * com uma hora que não existe no calendário de ninguém.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const A = "empresa_a";
const B = "empresa_b";

const AGORA = new Date("2026-10-18T12:00:00.000Z");

const tabelasDoInquilino = [
  "lexia_agendamentos",
  "lexia_contactos",
  "lexia_conversation_insights",
  "lexia_mensagens",
];

/**
 * As duas empresas com o MESMO telefone de propósito.
 *
 * É esse o caso que revela um filtro em falta: com números diferentes, uma
 * leitura sem filtro trazia linhas a mais que não casavam com nada e o teste
 * passava por acidente.
 */
const TELEFONE = "351912345678";

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_agendamentos: [
      {
        cliente_slug: A,
        estado: "confirmado",
        inicio: "2026-10-20T09:00:00.000Z",
        servico: "Lavagem da empresa A",
        telefone_digitos: TELEFONE,
      },
      {
        cliente_slug: B,
        estado: "confirmado",
        inicio: "2026-10-19T09:00:00.000Z",
        servico: "Tratamento da empresa B",
        telefone_digitos: TELEFONE,
      },
      // Desmarcada: fica na tabela para se poder contar quantas caíram, mas
      // não pode continuar a segurar o lead em "Agendado".
      {
        cliente_slug: A,
        estado: "cancelado",
        inicio: "2026-10-21T09:00:00.000Z",
        servico: "Lavagem desmarcada",
        telefone_digitos: "351933333333",
      },
    ],
    lexia_contactos: [
      {
        atualizado_em: null,
        canal: "whatsapp",
        cliente_slug: A,
        criado_em: "2026-10-01T09:00:00.000Z",
        fundido_em: null,
        id: "contacto-a",
        identificador_conversa: "conversa-a",
        nome: "Lead da empresa A",
        telefone: TELEFONE,
        telefone_digitos: TELEFONE,
      },
      {
        atualizado_em: null,
        canal: "whatsapp",
        cliente_slug: B,
        criado_em: "2026-10-01T09:00:00.000Z",
        fundido_em: null,
        id: "contacto-b",
        identificador_conversa: "conversa-b",
        nome: "Lead da empresa B",
        telefone: TELEFONE,
        telefone_digitos: TELEFONE,
      },
      // Fundido: continua a receber mensagens mas já não é uma pessoa à parte.
      {
        atualizado_em: null,
        canal: "whatsapp",
        cliente_slug: A,
        criado_em: "2026-10-02T09:00:00.000Z",
        fundido_em: "2026-10-05T09:00:00.000Z",
        id: "contacto-a-fundido",
        identificador_conversa: "conversa-a-fundida",
        nome: "O mesmo lead outra vez",
        telefone: TELEFONE,
        telefone_digitos: TELEFONE,
      },
      // Conversa de teste da área de testes: não é um lead.
      {
        atualizado_em: null,
        canal: "whatsapp",
        cliente_slug: A,
        criado_em: "2026-10-03T09:00:00.000Z",
        fundido_em: null,
        id: "contacto-a-teste",
        identificador_conversa: "teste:abc",
        nome: "Simulação",
        telefone: TELEFONE,
        telefone_digitos: TELEFONE,
      },
    ],
    lexia_conversation_insights: [
      {
        cliente_slug: A,
        identificador_conversa: "conversa-a",
        resultado: "interessado",
      },
      {
        cliente_slug: B,
        identificador_conversa: "conversa-b",
        resultado: "perdido",
      },
    ],
    lexia_mensagens: [
      {
        cliente_slug: A,
        criado_em: "2026-10-17T09:00:00.000Z",
        direccao: "enviada",
        identificador_conversa: "conversa-a",
      },
      {
        cliente_slug: B,
        criado_em: "2026-10-17T10:00:00.000Z",
        direccao: "recebida",
        identificador_conversa: "conversa-b",
      },
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});

const read = await import("@/lib/pipeline/read");

function reiniciar() {
  base = new FakeSupabase(estadoInicial());
}

/**
 * A verificação transversal: nenhuma das quatro leituras pode correr sem dizer
 * de que cliente é.
 */
function assertTudoFiltradoPorCliente(slug: string) {
  for (const registo of base.registos) {
    if (!tabelasDoInquilino.includes(registo.tabela)) {
      continue;
    }

    assert.ok(
      registo.filtros.some(
        (filtro) => filtro.coluna === "cliente_slug" && filtro.valor === slug,
      ),
      `${registo.operacao} em ${registo.tabela} correu sem amarrar o cliente ${slug}`,
    );
  }
}

test("o quadro de uma empresa não traz cartões da outra", async () => {
  reiniciar();

  const { cartoes } = await read.getPipeline(A, AGORA);

  assert.deepEqual(
    cartoes.map((cartao) => cartao.id),
    ["contacto-a"],
  );
  assertTudoFiltradoPorCliente(A);
});

test("a marcação que entra no cartão é a da própria empresa", async () => {
  reiniciar();

  const { cartoes } = await read.getPipeline(A, AGORA);
  const [cartao] = cartoes;

  // As duas empresas têm o mesmo telefone na agenda. Sem o filtro de cliente,
  // a marcação da empresa B — que é mais cedo e portanto ganhava a ordenação
  // — aparecia aqui.
  assert.equal(cartao.etapa, "agendado");
  assert.equal(cartao.marcacaoEm, "2026-10-20T09:00:00.000Z");
  assert.equal(cartao.marcacaoServico, "Lavagem da empresa A");
});

test("uma marcação desmarcada não segura o lead em Agendado", async () => {
  reiniciar();
  // Deixar a empresa A só com a marcação cancelada.
  base.substituir(
    "lexia_agendamentos",
    base
      .linhasDe("lexia_agendamentos")
      .filter((linha) => linha.estado === "cancelado"),
  );
  base.linhasDe("lexia_agendamentos")[0].telefone_digitos = TELEFONE;

  const { cartoes } = await read.getPipeline(A, AGORA);

  assert.equal(cartoes[0].marcacaoEm, null);
  assert.notEqual(cartoes[0].etapa, "agendado");
});

test("a etiqueta da IA que viaja no cartão é a da própria empresa", async () => {
  reiniciar();

  const { cartoes } = await read.getPipeline(A, AGORA);

  assert.equal(cartoes[0].resultado, "Interessado");
  assertTudoFiltradoPorCliente(A);
});

test("contactos fundidos e conversas de teste ficam fora do quadro", async () => {
  reiniciar();

  const { cartoes } = await read.getPipeline(A, AGORA);
  const ids = cartoes.map((cartao) => cartao.id);

  assert.ok(!ids.includes("contacto-a-fundido"));
  assert.ok(!ids.includes("contacto-a-teste"));
});

test("sem cliente associado não se lê nada da base", async () => {
  reiniciar();

  const resultado = await read.getPipeline("", AGORA);

  assert.equal(resultado.cartoes.length, 0);
  assert.match(resultado.erro ?? "", /Sem cliente/);
  assert.equal(base.registos.length, 0);
});

test("uma leitura que falha dá erro em vez de um quadro vazio", async () => {
  reiniciar();
  base.falharEm("select", "lexia_contactos", "ligação perdida");

  const resultado = await read.getPipeline(A, AGORA);

  // Um quadro vazio sem erro lê-se como "não tens leads", que é a pior
  // mentira que este painel pode contar.
  assert.equal(resultado.cartoes.length, 0);
  assert.equal(resultado.erro, "Não foi possível carregar o pipeline.");
});
