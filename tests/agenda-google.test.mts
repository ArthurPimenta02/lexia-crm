/**
 * O painel a falar direto com o Google Agenda (25/11/2026, sai o n8n).
 *
 * O que se guarda aqui é o que, se ceder, faz barulho na vida do dono:
 * - o evento vai sem convidados e com `sendUpdates=none` — nenhum e-mail sai;
 * - o que não ocupa (aniversário de dia inteiro, "disponível", cancelado) não
 *   bloqueia a hora, e o carro de vários dias com hora bloqueia;
 * - cada profissional escreve só na agenda dele, e quem não tem agenda
 *   partilhada com a Lexia (o Roberto) não escreve em lado nenhum.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

process.env.LEXIA_CONEXOES_CHAVE = Buffer.alloc(32, 3).toString("base64");

const { cifrar } = await import("@/lib/conexoes/cifra");

const base = new FakeSupabase({
  lexia_conexoes: [
    {
      campos: { client_id: "id-publico", email: "conta@lexia.test" },
      cliente_slug: null,
      id: "g",
      segredos: cifrar({ client_secret: "segredo", refresh_token: "refresh" }),
      tipo: "google_conta",
    },
  ],
});

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});

let pedidos: { body: string; method: string; url: string }[] = [];
let eventos: unknown[] = [];

globalThis.fetch = (async (entrada: string, init: RequestInit = {}) => {
  const url = String(entrada);
  pedidos.push({
    body: String(init.body ?? ""),
    method: init.method ?? "GET",
    url,
  });
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

  if (url.startsWith("https://oauth2.googleapis.com/token"))
    return json({ access_token: "tok", expires_in: 3600 });
  if (init.method === "POST")
    return json({ htmlLink: "https://calendar.google.com/x", id: "ev1" });
  if (init.method === "DELETE") return new Response(null, { status: 204 });
  return json({ items: eventos });
}) as typeof fetch;

const google = await import("@/lib/agenda/google");

test("cada profissional tem a sua agenda, e o Roberto não tem nenhuma", () => {
  assert.equal(
    google.agendaDe("detail_by_cordeiro", "martim"),
    "detailbycordeiro@gmail.com",
  );
  assert.equal(google.agendaDe("detail_by_cordeiro", "roberto"), null);
  assert.equal(
    google.agendaDe("miranda_skin_experts", "Samuel"),
    "smouramiranda@gmail.com",
  );
  // A agenda de um cliente nunca serve outro.
  assert.equal(google.agendaDe("miranda_skin_experts", "martim"), null);
  assert.equal(google.agendaDe("cliente_que_nao_existe", "martim"), null);
});

test("o evento é criado sem convidados e sem e-mail", async () => {
  pedidos = [];
  google.esquecerAcesso();

  const criado = await google.criarEvento("detailbycordeiro@gmail.com", {
    descricao: "Telefone: 351912345678",
    fimIso: "2026-11-18T10:00:00.000Z",
    fuso: "Europe/Lisbon",
    inicioIso: "2026-11-18T09:00:00.000Z",
    titulo: "Lavagem — Teste",
  });

  assert.deepEqual(criado, {
    eventId: "ev1",
    link: "https://calendar.google.com/x",
  });

  const token = pedidos.find((p) => p.url.includes("oauth2"))!;
  // O client_id está nos campos públicos e o segredo cifrado: vão os dois.
  assert.match(token.body, /client_id=id-publico/);
  assert.match(token.body, /client_secret=segredo/);

  const insercao = pedidos.find(
    (p) => p.method === "POST" && p.url.includes("/events"),
  )!;
  assert.match(
    insercao.url,
    /calendars\/detailbycordeiro%40gmail\.com\/events\?sendUpdates=none$/,
  );
  const corpo = JSON.parse(insercao.body);
  assert.equal(corpo.attendees, undefined);
  assert.equal(corpo.summary, "Lavagem — Teste");
  assert.equal(corpo.start.timeZone, "Europe/Lisbon");
});

test("o acesso pede-se uma vez e reaproveita-se enquanto vale", async () => {
  pedidos = [];
  google.esquecerAcesso();
  eventos = [];

  await google.ocupadoEntre(
    "a@x",
    "2026-11-18T09:00:00Z",
    "2026-11-18T10:00:00Z",
  );
  await google.ocupadoEntre(
    "a@x",
    "2026-11-18T09:00:00Z",
    "2026-11-18T10:00:00Z",
  );

  assert.equal(pedidos.filter((p) => p.url.includes("oauth2")).length, 1);
});

test("só o que ocupa de facto conta como choque", async () => {
  eventos = [
    {
      start: { dateTime: "2026-11-18T08:00:00Z" },
      end: { dateTime: "2026-11-20T18:00:00Z" },
      summary: "Carro de vários dias",
    },
    {
      start: { date: "2026-11-18" },
      end: { date: "2026-11-19" },
      summary: "Aniversário",
    },
    {
      start: { dateTime: "2026-11-18T09:00:00Z" },
      end: { dateTime: "2026-11-18T10:00:00Z" },
      summary: "Disponível",
      transparency: "transparent",
    },
    {
      start: { dateTime: "2026-11-18T09:00:00Z" },
      end: { dateTime: "2026-11-18T10:00:00Z" },
      status: "cancelled",
      summary: "Cancelado",
    },
  ];

  const ocupado = await google.ocupadoEntre(
    "a@x",
    "2026-11-18T09:00:00Z",
    "2026-11-18T10:00:00Z",
  );

  assert.deepEqual(
    ocupado.map((o) => o.titulo),
    ["Carro de vários dias"],
  );
});

test("apagar vai sem e-mail", async () => {
  pedidos = [];
  await google.apagarEvento("detailbycordeiro@gmail.com", "ev1");
  const apagar = pedidos.find((p) => p.method === "DELETE")!;
  assert.match(apagar.url, /events\/ev1\?sendUpdates=none$/);
});
