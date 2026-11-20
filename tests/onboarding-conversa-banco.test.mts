/**
 * O "corrigir a resposta anterior" no banco de verdade (a ordem das consultas ao Supabase).
 *
 * O que é que isto está a proteger
 * --------------------------------
 * 19/11/2026: o "voltar à pergunta anterior" fazia DELETE da mensagem da Jessica, da
 * fala da Lia, das linhas do caderno e dos itens que ela tinha acrescentado. O que ela
 * respondeu sumia do banco. Aqui prova-se, com um Supabase de mentira que regista cada
 * consulta, que nenhuma mensagem nem item é apagado, que as linhas que saem do caderno
 * são copiadas para o histórico ANTES de saírem, e que tudo leva o slug da empresa.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { defaultExport: {} });

type Consulta = { tabela: string; op: string; dados?: unknown; filtros: [string, string, unknown][] };
const consultas: Consulta[] = [];
const LINHAS = [{ id: "l1", campo: "nome_do_negocio", item_id: null, valor: "Jessica Bruns Beauty Studio", evidencia: { mensagem: "m2" } }];

function admin() {
  return {
    from(tabela: string) {
      const c: Consulta = { tabela, op: "select", filtros: [] };
      consultas.push(c);
      const q = {
        select() { return q; },
        update(d: unknown) { c.op = "update"; c.dados = d; return q; },
        delete() { c.op = "delete"; return q; },
        insert(d: unknown) { c.op = "insert"; c.dados = d; return q; },
        eq(col: string, v: unknown) { c.filtros.push(["eq", col, v]); return q; },
        in(col: string, v: unknown) { c.filtros.push(["in", col, v]); return q; },
        then(ok: (r: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: c.tabela === "lexia_onboarding_campos" && c.op === "select" ? LINHAS : null, error: null }).then(ok); },
      };
      return q;
    },
  };
}

const { repositorioDoBanco } = await import("../lib/onboarding/conversa-banco");
const dela = { id: "m2", autor: "cliente" as const, tipo: "texto" as const, conteudo: "e atendo em Boston", dados: { valores: [{ campo: "nome_do_negocio", itemId: null, valor: "Jessica Bruns Beauty Studio" }] }, criado_em: "", processada_em: "x" };
const fala = { id: "m3", autor: "entrevistadora" as const, tipo: "texto" as const, conteudo: "fala", dados: { passo: { tipo: "fim" } }, criado_em: "", processada_em: "x" };

test("corrigir a resposta anterior não apaga mensagens nem itens; as linhas saem do caderno só depois de copiadas", async () => {
  consultas.length = 0;
  const repo = repositorioDoBanco(admin() as never, "jessica_beauty", "onb1", "u1");
  const log = mock.method(console, "log", () => {});
  await repo.desfazer({ dela, fala, tirarItens: ["i9"], restaurarItens: ["i2"] });
  assert.ok(log.mock.calls.some((c) => String(c.arguments[0]).includes("corrigir a resposta anterior")), "cada uso fica no log");
  log.mock.restore();
  const apagadas = consultas.filter((c) => c.op === "delete");
  assert.deepEqual(apagadas.map((c) => c.tabela), ["lexia_onboarding_campos"], "só sai do caderno (e as linhas estão copiadas)");
  assert.deepEqual(apagadas[0].filtros.find((f) => f[1] === "id")?.[2], ["l1"]);
  const iHistorico = consultas.findIndex((c) => c.tabela === "lexia_onboarding_mensagens" && c.op === "update" && JSON.stringify(c.dados).includes("Jessica Bruns Beauty Studio") && JSON.stringify(c.dados).includes("historico_do_corrigir"));
  assert.ok(iHistorico >= 0 && iHistorico < consultas.indexOf(apagadas[0]), "o histórico (com a resposta dela) é gravado antes de as linhas saírem");
  const itens = consultas.filter((c) => c.tabela === "lexia_onboarding_itens");
  assert.ok(itens.every((c) => c.op === "update"), "itens nunca são apagados");
  assert.ok(itens.some((c) => typeof (c.dados as { removido_em: unknown }).removido_em === "string" && c.filtros.some((f) => f[0] === "in" && JSON.stringify(f[2]) === '["i9"]')), "o item acrescentado fica marcado como tirado");
  const marcadas = consultas.filter((c) => c.tabela === "lexia_onboarding_mensagens" && c.op === "update" && (c.dados as { dados: { desfeita?: unknown } }).dados.desfeita);
  assert.deepEqual(marcadas.map((c) => c.filtros.find((f) => f[1] === "id")?.[2]).sort(), ["m2", "m3"], "as duas mensagens ficam, marcadas como desfeitas");
  const daMensagemDela = marcadas.find((c) => c.filtros.some((f) => f[1] === "id" && f[2] === "m2"))!;
  assert.deepEqual((daMensagemDela.dados as { dados: { valores: unknown } }).dados.valores, dela.dados.valores, "os valores dela continuam na mensagem");
  for (const c of consultas) assert.ok(c.filtros.some((f) => f[1] === "cliente_slug" && f[2] === "jessica_beauty"), `${c.tabela} ${c.op} leva o slug`);
});

test("a conversa lida do banco não mostra as mensagens desfeitas (mas elas continuam lá)", async () => {
  const fake = {
    from: () => {
      const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [dela, { ...fala, dados: { desfeita: { em: "x" } } }, { ...dela, id: "m4", dados: { desfeita: { em: "x" } } }], error: null }) };
      return q;
    },
  };
  const msgs = await repositorioDoBanco(fake as never, "jessica_beauty", "onb1", "u1").mensagens();
  assert.deepEqual(msgs.map((m) => m.id), ["m2"]);
});
