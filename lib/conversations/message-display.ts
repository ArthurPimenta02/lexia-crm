export type ConversationMessageRecord = {
  id: string;
  cliente_slug: string;
  contacto_id: string | null;
  identificador_conversa: string;
  direccao: string | null;
  tipo: string | null;
  conteudo: string | null;
  origem: string | null;
  criado_em: string | null;
};

export type DisplayConversationMessage = ConversationMessageRecord & {
  content: string | null;
  displayId: string;
  displayType: string;
  mediaUrl: string | null;
  partCount: number;
  partIndex: number;
  sourceMessageId: string;
};

type MessagePart = Pick<
  DisplayConversationMessage,
  "content" | "displayType" | "mediaUrl"
>;

const structuredContextPattern =
  /<Contexto(Imagem|Video)>([\s\S]*?)<\/Contexto\1>/giu;
const blankLinePattern = /\r?\n[\t ]*\r?\n+/u;

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("pt-BR") ?? "";
}

function getTimestamp(value: string | null) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function getFirstHttpUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/https?:\/\/[^\s<>]+/iu);

  if (!match) {
    return null;
  }

  try {
    const url = new URL(match[0]);

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getDirectHttpUrl(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue || /\s/u.test(trimmedValue)) {
    return null;
  }

  return getFirstHttpUrl(trimmedValue);
}

function getStructuredMediaUrl(kind: string, block: string) {
  if (kind === "video") {
    const videoContent = block.match(
      /<URLVideo>([\s\S]*?)<\/URLVideo>/iu,
    )?.[1];

    return getFirstHttpUrl(videoContent);
  }

  const imageContent = block.match(
    /<MensagemUsuario>([\s\S]*?)<\/MensagemUsuario>/iu,
  )?.[1];

  return getFirstHttpUrl(imageContent);
}

function splitTextContent(content: string, shouldSplit: boolean) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return [];
  }

  if (!shouldSplit || !blankLinePattern.test(trimmedContent)) {
    return [trimmedContent];
  }

  return trimmedContent
    .split(blankLinePattern)
    .map((part) => part.trim())
    .filter(Boolean);
}

function createTextParts(content: string, shouldSplit: boolean): MessagePart[] {
  return splitTextContent(content, shouldSplit).map((part) => ({
    content: part,
    displayType: "texto",
    mediaUrl: null,
  }));
}

function getRegularMessageParts(
  message: ConversationMessageRecord,
  shouldSplitReceivedText: boolean,
): MessagePart[] {
  const displayType = normalizeMessageType(message.tipo);
  const content = message.conteudo?.trim() ?? "";

  if (displayType === "texto") {
    return createTextParts(content, shouldSplitReceivedText);
  }

  const mediaUrl = getDirectHttpUrl(content);

  return [
    {
      content: mediaUrl ? null : content || null,
      displayType,
      mediaUrl,
    },
  ];
}

function getStructuredMessageParts(
  message: ConversationMessageRecord,
  shouldSplitReceivedText: boolean,
) {
  const content = message.conteudo ?? "";
  const parts: MessagePart[] = [];
  const matches = [...content.matchAll(structuredContextPattern)];

  if (matches.length === 0) {
    return getRegularMessageParts(message, shouldSplitReceivedText);
  }

  let cursor = 0;

  for (const match of matches) {
    const matchIndex = match.index ?? cursor;
    const textBeforeContext = content.slice(cursor, matchIndex);

    parts.push(
      ...createTextParts(textBeforeContext, shouldSplitReceivedText),
    );

    const displayType = normalizeValue(match[1]) === "video" ? "video" : "imagem";

    parts.push({
      content: null,
      displayType,
      mediaUrl: getStructuredMediaUrl(displayType, match[0]),
    });

    cursor = matchIndex + match[0].length;
  }

  parts.push(...createTextParts(content.slice(cursor), shouldSplitReceivedText));

  return parts;
}

export function normalizeMessageType(value: string | null | undefined) {
  const normalizedValue = normalizeValue(value);

  if (["image", "imagem", "photo", "foto"].includes(normalizedValue)) {
    return "imagem";
  }

  if (["video", "vídeo"].includes(normalizedValue)) {
    return "video";
  }

  if (["audio", "áudio", "voice", "voz"].includes(normalizedValue)) {
    return "audio";
  }

  if (
    ["document", "documento", "file", "ficheiro", "arquivo"].includes(
      normalizedValue,
    )
  ) {
    return "documento";
  }

  return normalizedValue || "texto";
}

export function isSentConversationMessage(
  message: Pick<ConversationMessageRecord, "direccao">,
) {
  return ["enviada", "enviado", "sent", "outbound", "saida", "saída"].includes(
    normalizeValue(message.direccao),
  );
}

export function sortConversationMessages<T extends ConversationMessageRecord>(
  messages: T[],
) {
  return [...messages].sort((firstMessage, secondMessage) => {
    const timestampDifference =
      getTimestamp(firstMessage.criado_em) -
      getTimestamp(secondMessage.criado_em);

    if (timestampDifference !== 0) {
      return timestampDifference;
    }

    return firstMessage.id.localeCompare(secondMessage.id);
  });
}

export function expandConversationMessage(
  message: ConversationMessageRecord,
) {
  const shouldSplitReceivedText = !isSentConversationMessage(message);
  const parts = getStructuredMessageParts(
    message,
    shouldSplitReceivedText,
  );
  const safeParts =
    parts.length > 0
      ? parts
      : [
          {
            content: null,
            displayType: normalizeMessageType(message.tipo),
            mediaUrl: null,
          },
        ];

  return safeParts.map<DisplayConversationMessage>((part, partIndex) => ({
    ...message,
    ...part,
    displayId:
      safeParts.length === 1
        ? message.id
        : `${message.id}:parte:${partIndex + 1}`,
    partCount: safeParts.length,
    partIndex,
    sourceMessageId: message.id,
  }));
}

export function prepareConversationMessages(
  messages: ConversationMessageRecord[],
) {
  return sortConversationMessages(messages).flatMap(expandConversationMessage);
}

export function getConversationMessagePreview(
  message: DisplayConversationMessage | null | undefined,
) {
  if (!message) {
    return "Sem mensagens registadas.";
  }

  if (message.content) {
    return message.content;
  }

  if (message.displayType === "imagem") {
    return "Imagem";
  }

  if (message.displayType === "video") {
    return "Vídeo";
  }

  if (message.displayType === "audio") {
    return "Áudio";
  }

  if (message.displayType === "documento") {
    return "Documento";
  }

  return "Mensagem sem conteúdo registado.";
}

export function getConversationDayKey(
  date: string | null,
  timeZone: string,
) {
  if (!date) {
    return "sem-data";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "sem-data";
  }

  const dateParts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(parsedDate);
  const values = Object.fromEntries(
    dateParts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}
