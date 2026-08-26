"use client";

type ConfirmSubmitButtonProps = {
  label: string;
  confirmMessage: string;
  className?: string;
};

export default function ConfirmSubmitButton({
  label,
  confirmMessage,
  className,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        const ok = window.confirm(confirmMessage);
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
