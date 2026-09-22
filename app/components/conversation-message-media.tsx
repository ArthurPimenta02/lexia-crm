"use client";

import { useState } from "react";

type ConversationMessageMediaProps = {
  mediaType: string;
  src: string | null;
};

const unavailableLabels: Record<string, string> = {
  audio: "Áudio indisponível",
  documento: "Documento indisponível",
  imagem: "Imagem indisponível",
  video: "Vídeo indisponível",
};

export function ConversationMessageMedia({
  mediaType,
  src,
}: ConversationMessageMediaProps) {
  const [hasError, setHasError] = useState(false);
  const unavailableLabel =
    unavailableLabels[mediaType] ?? "Conteúdo indisponível";

  if (!src || hasError) {
    return (
      <div className="flex min-h-20 min-w-44 items-center justify-center rounded-md bg-black/5 px-5 py-4 text-center text-sm text-zinc-500">
        {unavailableLabel}
      </div>
    );
  }

  if (mediaType === "imagem") {
    return (
      // Provider media URLs are temporary and cannot use Next image optimization.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt="Imagem da conversa"
        className="max-h-[420px] w-auto max-w-full rounded-md object-contain"
        loading="lazy"
        onError={() => setHasError(true)}
        src={src}
      />
    );
  }

  if (mediaType === "video") {
    return (
      <video
        className="max-h-[420px] w-full min-w-56 max-w-xl rounded-md bg-black"
        controls
        onError={() => setHasError(true)}
        playsInline
        preload="metadata"
        src={src}
      />
    );
  }

  if (mediaType === "audio") {
    return (
      <audio
        className="h-12 w-full min-w-64 max-w-md"
        controls
        onError={() => setHasError(true)}
        preload="metadata"
        src={src}
      />
    );
  }

  return (
    <a
      className="flex min-h-16 min-w-52 items-center rounded-md bg-black/5 px-4 py-3 text-sm font-medium text-zinc-800 underline decoration-zinc-400 underline-offset-4 transition hover:bg-black/10"
      href={src}
      rel="noreferrer"
      target="_blank"
    >
      Abrir documento
    </a>
  );
}
