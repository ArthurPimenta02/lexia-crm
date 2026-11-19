/**
 * Analista Lexia, ferramentas de leitura (procurar nas conversas, ler várias
 * conversas, relatório). A empresa vem SEMPRE do escopo do servidor; a IA é
 * SEMPRE a do próprio cliente e é simulada por um `fetch` falso (nenhuma
 * chamada real, nenhum crédito gasto).
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

const DIA = 86_400_000;
const agora = Date.now();
const iso = (diasAtras: number, horas = 0) => new Date(agora - diasAtras * DIA + horas * 3_600_000).toISOString();
const chave = (diasAtras: number) => iso(diasAtras).slice(0, 10);

const FRASE = "Olá! Gostaria de conhecer mais sobre os pacotes de limpeza.";
const msg = (id: string, slug: string, conversa: string, direccao: "recebida" | "enviada", conteudo: string, criado_em: string, origem: string | null = null) => ({ cliente_slug: slug, conteudo, criado_em, direccao, id, identificador_conversa: conversa, origem, tipo: "texto" });

const base = new FakeSupabase({
  lexia_conexoes: [
    { campos: { anthropic_base_url: "https://cache-a.exemplo" }, cliente_slug: "empresa_a", segredos: JSON.stringify({ anthropic_api_key: "chave-da-a" }), tipo: "ia" },
    { campos: {}, cliente_slug: "empresa_b", segredos: JSON.stringify({ anthropic_api_key: "chave-da-b" }), tipo: "ia" },
  ],
  lexia_mensagens: [
    // A1: começou com a frase e agendou.
    msg("a1-1", "empresa_a", "whatsapp:351911111111", "recebida", FRASE, iso(10)),
    msg("a1-2", "empresa_a", "whatsapp:351911111111", "enviada", "Claro! Temos três pacotes.", iso(10, 1)),
    // A2: a frase não foi a primeira mensagem.
    msg("a2-1", "empresa_a", "whatsapp:351922222222", "recebida", "Bom dia", iso(9)),
    msg("a2-2", "empresa_a", "whatsapp:351922222222", "recebida", "ola, gostaria de conhecer mais sobre os pacotes", iso(9, 1)),
    // A3: começou com a frase, no Instagram, não agendou; mais tarde cancelou outra coisa.
    msg("a3-1", "empresa_a", "instagram:999", "recebida", "OLA gostaria de conhecer mais sobre os pacotes!!", iso(5)),
    msg("a3-2", "empresa_a", "instagram:999", "enviada", "Oi! Posso ajudar.", iso(5, 1), "humano"),
    // A4: conversa do cancelamento (há uma mensagem velha fora da janela).
    msg("a4-0", "empresa_a", "whatsapp:351933333333", "recebida", "MENSAGEM-VELHA-FORA-DA-JANELA", iso(40)),
    msg("a4-1", "empresa_a", "whatsapp:351933333333", "recebida", "Vou ter de cancelar, fiquei doente", iso(3)),
    // B: mesma frase noutra empresa (nunca pode aparecer).
    msg("b1-1", "empresa_b", "whatsapp:351944444444", "recebida", `${FRASE} SEGREDO-DA-B`, iso(8)),
    msg("t-1", "empresa_a", "teste:1", "recebida", FRASE, iso(2)),
  ],
  lexia_contactos: [
    { cliente_slug: "empresa_a", criado_em: iso(10), fundido_em: null, identificador_conversa: "whatsapp:351911111111", nome: "Ana", origem_tipo: "ctwa", telefone_digitos: "351911111111" },
    { cliente_slug: "empresa_a", criado_em: iso(5), fundido_em: null, identificador_conversa: "instagram:999", nome: "Inês", origem_tipo: "anuncio", telefone_digitos: null },
    { cliente_slug: "empresa_a", criado_em: iso(20), fundido_em: null, identificador_conversa: "whatsapp:351933333333", nome: "Carla", origem_tipo: "organico", telefone_digitos: "351933333333" },
    { cliente_slug: "empresa_b", criado_em: iso(8), fundido_em: null, identificador_conversa: "whatsapp:351944444444", nome: "Bia", origem_tipo: "ctwa", telefone_digitos: "351944444444" },
  ],
  lexia_agendamentos: [
    { cliente_slug: "empresa_a", criado_no_google: iso(9), dia_inteiro: false, estado: "confirmado", inicio: iso(-2), servico: "Limpeza", telefone_digitos: "351911111111" },
    { actualizado_no_google: iso(3), cliente_slug: "empresa_a", criado_no_google: iso(12), dia_inteiro: false, estado: "cancelado", inicio: iso(1), nome_cliente: "Carla", servico: "Polimento", telefone_digitos: "351933333333" },
    { actualizado_no_google: iso(3), cliente_slug: "empresa_b", criado_no_google: iso(12), dia_inteiro: false, estado: "cancelado", inicio: iso(1), nome_cliente: "Bia", servico: "Unhas", telefone_digitos: "351944444444" },
  ],
});

// O duplo não tem `ilike`: aplica-o a sério (como o Postgres: % = qualquer coisa, _ = um carácter, sem maiúsculas).
const prototipo = Object.getPrototypeOf(base.from("x").select()) as Record<string, unknown>;
prototipo.ilike = function (this: { padroes: { coluna: string; regex: RegExp }[] }, coluna: string, padrao: string) {
  const regex = new RegExp(`^${padrao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "isu");
  this.padroes.push({ coluna, regex });
  return this;
};

mock.module("@/lib/conexoes/cifra", { namedExports: { decifrar: (s: string) => JSON.parse(s) } });
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });
const campanhasPedidas: string[] = [];
mock.module("@/lib/campaigns/read", {
  namedExports: {
    getPainelCampanhas: async ({ clienteSlug }: { clienteSlug: string }) => {
      campanhasPedidas.push(clienteSlug);
      return { custoPorContacto: 5, gasto: 100, moeda: "EUR", porCampanha: [{ contactosAtribuidos: 8, estado: "ACTIVE", gasto: 70, marcacoesAtribuidas: 3, nome: "Pacotes Novembro" }, { contactosAtribuidos: 4, estado: "ACTIVE", gasto: 30, marcacoesAtribuidas: 0, nome: "Teste Reels" }], temDados: true };
    },
  },
});
const resultadosPedidos: { slug: string; de: string; ate: string }[] = [];
const numeros = (x: Partial<Record<string, number>>) => ({ aMao: 2, agendamentos: 10, agendaramAnuncio: 3, cancelados: 1, conversas: 40, doAgente: 8, leads: 30, leadsAnuncio: 20, valor: 0, vieram: 5, ...x });
mock.module("@/lib/movel/resultados", {
  namedExports: {
    dadosResultados: async (slug: string, _fuso: string, i: { de: string; ate: string }) => {
      resultadosPedidos.push({ ate: i.ate, de: i.de, slug });
      return { anterior: numeros({ agendamentos: 6, cancelados: 0, leads: 20 }), anuncios: [], atual: numeros({}), dias: 7, gasto: 100, leadsPorDia: [], moeda: "EUR" };
    },
    diasDoIntervalo: (i: { de: string; ate: string }) => Math.round((Date.parse(`${i.ate}T12:00:00Z`) - Date.parse(`${i.de}T12:00:00Z`)) / DIA) + 1,
  },
});

type Pedido = { url: string; chave: string | null; corpo: { model: string; system: string; max_tokens: number; messages: { content: string }[]; output_config?: unknown } };
const pedidos: Pedido[] = [];
let falharIa = false;
// IA falsa: responde conforme o conteúdo (as chamadas correm em paralelo, a ordem não é fixa).
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const corpo = JSON.parse(String(init?.body)) as Pedido["corpo"];
  pedidos.push({ chave: new Headers(init?.headers).get("x-api-key"), corpo, url: String(url) });
  if (falharIa) return new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 });
  const txt = corpo.messages[0].content;
  let json: unknown;
  if (corpo.system.startsWith("Agrupe")) json = { grupos: [{ conversas: [0, 1, 2], tema: "doença" }, { conversas: [99], tema: "inventado" }] };
  else json = { citacao: /doente/.test(txt) ? "fiquei doente" : "", resposta: /doente/.test(txt) ? "Cancelou por doença." : "Sem motivo claro.", resultado: "cancelou", temas: ["doença"] };
  return new Response(JSON.stringify({ content: [{ text: JSON.stringify(json), type: "text" }], stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 100 } }), { headers: { "content-type": "application/json" }, status: 200 });
}) as typeof fetch;

const { FERRAMENTAS_LEITURA, usarNumerosDoNegocio } = await import("@/lib/ajudante/ferramentas/leitura");
const { normalizar, padraoLargo, periodoAte } = await import("@/lib/ajudante/ferramentas/comum");
const { intervaloDoRelatorio } = await import("@/lib/ajudante/ferramentas/relatorio");
const { escolherConversas } = await import("@/lib/ajudante/ferramentas/leitura-em-massa");

const escopo = { clienteNome: "Empresa A", clienteSlug: "empresa_a", fuso: "Europe/Lisbon", locale: "pt-BR" };
const correr = async (nome: string, args: Record<string, unknown>, e = escopo) => (await FERRAMENTAS_LEITURA[nome].executar(e, args)).dados as Record<string, unknown>;
const consultasSemEmpresa = (tabelas: string[]) => base.registos.filter((r) => tabelas.includes(r.tabela) && !r.filtros.some((f) => f.coluna === "cliente_slug" && f.valor === escopo.clienteSlug));
const periodoLargo = { ate: chave(0), de: chave(60) };

test("leitura: as três ferramentas têm o formato das existentes", () => {
  assert.deepEqual(Object.keys(FERRAMENTAS_LEITURA), ["procurar_nas_conversas", "analisar_varias_conversas", "relatorio_do_periodo"]);
  for (const f of Object.values(FERRAMENTAS_LEITURA)) {
    assert.equal(typeof f.descricao, "string");
    assert.equal(typeof f.rotulo, "string");
    const p = f.parametros as { type: string; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
    assert.equal(p.type, "object");
    assert.equal(p.additionalProperties, false);
    for (const r of p.required) assert.ok(r in p.properties, r);
    assert.doesNotMatch(f.descricao, /cliente_slug|lexia_/);
  }
});

test("leitura: normalizar e padrão largo aceitam acentos e pontuação", () => {
  assert.equal(normalizar("  Olá! Gostaria… de CONHECER   "), "ola gostaria de conhecer");
  const re = new RegExp(`^${padraoLargo(normalizar("Ola gostaria")).replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
  assert.match("Olá, gostaria de", re);
  assert.match("ola GOSTARIA", re);
  // Período: no máximo 180 dias e nunca depois de hoje.
  const p = periodoAte({ ate: "2099-01-01", de: "2000-01-01" }, "2026-11-19", 30, 180);
  assert.deepEqual(p, { ate: "2026-11-19", de: "2026-05-24" });
});

test("procurar: só a empresa da sessão, sem acentos nem pontuação, e diz quem agendou", async () => {
  base.registos.length = 0;
  const d = await correr("procurar_nas_conversas", { ...periodoLargo, cliente_slug: "empresa_b", texto: "ola gostaria de conhecer mais sobre os pacotes" });
  const ocorr = d.ocorrencias as { conversa: string; agendou: boolean; nome: string | null; trecho: string; de_anuncio: boolean }[];
  assert.deepEqual(ocorr.map((o) => o.conversa).sort(), ["instagram:999", "whatsapp:351911111111", "whatsapp:351922222222"]);
  assert.doesNotMatch(JSON.stringify(d), /SEGREDO-DA-B|351944444444|teste:1/);
  const ana = ocorr.find((o) => o.conversa === "whatsapp:351911111111")!;
  assert.equal(ana.agendou, true);
  assert.equal(ana.nome, "Ana");
  assert.equal(ana.de_anuncio, true);
  assert.equal(ocorr.find((o) => o.conversa === "instagram:999")!.agendou, false);
  assert.deepEqual(consultasSemEmpresa(["lexia_mensagens", "lexia_contactos", "lexia_agendamentos"]), []);
});

test("procurar: primeira mensagem + agendou = o caso real", async () => {
  const todos = await correr("procurar_nas_conversas", { ...periodoLargo, primeira_mensagem: true, texto: "Olá! Gostaria de conhecer mais sobre os pacotes" });
  assert.deepEqual((todos.ocorrencias as { conversa: string }[]).map((o) => o.conversa).sort(), ["instagram:999", "whatsapp:351911111111"]);
  assert.deepEqual(todos.resumo, { agendaram: 1, cancelaram: 0, de_anuncio: 2 });
  const sim = await correr("procurar_nas_conversas", { ...periodoLargo, agendou: "sim", primeira_mensagem: true, texto: FRASE });
  assert.deepEqual((sim.ocorrencias as { conversa: string }[]).map((o) => o.conversa), ["whatsapp:351911111111"]);
  const insta = await correr("procurar_nas_conversas", { ...periodoLargo, canal: "instagram", texto: "pacotes" });
  assert.deepEqual((insta.ocorrencias as { conversa: string }[]).map((o) => o.conversa), ["instagram:999"]);
  const equipe = await correr("procurar_nas_conversas", { ...periodoLargo, quem: "equipe", texto: "posso ajudar" });
  assert.deepEqual((equipe.ocorrencias as { conversa: string; de: string }[]).map((o) => [o.conversa, o.de]), [["instagram:999", "equipe"]]);
  const curto = await correr("procurar_nas_conversas", { texto: "!!" });
  assert.ok(curto.erro);
});

test("ler várias: sem chave do cliente não chama IA nenhuma", async () => {
  pedidos.length = 0;
  const d = await correr("analisar_varias_conversas", { conversas: ["whatsapp:351911111111"], criterio: "lista", pergunta: "Porquê?" }, { ...escopo, clienteSlug: "empresa_sem_chave" });
  assert.match(String(d.erro), /IA ligada/);
  assert.equal(pedidos.length, 0);
});

test("ler várias: chave e modelo barato do PRÓPRIO cliente; a conversa de outra empresa não é lida", async () => {
  pedidos.length = 0;
  base.registos.length = 0;
  const d = await correr("analisar_varias_conversas", { conversas: ["whatsapp:351911111111", "whatsapp:351933333333", "instagram:999", "whatsapp:351944444444"], criterio: "lista", pergunta: "Porque cancelou?" });
  assert.equal(d.analisadas, 3);
  assert.equal(d.sem_mensagens, 1);
  // 3 conversas + 1 agrupamento.
  assert.equal(pedidos.length, 4);
  for (const p of pedidos) {
    assert.equal(p.chave, "chave-da-a");
    assert.equal(p.url, "https://cache-a.exemplo/v1/messages");
    assert.equal(p.corpo.model, "claude-haiku-4-5");
    assert.ok(p.corpo.output_config);
    assert.doesNotMatch(JSON.stringify(p.corpo), /SEGREDO-DA-B/);
  }
  // Agregado: contagem em código, índices inventados pela IA ignorados.
  assert.deepEqual(d.agregado, [{ citacao: "fiquei doente", conversas: 3, exemplo: "Carla", tema: "doença" }]);
  assert.equal(typeof d.custo_usd, "number");
  assert.deepEqual(consultasSemEmpresa(["lexia_mensagens", "lexia_contactos", "lexia_agendamentos"]), []);
});

test("ler várias: quem cancelou liga a marcação à conversa pelo telefone e lê só à volta da data", async () => {
  const { alvos } = await escolherConversas(escopo, "cancelaram", {}, periodoLargo);
  assert.deepEqual(alvos.map((a) => a.conversa), ["whatsapp:351933333333"]);
  assert.match(alvos[0].contexto ?? "", /Polimento/);
  pedidos.length = 0;
  const d = await correr("analisar_varias_conversas", { ...periodoLargo, criterio: "cancelaram", pergunta: "Qual o motivo do cancelamento?" });
  assert.equal(d.analisadas, 1);
  const enviado = pedidos[0].corpo.messages[0].content;
  assert.match(enviado, /fiquei doente/);
  assert.doesNotMatch(enviado, /MENSAGEM-VELHA-FORA-DA-JANELA/);
  assert.match(enviado, /<conversa>/);
  assert.deepEqual((d.tabela as { resposta: string }[]).map((l) => l.resposta), ["Cancelou por doença."]);
});

test("ler várias: mais de 25 conversas ou acima do teto pede para estreitar sem gastar nada", async () => {
  const muitas = Array.from({ length: 30 }, (_, i) => `whatsapp:35190000${String(i).padStart(4, "0")}`);
  pedidos.length = 0;
  const d = await correr("analisar_varias_conversas", { conversas: muitas, criterio: "lista", pergunta: "Objeções?" });
  assert.match(String(d.precisa_estreitar), /30 conversas/);
  assert.equal(pedidos.length, 0);

  process.env.ANALISTA_TETO_USD = "0.0001";
  try {
    const caro = await correr("analisar_varias_conversas", { conversas: ["whatsapp:351911111111", "whatsapp:351933333333"], criterio: "lista", pergunta: "Objeções?" });
    assert.match(String(caro.precisa_estreitar), /teto/);
    assert.equal(pedidos.length, 0);
  } finally {
    delete process.env.ANALISTA_TETO_USD;
  }

  // Erro da IA numa conversa não rebenta: fica contado.
  falharIa = true;
  try {
    const r = await correr("analisar_varias_conversas", { conversas: ["whatsapp:351911111111"], criterio: "lista", pergunta: "Objeções?" });
    assert.equal(r.analisadas, 0);
    assert.equal(r.falharam, 1);
  } finally {
    falharIa = false;
  }
});

test("ler várias: leads de anúncio que não agendaram e quem passou para a equipe", async () => {
  const anuncio = await escolherConversas(escopo, "anuncio_sem_agendamento", {}, periodoLargo);
  assert.deepEqual(anuncio.alvos.map((a) => a.conversa), ["instagram:999"]);
  base.linhasDe("lexia_mensagens").push(msg("a3-3", "empresa_a", "instagram:999", "recebida", "Quero falar com alguém", iso(4), "recebida_na_pausa"), msg("b-p", "empresa_b", "whatsapp:351944444444", "recebida", "x", iso(4), "recebida_na_pausa"));
  const pessoa = await escolherConversas(escopo, "pediram_pessoa", {}, periodoLargo);
  assert.deepEqual(pessoa.alvos.map((a) => a.conversa), ["instagram:999"]);
});

test("relatório: markdown pronto, números das telas, comparação, campanhas e só desta empresa", async () => {
  campanhasPedidas.length = 0;
  resultadosPedidos.length = 0;
  const d = await correr("relatorio_do_periodo", { cliente_slug: "empresa_b", periodo: "semana" });
  const md = String(d.relatorio);
  assert.match(md, /^# Relatório de Empresa A: /);
  assert.match(md, /\*\*Leads novos:\*\* 30 \(antes 20, \+50%\)/);
  assert.match(md, /\*\*Agendamentos:\*\* 10 \(antes 6, \+67%\)/);
  assert.match(md, /Pacotes Novembro/);
  assert.match(md, /"Teste Reels"/); // gasto sem agendamento identificado → a melhorar
  assert.match(md, /## O que deu certo/);
  assert.match(md, /## Próximos passos/);
  assert.doesNotMatch(md, /[—–]/);
  assert.deepEqual(campanhasPedidas, ["empresa_a"]);
  assert.equal(resultadosPedidos[0].slug, "empresa_a");

  usarNumerosDoNegocio(async (e) => ({ ticket_medio: e.clienteSlug === "empresa_a" ? 55 : 0 }));
  try {
    const comExtra = await correr("relatorio_do_periodo", { periodo: "mes" });
    assert.match(String(comExtra.relatorio), /## Outros números\n- \*\*ticket medio:\*\* 55/);
  } finally {
    usarNumerosDoNegocio(null);
  }
});

test("relatório: períodos", () => {
  assert.deepEqual(intervaloDoRelatorio("mes", {}, "2026-11-19"), { ate: "2026-11-19", de: "2026-11-01" });
  assert.deepEqual(intervaloDoRelatorio("mes_passado", {}, "2026-03-10"), { ate: "2026-02-28", de: "2026-02-01" });
  assert.deepEqual(intervaloDoRelatorio("semana", {}, "2026-11-19"), { ate: "2026-11-19", de: "2026-11-16" });
  assert.deepEqual(intervaloDoRelatorio("semana_passada", {}, "2026-11-19"), { ate: "2026-11-15", de: "2026-11-09" });
  assert.deepEqual(intervaloDoRelatorio("personalizado", { ate: "2026-11-10", de: "2026-01-01" }, "2026-11-19"), { ate: "2026-11-10", de: "2026-08-11" });
});
