/** O Supabase corta em 1.000 linhas sem erro: o caderno de um negócio com muitos serviços passa disso. */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
mock.module("server-only", { namedExports: {} });
const { todasAsPaginas, PAGINA } = await import("../lib/onboarding/dados");

test("caderno: lê todas as páginas (2.345 linhas), não só as primeiras 1.000", async () => {
  const base = Array.from({ length: 2345 }, (_, i) => i);
  const pedidos: [number, number][] = [];
  const todas = await todasAsPaginas<number>(async (de, ate) => { pedidos.push([de, ate]); return { data: base.slice(de, Math.min(ate + 1, de + PAGINA)), error: null }; }, "teste");
  assert.equal(todas.length, 2345);
  assert.deepEqual(pedidos, [[0, 999], [1000, 1999], [2000, 2999]]);
  await assert.rejects(todasAsPaginas(async () => ({ data: null, error: { message: "x" } }), "caderno"), /caderno: x/);
});
