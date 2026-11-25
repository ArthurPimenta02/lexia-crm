/**
 * O "Novo agendamento" do app (25/11/2026).
 *
 * Duas regras que, se partirem, partem em silêncio:
 *
 * 1. **A ficha.** Quem marca escreve nome e número. Se o número já tem ficha
 *    NESTA empresa, a marcação usa-a; se não tem, nasce uma de WhatsApp com o
 *    número completo (`whatsapp:<indicativo><número>`), para a conversa cair
 *    nela quando a pessoa escrever. Um número escrito sem indicativo leva o do
 *    país da empresa. Uma ficha de outra empresa, ou já juntada a outra, nunca
 *    conta.
 *
 * 2. **Os horários livres.** Numa agenda partilhada (Samuel e Bruna) a
 *    marcação de um não tapa o outro; cancelados não ocupam; o horário de
 *    trabalho configurado manda; sem agenda do Google não há horários.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mts";

const MIRANDA = "miranda_skin_experts";
const DETAIL = "detail_by_cordeiro";

function contacto(extra: Linha): Linha {
  return { canal: "whatsapp", fundido_em: null, nome: "Sem nome", telefone: "", telefone_digitos: null, ...extra };
}

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_agendamentos: [
      // Terça, 05/03/2030 (Boston em UTC-5): Samuel ocupado das 10h às 11h.
      { calendario_id: "smouramiranda@gmail.com", cliente_slug: MIRANDA, estado: "confirmado", executor: "Samuel", fim: "2030-03-05T16:00:00.000Z", inicio: "2030-03-05T15:00:00.000Z" },
      // Cancelado às 14h: não ocupa.
      { calendario_id: "smouramiranda@gmail.com", cliente_slug: MIRANDA, estado: "cancelado", executor: "Samuel", fim: "2030-03-05T20:00:00.000Z", inicio: "2030-03-05T19:00:00.000Z" },
      // Outra empresa, mesma hora (16h Boston): não conta.
      { calendario_id: "smouramiranda@gmail.com", cliente_slug: DETAIL, estado: "confirmado", executor: "Samuel", fim: "2030-03-05T22:00:00.000Z", inicio: "2030-03-05T21:00:00.000Z" },
    ],
    lexia_contactos: [
      contacto({ cliente_slug: MIRANDA, id: "m-cesar", identificador_conversa: "whatsapp:16177842717", nome: "Cesar", telefone: "16177842717", telefone_digitos: "16177842717" }),
      contacto({ cliente_slug: DETAIL, id: "d-outro", identificador_conversa: "whatsapp:16175550101", nome: "Do Detail", telefone: "16175550101", telefone_digitos: "16175550101" }),
      contacto({ cliente_slug: MIRANDA, fundido_em: "2026-11-01T00:00:00Z", id: "m-fundido", identificador_conversa: "whatsapp:16175550199", nome: "Juntado", telefone: "16175550199", telefone_digitos: "16175550199" }),
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });

const { horariosLivres, resolverContacto } = await import("@/lib/agenda/agendar-app");
const { indicativoDoFuso } = await import("@/lib/clientes/timezone");

const novaFicha = (extra: Partial<Parameters<typeof resolverContacto>[0]>) =>
  resolverContacto({ clienteSlug: MIRANDA, contactoId: "", nomeBruto: "Ana Beatriz", origemBruto: "", origemNotaBruto: "", telefoneBruto: "", userId: "u1", ...extra });

const inseridas = () => base.linhasDe("lexia_contactos").filter((l) => !String(l.id ?? "").match(/^[md]-/));

test("número que já tem ficha nesta empresa: usa a ficha, não cria outra (sem +1 escrito)", async () => {
  base = new FakeSupabase(estadoInicial());
  const r = await novaFicha({ nomeBruto: "Outro nome", telefoneBruto: "(617) 784-2717" });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.contactoId, "m-cesar");
  assert.equal(r.ok && r.criado, false);
  assert.equal(r.ok && r.nome, "Cesar", "o nome da ficha que existe não é trocado pelo escrito");
  assert.equal(inseridas().length, 0);
});

test("número novo: nasce a ficha de WhatsApp com o indicativo do país da empresa e a origem", async () => {
  base = new FakeSupabase(estadoInicial());
  const r = await novaFicha({ origemBruto: "indicacao", telefoneBruto: "857 555 0173" });
  assert.equal(r.ok && r.criado, true);
  const [nova] = inseridas();
  assert.equal(nova.cliente_slug, MIRANDA);
  assert.equal(nova.identificador_conversa, "whatsapp:18575550173");
  assert.equal(nova.telefone, "18575550173");
  assert.equal(nova.nome, "Ana Beatriz");
  assert.equal(nova.canal, "whatsapp");
  assert.equal(nova.origem_manual, "indicacao");
  assert.equal(nova.origem_manual_por, "u1");
});

test("Portugal: número sem indicativo leva o 351", async () => {
  base = new FakeSupabase(estadoInicial());
  const r = await resolverContacto({ clienteSlug: DETAIL, contactoId: "", nomeBruto: "João", origemBruto: "", origemNotaBruto: "", telefoneBruto: "912 345 678", userId: "u1" });
  assert.equal(r.ok && r.criado, true);
  assert.equal(inseridas()[0].identificador_conversa, "whatsapp:351912345678");
});

test("a ficha de OUTRA empresa com o mesmo número não conta", async () => {
  base = new FakeSupabase(estadoInicial());
  const r = await novaFicha({ telefoneBruto: "+1 617 555 0101" });
  assert.equal(r.ok && r.criado, true);
  assert.equal(inseridas()[0].cliente_slug, MIRANDA);
});

test("ficha juntada a outra (fundida) não é usada", async () => {
  base = new FakeSupabase(estadoInicial());
  const r = await novaFicha({ telefoneBruto: "+1 617 555 0199" });
  assert.notEqual(r.ok && r.contactoId, "m-fundido");
});

test("ficha escolhida da lista: só se for desta empresa", async () => {
  base = new FakeSupabase(estadoInicial());
  const minha = await novaFicha({ contactoId: "m-cesar" });
  assert.equal(minha.ok && minha.contactoId, "m-cesar");
  const alheia = await novaFicha({ contactoId: "d-outro" });
  assert.equal(alheia.ok, false);
});

test("'Outro' sem escrever de onde veio é recusado e não cria nada", async () => {
  base = new FakeSupabase(estadoInicial());
  const r = await novaFicha({ origemBruto: "outro", telefoneBruto: "857 555 0173" });
  assert.equal(r.ok, false);
  assert.equal(inseridas().length, 0);
});

test("sem nome ou sem telefone: recusa", async () => {
  base = new FakeSupabase(estadoInicial());
  assert.equal((await novaFicha({ nomeBruto: " ", telefoneBruto: "857 555 0173" })).ok, false);
  assert.equal((await novaFicha({ telefoneBruto: "" })).ok, false);
  assert.equal(inseridas().length, 0);
});

test("horários livres: o ocupado do Samuel não tapa a Bruna (agenda partilhada); cancelado e outra empresa não ocupam", async () => {
  base = new FakeSupabase(estadoInicial());
  const samuel = await horariosLivres({ clienteSlug: MIRANDA, dia: "2030-03-05", duracaoMinutos: 60, executor: "Samuel" });
  const bruna = await horariosLivres({ clienteSlug: MIRANDA, dia: "2030-03-05", duracaoMinutos: 60, executor: "Bruna" });
  assert.equal(samuel[0], "09:00");
  assert.ok(!samuel.includes("09:30"), "09:30 + 1 h encosta às 10h ocupadas");
  assert.ok(!samuel.includes("10:00"));
  assert.ok(!samuel.includes("10:30"));
  assert.ok(samuel.includes("11:00"));
  assert.ok(samuel.includes("14:00"), "o cancelado das 14h não ocupa");
  assert.ok(samuel.includes("16:00"), "a marcação de outra empresa não ocupa");
  assert.equal(samuel.at(-1), "21:00", "a Miranda trabalha até às 22h");
  assert.ok(bruna.includes("10:00"));
});

test("horários livres: domingo na Miranda não tem horário; Roberto (sem agenda do Google) não tem horários", async () => {
  base = new FakeSupabase(estadoInicial());
  assert.deepEqual(await horariosLivres({ clienteSlug: MIRANDA, dia: "2030-03-10", duracaoMinutos: 60, executor: "Samuel" }), []);
  assert.deepEqual(await horariosLivres({ clienteSlug: DETAIL, dia: "2030-03-05", duracaoMinutos: 60, executor: "roberto" }), []);
});

test("indicativo pelo fuso da empresa", () => {
  assert.equal(indicativoDoFuso("Europe/Lisbon"), "351");
  assert.equal(indicativoDoFuso("America/New_York"), "1");
  assert.equal(indicativoDoFuso("America/Sao_Paulo"), "55");
  assert.equal(indicativoDoFuso("Asia/Tokyo"), "");
});
