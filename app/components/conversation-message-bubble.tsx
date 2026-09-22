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
    <div className="sticky top-2 z-10 flex justify-center py-1">
      <span className="rounded-md bg-white/95 px-3 py-1.5 text-[11px] font-medium text-zinc-600 shadow-sm ring-1 ring-black/5 backdrop-blur">
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
        className={`relative max-w-[86%] rounded-lg px-3 py-2 text-[14px] leading-5 text-[#111b21] shadow-[0_1px_1px_rgba(11,20,26,0.13)] sm:max-w-[76%] ${
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

        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] leading-none text-[#667781]">
          <span>
            {formatDateInTimezone(message.criado_em, timeZone, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {feedback}
      </div>
    </div>
  );
}
