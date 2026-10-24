"use client";

import Button from "@/components/ui/Button";

export type ToolMode = "select" | "batch";

interface ToolStripProps {
  mode: ToolMode;
  onModeChange: (mode: ToolMode) => void;
  showMyCells: boolean;
  onToggleMyCells: () => void;
  onShare: () => void;
  onToggleAbout: () => void;
  batchCount: number;
}

export default function ToolStrip({
  mode,
  onModeChange,
  showMyCells,
  onToggleMyCells,
  onShare,
  onToggleAbout,
  batchCount,
}: ToolStripProps) {
  return (
    <div className="flex md:flex-col items-center gap-1.5 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[0_2px_10px_rgba(31,29,26,0.06)]">
      {/* Select Mode */}
      <Button
        variant={mode === "select" ? "primary" : "ghost"}
        size="icon"
        title="Select single cell"
        onClick={() => onModeChange("select")}
        aria-label="Select mode"
        className="relative"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m3 3 7 18 3-7 7-3L3 3z" />
        </svg>
      </Button>

      {/* Batch Mode */}
      <Button
        variant={mode === "batch" ? "primary" : "ghost"}
        size="icon"
        title="Batch claim mode (up to 16 cells)"
        onClick={() => onModeChange("batch")}
        aria-label="Batch mode"
        className="relative"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        {batchCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-[var(--text-primary)] text-[var(--bg-base)] text-[9px] font-mono w-4 h-4 rounded-full flex items-center justify-center">
            {batchCount}
          </span>
        )}
      </Button>

      {/* Toggle My Cells Highlight */}
      <Button
        variant={showMyCells ? "primary" : "ghost"}
        size="icon"
        title={showMyCells ? "Hide my cell markers" : "Highlight my cells"}
        onClick={onToggleMyCells}
        aria-label="Toggle my cells"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </Button>

      <div className="hidden md:block w-full h-px bg-[var(--border-subtle)] my-1" />
      <div className="md:hidden h-full w-px bg-[var(--border-subtle)] mx-1" />

      {/* Share Link */}
      <Button
        variant="ghost"
        size="icon"
        title="Copy shareable coordinate link"
        onClick={onShare}
        aria-label="Share link"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </Button>

      {/* About Limits */}
      <Button
        variant="ghost"
        size="icon"
        title="About Mosaic limits"
        onClick={onToggleAbout}
        aria-label="About"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </Button>
    </div>
  );
}
