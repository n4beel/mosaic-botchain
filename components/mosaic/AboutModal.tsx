"use client";

import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(31,29,26,0.4)] backdrop-blur-xs">
      <Panel kind="plain" className="w-full max-w-[440px] flex flex-col gap-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
          <h2 className="font-semibold text-base tracking-tight">About Mosaic</h2>
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 text-xs leading-relaxed text-[var(--text-primary)]">
          <p className="font-medium text-[var(--accent)]">
            Colour only — no text, no images. Anyone can take a cell at its price. Prices only go up.
          </p>

          <p className="text-[var(--text-muted)]">
            A shared 32 × 32 wall of 1,024 cells. Each cell has a deterministic price ladder starting
            at 0.002 BOT that increases by 0.002 BOT every time it changes hands.
          </p>

          <div className="bg-[var(--bg-base)] p-3 border border-[var(--border-subtle)] flex flex-col gap-1.5">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              What it cannot do
            </span>
            <ul className="list-disc list-inside space-y-1 text-[var(--text-muted)]">
              <li>No text, images, or links — only 24-bit colour codes</li>
              <li>Ownership is not permanence — anyone can take any cell at its posted price</li>
              <li>No free returns or refunds — sales proceeds are sent directly to the seller</li>
              <li>The wall is strictly finite: exactly 1,024 cells</li>
            </ul>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={onClose} className="w-full mt-1">
          Close
        </Button>
      </Panel>
    </div>
  );
}
