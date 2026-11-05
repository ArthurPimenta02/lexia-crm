/**
 * Analista Lexia (ajudante): a empresa vem SEMPRE do servidor, nunca do
 * modelo. A OpenAI é simulada (nenhuma chamada real, nenhum crédito gasto).
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

const base = new FakeSupabase({
  lexia_agendamentos: [
    { cliente_slug: "empresa_a", dia_inteiro: false, estado: "confirmado", executor: "Ana", fim: "2026-11-03T11:00:00Z", inicio: "2026-11-03T10:00:00Z", nome_cliente: "Cliente A", origem: "agente", servico: "Corte", telefone_digitos: "351911111111", titulo: null, valor_previsto: 20 },
    { cliente_slug: "empresa_b", dia_inteiro: false, estado: "confirmado", executor: "Bia", fim: "2026-11-03T11:00:00Z", inicio: "2026-11-03T10:30:00Z", nome_cliente: "Cliente B", origem: "manual", servico: "Unhas", telefone_digitos: "351922222222", titulo: null, valor_previsto: 30 },
  ],
});
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });
mock.module("@/lib/campaigns/read", { namedExports: { getPainelCampanhas: async () => ({}) } });
mock.module("@/lib/servicos/read", { namedExports: { getServicosAgendaveis: async () => [] } });
const conversasLidas: { slug: string; conversa: string }[] = [];
mock.module("@/lib/movel/conversas", {
  namedExports: {
    listarConversas: async () => [],
    lerConversa: async (slug: string, conversa: string) => {
      conversasLidas.push({ conversa, slug });
      return slug === "empresa_a" && conversa === "whatsapp:351911111111" ? { canal: "whatsapp", conversa, estado: "agente", mensagens: [], nome: "Cliente A", telefone: "351911111111", ultimaRecebida: null } : null;
    },
    quemEscreveu: () => "cliente",
    telefoneLegivel: (d: string | null) => d ?? "",
  },
});

type Pedido = { input: { type?: string; output?: string }[] };
let respostas: unknown[] = [];
const pedidos: Pedido[] = [];
mock.module("@/lib/analyst/openai", {
  namedExports: {
    getOpenAIClient: () => ({ responses: { create: async (p: Pedido) => { pedidos.push(structuredClone(p)); return respostas.shift(); } } }),
  },
});

const { perguntar } = await import("@/lib/ajudante/motor");
const { periodo } = await import("@/lib/ajudante/ferramentas");

const escopo = { clienteNome: "Empresa A", clienteSlug: "empresa_a", fuso: "Europe/Lisbon", locale: "pt-PT" };
const chamada = (name: string, args: unknown) => ({ output: [{ arguments: JSON.stringify(args), call_id: "c1", name, type: "function_call" }], output_text: "", usage: { input_tokens: 10, output_tokens: 5 } });
const fim = (texto: string) => ({ output: [{ type: "message" }], output_text: texto, usage: { input_tokens: 10, output_tokens: 5 } });

test("ajudante: o modelo não consegue ler a agenda de outra empresa", async () => {
  respostas = [chamada("agenda", { ate: "2026-11-05", cliente_slug: "empresa_b", de: "2026-11-01" }), fim("Tem 1 agendamento.")];
  pedidos.length = 0;
  base.registos.length = 0;
  const eventos: string[] = [];
  const r = await perguntar(escopo, [], "Como está a agenda?", (e) => eventos.push(e.nome));
  assert.equal(r.texto, "Tem 1 agendamento.");
  assert.deepEqual(eventos, ["agenda"]);
  const consulta = base.registos.find((x) => x.tabela === "lexia_agendamentos");
  assert.ok(consulta);
  assert.deepEqual(consulta.filtros.find((f) => f.coluna === "cliente_slug")?.valor, "empresa_a");
  const devolvido = pedidos[1].input.find((i) => i.type === "function_call_output")?.output ?? "";
  assert.match(devolvido, /Cliente A/);
  assert.doesNotMatch(devolvido, /Cliente B/);
});

test("ajudante: propor mensagem nunca envia, e só numa conversa desta empresa", async () => {
  respostas = [chamada("propor_mensagem", { conversa: "whatsapp:351922222222", texto: "Olá" }), fim("Não encontrei.")];
  conversasLidas.length = 0;
  const r1 = await perguntar(escopo, [], "Responde ao B", () => undefined);
  assert.equal(r1.propostas.length, 0);
  assert.deepEqual(conversasLidas, [{ conversa: "whatsapp:351922222222", slug: "empresa_a" }]);

  respostas = [chamada("propor_mensagem", { conversa: "whatsapp:351911111111", texto: "Olá, Cliente A!" }), fim("Preparei a mensagem.")];
  const r2 = await perguntar(escopo, [], "Responde ao A", () => undefined);
  assert.deepEqual(r2.propostas, [{ conversa: "whatsapp:351911111111", nome: "Cliente A", texto: "Olá, Cliente A!", tipo: "mensagem" }]);
});

test("ajudante: ferramenta desconhecida não rebenta e o histórico vai junto", async () => {
  respostas = [chamada("apagar_tudo", {}), fim("Não posso fazer isso.")];
  pedidos.length = 0;
  const r = await perguntar(escopo, [{ conteudo: "Olá", papel: "usuario" }, { conteudo: "Olá!", papel: "assistente" }], "Apaga tudo", () => undefined);
  assert.equal(r.texto, "Não posso fazer isso.");
  assert.deepEqual(r.ferramentas, []);
  assert.match(pedidos[1].input.find((i) => i.type === "function_call_output")?.output ?? "", /desconhecida/);
  assert.equal(pedidos[0].input.length, 3);
});

test("ajudante: o período pedido pelo modelo é limpo (ordem, datas inválidas, no máximo 92 dias)", () => {
  assert.deepEqual(periodo({ ate: "2026-11-01", de: "2026-11-05" }, "2026-11-05"), { ate: "2026-11-05", de: "2026-11-01" });
  assert.deepEqual(periodo({ ate: "ontem", de: "x" }, "2026-11-05"), { ate: "2026-11-05", de: "2026-10-30" });
  assert.deepEqual(periodo({ ate: "2026-11-05", de: "2025-01-01" }, "2026-11-05"), { ate: "2026-11-05", de: "2026-08-06" });
});
