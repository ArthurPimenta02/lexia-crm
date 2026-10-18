/**
 * A semana da agenda.
 *
 * Duas coisas aqui podem partir em silêncio e são as que os testes guardam.
 *
 * A primeira é o **fuso**. O dia de uma marcação é o dia no fuso do cliente,
 * não em UTC, e a Miranda trabalha em Boston.
 *
 * Medido a 2026-10-18: a Miranda tem 13 marcações às 19h e a mais tardia é às
 * 19h30. Em outubro Boston está a UTC-4 e as 19h30 são 23h30 em UTC — o mesmo
 * dia, por sorte. A partir de 01/11/2026, quando a hora de verão acaba, Boston
 * passa a UTC-5 e as mesmas 19h30 de sexta tornam-se 00h30 de sábado em UTC.
 * É por isso que o caso de fuso aqui é em novembro: em outubro passava mesmo
 * com o fuso ignorado.
 *
 * Se a janela ou o agrupamento perderem o fuso, a marcação aparece no dia
 * errado — ou desaparece da semana — e nada falha, só a agenda fica mentirosa.
 *
 * A segunda é o **isolamento**. A leitura usa `createAdminClient()`, que é a
 * `service_role` e ignora o RLS. Sem o `.eq("cliente_slug", …)`, o Martim
 * passa a ver a agenda do Samuel.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const A = "detail_teste";
const B = "miranda_teste";
const C = "boston_teste";

const LISBOA = "Europe/Lisbon";
const BOSTON = "America/New_York";

function evento(extra: Linha): Linha {
  return {
    dia_inteiro: false,
    estado: "confirmado",
    executor: "martim",
    fim: null,
    link_google: "https://google.com/evento",
    localizacao: null,
    nome_cliente: null,
    origem: "manual",
    servico: null,
    telefone: null,
    titulo: "Sem nome",
    valor_previsto: null,
    ...extra,
  };
}

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_agendamentos: [
      // Quarta-feira, 21/10/2026, às 10h de Lisboa.
      evento({
        cliente_slug: A,
        id: "a-quarta",
        inicio: "2026-10-21T09:00:00+00:00",
        titulo: "Lavagem do Martim",
      }),
      // Sexta, 23/10, às 19h de Lisboa.
      evento({
        cliente_slug: A,
        executor: "roberto",
        id: "a-sexta-noite",
        inicio: "2026-10-23T18:00:00+00:00",
        titulo: "Entrega tardia do Roberto",
      }),
      // Domingo 25/10 — o último dia da semana que começa a 19.
      evento({
        cliente_slug: A,
        executor: "roberto",
        id: "a-domingo",
        inicio: "2026-10-25T11:00:00+00:00",
        titulo: "Domingo do Roberto",
      }),
      // Segunda 26/10: já é a semana seguinte.
      evento({
        cliente_slug: A,
        id: "a-semana-seguinte",
        inicio: "2026-10-26T09:00:00+00:00",
        titulo: "Semana que vem",
      }),
      // Marcação desmarcada: fica na tabela mas não se mostra.
      evento({
        cliente_slug: A,
        estado: "cancelado",
        id: "a-cancelada",
        inicio: "2026-10-21T14:00:00+00:00",
        titulo: "Desmarcada",
      }),
      // A agenda do outro cliente, na mesma semana e à mesma hora.
      evento({
        cliente_slug: B,
        executor: "Samuel",
        id: "b-quarta",
        inicio: "2026-10-21T09:00:00+00:00",
        titulo: "Consulta do Samuel",
      }),

      /*
       * Novembro em Boston, já sem hora de verão.
       *
       * As 19h30 de sexta, 20/11, são 00h30 de sábado, 21/11, em UTC. É a
       * marcação mais tardia que a Miranda tem, e a partir de novembro é
       * exactamente esta a que muda de dia se o fuso for ignorado.
       */
      evento({
        cliente_slug: C,
        executor: "Samuel",
        id: "c-sexta-noite",
        inicio: "2026-11-21T00:30:00+00:00",
        titulo: "Última consulta da sexta",
      }),
      // Sábado, 21/11, às 10h de Boston — para o sábado não ficar vazio por
      // não ter lá nada, mas por a de sexta estar no sítio certo.
      evento({
        cliente_slug: C,
        executor: "Samuel",
        id: "c-sabado-manha",
        inicio: "2026-11-21T15:00:00+00:00",
        titulo: "Primeira de sábado",
      }),
      // Domingo, 22/11, às 19h30 de Boston — a última hora do último dia da
      // semana. Em UTC já é segunda, 23, e é o evento que uma janela de
      // consulta apertada ao fim da semana deixa cair sem dizer nada.
      evento({
        cliente_slug: C,
        executor: "Samuel",
        id: "c-domingo-noite",
        inicio: "2026-11-23T00:30:00+00:00",
        titulo: "Última de domingo",
      }),

      /*
       * Um evento de dia inteiro numa segunda de julho em Lisboa.
       *
       * A sincronização grava os eventos de dia inteiro à meia-noite do fuso
       * do cliente — medido nas 4 linhas de dia inteiro da Miranda, todas às
       * 05:00Z, que é meia-noite em Boston. Em Lisboa no verão (UTC+1), a
       * meia-noite de segunda é 23:00Z do domingo anterior: fica para trás do
       * primeiro dia da semana em UTC e é por isso que a janela abre um dia
       * antes.
       */
      evento({
        cliente_slug: C,
        dia_inteiro: true,
        executor: "Samuel",
        id: "c-dia-inteiro-segunda",
        inicio: "2026-07-19T23:00:00+00:00",
        titulo: "Férias",
      }),
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});

const { getAgendaSemana, segundaDaSemana, somarDias, diaNoFuso } =
  await import("@/lib/agenda/read");

function reiniciar() {
  base = new FakeSupabase(estadoInicial());
}

const semanaDe = (dia: string, extra: Record<string, unknown> = {}) =>
  getAgendaSemana({
    agora: new Date("2026-10-21T12:00:00.000Z"),
    clienteSlug: A,
    dia,
    timeZone: LISBOA,
    ...extra,
  });

test("a semana começa à segunda, venha o dia que vier", () => {
  // Quarta, sexta, domingo e a própria segunda dão todos a mesma segunda.
  assert.equal(segundaDaSemana("2026-10-19"), "2026-10-19");
  assert.equal(segundaDaSemana("2026-10-21"), "2026-10-19");
  assert.equal(segundaDaSemana("2026-10-23"), "2026-10-19");

  // O domingo é o fim da semana que começou na segunda anterior, não o
  // início de uma nova. É o caso que um `getUTCDay()` mal tratado erra.
  assert.equal(segundaDaSemana("2026-10-25"), "2026-10-19");
  assert.equal(segundaDaSemana("2026-10-26"), "2026-10-26");
});

test("somar dias atravessa meses e anos", () => {
  assert.equal(somarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(somarDias("2026-01-01", -1), "2025-12-31");
  assert.equal(somarDias("2026-10-19", 7), "2026-10-26");
});

test("a semana tem sempre sete dias e sabe qual é hoje", async () => {
  reiniciar();

  const agenda = await semanaDe("2026-10-21");

  assert.equal(agenda.erro, null);
  assert.deepEqual(
    agenda.dias.map((dia) => dia.chave),
    [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ],
  );
  assert.deepEqual(
    agenda.dias.filter((dia) => dia.hoje).map((dia) => dia.chave),
    ["2026-10-21"],
  );
});

test("uma marcação da noite de sexta em Boston não escorrega para sábado", async () => {
  reiniciar();

  const agenda = await getAgendaSemana({
    agora: new Date("2026-11-18T12:00:00.000Z"),
    clienteSlug: C,
    dia: "2026-11-18",
    timeZone: BOSTON,
  });

  const sexta = agenda.dias.find((dia) => dia.chave === "2026-11-20");
  const sabado = agenda.dias.find((dia) => dia.chave === "2026-11-21");

  // Às 19h30 de Boston em novembro, em UTC já é dia 21. Agrupar por UTC
  // punha a última consulta de sexta no sábado, e o dono planeava o dia
  // seguinte com uma consulta que não era dele.
  assert.deepEqual(
    sexta?.eventos.map((e) => e.id),
    ["c-sexta-noite"],
  );
  assert.deepEqual(
    sabado?.eventos.map((e) => e.id),
    ["c-sabado-manha"],
  );
});

test("a última hora de domingo não cai fora da janela de consulta", async () => {
  reiniciar();

  const agenda = await getAgendaSemana({
    agora: new Date("2026-11-18T12:00:00.000Z"),
    clienteSlug: C,
    dia: "2026-11-18",
    timeZone: BOSTON,
  });

  const domingo = agenda.dias.find((dia) => dia.chave === "2026-11-22");

  // Às 19h30 de domingo em Boston já é segunda em UTC. Uma janela que
  // acabasse no último dia da semana perdia esta marcação — e perder uma
  // marcação em silêncio é pior do que mostrá-la no dia errado.
  assert.deepEqual(
    domingo?.eventos.map((e) => e.id),
    ["c-domingo-noite"],
  );
});

test("um dia inteiro na segunda não cai fora pelo outro lado da janela", async () => {
  reiniciar();

  const agenda = await getAgendaSemana({
    agora: new Date("2026-07-20T12:00:00.000Z"),
    clienteSlug: C,
    dia: "2026-07-20",
    timeZone: LISBOA,
  });

  const segunda = agenda.dias.find((dia) => dia.chave === "2026-07-20");

  assert.deepEqual(
    segunda?.eventos.map((e) => e.id),
    ["c-dia-inteiro-segunda"],
  );
});

test("o domingo no fim da semana não fica de fora da janela", async () => {
  reiniciar();

  const agenda = await semanaDe("2026-10-21");
  const domingo = agenda.dias.find((dia) => dia.chave === "2026-10-25");

  assert.deepEqual(
    domingo?.eventos.map((e) => e.id),
    ["a-domingo"],
  );
});

test("a semana seguinte e a desmarcada ficam fora", async () => {
  reiniciar();

  const agenda = await semanaDe("2026-10-21");
  const ids = agenda.dias.flatMap((dia) => dia.eventos.map((e) => e.id));

  assert.ok(!ids.includes("a-semana-seguinte"));
  assert.ok(!ids.includes("a-cancelada"));
  assert.equal(agenda.total, 3);
});

test("a agenda de uma empresa não mostra a da outra", async () => {
  reiniciar();

  const agenda = await semanaDe("2026-10-21");
  const ids = agenda.dias.flatMap((dia) => dia.eventos.map((e) => e.id));

  // O evento da outra empresa é no mesmo dia e à mesma hora de propósito:
  // sem o filtro de cliente, aparecia aqui e ninguém notava a diferença.
  assert.ok(!ids.includes("b-quarta"));

  for (const registo of base.registos) {
    assert.ok(
      registo.filtros.some(
        (filtro) => filtro.coluna === "cliente_slug" && filtro.valor === A,
      ),
      `${registo.operacao} em ${registo.tabela} correu sem amarrar o cliente`,
    );
  }
});

test("o filtro por executor não esconde os outros nomes da barra", async () => {
  reiniciar();

  const agenda = await semanaDe("2026-10-21", { executor: "roberto" });
  const ids = agenda.dias.flatMap((dia) => dia.eventos.map((e) => e.id));

  assert.deepEqual(ids, ["a-sexta-noite", "a-domingo"]);
  assert.equal(agenda.total, 2);

  // Se a lista de executores fosse construída depois do filtro, escolher o
  // Roberto apagava o Martim da barra e não havia como voltar atrás.
  assert.deepEqual(agenda.executores, ["martim", "roberto"]);
});

test("os passos para a frente e para trás são de sete dias", async () => {
  reiniciar();

  const agenda = await semanaDe("2026-10-21");

  assert.equal(agenda.inicioSemana, "2026-10-19");
  assert.equal(agenda.semanaAnterior, "2026-10-12");
  assert.equal(agenda.proximaSemana, "2026-10-26");
});

test("um dia impossível no endereço cai na semana de hoje", async () => {
  reiniciar();

  for (const lixo of ["2026-02-31", "ontem", "2026-13-01", ""]) {
    const agenda = await semanaDe(lixo);

    assert.equal(
      agenda.inicioSemana,
      "2026-10-19",
      `"${lixo}" devia cair na semana de hoje`,
    );
  }
});

test("conta quantas marcações da semana foram do agente", async () => {
  reiniciar();
  base.linhasDe("lexia_agendamentos")[0].origem = "agente";

  const agenda = await semanaDe("2026-10-21");

  assert.equal(agenda.total, 3);
  assert.equal(agenda.marcadosPeloAgente, 1);
});

test("o mesmo instante dá dias diferentes em Lisboa e em Boston", async () => {
  // À uma da manhã em UTC já é dia 24 em Lisboa e ainda é dia 23 em Boston.
  // O mesmo instante, dois dias — é a razão de `diaNoFuso` existir.
  const instante = new Date("2026-10-24T01:00:00.000Z");

  assert.equal(diaNoFuso(instante, LISBOA), "2026-10-24");
  assert.equal(diaNoFuso(instante, BOSTON), "2026-10-23");
});

test("sem cliente associado não se lê nada da base", async () => {
  reiniciar();

  const agenda = await getAgendaSemana({
    agora: new Date("2026-10-21T12:00:00.000Z"),
    clienteSlug: "",
    timeZone: LISBOA,
  });

  assert.match(agenda.erro ?? "", /Sem cliente/);
  assert.equal(base.registos.length, 0);
});

test("uma leitura que falha dá erro em vez de uma semana vazia", async () => {
  reiniciar();
  base.falharEm("select", "lexia_agendamentos", "ligação perdida");

  const agenda = await semanaDe("2026-10-21");

  // Uma semana vazia sem erro lê-se como "não tens nada marcado", que é a
  // pior mentira que uma agenda pode contar.
  assert.equal(agenda.erro, "Não foi possível carregar a agenda.");
  assert.equal(agenda.total, 0);
});
