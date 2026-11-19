/**
 * Analista Lexia (ajudante): a empresa vem SEMPRE do servidor, nunca do
 * modelo, e a chave de IA é SEMPRE a do próprio cliente. A Anthropic é
 * simulada por um `fetch` falso (nenhuma chamada real, nenhum crédito gasto).
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

const base = new FakeSupabase({
  // A conexão "ia" de cada empresa; o "segredo" é JSON simples porque a cifra é simulada abaixo.
  lexia_conexoes: [
    { campos: { anthropic_base_url: "https://cache-a.exemplo" }, cliente_slug: "empresa_a", segredos: JSON.stringify({ anthropic_api_key: "chave-da-a" }), tipo: "ia" },
    { campos: {}, cliente_slug: "empresa_b", segredos: JSON.stringify({ anthropic_api_key: "chave-da-b" }), tipo: "ia" },
    { campos: {}, cliente_slug: "empresa_c", segredos: JSON.stringify({ openai_api_key: "sk-openai" }), tipo: "whatsapp" },
  ],
  lexia_agendamentos: [
    { cliente_slug: "empresa_a", dia_inteiro: false, estado: "confirmado", executor: "Ana", fim: "2026-11-03T11:00:00Z", inicio: "2026-11-03T10:00:00Z", nome_cliente: "Cliente A", origem: "agente", servico: "Corte", telefone_digitos: "351911111111", titulo: null, valor_previsto: 20 },
    { cliente_slug: "empresa_b", dia_inteiro: false, estado: "confirmado", executor: "Bia", fim: "2026-11-03T11:00:00Z", inicio: "2026-11-03T10:30:00Z", nome_cliente: "Cliente B", origem: "manual", servico: "Unhas", telefone_digitos: "351922222222", titulo: null, valor_previsto: 30 },
  ],
});
mock.module("@/lib/conexoes/cifra", { namedExports: { decifrar: (s: string) => JSON.parse(s) } });
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });
mock.module("@/lib/campaigns/read", { namedExports: { getPainelCampanhas: async () => ({}) } });
mock.module("@/lib/servicos/read", { namedExports: { getServicosAgendaveis: async () => [] } });
const conversasLidas: { slug: string; conversa: string }[] = [];
// A lista que o listarConversas falso devolve, e os pedidos que recebeu (empresa e dias).
let listaFalsa: Record<string, unknown>[] = [];
const listagens: { slug: string; dias: unknown }[] = [];
mock.module("@/lib/movel/conversas", {
  namedExports: {
    listarConversas: async (slug: string, _agora: Date, dias?: number) => {
      listagens.push({ dias, slug });
      return listaFalsa;
    },
    lerConversa: async (slug: string, conversa: string) => {
      conversasLidas.push({ conversa, slug });
      return slug === "empresa_a" && conversa === "whatsapp:351911111111" ? { canal: "whatsapp", conversa, estado: "agente", mensagens: [], nome: "Cliente A", telefone: "351911111111", ultimaRecebida: null } : null;
    },
    quemEscreveu: () => "cliente",
    telefoneLegivel: (d: string | null) => d ?? "",
  },
});

type Corpo = {
  max_tokens: number;
  messages: { role: string; content: string | { type: string; content?: string; tool_use_id?: string; is_error?: boolean; cache_control?: unknown }[] }[];
  model: string;
  system: { text: string; cache_control?: { ttl?: string; type: string } }[];
  tools: { name: string; description: string; input_schema: Record<string, unknown>; cache_control?: unknown }[];
  temperature?: number;
  tool_choice: { type: string };
};
type Pedido = { url: string; chave: string | null; corpo: Corpo };
type Falsa = { status?: number; corpo: unknown };
let respostas: Falsa[] = [];
const pedidos: Pedido[] = [];
// Uma IA falsa: o fetch global devolve as respostas em fila e guarda cada pedido (url, chave, corpo).
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const cabecalhos = new Headers(init?.headers);
  pedidos.push({ chave: cabecalhos.get("x-api-key"), corpo: JSON.parse(String(init?.body)) as Corpo, url: String(url) });
  const r = respostas.shift() ?? { corpo: { error: { message: "fila vazia" } }, status: 500 };
  return new Response(JSON.stringify(r.corpo), { headers: { "content-type": "application/json" }, status: r.status ?? 200 });
}) as typeof fetch;

const { perguntar, mensagemDoErro, SemChaveDeIa, modeloDoAjudante, VERSAO_PROMPT, semTravessao, instrucoes } = await import("@/lib/ajudante/motor");
const { periodo, ferramentasAnthropic, FERRAMENTAS } = await import("@/lib/ajudante/ferramentas");

const escopo = { clienteNome: "Empresa A", clienteSlug: "empresa_a", fuso: "Europe/Lisbon", locale: "pt-PT" };
const uso = { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, input_tokens: 10, output_tokens: 5 };
const chamada = (name: string, input: unknown, id = "c1") => ({ corpo: { content: [{ thinking: "", signature: "sig", type: "thinking" }, { id, input, name, type: "tool_use" }], stop_reason: "tool_use", usage: uso } });
const fim = (texto: string) => ({ corpo: { content: [{ text: texto, type: "text" }], stop_reason: "end_turn", usage: uso } });
const resultados = (p: Pedido) => {
  const ultima = p.corpo.messages[p.corpo.messages.length - 1];
  return Array.isArray(ultima.content) ? ultima.content.filter((b) => b.type === "tool_result") : [];
};

test("ajudante: usa a chave e o endereço do PRÓPRIO cliente; a de outro nunca", async () => {
  respostas = [fim("Olá!")];
  pedidos.length = 0;
  await perguntar(escopo, [], "Olá", () => undefined);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].chave, "chave-da-a");
  assert.equal(pedidos[0].url, "https://cache-a.exemplo/v1/messages");

  respostas = [fim("Olá B!")];
  pedidos.length = 0;
  await perguntar({ ...escopo, clienteNome: "Empresa B", clienteSlug: "empresa_b" }, [], "Olá", () => undefined);
  assert.equal(pedidos[0].chave, "chave-da-b");
  assert.equal(pedidos[0].url, "https://api.anthropic.com/v1/messages");
  const leitura = base.registos.filter((x) => x.tabela === "lexia_conexoes").at(-1);
  assert.ok(leitura);
  assert.equal(leitura.filtros.find((f) => f.coluna === "cliente_slug")?.valor, "empresa_b");
  assert.equal(leitura.filtros.find((f) => f.coluna === "tipo")?.valor, "ia");
});

test("ajudante: sem chave do cliente não chama IA nenhuma e diz que não está ligado", async () => {
  const antes = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  process.env.ANTHROPIC_API_KEY = "chave-global";
  process.env.OPENAI_API_KEY = "sk-global";
  try {
    respostas = [fim("não devia chegar aqui")];
    pedidos.length = 0;
    for (const slug of ["empresa_c", "empresa_sem_nada"]) {
      await assert.rejects(perguntar({ ...escopo, clienteSlug: slug }, [], "Olá", () => undefined), (e: unknown) => e instanceof SemChaveDeIa);
    }
    assert.equal(pedidos.length, 0);
    assert.equal(mensagemDoErro(new SemChaveDeIa()), "O assistente ainda não está ligado para esta conta; fale com a Lexia.");
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

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
  const devolvido = resultados(pedidos[1])[0];
  assert.equal(devolvido.tool_use_id, "c1");
  assert.match(devolvido.content ?? "", /Cliente A/);
  assert.doesNotMatch(devolvido.content ?? "", /Cliente B/);
  // A resposta do modelo volta inteira (com o bloco de raciocínio) antes dos resultados.
  const assistente = pedidos[1].corpo.messages[pedidos[1].corpo.messages.length - 2];
  assert.equal(assistente.role, "assistant");
  assert.deepEqual((assistente.content as { type: string }[]).map((b) => b.type), ["thinking", "tool_use"]);
  assert.deepEqual(r.tokens, { entrada: 20, saida: 10 });
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
  const devolvido = resultados(pedidos[1])[0];
  assert.match(devolvido.content ?? "", /desconhecida/);
  assert.equal(devolvido.is_error, true);
  assert.equal(pedidos[0].corpo.messages.length, 3);
  assert.deepEqual(pedidos[0].corpo.messages.map((m) => m.role), ["user", "assistant", "user"]);
});

test("ajudante: várias ferramentas na mesma volta respondem numa só mensagem", async () => {
  respostas = [
    { corpo: { content: [{ id: "a", input: {}, name: "hoje", type: "tool_use" }, { id: "b", input: {}, name: "servicos", type: "tool_use" }], stop_reason: "tool_use", usage: uso } },
    fim("Pronto."),
  ];
  pedidos.length = 0;
  const r = await perguntar(escopo, [], "Como está tudo?", () => undefined);
  assert.equal(r.texto, "Pronto.");
  assert.deepEqual(resultados(pedidos[1]).map((b) => b.tool_use_id), ["a", "b"]);
});

test("ajudante: no máximo 10 voltas de ferramentas; na última tem de responder com o que tem", async () => {
  respostas = [...Array.from({ length: 10 }, (_, i) => chamada("servicos", {}, `c${i}`)), fim("Com o que vi até aqui: 0 serviços.")];
  pedidos.length = 0;
  const r = await perguntar(escopo, [], "Loop", () => undefined);
  assert.equal(r.texto, "Com o que vi até aqui: 0 serviços.");
  assert.equal(pedidos.length, 11);
  assert.deepEqual(pedidos.slice(0, 10).map((p) => p.corpo.tool_choice.type), Array(10).fill("auto"));
  assert.deepEqual(pedidos[10].corpo.tool_choice, { type: "none" });
  // As ferramentas continuam no pedido (o prefixo em cache não muda).
  assert.deepEqual(pedidos[10].corpo.tools, pedidos[0].corpo.tools);
});

test("ajudante: pedido à Anthropic: modelo, sem temperature, cache de 1 h nas ferramentas e no sistema fixo", async () => {
  respostas = [fim("Olá!"), fim("Olá de novo!")];
  pedidos.length = 0;
  await perguntar(escopo, [], "Olá", () => undefined, "Agenda");
  await perguntar(escopo, [], "Olá outra vez", () => undefined, "Conversas");
  const [p1, p2] = pedidos.map((p) => p.corpo);
  assert.equal(p1.model, "claude-sonnet-5");
  assert.equal(modeloDoAjudante(), "claude-sonnet-5");
  assert.equal(VERSAO_PROMPT, "ajudante_v3");
  assert.equal("temperature" in p1, false);
  assert.deepEqual(p1.tool_choice, { type: "auto" });
  assert.deepEqual(p1.system[0].cache_control, { ttl: "1h", type: "ephemeral" });
  // O prefixo em cache (ferramentas + 1.º bloco do sistema) é igual entre perguntas; a hora e a tela vão depois dele.
  assert.deepEqual(p1.tools, p2.tools);
  assert.equal(p1.system[0].text, p2.system[0].text);
  assert.doesNotMatch(p1.system[0].text, /Hoje é|tela/);
  assert.match(p1.system[1].text, /Hoje é/);
  assert.match(p1.system[1].text, /Agenda/);
  assert.equal(p1.system[1].cache_control, undefined);
  // No máximo 4 pontos de cache por pedido.
  const pontos = (c: Corpo) => c.system.filter((b) => b.cache_control).length + c.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.cache_control).length;
  assert.ok(pontos(p1) <= 4);
});

test("ajudante: ferramentas no formato da Anthropic", () => {
  const t = ferramentasAnthropic();
  assert.deepEqual(t.map((x) => x.name), Object.keys(FERRAMENTAS));
  for (const x of t) {
    assert.deepEqual(Object.keys(x).sort(), ["description", "input_schema", "name"]);
    assert.equal(x.input_schema.type, "object");
    assert.ok(x.description.length > 10);
    assert.match(x.name, /^[a-zA-Z0-9_-]{1,64}$/);
  }
});

test("ajudante: erros da Anthropic viram mensagem simples no chat", async () => {
  const casos: [Falsa, RegExp][] = [
    [{ corpo: { error: { message: "Your credit balance is too low to access the Anthropic API." }, type: "error" }, status: 400 }, /sem créditos/],
    [{ corpo: { error: { message: "invalid x-api-key" } }, status: 401 }, /não foi aceita/],
    [{ corpo: { error: { message: "rate limited" } }, status: 429 }, /muitos pedidos/],
    [{ corpo: { error: { message: "overloaded" } }, status: 529 }, /instável/],
  ];
  for (const [falsa, esperado] of casos) {
    respostas = [falsa, falsa];
    pedidos.length = 0;
    const erro = await perguntar(escopo, [], "Olá", () => undefined).then(() => null, (e: unknown) => e);
    assert.ok(erro instanceof Error);
    assert.match(mensagemDoErro(erro), esperado);
    // O texto técnico (para o registo) traz o estado HTTP.
    assert.match(erro.message, new RegExp(`HTTP ${falsa.status}`));
    // 429/5xx tentam outra vez; 4xx não.
    assert.equal(pedidos.length, (falsa.status ?? 200) >= 429 ? 2 : 1);
  }
  assert.equal(mensagemDoErro(new Error("x")), "Não consegui responder agora. Tente de novo.");
});

test("ajudante: o período pedido pelo modelo é limpo (ordem, datas inválidas, no máximo 92 dias)", () => {
  assert.deepEqual(periodo({ ate: "2026-11-01", de: "2026-11-05" }, "2026-11-05"), { ate: "2026-11-05", de: "2026-11-01" });
  assert.deepEqual(periodo({ ate: "ontem", de: "x" }, "2026-11-05"), { ate: "2026-11-05", de: "2026-10-30" });
  assert.deepEqual(periodo({ ate: "2026-11-05", de: "2025-01-01" }, "2026-11-05"), { ate: "2026-11-05", de: "2026-08-06" });
});

const conversaFalsa = (i: number) => ({ canal: "whatsapp", conversa: `whatsapp:35191000${String(i).padStart(4, "0")}`, esperaDesde: null, estado: i % 2 ? "agente" : "espera", nome: `Cliente ${i}`, previa: "olá", previaDe: "cliente", quando: "2026-11-01T10:00:00Z", telefone: null, temperatura: null });

test("ajudante: conversas_recentes vê 60 dias, só desta empresa, e devolve no máximo 40", async () => {
  listaFalsa = Array.from({ length: 100 }, (_, i) => conversaFalsa(i));
  listagens.length = 0;
  const r = (await FERRAMENTAS.conversas_recentes.executar(escopo, { estado: "", so_anuncio: false })).dados as Record<string, unknown>[];
  assert.deepEqual(listagens, [{ dias: 60, slug: "empresa_a" }]);
  assert.equal(r.length, 40);
  assert.equal(r[0].nome, "Cliente 0");
  // Sem o filtro de anúncio, a resposta não ganha campos (o custo não muda).
  assert.deepEqual(Object.keys(r[0]).sort(), ["canal", "conversa", "estado", "nome", "quando", "ultima", "ultima_de"]);
  const espera = (await FERRAMENTAS.conversas_recentes.executar(escopo, { estado: "espera", so_anuncio: false })).dados as Record<string, unknown>[];
  assert.equal(espera.length, 40);
  assert.ok(espera.every((c) => c.estado === "espera"));
  assert.match(FERRAMENTAS.conversas_recentes.descricao, /últimos 60 dias/);
});

test("ajudante: conversas_recentes só de anúncio traz o anúncio e a campanha, desta empresa, no máximo 40", async () => {
  listaFalsa = Array.from({ length: 100 }, (_, i) => conversaFalsa(i));
  const contactos = [
    // 50 de anúncio (as pares), uma delas com um anúncio que a sincronização nunca viu (fica o título).
    ...Array.from({ length: 50 }, (_, k) => ({ cliente_slug: "empresa_a", identificador_conversa: conversaFalsa(k * 2).conversa, origem_source_id: k === 1 ? "ad-sumido" : "ad-1", origem_tipo: "anuncio", origem_titulo: k === 1 ? "Promo de novembro" : null })),
    { cliente_slug: "empresa_a", identificador_conversa: conversaFalsa(1).conversa, origem_source_id: null, origem_tipo: "organico", origem_titulo: null },
    // A mesma conversa noutra empresa diz que veio de anúncio: não pode contar.
    { cliente_slug: "empresa_b", identificador_conversa: conversaFalsa(3).conversa, origem_source_id: "ad-b", origem_tipo: "anuncio", origem_titulo: null },
  ];
  base.substituir("lexia_contactos", contactos);
  base.substituir("lexia_anuncios", [
    { anuncio_externo_id: "ad-1", campanha_nome: "Black Friday", cliente_slug: "empresa_a", nome: "Vídeo do antes e depois", plataforma: "meta" },
    { anuncio_externo_id: "ad-b", campanha_nome: "Campanha da B", cliente_slug: "empresa_b", nome: "Anúncio da B", plataforma: "meta" },
  ]);
  base.registos.length = 0;
  const r = (await FERRAMENTAS.conversas_recentes.executar(escopo, { estado: "", so_anuncio: true })).dados as Record<string, unknown>[];
  assert.equal(r.length, 40);
  assert.ok(r.every((c) => Number(String(c.conversa).slice(-4)) % 2 === 0));
  assert.deepEqual({ anuncio: r[0].anuncio, campanha: r[0].campanha }, { anuncio: "Vídeo do antes e depois", campanha: "Black Friday" });
  assert.deepEqual({ anuncio: r[1].anuncio, campanha: r[1].campanha }, { anuncio: "Promo de novembro", campanha: null });
  assert.ok(!JSON.stringify(r).includes("da B"));
  for (const reg of base.registos.filter((x) => x.tabela === "lexia_contactos" || x.tabela === "lexia_anuncios")) {
    assert.equal(reg.filtros.find((f) => f.coluna === "cliente_slug")?.valor, "empresa_a");
  }
  base.substituir("lexia_contactos", []);
  base.substituir("lexia_anuncios", []);
});

test("ajudante: a resposta final sai sem travessão; o sistema proíbe travessão e nomes internos", async () => {
  respostas = [fim("Tem 3 conversas — duas à espera.\n— Ana: das 10–12h\nBoa semana —")];
  pedidos.length = 0;
  const r = await perguntar(escopo, [], "Como está?", () => undefined);
  assert.equal(r.texto, "Tem 3 conversas, duas à espera.\n- Ana: das 10-12h\nBoa semana");
  assert.doesNotMatch(r.texto, /[—–]/);
  assert.equal(semTravessao("Foi ótimo—mesmo. A Ana (a nova – sim) ligou."), "Foi ótimo, mesmo. A Ana (a nova, sim) ligou.");
  // Sem travessão, o texto fica igual.
  const limpo = "Hoje: 4 marcações, 2 à espera.\n- Ana às 10h";
  assert.equal(semTravessao(limpo), limpo);
  const sistema = instrucoes(escopo);
  assert.match(sistema, /Nunca use travessão/);
  assert.match(sistema, /nomes internos de ferramentas/);
});
