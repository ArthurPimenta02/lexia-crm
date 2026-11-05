import { randomUUID } from "node:crypto";

import { MIDIA_BUCKET } from "@/lib/conversations/message-display";
import { contextoDaEmpresa } from "@/lib/movel/empresa-do-pedido";
import { caminhoDoOriginal, TAMANHO_MAXIMO } from "@/lib/movel/midia";
import { isValidConversationId } from "@/lib/redis/agent-locks";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Autoriza o aparelho a subir UM ficheiro direto para o bucket privado (a
 * Vercel não aceita corpos grandes, e um vídeo passa disso). O caminho é
 * decidido aqui, dentro da pasta da empresa da sessão.
 */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // A empresa vem da sessão; só a Lexia pode indicar outra (a da página do painel).
  const c = await contextoDaEmpresa(corpo.cliente);
  if (!c) return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  const conversa = String(corpo.conversa ?? "");
  const mime = String(corpo.mime ?? "").toLowerCase();
  const tamanho = Number(corpo.tamanho ?? 0);

  if (!isValidConversationId(conversa) || !/^(image|audio|video|application)\/[a-z0-9.+-]+$/.test(mime.split(";")[0])) {
    return Response.json({ erro: c.t("Arquivo inválido.") }, { status: 400 });
  }
  if (!(tamanho > 0) || tamanho > TAMANHO_MAXIMO) {
    return Response.json({ erro: c.t("O arquivo passa de 25 MB.") }, { status: 400 });
  }

  const caminho = caminhoDoOriginal(c.clienteSlug, conversa, mime, randomUUID());
  const { data, error } = await createAdminClient().storage.from(MIDIA_BUCKET).createSignedUploadUrl(caminho);
  if (error || !data) return Response.json({ erro: c.t("Não foi possível preparar o envio do arquivo.") }, { status: 500 });
  return Response.json({ caminho, token: data.token });
}
