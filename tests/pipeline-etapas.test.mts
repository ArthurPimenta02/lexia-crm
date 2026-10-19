/**
 * As regras das colunas do pipeline.
 *
 * Isto não é um teste de cortesia. A etapa de um cartão é **calculada a cada
 * leitura** e não guardada em sítio nenhum — não há tabela de pipeline onde
 * alguém possa corrigir à mão o que o código decidiu mal. Se a ordem das
 * perguntas de `derivarEtapa` mudar, o quadro muda inteiro em silêncio: um
 * cliente que pergunta na véspera se pode trocar a hora desaparece em
 * "Agendado", e ninguém dá por isso porque a coluna tem cartões.
 *
 * Por isso os testes aqui guardam a ORDEM das perguntas, que é a parte frágil,
 * e não os rótulos.
 *
 * A ordem mudou a 2026-10-19: "Agendado" passou a ganhar a "Por responder".
 * O que protegia o cliente da véspera passou a ser o `porResponder`, que viaja
 * com o cartão para qualquer coluna. Os testes abaixo guardam as duas metades
 * dessa troca — a coluna E o aviso — porque sem a segunda a primeira esconde
 * gente.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  chaveTelefone,
  derivarEtapa,
  diasDesde,
  rotularResultado,
  type FactosDoCartao,
} from "@/lib/pipeline/etapas";

const AGORA = new Date("2026-10-18T12:00:00.000Z");

/** Um instante há tantos dias de calendário. */
function haDias(dias: number) {
  return new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000);
}

function factos(parciais: Partial<FactosDoCartao> = {}): FactosDoCartao {
  return {
    marcacaoFutura: null,
    marcacaoPassada: null,
    ultimaFoiRecebida: false,
    ultimaMensagemEm: haDias(1),
    ...parciais,
  };
}

test("quem agendou aparece em Agendado mesmo tendo escrito hoje", () => {
  // O caso real do Detail a 2026-10-19: o Thiago Correia tinha marcação a
  // 02/11 e escreveu nesse dia. Ficava em "Por responder" e a coluna
  // "Agendado" dizia zero — com a marcação à vista no cartão ao lado.
  const { etapa } = derivarEtapa(
    factos({
      marcacaoFutura: new Date("2026-10-19T09:00:00.000Z"),
      ultimaFoiRecebida: true,
      ultimaMensagemEm: haDias(0),
    }),
    AGORA,
  );

  assert.equal(etapa, "agendado");
});

test("o cartão que muda de coluna leva o aviso de resposta consigo", () => {
  // Esta é a outra metade da troca. Sem o `porResponder`, o cliente que
  // pergunta na véspera se pode mudar a hora ficava escondido numa coluna que
  // parece resolvida — que era exactamente a razão da ordem antiga.
  const { etapa, porResponder, porque } = derivarEtapa(
    factos({
      marcacaoFutura: new Date("2026-10-19T09:00:00.000Z"),
      ultimaFoiRecebida: true,
      ultimaMensagemEm: haDias(0),
    }),
    AGORA,
  );

  assert.equal(etapa, "agendado");
  assert.equal(porResponder, true);
  assert.equal(
    porque,
    "Tem uma marcação por acontecer. Escreveu hoje e ainda não teve resposta.",
  );
});

test("quem agendou e não escreveu nada não leva aviso nenhum", () => {
  const { etapa, porResponder, porque } = derivarEtapa(
    factos({
      marcacaoFutura: new Date("2026-10-25T09:00:00.000Z"),
      ultimaFoiRecebida: false,
      ultimaMensagemEm: haDias(2),
    }),
    AGORA,
  );

  assert.equal(etapa, "agendado");
  assert.equal(porResponder, false);
  assert.equal(porque, "Tem uma marcação por acontecer.");
});

test("uma pergunta antiga deixa de contar como por responder", () => {
  // Passados os 7 dias deixa de ser urgente: o cartão fica em "Agendado" sem
  // aviso, senão o vermelho ficava aceso para sempre.
  const { etapa, porResponder } = derivarEtapa(
    factos({
      marcacaoFutura: new Date("2026-10-25T09:00:00.000Z"),
      ultimaFoiRecebida: true,
      ultimaMensagemEm: haDias(20),
    }),
    AGORA,
  );

  assert.equal(etapa, "agendado");
  assert.equal(porResponder, false);
});

test("sem marcação, quem escreveu e espera continua na sua coluna", () => {
  const { etapa, porResponder } = derivarEtapa(
    factos({ ultimaFoiRecebida: true, ultimaMensagemEm: haDias(0) }),
    AGORA,
  );

  assert.equal(etapa, "por_responder");
  assert.equal(porResponder, true);
});

test("nenhuma outra coluna acende o aviso de resposta", () => {
  // O aviso só pode existir em "Agendado" e em "Por responder". Se aparecesse
  // num cartão de "Perdido" seria uma afirmação falsa a vermelho.
  const casos: FactosDoCartao[] = [
    factos({ ultimaMensagemEm: haDias(2) }),
    factos({ marcacaoPassada: haDias(30), ultimaMensagemEm: haDias(20) }),
    factos({ ultimaMensagemEm: haDias(20) }),
    factos({ ultimaMensagemEm: haDias(60) }),
    factos({ ultimaMensagemEm: null }),
  ];

  for (const entrada of casos) {
    const { etapa, porResponder } = derivarEtapa(entrada, AGORA);

    assert.equal(porResponder, false, `${etapa} não devia levar aviso`);
  }
});

test("marcação por acontecer ganha ao tempo da conversa", () => {
  const { etapa } = derivarEtapa(
    factos({
      marcacaoFutura: new Date("2026-10-30T09:00:00.000Z"),
      ultimaMensagemEm: haDias(45),
    }),
    AGORA,
  );

  assert.equal(etapa, "agendado");
});

test("quem já foi atendido mas voltou a escrever esta semana fica em A decorrer", () => {
  // "Cliente" é para quem foi atendido e está sossegado. Quem foi atendido e
  // voltou a falar tem alguma coisa à espera de resposta, e isso é trabalho.
  const { etapa } = derivarEtapa(
    factos({
      marcacaoPassada: haDias(10),
      ultimaMensagemEm: haDias(2),
    }),
    AGORA,
  );

  assert.equal(etapa, "a_decorrer");
});

test("quem já foi atendido e está calado fica em Cliente, não em A arrefecer", () => {
  const { etapa } = derivarEtapa(
    factos({
      marcacaoPassada: haDias(30),
      ultimaMensagemEm: haDias(20),
    }),
    AGORA,
  );

  assert.equal(etapa, "cliente");
});

test("o tempo decide quando não há marcação nem pergunta por responder", () => {
  const casos: [number, string][] = [
    [0, "a_decorrer"],
    [7, "a_decorrer"],
    [8, "a_arrefecer"],
    [30, "a_arrefecer"],
    [31, "perdido"],
  ];

  for (const [dias, esperada] of casos) {
    const { etapa } = derivarEtapa(
      factos({ ultimaMensagemEm: haDias(dias) }),
      AGORA,
    );

    assert.equal(etapa, esperada, `${dias} dias devia dar ${esperada}`);
  }
});

test("um contacto sem mensagem nenhuma fica em Perdido e diz porquê", () => {
  const { etapa, porque } = derivarEtapa(
    factos({ ultimaMensagemEm: null }),
    AGORA,
  );

  assert.equal(etapa, "perdido");
  assert.equal(porque, "Nunca trocou mensagens.");
});

test("a etapa não se lê do relógio da máquina", () => {
  // `agora` entra por parâmetro: o mesmo cartão com o mesmo instante tem de
  // dar sempre a mesma coluna, corra o teste à hora que correr.
  const entrada = factos({ ultimaMensagemEm: haDias(9) });

  assert.equal(derivarEtapa(entrada, AGORA).etapa, "a_arrefecer");
  assert.equal(
    derivarEtapa(entrada, new Date("2026-11-30T23:59:00.000Z")).etapa,
    "perdido",
  );
});

test("os dias contam-se em calendário e não em blocos de 24 horas", () => {
  // Uma mensagem das 23h de ontem tem um dia, não zero. Quem olha para o
  // quadro conta dias como o calendário conta.
  const ontemTarde = new Date("2026-10-17T23:30:00.000Z");

  assert.equal(diasDesde(ontemTarde, new Date("2026-10-18T01:00:00.000Z")), 1);
  assert.equal(diasDesde(AGORA, AGORA), 0);

  // Nunca negativo: uma marcação escrita com data no futuro não pode dar
  // "há -3 dias" no cartão.
  assert.equal(diasDesde(new Date("2026-10-25T00:00:00.000Z"), AGORA), 0);
});

test("a ponte com a agenda são os últimos 9 dígitos", () => {
  // O mesmo número escrito nas duas pontas de maneiras diferentes tem de dar
  // a mesma chave, senão o lead perde a marcação dele.
  assert.equal(chaveTelefone("351912345678"), "912345678");
  assert.equal(chaveTelefone("912345678"), "912345678");
  assert.equal(chaveTelefone("(857) 615-8579"), "576158579");

  // Menos de 9 dígitos não é chave: um PSID da Meta ou um número truncado não
  // podem casar com marcação nenhuma.
  assert.equal(chaveTelefone("12345678"), null);
  assert.equal(chaveTelefone(null), null);
  assert.equal(chaveTelefone(""), null);
});

test("só as etiquetas de vocabulário fechado da IA chegam ao cartão", () => {
  assert.equal(rotularResultado("interessado"), "Interessado");
  assert.equal(rotularResultado("handoff"), "Passou para a equipa");

  // Texto que o modelo inventou não vira etiqueta: uma etiqueta que se
  // escreve de duas maneiras não serve para filtrar nada.
  assert.equal(rotularResultado("obter_informacoes"), null);
  assert.equal(rotularResultado(null), null);
});
