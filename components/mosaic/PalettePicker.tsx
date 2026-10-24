"use client";

import { CURATED_PALETTE, colorToHex, hexToColor } from "@/lib/mosaic";

interface PalettePickerProps {
  currentColor: number;
  onChange: (color: number) => void;
  disabled?: boolean;
}

export default function PalettePicker({
  currentColor,
  onChange,
  disabled = false,
}: PalettePickerProps) {
  const currentHex = colorToHex(currentColor);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>palette</span>
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-primary)]">
          <span
            className="w-3.5 h-3.5 border border-[var(--border-subtle)] inline-block"
            style={{ backgroundColor: currentHex }}
          />
          <span>{currentHex}</span>
        </div>
      </div>

      {/* 24-Swatch Curated Grid */}
      <div className="grid grid-cols-8 gap-1.5 p-1 bg-[var(--bg-base)] border border-[var(--border-subtle)]">
        {CURATED_PALETTE.map((hex) => {
          const num = hexToColor(hex);
          const isSelected = num === currentColor;
          return (
            <button
              key={hex}
              type="button"
              disabled={disabled}
              onClick={() => onChange(num)}
              title={hex}
              className={`w-6 h-6 border transition-transform ${
                isSelected
                  ? "border-[var(--text-primary)] scale-110 z-10 shadow-sm ring-1 ring-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] hover:scale-105"
              } cursor-pointer disabled:cursor-not-allowed`}
              style={{ backgroundColor: hex }}
            />
          );
        })}
      </div>

      {/* Custom 24-bit Color Picker */}
      <div className="flex items-center justify-between pt-1">
        <label
          htmlFor="custom-color-input"
          className="text-[11px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)]"
        >
          custom 24-bit colour
        </label>
        <div className="flex items-center gap-2">
          <input
            id="custom-color-input"
            type="color"
            disabled={disabled}
            value={currentHex}
            onChange={(e) => onChange(hexToColor(e.target.value))}
            className="w-7 h-7 p-0 cursor-pointer border border-[var(--border-subtle)] bg-transparent rounded-none"
          />
        </div>
      </div>
    </div>
  );
}
