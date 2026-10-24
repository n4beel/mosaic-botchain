"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { type Cell, idToXY, xyToId, colorToHex } from "@/lib/mosaic";
import { WIDTH, CELLS } from "@/lib/limits";
import Button from "@/components/ui/Button";

interface WallCanvasProps {
  wall: Cell[];
  loading: boolean;
  selectedId: number | null;
  onSelectCell: (id: number) => void;
  batchIds: number[];
  onToggleBatchCell: (id: number) => void;
  isBatchMode: boolean;
  showMyCells: boolean;
  userAddress?: string;
}

export default function WallCanvas({
  wall,
  loading,
  selectedId,
  onSelectCell,
  batchIds,
  onToggleBatchCell,
  isBatchMode,
  showMyCells,
  userAddress,
}: WallCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<boolean>(false);

  // Set of cells owned by user for fast lookup
  const userCellSet = useMemo(() => {
    const set = new Set<number>();
    if (!userAddress || !wall.length) return set;
    const lower = userAddress.toLowerCase();
    for (let i = 0; i < wall.length; i++) {
      if (wall[i]?.owner?.toLowerCase() === lower) {
        set.add(i);
      }
    }
    return set;
  }, [wall, userAddress]);

  const batchSet = useMemo(() => new Set(batchIds), [batchIds]);

  // Render canvas buffer (1024x1024 internal, 32px per cell for crispness)
  const drawWall = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    const cellSize = 32;

    // Draw all cells
    for (let id = 0; id < CELLS; id++) {
      const { x, y } = idToXY(id);
      const px = x * cellSize;
      const py = y * cellSize;

      const cell = wall[id];
      if (cell && cell.sales > 0) {
        ctx.fillStyle = colorToHex(cell.color);
      } else {
        // Unclaimed: subtle stone surface
        ctx.fillStyle = (x + y) % 2 === 0 ? "#F5F1E8" : "#EDE8DE";
      }
      ctx.fillRect(px, py, cellSize, cellSize);

      // Subtle grid line
      ctx.strokeStyle = "rgba(207, 200, 184, 0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);

      // Owner notch if "my cells" is active
      if (showMyCells && userCellSet.has(id)) {
        ctx.fillStyle = "#C2401F"; // vermilion notch
        ctx.fillRect(px + cellSize - 8, py, 8, 8);
      }

      // Batch selected cell overlay
      if (batchSet.has(id)) {
        ctx.fillStyle = "rgba(194, 64, 31, 0.35)";
        ctx.fillRect(px, py, cellSize, cellSize);
        ctx.strokeStyle = "#C2401F";
        ctx.lineWidth = 3;
        ctx.strokeRect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3);
      }
    }

    // Hover outline
    if (hoveredId !== null && hoveredId >= 0 && hoveredId < CELLS && !batchSet.has(hoveredId)) {
      const { x, y } = idToXY(hoveredId);
      const px = x * cellSize;
      const py = y * cellSize;
      ctx.strokeStyle = "#1F1D1A"; // ink
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
    }

    // Selected cell outline
    if (selectedId !== null && selectedId >= 0 && selectedId < CELLS) {
      const { x, y } = idToXY(selectedId);
      const px = x * cellSize;
      const py = y * cellSize;
      ctx.strokeStyle = "#C2401F"; // vermilion
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3);
    }
  }, [wall, hoveredId, selectedId, batchSet, showMyCells, userCellSet]);

  useEffect(() => {
    drawWall();
  }, [drawWall]);

  // Coordinate resolution from mouse / touch event
  const getCellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = WIDTH / rect.width;
    const scaleY = WIDTH / rect.height;

    const x = Math.floor(clientX * scaleX);
    const y = Math.floor(clientY * scaleY);

    if (x >= 0 && x < WIDTH && y >= 0 && y < WIDTH) {
      return xyToId(x, y);
    }
    return null;
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const id = getCellFromEvent(e);
    if (id === null) return;
    if (isBatchMode) {
      onToggleBatchCell(id);
    } else {
      onSelectCell(id);
    }
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const id = getCellFromEvent(e);
    setHoveredId(id);
  };

  const handlePointerLeave = () => {
    setHoveredId(null);
  };

  // Coordinate stepper helpers for mobile fine selection
  const selectedCoords = selectedId !== null ? idToXY(selectedId) : { x: 0, y: 0 };
  const stepX = (delta: number) => {
    const cur = selectedId !== null ? selectedCoords.x : 0;
    const nextX = Math.max(0, Math.min(WIDTH - 1, cur + delta));
    const nextY = selectedId !== null ? selectedCoords.y : 0;
    onSelectCell(xyToId(nextX, nextY));
  };
  const stepY = (delta: number) => {
    const curX = selectedId !== null ? selectedCoords.x : 0;
    const curY = selectedId !== null ? selectedCoords.y : 0;
    const nextY = Math.max(0, Math.min(WIDTH - 1, curY + delta));
    onSelectCell(xyToId(curX, nextY));
  };

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Mobile coordinate steppers & zoom tool */}
      <div className="flex md:hidden items-center justify-between w-full max-w-[min(calc(100vw-32px),540px)] px-1 text-xs font-mono">
        <div className="flex items-center gap-1">
          <span className="text-[var(--text-muted)]">x:</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => stepX(-1)}
            aria-label="Step X left"
            className="w-7 h-7 p-0"
          >
            ←
          </Button>
          <span className="w-5 text-center font-bold">{selectedCoords.x}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => stepX(1)}
            aria-label="Step X right"
            className="w-7 h-7 p-0"
          >
            →
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[var(--text-muted)]">y:</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => stepY(-1)}
            aria-label="Step Y up"
            className="w-7 h-7 p-0"
          >
            ↑
          </Button>
          <span className="w-5 text-center font-bold">{selectedCoords.y}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => stepY(1)}
            aria-label="Step Y down"
            className="w-7 h-7 p-0"
          >
            ↓
          </Button>
        </div>

        <Button
          variant={zoom ? "primary" : "ghost"}
          size="sm"
          onClick={() => setZoom(!zoom)}
          className="text-[11px] h-7 px-2"
        >
          {zoom ? "100%" : "zoom"}
        </Button>
      </div>

      {/* Canvas container */}
      <div
        className={`relative border border-[var(--border-ink)] bg-[var(--bg-base)] overflow-hidden transition-all ${
          loading ? "canvas-hatch cursor-wait" : "cursor-crosshair"
        }`}
        style={{
          width: "min(calc(100vw - 32px), calc(100dvh - 190px), 640px)",
          height: "min(calc(100vw - 32px), calc(100dvh - 190px), 640px)",
          maxWidth: "100%",
          maxHeight: "100%",
          aspectRatio: "1 / 1",
        }}
      >
        <canvas
          ref={canvasRef}
          width={1024}
          height={1024}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
          className={`w-full h-full pixel-canvas select-none ${
            zoom ? "scale-150 origin-center" : "scale-100"
          }`}
          style={{
            touchAction: "none",
          }}
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(245,241,232,0.7)] backdrop-blur-[1px]">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-2 font-mono text-xs flex items-center gap-2 shadow-sm">
              <span className="w-2.5 h-2.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              <span>fetching 1,024 cells…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
