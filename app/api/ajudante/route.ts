import { modeloDoAjudante, perguntar, VERSAO_PROMPT } from "@/lib/ajudante/motor";
import { contextoDaEmpresa } from "@/lib/movel/empresa-do-pedido";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Analista Lexia (o ajudante do dono), no painel e no app.
 *
 * POST { pergunta, sessao?, cliente?, tela? } → resposta em NDJSON (uma linha
 * JSON por evento): `{tipo:"sessao"}`, `{tipo:"ferramenta", rotulo}` enquanto
 * consulta, e no fim `{tipo:"resposta", texto, propostas}` ou `{tipo:"erro"}`.
 * GET ?sessao= → mensagens dessa conversa; GET sem sessão → as últimas conversas.
 *
 * A empresa vem da sessão (contextoDaEmpresa: a Lexia pode indicar a da página).
 * Desligado até `AJUDANTE_LIGADO=1`, e no máximo 40 perguntas por pessoa por hora.
 * As conversas ficam em lexia_ai_sessoes/lexia_ai_mensagens com contexto.tipo = "ajudante".
 */

const POR_HORA = 40;
const TIPO = "ajudante";

export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const c = await contextoDaEmpresa(corpo.cliente);
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  if (process.env.AJUDANTE_LIGADO !== "1") return Response.json({ erro: c.t("O Analista Lexia ainda não está ligado.") }, { status: 503 });

  const pergunta = typeof corpo.pergunta === "string" ? corpo.pergunta.trim().slice(0, 4000) : "";
  if (!pergunta) return Response.json({ erro: c.t("Escreva uma pergunta.") }, { status: 400 });
  const tela = typeof corpo.tela === "string" ? corpo.tela.slice(0, 80) : undefined;
  const base = createAdminClient();

  // Limite por hora (protege a conta da OpenAI).
  const umaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await base.from("lexia_ai_execucoes").select("id", { count: "exact", head: true }).eq("criado_por", c.userId).eq("versao_prompt", VERSAO_PROMPT).gte("criado_em", umaHora);
  if ((count ?? 0) >= POR_HORA) return Response.json({ erro: c.t("Muitas perguntas nesta hora. Tente daqui a pouco.") }, { status: 429 });

  // A conversa: a pedida (se for desta pessoa e desta empresa) ou uma nova.
  let sessao = typeof corpo.sessao === "string" ? corpo.sessao : "";
  if (sessao) {
    const { data } = await base.from("lexia_ai_sessoes").select("id").eq("id", sessao).eq("cliente_slug", c.clienteSlug).eq("criado_por", c.userId).maybeSingle();
    if (!data) sessao = "";
  }
  if (!sessao) {
    const { data, error } = await base.from("lexia_ai_sessoes").insert({ cliente_slug: c.clienteSlug, contexto: { tipo: TIPO }, criado_por: c.userId, titulo: pergunta.slice(0, 80) }).select("id").single();
    if (error || !data) return Response.json({ erro: c.t("Não foi possível começar a conversa.") }, { status: 500 });
    sessao = data.id as string;
  }

  const { data: anteriores } = await base.from("lexia_ai_mensagens").select("papel, conteudo").eq("sessao_id", sessao).order("criado_em", { ascending: false }).limit(12);
  const historico = ((anteriores ?? []) as { papel: "usuario" | "assistente"; conteudo: string }[]).reverse();
  await base.from("lexia_ai_mensagens").insert({ cliente_slug: c.clienteSlug, conteudo: pergunta, criado_por: c.userId, papel: "usuario", sessao_id: sessao });
  const { data: execucao } = await base.from("lexia_ai_execucoes").insert({ cliente_slug: c.clienteSlug, criado_por: c.userId, modelo: modeloDoAjudante(), pergunta, sessao_id: sessao, status: "iniciada", tipo: "chat", versao_prompt: VERSAO_PROMPT }).select("id").single();
  const inicio = Date.now();
  const escopo = { clienteNome: c.clienteNome, clienteSlug: c.clienteSlug, fuso: c.fuso, locale: c.locale };

  const fluxo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const cod = new TextEncoder();
      const linha = (o: unknown) => controlador.enqueue(cod.encode(`${JSON.stringify(o)}\n`));
      linha({ sessao, tipo: "sessao" });
      try {
        const r = await perguntar(escopo, historico, pergunta, (ev) => linha({ ...ev, rotulo: c.t(ev.rotulo) }), tela);
        await base.from("lexia_ai_mensagens").insert({ cliente_slug: c.clienteSlug, conteudo: r.texto, criado_por: c.userId, metadata: { ferramentas: r.ferramentas, modelo: modeloDoAjudante(), propostas: r.propostas, tipo: TIPO }, papel: "assistente", sessao_id: sessao });
        await base.from("lexia_ai_sessoes").update({ atualizado_em: new Date().toISOString() }).eq("id", sessao);
        if (execucao) await base.from("lexia_ai_execucoes").update({ concluido_em: new Date().toISOString(), duracao_ms: Date.now() - inicio, ferramentas: r.ferramentas, status: "concluida", tokens_entrada: r.tokens.entrada, tokens_saida: r.tokens.saida }).eq("id", execucao.id);
        linha({ propostas: r.propostas, texto: r.texto, tipo: "resposta" });
      } catch (e) {
        if (execucao) await base.from("lexia_ai_execucoes").update({ concluido_em: new Date().toISOString(), duracao_ms: Date.now() - inicio, erro: e instanceof Error ? e.message.slice(0, 300) : "erro", status: "erro" }).eq("id", execucao.id);
        linha({ erro: c.t("Não consegui responder agora. Tente de novo."), tipo: "erro" });
      } finally {
        controlador.close();
      }
    },
  });
  return new Response(fluxo, { headers: { "cache-control": "no-store", "content-type": "application/x-ndjson; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const c = await contextoDaEmpresa(url.searchParams.get("cliente"));
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  const base = createAdminClient();
  const sessao = url.searchParams.get("sessao");
  if (sessao) {
    const { data: s } = await base.from("lexia_ai_sessoes").select("id").eq("id", sessao).eq("cliente_slug", c.clienteSlug).eq("criado_por", c.userId).maybeSingle();
    if (!s) return Response.json({ erro: "Conversa não encontrada." }, { status: 404 });
    const { data } = await base.from("lexia_ai_mensagens").select("id, papel, conteudo, metadata, criado_em").eq("sessao_id", sessao).order("criado_em", { ascending: true }).limit(200);
    return Response.json({
      mensagens: (data ?? []).map((m) => ({ conteudo: m.conteudo, id: m.id, papel: m.papel, propostas: ((m.metadata as { propostas?: unknown[] } | null)?.propostas ?? []) })),
    });
  }
  const { data } = await base.from("lexia_ai_sessoes").select("id, titulo, atualizado_em").eq("cliente_slug", c.clienteSlug).eq("criado_por", c.userId).eq("contexto->>tipo", TIPO).order("atualizado_em", { ascending: false }).limit(20);
  return Response.json({ ligado: process.env.AJUDANTE_LIGADO === "1", sessoes: data ?? [] });
}
