"use client";

import { FormSubmitButton } from "@/app/components/form-submit-button";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className: string;
  confirmMessage: string;
  disabled?: boolean;
  pendingLabel?: string;
};

export function ConfirmSubmitButton({
  children,
  className,
  confirmMessage,
  disabled,
  pendingLabel,
}: ConfirmSubmitButtonProps) {
  return (
    <FormSubmitButton
      className={className}
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      pendingLabel={pendingLabel}
    >
      {children}
    </FormSubmitButton>
  );
}
