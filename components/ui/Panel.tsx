import { type HTMLAttributes, forwardRef } from "react";

export type PanelKind = "card" | "strip" | "hud" | "sheet" | "plain";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  kind?: PanelKind;
  bordered?: boolean;
}

const kindClassMap: Record<PanelKind, string> = {
  card: "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-[0_4px_20px_rgba(31,29,26,0.06)] p-4",
  strip: "bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col items-center gap-1 p-1.5 shadow-[0_2px_12px_rgba(31,29,26,0.04)]",
  hud: "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-3 py-1.5 shadow-sm text-xs",
  sheet: "bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] p-4 shadow-[0_-4px_24px_rgba(31,29,26,0.08)]",
  plain: "bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5",
};

const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ kind = "card", bordered = true, className = "", children, style, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          "transition-all duration-150",
          kindClassMap[kind],
          bordered ? "" : "border-none",
          className,
        ].join(" ")}
        style={style}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

Panel.displayName = "Panel";

export default Panel;
