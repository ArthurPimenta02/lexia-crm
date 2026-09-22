const validChannels = ["whatsapp", "messenger", "instagram"];

export type ParsedFeedbackComentario = {
  categoria: string | null;
  conversa: string | null;
  messageId: string | null;
  origemDetalhada: string | null;
  observacao: string | null;
  isConversationFeedback: boolean;
};

function getLineValue(comentario: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = comentario.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, "m"));

  return match?.[1]?.trim() || null;
}

function getObservation(comentario: string) {
  const match = comentario.match(/^Observação:\s*([\s\S]*)$/m);

  return match?.[1]?.trim() || null;
}

export function parseFeedbackComentario(
  comentario: string | null | undefined,
): ParsedFeedbackComentario {
  if (!comentario) {
    return {
      categoria: null,
      conversa: null,
      messageId: null,
      origemDetalhada: null,
      observacao: null,
      isConversationFeedback: false,
    };
  }

  const categoria = getLineValue(comentario, "Categoria");
  const conversa = getLineValue(comentario, "Conversa");
  const messageId = getLineValue(comentario, "Mensagem ID");
  const origemDetalhada = getLineValue(comentario, "Origem");
  const observacao = getObservation(comentario);

  return {
    categoria,
    conversa,
    messageId,
    origemDetalhada,
    observacao,
    isConversationFeedback: Boolean(categoria || conversa || origemDetalhada),
  };
}

export function getConversationChannel(conversa: string | null) {
  const channel = conversa?.split(":")[0] ?? "";

  return validChannels.includes(channel) ? channel : "";
}

export function buildAppConversationHref(
  conversa: string,
  messageId: string | null,
) {
  const params = new URLSearchParams();
  const channel = getConversationChannel(conversa);

  if (channel) {
    params.set("canal", channel);
  }

  params.set("conversa", conversa);

  return `/app/conversas?${params.toString()}${getMessageHash(messageId)}`;
}

export function buildAdminConversationHref(
  clienteSlug: string,
  conversa: string,
  messageId: string | null,
) {
  const params = new URLSearchParams({ cliente: clienteSlug });
  const channel = getConversationChannel(conversa);

  if (channel) {
    params.set("canal", channel);
  }

  params.set("conversa", conversa);

  return `/admin/conversas?${params.toString()}${getMessageHash(messageId)}`;
}

export function isLikelyImageUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();

    return (
      ["http:", "https:"].includes(url.protocol) &&
      /\.(avif|gif|jpe?g|png|webp)$/.test(pathname)
    );
  } catch {
    return false;
  }
}

function getMessageHash(messageId: string | null) {
  return messageId ? `#mensagem-${encodeURIComponent(messageId)}` : "";
}
