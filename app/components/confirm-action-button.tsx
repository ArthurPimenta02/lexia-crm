"use client";

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
  successHref?: string;
};

export function ConfirmActionButton({
  action,
  children,
  className,
  confirmMessage,
  successHref,
}: ConfirmActionButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className={className}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmMessage)) {
          return;
        }

        startTransition(async () => {
          const result = await action();

          if (!result.ok) {
            window.alert(result.error ?? "Não foi possível executar a ação.");
            return;
          }

          if (successHref) {
            router.push(successHref);
          }

          router.refresh();
        });
      }}
      type="button"
    >
      {pending ? "Aguarde..." : children}
    </button>
  );
}
