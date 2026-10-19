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
import { readFileSync } from "node:fs";
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
const { desmarcarAviso, marcarAvisosLidos } = await import(
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

  assert.match(html, /bg-destructive[^"]*">9\+</);
  assert.match(html, /aria-label="Avisos: 13 novos"/);
  assert.match(desenharSino(1), /bg-destructive[^"]*">1</);
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

  assert.doesNotMatch(html, /bg-destructive/);
  assert.match(html, /aria-label="Avisos"/);
});
