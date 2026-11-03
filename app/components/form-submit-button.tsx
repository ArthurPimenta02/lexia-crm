"use client";

import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useIdioma } from "@/app/components/idioma";

type FormSubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & {
  children: ReactNode;
  pendingLabel?: string;
};

export function FormSubmitButton({
  children,
  className,
  disabled,
  pendingLabel,
  ...props
}: FormSubmitButtonProps) {
  const { t } = useIdioma();
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      {...props}
      aria-busy={pending || undefined}
      className={className}
      disabled={isDisabled}
      type="submit"
    >
      <span className="inline-flex items-center justify-center gap-2">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : null}
        {pending ? (pendingLabel ?? t("Aguarde...")) : children}
      </span>
    </button>
  );
}
