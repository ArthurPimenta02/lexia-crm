import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  MIDIA_BUCKET,
  type DisplayConversationMessage,
} from "./message-display";

/**
 * URLs assinadas para a mídia guardada (Fase 20).
 *
 * O bucket `lexia-midia` é privado e sem policies: só a service_role lê. As
 * páginas de conversa chamam isto no servidor, depois de já terem filtrado as
 * mensagens pelo cliente que a pessoa pode ver, e cada URL vale 1 hora.
 *
 * A única barreira entre um cliente e a mídia de outro, além do filtro da
 * página, é esta: só se assina um caminho se a mensagem for do `clienteSlug`
 * pedido E o caminho começar por `<clienteSlug>/`. Uma mensagem de outro
 * cliente, ou um caminho que aponte para outra pasta, fica sem URL e aparece
 * como "indisponível".
 *
 * Se o bucket não existir ou a assinatura falhar, nada rebenta: as mídias
 * aparecem como indisponíveis e o texto continua lá.
 */

export const VALIDADE_URL_SEGUNDOS = 60 * 60;

export type AssinarCaminhos = (
  caminhos: string[],
) => Promise<Map<string, string>>;

const assinarNoStorage: AssinarCaminhos = async (caminhos) => {
  const { data, error } = await createAdminClient()
    .storage.from(MIDIA_BUCKET)
    .createSignedUrls(caminhos, VALIDADE_URL_SEGUNDOS);

  const urls = new Map<string, string>();
  if (error || !data) {
    return urls;
  }

  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) {
      urls.set(item.path, item.signedUrl);
    }
  }

  return urls;
};

export function caminhoPertenceAoCliente(
  caminho: string,
  clienteSlug: string,
) {
  return Boolean(clienteSlug) && caminho.startsWith(`${clienteSlug}/`);
}

export async function assinarMidias(
  messages: DisplayConversationMessage[],
  clienteSlug: string,
  assinar: AssinarCaminhos = assinarNoStorage,
): Promise<DisplayConversationMessage[]> {
  const caminhos = [
    ...new Set(
      messages
        .filter(
          (message) =>
            message.mediaPath &&
            message.cliente_slug === clienteSlug &&
            caminhoPertenceAoCliente(message.mediaPath, clienteSlug),
        )
        .map((message) => message.mediaPath as string),
    ),
  ];

  if (caminhos.length === 0) {
    return messages;
  }

  let urls = new Map<string, string>();
  try {
    urls = await assinar(caminhos);
  } catch {
    // Bucket inexistente, rede, etc.: mídia indisponível, página de pé.
  }

  return messages.map((message) =>
    message.mediaPath && caminhos.includes(message.mediaPath)
      ? { ...message, mediaUrl: urls.get(message.mediaPath) ?? null }
      : message,
  );
}
