"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "ghost" | "danger" | "tool" | "discrete";
export type ButtonSize = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90 active:scale-[0.99] border border-transparent font-medium",
  ghost:
    "bg-transparent text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--text-muted)] bg-[var(--bg-surface)] active:scale-[0.99]",
  danger:
    "bg-transparent text-[var(--accent)] border border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] active:scale-[0.99]",
  tool:
    "bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-base)] active:bg-[var(--border-subtle)] border border-transparent hover:border-[var(--border-subtle)]",
  discrete:
    "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] border-none underline-offset-4 hover:underline",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs tracking-normal h-8",
  md: "px-4 py-2 text-sm tracking-tight h-10",
  icon: "w-9 h-9 p-0 flex items-center justify-center text-sm",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className = "",
      children,
      ...nativeProps
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2 cursor-pointer font-sans select-none transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(" ")}
        {...nativeProps}
      >
        {loading ? (
          <>
            <span
              className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
