/**
 * Widget do iPhone (25/11): a chave só abre a empresa para a qual foi criada; a chave errada, de outra
 * pessoa ou com o segredo trocado é recusada; o widget recebe só os atendimentos de hoje/próximos,
 * sem bloqueios nem cancelados, com datas sem milissegundos (o iPhone não as lê).
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const metas = new Map<string, Record<string, unknown>>([[U1, { role: "x" }], [U2, {}]]);
const base = new FakeSupabase({
  lexia_agendamentos: [
    { cliente_slug: "miranda_skin_experts", dados: null, dia_inteiro: false, estado: "confirmado", executor: "Samuel", fim: "2030-03-05T16:00:00.000Z", inicio: "2030-03-05T15:00:00.000Z", nome_cliente: "Ana", servico: "Botox", titulo: "Botox — Ana" },
    { cliente_slug: "miranda_skin_experts", dados: { bloqueio: true }, dia_inteiro: false, estado: "confirmado", executor: "Bruna", fim: "2030-03-05T18:00:00.000Z", inicio: "2030-03-05T17:00:00.000Z", nome_cliente: null, servico: null, titulo: "Bloqueado — Almoço" },
    { cliente_slug: "miranda_skin_experts", dados: null, dia_inteiro: false, estado: "cancelado", executor: "Bruna", fim: "2030-03-05T20:00:00.000Z", inicio: "2030-03-05T19:00:00.000Z", nome_cliente: "Cancelada", servico: null, titulo: "x" },
    { cliente_slug: "miranda_skin_experts", dados: null, dia_inteiro: false, estado: "confirmado", executor: "Bruna", fim: "2030-03-06T16:00:00.000Z", inicio: "2030-03-06T15:00:00.000Z", nome_cliente: "Bia", servico: "Limpeza", titulo: "x" },
    { cliente_slug: "detail_by_cordeiro", dados: null, dia_inteiro: false, estado: "confirmado", executor: "martim", fim: "2030-03-05T16:00:00.000Z", inicio: "2030-03-05T15:00:00.000Z", nome_cliente: "Outro", servico: "Lavagem", titulo: "x" },
  ],
  lexia_clientes: [{ nome: "Miranda Skin Experts", slug: "miranda_skin_experts" }],
});
const admin = {
  auth: { admin: {
    getUserById: async (id: string) => ({ data: { user: metas.has(id) ? { app_metadata: metas.get(id), id } : null }, error: null }),
    updateUserById: async (id: string, o: { app_metadata: Record<string, unknown> }) => { metas.set(id, o.app_metadata); return { data: {}, error: null }; },
  } },
  from: (t: string) => base.from(t),
};
mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => admin } });

const { criarChaveWidget, dadosDoWidget, lerChaveWidget } = await import("@/lib/app/widget");

test("a chave abre só a empresa dela; segredo trocado e chave de outra pessoa não abrem", async () => {
  const chave = await criarChaveWidget(U1, "miranda_skin_experts");
  assert.deepEqual(await lerChaveWidget(chave), { clienteSlug: "miranda_skin_experts", userId: U1 });
  assert.equal(await lerChaveWidget(chave.slice(0, -2) + "xx"), null);
  assert.equal(await lerChaveWidget(`${U2}.${chave.split(".")[1]}`), null);
  assert.equal(await lerChaveWidget("lixo"), null);
  assert.equal(metas.get(U1)?.role, "x", "o resto do app_metadata fica");
  assert.ok(!JSON.stringify(metas.get(U1)).includes(chave.split(".")[1]), "o segredo não fica guardado, só o hash");
});

test("no máximo 5 chaves por pessoa", async () => {
  for (let i = 0; i < 7; i++) await criarChaveWidget(U2, "miranda_skin_experts");
  assert.equal((metas.get(U2)?.widget as unknown[]).length, 5);
});

test("dados: hoje sem bloqueio nem cancelado, próximos, outra empresa fora, datas sem milissegundos", async () => {
  const d = await dadosDoWidget("miranda_skin_experts", new Date("2030-03-05T12:00:00Z"));
  assert.equal(d.empresa, "Miranda Skin Experts");
  assert.deepEqual(d.hoje, [{ fim: "2030-03-05T16:00:00Z", inicio: "2030-03-05T15:00:00Z", nome: "Ana", profissional: "Samuel", servico: "Botox" }]);
  assert.deepEqual(d.proximos.map((x) => x.nome), ["Bia"]);
});
