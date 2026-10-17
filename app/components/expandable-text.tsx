"use client";

import { useState } from "react";

type ExpandableTextProps = {
  text: string | null | undefined;
  emptyText: string;
  maxLength?: number;
};

export function ExpandableText({
  text,
  emptyText,
  maxLength = 180,
}: ExpandableTextProps) {
  const [isOpen, setIsOpen] = useState(false);
  const value = text?.trim() || emptyText;
  const shouldTruncate = value.length > maxLength;
  const visibleText =
    shouldTruncate ? `${value.slice(0, maxLength).trim()}...` : value;

  return (
    <>
      <span className="whitespace-pre-wrap break-words">{visibleText}</span>
      {shouldTruncate ? (
        <button
          className="mt-1 block text-xs font-semibold text-foreground underline-offset-2 hover:underline"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          Ver mais
        </button>
      ) : null}

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                Texto completo
              </h2>
              <button
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Fechar
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                {value}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
