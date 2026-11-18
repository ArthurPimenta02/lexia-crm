/**
 * As regras do funil dos agentes (`lib/funil/etapas.ts`).
 *
 * O funil é calculado a cada leitura a partir do texto das mensagens e da
 * agenda; não há tabela onde alguém corrija um número errado. Estes testes
 * guardam as partes frágeis: o que conta como preço, hora e resumo (com os
 * falsos positivos medidos na base real a 18/11), quem conta como "o agente",
 * a ligação à agenda e a base das taxas.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agrupar,
  apurarConversas,
  dissePreco,
  ofereceuHorario,
  pediuConfirmacao,
  segundaDaSemana,
  ultimasSemanas,
  type MensagemFunil,
} from "@/lib/funil/etapas";

const AGORA = new Date("2026-11-18T15:00:00.000Z");

test("preço: valor com moeda conta; número solto não", () => {
  for (const t of ["fica a partir de 85€", "A consulta custa US$ 40", "por *R$ 349,00*", "starts at $79", "entre 95 e 130 euros"]) {
    assert.equal(dissePreco(t), true, t);
  }
  for (const t of ["São 3 sessões de 45 minutos", "o pedido #AST9838", "sexta 20/11 às 15:30"]) {
    assert.equal(dissePreco(t), false, t);
  }
});

test("horários: hora escrita como hora; 24h e 'as 6 fotos' não", () => {
  for (const t of ["Tenho 09:30 ou 10:45", "sábado às 9h ou 11h30", "às 7:00 PM", "6 pm works"]) {
    assert.equal(ofereceuHorario(t), true, t);
  }
  for (const t of ["atendimento 24h", "obrigado por enviar as 6 fotos", "a partir de 85€", "5 amigos"]) {
    assert.equal(ofereceuHorario(t), false, t);
  }
});

test("resumo: pergunta de confirmação com dia/hora, também quando o dia vem no balão anterior", () => {
  assert.equal(pediuConfirmacao("Então sábado, 21/11 às 09:00, Lavagem Express do Volvo, certo?"), true);
  assert.equal(pediuConfirmacao("Wednesday the 28th at 7:00 PM under Ricardo, does that look good?"), true);
  assert.equal(pediuConfirmacao("¿Confirmo tu cita con estos datos?", "sábado 7/11 a las 12:00 PM con Samuel"), true);
  // Sem dia nem hora não é resumo.
  assert.equal(pediuConfirmacao("Posso confirmar o seu nome?"), false);
  // Confirmação longe do ponto de interrogação não conta.
  assert.equal(
    pediuConfirmacao("Às 5:00 PM, pra eu deixar tudo certo por aqui, me passa seu nome completo e seu telefone?"),
    false,
  );
});

test("semana começa à segunda-feira, no fuso do cliente", () => {
  // Segunda 16/11 às 02:00 UTC ainda é domingo 15/11 em Nova Iorque.
  assert.equal(segundaDaSemana(new Date("2026-11-16T02:00:00Z"), "America/New_York"), "2026-11-09");
  assert.equal(segundaDaSemana(new Date("2026-11-16T02:00:00Z"), "Europe/Lisbon"), "2026-11-16");
  assert.deepEqual(ultimasSemanas(AGORA, "Europe/Lisbon", 3), ["2026-11-16", "2026-11-09", "2026-11-02"]);
});

function msg(id: string, direccao: string, origem: string, conteudo: string, criado_em: string): MensagemFunil {
  return { conteudo, criado_em, direccao, identificador_conversa: id, origem };
}

const ID = "whatsapp:351912345678";

test("só conta o agente: equipe e lembrete não fazem etapas", () => {
  const [c] = apurarConversas({
    agora: AGORA,
    marcacoes: [],
    mensagens: [
      msg(ID, "recebida", "workflow", "Olá", "2026-11-16T10:00:00Z"),
      msg(ID, "enviada", "humano", "Custa 60€, tenho às 10:00, certo?", "2026-11-16T10:01:00Z"),
      msg(ID, "enviada", "lembrete_agente", "Amanhã às 10:00, confirma?", "2026-11-16T10:02:00Z"),
    ],
    telefonesDosContactos: new Map(),
    timeZone: "Europe/Lisbon",
  });
  assert.deepEqual(c.etapas, {
    compareceu: false,
    conversa: false,
    horarios: false,
    marcada: false,
    preco: false,
    resumo: false,
  });
});

test("marcação liga pelo telefone, só depois da 1.ª mensagem; cancelada não comparece", () => {
  const mensagens = [
    msg(ID, "recebida", "workflow", "Olá", "2026-11-10T10:00:00Z"),
    msg(ID, "enviada", "workflow", "Fica a partir de 85€. Tenho 09:30.", "2026-11-10T10:01:00Z"),
  ];
  const base = { agora: AGORA, mensagens, telefonesDosContactos: new Map(), timeZone: "Europe/Lisbon" };

  const [antes] = apurarConversas({
    ...base,
    marcacoes: [{ criado_no_google: "2026-11-01T10:00:00Z", estado: "confirmado", inicio: "2026-11-12T09:30:00Z", telefone_digitos: "912345678" }],
  });
  assert.equal(antes.etapas.marcada, false, "marcação de antes da conversa não é desta conversa");

  const [ok] = apurarConversas({
    ...base,
    marcacoes: [{ criado_no_google: "2026-11-10T11:00:00Z", estado: "confirmado", inicio: "2026-11-12T09:30:00Z", telefone_digitos: "351912345678" }],
  });
  assert.equal(ok.etapas.marcada, true);
  assert.equal(ok.etapas.compareceu, true);

  const [cancelada] = apurarConversas({
    ...base,
    marcacoes: [{ criado_no_google: "2026-11-10T11:00:00Z", estado: "cancelado", inicio: "2026-11-12T09:30:00Z", telefone_digitos: "912345678" }],
  });
  assert.equal(cancelada.etapas.marcada, true);
  assert.equal(cancelada.etapas.compareceu, false);

  const [semAgenda] = apurarConversas({ ...base, marcacoes: null });
  assert.equal(semAgenda.etapas.marcada, false);
});

test("conversa de teste e conversa sem mensagem do cliente ficam de fora", () => {
  const r = apurarConversas({
    agora: AGORA,
    marcacoes: [],
    mensagens: [
      msg("teste:1", "recebida", "workflow", "Olá", "2026-11-16T10:00:00Z"),
      msg("whatsapp:1", "enviada", "followup_agente", "Oi?", "2026-11-16T10:00:00Z"),
    ],
    telefonesDosContactos: new Map(),
    timeZone: "Europe/Lisbon",
  });
  assert.equal(r.length, 0);
});

test("taxas: sobre quem chegou à etapa anterior; comparecimento sobre marcações já passadas", () => {
  const etapas = (p: Partial<Record<string, boolean>>) => ({
    compareceu: false, conversa: true, horarios: false, marcada: false, preco: false, resumo: false, ...p,
  });
  const g = agrupar(
    [
      { escreveu: true, etapas: etapas({ preco: true, horarios: true }), identificador: "a", marcacaoJaPassou: false, semana: "s" },
      { escreveu: true, etapas: etapas({ preco: true }), identificador: "b", marcacaoJaPassou: false, semana: "s" },
      // Marcou sem o agente ter dito preço: conta na etapa, não entra na taxa preço→horários.
      { escreveu: true, etapas: etapas({ horarios: true, marcada: true }), identificador: "c", marcacaoJaPassou: false, semana: "s" },
      { escreveu: true, etapas: etapas({ conversa: false }), identificador: "d", marcacaoJaPassou: false, semana: "s" },
    ],
    "s",
  );
  assert.equal(g.escreveram, 4);
  assert.equal(g.contagens.conversa, 3);
  assert.equal(g.taxas.conversa, 75);
  assert.equal(g.contagens.horarios, 2);
  assert.equal(g.taxas.horarios, 50);
  // A única marcada ainda não chegou à hora: sem base para comparecimento.
  assert.equal(g.taxas.compareceu, null);
});
