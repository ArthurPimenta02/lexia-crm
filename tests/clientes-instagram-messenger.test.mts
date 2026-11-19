/**
 * Os leads do Instagram e do Messenger na lista de clientes (19/11).
 *
 * Até aqui a lista só tinha quem tinha nome E telefone, e nos canais da Meta a
 * coluna `telefone` leva o PSID — por isso ficavam todos de fora. Agora
 * entram, e três coisas têm de continuar verdadeiras:
 *
 * 1. O PSID nunca aparece como telefone, nem na ficha nem nos contactos
 *    juntos. É um identificador interno da Meta e não serve a ninguém.
 * 2. O telefone de um lead de Meta é o que ELE escreveu ao agente e que bate
 *    com uma marcação DA MESMA EMPRESA. Um número escrito que não bate com
 *    nada (um NIF, uma encomenda) não se mostra; um que só bate com uma
 *    marcação da outra empresa também não — isso era ligar uma pessoa a um
 *    cliente de outro negócio.
 * 3. Fundidos e conversas `teste:` continuam fora, e o que fica fora conta-se.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const A = "empresa_a";
const B = "empresa_b";

const PSID_IG = "1163213369390678";
const PSID_IG_SEM_TEL = "29351454367806464";
const PSID_MSG = "28561313140229915";
const PSID_MSG_VAZIO = "39589939543982540";
const PSID_IG_NIF = "2267051960741570";
const PSID_IG_DE_B = "998411119469635";
const PSID_JUNTO = "27706423622324276";

function contacto(campos: Partial<Linha> & { id: string }): Linha {
  return {
    canal: "whatsapp",
    cliente_slug: A,
    criado_em: "2026-11-01T10:00:00.000Z",
    email: null,
    fundido_em: null,
    idade: null,
    idade_registada_em: null,
    identificador_conversa: `whatsapp:${campos.id}`,
    morada: null,
    nome: null,
    notas: null,
    origem_manual: null,
    origem_manual_nota: null,
    origem_source_id: null,
    origem_tipo: null,
    telefone: null,
    viatura: null,
    ...campos,
  };
}

function mensagem(
  contactoId: string,
  conteudo: string,
  slug = A,
  direccao = "recebida",
): Linha {
  return {
    cliente_slug: slug,
    contacto_id: contactoId,
    conteudo,
    criado_em: "2026-11-02T10:00:00.000Z",
    direccao,
  };
}

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_agendamentos: [
      // A marcação feita pelo agente, com o número sem indicativo — a ponte
      // é pelos últimos 9 dígitos, como no pipeline.
      {
        cliente_slug: A,
        estado: "confirmado",
        inicio: "2026-11-05T09:00:00.000Z",
        telefone_digitos: "932691606",
      },
      // Uma marcação da OUTRA empresa, com o número que um lead de A escreveu.
      {
        cliente_slug: B,
        estado: "confirmado",
        inicio: "2026-11-06T09:00:00.000Z",
        telefone_digitos: "351961452907",
      },
    ],
    lexia_contactos: [
      contacto({
        id: "wa",
        nome: "Cliente do WhatsApp",
        telefone: "351912345678",
      }),
      // WhatsApp sem nome: a regra antiga continua.
      contacto({ id: "wa-sem-nome", telefone: "351999888777" }),
      contacto({
        canal: "instagram",
        id: "ig-marcou",
        identificador_conversa: `instagram:${PSID_IG}`,
        nome: "Daniel Ferreira",
        origem_tipo: "instagram_ad",
        telefone: PSID_IG,
      }),
      contacto({
        canal: "instagram",
        id: "ig-sem-tel",
        identificador_conversa: `instagram:${PSID_IG_SEM_TEL}`,
        nome: "Agostino Izzo",
        origem_tipo: "organico",
        telefone: "",
      }),
      contacto({
        canal: "instagram",
        id: "ig-nif",
        identificador_conversa: `instagram:${PSID_IG_NIF}`,
        nome: "Nicoli Mello",
        telefone: PSID_IG_NIF,
      }),
      contacto({
        canal: "instagram",
        id: "ig-numero-de-b",
        identificador_conversa: `instagram:${PSID_IG_DE_B}`,
        nome: "Mateus",
        telefone: PSID_IG_DE_B,
      }),
      contacto({
        canal: "messenger",
        id: "msg-sem-nome",
        identificador_conversa: `messenger:${PSID_MSG}`,
        origem_tipo: "anuncio",
        telefone: PSID_MSG,
      }),
      // Sem nome, sem número e sem uma mensagem: fica de fora, contado.
      contacto({
        canal: "messenger",
        id: "msg-vazio",
        identificador_conversa: `messenger:${PSID_MSG_VAZIO}`,
        telefone: "",
      }),
      // Um Messenger absorvido pelo WhatsApp: aparece dentro dele, sem PSID.
      contacto({
        canal: "messenger",
        fundido_em: "wa",
        id: "msg-junto",
        identificador_conversa: `messenger:${PSID_JUNTO}`,
        nome: "Cliente do WhatsApp",
        telefone: PSID_JUNTO,
      }),
      contacto({
        canal: "instagram",
        id: "ig-teste",
        identificador_conversa: "teste:instagram-qualquer",
        nome: "Teste do painel",
        telefone: "1111111111111111",
      }),
      // A outra empresa, com um lead do Instagram com nome.
      contacto({
        canal: "instagram",
        cliente_slug: B,
        id: "ig-b",
        identificador_conversa: "instagram:5555555555555555",
        nome: "Cliente da Empresa B",
        telefone: "5555555555555555",
      }),
    ],
    lexia_mensagens: [
      mensagem("wa", "Olá"),
      mensagem("ig-marcou", "Quero marcar"),
      mensagem("ig-marcou", "o meu número é 932 691 606"),
      mensagem("ig-sem-tel", "Quanto custa?"),
      mensagem("ig-nif", "O meu NIF é 162929011"),
      mensagem("ig-numero-de-b", "liga para 961 452 907"),
      mensagem("msg-sem-nome", "Olá, vi o anúncio"),
      // O agente a repetir o número do outro lead não é o lead a dá-lo.
      mensagem("ig-sem-tel", "Confirmo o 932 691 606?", A, "enviada"),
      // Uma mensagem da outra empresa com o id de um contacto de A e um número
      // de uma marcação de A. Se a leitura perder o filtro do cliente, o lead
      // de A ganha um telefone que não deu.
      mensagem("ig-sem-tel", "932691606", B),
      mensagem("ig-b", "Bom dia", B),
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});
// O dicionário dos anúncios lê com a sessão do utilizador (cookies). Não é o
// assunto destes testes, e fora do Next não há sessão.
mock.module("@/lib/meta/atribuicao", {
  namedExports: { getAtribuicaoPorAnuncio: async () => new Map() },
});

const { getClientes } = await import("@/lib/clientes/read");

function reiniciar() {
  base = new FakeSupabase(estadoInicial());
}

const psids = [
  PSID_IG,
  PSID_IG_SEM_TEL,
  PSID_MSG,
  PSID_MSG_VAZIO,
  PSID_IG_NIF,
  PSID_IG_DE_B,
  PSID_JUNTO,
];

test("os leads do Instagram e do Messenger entram na lista, com e sem nome", async () => {
  reiniciar();
  const { clientes } = await getClientes(A);
  const ids = clientes.map((cliente) => cliente.id).sort();

  assert.deepEqual(ids, [
    "ig-marcou",
    "ig-nif",
    "ig-numero-de-b",
    "ig-sem-tel",
    "msg-sem-nome",
    "wa",
  ]);

  const semNome = clientes.find((cliente) => cliente.id === "msg-sem-nome");

  assert.equal(semNome?.nome, "");
  assert.equal(semNome?.canal, "messenger");
  assert.equal(semNome?.origemCapturada, "anuncio");
});

test("o lead do Instagram que deu o número ao marcar mostra esse número", async () => {
  reiniciar();
  const { clientes } = await getClientes(A);
  const marcou = clientes.find((cliente) => cliente.id === "ig-marcou");

  assert.equal(marcou?.telefone, "932691606");
  assert.equal(marcou?.telefoneDigitos, "932691606");
  assert.equal(marcou?.telefoneOrigem, "marcacao");
  assert.equal(marcou?.origemCapturada, "instagram_ad");
});

test("sem número dado, o lead do Instagram fica sem telefone — e o WhatsApp mantém o dele", async () => {
  reiniciar();
  const { clientes } = await getClientes(A);
  const porId = new Map(clientes.map((cliente) => [cliente.id, cliente]));

  for (const id of ["ig-sem-tel", "msg-sem-nome"]) {
    assert.equal(porId.get(id)?.telefone, "", id);
    assert.equal(porId.get(id)?.telefoneDigitos, "", id);
    assert.equal(porId.get(id)?.telefoneOrigem, null, id);
  }

  assert.equal(porId.get("wa")?.telefone, "351912345678");
  assert.equal(porId.get("wa")?.telefoneOrigem, "contacto");
});

test("um número escrito que não bate com nenhuma marcação não passa por telefone", async () => {
  reiniciar();
  const { clientes } = await getClientes(A);
  const nif = clientes.find((cliente) => cliente.id === "ig-nif");

  assert.equal(nif?.telefone, "");
  assert.equal(nif?.telefoneOrigem, null);
});

test("um número que só bate com uma marcação da OUTRA empresa não liga o lead", async () => {
  reiniciar();
  const { clientes } = await getClientes(A);
  const lead = clientes.find((cliente) => cliente.id === "ig-numero-de-b");

  assert.equal(lead?.telefone, "");
  assert.equal(lead?.telefoneOrigem, null);
});

test("o número que o agente escreveu, ou que veio da outra empresa, não é o do lead", async () => {
  reiniciar();
  const { clientes } = await getClientes(A);
  const lead = clientes.find((cliente) => cliente.id === "ig-sem-tel");

  assert.equal(lead?.telefone, "");
});

test("o PSID não aparece em lado nenhum da ficha, só no identificador da conversa", async () => {
  reiniciar();
  const { clientes } = await getClientes(A);

  for (const cliente of clientes) {
    const { identificadorConversa, juntos, ...resto } = cliente;
    const juntosSemIdentificador = juntos.map((junto) => ({
      canal: junto.canal,
      id: junto.id,
      telefone: junto.telefone,
    }));
    const texto = JSON.stringify({ ...resto, juntos: juntosSemIdentificador });

    for (const psid of psids) {
      assert.ok(!texto.includes(psid), `${cliente.id} mostra o PSID ${psid}`);
    }

    assert.ok(identificadorConversa.length > 0);
  }

  const wa = clientes.find((cliente) => cliente.id === "wa");

  assert.equal(wa?.juntos.length, 1);
  assert.equal(wa?.juntos[0]?.telefone, null);
  assert.deepEqual(wa?.canais, ["whatsapp", "messenger"]);
});

test("a contagem: quem fica de fora é contado, e fundidos e testes nem isso", async () => {
  reiniciar();
  const { clientes, deFora } = await getClientes(A);

  assert.equal(clientes.length, 6);
  assert.deepEqual(deFora, { semConversa: 1, semNome: 1, semTelefoneReal: 0 });
  assert.ok(!clientes.some((cliente) => cliente.id === "msg-junto"));
  assert.ok(!clientes.some((cliente) => cliente.id === "ig-teste"));
});

test("a outra empresa só vê os seus, e todas as leituras dizem de que cliente são", async () => {
  reiniciar();
  const { clientes, deFora } = await getClientes(B);

  assert.deepEqual(
    clientes.map((cliente) => cliente.id),
    ["ig-b"],
  );
  assert.equal(clientes[0]?.telefone, "");
  assert.deepEqual(deFora, { semConversa: 0, semNome: 0, semTelefoneReal: 0 });

  for (const registo of base.registos) {
    assert.ok(
      registo.filtros.some(
        (filtro) => filtro.coluna === "cliente_slug" && filtro.valor === B,
      ),
      `${registo.operacao} em ${registo.tabela} correu sem o filtro do cliente`,
    );
  }
});
