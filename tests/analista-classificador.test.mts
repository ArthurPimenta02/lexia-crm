/**
 * Classificador do Analista Lexia (lexia_conversation_insights): Claude com a
 * chave Anthropic do PRÓPRIO cliente da conversa. Sem chave, o cliente é
 * saltado com o motivo e nada é chamado. A Anthropic é simulada por um `fetch`
 * falso (nenhuma chamada real, nenhum crédito gasto).
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

const base = new FakeSupabase({
  lexia_conexoes: [
    { campos: { anthropic_base_url: "https://cache-a.exemplo/" }, cliente_slug: "empresa_a", segredos: JSON.stringify({ anthropic_api_key: "chave-da-a" }), tipo: "ia" },
    { campos: {}, cliente_slug: "empresa_b", segredos: JSON.stringify({ anthropic_api_key: "chave-da-b" }), tipo: "ia" },
    // A empresa C só tem chave de outro fornecedor: não conta como chave de IA.
    { campos: {}, cliente_slug: "empresa_c", segredos: JSON.stringify({ openai_api_key: "sk-openai" }), tipo: "ia" },
    // Uma reserva global (sem cliente) nunca pode ser usada pelo classificador.
    { campos: {}, cliente_slug: null, segredos: JSON.stringify({ anthropic_api_key: "chave-global" }), tipo: "ia" },
  ],
});
mock.module("@/lib/conexoes/cifra", { namedExports: { decifrar: (s: string) => JSON.parse(s) } });
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });

// O contexto de dados real lê o histórico inteiro; aqui cada empresa tem uma conversa fixa.
const mensagem = (slug: string, id: string) => ({ conteudo: `olá da ${slug}`, criado_em: "2026-11-18T10:00:00Z", direccao: "entrada", id, origem: "cliente" });
mock.module("@/lib/analyst/data", {
  namedExports: {
    AnalystDataContext: class {
      constructor(private readonly scope: { clienteSlug: string }) {}
      async getAnalysisCandidates() {
        const slug = this.scope.clienteSlug;
        return [{ canal: "whatsapp", contact: null, firstInboundAt: "2026-11-18T10:00:00Z", identifier: `whatsapp:${slug}`, lastMessageAt: "2026-11-18T10:00:00Z", messages: [mensagem(slug, `${slug}-m1`)] }];
      }
      async getCoverage() {
        return { coveragePercentage: 0, pendingConversations: 1 };
      }
      invalidateInsights() {}
    },
    redactConversationText: (v: string) => v,
  },
});

type Pedido = { url: string; chave: string | null; corpo: Record<string, unknown> };
const pedidos: Pedido[] = [];
let respostas: { status?: number; corpo: unknown }[] = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const cabecalhos = new Headers(init?.headers);
  pedidos.push({ chave: cabecalhos.get("x-api-key"), corpo: JSON.parse(String(init?.body)) as Record<string, unknown>, url: String(url) });
  const r = respostas.shift() ?? { corpo: { error: { message: "fila vazia" } }, status: 500 };
  return new Response(JSON.stringify(r.corpo), { headers: { "content-type": "application/json" }, status: r.status ?? 200 });
}) as typeof fetch;

const insight = (id: string) => ({
  confianca: 1.7,
  etapa_comercial: "descoberta",
  evidencias: [{ message_ids: [`m:${id}`, "m:de-outra-conversa"], nota: "pediu preço" }],
  intencao: "saber o preço",
  objecoes: [],
  oportunidades: [],
  pontos_fortes: [],
  resultado: "interessado",
  resumo: "Lead pediu o preço.",
  sentimento: "neutro",
});
const respostaClaude = (id: string) => ({ corpo: { content: [{ text: JSON.stringify(insight(id)), type: "text" }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } } });

const { analyzeConversationBatch, getClassifierModel, motivoSemChave } = await import("@/lib/analyst/classifier");

const escopo = (clienteSlug: string) => ({
  channel: "todos",
  clienteName: clienteSlug,
  clienteSlug,
  range: { end: new Date("2026-11-19T00:00:00Z"), start: new Date("2026-08-19T00:00:00Z") },
  role: "lexia_admin",
  timezone: "Europe/Lisbon",
  userId: "",
}) as unknown as Parameters<typeof analyzeConversationBatch>[0];

test("classifica com a chave e o endereço do próprio cliente, saída estruturada e sem temperature", async () => {
  pedidos.length = 0;
  respostas = [respostaClaude("empresa_a-m1")];
  const r = await analyzeConversationBatch(escopo("empresa_a"), 4, { enforceRateLimit: false });

  assert.equal(r.analyzed, 1);
  assert.equal(r.failed, 0);
  assert.equal(r.motivo, null);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, "https://cache-a.exemplo/v1/messages");
  assert.equal(pedidos[0].chave, "chave-da-a");
  const corpo = pedidos[0].corpo as { model: string; temperature?: unknown; output_config: { format: { type: string; schema: { properties: { confianca: Record<string, unknown> } } } }; system: { cache_control?: unknown }[] };
  assert.equal(corpo.model, getClassifierModel());
  assert.equal(corpo.model, "claude-haiku-4-5");
  assert.equal("temperature" in corpo, false);
  assert.equal(corpo.output_config.format.type, "json_schema");
  assert.equal("minimum" in corpo.output_config.format.schema.properties.confianca, false);
  assert.deepEqual(corpo.system[0].cache_control, { type: "ephemeral" });

  const gravado = base.linhasDe("lexia_conversation_insights").find((l) => l.identificador_conversa === "whatsapp:empresa_a");
  assert.ok(gravado);
  assert.equal(gravado.cliente_slug, "empresa_a");
  assert.equal(gravado.confianca, 1, "a confiança é limitada a [0, 1]");
  assert.deepEqual((gravado.evidencias as { message_ids: string[] }[])[0].message_ids, ["empresa_a-m1"], "ids de fora da conversa caem");
  assert.equal(gravado.modelo, "claude-haiku-4-5");
});

test("cada cliente usa a SUA chave, nunca a de outro nem a global", async () => {
  pedidos.length = 0;
  respostas = [respostaClaude("empresa_b-m1")];
  const r = await analyzeConversationBatch(escopo("empresa_b"), 4, { enforceRateLimit: false });

  assert.equal(r.analyzed, 1);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].chave, "chave-da-b");
  assert.equal(pedidos[0].url, "https://api.anthropic.com/v1/messages");
  const gravado = base.linhasDe("lexia_conversation_insights").find((l) => l.identificador_conversa === "whatsapp:empresa_b");
  assert.equal(gravado?.cliente_slug, "empresa_b");
});

test("sem chave Anthropic do cliente: não chama nada, salta e diz o motivo", async () => {
  for (const slug of ["empresa_c", "empresa_sem_conexao"]) {
    pedidos.length = 0;
    const antes = base.linhasDe("lexia_conversation_insights").length;
    const r = await analyzeConversationBatch(escopo(slug), 4, { enforceRateLimit: false });

    assert.equal(pedidos.length, 0, `${slug}: nenhuma chamada à IA`);
    assert.equal(r.analyzed, 0);
    assert.equal(r.motivo, motivoSemChave);
    assert.equal(base.linhasDe("lexia_conversation_insights").length, antes);
  }
});

test("erro da IA conta como falha da conversa e não grava insight", async () => {
  pedidos.length = 0;
  respostas = [{ corpo: { error: { message: "credit balance is too low" } }, status: 400 }];
  base.substituir("lexia_conversation_insights", []);
  const r = await analyzeConversationBatch(escopo("empresa_a"), 4, { enforceRateLimit: false });

  assert.equal(r.analyzed, 0);
  assert.equal(r.failed, 1);
  assert.equal(base.linhasDe("lexia_conversation_insights").length, 0);
});
