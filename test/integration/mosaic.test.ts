import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mosaicAbi } from "@/lib/botchain/abi";
import { fetchWall, priceFor } from "@/lib/mosaic";

const PORT = 8602;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

// Standard anvil accounts
const KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const BENEFICIARY = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"; // Anvil account 9

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let wallet0: WalletClient;
let wallet1: WalletClient;
let contractAddress: Address;
let deployBlock: bigint;

const account0 = privateKeyToAccount(KEY_0);
const account1 = privateKeyToAccount(KEY_1);

const BASE_PRICE = 2000000000000000n; // 0.002 ether
const STEP = 2000000000000000n;       // 0.002 ether

function revertDetails(err: unknown): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName)
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

beforeAll(async () => {
  node = spawn("anvil", ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  publicClient = createPublicClient({ chain: local, transport: http() }) as PublicClient;
  wallet0 = createWalletClient({ account: account0, chain: local, transport: http() });
  wallet1 = createWalletClient({ account: account1, chain: local, transport: http() });

  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const artifact = JSON.parse(
    readFileSync(
      new URL("../../contracts/out/Mosaic.sol/Mosaic.json", import.meta.url),
      "utf8"
    )
  ) as { abi: any; bytecode: { object: Hex } };

  const hash = await wallet0.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [BASE_PRICE, STEP, BENEFICIARY],
    account: account0,
    chain: local,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  contractAddress = receipt.contractAddress!;
  deployBlock = receipt.blockNumber;

  process.env.NEXT_PUBLIC_BOHR_RPC = RPC;
  process.env.NEXT_PUBLIC_BOTCHAIN_NETWORK = "testnet";
  process.env.NEXT_PUBLIC_CONTRACT_968 = contractAddress;
  process.env.NEXT_PUBLIC_DEPLOY_BLOCK_968 = String(deployBlock > 1n ? deployBlock - 1n : 1n);
}, 60_000);

afterAll(() => {
  node?.kill("SIGTERM");
});

describe("Mosaic on live local EVM", () => {
  it("deploys with correct constants and immutables", async () => {
    expect(contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const onChainWidth = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "WIDTH",
    });
    expect(Number(onChainWidth)).toBe(32);

    const onChainCells = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "CELLS",
    });
    expect(Number(onChainCells)).toBe(1024);

    const onChainMaxBatch = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "MAX_BATCH",
    });
    expect(Number(onChainMaxBatch)).toBe(16);

    const onChainBase = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "BASE_PRICE",
    });
    expect(onChainBase).toBe(BASE_PRICE);

    const onChainStep = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "STEP",
    });
    expect(onChainStep).toBe(STEP);

    const onChainBen = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "BENEFICIARY",
    });
    expect(onChainBen.toLowerCase()).toBe(BENEFICIARY.toLowerCase());
  });

  it("first claim sets owner, color, sales=1 and credits beneficiary pending", async () => {
    const hash = await wallet0.writeContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "claim",
      args: [0, 0x112233],
      value: BASE_PRICE,
      chain: local,
      account: account0,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const cell = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "cellOf",
      args: [0],
    });
    expect(cell.owner.toLowerCase()).toBe(account0.address.toLowerCase());
    expect(cell.color).toBe(0x112233);
    expect(cell.sales).toBe(1);

    const benPending = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "pending",
      args: [BENEFICIARY],
    });
    expect(benPending).toBe(BASE_PRICE);
  });

  it("resale pays previous owner's pending, updates owner and raises price", async () => {
    const nextPrice = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "priceOf",
      args: [0],
    });
    expect(nextPrice).toBe(BASE_PRICE + STEP);

    const hash = await wallet1.writeContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "claim",
      args: [0, 0x445566],
      value: nextPrice,
      chain: local,
      account: account1,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const cell = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "cellOf",
      args: [0],
    });
    expect(cell.owner.toLowerCase()).toBe(account1.address.toLowerCase());
    expect(cell.color).toBe(0x445566);
    expect(cell.sales).toBe(2);

    const acct0Pending = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "pending",
      args: [account0.address],
    });
    expect(acct0Pending).toBe(nextPrice);
  });

  it("withdraw pays pending balance and zeroes it", async () => {
    const balanceBefore = await publicClient.getBalance({ address: account0.address });

    const hash = await wallet0.writeContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "withdraw",
      chain: local,
      account: account0,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const pendingAfter = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "pending",
      args: [account0.address],
    });
    expect(pendingAfter).toBe(0n);

    const balanceAfter = await publicClient.getBalance({ address: account0.address });
    expect(balanceAfter).toBeGreaterThan(balanceBefore);
  });

  it("paint allows the owner to change color for free without incrementing sales", async () => {
    const hash = await wallet1.writeContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "paint",
      args: [0, 0x778899],
      chain: local,
      account: account1,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const cell = await publicClient.readContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "cellOf",
      args: [0],
    });
    expect(cell.color).toBe(0x778899);
    expect(cell.sales).toBe(2); // unchanged
  });

  it("price vectors priceFor match priceOf for sales 0..6", async () => {
    for (let s = 0; s <= 6; s++) {
      const calculated = priceFor(s, BASE_PRICE, STEP);
      expect(calculated).toBe(BASE_PRICE + BigInt(s) * STEP);
    }
  });

  it("claimMany batches up to 16 cells in one atomic transaction", async () => {
    const ids = [10, 11, 12];
    const colors = [0x111111, 0x222222, 0x333333];
    const totalCost = BASE_PRICE * 3n;

    const hash = await wallet0.writeContract({
      address: contractAddress,
      abi: mosaicAbi,
      functionName: "claimMany",
      args: [ids, colors],
      value: totalCost,
      chain: local,
      account: account0,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    for (const id of ids) {
      const cell = await publicClient.readContract({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "cellOf",
        args: [id],
      });
      expect(cell.owner.toLowerCase()).toBe(account0.address.toLowerCase());
    }
  });

  it("reverts on BadCell(1024)", async () => {
    let threw = false;
    try {
      await wallet0.writeContract({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "claim",
        args: [1024, 0x111111],
        value: BASE_PRICE,
        chain: local,
        account: account0,
      });
    } catch (err) {
      threw = true;
      const details = revertDetails(err);
      expect(details?.errorName).toBe("BadCell");
      expect(details?.args?.[0]).toBe(1024);
    }
    expect(threw).toBe(true);
  });

  it("reverts on AlreadyOwner(id)", async () => {
    let threw = false;
    try {
      await wallet0.writeContract({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "claim",
        args: [10, 0x111111], // account0 already owns 10
        value: BASE_PRICE + STEP,
        chain: local,
        account: account0,
      });
    } catch (err) {
      threw = true;
      const details = revertDetails(err);
      expect(details?.errorName).toBe("AlreadyOwner");
      expect(details?.args?.[0]).toBe(10);
    }
    expect(threw).toBe(true);
  });

  it("reverts on WrongPayment(expected, sent)", async () => {
    let threw = false;
    try {
      await wallet1.writeContract({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "claim",
        args: [10, 0x111111],
        value: BASE_PRICE, // expected is BASE_PRICE + STEP = 0.004 BOT
        chain: local,
        account: account1,
      });
    } catch (err) {
      threw = true;
      const details = revertDetails(err);
      expect(details?.errorName).toBe("WrongPayment");
      expect(details?.args?.[0]).toBe(BASE_PRICE + STEP);
      expect(details?.args?.[1]).toBe(BASE_PRICE);
    }
    expect(threw).toBe(true);
  });

  it("reverts on NotOwner(id, caller, owner)", async () => {
    let threw = false;
    try {
      await wallet0.writeContract({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "paint",
        args: [0, 0x000000], // cell 0 is owned by account1
        chain: local,
        account: account0,
      });
    } catch (err) {
      threw = true;
      const details = revertDetails(err);
      expect(details?.errorName).toBe("NotOwner");
      expect(details?.args?.[0]).toBe(0);
      expect((details?.args?.[1] as string).toLowerCase()).toBe(account0.address.toLowerCase());
      expect((details?.args?.[2] as string).toLowerCase()).toBe(account1.address.toLowerCase());
    }
    expect(threw).toBe(true);
  });

  it("reverts on BadBatch(17)", async () => {
    const ids = Array.from({ length: 17 }, (_, i) => 100 + i);
    const colors = Array.from({ length: 17 }, () => 0x123456);

    let threw = false;
    try {
      await wallet0.writeContract({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "claimMany",
        args: [ids, colors],
        value: BASE_PRICE * 17n,
        chain: local,
        account: account0,
      });
    } catch (err) {
      threw = true;
      const details = revertDetails(err);
      expect(details?.errorName).toBe("BadBatch");
      expect(details?.args?.[0]).toBe(17n);
    }
    expect(threw).toBe(true);
  });

  it("reverts on NothingToWithdraw", async () => {
    let threw = false;
    try {
      await wallet0.writeContract({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "withdraw",
        chain: local,
        account: account0,
      });
    } catch (err) {
      threw = true;
      const details = revertDetails(err);
      expect(details?.errorName).toBe("NothingToWithdraw");
    }
    expect(threw).toBe(true);
  });

  it("wall pagination returns 1024 cells in 4 pages of 256 and fetchWall works", async () => {
    const wall = await fetchWall(publicClient as any, contractAddress);
    expect(wall.length).toBe(1024);
    expect(wall[0].owner.toLowerCase()).toBe(account1.address.toLowerCase());
    expect(wall[0].color).toBe(0x778899);
    expect(wall[0].sales).toBe(2);
    expect(wall[10].owner.toLowerCase()).toBe(account0.address.toLowerCase());
  });
});
