/**
 * Local stack runner and seeder for Mosaic.
 *
 * Spawns anvil on port 8702 with chain id 968, deploys Mosaic, and seeds
 * realistic states across accounts:
 * - ~140 cells claimed across 6 accounts forming a 24x24 pixel motif plus scattered cells
 * - ~20 cells retaken so sales >= 2
 * - Account 1 has a pending balance (owned a cell that was retaken)
 * - Account 0 owns exactly 9 cells
 *
 * Usage:
 *   node scripts/local-stack.mjs
 *   npm run dev
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8702;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}


const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // 5
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e", // 6
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356", // 7
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97", // 8
  "0x2a871d0798f97d79848a013d3bbd3624b693d9f0a40899f3575ce00faac12018", // 9: beneficiary
];

const BENEFICIARY = privateKeyToAccount(KEYS[9]).address;
const BASE_PRICE = 2000000000000000n; // 0.002 ether
const STEP = 2000000000000000n;       // 0.002 ether

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const realNow = Math.floor(Date.now() / 1000);
console.log(`Starting anvil on port ${PORT} (timestamp: ${realNow})...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--timestamp",
    String(realNow),
    "--block-time",
    "1",
    "--silent",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });
const accounts = KEYS.map((k) => privateKeyToAccount(k));
const wallets = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

// Wait for anvil to answer
for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/Mosaic.sol/Mosaic.json", import.meta.url), "utf8")
);

// Deploy Mosaic
const deployHash = await wallets[0].deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [BASE_PRICE, STEP, BENEFICIARY],
});
const deployed = await pub.waitForTransactionReceipt({ hash: deployHash });
const contractAddress = deployed.contractAddress;

console.log(`Mosaic deployed at ${contractAddress} (block ${deployed.blockNumber})`);

// Design a recognizable motif in 32x32:
// A diamond & frame pattern plus scattered cells (~140 total)
const motifCells = [];
// 1. A 24x24 framed motif centered at (16, 16)
for (let y = 6; y <= 25; y++) {
  for (let x = 6; x <= 25; x++) {
    const dx = Math.abs(x - 15.5);
    const dy = Math.abs(y - 15.5);
    const dist = dx + dy;
    // Diamond rings & cross: dist around 8..10 or on cross
    if (Math.abs(dist - 9) < 1.2 || (x === 15 || x === 16) || (y === 15 || y === 16)) {
      motifCells.push({ id: y * 32 + x, color: 0xc2401f }); // vermilion
    } else if (dist < 5) {
      motifCells.push({ id: y * 32 + x, color: 0xd4a857 }); // gold core
    }
  }
}

// Add some scattered cells to reach ~140 cells
for (let i = 0; i < 20; i++) {
  const id = ((i * 47) % 900) + 50;
  if (!motifCells.some((c) => c.id === id)) {
    motifCells.push({ id, color: 0x5b8def });
  }
}

// Ensure account 0 owns exactly 9 specific cells at coordinates (2..4, 2..4)
const acct0Ids = [
  2 * 32 + 2, 2 * 32 + 3, 2 * 32 + 4,
  3 * 32 + 2, 3 * 32 + 3, 3 * 32 + 4,
  4 * 32 + 2, 4 * 32 + 3, 4 * 32 + 4,
];
const acct0Set = new Set(acct0Ids);
const otherCells = motifCells.filter((c) => !acct0Set.has(c.id));

console.log(`Seeding ~${otherCells.length} cells across accounts 1..5...`);

// Batch claim across accounts 1..5 in batches of 14
// Batch 0 (indices 0..13) will be claimed by Account 1
const batchSize = 14;
for (let i = 0; i < otherCells.length; i += batchSize) {
  const slice = otherCells.slice(i, i + batchSize);
  const ids = slice.map((c) => c.id);
  const colors = slice.map((c) => c.color);
  const acctIdx = ((i / batchSize) % 5) + 1; // accounts 1 to 5
  const cost = BASE_PRICE * BigInt(ids.length);

  const hash = await wallets[acctIdx].writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "claimMany",
    args: [ids, colors],
    value: cost,
  });
  await pub.waitForTransactionReceipt({ hash });
}

// Account 0 claims its 9 cells
console.log("Account 0 claiming its 9 cells...");
const h0 = await wallets[0].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "claimMany",
  args: [acct0Ids, acct0Ids.map(() => 0x2c6b4f)],
  value: BASE_PRICE * 9n,
});
await pub.waitForTransactionReceipt({ hash: h0 });

// Retake ~20 cells so sales >= 2
// Retake cells from otherCells (especially indices 0..13, which are owned by account 1)
console.log("Retaking 20 cells so sales >= 2...");
const retakeIds = otherCells.slice(0, 20).map((c) => c.id);
for (let j = 0; j < retakeIds.length; j++) {
  const id = retakeIds[j];
  const cell = await pub.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "cellOf",
    args: [id],
  });

  // Pick a buyer from accounts 2..5 that does NOT currently own the cell
  let buyerIdx = 2;
  for (let b = 2; b <= 5; b++) {
    if (accounts[b].address.toLowerCase() !== cell.owner.toLowerCase()) {
      buyerIdx = b;
      break;
    }
  }

  const price = await pub.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "priceOf",
    args: [id],
  });

  const hash = await wallets[buyerIdx].writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "claim",
    args: [id, 0xe0603a],
    value: price,
  });
  await pub.waitForTransactionReceipt({ hash });
}

// Ensure account 1 has a pending balance:
// Account 1 owned one of the retaken cells and has pending > 0
const p1 = await pub.readContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "pending",
  args: [accounts[1].address],
});
console.log(`Account 1 pending balance: ${p1} wei`);

// Check account 0 owns exactly 9 cells
const ownedByAcct0 = await pub.readContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "ownedBy",
  args: [accounts[0].address, 0, 1024],
});
console.log(`Account 0 owns ${ownedByAcct0.length} cells (expected 9).`);

// Assert final chain timestamp is within 120s of wall clock
const finalBlock = await pub.getBlock();
const currentWallTime = Math.floor(Date.now() / 1000);
const diff = Math.abs(Number(finalBlock.timestamp) - currentWallTime);
console.log(`\nFinal chain timestamp: ${finalBlock.timestamp} (real: ${currentWallTime}, diff: ${diff}s)`);
if (diff > 120) {
  throw new Error(`Chain timestamp skewed by ${diff}s, expected <= 120s`);
}

// Write .env.local
const envContent = [
  `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet`,
  `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
  `NEXT_PUBLIC_CONTRACT_968=${contractAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployed.blockNumber > 1n ? deployed.blockNumber - 1n : 1n}`,
  `NEXT_PUBLIC_CHAIN_ID=968`,
  `NEXT_PUBLIC_RPC_URL=${RPC}`,
  "",
].join("\n");

writeFileSync(".env.local", envContent);
console.log("Wrote .env.local");

console.log("\n========================================================");
console.log(`Mosaic Local Stack Running on ${RPC}`);
console.log("========================================================");
console.log("Account Role Table:");
console.log("--------------------------------------------------------");
console.log(`Acc 0: ${accounts[0].address} (Owns 9 cells: 66, 67, 68, 98, 99, 100, 130, 131, 132)`);
console.log(`Acc 1: ${accounts[1].address} (Has pending balance from retaken cells)`);
console.log(`Acc 2..5: Motif cell owners & active buyers`);
console.log(`Acc 9: ${BENEFICIARY} (Beneficiary: receives initial claim proceeds)`);
console.log("--------------------------------------------------------");
console.log("Local stack ready!");
process.exit(0);

