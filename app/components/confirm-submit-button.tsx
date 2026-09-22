"use client";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className: string;
  confirmMessage: string;
  disabled?: boolean;
};

export function ConfirmSubmitButton({
  children,
  className,
  confirmMessage,
  disabled,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      className={className}
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      type="submit"
    >
      {children}
    </button>
  );
}
