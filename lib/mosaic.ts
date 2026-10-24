import type { Address } from "viem";
import { WIDTH, CELLS, BASE_PRICE_DEFAULT, STEP_DEFAULT } from "./limits";
import { mosaicAbi } from "./botchain/abi";

export type Cell = {
  id: number;
  owner: Address;
  color: number; // 0xRRGGBB
  sales: number;
};

export const CURATED_PALETTE: string[] = [
  "#1F1D1A", // ink
  "#5F5A50", // stone dark
  "#A8A295", // stone mid
  "#CFC8B8", // stone light
  "#F5F1E8", // surface
  "#FFFFFF", // white
  "#C2401F", // vermilion
  "#E0603A", // orange
  "#E88C38", // amber
  "#D4A857", // gold
  "#4F8A65", // leaf green
  "#2C6B4F", // deep green
  "#3B7A8C", // slate blue
  "#2D5A88", // ocean
  "#5B8DEF", // electric blue
  "#7B61FF", // iris
  "#A77BF3", // lavender
  "#D9658B", // rose
  "#8C2D45", // crimson
  "#5A3825", // umber
  "#8C6239", // terracotta
  "#2E4057", // navy
  "#048A81", // teal
  "#545E56", // slate
];

export function idToXY(id: number): { x: number; y: number } {
  if (id < 0 || id >= CELLS) {
    throw new Error(`Cell id out of bounds: ${id}`);
  }
  return {
    x: id % WIDTH,
    y: Math.floor(id / WIDTH),
  };
}

export function xyToId(x: number, y: number): number {
  if (x < 0 || x >= WIDTH || y < 0 || y >= WIDTH) {
    throw new Error(`Coordinates out of bounds: (${x}, ${y})`);
  }
  return y * WIDTH + x;
}

export function hexToColor(hex: string): number {
  const clean = hex.replace(/^#/, "").trim();
  const num = parseInt(clean, 16);
  if (isNaN(num)) return 0;
  return num & 0xffffff;
}

export function colorToHex(color: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, color || 0));
  return "#" + clamped.toString(16).padStart(6, "0").toUpperCase();
}

export function priceFor(
  sales: number,
  base: bigint = BASE_PRICE_DEFAULT,
  step: bigint = STEP_DEFAULT
): bigint {
  return base + BigInt(sales) * step;
}

export function batchTotal(
  cells: { id: number; sales: number; owner?: string }[],
  base: bigint = BASE_PRICE_DEFAULT,
  step: bigint = STEP_DEFAULT,
  caller?: string
): bigint {
  const seen = new Set<number>();
  let sum = 0n;

  for (const cell of cells) {
    if (seen.has(cell.id)) continue;
    seen.add(cell.id);

    if (caller && cell.owner && cell.owner.toLowerCase() === caller.toLowerCase()) {
      continue;
    }

    sum += priceFor(cell.sales, base, step);
  }

  return sum;
}

export async function fetchWall(
  client: {
    readContract: (args: {
      address: Address;
      abi: typeof mosaicAbi;
      functionName: "wall";
      args: readonly [number, number];
    }) => Promise<readonly [readonly Address[], readonly number[], readonly number[]]>;
  },
  contractAddress: Address
): Promise<Cell[]> {
  const pagePromises = [
    client.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "wall",
      args: [0, 256],
    }),
    client.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "wall",
      args: [256, 256],
    }),
    client.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "wall",
      args: [512, 256],
    }),
    client.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "wall",
      args: [768, 256],
    }),
  ];

  const pages = await Promise.all(pagePromises);
  const cells: Cell[] = new Array(CELLS);

  for (let p = 0; p < 4; p++) {
    const [owners, colors, sales] = pages[p];
    const offset = p * 256;
    for (let i = 0; i < 256; i++) {
      const id = offset + i;
      cells[id] = {
        id,
        owner: owners[i],
        color: Number(colors[i]),
        sales: Number(sales[i]),
      };
    }
  }

  return cells;
}

export function applyLog(
  wall: Cell[],
  log: {
    eventName?: string;
    args?: {
      id?: number | bigint;
      buyer?: Address;
      seller?: Address;
      owner?: Address;
      color?: number | bigint;
      sales?: number | bigint;
    };
  }
): void {
  if (!log.args || log.args.id === undefined) return;
  const id = Number(log.args.id);
  if (id < 0 || id >= wall.length) return;

  if (log.eventName === "CellClaimed" || (log.args.buyer && log.args.sales !== undefined)) {
    wall[id] = {
      ...wall[id],
      id,
      owner: log.args.buyer!,
      color: Number(log.args.color ?? 0),
      sales: Number(log.args.sales ?? 0),
    };
  } else if (log.eventName === "CellPainted" || log.args.owner) {
    wall[id] = {
      ...wall[id],
      id,
      owner: log.args.owner ?? wall[id].owner,
      color: Number(log.args.color ?? wall[id].color),
    };
  }
}
