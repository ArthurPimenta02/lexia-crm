/**
 * Compareceu/faltou, remarcar, cancelar e clientes sumidos (25/11/2026).
 *
 * O que pode partir em silêncio:
 * - uma presença gravada no agendamento de OUTRA empresa (o id vem do telemóvel);
 * - "para confirmar" a pedir confirmação de feriados, bloqueios e do que já tem resposta;
 * - remarcar/cancelar numa agenda que não é desta empresa;
 * - uma falta a contar como visita nos sumidos.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const A = "miranda_skin_experts";
const B = "detail_by_cordeiro";
const CAL_A = "smouramiranda@gmail.com";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AGORA = new Date("2026-11-25T18:00:00.000Z");

function ag(extra: Linha): Linha {
  return { calendario_id: CAL_A, cliente_slug: A, dados: null, dia_inteiro: false, estado: "confirmado", nome_cliente: "Maria", servico: "Botox", telefone_digitos: "16170000001", ...extra };
}

function estado(): Record<string, Linha[]> {
  return {
    lexia_agendamentos: [
      ag({ event_id: "e1", fim: "2026-11-24T16:00:00.000Z", id: ID(1), inicio: "2026-11-24T15:00:00.000Z" }),
      // Feriado posto à mão: sem nome nem telefone, não pede confirmação.
      ag({ event_id: "e2", fim: "2026-11-24T23:00:00.000Z", id: ID(2), inicio: "2026-11-24T17:00:00.000Z", nome_cliente: null, telefone_digitos: null }),
      // Bloqueio da Lexia.
      ag({ dados: { bloqueio: true }, event_id: "e3", fim: "2026-11-24T18:00:00.000Z", id: ID(3), inicio: "2026-11-24T17:00:00.000Z" }),
      // Cancelado.
      ag({ estado: "cancelado", event_id: "e4", fim: "2026-11-23T16:00:00.000Z", id: ID(4), inicio: "2026-11-23T15:00:00.000Z" }),
      // Ainda por vir.
      ag({ event_id: "e5", fim: "2030-01-10T16:00:00.000Z", id: ID(5), inicio: "2030-01-10T15:00:00.000Z" }),
      // Outra empresa.
      ag({ calendario_id: "detailbycordeiro@gmail.com", cliente_slug: B, event_id: "e6", fim: "2026-11-24T16:00:00.000Z", id: ID(6), inicio: "2026-11-24T15:00:00.000Z" }),
      // Agenda que a Lexia não gere para esta empresa.
      ag({ calendario_id: "outra@gmail.com", event_id: "e7", fim: "2026-12-01T16:00:00.000Z", id: ID(7), inicio: "2026-12-01T15:00:00.000Z" }),
    ],
    lexia_presencas: [],
  };
}

let base = new FakeSupabase(estado());
const chamadas: string[] = [];

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });
mock.module("@/lib/agenda/google", {
  namedExports: {
    agendaDe: (slug: string, ex: string) => (slug === A && ["Samuel", "Bruna"].includes(ex) ? CAL_A : null),
    agendasDe: (slug: string) => (slug === A ? { Bruna: CAL_A, Samuel: CAL_A } : slug === B ? { martim: "detailbycordeiro@gmail.com" } : {}),
    apagarEvento: async (cal: string, ev: string) => { chamadas.push(`apagar ${cal} ${ev}`); },
    criarEvento: async (cal: string) => { chamadas.push(`criar ${cal}`); return { eventId: `novo-${chamadas.length}`, link: null }; },
    mudarHorarioDoEvento: async (cal: string, ev: string) => { chamadas.push(`mudar ${cal} ${ev}`); },
    ocupadoEntre: async () => [],
  },
});

const { marcarPresenca, paraConfirmar } = await import("@/lib/agenda/presenca");
const { cancelarAgendamento, remarcarAgendamento } = await import("@/lib/agenda/alterar");
const { clientesSumidos } = await import("@/lib/movel/sumidos");

test("para confirmar: só atendimentos de cliente, já acabados, não cancelados, sem resposta, desta empresa", async () => {
  base = new FakeSupabase(estado());
  const lista = await paraConfirmar(A, AGORA);
  assert.deepEqual(lista.map((l) => l.id), [ID(1)]);
  await marcarPresenca({ clienteSlug: A, id: ID(1), presenca: "compareceu", userId: "u" });
  assert.deepEqual(await paraConfirmar(A, AGORA), [], "com resposta, sai da lista");
});

test("presença: grava pela chave do Google; desfazer apaga; outra empresa e futuro são recusados", async () => {
  base = new FakeSupabase(estado());
  const ok = await marcarPresenca({ clienteSlug: A, id: ID(1), presenca: "faltou", userId: "u" });
  assert.equal(ok.ok, true);
  assert.deepEqual(base.linhasDe("lexia_presencas").map((l) => [l.cliente_slug, l.calendario_id, l.event_id, l.presenca]), [[A, CAL_A, "e1", "faltou"]]);
  await marcarPresenca({ clienteSlug: A, id: ID(1), presenca: "compareceu", userId: "u" });
  assert.deepEqual(base.linhasDe("lexia_presencas").map((l) => l.presenca), ["compareceu"], "trocar não duplica");
  await marcarPresenca({ clienteSlug: A, id: ID(1), presenca: null, userId: "u" });
  assert.equal(base.linhasDe("lexia_presencas").length, 0);

  assert.equal((await marcarPresenca({ clienteSlug: A, id: ID(6), presenca: "faltou", userId: "u" })).ok, false, "agendamento de outra empresa");
  assert.equal((await marcarPresenca({ clienteSlug: A, id: ID(5), presenca: "faltou", userId: "u" })).ok, false, "ainda não aconteceu");
  assert.equal(base.linhasDe("lexia_presencas").length, 0);
});

test("cancelar: apaga no Google e marca o espelho; recusa outra empresa e agenda não gerida", async () => {
  base = new FakeSupabase(estado());
  chamadas.length = 0;
  assert.equal((await cancelarAgendamento({ clienteSlug: A, id: ID(5) })).ok, true);
  assert.deepEqual(chamadas, [`apagar ${CAL_A} e5`]);
  assert.equal(base.linhasDe("lexia_agendamentos").find((l) => l.id === ID(5))?.estado, "cancelado");

  chamadas.length = 0;
  assert.equal((await cancelarAgendamento({ clienteSlug: A, id: ID(6) })).ok, false);
  assert.equal((await cancelarAgendamento({ clienteSlug: A, id: ID(7) })).ok, false);
  assert.deepEqual(chamadas, [], "nada foi apagado no Google");
});

test("remarcar: muda no Google e no espelho, mantém a duração; recusa hora passada e agenda alheia", async () => {
  base = new FakeSupabase(estado());
  chamadas.length = 0;
  const r = await remarcarAgendamento({ clienteSlug: A, dia: "2030-03-05", hora: "14:00", id: ID(5), ignorarConflito: false });
  assert.equal(r.ok, true);
  assert.deepEqual(chamadas, [`mudar ${CAL_A} e5`]);
  const linha = base.linhasDe("lexia_agendamentos").find((l) => l.id === ID(5))!;
  assert.equal(linha.inicio, "2030-03-05T19:00:00.000Z");
  assert.equal(linha.fim, "2030-03-05T20:00:00.000Z", "1 h, como antes");

  chamadas.length = 0;
  assert.equal((await remarcarAgendamento({ clienteSlug: A, dia: "2020-01-01", hora: "10:00", id: ID(5), ignorarConflito: false })).ok, false);
  assert.equal((await remarcarAgendamento({ clienteSlug: A, dia: "2030-03-05", hora: "10:00", id: ID(7), ignorarConflito: false })).ok, false);
  assert.equal((await remarcarAgendamento({ clienteSlug: A, dia: "2030-03-05", hora: "10:00", id: ID(6), ignorarConflito: false })).ok, false);
  assert.deepEqual(chamadas, []);
});

test("sumidos: falta não conta como visita; quem tem marcação futura não aparece", async () => {
  base = new FakeSupabase({
    lexia_agendamentos: [
      // Ana: veio há 70 dias → sumida.
      ag({ event_id: "a1", fim: "2026-09-16T16:00:00.000Z", id: ID(11), inicio: "2026-09-16T15:00:00.000Z", nome_cliente: "Ana", telefone_digitos: "16170000011" }),
      // Bia: veio há 70 dias e faltou há 10 → a última VISITA é a de 70 dias → sumida.
      ag({ event_id: "b1", fim: "2026-09-16T16:00:00.000Z", id: ID(12), inicio: "2026-09-16T15:00:00.000Z", nome_cliente: "Bia", telefone_digitos: "16170000012" }),
      ag({ event_id: "b2", fim: "2026-11-15T16:00:00.000Z", id: ID(13), inicio: "2026-11-15T15:00:00.000Z", nome_cliente: "Bia", telefone_digitos: "16170000012" }),
      // Carla: veio há 70 dias mas tem marcação futura → não aparece.
      ag({ event_id: "c1", fim: "2026-09-16T16:00:00.000Z", id: ID(14), inicio: "2026-09-16T15:00:00.000Z", nome_cliente: "Carla", telefone_digitos: "16170000013" }),
      ag({ event_id: "c2", fim: "2026-12-10T16:00:00.000Z", id: ID(15), inicio: "2026-12-10T15:00:00.000Z", nome_cliente: "Carla", telefone_digitos: "16170000013" }),
      // Dani: veio há 20 dias → ainda não é sumida a 60 dias.
      ag({ event_id: "d1", fim: "2026-11-05T16:00:00.000Z", id: ID(16), inicio: "2026-11-05T15:00:00.000Z", nome_cliente: "Dani", telefone_digitos: "16170000014" }),
      // Outra empresa, há 70 dias.
      ag({ calendario_id: "x", cliente_slug: B, event_id: "z1", fim: "2026-09-16T16:00:00.000Z", id: ID(17), inicio: "2026-09-16T15:00:00.000Z", nome_cliente: "Zé", telefone_digitos: "351900000000" }),
    ],
    lexia_presencas: [{ calendario_id: CAL_A, cliente_slug: A, event_id: "b2", presenca: "faltou" }],
  });
  const lista = await clientesSumidos(A, 60, AGORA);
  assert.deepEqual(lista.map((s) => s.nome).sort(), ["Ana", "Bia"]);
  assert.equal(lista.find((s) => s.nome === "Bia")?.dias, 70);
});
