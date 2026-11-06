import { ehContaDemo, mudarAssumidaDemo } from "@/lib/movel/demo";
import { contextoDaEmpresa } from "@/lib/movel/empresa-do-pedido";
import { createAdminClient } from "@/lib/supabase/admin";
import { tipoDaMidia } from "@/lib/movel/midia";
import { chamarPlataforma, ErroPlataforma } from "@/lib/movel/plataforma";
import { isValidConversationId } from "@/lib/redis/agent-locks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Envia uma mensagem do dono ao cliente pelo canal real do negócio.
 * A empresa vem SEMPRE da sessão (contextoMovel), nunca do pedido; a mídia só
 * pode vir de um caminho da própria empresa no bucket.
 */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // A empresa vem da sessão; só a Lexia pode indicar outra (a da página do painel).
  const c = await contextoDaEmpresa(corpo.cliente);
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  const conversa = String(corpo.conversa ?? "");
  const texto = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
  const midia = corpo.midia && typeof corpo.midia === "object" ? (corpo.midia as Record<string, unknown>) : null;

  if (!isValidConversationId(conversa)) return Response.json({ erro: c.t("Conversa inválida.") }, { status: 400 });
  if (!texto && !midia) return Response.json({ erro: c.t("Escreva uma mensagem.") }, { status: 400 });
  if (texto.length > 4096) return Response.json({ erro: c.t("A mensagem é longa demais.") }, { status: 400 });

  let midiaOk: { caminho: string; mime: string; tipo: string } | null = null;
  if (midia) {
    const caminho = String(midia.caminho ?? "");
    const mime = String(midia.mime ?? "");
    if (!caminho.startsWith(`${c.clienteSlug}/`) || caminho.includes("..") || !mime) {
      return Response.json({ erro: c.t("Arquivo inválido.") }, { status: 400 });
    }
    midiaOk = { caminho, mime, tipo: tipoDaMidia(mime) };
  }

  // Conta demo: não há canal; a mensagem só fica na conversa (mesmo formato do envio real).
  if (ehContaDemo(c.clienteSlug)) {
    const base = createAdminClient();
    const { data: contacto } = await base.from("lexia_contactos").select("id").eq("cliente_slug", c.clienteSlug).eq("identificador_conversa", conversa).is("fundido_em", null).limit(1).maybeSingle();
    const tipo = midiaOk ? midiaOk.tipo : "texto";
    const conteudo = midiaOk ? JSON.stringify({ midia: { caminho: midiaOk.caminho, tipo: midiaOk.tipo, mime: midiaOk.mime }, texto }) : texto;
    const { data, error } = await base.from("lexia_mensagens").insert({ cliente_slug: c.clienteSlug, contacto_id: contacto?.id ?? null, identificador_conversa: conversa, direccao: "enviada", tipo, conteudo, origem: "humano" }).select("id").single();
    if (error || !data) return Response.json({ erro: c.t("O envio falhou.") }, { status: 500 });
    await mudarAssumidaDemo(conversa, true);   // como no envio real: quem responde assume a conversa
    return Response.json({ ok: true, mensagem_id: data.id, tipo, conteudo, pausa_segundos: 0 });
  }

  try {
    const r = await chamarPlataforma<Record<string, unknown>>("/enviar", {
      autor_user_id: c.userId,
      cliente_slug: c.clienteSlug,
      conversa,
      ...(midiaOk ? { legenda: texto || undefined, midia: midiaOk } : { texto }),
    });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const status = e instanceof ErroPlataforma ? e.status : 500;
    return Response.json({ erro: e instanceof Error ? e.message : c.t("O envio falhou.") }, { status });
  }
}
