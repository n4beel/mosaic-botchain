import { describe, expect, it, vi } from "vitest";
import { getLogsChunked, getLogsAtBlock } from "../logs";

describe("getLogsChunked", () => {
  const dummyEvent = {
    type: "event",
    name: "CellClaimed",
    inputs: [],
  } as any;

  it("returns immediately when fromBlock > toBlock", async () => {
    const client = {
      getBlockNumber: vi.fn(),
      getLogs: vi.fn(),
    };

    const res = await getLogsChunked({
      client,
      address: "0x1111111111111111111111111111111111111111",
      event: dummyEvent,
      fromBlock: 100n,
      toBlock: 50n,
    });

    expect(res.complete).toBe(true);
    expect(res.logs).toEqual([]);
    expect(client.getLogs).not.toHaveBeenCalled();
  });

  it("walks chunks and collects logs across intervals", async () => {
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(5000n),
      getLogs: vi.fn().mockImplementation(async ({ fromBlock, toBlock }) => {
        return [{ blockNumber: fromBlock, transactionHash: "0xabc" }];
      }),
    };

    const res = await getLogsChunked({
      client,
      address: "0x1111111111111111111111111111111111111111",
      event: dummyEvent,
      fromBlock: 1000n,
      toBlock: 3000n,
      chunk: 1000n,
    });

    expect(res.complete).toBe(true);
    expect(res.logs.length).toBe(3); // [1000-1999], [2000-2999], [3000-3000]
  });

  it("halves chunk size upon RPC range failure down to 500 blocks", async () => {
    let failedOnce = false;
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(2000n),
      getLogs: vi.fn().mockImplementation(async ({ fromBlock, toBlock }) => {
        if (!failedOnce && toBlock - fromBlock > 800n) {
          failedOnce = true;
          throw new Error("range too large");
        }
        return [];
      }),
    };

    const res = await getLogsChunked({
      client,
      address: "0x1111111111111111111111111111111111111111",
      event: dummyEvent,
      fromBlock: 1000n,
      toBlock: 2000n,
      chunk: 1000n,
    });

    expect(failedOnce).toBe(true);
    expect(res.complete).toBe(true);
  });
});

describe("getLogsAtBlock", () => {
  it("queries logs strictly for the specified block", async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([{ blockNumber: 42n }]),
    };

    const logs = await getLogsAtBlock(
      client,
      "0x1111111111111111111111111111111111111111",
      {} as any,
      undefined,
      42n
    );

    expect(client.getLogs).toHaveBeenCalledWith({
      address: "0x1111111111111111111111111111111111111111",
      event: {},
      args: undefined,
      fromBlock: 42n,
      toBlock: 42n,
    });
    expect(logs).toEqual([{ blockNumber: 42n }]);
  });
});
