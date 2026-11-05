/**
 * App do iPhone (/m/testes): a Área de testes.
 *
 * 1. A empresa vem SEMPRE da sessão: um dono não consegue abrir, ler nem
 *    mandar mensagens para a sessão de teste ou o workflow de outra empresa,
 *    e o webhook do n8n nem chega a ser chamado.
 * 2. Sem sessão, todas as actions recusam.
 * 3. O payload ao n8n é o mesmo contrato do painel (modo teste, origem certa).
 * 4. As bolhas do agente seguem a regra do painel (`mensagens` ou `resposta_obtida`).
 *
 * Nada aqui chama a IA: o fetch ao webhook é substituído.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

let contexto: unknown = null;
mock.module("@/lib/movel/contexto", { namedExports: { contextoMovel: async () => contexto } });

let base = new FakeSupabase({});
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });

const chamadas: { url: string; corpo: Record<string, unknown> }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  chamadas.push({ corpo: JSON.parse(String(init?.body ?? "{}")), url: String(url) });
  return new Response("{}", { status: 200 });
}) as typeof fetch;

const { enviarTeste, lerConversaTeste, novaConversaTeste } = await import("@/app/m/testes/actions");
const { bolhasDe, respostasDe, SEM_SESSAO } = await import("@/app/m/testes/bolhas");

const t = (s: string) => s;
const sessaoDe = (clienteSlug: string, admin = false) => ({ admin, clienteNome: "X", clienteSlug, fuso: "Europe/Lisbon", idioma: "pt-BR", locale: "pt-BR", nomeUsuario: "Martim", t, userId: "u1" });

function semear() {
  base = new FakeSupabase({
    lexia_testes_execucoes: [
      { cliente_slug: "empresa_b", criado_em: "2026-11-05T10:00:00Z", id: "e1", mensagem_teste: "segredo da B", mensagens: ["oi B"], origem: "painel_cliente", resposta_obtida: null, run_id: "r1", session_id: "s-b" },
    ],
    lexia_testes_sessoes: [
      { cliente_slug: "empresa_a", criado_em: "2026-11-05T09:00:00Z", origem: "painel_cliente", session_id: "s-a" },
      { cliente_slug: "empresa_b", criado_em: "2026-11-05T09:00:00Z", origem: "painel_cliente", session_id: "s-b" },
    ],
    lexia_workflows: [
      { cliente_slug: "empresa_a", id: "wf-a", nome: "A", status: "ativo", tipo: "meta", webhook_url: "https://n8n.test/webhook/meta-a" },
      { cliente_slug: "empresa_b", id: "wf-b", nome: "B", status: "ativo", tipo: "meta", webhook_url: "https://n8n.test/webhook/meta-b" },
    ],
  });
  chamadas.length = 0;
}

test("enviar: o dono da A não usa a sessão nem o workflow da B, e o n8n não é chamado", async () => {
  semear();
  contexto = sessaoDe("empresa_a");
  assert.ok((await enviarTeste("s-b", "Olá", "wf-a")).erro, "sessão da B");
  assert.ok((await enviarTeste("s-a", "Olá", "wf-b")).erro, "workflow da B");
  assert.ok((await enviarTeste(null, "Olá", "wf-b")).erro, "workflow da B numa sessão nova");
  assert.equal(chamadas.length, 0);
  assert.equal(base.linhasDe("lexia_testes_sessoes").filter((s) => s.cliente_slug === "empresa_a").length, 1, "não abriu sessão para um envio recusado");
});

test("enviar: com o workflow da própria empresa, chama o webhook dela com o contrato do painel", async () => {
  semear();
  contexto = sessaoDe("empresa_a");
  const r = await enviarTeste("s-a", "  Quanto custa?  ", "wf-a");
  assert.ok(r.dados, r.erro);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "https://n8n.test/webhook/meta-a");
  assert.deepEqual(chamadas[0].corpo, {
    lexia_modo_teste: true,
    lexia_origem: "painel_cliente",
    lexia_run_id: r.dados!.runId,
    lexia_session_id: "s-a",
    lexia_teste_id: "",
    lexia_workflow_id: "wf-a",
    lexia_workflow_tipo: "meta",
    message: { text: "Quanto custa?", type: "text" },
  });
});

test("enviar sem sessão de teste ainda: abre uma na empresa da sessão; a Lexia usa a origem painel_admin", async () => {
  semear();
  contexto = sessaoDe("empresa_b", true);
  const r = await enviarTeste(null, "oi", "wf-b");
  assert.ok(r.dados, r.erro);
  const nova = base.linhasDe("lexia_testes_sessoes").find((s) => s.session_id === r.dados!.sessao);
  assert.equal(nova?.cliente_slug, "empresa_b");
  assert.equal(nova?.origem, "painel_admin");
  assert.equal(chamadas[0].corpo.lexia_origem, "painel_admin");
});

test("ler e criar: só a empresa da sessão", async () => {
  semear();
  contexto = sessaoDe("empresa_a");
  assert.ok((await lerConversaTeste("s-b")).erro, "não lê a conversa de teste da B");
  assert.deepEqual((await lerConversaTeste("s-a")).dados, []);
  const n = await novaConversaTeste();
  assert.equal(base.linhasDe("lexia_testes_sessoes").find((s) => s.session_id === n.dados?.sessao)?.cliente_slug, "empresa_a");
  for (const r of base.registos.filter((x) => x.tabela.startsWith("lexia_testes") && x.operacao === "select")) {
    assert.ok(r.filtros.some((f) => f.coluna === "cliente_slug" && f.valor === "empresa_a"), `${r.tabela} sem filtro de empresa`);
  }
});

test("sem sessão: tudo recusa e nada é escrito nem enviado", async () => {
  semear();
  contexto = null;
  assert.equal((await enviarTeste("s-a", "oi", "wf-a")).erro, SEM_SESSAO);
  assert.equal((await lerConversaTeste("s-a")).erro, SEM_SESSAO);
  assert.equal((await novaConversaTeste()).erro, SEM_SESSAO);
  assert.equal(chamadas.length, 0);
  assert.equal(base.registos.length, 0);
});

test("webhook fora do ar: erro limpo, não rebenta", async () => {
  semear();
  contexto = sessaoDe("empresa_a");
  const antes = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
  try {
    const r = await enviarTeste("s-a", "oi", "wf-a");
    assert.ok(r.erro);
  } finally {
    globalThis.fetch = antes;
  }
});

test("bolhas: uma por elemento de `mensagens`, senão `resposta_obtida`", () => {
  assert.deepEqual(respostasDe({ mensagens: ["Olá!", { text: "Tudo bem?" }, ""], resposta_obtida: "x" }), ["Olá!", "Tudo bem?"]);
  assert.deepEqual(respostasDe({ mensagens: '["a","b"]', resposta_obtida: null }), ["a", "b"]);
  assert.deepEqual(respostasDe({ mensagens: [], resposta_obtida: "só isto" }), ["só isto"]);
  const b = bolhasDe([{ criado_em: "2026-11-05T10:00:00Z", id: "e", mensagem_teste: "oi", mensagens: ["olá", "como posso ajudar?"], resposta_obtida: null, run_id: "r", session_id: "s" }]);
  assert.deepEqual(b.map((x) => [x.lado, x.texto]), [["dono", "oi"], ["agente", "olá"], ["agente", "como posso ajudar?"]]);
});
