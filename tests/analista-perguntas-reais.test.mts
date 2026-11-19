/**
 * Analista Lexia de ponta a ponta, com as perguntas REAIS que o Arthur fez
 * sobre o Detail (conversa de 19/11). A IA é falsa (um `fetch` simulado, nenhum
 * crédito gasto) e a base é um duplo em memória: o que se prova aqui é o
 * motor + as ferramentas a sério:
 *  - o motor oferece TODAS as ferramentas novas, e o sistema diz quando usar cada uma;
 *  - a ferramenta que a IA pede corre de verdade, só com dados desta empresa,
 *    e o resultado volta à IA; a resposta final chega ao dono.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

// Sem credenciais da base própria do Detail no teste: nenhuma ligação real.
for (const k of ["DETAIL_BY_CORDEIRO_SUPABASE_URL", "DETAIL_BY_CORDEIRO_SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const SLUG = "detail_by_cordeiro";
const OUTRA = "miranda_skin_experts";
const FUSO = "Europe/Lisbon";
const DIA = 86_400_000;
const agora = Date.now();
const iso = (diasAtras: number, horas = 0) => new Date(agora - diasAtras * DIA + horas * 3_600_000).toISOString();
const chave = (diasAtras: number) => iso(diasAtras).slice(0, 10);
const HOJE = chave(0);

const FRASE = "Olá! Gostaria de conhecer mais sobre os pacotes de detalhe automóvel.";
const msg = (id: string, slug: string, conversa: string, direccao: "recebida" | "enviada", conteudo: string, criado_em: string, origem: string | null = null) => ({ cliente_slug: slug, conteudo, criado_em, direccao, id, identificador_conversa: conversa, origem, tipo: "texto" });

const base = new FakeSupabase({
  lexia_conexoes: [
    { campos: {}, cliente_slug: SLUG, segredos: JSON.stringify({ anthropic_api_key: "chave-do-detail" }), tipo: "ia" },
    { campos: {}, cliente_slug: OUTRA, segredos: JSON.stringify({ anthropic_api_key: "chave-da-miranda" }), tipo: "ia" },
  ],
  lexia_clientes: [{ followups_longos: true, lista_espera: false, modo_teste: false, slug: SLUG, status: "ativo" }],
  lexia_contactos: [
    { canal: "whatsapp", cliente_slug: SLUG, criado_em: iso(10), fundido_em: null, identificador_conversa: "whatsapp:351911111111", nome: "Ana", origem_source_id: "ad1", origem_tipo: "ctwa", telefone_digitos: "351911111111" },
    { canal: "instagram", cliente_slug: SLUG, criado_em: iso(6), fundido_em: null, identificador_conversa: "instagram:777", nome: "Inês", origem_source_id: "ad1", origem_tipo: "instagram_ad", telefone_digitos: null },
    { canal: "whatsapp", cliente_slug: SLUG, criado_em: iso(20), fundido_em: null, identificador_conversa: "whatsapp:351933333333", nome: "Rui", origem_source_id: null, origem_tipo: "organico", telefone_digitos: "351933333333" },
    // A outra empresa, com a mesma frase e o mesmo anúncio: nunca pode aparecer.
    { canal: "whatsapp", cliente_slug: OUTRA, criado_em: iso(8), fundido_em: null, identificador_conversa: "whatsapp:351944444444", nome: "Bia-da-Miranda", origem_source_id: "ad1", origem_tipo: "ctwa", telefone_digitos: "351944444444" },
  ],
  lexia_anuncios: [
    { anuncio_externo_id: "ad1", campanha_externa_id: "C1", campanha_nome: "Pacotes Detalhe Novembro", cliente_slug: SLUG, nome: "Vídeo antes e depois" },
    { anuncio_externo_id: "ad1", campanha_externa_id: "CM", campanha_nome: "Campanha-da-Miranda", cliente_slug: OUTRA, nome: "x" },
  ],
  lexia_campanhas: [
    { campanha_externa_id: "C1", cliente_slug: SLUG, id: "uuid-c1", nome: "Pacotes Detalhe Novembro" },
    { campanha_externa_id: "CM", cliente_slug: OUTRA, id: "uuid-cm", nome: "Campanha-da-Miranda" },
  ],
  lexia_campanha_custos: [
    { campanha_id: "uuid-c1", cliente_slug: SLUG, dia: chave(5), gasto: 100, moeda: "EUR" },
    { campanha_id: "uuid-cm", cliente_slug: OUTRA, dia: chave(5), gasto: 9999, moeda: "EUR" },
  ],
  lexia_agendamentos: [
    // Ana: veio do anúncio, marcou e já foi atendida (Full Detail, 250).
    { actualizado_no_google: iso(9), cliente_slug: SLUG, criado_em: iso(9), criado_no_google: iso(9), dia_inteiro: false, estado: "confirmado", executor: "martim", fim: iso(2, 3), id: "m1", inicio: iso(2), nome_cliente: "Ana", servico: "Full Detail", telefone_digitos: "351911111111", valor_previsto: 250 },
    // Rui: cancelou.
    { actualizado_no_google: iso(3), cliente_slug: SLUG, criado_em: iso(12), criado_no_google: iso(12), dia_inteiro: false, estado: "cancelado", executor: "martim", fim: iso(1, -3), id: "m2", inicio: iso(1, -4), nome_cliente: "Rui", servico: "Polimento", telefone_digitos: "351933333333", valor_previsto: 180 },
    { actualizado_no_google: iso(3), cliente_slug: OUTRA, criado_em: iso(9), criado_no_google: iso(9), dia_inteiro: false, estado: "confirmado", executor: "Samuel", fim: iso(2, 1), id: "b1", inicio: iso(2), nome_cliente: "Bia-da-Miranda", servico: "Laser", telefone_digitos: "351944444444", valor_previsto: 7777 },
  ],
  lexia_mensagens: [
    msg("a1", SLUG, "whatsapp:351911111111", "recebida", FRASE, iso(10)),
    msg("a2", SLUG, "whatsapp:351911111111", "enviada", "Claro! Temos três pacotes.", iso(10, 1), "workflow"),
    msg("i1", SLUG, "instagram:777", "recebida", "Oi, quanto custa o polimento?", iso(6)),
    msg("r1", SLUG, "whatsapp:351933333333", "recebida", "Vou ter de cancelar, o carro avariou", iso(3)),
    msg("b1", OUTRA, "whatsapp:351944444444", "recebida", `${FRASE} SEGREDO-DA-MIRANDA`, iso(8)),
  ],
  lexia_eventos: [],
  lexia_handoffs: [],
  lexia_conversation_insights: [],
});

// O duplo não tem `ilike`: aplica-o a sério (% = qualquer coisa, _ = um carácter, sem maiúsculas).
const prototipo = Object.getPrototypeOf(base.from("x").select()) as Record<string, unknown>;
prototipo.ilike = function (this: { padroes: { coluna: string; regex: RegExp }[] }, coluna: string, padrao: string) {
  const regex = new RegExp(`^${padrao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "isu");
  this.padroes.push({ coluna, regex });
  return this;
};

// A consulta livre vai a uma função da base; aqui é simulada (a função real testa-se à parte).
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let rpcResposta: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
(base as unknown as { rpc: unknown }).rpc = async (fn: string, args: Record<string, unknown>) => {
  rpcs.push({ args, fn });
  return rpcResposta;
};

mock.module("@/lib/conexoes/cifra", { namedExports: { decifrar: (s: string) => JSON.parse(s) } });
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });
mock.module("@/lib/servicos/read", { namedExports: { getServicosAgendaveis: async () => [] } });
mock.module("@/lib/campaigns/read", {
  namedExports: {
    getPainelCampanhas: async ({ clienteSlug }: { clienteSlug: string }) => {
      assert.equal(clienteSlug, SLUG);
      return { contactosNovos: 3, custoPorContacto: 50, gasto: 100, moeda: "EUR", porCampanha: [{ contactosAtribuidos: 2, estado: "ACTIVE", gasto: 100, marcacoesAtribuidas: 1, nome: "Pacotes Detalhe Novembro" }], temDados: true };
    },
  },
});
const numerosResultados = (x: Partial<Record<string, number>> = {}) => ({ aMao: 0, agendamentos: 1, agendaramAnuncio: 1, cancelados: 1, conversas: 3, doAgente: 1, leads: 3, leadsAnuncio: 2, valor: 250, vieram: 1, ...x });
mock.module("@/lib/movel/resultados", {
  namedExports: {
    dadosResultados: async (slug: string) => {
      assert.equal(slug, SLUG);
      return { anterior: numerosResultados({ agendamentos: 0, leads: 1 }), anuncios: [], atual: numerosResultados(), dias: 7, gasto: 100, leadsPorDia: [], moeda: "EUR" };
    },
    diasDoIntervalo: (i: { de: string; ate: string }) => Math.round((Date.parse(`${i.ate}T12:00:00Z`) - Date.parse(`${i.de}T12:00:00Z`)) / DIA) + 1,
  },
});

// ------------------------------------------------------------- a IA falsa
type Bloco = { type: string; text?: string; content?: string; tool_use_id?: string; is_error?: boolean; id?: string; name?: string; input?: unknown };
type Corpo = { model: string; system: { text: string }[] | string; messages: { role: string; content: string | Bloco[] }[]; tools?: { name: string; description: string }[]; tool_choice?: { type: string } };
type Pedido = { chave: string | null; corpo: Corpo };
const pedidos: Pedido[] = [];
const haiku: Pedido[] = [];
let fila: unknown[] = [];
globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
  const corpo = JSON.parse(String(init?.body)) as Corpo;
  const p = { chave: new Headers(init?.headers).get("x-api-key"), corpo };
  const ok = (j: unknown) => new Response(JSON.stringify(j), { headers: { "content-type": "application/json" }, status: 200 });
  if (corpo.model === "claude-haiku-4-5") {
    // A leitura em massa: uma chamada por conversa e uma para agrupar.
    haiku.push(p);
    const sistema = String(corpo.system);
    const txt = String((corpo.messages[0] as { content: string }).content);
    const json = sistema.startsWith("Agrupe")
      ? { grupos: [{ conversas: [0], tema: "carro avariado" }] }
      : { citacao: /avariou/.test(txt) ? "o carro avariou" : "", resposta: /avariou/.test(txt) ? "Cancelou porque o carro avariou." : "Sem motivo claro.", resultado: "cancelou", temas: ["carro avariado"] };
    return ok({ content: [{ text: JSON.stringify(json), type: "text" }], stop_reason: "end_turn", usage: { input_tokens: 800, output_tokens: 80 } });
  }
  pedidos.push(p);
  return ok(fila.shift() ?? { error: { message: "fila vazia" } });
}) as typeof fetch;

const uso = { input_tokens: 10, output_tokens: 5 };
let n = 0;
const pede = (...chamadas: [string, Record<string, unknown>][]) => ({ content: chamadas.map(([name, input]) => ({ id: `t${++n}`, input, name, type: "tool_use" })), stop_reason: "tool_use", usage: uso });
const responde = (texto: string) => ({ content: [{ text: texto, type: "text" }], stop_reason: "end_turn", usage: uso });

const { perguntar, instrucoes } = await import("@/lib/ajudante/motor");
const { FERRAMENTAS } = await import("@/lib/ajudante/ferramentas");

const escopo = { clienteNome: "Detail by Cordeiro", clienteSlug: SLUG, fuso: FUSO, locale: "pt-BR" };

/** Corre uma pergunta com a IA a pedir as ferramentas dadas; devolve a resposta e o que cada ferramenta devolveu à IA. */
async function rodar(pergunta: string, voltas: ReturnType<typeof pede>[], final: string) {
  fila = [...voltas, responde(final)];
  pedidos.length = 0;
  const eventos: string[] = [];
  const r = await perguntar(escopo, [], pergunta, (e) => eventos.push(e.nome));
  const devolvidos = pedidos.slice(1).flatMap((p) => {
    const ultima = p.corpo.messages[p.corpo.messages.length - 1];
    return Array.isArray(ultima.content) ? ultima.content.filter((b) => b.type === "tool_result") : [];
  });
  for (const d of devolvidos) assert.notEqual(d.is_error, true, `a ferramenta falhou: ${d.content}`);
  const tudo = devolvidos.map((d) => d.content ?? "").join("\n");
  // Nada da outra empresa volta à IA, nunca.
  assert.doesNotMatch(tudo, /Miranda|9999|7777|Bia-da/);
  assert.equal(pedidos[0].chave, "chave-do-detail");
  return { devolvidos: devolvidos.map((d) => JSON.parse(d.content ?? "null") as Record<string, unknown>), eventos, r, tudo };
}

const NOVAS = ["numeros_do_negocio", "como_funciona_o_agente", "consulta_livre", "procurar_nas_conversas", "analisar_varias_conversas", "relatorio_do_periodo"];

test("perguntas reais: o motor oferece as ferramentas novas (no fim, a ordem antiga mantém-se) e o sistema diz quando usar cada uma", async () => {
  fila = [responde("Olá!")];
  pedidos.length = 0;
  await perguntar(escopo, [], "Olá", () => undefined);
  const nomes = (pedidos[0].corpo.tools ?? []).map((t) => t.name);
  assert.deepEqual(nomes, ["resumo", "agenda", "hoje", "conversas_recentes", "ler_conversa", "procurar_clientes", "campanhas", "servicos", "objecoes", "propor_mensagem", ...NOVAS]);
  const s = instrucoes(escopo);
  const regra = (ferramenta: string, assunto: RegExp) => {
    const linha = s.split("\n").find((l) => l.includes(ferramenta) && assunto.test(l));
    assert.ok(linha, `falta a regra de ${ferramenta} para ${assunto}`);
  };
  regra("numeros_do_negocio", /CAC/);
  regra("numeros_do_negocio", /retorno/i);
  regra("numeros_do_negocio", /NUNCA faça contas de cabeça/);
  regra("como_funciona_o_agente", /lembretes.*follow-up|mensagens automáticas/);
  regra("procurar_nas_conversas", /começou com/);
  regra("analisar_varias_conversas", /cancelamentos/);
  regra("relatorio_do_periodo", /Relatório/);
  regra("consulta_livre", /cruzamentos/);
  assert.match(s, /Não diga que não consegue .* antes de tentar a consulta livre/);
  // O esquema da consulta livre vai no sistema fixo (em cache), com o fuso da empresa já posto.
  assert.match(s, /analista\.agendamentos\(/);
  assert.match(s, /at time zone 'Europe\/Lisbon'/);
  assert.doesNotMatch(s, /<fuso>/);
  // As regras antigas continuam lá.
  assert.match(s, /Nunca use travessão/);
  assert.match(s, /nomes internos de ferramentas/);
  // Fora da própria regra, o texto novo não usa travessão.
  assert.doesNotMatch(s.replace("(— ou –)", ""), /[—–]/);
});

test("1. 'Os agendamentos vieram de quais campanhas do dia 21/10 até hoje?' → números por campanha", async () => {
  const { devolvidos, eventos, r } = await rodar(
    "Os agendamentos vieram de quais campanhas do dia 21/10 até hoje?",
    [pede(["numeros_do_negocio", { agrupar_por: "campanha", ate: HOJE, comparar_com_periodo_anterior: false, de: chave(29) }])],
    "1 agendamento veio da campanha Pacotes Detalhe Novembro.",
  );
  assert.deepEqual(eventos, ["numeros_do_negocio"]);
  const grupos = (devolvidos[0].numeros as { grupos: { grupo: string; agendamentos_marcados: number; gasto_anuncios?: number }[] }).grupos;
  const camp = grupos.find((g) => g.grupo === "Pacotes Detalhe Novembro");
  assert.ok(camp, JSON.stringify(grupos));
  assert.equal(camp.agendamentos_marcados, 1);
  assert.equal(camp.gasto_anuncios, 100);
  assert.match(r.texto, /Pacotes Detalhe Novembro/);
});

test("2. 'quem começou com \"Olá! Gostaria de conhecer…\" e agendou?' → procurar nas conversas (1.ª mensagem, agendou)", async () => {
  const { devolvidos, eventos, r } = await rodar(
    `quem começou com '${FRASE}' e agendou?`,
    [pede(["procurar_nas_conversas", { agendou: "sim", ate: HOJE, de: chave(60), primeira_mensagem: true, texto: FRASE }])],
    "A Ana começou com essa frase e agendou.",
  );
  assert.deepEqual(eventos, ["procurar_nas_conversas"]);
  assert.match(JSON.stringify(devolvidos[0]), /Ana/);
  assert.doesNotMatch(JSON.stringify(devolvidos[0]), /Rui|Inês/);
  assert.match(r.texto, /Ana/);
});

test("3. 'houve agendamentos vindos do Instagram nesse período?' → números por canal", async () => {
  const { devolvidos } = await rodar(
    "houve agendamentos vindos do Instagram nesse período?",
    [pede(["numeros_do_negocio", { agrupar_por: "canal", ate: HOJE, comparar_com_periodo_anterior: false, de: chave(29) }])],
    "Do Instagram não houve agendamentos; houve 1 contato.",
  );
  const grupos = (devolvidos[0].numeros as { grupos: { grupo: string; agendamentos_marcados: number; leads_novos?: number }[] }).grupos;
  const ig = grupos.find((g) => g.grupo === "instagram");
  assert.ok(ig, JSON.stringify(grupos));
  assert.equal(ig.agendamentos_marcados, 0);
  assert.equal(ig.leads_novos, 1);
  assert.equal(grupos.find((g) => g.grupo === "whatsapp")?.agendamentos_marcados, 1);
});

test("4. 'quantos contatos tivemos no Instagram nesse período?' → consulta livre, sempre com a empresa do servidor", async () => {
  rpcs.length = 0;
  rpcResposta = { data: { linhas: [{ contatos: 1 }], mostradas: 1, total: 1, truncado: false }, error: null };
  const sql = `select count(*) as contatos from analista.contactos where canal = 'instagram' and criado_em >= '${chave(29)}'`;
  const { devolvidos, eventos } = await rodar("quantos contatos tivemos no Instagram nesse período?", [pede(["consulta_livre", { cliente_slug: OUTRA, sql }])], "Tivemos 1 contato no Instagram.");
  assert.deepEqual(eventos, ["consulta_livre"]);
  assert.deepEqual(rpcs, [{ args: { p_cliente: SLUG, p_sql: sql }, fn: "analista_consultar" }]);
  assert.deepEqual(devolvidos[0].linhas, [{ contatos: 1 }]);
});

test("5. 'qual o retorno estimado dos agendamentos dos últimos 14 dias?' → faturamento e gasto calculados em código", async () => {
  const { devolvidos } = await rodar(
    "qual o retorno estimado dos agendamentos dos últimos 14 dias?",
    [pede(["numeros_do_negocio", { agrupar_por: "nenhum", ate: HOJE, comparar_com_periodo_anterior: true, de: chave(13) }])],
    "Nos últimos 14 dias: 250 € faturados para 100 € de anúncios.",
  );
  const d = devolvidos[0] as { numeros: { total: { faturamento_dos_realizados: { total: number; real: number }; gasto_anuncios: number; cancelados: number } }; como_ler: Record<string, string>; tabela_de_precos: string };
  assert.equal(d.numeros.total.faturamento_dos_realizados.total, 250);
  assert.equal(d.numeros.total.faturamento_dos_realizados.real, 250);
  assert.equal(d.numeros.total.gasto_anuncios, 100);
  assert.match(d.como_ler.regra, /não refaça contas/);
  // Sem as variáveis da base própria do Detail, diz que não há tabela de preços (não inventa).
  assert.match(d.tabela_de_precos, /não disponível/);
});

test("6. 'por que tivemos tantos cancelamentos?' → lê as conversas dos cancelamentos com o Haiku e a chave do PRÓPRIO cliente", async () => {
  haiku.length = 0;
  const { devolvidos, eventos } = await rodar(
    "por que tivemos tantos cancelamentos?",
    [pede(["analisar_varias_conversas", { ate: HOJE, criterio: "cancelaram", de: chave(29), pergunta: "Qual o motivo do cancelamento?" }])],
    "Li 1 conversa: o cliente cancelou porque o carro avariou.",
  );
  assert.deepEqual(eventos, ["analisar_varias_conversas"]);
  assert.ok(haiku.length >= 1);
  assert.ok(haiku.every((p) => p.chave === "chave-do-detail" && p.corpo.model === "claude-haiku-4-5"));
  assert.match(JSON.stringify(devolvidos[0]), /carro avariado/);
  assert.match(JSON.stringify(devolvidos[0]), /Rui|351933333333/);
});

test("7. 'temos mensagens automáticas para quem agendou?' → a ficha técnica do agente desta empresa", async () => {
  const { devolvidos, eventos } = await rodar("temos mensagens automáticas para quem agendou?", [pede(["como_funciona_o_agente", {}])], "Sim: o agente manda lembretes da marcação.");
  assert.deepEqual(eventos, ["como_funciona_o_agente"]);
  const d = devolvidos[0] as { ficha: string; interruptores: { interruptor: string; estado?: string }[] };
  assert.match(d.ficha, /lembrete/i);
  assert.match(d.ficha, /Martim/);
});

test("8. 'qual nosso CAC?' → CAC mínimo e máximo, do código", async () => {
  const { devolvidos } = await rodar("qual nosso CAC?", [pede(["numeros_do_negocio", { agrupar_por: "nenhum", ate: HOJE, comparar_com_periodo_anterior: false, de: chave(29) }])], "O CAC ficou em 100 €.");
  const t = (devolvidos[0].numeros as { total: Record<string, number> }).total;
  assert.equal(t.cac_por_agendamento_de_anuncio, 100);
  assert.equal(t.cac_sobre_todos_os_agendamentos, 100);
  assert.match((devolvidos[0].como_ler as Record<string, string>).cac, /máximo|MÁXIMO/i);
});

test("9. 'os 3 próximos passos para otimizar' → números e relatório (com os números do painel ligados), em duas voltas", async () => {
  const { devolvidos, eventos, r } = await rodar(
    "os 3 próximos passos para otimizar",
    [
      pede(["numeros_do_negocio", { agrupar_por: "origem", ate: HOJE, comparar_com_periodo_anterior: true, de: chave(29) }]),
      pede(["relatorio_do_periodo", { periodo: "mes" }]),
    ],
    "1. Responder mais rápido no Instagram.\n2. Reforçar a campanha que agendou.\n3. Ligar a quem cancelou.",
  );
  assert.deepEqual(eventos, ["numeros_do_negocio", "relatorio_do_periodo"]);
  const relatorio = JSON.stringify(devolvidos[1]);
  assert.match(relatorio, /# Relatório de Detail by Cordeiro/);
  // A ligação relatório → numeros_do_negocio: a secção "Outros números" vem do painel calculado.
  assert.match(relatorio, /Outros números/);
  assert.match(relatorio, /faturamento dos realizados/);
  assert.match(r.texto, /^1\./);
});

test("consulta livre antes da migração: falha amigável, a IA continua e responde", async () => {
  rpcResposta = { data: null, error: { code: "PGRST202", message: "Could not find the function public.analista_consultar(p_cliente, p_sql) in the schema cache" } };
  const { devolvidos, r } = await rodar("quantos contatos tivemos no Instagram?", [pede(["consulta_livre", { sql: "select count(*) from analista.contactos" }])], "Ainda não consigo ver isso por aqui.");
  assert.equal(devolvidos[0].indisponivel, true);
  assert.match(String(devolvidos[0].erro), /ainda não está ativada/);
  assert.equal(r.texto, "Ainda não consigo ver isso por aqui.");
  rpcResposta = { data: null, error: null };
});

test("todas as ferramentas registadas têm rótulo traduzido nas 3 línguas", async () => {
  const { default: textos } = (await import("@/lib/i18n/textos/ajudante")) as { default: Record<string, Record<string, string>> };
  for (const f of Object.values(FERRAMENTAS)) {
    for (const [lingua, t] of Object.entries(textos)) assert.ok(t[f.rotulo], `falta "${f.rotulo}" em ${lingua}`);
  }
});
