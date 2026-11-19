/**
 * Consulta livre do Analista (lib/ajudante/ferramentas/consulta.ts): a empresa
 * vem SEMPRE do escopo do servidor, nunca dos argumentos do modelo; o SQL vai
 * à função da base, que faz as travas (testadas à parte num Postgres em
 * memória). A base é simulada: nenhuma chamada real.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} });

type Chamada = { fn: string; args: Record<string, unknown> };
const chamadas: Chamada[] = [];
let resposta: { data: unknown; error: { message: string } | null } = { data: null, error: null };
mock.module("@/lib/supabase/admin", {
  namedExports: {
    createAdminClient: () => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        chamadas.push({ args, fn });
        return resposta;
      },
    }),
  },
});

const { consultaLivre, limparSql, caber, MAX_CARACTERES } = await import("@/lib/ajudante/ferramentas/consulta");
const { VISTAS, ESQUEMA_CONSULTA } = await import("@/lib/ajudante/ferramentas/consulta-esquema");

const ferramenta = consultaLivre.consulta_livre;
const escopo = { clienteNome: "Empresa A", clienteSlug: "empresa_a", fuso: "Europe/Lisbon", locale: "pt-PT" };
const correr = (args: Record<string, unknown>, e = escopo) => ferramenta.executar(e, args);

test("a empresa vem do escopo, nunca dos argumentos do modelo", async () => {
  chamadas.length = 0;
  resposta = { data: { linhas: [{ n: 3 }], mostradas: 1, total: 1, truncado: false }, error: null };
  const r = await correr({ cliente: "empresa_b", clienteSlug: "empresa_b", p_cliente: "empresa_b", sql: "  select count(*) n from analista.mensagens ;  " });
  assert.deepEqual(chamadas, [{ args: { p_cliente: "empresa_a", p_sql: "select count(*) n from analista.mensagens" }, fn: "analista_consultar" }]);
  assert.deepEqual(r.dados, { linhas: [{ n: 3 }], mostradas: 1, total: 1, truncado: false });
  chamadas.length = 0;
  await correr({ sql: "select 1" }, { ...escopo, clienteSlug: "empresa_b" });
  assert.equal(chamadas[0].args.p_cliente, "empresa_b");
});

test("entrada vazia, de outro tipo ou longa demais não chega à base", async () => {
  chamadas.length = 0;
  for (const sql of [undefined, "", "   ", ";", 42, { sql: "select 1" }, ["select 1"]]) {
    const r = await correr({ sql });
    assert.match(String((r.dados as { erro?: string }).erro), /SELECT/);
  }
  const longa = await correr({ sql: `select '${"x".repeat(8001)}'` });
  assert.match(String((longa.dados as { erro?: string }).erro), /longa/);
  assert.equal(chamadas.length, 0);
  assert.equal(limparSql("select 1;"), "select 1");
  assert.equal(limparSql("select 1; delete from x"), "select 1; delete from x", "só o ';' final sai; o resto a base recusa");
});

test("recusa e erro da base voltam ao modelo para ele corrigir; falha de rede vira erro da ferramenta", async () => {
  resposta = { data: { erro: "palavra não permitida: delete" }, error: null };
  assert.deepEqual((await correr({ sql: "with x as (delete from y) select 1" })).dados, { erro: "palavra não permitida: delete" });
  resposta = { data: null, error: { message: "canceling statement due to statement timeout" } };
  assert.match(String(((await correr({ sql: "select 1" })).dados as { erro: string }).erro), /demorou/);
  resposta = { data: null, error: { message: "fetch failed" } };
  await assert.rejects(correr({ sql: "select 1" }), /consulta_livre/);
});

test("resultado grande é encurtado sem partir o JSON", async () => {
  const linhas = Array.from({ length: 200 }, (_, i) => ({ conteudo: "a".repeat(1000), i }));
  resposta = { data: { linhas, mostradas: 200, total: 900, truncado: true }, error: null };
  const d = (await correr({ sql: "select conteudo from analista.mensagens" })).dados as { linhas: unknown[]; total: number; truncado: boolean; aviso: string; mostradas: number };
  assert.ok(JSON.stringify(d).length <= MAX_CARACTERES);
  assert.ok(d.linhas.length > 10 && d.linhas.length < 200);
  assert.equal(d.mostradas, d.linhas.length);
  assert.equal(d.total, 900);
  assert.equal(d.truncado, true);
  assert.match(d.aviso, /Agregue/);
  const enorme = caber({ linhas: [{ t: "x".repeat(MAX_CARACTERES * 2) }], total: 1 });
  assert.deepEqual(enorme.linhas, []);
  const pequeno = caber({ linhas: [{ a: 1 }], mostradas: 1, total: 1, truncado: false });
  assert.deepEqual(pequeno, { linhas: [{ a: 1 }], mostradas: 1, total: 1, truncado: false });
});

test("formato igual às outras ferramentas (descricao, executar, parametros, rotulo)", () => {
  assert.equal(typeof ferramenta.descricao, "string");
  assert.equal(typeof ferramenta.executar, "function");
  assert.equal(typeof ferramenta.rotulo, "string");
  assert.deepEqual(ferramenta.parametros.required, ["sql"]);
  assert.equal(ferramenta.parametros.additionalProperties, false);
  assert.deepEqual(Object.keys(ferramenta.parametros.properties), ["sql"], "o modelo não escolhe a empresa");
});

/** As vistas e colunas da migração, lidas do SQL (alias quando há `as`). */
function vistasDaMigracao() {
  const sql = readFileSync(new URL("../supabase/migrations/202611190021_analista_consulta_livre.sql", import.meta.url), "utf8");
  const vistas: Record<string, string[]> = {};
  for (const m of sql.matchAll(/create or replace view analista\.(\w+)[^\n]*\n\s*select ([\s\S]*?)\nfrom /g)) {
    vistas[m[1]] = m[2].split(",").map((c) => c.trim().split(/\s+/).pop() as string);
  }
  return vistas;
}

test("o esquema que o modelo vê é exactamente o da migração (vistas e colunas)", () => {
  const migracao = vistasDaMigracao();
  assert.ok(Object.keys(migracao).length >= 10);
  assert.deepEqual(Object.keys(VISTAS).sort(), Object.keys(migracao).sort());
  for (const [nome, colunas] of Object.entries(migracao)) {
    assert.deepEqual(VISTAS[nome].colunas, colunas, nome);
    assert.ok(ferramenta.descricao.includes(`analista.${nome}(`), nome);
    assert.ok(ESQUEMA_CONSULTA.includes(`analista.${nome}(`), nome);
  }
});

test("nenhuma vista expõe colunas sensíveis", () => {
  const proibidas = /^(cliente_slug|segredos|campos|token|user_id|criado_por|atualizado_por|actualizado_por|fundido_por|origem_manual_por|event_id|calendario_id|link_google|ia|passos|ferramentas|tokens|custo_usd|custo_sem_preco|raw_\w+|run_id|erro|corpo|webhook_url)$/;
  for (const [nome, colunas] of Object.entries(vistasDaMigracao())) {
    for (const c of colunas) assert.doesNotMatch(c, proibidas, `${nome}.${c}`);
  }
  const sql = readFileSync(new URL("../supabase/migrations/202611190021_analista_consulta_livre.sql", import.meta.url), "utf8");
  for (const t of ["lexia_conexoes", "lexia_usuarios_clientes", "lexia_app_aparelhos", "lexia_ai_", "lexia_execucoes", "lexia_testes_", "lexia_webhooks_meta", "lexia_workflows", "lexia_onboarding"]) {
    assert.ok(!new RegExp(`from public\\.${t}`).test(sql), t);
  }
});
