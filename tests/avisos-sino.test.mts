/**
 * O sino: o que acende, o que cala e o que volta a acender.
 *
 * Há três coisas aqui que não são óbvias e que um teste tem de guardar.
 *
 * 1. A chave de um aviso carrega o INSTANTE do facto. É isso que faz o aviso
 *    voltar quando a situação muda: se o lead escrever outra vez, a chave é
 *    outra e o "já li" antigo deixa de contar. Um `id` de linha ficava lido
 *    para sempre à primeira vez, e o dono nunca mais sabia que alguém tinha
 *    escrito.
 *
 * 2. Os avisos de "por responder" saem das MENSAGENS e não dos contactos.
 *    Medido a 2026-10-19: 42 conversas do Detail e 55 da Miranda têm mensagens
 *    e nenhuma linha em `lexia_contactos`, e 17 das do Detail estão à espera
 *    de resposta. Essas pessoas não aparecem em mais nenhum ecrã do painel —
 *    são exactamente as que mais precisam do aviso. Se alguém trocar esta
 *    leitura por uma que percorra os contactos, o teste tem de cair.
 *
 * 3. As marcações ordenam-se ao contrário das outras: o atendimento mais
 *    próximo primeiro. Com a ordem do mais recente, o de amanhã à noite ficava
 *    por cima do que começa dentro de uma hora.
 *
 * E, como em todo o resto do produto, o `createAdminClient()` é a
 * `service_role` e ignora o RLS: a única coisa entre uma empresa e os avisos
 * da outra é cada consulta levar o seu `.eq("cliente_slug", …)`.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test, { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const raiz = new URL("..", import.meta.url).pathname;

const A = "empresa_a";
const B = "empresa_b";

const DONO = "user-do-a";
const OUTRO = "user-do-b";

const AGORA = new Date("2026-10-19T12:00:00.000Z");

/** As tabelas que, se lidas sem filtro, mostravam dados da outra empresa. */
const tabelasDoInquilino = [
  "lexia_agendamentos",
  "lexia_contactos",
  "lexia_handoffs",
  "lexia_mensagens",
];

function mensagem(
  slug: string,
  conversa: string,
  criadoEm: string,
  direccao: string,
): Linha {
  return {
    cliente_slug: slug,
    criado_em: criadoEm,
    direccao,
    identificador_conversa: conversa,
  };
}

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_agendamentos: [
      // Dentro das 24 horas, e esta é a que começa primeiro.
      {
        cliente_slug: A,
        estado: "confirmado",
        executor: "Martim",
        id: "marcacao-proxima",
        inicio: "2026-10-19T14:00:00.000Z",
        nome_cliente: "Quem vem agora",
        servico: "Lavagem",
        telefone: "351912000001",
      },
      // Também dentro das 24 horas, mas amanhã.
      {
        cliente_slug: A,
        estado: "confirmado",
        executor: null,
        id: "marcacao-amanha",
        inicio: "2026-10-20T10:00:00.000Z",
        nome_cliente: "Quem vem amanhã",
        servico: null,
        telefone: "351912000002",
      },
      // Fora da janela: daqui a seis dias não é um aviso de hoje.
      {
        cliente_slug: A,
        estado: "confirmado",
        executor: null,
        id: "marcacao-longe",
        inicio: "2026-10-25T10:00:00.000Z",
        nome_cliente: "Quem vem na próxima semana",
        servico: null,
        telefone: null,
      },
      // Desmarcada: continua na tabela, mas não é ninguém à espera.
      {
        cliente_slug: A,
        estado: "desmarcado",
        executor: null,
        id: "marcacao-caida",
        inicio: "2026-10-19T13:00:00.000Z",
        nome_cliente: "Quem desistiu",
        servico: null,
        telefone: null,
      },
      {
        cliente_slug: B,
        estado: "confirmado",
        executor: null,
        id: "marcacao-da-outra",
        inicio: "2026-10-19T15:00:00.000Z",
        nome_cliente: "Cliente da empresa B",
        servico: null,
        telefone: null,
      },
    ],
    lexia_avisos_lidos: [],
    lexia_contactos: [
      {
        cliente_slug: A,
        fundido_em: null,
        identificador_conversa: "whatsapp:351925252340",
        nome: "Thiago",
        telefone: "351925252340",
      },
      {
        cliente_slug: A,
        fundido_em: null,
        identificador_conversa: "whatsapp:351933333333",
        nome: "Já respondido",
        telefone: "351933333333",
      },
      // Fundido noutro contacto: deixou de ser uma pessoa à parte, por isso o
      // nome não é o nome certo para o aviso.
      {
        cliente_slug: A,
        fundido_em: "2026-10-10T09:00:00.000Z",
        identificador_conversa: "whatsapp:351911111111",
        nome: "O mesmo lead outra vez",
        telefone: "351911111111",
      },
      {
        cliente_slug: B,
        fundido_em: null,
        identificador_conversa: "whatsapp:351944444444",
        nome: "Contacto da empresa B",
        telefone: "351944444444",
      },
    ],
    lexia_handoffs: [
      {
        cliente_slug: A,
        criado_em: "2026-10-19T08:00:00.000Z",
        id: "handoff-pendente",
        motivo: "Pediu para falar com uma pessoa",
        nome_contacto: "Alguém à espera",
        status: "pendente",
        telefone: "351912000003",
      },
      {
        cliente_slug: A,
        criado_em: "2026-10-18T08:00:00.000Z",
        id: "handoff-em-curso",
        motivo: null,
        nome_contacto: "Alguém com o Roberto",
        status: "em_atendimento",
        telefone: "351912000004",
      },
      // Fechado: não é aviso nenhum.
      {
        cliente_slug: A,
        criado_em: "2026-10-17T08:00:00.000Z",
        id: "handoff-resolvido",
        motivo: null,
        nome_contacto: "Já tratado",
        status: "resolvido",
        telefone: null,
      },
      {
        cliente_slug: B,
        criado_em: "2026-10-19T09:00:00.000Z",
        id: "handoff-da-outra",
        motivo: null,
        nome_contacto: "Handoff da empresa B",
        status: "pendente",
        telefone: null,
      },
    ],
    lexia_mensagens: [
      // Com ficha: escreveu e ninguém respondeu.
      mensagem(A, "whatsapp:351925252340", "2026-10-16T09:00:00.000Z", "enviada"),
      mensagem(A, "whatsapp:351925252340", "2026-10-17T12:00:00.000Z", "recebida"),
      // Já respondido: a última foi nossa.
      mensagem(A, "whatsapp:351933333333", "2026-10-17T09:00:00.000Z", "recebida"),
      mensagem(A, "whatsapp:351933333333", "2026-10-18T15:00:00.000Z", "enviada"),
      // SEM ficha em lexia_contactos. Não existe em mais nenhum ecrã.
      mensagem(A, "whatsapp:351939902228", "2026-10-18T12:00:00.000Z", "recebida"),
      // Com ficha, mas fundida.
      mensagem(A, "whatsapp:351911111111", "2026-10-18T09:00:00.000Z", "recebida"),
      // Da área de testes: não é ninguém à espera.
      mensagem(A, "teste:abc", "2026-10-19T09:00:00.000Z", "recebida"),
      // Fora da janela de sete dias: já não está por responder.
      mensagem(A, "whatsapp:351955555555", "2026-10-05T09:00:00.000Z", "recebida"),
      mensagem(B, "whatsapp:351944444444", "2026-10-18T11:00:00.000Z", "recebida"),
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

/** Quem está ligado, do lado do servidor. A rota só pode acreditar nisto. */
let sessao: {
  profile: { cliente_slug: string | null; role: string; status: string } | null;
  user: { id: string } | null;
} = {
  profile: { cliente_slug: A, role: "cliente_admin", status: "ativo" },
  user: { id: DONO },
};

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});
mock.module("@/lib/auth/profile", {
  namedExports: {
    getLoggedInUserProfile: async () => sessao,
    isClientRole: (papel: string) =>
      papel === "cliente_admin" || papel === "cliente_operador",
  },
});

const { getAvisos } = await import("@/lib/avisos/read");
const { desmarcarAviso, limparAvisos, marcarAvisosLidos } = await import(
  "@/lib/avisos/write"
);
const rota = await import("@/app/api/avisos/route");

mock.module("next/navigation", {
  namedExports: { usePathname: () => "/app/pipeline" },
});
mock.module("@/app/actions/auth", {
  namedExports: { logoutAction: async () => undefined },
});

const { AppSidebar } = await import("@/app/components/app-sidebar");
const { SinoAvisos } = await import("@/app/components/sino-avisos");
const { GrupoMetricas } = await import("@/app/components/painel-ui");

function comSessao(
  profile: {
    cliente_slug: string | null;
    role: string;
    status: string;
  } | null,
  userId: string | null = DONO,
) {
  sessao = { profile, user: userId ? { id: userId } : null };
}

function pedido(corpo: unknown) {
  return new Request("http://localhost/api/avisos", {
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function reiniciar() {
  base = new FakeSupabase(estadoInicial());
  comSessao({ cliente_slug: A, role: "cliente_admin", status: "ativo" });
}

function chavesDe(avisos: { chave: string }[]) {
  return avisos.map((aviso) => aviso.chave);
}

test("quem escreveu por último e não teve resposta acende o sino", async () => {
  reiniciar();

  const { avisos, erro } = await getAvisos(A, DONO, AGORA);

  assert.equal(erro, null);

  const porResponder = avisos.filter(
    (aviso) => aviso.tipo === "por_responder",
  );

  assert.deepEqual(chavesDe(porResponder), [
    "por_responder:whatsapp:351939902228:2026-10-18T12:00:00.000Z",
    "por_responder:whatsapp:351911111111:2026-10-18T09:00:00.000Z",
    "por_responder:whatsapp:351925252340:2026-10-17T12:00:00.000Z",
  ]);

  const thiago = porResponder.at(-1);

  assert.equal(thiago?.titulo, "Thiago");
  assert.equal(
    thiago?.href,
    "/app/conversas?conversa=whatsapp%3A351925252340",
  );
  assert.equal(
    thiago?.porque,
    "Escreveu há 2 dias e ainda não teve resposta.",
  );
});

test("uma conversa já respondida não é aviso", async () => {
  reiniciar();

  const { avisos } = await getAvisos(A, DONO, AGORA);

  assert.ok(
    !avisos.some((aviso) => aviso.chave.includes("351933333333")),
    "a última mensagem foi enviada por nós: não há ninguém à espera",
  );
});

test("uma conversa sem ficha ainda assim aparece, com o número", async () => {
  reiniciar();

  const { avisos } = await getAvisos(A, DONO, AGORA);
  const semFicha = avisos.find((aviso) =>
    aviso.chave.includes("351939902228"),
  );

  assert.ok(
    semFicha,
    "esta conversa não tem linha em lexia_contactos e não aparece em mais nenhum ecrã: se o sino a perder, ninguém a vê",
  );
  assert.equal(semFicha.titulo, "351939902228");
  assert.equal(
    semFicha.href,
    null,
    "não há ecrã onde esta pessoa exista, por isso o aviso não pode levar a lado nenhum",
  );
  assert.match(semFicha.porque, /Não tem ficha no painel\./);
});

test("um contacto fundido não empresta o nome ao aviso", async () => {
  reiniciar();

  const { avisos } = await getAvisos(A, DONO, AGORA);
  const fundido = avisos.find((aviso) => aviso.chave.includes("351911111111"));

  assert.ok(fundido);
  assert.equal(
    fundido.titulo,
    "351911111111",
    "o nome certo é o do contacto que o absorveu, não o do fundido",
  );
  assert.equal(fundido.href, null);
});

test("as conversas da área de testes e as frias ficam de fora", async () => {
  reiniciar();

  const { avisos } = await getAvisos(A, DONO, AGORA);

  assert.ok(
    !avisos.some((aviso) => aviso.chave.includes("teste:")),
    "uma simulação não é ninguém à espera",
  );
  assert.ok(
    !avisos.some((aviso) => aviso.chave.includes("351955555555")),
    "com mais de sete dias a conversa já não está por responder",
  );
});

test("só os handoffs em aberto entram", async () => {
  reiniciar();

  const { avisos } = await getAvisos(A, DONO, AGORA);
  const handoffs = avisos.filter((aviso) => aviso.tipo === "handoff");

  assert.deepEqual(chavesDe(handoffs), [
    "handoff:handoff-pendente:pendente",
    "handoff:handoff-em-curso:em_atendimento",
  ]);
  assert.equal(
    handoffs[0]?.porque,
    "Está à espera de alguém da equipa. Motivo: Pediu para falar com uma pessoa",
  );
  assert.equal(handoffs[1]?.porque, "Está com alguém da equipa.");
});

test("a marcação que começa primeiro vem primeiro", async () => {
  reiniciar();

  const { avisos } = await getAvisos(A, DONO, AGORA);
  const marcacoes = avisos.filter((aviso) => aviso.tipo === "marcacao");

  assert.deepEqual(chavesDe(marcacoes), [
    "marcacao:marcacao-proxima:2026-10-19T14:00:00.000Z",
    "marcacao:marcacao-amanha:2026-10-20T10:00:00.000Z",
  ]);
  assert.equal(
    marcacoes[0]?.porque,
    "dentro de 2 horas · Lavagem · Martim",
    "o que começa dentro de duas horas é mais urgente do que o de amanhã",
  );
  assert.equal(marcacoes[1]?.porque, "dentro de 22 horas");
});

test("a ordem do sino: marcações, depois handoffs, depois por responder", async () => {
  reiniciar();

  const { avisos, naoLidos } = await getAvisos(A, DONO, AGORA);

  assert.deepEqual(
    avisos.map((aviso) => aviso.tipo),
    [
      "marcacao",
      "marcacao",
      "handoff",
      "handoff",
      "por_responder",
      "por_responder",
      "por_responder",
    ],
  );
  assert.equal(naoLidos, 7);
});

test("a chave roda com a mensagem nova, e o aviso volta a acender", async () => {
  reiniciar();

  const primeira = await getAvisos(A, DONO, AGORA);
  const thiago = primeira.avisos.find((aviso) =>
    aviso.chave.includes("351925252340"),
  );

  assert.ok(thiago);

  const marcado = await marcarAvisosLidos(A, DONO, [thiago.chave]);

  assert.equal(marcado.ok, true);

  const depois = await getAvisos(A, DONO, AGORA);

  assert.equal(
    depois.avisos.find((aviso) => aviso.chave === thiago.chave)?.lido,
    true,
  );
  assert.equal(depois.naoLidos, 6);

  // Agora o Thiago escreve outra vez. Isto é um aviso NOVO: se a chave não
  // levasse o instante do facto, o aviso ficava lido para sempre e o dono
  // nunca saberia que alguém tinha voltado a escrever.
  base
    .linhasDe("lexia_mensagens")
    .push(
      mensagem(A, "whatsapp:351925252340", "2026-10-19T10:00:00.000Z", "recebida"),
    );

  const outraVez = await getAvisos(A, DONO, AGORA);
  const novo = outraVez.avisos.find((aviso) =>
    aviso.chave.includes("351925252340"),
  );

  assert.equal(
    novo?.chave,
    "por_responder:whatsapp:351925252340:2026-10-19T10:00:00.000Z",
  );
  assert.equal(novo?.lido, false);
  assert.equal(outraVez.naoLidos, 7);
});

test("o já lido é de quem leu, não da empresa", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";

  await marcarAvisosLidos(A, DONO, [chave]);

  const doDono = await getAvisos(A, DONO, AGORA);
  const doOutro = await getAvisos(A, OUTRO, AGORA);

  assert.equal(
    doDono.avisos.find((aviso) => aviso.chave === chave)?.lido,
    true,
  );
  assert.equal(
    doOutro.avisos.find((aviso) => aviso.chave === chave)?.lido,
    false,
    "o que uma pessoa leu não pode contar como lido para outra conta",
  );
});

test("desmarcar faz o aviso voltar", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";

  await marcarAvisosLidos(A, DONO, [chave]);
  const resultado = await desmarcarAviso(A, DONO, chave);

  assert.equal(resultado.ok, true);
  assert.equal(base.linhasDe("lexia_avisos_lidos").length, 0);

  const depois = await getAvisos(A, DONO, AGORA);

  assert.equal(
    depois.avisos.find((aviso) => aviso.chave === chave)?.lido,
    false,
  );
});

/*
 * Limpar.
 *
 * Lido e limpo saem da mesma tabela e não são a mesma coisa. Lido tira o
 * realce e deixa a linha na lista; limpo tira a linha. Se alguém colapsar os
 * dois num só, o botão "Limpar" deixa de limpar — o sino volta a zero, a lista
 * fica exactamente com o mesmo tamanho, e quem clicou não vê diferença
 * nenhuma. É esse o engano que estes testes guardam.
 */

test("limpar tira o aviso da lista, e não só o realce", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";
  const resultado = await limparAvisos(A, DONO, [chave]);

  assert.equal(resultado.ok, true);
  assert.equal(resultado.gravadas, 1);

  const depois = await getAvisos(A, DONO, AGORA);

  assert.equal(
    depois.avisos.find((aviso) => aviso.chave === chave),
    undefined,
    "um aviso limpo que continua na lista é um botão que não fez nada",
  );
  assert.equal(depois.avisos.length, 6);
  assert.equal(depois.naoLidos, 6);
});

test("limpar grava com a marca, para não se confundir com o lido", async () => {
  reiniciar();

  const chave = "marcacao:marcacao-proxima:2026-10-19T14:00:00.000Z";

  await limparAvisos(A, DONO, [chave]);

  assert.deepEqual(base.linhasDe("lexia_avisos_lidos"), [
    {
      chave: `limpo:${chave}`,
      cliente_slug: A,
      user_id: DONO,
    },
  ]);
});

test("ler e limpar o mesmo aviso são duas linhas, não uma a sobrepor a outra", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";

  await marcarAvisosLidos(A, DONO, [chave]);
  await limparAvisos(A, DONO, [chave]);

  assert.deepEqual(
    base.linhasDe("lexia_avisos_lidos").map((linha) => linha.chave),
    [chave, `limpo:${chave}`],
    "a unicidade é (user_id, chave): com a marca, as duas cabem",
  );

  // E o que vale é o limpo: fora da lista está fora da lista.
  const depois = await getAvisos(A, DONO, AGORA);

  assert.ok(!depois.avisos.some((aviso) => aviso.chave === chave));
});

test("limpar uma chave já marcada não marca a marca", async () => {
  reiniciar();

  const resultado = await limparAvisos(A, DONO, [
    "limpo:handoff:handoff-pendente:pendente",
    "qualquer_coisa:1",
  ]);

  assert.equal(resultado.gravadas, 0);
  assert.equal(
    base.linhasDe("lexia_avisos_lidos").length,
    0,
    "`limpo:limpo:…` não é aviso nenhum e não filtraria nada",
  );
});

test("limpar não é calar: a situação muda e o aviso volta", async () => {
  reiniciar();

  const antes = await getAvisos(A, DONO, AGORA);
  const thiago = antes.avisos.find((aviso) =>
    aviso.chave.includes("351925252340"),
  );

  assert.ok(thiago);

  await limparAvisos(A, DONO, [thiago.chave]);

  const limpo = await getAvisos(A, DONO, AGORA);

  assert.ok(!limpo.avisos.some((aviso) => aviso.chave === thiago.chave));

  // Escreve outra vez. A chave carrega o instante do facto: isto é outro
  // aviso, e um aviso limpo não pode apagar os que ainda não aconteceram.
  base
    .linhasDe("lexia_mensagens")
    .push(
      mensagem(A, "whatsapp:351925252340", "2026-10-19T10:00:00.000Z", "recebida"),
    );

  const outraVez = await getAvisos(A, DONO, AGORA);
  const novo = outraVez.avisos.find((aviso) =>
    aviso.chave.includes("351925252340"),
  );

  assert.equal(
    novo?.chave,
    "por_responder:whatsapp:351925252340:2026-10-19T10:00:00.000Z",
  );
  assert.equal(novo?.lido, false);
});

test("limpar é de quem limpou, não da empresa", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";

  await limparAvisos(A, DONO, [chave]);

  const doOutro = await getAvisos(A, OUTRO, AGORA);

  assert.ok(
    doOutro.avisos.some((aviso) => aviso.chave === chave),
    "o Martim a limpar a lista dele não pode esconder o handoff do Roberto",
  );
});

test("limpar as três famílias de aviso deixa a lista vazia", async () => {
  reiniciar();

  const { avisos } = await getAvisos(A, DONO, AGORA);

  assert.equal(avisos.length, 7);

  await limparAvisos(A, DONO, chavesDe(avisos));

  const depois = await getAvisos(A, DONO, AGORA);

  assert.deepEqual(depois.avisos, [], "é isto que o botão promete");
  assert.equal(depois.naoLidos, 0);
});

test("marcar o mesmo aviso duas vezes não reescreve a primeira leitura", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";

  await marcarAvisosLidos(A, DONO, [chave]);

  const primeira = base.linhasDe("lexia_avisos_lidos")[0];

  assert.ok(primeira);

  await marcarAvisosLidos(A, DONO, [chave, chave]);

  const linhas = base.linhasDe("lexia_avisos_lidos");

  assert.equal(linhas.length, 1, "a unicidade é (user_id, chave)");
  assert.equal(linhas[0], primeira);
});

test("uma chave que não é de um aviso não entra na tabela", async () => {
  reiniciar();

  const resultado = await marcarAvisosLidos(A, DONO, [
    "qualquer_coisa:1",
    "",
    `por_responder:${"x".repeat(300)}`,
  ]);

  assert.equal(resultado.gravadas, 0);
  assert.equal(base.linhasDe("lexia_avisos_lidos").length, 0);
});

test("o já lido vai gravado com a empresa e com a pessoa", async () => {
  reiniciar();

  await marcarAvisosLidos(A, DONO, ["handoff:handoff-pendente:pendente"]);

  assert.deepEqual(base.linhasDe("lexia_avisos_lidos"), [
    {
      chave: "handoff:handoff-pendente:pendente",
      cliente_slug: A,
      user_id: DONO,
    },
  ]);
});

test("desmarcar não chega aos avisos de outra pessoa", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";

  await marcarAvisosLidos(A, DONO, [chave]);
  await marcarAvisosLidos(A, OUTRO, [chave]);
  await desmarcarAviso(A, OUTRO, chave);

  assert.deepEqual(
    base.linhasDe("lexia_avisos_lidos").map((linha) => linha.user_id),
    [DONO],
  );
});

test("o sino de uma empresa não mostra nada da outra", async () => {
  reiniciar();

  const { avisos } = await getAvisos(A, DONO, AGORA);
  const texto = JSON.stringify(avisos);

  assert.ok(!texto.includes("empresa B"), "nome de outra empresa no sino");
  assert.ok(!texto.includes("351944444444"));
  assert.ok(!texto.includes("handoff-da-outra"));
  assert.ok(!texto.includes("marcacao-da-outra"));

  for (const registo of base.registos) {
    if (!tabelasDoInquilino.includes(registo.tabela)) {
      continue;
    }

    assert.ok(
      registo.filtros.some(
        (filtro) => filtro.coluna === "cliente_slug" && filtro.valor === A,
      ),
      `${registo.tabela} foi lida sem dizer de que cliente é`,
    );
  }
});

test("os lidos lêem-se por utilizador", async () => {
  reiniciar();

  await getAvisos(A, DONO, AGORA);

  const leitura = base.registos.find(
    (registo) =>
      registo.tabela === "lexia_avisos_lidos" && registo.operacao === "select",
  );

  assert.ok(leitura);
  assert.ok(
    leitura.filtros.some(
      (filtro) => filtro.coluna === "user_id" && filtro.valor === DONO,
    ),
    "sem este filtro o sino de uma pessoa ficava calado pelo que outra leu",
  );
});

test("sem cliente ou sem pessoa o sino fica calado", async () => {
  reiniciar();

  assert.deepEqual(await getAvisos("", DONO, AGORA), {
    avisos: [],
    erro: null,
    naoLidos: 0,
  });
  assert.deepEqual(await getAvisos(A, "", AGORA), {
    avisos: [],
    erro: null,
    naoLidos: 0,
  });
  assert.equal((await marcarAvisosLidos(A, "", ["handoff:x:pendente"])).ok, false);
});

test("se as mensagens falharem, o sino diz que falhou", async () => {
  reiniciar();
  base.falharEm("select", "lexia_mensagens", "rede fora");

  const resultado = await getAvisos(A, DONO, AGORA);

  assert.deepEqual(resultado.avisos, []);
  assert.equal(resultado.erro, "Não foi possível ler os avisos.");
});

test("se os lidos falharem, os avisos aparecem mesmo assim", async () => {
  reiniciar();
  base.falharEm("select", "lexia_avisos_lidos", "rede fora");

  const resultado = await getAvisos(A, DONO, AGORA);

  assert.equal(resultado.erro, null);
  assert.equal(
    resultado.avisos.length,
    7,
    "um erro só na tabela do já-lido não pode esconder quem está à espera",
  );
  assert.ok(resultado.avisos.every((aviso) => !aviso.lido));
});

/*
 * A rota.
 *
 * É aqui que se decide de quem são os avisos. O `getAvisos` e o
 * `marcarAvisosLidos` correm com a `service_role` e fazem o que lhes pedirem:
 * se o `cliente_slug` ou o `user_id` vierem do pedido em vez da sessão, o
 * sino de uma empresa passa a poder pedir os avisos de outra.
 */

test("a rota tira a empresa e a pessoa da sessão, nunca do pedido", async () => {
  reiniciar();

  const resposta = await rota.GET();

  assert.equal(resposta.status, 200);

  // A rota usa a hora real, por isso o número de avisos de tempo (marcações,
  // janela das mensagens) não é estável num teste. Os handoffs não têm filtro
  // de tempo nenhum: são a parte que se pode afirmar.
  const corpo = (await resposta.json()) as {
    avisos: { chave: string }[];
  };

  assert.deepEqual(
    corpo.avisos
      .filter((aviso) => aviso.chave.startsWith("handoff:"))
      .map((aviso) => aviso.chave),
    [
      "handoff:handoff-pendente:pendente",
      "handoff:handoff-em-curso:em_atendimento",
    ],
  );

  for (const registo of base.registos) {
    if (!tabelasDoInquilino.includes(registo.tabela)) {
      continue;
    }

    assert.ok(
      registo.filtros.some(
        (filtro) => filtro.coluna === "cliente_slug" && filtro.valor === A,
      ),
    );
  }
});

test("sem sessão a rota não lê nada", async () => {
  reiniciar();
  comSessao(null, null);

  const resposta = await rota.GET();

  assert.equal(resposta.status, 401);
  assert.equal(base.registos.length, 0, "não chegou a ir à base");
});

test("um perfil suspenso não tem avisos", async () => {
  reiniciar();
  comSessao({ cliente_slug: A, role: "cliente_admin", status: "suspenso" });

  assert.equal((await rota.GET()).status, 401);
});

test("o administrador da Lexia não tem sino", async () => {
  reiniciar();
  comSessao({ cliente_slug: null, role: "lexia_admin", status: "ativo" });

  assert.equal((await rota.GET()).status, 401);
});

test("marcar como lido grava com o slug da sessão", async () => {
  reiniciar();

  const resposta = await rota.POST(
    pedido({
      // De propósito: se a rota lesse isto, gravava na empresa errada.
      chaves: ["handoff:handoff-pendente:pendente"],
      cliente_slug: B,
      user_id: OUTRO,
    }),
  );

  assert.equal(resposta.status, 200);
  assert.deepEqual(base.linhasDe("lexia_avisos_lidos"), [
    {
      chave: "handoff:handoff-pendente:pendente",
      cliente_slug: A,
      user_id: DONO,
    },
  ]);
});

test("desmarcar pela rota faz o aviso voltar", async () => {
  reiniciar();

  const chave = "marcacao:marcacao-proxima:2026-10-19T14:00:00.000Z";

  await rota.POST(pedido({ chaves: [chave] }));
  assert.equal(base.linhasDe("lexia_avisos_lidos").length, 1);

  const resposta = await rota.POST(pedido({ desmarcar: chave }));

  assert.equal(resposta.status, 200);
  assert.equal(base.linhasDe("lexia_avisos_lidos").length, 0);
});

test("limpar pela rota grava com o slug da sessão", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";
  const resposta = await rota.POST(
    pedido({
      // De propósito, como no teste do lido: se a rota acreditasse no pedido,
      // uma empresa limpava os avisos da outra.
      cliente_slug: B,
      limpar: [chave],
      user_id: OUTRO,
    }),
  );

  assert.equal(resposta.status, 200);
  assert.deepEqual(base.linhasDe("lexia_avisos_lidos"), [
    {
      chave: `limpo:${chave}`,
      cliente_slug: A,
      user_id: DONO,
    },
  ]);
});

test("o que a rota limpou é o que a rota deixa de mostrar", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";

  await rota.POST(pedido({ limpar: [chave] }));

  const corpo = (await (await rota.GET()).json()) as {
    avisos: { chave: string }[];
  };

  assert.deepEqual(
    corpo.avisos
      .filter((aviso) => aviso.chave.startsWith("handoff:"))
      .map((aviso) => aviso.chave),
    ["handoff:handoff-em-curso:em_atendimento"],
    "limpou-se um handoff: o outro fica, e o limpo não volta na leitura seguinte",
  );
});

test("sem sessão não se limpa nada", async () => {
  reiniciar();
  comSessao(null, null);

  const resposta = await rota.POST(
    pedido({ limpar: ["handoff:handoff-pendente:pendente"] }),
  );

  assert.equal(resposta.status, 401);
  assert.equal(base.linhasDe("lexia_avisos_lidos").length, 0);
});

test("uma lista de limpar com coisas que não são texto não estoura", async () => {
  reiniciar();

  const resposta = await rota.POST(
    pedido({ limpar: [1, null, { chave: "x" }, "handoff:handoff-pendente:pendente"] }),
  );

  assert.equal(resposta.status, 200);
  assert.deepEqual(
    base.linhasDe("lexia_avisos_lidos").map((linha) => linha.chave),
    ["limpo:handoff:handoff-pendente:pendente"],
  );
});

test("um corpo sem jeito não escreve nada nem estoura", async () => {
  reiniciar();

  const resposta = await rota.POST(
    new Request("http://localhost/api/avisos", {
      body: "isto não é json",
      method: "POST",
    }),
  );

  assert.equal(resposta.status, 200);
  assert.equal(base.linhasDe("lexia_avisos_lidos").length, 0);
});

test("o que a rota marcou como lido é o que a rota mostra como lido", async () => {
  reiniciar();

  const chave = "handoff:handoff-pendente:pendente";

  await rota.POST(pedido({ chaves: [chave] }));

  const corpo = (await (await rota.GET()).json()) as {
    avisos: { chave: string; lido: boolean }[];
  };

  assert.equal(
    corpo.avisos.find((aviso) => aviso.chave === chave)?.lido,
    true,
    "a leitura e a escrita têm de usar a MESMA pessoa: se a rota passar o slug onde devia passar o user_id, o sino nunca se cala",
  );
});

test("sem sessão não se marca nada como lido", async () => {
  reiniciar();
  comSessao(null, null);

  const resposta = await rota.POST(
    pedido({ chaves: ["handoff:handoff-pendente:pendente"] }),
  );

  assert.equal(resposta.status, 401);
  assert.equal(base.linhasDe("lexia_avisos_lidos").length, 0);
});

/*
 * O sino desenhado a sério.
 *
 * Os testes acima guardam o que o sino DIZ; estes guardam que ele está no
 * ecrã — e, sobretudo, que está nos DOIS sítios. É a parte fácil de perder:
 * a barra de cima é `lg:hidden` e o topo da barra lateral está fora do ecrã
 * no telemóvel. Com o sino só num deles, metade dos ecrãs ficava sem ele e
 * nenhum dos testes de leitura dava sinal.
 */

const items = [
  { href: "/app", label: "Visão geral" },
  { href: "/app/pipeline", label: "Pipeline" },
];

function desenharMoldura(comSino: boolean) {
  return renderToStaticMarkup(
    createElement(AppSidebar, { comSino, items, subtitle: "Painel do agente" }),
  );
}

function sinos(html: string) {
  return (html.match(/aria-label="Avisos/g) ?? []).length;
}

test("o sino está nos dois sítios: barra de cima e barra lateral", () => {
  const html = desenharMoldura(true);

  assert.equal(
    sinos(html),
    2,
    "um só não chega: nenhum dos dois sítios se vê nos dois tamanhos de ecrã",
  );
  assert.match(
    html,
    /class="relative hidden lg:block"/,
    "o da barra lateral tem de estar escondido no telemóvel, senão aparecem dois",
  );
  // O da barra de cima é o inverso: está lá sem classe nenhuma a esconder,
  // porque é o próprio `<header>` que é `lg:hidden`.
  assert.match(html, /<header[^>]*lg:hidden"><button[^>]*Abrir menu/);
  assert.match(html, /class="relative"><button aria-expanded="false"/);
});

test("o painel de administração não leva sino", () => {
  assert.equal(
    sinos(desenharMoldura(false)),
    0,
    "a leitura é por cliente_slug e o administrador não tem nenhum: o sino abria sempre vazio",
  );
});

function desenharSino(naoLidos: number) {
  return renderToStaticMarkup(
    createElement(SinoAvisos, {
      estado: {
        aCarregar: false,
        avisos: [],
        erro: null,
        limparTodos: () => undefined,
        marcarTodos: () => undefined,
        naoLidos,
      },
    }),
  );
}

test("a bolinha diz quantos são, e acima de nove diz 9+", () => {
  // O Detail tinha 13 avisos a 2026-10-19. Um "13" numa bolinha de 16 px
  // transborda; o "9+" é o que cabe.
  const html = desenharSino(13);

  assert.match(html, /bg-danger[^"]*">9\+</);
  assert.match(html, /aria-label="Avisos: 13 novos"/);
  assert.match(desenharSino(1), /bg-danger[^"]*">1</);
  assert.match(desenharSino(1), /aria-label="Avisos: 1 novo"/);
});

test("o painel de administração não vai à base buscar avisos", () => {
  /*
   * Esta afirma-se sobre o código-fonte e não sobre o desenho, porque é um
   * efeito: o `renderToStaticMarkup` não corre `useEffect`, por isso não há
   * maneira de ver daqui o pedido que se faz ou não se faz.
   *
   * O que está em jogo não é o ecrã — o sino não aparece no administrador de
   * qualquer forma. É o pedido: com `useAvisos(true)`, cada página do painel
   * de administração fazia um `/api/avisos` que só pode responder 401.
   */
  const fonte = readFileSync(`${raiz}app/components/app-sidebar.tsx`, "utf8");

  assert.match(fonte, /useAvisos\(comSino\)/);
});

test("sem nada novo não há bolinha vermelha nenhuma", () => {
  // O vermelho tem de significar alguma coisa. Aceso sempre, deixava de ser
  // um aviso e passava a ser decoração.
  const html = desenharSino(0);

  assert.doesNotMatch(html, /bg-danger/);
  assert.match(html, /aria-label="Avisos"/);
});

test("nada do conteúdo se desenha por cima da lista de avisos", () => {
  /*
   * A barra lateral tem `lg:translate-x-0`, e uma deslocação — qualquer uma,
   * mesmo de zero — faz dela um contexto de empilhamento próprio. Com
   * `z-auto`, o contexto inteiro ia parar ao nível dos elementos posicionados
   * do `<main>`, que vem depois no documento e por isso ganhava. Via-se: os
   * ícones de informação dos cartões do dashboard apareciam desenhados por
   * cima da lista de avisos aberta.
   */
  const html = desenharMoldura(true);
  const barra = html.match(/<aside class="([^"]*)"/)?.[1] ?? "";

  assert.match(barra, /\btranslate-x-0\b/, "é isto que cria o contexto");
  assert.match(barra, /\bz-50\b/);
  assert.doesNotMatch(
    barra,
    /\blg:z-auto\b/,
    "sem z no computador, a barra inteira passa para trás do conteúdo",
  );
});

test("marcar como visto é ao fechar a lista, não ao abri-la", () => {
  /*
   * Mais uma do código-fonte: são dois manipuladores de eventos, e um desenho
   * estático não clica em nada.
   *
   * Marcava-se ao abrir, e a lista nascia toda cinzenta — no instante em que
   * aparecia, já nada lá estava por ler. O realce que separa o novo do velho
   * apagava-se debaixo do olho de quem o ia ler.
   */
  const fonte = readFileSync(`${raiz}app/components/sino-avisos.tsx`, "utf8");

  assert.match(
    fonte,
    /const fechar = useCallback\(\(\) => \{\n\s*setAberto\(false\);\n\s*marcarTodos\(\);/,
    "fechar é que marca",
  );
  assert.doesNotMatch(
    fonte,
    /if \(vaiAbrir\) \{\n\s*marcarTodos\(\);/,
    "abrir não pode marcar nada",
  );
  // Ir para a conversa também é fechar a lista: conta como vista.
  assert.match(fonte, /onIr=\{fechar\}/);
});

test("a lista tem um botão para a limpar, e ele só aparece com algo lá dentro", () => {
  /*
   * Do código-fonte, pela mesma razão das outras: a lista só existe depois de
   * um clique e um desenho estático não clica em nada.
   *
   * O que está em jogo é a diferença entre limpar e marcar como lido. O botão
   * tem de mandar `limpar` — se mandasse `chaves`, fazia o mesmo que fechar a
   * lista já faz, e o dono clicava num botão que não muda nada no ecrã.
   */
  const fonte = readFileSync(`${raiz}app/components/sino-avisos.tsx`, "utf8");

  assert.match(fonte, /onClick=\{limparTodos\}/);
  assert.match(fonte, />\s*Limpar\s*</);
  assert.match(
    fonte,
    /limpar: anterior\.avisos\.map\(\(aviso\) => aviso\.chave\)/,
    "é o `limpar` que tira da lista; o `chaves` só marca como lido",
  );
  assert.match(
    fonte,
    /return \{ \.\.\.anterior, avisos: \[\], naoLidos: 0 \};/,
    "o ecrã esvazia-se sem esperar pelo servidor",
  );
  assert.match(
    fonte,
    /\{avisos\.length > 0 \? \(\n\s*<button/,
    "um botão de limpar numa lista vazia é um botão a mentir",
  );
});

test("a explicação do ⓘ não se desenha dentro do cartão que a corta", () => {
  /*
   * A faixa de métricas é um cartão só com `overflow-hidden`, e precisa dele:
   * é o que corta as bordas a mais da última coluna. Um balão desenhado lá
   * dentro, que se abre para cima, é um balão decapitado — era exactamente o
   * que se via, uma ponta de preto a espreitar por baixo dos cartões.
   *
   * Daí o balão viver no fim do documento, fora do cartão. Aqui vê-se pelo
   * que o cartão NÃO traz: o texto da explicação aparece uma vez só, no
   * `aria-label` do botão. A versão partida trazia-o duas.
   */
  const explicacao = "De onde vem este numero.";
  const html = renderToStaticMarkup(
    createElement(GrupoMetricas, {
      itens: [{ dica: explicacao, label: "Agendamentos", valor: 1 }],
    }),
  );

  assert.match(html, /overflow-hidden/, "o cartão corta, e vai continuar a");
  assert.equal(
    html.split(explicacao).length - 1,
    1,
    "o balão não pode estar dentro do cartão: lá dentro fica cortado",
  );
  assert.match(html, new RegExp(`aria-label="${explicacao}"`));

  const dica = readFileSync(`${raiz}app/components/dica.tsx`, "utf8");

  assert.match(
    dica,
    /createPortal\(/,
    "é o portal que tira o balão de dentro do cartão",
  );
  assert.match(dica, /document\.body,/);
});

test("a lista do computador abre para dentro do ecrã", () => {
  /*
   * Também esta se afirma sobre o código-fonte: a lista só existe depois de
   * um clique, e um desenho estático não tem cliques.
   *
   * O que está em jogo são 64 píxeis. O sino da barra lateral está a 256 px da
   * esquerda e a lista tem 320 de largo: encostada à direita do sino, começava
   * em -64 e a primeira coluna de texto ficava fora do ecrã. O da barra de
   * cima do telemóvel é o contrário — está encostado à direita do ecrã, e é
   * para a esquerda que tem espaço.
   */
  const moldura = readFileSync(`${raiz}app/components/app-sidebar.tsx`, "utf8");
  const sino = readFileSync(`${raiz}app/components/sino-avisos.tsx`, "utf8");

  assert.match(
    moldura,
    /ancora="esquerda"\n\s*className="hidden lg:block"/,
    "o sino da barra lateral é o único que precisa de abrir para a direita",
  );
  assert.doesNotMatch(
    moldura,
    /<SinoAvisos estado=\{avisos\} ancora/,
    "o do telemóvel fica com o valor de origem",
  );
  assert.match(sino, /ancora === "direita" \? "right-0" : "left-0"/);
});

/*
 * O guarda das cores.
 *
 * A lista de avisos saiu transparente em produção, com a navegação a
 * atravessá-la. A causa não era o desenho: era `bg-card`, um nome que vem do
 * shadcn/ui e que este projecto nunca definiu. O Tailwind não se queixa de um
 * nome que não conhece — não gera a regra e segue em frente. O resultado é uma
 * caixa sem fundo nenhum, e só se vê no ecrã de quem a abre.
 *
 * Este teste fecha a porta a toda a família do erro (`card`, `destructive`,
 * `popover`, `accent`, `secondary`, `input`, `ring`, ...) e não só aos dois
 * nomes de que me lembrei: compara o que o código usa com o que o
 * `globals.css` declara, e com a paleta que vem de fábrica no Tailwind.
 */

const PALETA_DO_TAILWIND = new Set([
  "amber",
  "black",
  "blue",
  "current",
  "cyan",
  "emerald",
  "fuchsia",
  "gray",
  "green",
  "indigo",
  "inherit",
  "lime",
  "neutral",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "slate",
  "stone",
  "teal",
  "transparent",
  "violet",
  "white",
  "yellow",
  "zinc",
]);

/**
 * Palavras que vivem atrás dos mesmos prefixos sem serem cores: `text-sm` é
 * tamanho de letra, `border-b` é um lado, `from-0%` é uma paragem de
 * gradiente. Não há como separá-las pelo nome do prefixo, só pela lista.
 */
const NAO_SAO_CORES = new Set([
  "auto",
  "b",
  "balance",
  "base",
  "center",
  "clip",
  "collapse",
  "dashed",
  "dotted",
  "e",
  "ellipsis",
  "end",
  "hidden",
  "inherit",
  "justify",
  "l",
  "left",
  "lg",
  "line-through",
  "md",
  "mono",
  "none",
  "nowrap",
  "pretty",
  "r",
  "right",
  "s",
  "sans",
  "sm",
  "solid",
  "start",
  "t",
  "wrap",
  "x",
  "xl",
  "xs",
  "y",
]);

function tokensDoTema() {
  const css = readFileSync(`${raiz}app/globals.css`, "utf8");
  const nomes = new Set<string>();

  for (const [, nome] of css.matchAll(/--color-([a-z0-9-]+):/g)) {
    nomes.add(nome);
  }

  return nomes;
}

function ficheirosDoPainel(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = `${pasta}/${entrada.name}`;

    if (entrada.isDirectory()) {
      return ficheirosDoPainel(caminho);
    }

    return entrada.name.endsWith(".tsx") ? [caminho] : [];
  });
}

test("nenhum componente pinta com uma cor que o tema não tem", () => {
  const tokens = tokensDoTema();

  assert.ok(tokens.has("surface"), "o tema tem de declarar as suas cores");
  assert.ok(
    !tokens.has("card") && !tokens.has("destructive"),
    "se um dia existirem, este teste deixa de proteger de nada",
  );

  const inventadas = new Map<string, string[]>();

  for (const ficheiro of ficheirosDoPainel(`${raiz}app`)) {
    const fonte = readFileSync(ficheiro, "utf8");

    // O `(?<![\w/-])` deixa de fora os caminhos de importação: sem ele,
    // `@/app/components/scroll-to-top` passava por um `to-top`.
    for (const [, nome] of fonte.matchAll(
      /(?<![\w/-])(?:bg|text|border|ring|fill|stroke|divide|outline|placeholder|caret|decoration|from|to|via|shadow)-([a-z][a-z0-9-]*)\b/g,
    )) {
      // `border-l-primary` é a cor de um lado; `-500` é um tom da paleta;
      // `/10` é transparência. O que interessa é a raiz do nome.
      const raizDoNome = nome
        .replace(/^[btlrxyse]-(?=[a-z])/, "")
        .replace(/-\d+$/, "");

      if (
        tokens.has(raizDoNome) ||
        PALETA_DO_TAILWIND.has(raizDoNome) ||
        NAO_SAO_CORES.has(raizDoNome)
      ) {
        continue;
      }

      inventadas.set(raizDoNome, [
        ...(inventadas.get(raizDoNome) ?? []),
        ficheiro.slice(raiz.length),
      ]);
    }
  }

  assert.deepEqual(
    [...inventadas.entries()],
    [],
    "estes nomes de cor não existem no globals.css: o Tailwind não gera regra nenhuma e o elemento fica sem cor",
  );
});
