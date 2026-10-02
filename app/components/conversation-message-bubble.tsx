import type { ReactNode } from "react";

import { ConversationMessageMedia } from "@/app/components/conversation-message-media";
import { formatDateInTimezone } from "@/app/components/conversation-timezone";
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
      <span className="rounded-md bg-white/95 px-2.5 py-1 text-[10px] font-medium text-zinc-600 shadow-sm ring-1 ring-black/5 backdrop-blur">
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

  return (
    <div
      className={`scroll-mt-16 flex w-full ${isSent ? "justify-end" : "justify-start"}`}
      id={anchorId}
    >
      <div
        className={`relative max-w-[91%] rounded-lg px-3 py-1.5 text-[14px] leading-[1.35] text-[#111b21] shadow-[0_1px_1px_rgba(11,20,26,0.13)] sm:max-w-[82%] xl:max-w-[76%] ${
          isSent
            ? "rounded-tr-sm bg-[#d9fdd3]"
            : "rounded-tl-sm bg-white"
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
          <p className="text-zinc-500">{fallbackContent}</p>
        ) : null}

        <div className="mt-1 flex min-h-4 items-end justify-between gap-3 text-[10px] leading-none text-[#667781]">
          {feedback ? <div className="min-w-0">{feedback}</div> : <span />}
          <span>
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
