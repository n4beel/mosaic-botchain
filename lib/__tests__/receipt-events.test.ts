import { describe, expect, it } from "vitest";
import { encodeEventTopics, encodeAbiParameters, parseEventLogs, type Log } from "viem";
import { mosaicAbi } from "../botchain/abi";
import { applyLog, type Cell } from "../mosaic";
import { CELLS } from "../limits";

function createEmptyWall(): Cell[] {
  return Array.from({ length: CELLS }, (_, id) => ({
    id,
    owner: "0x0000000000000000000000000000000000000000",
    color: 0,
    sales: 0,
  }));
}

function makeCellClaimedLog(args: {
  id: number;
  buyer: `0x${string}`;
  seller: `0x${string}`;
  color: number;
  price: bigint;
  sales: number;
}): Log {
  const topics = encodeEventTopics({
    abi: mosaicAbi,
    eventName: "CellClaimed",
    args: {
      id: args.id,
      buyer: args.buyer,
      seller: args.seller,
    },
  });

  const data = encodeAbiParameters(
    [{ type: "uint24" }, { type: "uint256" }, { type: "uint32" }],
    [args.color, args.price, args.sales]
  );

  return {
    address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    topics,
    data,
    blockNumber: 12345n,
    transactionHash: "0xabc",
  } as unknown as Log;
}

function makeCellPaintedLog(args: {
  id: number;
  owner: `0x${string}`;
  color: number;
}): Log {
  const topics = encodeEventTopics({
    abi: mosaicAbi,
    eventName: "CellPainted",
    args: {
      id: args.id,
      owner: args.owner,
    },
  });

  const data = encodeAbiParameters([{ type: "uint24" }], [args.color]);

  return {
    address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    topics,
    data,
    blockNumber: 12346n,
    transactionHash: "0xdef",
  } as unknown as Log;
}

describe("Wall update from real receipt fixtures", () => {
  it("updates wall state given a real receipt fixture for claim()", () => {
    const wall = createEmptyWall();
    const buyer = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const seller = "0x0000000000000000000000000000000000000000";

    const claimReceipt = {
      status: "success" as const,
      blockNumber: 100n,
      logs: [
        makeCellClaimedLog({
          id: 42,
          buyer,
          seller,
          color: 0xc2401f,
          price: 2000000000000000n,
          sales: 1,
        }),
      ],
    };

    const decoded = parseEventLogs({
      abi: mosaicAbi,
      logs: claimReceipt.logs,
    });

    expect(decoded.length).toBe(1);
    expect(decoded[0].eventName).toBe("CellClaimed");

    for (const log of decoded) {
      applyLog(wall, log);
    }

    expect(wall[42].owner.toLowerCase()).toBe(buyer.toLowerCase());
    expect(wall[42].color).toBe(0xc2401f);
    expect(wall[42].sales).toBe(1);
  });

  it("updates wall state given a real receipt fixture for paint()", () => {
    const wall = createEmptyWall();
    const owner = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    wall[42] = { id: 42, owner, color: 0xc2401f, sales: 1 };

    const paintReceipt = {
      status: "success" as const,
      blockNumber: 101n,
      logs: [
        makeCellPaintedLog({
          id: 42,
          owner,
          color: 0x5b8def,
        }),
      ],
    };

    const decoded = parseEventLogs({
      abi: mosaicAbi,
      logs: paintReceipt.logs,
    });

    expect(decoded.length).toBe(1);
    expect(decoded[0].eventName).toBe("CellPainted");

    for (const log of decoded) {
      applyLog(wall, log);
    }

    expect(wall[42].owner.toLowerCase()).toBe(owner.toLowerCase());
    expect(wall[42].color).toBe(0x5b8def);
    expect(wall[42].sales).toBe(1);
  });

  it("updates wall state given a real receipt fixture for claimMany()", () => {
    const wall = createEmptyWall();
    const buyer = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
    const seller = "0x0000000000000000000000000000000000000000";

    const claimManyReceipt = {
      status: "success" as const,
      blockNumber: 102n,
      logs: [
        makeCellClaimedLog({
          id: 10,
          buyer,
          seller,
          color: 0xff0000,
          price: 2000000000000000n,
          sales: 1,
        }),
        makeCellClaimedLog({
          id: 11,
          buyer,
          seller,
          color: 0x00ff00,
          price: 2000000000000000n,
          sales: 1,
        }),
        makeCellClaimedLog({
          id: 12,
          buyer,
          seller,
          color: 0x0000ff,
          price: 2000000000000000n,
          sales: 1,
        }),
      ],
    };

    const decoded = parseEventLogs({
      abi: mosaicAbi,
      logs: claimManyReceipt.logs,
    });

    expect(decoded.length).toBe(3);

    for (const log of decoded) {
      applyLog(wall, log);
    }

    expect(wall[10].owner.toLowerCase()).toBe(buyer.toLowerCase());
    expect(wall[10].color).toBe(0xff0000);
    expect(wall[10].sales).toBe(1);

    expect(wall[11].owner.toLowerCase()).toBe(buyer.toLowerCase());
    expect(wall[11].color).toBe(0x00ff00);
    expect(wall[11].sales).toBe(1);

    expect(wall[12].owner.toLowerCase()).toBe(buyer.toLowerCase());
    expect(wall[12].color).toBe(0x0000ff);
    expect(wall[12].sales).toBe(1);
  });
});
