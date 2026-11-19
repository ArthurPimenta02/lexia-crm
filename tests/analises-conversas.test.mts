/**
 * Análises das conversas (19/11/2026): /admin/analises.
 *
 * O que é que isto está a proteger
 * --------------------------------
 * 1. As tabelas `lexia_analises` e `lexia_analises_itens` são lidas e
 *    escritas pelo painel com a service_role (ignora o RLS). Só o
 *    `lexia_admin` pode chegar a elas: a página, as acções e a rota de pedido
 *    confirmam o papel ANTES de tocar na base. Um cliente comum não lê nem
 *    escreve (na base: RLS ligado e nada concedido a anon/authenticated).
 * 2. O utilizador `analise_leitura` (a rotina das 2h) ganha select, insert e
 *    update NESTAS duas tabelas, e mais nada.
 * 3. A rota de pedido nunca devolve o ANALISE_GITHUB_TOKEN, e sem ele não
 *    chama o GitHub.
 * 4. As regras puras: validação do pedido, contagens, erros que se repetem.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";
import type { ItemResumo } from "../lib/analises/regras";

type Perfil = { role: string; cliente_slug: string | null; status: string | null } | null;
let perfil: Perfil = null;
let base = new FakeSupabase();

mock.module("server-only", { defaultExport: {} });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/i18n/servidor", {
  namedExports: {
    getIdioma: async () => "pt-BR",
    getT: async () => (k: string) => k,
  },
});
mock.module("@/lib/auth/profile", {
  namedExports: {
    getLoggedInUserProfile: async () => (perfil ? { profile: perfil, user: { id: "u1" } } : { profile: null, user: null }),
    isClientRole: (r: string) => r === "cliente_admin" || r === "cliente_operador",
  },
});
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });

const regras = await import("@/lib/analises/regras");
const { POST } = await import("@/app/api/analises/pedir/route");
const acoes = await import("@/app/admin/analises/actions");

const ADMIN: Perfil = { cliente_slug: null, role: "lexia_admin", status: "ativo" };
const CLIENTE: Perfil = { cliente_slug: "miranda_skin_experts", role: "cliente_admin", status: "ativo" };
const OPERADOR: Perfil = { cliente_slug: "detail_by_cordeiro", role: "cliente_operador", status: "ativo" };

function novaBase() {
  base = new FakeSupabase({
    lexia_analises_itens: [
      { analise_id: "a1", cliente_slug: "miranda_skin_experts", estado: "novo", id: "11111111-1111-4111-8111-111111111111", nota_admin: null },
    ],
    lexia_clientes: [{ slug: "miranda_skin_experts" }, { slug: "detail_by_cordeiro" }],
  });
}

const pedir = (corpo: unknown) =>
  POST(new Request("http://x/api/analises/pedir", { body: JSON.stringify(corpo), method: "POST" }));

const tocouNasAnalises = () => base.registos.filter((r) => r.tabela.startsWith("lexia_analises"));

let chamadasFetch: { init?: RequestInit; url: string }[] = [];
const fetchOriginal = globalThis.fetch;
function espiarFetch(status = 201) {
  chamadasFetch = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadasFetch.push({ init, url: String(url) });
    return new Response("{}", { status });
  }) as typeof fetch;
}
test.afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.ANALISE_GITHUB_TOKEN;
});

// ---------- rota de pedido ----------

test("a rota de pedido rejeita quem não é lexia_admin, sem tocar na base nem no GitHub", async () => {
  process.env.ANALISE_GITHUB_TOKEN = "ghp_segredo";
  for (const [p, status] of [[null, 401], [CLIENTE, 403], [OPERADOR, 403]] as const) {
    novaBase();
    espiarFetch();
    perfil = p;
    const r = await pedir({ periodo: "24h", tipo: "geral" });
    assert.equal(r.status, status, `perfil=${p?.role ?? "sem sessão"}`);
    assert.deepEqual(tocouNasAnalises(), [], "não pode ler nem gravar nas análises");
    assert.equal(base.linhasDe("lexia_analises").length, 0);
    assert.equal(chamadasFetch.length, 0, "não pode abrir issue");
  }
});

test("admin sem ANALISE_GITHUB_TOKEN: grava a linha 'pedida' e não chama o GitHub", async () => {
  novaBase();
  espiarFetch();
  perfil = ADMIN;
  const r = await pedir({ periodo: "3d", tipo: "geral" });
  assert.equal(r.status, 200);
  const corpo = (await r.json()) as { disparada: boolean; id: string; mensagem: string };
  assert.equal(corpo.disparada, false);
  assert.equal(corpo.mensagem, "Pedido registrado; roda na próxima análise.");
  const [linha] = base.linhasDe("lexia_analises");
  assert.equal(linha.id, corpo.id);
  assert.equal(linha.estado, "pedida");
  assert.equal(linha.tipo, "geral");
  assert.equal(linha.cliente_slug, null);
  assert.equal(
    new Date(linha.periodo_fim as string).getTime() - new Date(linha.periodo_inicio as string).getTime(),
    72 * 3_600_000,
  );
  assert.equal(chamadasFetch.length, 0);
});

test("admin com token: abre a issue no lexia-agentes e o token não volta ao navegador", async () => {
  novaBase();
  espiarFetch(201);
  perfil = ADMIN;
  process.env.ANALISE_GITHUB_TOKEN = "ghp_segredo_123";
  const r = await pedir({
    cliente: "detail_by_cordeiro",
    conversa: "whatsapp:5511999990000",
    pergunta: "Por que não ofereceu sábado?",
    periodo: "7d",
    tipo: "especifica",
  });
  const texto = await r.text();
  assert.equal(r.status, 200);
  assert.doesNotMatch(texto, /ghp_segredo_123/);
  const corpo = JSON.parse(texto) as { disparada: boolean; id: string };
  assert.equal(corpo.disparada, true);

  assert.equal(chamadasFetch.length, 1);
  const [chamada] = chamadasFetch;
  assert.equal(chamada.url, "https://api.github.com/repos/ArthurPimenta02/lexia-agentes/issues");
  assert.equal((chamada.init?.headers as Record<string, string>).Authorization, "Bearer ghp_segredo_123");
  const issue = JSON.parse(String(chamada.init?.body)) as { body: string; title: string };
  assert.equal(issue.title, `Análise pedida #${corpo.id}`);
  assert.doesNotMatch(issue.body, /ghp_/);
  const pedido = JSON.parse(issue.body) as Record<string, unknown>;
  assert.equal(pedido.id, corpo.id);
  assert.equal(pedido.cliente_slug, "detail_by_cordeiro");
  assert.equal(pedido.conversa, "whatsapp:5511999990000");
  assert.equal(pedido.pedido, "Por que não ofereceu sábado?");
  assert.equal(pedido.tipo, "especifica");
});

test("o GitHub a falhar não perde o pedido: fica gravado e corre na próxima análise", async () => {
  novaBase();
  espiarFetch(500);
  perfil = ADMIN;
  process.env.ANALISE_GITHUB_TOKEN = "ghp_x";
  const r = await pedir({ periodo: "24h", tipo: "geral" });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { disparada: boolean }).disparada, false);
  assert.equal(base.linhasDe("lexia_analises").length, 1);
});

test("cliente inventado, período fora da lista ou específica sem pergunta: 400 e nada gravado", async () => {
  perfil = ADMIN;
  for (const corpo of [
    { cliente: "cliente_inventado", pergunta: "x", periodo: "24h", tipo: "especifica" },
    { periodo: "30d", tipo: "geral" },
    { cliente: "detail_by_cordeiro", periodo: "24h", tipo: "especifica" },
    { periodo: "24h", tipo: "especifica", pergunta: "sem cliente" },
    { periodo: "24h", tipo: "diaria" },
  ]) {
    novaBase();
    const r = await pedir(corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.equal(base.linhasDe("lexia_analises").length, 0);
  }
});

// ---------- acções dos itens ----------

test("mudar estado e nota: só lexia_admin, e só valores conhecidos", async () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  for (const p of [null, CLIENTE, OPERADOR]) {
    novaBase();
    perfil = p;
    assert.equal((await acoes.mudarEstadoItem(ID, "corrigido")).ok, false);
    assert.equal((await acoes.guardarNotaItem(ID, "nota")).ok, false);
    assert.deepEqual(tocouNasAnalises(), [], `perfil=${p?.role ?? "sem sessão"} tocou na tabela`);
  }

  novaBase();
  perfil = ADMIN;
  assert.equal((await acoes.mudarEstadoItem(ID, "apagado")).ok, false);
  assert.equal((await acoes.mudarEstadoItem("1; drop table", "visto")).ok, false);
  assert.equal((await acoes.mudarEstadoItem(ID, "falso_alarme")).ok, true);
  assert.equal((await acoes.guardarNotaItem(ID, "  corrigido no PR #112  ")).ok, true);
  const [item] = base.linhasDe("lexia_analises_itens");
  assert.equal(item.estado, "falso_alarme");
  assert.equal(item.nota_admin, "corrigido no PR #112");
  assert.equal((await acoes.guardarNotaItem(ID, "   ")).ok, true);
  assert.equal(base.linhasDe("lexia_analises_itens")[0].nota_admin, null);
});

test("a página só abre para lexia_admin, antes de ler as análises", () => {
  const pagina = readFileSync("app/admin/analises/page.tsx", "utf8");
  assert.match(pagina, /profile\.role !== "lexia_admin"\) redirect\("\/app"\)/);
  assert.ok(pagina.indexOf('"lexia_admin"') < pagina.indexOf("<AnalisesVista"));
  // A vista não é uma rota: só a página a monta.
  assert.doesNotMatch(readFileSync("app/admin/analises/vista.tsx", "utf8"), /export default/);
});

test("o token só é lido no servidor (nenhum componente de navegador o vê)", () => {
  for (const f of ["app/admin/analises/novo-pedido.tsx", "app/admin/analises/item-acoes.tsx", "app/admin/analises/vista.tsx"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /ANALISE_GITHUB_TOKEN/, f);
  }
  assert.match(readFileSync("lib/analises/gatilho.ts", "utf8"), /^import "server-only";/);
});

// ---------- migração ----------

const sql = readFileSync("supabase/migrations/202611190018_analises_conversas.sql", "utf8");
const codigoSql = sql.replace(/--.*$/gm, "");

test("migração: RLS ligado e nada para anon/authenticated (um cliente comum não lê estas tabelas)", () => {
  for (const tabela of ["lexia_analises", "lexia_analises_itens"]) {
    assert.match(codigoSql, new RegExp(`alter table public\\.${tabela} enable row level security`));
    assert.match(codigoSql, new RegExp(`revoke all on public\\.${tabela} from anon, authenticated`));
  }
  assert.doesNotMatch(codigoSql, /grant[^;]*\bto\s+(anon|authenticated|public)\b/i);
  // Toda a policy é só para a rotina; nenhuma abre as tabelas a quem tem sessão no painel.
  const policies = [...codigoSql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
  assert.equal(policies.length, 6);
  for (const p of policies) assert.match(p, /\bto analise_leitura\b/, p);
});

test("migração: analise_leitura ganha select, insert e update só nestas duas tabelas", () => {
  const grants = [...codigoSql.matchAll(/grant\s+([^;]+?)\s+on\s+(\S+)\s+to\s+analise_leitura/gi)].map((m) => [m[1], m[2]]);
  assert.deepEqual(grants, [
    ["select, insert, update", "public.lexia_analises"],
    ["select, insert, update", "public.lexia_analises_itens"],
  ]);
  assert.doesNotMatch(codigoSql, /alter role/i, "as outras permissões dele não mudam");
  assert.doesNotMatch(codigoSql, /\bdelete\b[^;]*\bto analise_leitura/i);
});

test("migração: os valores de tipo, estado e gravidade batem com o código", () => {
  for (const lista of [regras.TIPOS_ANALISE, regras.ESTADOS_ANALISE, regras.GRAVIDADES, regras.ESTADOS_ITEM]) {
    const literal = lista.map((v) => `'${v}'`).join(", ");
    assert.ok(codigoSql.includes(`in (${literal})`), literal);
  }
  const rollback = readFileSync("supabase/rollbacks/202611190018_analises_conversas_down.sql", "utf8");
  assert.match(rollback, /drop table if exists public\.lexia_analises_itens;[\s\S]*drop table if exists public\.lexia_analises;/);
});

// ---------- regras puras ----------

test("validarPedido: período em horas e campos da específica", () => {
  const agora = new Date("2026-11-19T12:00:00Z");
  const g = regras.validarPedido({ cliente: " ", conversa: "x", periodo: "24h", tipo: "geral" }, agora);
  assert.ok(g.ok);
  if (g.ok) {
    assert.equal(g.linha.periodo_inicio, "2026-11-18T12:00:00.000Z");
    assert.equal(g.linha.cliente_slug, null);
    assert.equal(g.linha.conversa, null, "a geral não leva conversa");
  }
  const e = regras.validarPedido({ cliente: "detail_by_cordeiro", pergunta: "p".repeat(5000), periodo: "7d", tipo: "especifica" }, agora);
  assert.ok(e.ok);
  if (e.ok) {
    assert.equal(e.linha.pedido?.length, regras.LIMITE_PERGUNTA);
    assert.equal(e.linha.conversa, null);
  }
  assert.deepEqual(regras.validarPedido(null, agora), { erro: "tipo", ok: false });
  assert.deepEqual(regras.validarPedido({ periodo: "toString", tipo: "geral" }, agora), { erro: "periodo", ok: false });
});

test("contagens por cliente: só o que está por resolver conta como erro; mais graves primeiro", () => {
  const c = regras.contagensPorCliente([
    { cliente_slug: "b", estado: "novo", gravidade: "medio" },
    { cliente_slug: "a", estado: "visto", gravidade: "grave" },
    { cliente_slug: "a", estado: "novo", gravidade: "positivo" },
    { cliente_slug: "b", estado: "novo", gravidade: "inventada" },
    // O caso do Detail de 19/11: dois graves já corrigidos não podem aparecer como graves.
    { cliente_slug: "c", estado: "corrigido", gravidade: "grave" },
    { cliente_slug: "c", estado: "corrigido", gravidade: "grave" },
    { cliente_slug: "c", estado: "falso_alarme", gravidade: "medio" },
    { cliente_slug: "c", estado: "corrigido", gravidade: "positivo" },
  ]);
  assert.deepEqual(c, [
    { cliente_slug: "a", contagem: { corrigidos: 0, detalhe: 0, grave: 1, medio: 0, positivo: 1 } },
    { cliente_slug: "b", contagem: { corrigidos: 0, detalhe: 0, grave: 0, medio: 1, positivo: 0 } },
    { cliente_slug: "c", contagem: { corrigidos: 3, detalhe: 0, grave: 0, medio: 0, positivo: 1 } },
  ]);
  assert.equal(regras.totalPorResolver(c[2].contagem), 0);
});

test("contagem total: a análise real de 19/11 (8 corrigidos, 2 detalhes novos, 3 positivos) não tem graves", () => {
  const itens = [
    ...Array.from({ length: 6 }, (_, i) => ({ estado: "corrigido", gravidade: i < 2 ? "grave" : "medio" })),
    { estado: "corrigido", gravidade: "detalhe" },
    { estado: "falso_alarme", gravidade: "grave" },
    { estado: "novo", gravidade: "detalhe" },
    { estado: "visto", gravidade: "detalhe" },
    { estado: "novo", gravidade: "positivo" },
    { estado: "novo", gravidade: "positivo" },
    { estado: "visto", gravidade: "positivo" },
  ];
  const c = regras.contagemTotal(itens);
  assert.deepEqual(c, { corrigidos: 8, detalhe: 2, grave: 0, medio: 0, positivo: 3 });
  assert.equal(regras.totalPorResolver(c), 2);
});

test("separar itens: por resolver (grave → médio → detalhe), o que correu bem, e os já resolvidos no fim", () => {
  const it = (id: string, gravidade: string, estado: string, criado_em = "2026-11-19T05:00:00Z") => ({ criado_em, estado, gravidade, id });
  const g = regras.separarItens([
    it("d1", "detalhe", "novo"),
    it("p1", "positivo", "novo"),
    it("g-corr", "grave", "corrigido"),
    it("m1", "medio", "visto"),
    it("g2", "grave", "novo", "2026-11-19T06:00:00Z"),
    it("g1", "grave", "novo", "2026-11-19T04:00:00Z"),
    it("fa", "medio", "falso_alarme"),
  ]);
  assert.deepEqual(g.porResolver.map((i) => i.id), ["g1", "g2", "m1", "d1"]);
  assert.deepEqual(g.positivos.map((i) => i.id), ["p1"]);
  assert.deepEqual(g.resolvidos.map((i) => i.id), ["g-corr", "fa"]);
});

test("vistas: por resolver é o padrão; só corrigidos e todos mudam a tela", () => {
  assert.deepEqual([...regras.VISTAS], ["por_resolver", "corrigidos", "todos"]);
  assert.equal(regras.eVista("corrigidos"), true);
  assert.equal(regras.eVista("novo"), false, "os estados antigos do filtro caem em 'por resolver'");
  assert.equal(regras.ePorResolver("visto"), true);
  assert.equal(regras.eResolvido("falso_alarme"), true);
});

test("a vista não conta erros sem passar pelas regras (nada de contar itens crus)", () => {
  const vista = readFileSync("app/admin/analises/vista.tsx", "utf8");
  assert.doesNotMatch(vista, /\.filter\(\(i\) => i\.gravidade === "grave"/);
  assert.doesNotMatch(vista, /t\("Concluída"\)/, "o selo 'Concluída' saiu: confundia-se com o erro estar resolvido");
  assert.match(vista, /contagemTotal\(itensDoCliente\)/);
});

test("erros que se repetem: mesmo título em dias diferentes; positivos e falsos alarmes fora", () => {
  const item = (dia: string, titulo: string, extra: Partial<ItemResumo> = {}): ItemResumo => ({
    cliente_slug: "detail_by_cordeiro",
    criado_em: `${dia}T05:10:00Z`,
    estado: "novo",
    gravidade: "medio",
    titulo,
    ...extra,
  });
  const r = regras.errosQueSeRepetem([
    item("2026-11-17", "Preço errado do Full Detail", { estado: "corrigido" }),
    item("2026-11-18", "preço  errado do full detail!", { cliente_slug: "miranda_skin_experts", gravidade: "grave" }),
    item("2026-11-18", "Só uma vez"),
    item("2026-11-17", "Elogio", { gravidade: "positivo" }),
    item("2026-11-18", "Elogio", { gravidade: "positivo" }),
    item("2026-11-17", "Alarme", { estado: "falso_alarme" }),
    item("2026-11-18", "Alarme", { estado: "falso_alarme" }),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].texto, "Preço errado do Full Detail");
  assert.deepEqual(r[0].dias, ["2026-11-17", "2026-11-18"]);
  assert.deepEqual(r[0].clientes, ["detail_by_cordeiro", "miranda_skin_experts"]);
  assert.equal(r[0].gravidade, "grave");
  assert.equal(r[0].voltouDepoisDeCorrigido, true);

  // Duas vezes no MESMO dia (Brasília) não é repetir.
  assert.deepEqual(regras.errosQueSeRepetem([item("2026-11-18", "X erro"), { ...item("2026-11-18", "X erro"), criado_em: "2026-11-19T02:00:00Z" }]), []);
});

test("link da conversa só para conversas reais", () => {
  assert.equal(
    regras.linkDaConversa("detail_by_cordeiro", "whatsapp:5511"),
    "/admin/conversas?cliente=detail_by_cordeiro&conversa=whatsapp%3A5511",
  );
  assert.equal(regras.linkDaConversa("detail_by_cordeiro", "teste:abc"), null);
  assert.equal(regras.linkDaConversa("detail_by_cordeiro", null), null);
});
