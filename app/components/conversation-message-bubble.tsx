import type { ReactNode } from "react";

import { ConversationMessageMedia } from "@/app/components/conversation-message-media";
import { formatDateInTimezone } from "@/lib/clientes/timezone";
import {
  getConversationMessagePreview,
  isSentConversationMessage,
  type DisplayConversationMessage,
} from "@/lib/conversations/message-display";

type ConversationMessageBubbleProps = {
  feedback?: ReactNode;
  message: DisplayConversationMessage;
  timeZone: string;
};

const mediaTypes = new Set(["imagem", "video", "audio", "documento"]);

export function ConversationDaySeparator({ label }: { label: string }) {
  return (
    <div className="sticky top-1 z-10 flex justify-center py-0.5">
      <span className="rounded-lg bg-surface/95 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur">
        {label}
      </span>
    </div>
  );
}

export function ConversationMessageBubble({
  feedback,
  message,
  timeZone,
}: ConversationMessageBubbleProps) {
  const isSent = isSentConversationMessage(message);
  const isMedia = mediaTypes.has(message.displayType);
  const fallbackContent = getConversationMessagePreview(message);
  const anchorId =
    message.partIndex === 0
      ? `mensagem-${message.sourceMessageId}`
      : `mensagem-${message.displayId.replaceAll(":", "-")}`;

  /*
   * O balão era o verde do WhatsApp escrito à mão (`#d9fdd3`, `#111b21`,
   * `#667781`). Duas razões para sair: numa lista em que quase tudo é nosso,
   * metade do ecrã ficava verde e as palavras deixavam de ser a primeira
   * coisa que se vê; e uma cor fixa não é white-label nenhum — quando um
   * cliente tiver a marca dele, o balão do agente passa a ter a cor dele,
   * porque agora lê `--primary`.
   *
   * Quem falou continua a distinguir-se por duas coisas ao mesmo tempo: o
   * lado e o preenchimento. Nós ficamos cheios, o cliente fica em branco
   * com contorno.
   */
  return (
    <div
      className={`scroll-mt-16 flex w-full ${isSent ? "justify-end" : "justify-start"}`}
      id={anchorId}
    >
      <div
        className={`relative max-w-[91%] rounded-lg px-3 py-1.5 text-[14px] leading-[1.35] shadow-[0_1px_1px_rgba(16,19,26,0.08)] sm:max-w-[82%] xl:max-w-[76%] ${
          isSent
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm border border-border bg-surface text-foreground"
        }`}
      >
        {isMedia ? (
          <ConversationMessageMedia
            mediaType={message.displayType}
            src={message.mediaUrl}
          />
        ) : null}

        {message.content ? (
          <p
            className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
              isMedia ? "mt-2" : ""
            }`}
          >
            {message.content}
          </p>
        ) : !isMedia ? (
          <p className={isSent ? "opacity-70" : "text-muted-foreground"}>
            {fallbackContent}
          </p>
        ) : null}

        {/*
          A hora é esbatida no próprio elemento, e não no contentor: o
          contentor também embrulha o "Reportar", que já se esbate sozinho,
          e as duas opacidades multiplicadas deixavam-no quase invisível
          sobre o balão escuro.
        */}
        <div className="mt-1 flex min-h-4 items-end justify-between gap-3 text-[10px] leading-none">
          {feedback ? <div className="min-w-0">{feedback}</div> : <span />}
          <span
            className={
              isSent ? "text-primary-foreground/60" : "text-muted-foreground"
            }
          >
            {formatDateInTimezone(message.criado_em, timeZone, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
