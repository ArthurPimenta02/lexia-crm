import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { decifrar } from "@/lib/conexoes/cifra";
import {
  BASES_DA_ROTINA,
  eBase,
  filtroDaTabela,
  horasPedidas,
  PAGINA,
  semColunasEscondidas,
  TABELAS_CRM,
  tokenValido,
  validarRelatorio,
  type BaseDaRotina,
} from "@/lib/analises/rotina";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A porta HTTPS da rotina de análise na nuvem (24/11/2026). Ver lib/analises/rotina.ts.
 *
 * Só com `Authorization: Bearer <ANALISE_ROTINA_TOKEN>`.
 *
 * GET                                   → { bases: { <base>: [{ tabela, colunas }] } }
 * GET ?base=&tabela=&horas=&offset=     → { total, filtro, linhas, proximo }
 *     (só leitura; tabelas pequenas inteiras, grandes desde há <horas>, em páginas de 500)
 * POST  corpo = relatorio.json          → grava em lexia_analises / lexia_analises_itens e mais nada
 */

type Base = { cliente: SupabaseClient; url: string; chave: string };

function negado() {
  return Response.json({ erro: "não autorizado" }, { status: 401 });
}

function autorizado(request: Request) {
  return tokenValido(request.headers.get("authorization"), process.env.ANALISE_ROTINA_TOKEN);
}

async function abrirBase(base: BaseDaRotina): Promise<Base | null> {
  const slug = BASES_DA_ROTINA[base];
  if (slug === null) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) return null;
    return { chave, cliente: createAdminClient(), url };
  }
  const { data } = await createAdminClient()
    .from("lexia_conexoes")
    .select("campos, segredos")
    .eq("cliente_slug", slug)
    .eq("tipo", "supabase_cliente")
    .maybeSingle();
  const linha = data as { campos: Record<string, string> | null; segredos: string | null } | null;
  if (!linha?.segredos) return null;
  const segredos = decifrar(linha.segredos);
  const url = (linha.campos?.url || segredos.url || "").replace(/\/+$/, "");
  const chave = segredos.service_role_key;
  if (!url || !chave) return null;
  const cliente = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });
  return { chave, cliente, url };
}

/** As tabelas da base e as suas colunas, pelo esquema que o próprio Supabase publica. */
async function tabelasDe(base: BaseDaRotina, b: Base) {
  const r = await fetch(`${b.url}/rest/v1/`, {
    headers: { apikey: b.chave, Authorization: `Bearer ${b.chave}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`esquema ${r.status}`);
  const esquema = (await r.json()) as { definitions?: Record<string, { properties?: Record<string, unknown> }> };
  const todas = Object.entries(esquema.definitions ?? {}).map(([tabela, d]) => ({
    colunas: Object.keys(d.properties ?? {}),
    tabela,
  }));
  const lista = base === "crm" ? todas.filter((t) => (TABELAS_CRM as readonly string[]).includes(t.tabela)) : todas;
  return lista.sort((a, b2) => a.tabela.localeCompare(b2.tabela));
}

export async function GET(request: Request) {
  if (!autorizado(request)) return negado();
  const p = new URL(request.url).searchParams;
  const base = p.get("base");
  const tabela = p.get("tabela");

  try {
    if (!base) {
      const bases: Record<string, unknown> = {};
      for (const nome of Object.keys(BASES_DA_ROTINA) as BaseDaRotina[]) {
        try {
          const b = await abrirBase(nome);
          bases[nome] = b ? await tabelasDe(nome, b) : "sem conexão supabase_cliente";
        } catch (e) {
          bases[nome] = `erro: ${e instanceof Error ? e.message.slice(0, 200) : "erro"}`;
        }
      }
      return Response.json({ bases });
    }

    if (!eBase(base)) return Response.json({ erro: "base desconhecida" }, { status: 400 });
    const b = await abrirBase(base);
    if (!b) return Response.json({ erro: "base sem conexão" }, { status: 404 });
    const tabelas = await tabelasDe(base, b);
    const t = tabelas.find((x) => x.tabela === tabela);
    if (!t) return Response.json({ erro: "tabela não permitida" }, { status: 400 });

    const horas = horasPedidas(p.get("horas"));
    const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
    const offset = Math.max(0, Number(p.get("offset") ?? 0) || 0);

    const { count, error: erroConta } = await b.cliente.from(t.tabela).select("*", { count: "exact", head: true });
    if (erroConta) throw new Error(erroConta.message);
    const total = count ?? 0;
    const filtro = filtroDaTabela(total, t.colunas, desde);
    if (filtro.tipo === "nao_lida") return Response.json({ filtro, linhas: [], proximo: null, total });

    let q = b.cliente.from(t.tabela).select("*");
    if (filtro.tipo === "desde") q = q.gte(filtro.coluna, filtro.desde).order(filtro.coluna);
    const { data, error } = await q.range(offset, offset + PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as Record<string, unknown>[];
    return Response.json({
      filtro,
      linhas: base === "crm" ? semColunasEscondidas(linhas) : linhas,
      proximo: linhas.length === PAGINA ? offset + PAGINA : null,
      total,
    });
  } catch (e) {
    console.error("[analises/rotina] leitura", base, tabela, e instanceof Error ? e.message : e);
    return Response.json({ erro: e instanceof Error ? e.message.slice(0, 300) : "erro" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!autorizado(request)) return negado();
  const v = validarRelatorio(await request.json().catch(() => null));
  if (!v.ok) return Response.json({ erro: v.erro }, { status: 400 });
  const r = v.relatorio;
  const admin = createAdminClient();

  let id = r.analise_id;
  if (id) {
    const { data: atual, error } = await admin
      .from("lexia_analises")
      .select("id, periodo_inicio, periodo_fim")
      .eq("id", id)
      .maybeSingle();
    if (error) return Response.json({ erro: error.message }, { status: 500 });
    if (!atual) return Response.json({ erro: "análise não encontrada" }, { status: 404 });
    const a = atual as { periodo_fim: string | null; periodo_inicio: string | null };
    const { error: e2 } = await admin
      .from("lexia_analises")
      .update({
        concluida_em: new Date().toISOString(),
        custo_estimado: r.custo_estimado,
        erro: r.erro,
        estado: r.erro && r.itens.length === 0 ? "falhou" : "concluida",
        periodo_fim: a.periodo_fim ?? r.periodo_fim,
        periodo_inicio: a.periodo_inicio ?? r.periodo_inicio,
        resumo: r.resumo,
      })
      .eq("id", id);
    if (e2) return Response.json({ erro: e2.message }, { status: 500 });
  } else {
    const { data, error } = await admin
      .from("lexia_analises")
      .insert({
        concluida_em: new Date().toISOString(),
        custo_estimado: r.custo_estimado,
        erro: r.erro,
        estado: r.erro && r.itens.length === 0 ? "falhou" : "concluida",
        periodo_fim: r.periodo_fim,
        periodo_inicio: r.periodo_inicio,
        resumo: r.resumo,
        tipo: r.tipo,
      })
      .select("id")
      .single();
    if (error) return Response.json({ erro: error.message }, { status: 500 });
    id = (data as { id: string }).id;
  }

  if (r.itens.length) {
    const { error } = await admin.from("lexia_analises_itens").insert(r.itens.map((it) => ({ ...it, analise_id: id })));
    if (error) return Response.json({ analise_id: id, erro: `itens: ${error.message}` }, { status: 500 });
  }
  return Response.json({ analise_id: id, itens: r.itens.length, ok: true });
}
