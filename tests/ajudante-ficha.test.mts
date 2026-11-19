/**
 * Analista Lexia — ficha técnica do agente ("como_funciona_o_agente").
 * Cada empresa só vê a SUA ficha (o slug vem do escopo da sessão), uma empresa
 * sem ficha recebe uma mensagem clara, e os interruptores vêm de lexia_clientes.
 * Sem IA e sem rede: o Supabase é o falso dos testes.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

const base = new FakeSupabase({
  lexia_clientes: [
    { followups_longos: true, lista_espera: false, modo_teste: false, slug: "miranda_skin_experts", status: "ativo" },
    { followups_longos: true, lista_espera: false, modo_teste: false, slug: "detail_by_cordeiro", status: "ativo" },
    { followups_longos: false, lista_espera: true, modo_teste: true, slug: "claudia_leite_spa", status: "ativo" },
    { followups_longos: false, lista_espera: false, modo_teste: true, slug: "jessica_beauty", status: "inativo" },
  ],
});
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => base } });

const { fichaDoAgente, SLUGS_COM_FICHA } = await import("@/lib/ajudante/fichas");
const { fichaAgente } = await import("@/lib/ajudante/ferramentas/ficha-agente");

const ferramenta = fichaAgente.como_funciona_o_agente;
// O formato do registo de ferramentas (ferramentas.ts): executar(escopo, args). O modelo pode mandar args à vontade.
type Executar = (e: { clienteNome: string; clienteSlug: string; fuso: string; locale: string }, a: Record<string, unknown>) => Promise<{ dados: unknown }>;
const executar: Executar = ferramenta.executar;
const escopo = (clienteSlug: string, clienteNome = clienteSlug) => ({ clienteNome, clienteSlug, fuso: "Europe/Lisbon", locale: "pt-PT" });
type Dados = { ficha?: string; erro?: string; interruptores?: { interruptor: string; estado: string; nota?: string }[]; modo_teste?: string; conta?: string };
const correr = async (slug: string, args: Record<string, unknown> = {}) => (await executar(escopo(slug), args)).dados as Dados;

// Uma frase que só existe na ficha de cada cliente.
const MARCA: Record<string, RegExp> = {
  asteric: /Pix gerado/,
  claudia_leite_spa: /Carla/,
  detail_by_cordeiro: /Martim/,
  jessica_beauty: /Ainda sem agente configurado/,
  miranda_skin_experts: /Carol/,
};

test("ficha: cada cliente tem um .md e só os slugs da lista têm ficha", () => {
  const md = readdirSync(new URL("../lib/ajudante/fichas/", import.meta.url)).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort();
  assert.deepEqual(md, [...SLUGS_COM_FICHA].sort());
  for (const slug of SLUGS_COM_FICHA) assert.match(fichaDoAgente(slug) ?? "", MARCA[slug], slug);
  for (const slug of ["", "outra_empresa", "../lexia-memoria/x", "detail_by_cordeiro.md", "DETAIL_BY_CORDEIRO", "cliente_teste"]) assert.equal(fichaDoAgente(slug), null, slug);
});

test("ficha: cada uma tem no máximo ~1.500 tokens e nenhuma fala em ficheiros ou variáveis", () => {
  for (const slug of SLUGS_COM_FICHA) {
    const t = fichaDoAgente(slug)!;
    assert.ok(Math.ceil(t.length / 3.3) <= 1500, `${slug}: ${t.length} caracteres`);
    assert.doesNotMatch(t, /\.(ts|json|sql)\b|lexia_clientes|followups_longos|lista_espera\b|LISTA_ESPERA|RAIZ_|_/, slug);
  }
});

test("ficha: as regras que o analista mais precisa estão escritas (lembretes, pausas, follow-up)", () => {
  const mir = fichaDoAgente("miranda_skin_experts")!;
  assert.match(mir, /entre 24 h e 2 h antes/);
  assert.match(mir, /confirma sozinha/);
  assert.match(mir, /silêncio para sempre/);
  assert.match(mir, /remarca e cancela sozinha/);
  assert.match(mir, /Lista de espera\n- Ligada/);
  const det = fichaDoAgente("detail_by_cordeiro")!;
  assert.match(det, /48 h antes/);
  assert.match(det, /Lembrete do sinal/);
  assert.match(det, /Nunca marca sozinho/);
  assert.match(det, /Lista de espera\n- Ligada/);
  const cla = fichaDoAgente("claudia_leite_spa")!;
  assert.match(cla, /48 h antes/);
  assert.match(cla, /12 h antes/);
  assert.match(cla, /Nunca marca sozinha/);
  assert.match(fichaDoAgente("asteric")!, /NÃO tem[\s\S]*Lembretes de horário/);
});

test("ferramenta: cada empresa só recebe a SUA ficha, mesmo que o modelo peça outra", async () => {
  for (const slug of ["miranda_skin_experts", "detail_by_cordeiro", "claudia_leite_spa"]) {
    const d = await correr(slug, { cliente: "asteric", slug: "asteric" });
    assert.equal(d.ficha, fichaDoAgente(slug));
    for (const outro of SLUGS_COM_FICHA.filter((s) => s !== slug)) assert.notEqual(d.ficha, fichaDoAgente(outro));
    assert.doesNotMatch(d.ficha ?? "", slug === "miranda_skin_experts" ? /Martim|Carla/ : slug === "detail_by_cordeiro" ? /Carol|Carla/ : /Carol|Martim/);
  }
});

test("ferramenta: empresa sem ficha recebe uma mensagem clara e nenhuma ficha", async () => {
  const d = (await executar(escopo("empresa_nova", "Empresa Nova"), {})).dados as Dados;
  assert.equal(d.ficha, undefined);
  assert.match(d.erro ?? "", /Ainda não há ficha técnica do agente de Empresa Nova/);
  assert.match(d.erro ?? "", /não invente/);
});

test("ferramenta: interruptores lidos de lexia_clientes, só os que o agente usa", async () => {
  const mir = await correr("miranda_skin_experts");
  assert.deepEqual(mir.interruptores?.map((i) => i.estado), ["ligado", "ligado"]);
  assert.match(mir.interruptores?.[1].nota ?? "", /servidor/);
  assert.equal(mir.modo_teste, undefined);

  const cla = await correr("claudia_leite_spa");
  assert.deepEqual(cla.interruptores?.map((i) => i.estado), ["desligado", "ligado"]);
  assert.match(cla.modo_teste ?? "", /modo de teste/);

  // A lista de espera da Miranda e do Detail NÃO segue a coluna do painel (que está false): está ligada no servidor.
  const det = await correr("detail_by_cordeiro");
  assert.equal(det.interruptores?.[0].estado, "ligado");
  assert.equal(det.interruptores?.[1].estado, "ligado");
  assert.match(det.interruptores?.[1].nota ?? "", /servidor/);

  const jes = await correr("jessica_beauty");
  assert.deepEqual(jes.interruptores, []);
  assert.match(jes.conta ?? "", /inativo/);
  assert.match(jes.ficha ?? "", /Ainda sem agente configurado/);
});

test("ferramenta: o CRM falhou → a ficha sai na mesma e os interruptores dizem que não se leram", async () => {
  base.falharEm("select", "lexia_clientes", "fora do ar");
  const d = await correr("claudia_leite_spa");
  assert.equal(d.ficha, fichaDoAgente("claudia_leite_spa"));
  assert.deepEqual(d.interruptores?.map((i) => i.estado), ["não foi possível ler agora", "não foi possível ler agora"]);
});

test("ferramenta: definição no formato das outras (descrição, parâmetros vazios, rótulo)", () => {
  assert.deepEqual(ferramenta.parametros, { additionalProperties: false, properties: {}, required: [], type: "object" });
  assert.ok(ferramenta.descricao.length > 50);
  assert.equal(typeof ferramenta.rotulo, "string");
  // Leitura: o ficheiro da ferramenta não escreve em lado nenhum.
  const fonte = readFileSync(new URL("../lib/ajudante/ferramentas/ficha-agente.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /\.(insert|update|upsert|delete|rpc)\(/);
});
