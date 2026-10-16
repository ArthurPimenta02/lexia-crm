/**
 * Isolamento entre clientes na ficha de clientes.
 *
 * Aqui o risco é maior do que nos produtos, por duas razões.
 *
 * A primeira é a de sempre: `lib/clientes/write.ts` escreve com
 * `createAdminClient()`, que é a `service_role` e **ignora o RLS**. Sem o
 * `.eq("cliente_slug", …)` em cada consulta não há nada em Postgres a impedir
 * uma empresa de editar os contactos da outra.
 *
 * A segunda é nova: estas escritas aceitam um TELEFONE do formulário. O
 * telefone não é um uuid — é um número que duas empresas podem ter na lista ao
 * mesmo tempo, porque a mesma pessoa pode ser cliente das duas. Se a procura
 * de duplicados perdesse o filtro de cliente, o painel do Detail passava a
 * revelar o nome e o número de um cliente da Miranda só por alguém escrever o
 * número. É fuga de dados, não é um erro de contabilidade.
 *
 * Por isso o teste principal não verifica mensagens: verifica que a linha da
 * outra empresa não é vista nem tocada.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const A = "empresa_a";
const B = "empresa_b";

const CONTACTO_A1 = "contacto-a1";
const CONTACTO_A2 = "contacto-a2";
const CONTACTO_B1 = "contacto-b1";

/**
 * A mesma pessoa é cliente das duas empresas, com o mesmo número.
 *
 * `telefone_digitos` é uma coluna GERADA pelo Postgres. O duplo não a gera, por
 * isso vem escrita aqui — e tem de vir, senão o teste passava por o filtro não
 * encontrar nada em vez de por ele estar correcto.
 */
const NUMERO = "351912345678";

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_contactos: [
      // O contacto com o número hifenizado. É a forma exacta dos cinco
      // duplicados reais medidos no Detail: a Meta entrega o mesmo número às
      // vezes com hífen e às vezes sem, e o `identificador_conversa` fica com
      // o formato que chegou.
      {
        canal: "whatsapp",
        cliente_slug: A,
        fundido_em: null,
        id: CONTACTO_A1,
        identificador_conversa: "whatsapp:35191234-5678",
        nome: "Cliente da Empresa A",
        notas: null,
        telefone: "35191234-5678",
        telefone_digitos: NUMERO,
      },
      {
        canal: "whatsapp",
        cliente_slug: A,
        fundido_em: null,
        id: CONTACTO_A2,
        identificador_conversa: "whatsapp:351999888777",
        nome: "Outro da Empresa A",
        notas: null,
        telefone: "351999888777",
        telefone_digitos: "351999888777",
      },
      {
        canal: "whatsapp",
        cliente_slug: B,
        fundido_em: null,
        id: CONTACTO_B1,
        identificador_conversa: `whatsapp:${NUMERO}`,
        nome: "Cliente da Empresa B",
        notas: "Nota privada da empresa B",
        telefone: NUMERO,
        telefone_digitos: NUMERO,
      },
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});

const write = await import("@/lib/clientes/write");

function reiniciar() {
  base = new FakeSupabase(estadoInicial());
}

function contactos() {
  return base.linhasDe("lexia_contactos");
}

function contacto(id: string) {
  return contactos().find((linha) => linha.id === id);
}

/** Nenhuma consulta a `lexia_contactos` corre sem dizer de que cliente é. */
function assertTudoFiltradoPorCliente(slug: string) {
  for (const registo of base.registos) {
    if (registo.tabela !== "lexia_contactos") {
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
      `${registo.operacao} em lexia_contactos correu sem amarrar o cliente ${slug}: ${JSON.stringify(registo)}`,
    );
  }
}

const comum = {
  caminhoParaRevalidar: "/app/clientes",
  userId: "utilizador-1",
};

test("a procura de duplicados não vê o contacto da outra empresa", async () => {
  reiniciar();

  // A empresa B escreve um número que a empresa A também tem. Se o aviso de
  // duplicado não filtrasse por cliente, devolvia aqui o nome do cliente da
  // empresa A — e o número já era conhecido, portanto o que se revelava era o
  // nome e a relação comercial.
  const resultado = await write.criarCliente({
    ...comum,
    clienteSlug: B,
    confirmado: false,
    nomeBruto: "Nome Novo",
    notasBruto: "",
    telefoneBruto: "351999888777",
  });

  for (const duplicado of resultado.duplicados ?? []) {
    assert.notEqual(
      duplicado.id,
      CONTACTO_A2,
      "o aviso de duplicado revelou um contacto da outra empresa",
    );
  }

  assert.equal(resultado.ok, true);
  assertTudoFiltradoPorCliente(B);
});

test("criar com um número já na própria lista pára para avisar, e não grava", async () => {
  reiniciar();

  // O mesmo número do CONTACTO_A1, escrito sem o hífen. É isto que o painel
  // tem de ver e a coluna `telefone` não vê.
  const resultado = await write.criarCliente({
    ...comum,
    clienteSlug: A,
    confirmado: false,
    nomeBruto: "Nome Novo",
    notasBruto: "",
    telefoneBruto: NUMERO,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.duplicados?.length, 1);
  assert.equal(resultado.duplicados?.[0].id, CONTACTO_A1);
  assert.equal(contactos().filter((linha) => linha.cliente_slug === A).length, 2);
  assertTudoFiltradoPorCliente(A);
});

test("confirmado, cria mesmo assim, e só na própria empresa", async () => {
  reiniciar();

  const resultado = await write.criarCliente({
    ...comum,
    clienteSlug: A,
    confirmado: true,
    nomeBruto: "Nome Novo",
    notasBruto: "nota",
    telefoneBruto: "351 91234-5679",
  });

  assert.equal(resultado.ok, true);

  const novos = contactos().filter((linha) => linha.nome === "Nome Novo");
  assert.equal(novos.length, 1);
  assert.equal(novos[0].cliente_slug, A);
  assert.equal(novos[0].canal, "whatsapp");
  assert.equal(novos[0].identificador_conversa, "whatsapp:351912345679");
  assertTudoFiltradoPorCliente(A);
});

test("criar com o número exacto de uma conversa que já existe é recusado", async () => {
  reiniciar();

  // O CONTACTO_A2 já tem este número e já tem o identificador nesta forma.
  // Não é um duplicado para juntar — é a mesma linha.
  const resultado = await write.criarCliente({
    ...comum,
    clienteSlug: A,
    confirmado: true,
    nomeBruto: "Nome Novo",
    notasBruto: "",
    telefoneBruto: "351999888777",
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /já está no painel/);
  assert.equal(contactos().length, 3);
  assertTudoFiltradoPorCliente(A);
});

test("um PSID de Instagram não passa por telefone", async () => {
  reiniciar();

  // Medido a 2026-10-16: há PSIDs de Instagram com 15 dígitos. A régua do
  // agente (8 a 15) deixava-os passar; esta (9 a 14) não.
  const resultado = await write.criarCliente({
    ...comum,
    clienteSlug: A,
    confirmado: false,
    nomeBruto: "PSID Disfarçado",
    notasBruto: "",
    telefoneBruto: "275278116535591",
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /não parece um número de telefone/);
  assert.equal(contactos().length, 3);
});

test("gravar notas num contacto de outra empresa não lhe toca", async () => {
  reiniciar();

  const resultado = await write.gravarNotasDoCliente({
    ...comum,
    clienteSlug: A,
    contactoId: CONTACTO_B1,
    notasBruto: "escrito pela empresa A",
  });

  assert.equal(resultado.ok, false);
  assert.equal(contacto(CONTACTO_B1)?.notas, "Nota privada da empresa B");
  assertTudoFiltradoPorCliente(A);
});

test("gravar notas no contacto próprio grava", async () => {
  reiniciar();

  const resultado = await write.gravarNotasDoCliente({
    ...comum,
    clienteSlug: A,
    contactoId: CONTACTO_A1,
    notasBruto: "  Audi A4, cliente antigo  ",
  });

  assert.equal(resultado.ok, true);
  assert.equal(contacto(CONTACTO_A1)?.notas, "Audi A4, cliente antigo");
  assertTudoFiltradoPorCliente(A);
});

test("juntar um contacto de outra empresa ao próprio é recusado", async () => {
  reiniciar();

  const resultado = await write.juntarClientes({
    ...comum,
    clienteSlug: A,
    duplicadoId: CONTACTO_B1,
    principalId: CONTACTO_A1,
  });

  assert.equal(resultado.ok, false);
  assert.equal(contacto(CONTACTO_B1)?.fundido_em, null);
  assertTudoFiltradoPorCliente(A);
});

test("juntar o próprio contacto a um da outra empresa é recusado", async () => {
  reiniciar();

  const resultado = await write.juntarClientes({
    ...comum,
    clienteSlug: A,
    duplicadoId: CONTACTO_A2,
    principalId: CONTACTO_B1,
  });

  assert.equal(resultado.ok, false);
  assert.equal(contacto(CONTACTO_A2)?.fundido_em, null);
  assertTudoFiltradoPorCliente(A);
});

test("juntar dois contactos próprios marca o duplicado e não apaga nada", async () => {
  reiniciar();

  const resultado = await write.juntarClientes({
    ...comum,
    clienteSlug: A,
    duplicadoId: CONTACTO_A2,
    principalId: CONTACTO_A1,
  });

  assert.equal(resultado.ok, true);

  // A linha fica. Se fosse apagada, o Omnichannel criava-a outra vez na
  // mensagem seguinte daquela conversa.
  assert.equal(contactos().length, 3);
  assert.equal(contacto(CONTACTO_A2)?.fundido_em, CONTACTO_A1);
  assert.equal(contacto(CONTACTO_A2)?.fundido_por, "utilizador-1");
  assert.ok(contacto(CONTACTO_A2)?.fundido_quando);
  assertTudoFiltradoPorCliente(A);
});

test("não se fazem correntes: juntar a um contacto já fundido é recusado", async () => {
  reiniciar();
  contacto(CONTACTO_A2)!.fundido_em = CONTACTO_A1;

  const resultado = await write.juntarClientes({
    ...comum,
    clienteSlug: A,
    duplicadoId: CONTACTO_A1,
    principalId: CONTACTO_A2,
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /já está junto/);
  assert.equal(contacto(CONTACTO_A1)?.fundido_em, null);
});

test("separar um contacto de outra empresa é recusado", async () => {
  reiniciar();
  contacto(CONTACTO_B1)!.fundido_em = "qualquer-coisa";

  const resultado = await write.separarClientes({
    ...comum,
    clienteSlug: A,
    duplicadoId: CONTACTO_B1,
  });

  assert.equal(resultado.ok, false);
  assert.equal(contacto(CONTACTO_B1)?.fundido_em, "qualquer-coisa");
  assertTudoFiltradoPorCliente(A);
});

test("separar o contacto próprio desfaz a junção", async () => {
  reiniciar();
  contacto(CONTACTO_A2)!.fundido_em = CONTACTO_A1;

  const resultado = await write.separarClientes({
    ...comum,
    clienteSlug: A,
    duplicadoId: CONTACTO_A2,
  });

  assert.equal(resultado.ok, true);
  assert.equal(contacto(CONTACTO_A2)?.fundido_em, null);
  assertTudoFiltradoPorCliente(A);
});
