import { describe, expect, it, vi } from "vitest";
import {
  idToXY,
  xyToId,
  hexToColor,
  colorToHex,
  priceFor,
  batchTotal,
  fetchWall,
  applyLog,
  CURATED_PALETTE,
  type Cell,
} from "../mosaic";
import { WIDTH, CELLS, BASE_PRICE_DEFAULT, STEP_DEFAULT } from "../limits";

describe("mosaic coordinate transformations", () => {
  it("has 1024 unique bijective (x, y) coordinates for ids 0..1023", () => {
    for (let id = 0; id < CELLS; id++) {
      const { x, y } = idToXY(id);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(WIDTH);
      expect(xyToId(x, y)).toBe(id);
    }
  });

  it("throws when id is out of bounds", () => {
    expect(() => idToXY(-1)).toThrow("out of bounds");
    expect(() => idToXY(1024)).toThrow("out of bounds");
    expect(() => idToXY(9999)).toThrow("out of bounds");
  });

  it("throws when coordinates are out of bounds", () => {
    expect(() => xyToId(-1, 0)).toThrow("out of bounds");
    expect(() => xyToId(0, 32)).toThrow("out of bounds");
    expect(() => xyToId(32, 0)).toThrow("out of bounds");
  });

  it("converts corner coordinates accurately", () => {
    expect(idToXY(0)).toEqual({ x: 0, y: 0 });
    expect(idToXY(31)).toEqual({ x: 31, y: 0 });
    expect(idToXY(32)).toEqual({ x: 0, y: 1 });
    expect(idToXY(1023)).toEqual({ x: 31, y: 31 });
  });
});

describe("mosaic color conversions", () => {
  it("converts hex strings to 24-bit numbers", () => {
    expect(hexToColor("#C2401F")).toBe(0xc2401f);
    expect(hexToColor("C2401F")).toBe(0xc2401f);
    expect(hexToColor("#000000")).toBe(0);
    expect(hexToColor("#FFFFFF")).toBe(0xffffff);
  });

  it("converts 24-bit numbers to uppercase hex strings", () => {
    expect(colorToHex(0xc2401f)).toBe("#C2401F");
    expect(colorToHex(0)).toBe("#000000");
    expect(colorToHex(0xffffff)).toBe("#FFFFFF");
    expect(colorToHex(0x1a)).toBe("#00001A");
  });

  it("contains 24 curated palette colours", () => {
    expect(CURATED_PALETTE.length).toBe(24);
    for (const hex of CURATED_PALETTE) {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("price calculation vectors", () => {
  it("computes exact linear prices matching the contract formula for sales 0..6", () => {
    const base = BASE_PRICE_DEFAULT; // 0.002 ether = 2000000000000000n
    const step = STEP_DEFAULT;       // 0.002 ether = 2000000000000000n

    expect(priceFor(0, base, step)).toBe(2_000_000_000_000_000n);
    expect(priceFor(1, base, step)).toBe(4_000_000_000_000_000n);
    expect(priceFor(2, base, step)).toBe(6_000_000_000_000_000n);
    expect(priceFor(3, base, step)).toBe(8_000_000_000_000_000n);
    expect(priceFor(4, base, step)).toBe(10_000_000_000_000_000n);
    expect(priceFor(5, base, step)).toBe(12_000_000_000_000_000n);
    expect(priceFor(6, base, step)).toBe(14_000_000_000_000_000n);
  });
});

describe("batch total calculation", () => {
  it("sums prices sequentially and deduplicates ids", () => {
    const base = 2_000_000_000_000_000n;
    const step = 2_000_000_000_000_000n;

    const cells = [
      { id: 1, sales: 0 }, // 0.002
      { id: 2, sales: 1 }, // 0.004
      { id: 1, sales: 0 }, // duplicate - skipped
      { id: 3, sales: 2 }, // 0.006
    ];

    expect(batchTotal(cells, base, step)).toBe(12_000_000_000_000_000n);
  });

  it("skips cells already owned by the caller", () => {
    const caller = "0x1111111111111111111111111111111111111111";
    const cells = [
      { id: 1, sales: 0, owner: caller },
      { id: 2, sales: 0, owner: "0x2222222222222222222222222222222222222222" },
    ];

    expect(batchTotal(cells, 2000n, 2000n, caller)).toBe(2000n);
  });
});

describe("applyLog", () => {
  it("applies CellClaimed event updates in place", () => {
    const wall: Cell[] = [
      { id: 0, owner: "0x0000000000000000000000000000000000000000", color: 0, sales: 0 },
      { id: 1, owner: "0x0000000000000000000000000000000000000000", color: 0, sales: 0 },
    ];

    applyLog(wall, {
      eventName: "CellClaimed",
      args: {
        id: 1,
        buyer: "0x1111111111111111111111111111111111111111",
        seller: "0x0000000000000000000000000000000000000000",
        color: 0xff0000,
        sales: 1,
      },
    });

    expect(wall[1].owner).toBe("0x1111111111111111111111111111111111111111");
    expect(wall[1].color).toBe(0xff0000);
    expect(wall[1].sales).toBe(1);
    expect(wall[0].sales).toBe(0);
  });

  it("applies CellPainted event updates in place", () => {
    const wall: Cell[] = [
      { id: 0, owner: "0x1111111111111111111111111111111111111111", color: 0xff0000, sales: 1 },
    ];

    applyLog(wall, {
      eventName: "CellPainted",
      args: {
        id: 0,
        owner: "0x1111111111111111111111111111111111111111",
        color: 0x00ff00,
      },
    });

    expect(wall[0].color).toBe(0x00ff00);
    expect(wall[0].sales).toBe(1); // sales unchanged
  });
});

describe("fetchWall", () => {
  it("fetches four pages of 256 cells and combines them into 1024 cells", async () => {
    const dummyClient = {
      readContract: vi.fn(async ({ args }: { args: readonly [number, number] }) => {
        const [start, count] = args;
        const owners = new Array(count).fill("0x0000000000000000000000000000000000000000");
        const colors = new Array(count).fill(0);
        const sales = new Array(count).fill(0);

        if (start === 0) {
          owners[0] = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
          colors[0] = 0x123456;
          sales[0] = 1;
        }

        return [owners, colors, sales] as const;
      }),
    };

    const wall = await fetchWall(
      dummyClient as any,
      "0x1234567890123456789012345678901234567890"
    );

    expect(dummyClient.readContract).toHaveBeenCalledTimes(4);
    expect(wall.length).toBe(1024);
    expect(wall[0].owner).toBe("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(wall[0].color).toBe(0x123456);
    expect(wall[0].sales).toBe(1);
    expect(wall[1023].id).toBe(1023);
  });
});
