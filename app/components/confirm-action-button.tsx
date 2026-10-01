"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type ActionResult = {
  ok: boolean;
  error?: string;
};

type ConfirmActionButtonProps = {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  className: string;
  confirmMessage: string;
  pendingLabel?: string;
  successHref?: string;
};

export function ConfirmActionButton({
  action,
  children,
  className,
  confirmMessage,
  pendingLabel = "Aguarde...",
  successHref,
}: ConfirmActionButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => {
        if (!window.confirm(confirmMessage)) {
          return;
        }

        startTransition(async () => {
          try {
            const result = await action();

            if (!result.ok) {
              window.alert(result.error ?? "Não foi possível executar a ação.");
              return;
            }

            if (successHref) {
              router.push(successHref);
            }

            router.refresh();
          } catch {
            window.alert("Não foi possível executar a ação. Tente novamente.");
          }
        });
      }}
      type="button"
    >
      <span className="inline-flex items-center justify-center gap-2">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : null}
        {pending ? pendingLabel : children}
      </span>
    </button>
  );
}
