"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { getDeployment } from "@/lib/botchain/deployment";
import { activeBotChain, isBotChainId } from "@/lib/botchain/chain";
import { mosaicAbi } from "@/lib/botchain/abi";
import { idToXY, priceFor, colorToHex, hexToColor, CURATED_PALETTE } from "@/lib/mosaic";
import { BASE_PRICE_DEFAULT, STEP_DEFAULT } from "@/lib/limits";
import { describeError } from "@/lib/errors";

export default function MinePage() {
  const { address: userAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { toast } = useToast();

  const activeId = isBotChainId(chainId) ? chainId : activeBotChain.id;
  const deployment = getDeployment(activeId);
  const contractAddress = deployment.address;

  // Read owned cell IDs
  const { data: ownedIds, isLoading: isLoadingOwned, refetch: refetchOwned } = useReadContract({
    address: contractAddress,
    abi: mosaicAbi,
    functionName: "ownedBy",
    args: userAddress ? [userAddress, 0, 1024] : undefined,
    query: {
      enabled: Boolean(contractAddress && userAddress && isConnected),
    },
  });

  // Read pending balance
  const { data: pendingBalance, refetch: refetchPending } = useReadContract({
    address: contractAddress,
    abi: mosaicAbi,
    functionName: "pending",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(contractAddress && userAddress && isConnected),
    },
  });

  // Read contract base & step prices
  const { data: priceConfigs } = useReadContracts({
    contracts: contractAddress
      ? [
          { address: contractAddress, abi: mosaicAbi, functionName: "BASE_PRICE" },
          { address: contractAddress, abi: mosaicAbi, functionName: "STEP" },
        ]
      : [],
    query: {
      enabled: Boolean(contractAddress),
    },
  });

  const basePrice = (priceConfigs?.[0]?.result as bigint) ?? BASE_PRICE_DEFAULT;
  const stepPrice = (priceConfigs?.[1]?.result as bigint) ?? STEP_DEFAULT;

  // Read cell details for each owned ID
  const cellContracts = (ownedIds || []).map((id) => ({
    address: contractAddress!,
    abi: mosaicAbi,
    functionName: "cellOf" as const,
    args: [id] as readonly [number],
  }));

  const { data: cellsData, refetch: refetchCells } = useReadContracts({
    contracts: cellContracts,
    query: {
      enabled: Boolean(contractAddress && cellContracts.length > 0),
    },
  });

  // Withdraw transaction state
  const [withdrawHash, setWithdrawHash] = useState<`0x${string}` | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const { writeContractAsync } = useWriteContract();
  const { data: withdrawReceipt } = useWaitForTransactionReceipt({
    hash: withdrawHash ?? undefined,
  });

  const settledWithdrawRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!withdrawHash || !withdrawReceipt) return;
    if (settledWithdrawRef.current.has(withdrawHash)) return;

    if (withdrawReceipt.status === "success") {
      settledWithdrawRef.current.add(withdrawHash);
      setIsWithdrawing(false);
      setWithdrawHash(null);
      refetchPending();
      toast("success", "Withdrawn", "Pending funds transferred to your wallet.");
    } else if (withdrawReceipt.status === "reverted") {
      settledWithdrawRef.current.add(withdrawHash);
      setIsWithdrawing(false);
      setWithdrawHash(null);
      toast("error", "Withdraw failed", "Transaction was reverted.");
    }
  }, [withdrawHash, withdrawReceipt?.status, refetchPending, toast]);

  const handleWithdraw = async () => {
    if (!contractAddress) return;
    setIsWithdrawing(true);
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "withdraw",
      });
      setWithdrawHash(hash);
    } catch (err) {
      setIsWithdrawing(false);
      const desc = describeError(err);
      toast("error", "Withdraw failed", desc);
    }
  };

  // Repaint state per cell
  const [repaintingId, setRepaintingId] = useState<number | null>(null);
  const [activeColorPerCell, setActiveColorPerCell] = useState<Record<number, number>>({});

  const handleInlinePaint = async (id: number) => {
    if (!contractAddress) return;
    const color = activeColorPerCell[id] ?? 0xc2401f;
    setRepaintingId(id);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "paint",
        args: [id, color],
      });
      toast("info", "Repainting cell", "Waiting for confirmation…");
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      refetchCells();
      setRepaintingId(null);
      toast("success", "Repainted", `Cell #${id} colour updated.`);
    } catch (err) {
      setRepaintingId(null);
      const desc = describeError(err);
      toast("error", "Repaint failed", desc);
    }
  };

  const pendingFormatted = pendingBalance ? formatEther(pendingBalance) : "0";

  return (
    <PageShell title="My Cells" description="Manage your coordinates and withdraw proceeds.">
      <div className="w-full max-w-[800px] flex flex-col gap-6 py-4">
        <BotChainGate noWalletNote="Connect your wallet to see cells you own and withdraw resale proceeds.">
          {/* Pending Balance & Withdraw Card */}
          <Panel kind="card" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-mono">
                Withdrawable Proceeds
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
                  {pendingFormatted} BOT
                </span>
                {pendingBalance && pendingBalance > 0n && (
                  <span className="text-xs text-[var(--success)] font-medium">available</span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Credited when other visitors take your cells.
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              disabled={!pendingBalance || pendingBalance === 0n}
              loading={isWithdrawing}
              onClick={handleWithdraw}
              className="w-full sm:w-auto"
            >
              Withdraw {pendingBalance && pendingBalance > 0n ? `${pendingFormatted} BOT` : ""}
            </Button>
          </Panel>

          {/* Owned Cells List */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Owned Cells ({ownedIds?.length ?? 0})
              </h2>
              <Link
                href="/"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
              >
                view full wall →
              </Link>
            </div>

            {isLoadingOwned ? (
              <p className="text-xs text-[var(--text-muted)] py-6 font-mono text-center">
                Scanning wall for owned cells…
              </p>
            ) : !ownedIds || ownedIds.length === 0 ? (
              <Panel kind="plain" className="text-center py-10 flex flex-col items-center gap-3">
                <p className="text-sm text-[var(--text-muted)]">
                  You do not currently own any cells on the wall.
                </p>
                <Link href="/">
                  <Button variant="primary" size="sm">
                    Go to wall and claim one
                  </Button>
                </Link>
              </Panel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ownedIds.map((id, idx) => {
                  const { x, y } = idToXY(id);
                  const cellResult = cellsData?.[idx]?.result as
                    | { owner: string; color: number; sales: number }
                    | undefined;

                  const color = cellResult ? cellResult.color : 0;
                  const sales = cellResult ? cellResult.sales : 1;
                  const hex = colorToHex(color);
                  const retakePrice = priceFor(sales, basePrice, stepPrice);
                  const currentColor = activeColorPerCell[id] ?? color;

                  return (
                    <Panel
                      key={id}
                      kind="card"
                      className="flex flex-col gap-3 p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2 font-mono">
                          <Link
                            href={`/?c=${x},${y}`}
                            className="font-bold text-sm hover:text-[var(--accent)] underline"
                          >
                            {x},{y}
                          </Link>
                          <span className="text-xs text-[var(--text-muted)]">#{id}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono">
                          <span>taken {sales}x</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs py-1 border-y border-[var(--border-subtle)]">
                        <span className="text-[var(--text-muted)]">Next buyer pays:</span>
                        <span className="font-mono font-medium">{formatEther(retakePrice)} BOT</span>
                      </div>

                      {/* Repaint inline */}
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text-muted)]">Colour:</span>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 border border-[var(--border-subtle)] inline-block"
                              style={{ backgroundColor: colorToHex(currentColor) }}
                            />
                            <input
                              type="color"
                              value={colorToHex(currentColor)}
                              onChange={(e) =>
                                setActiveColorPerCell((prev) => ({
                                  ...prev,
                                  [id]: hexToColor(e.target.value),
                                }))
                              }
                              className="w-6 h-6 p-0 border border-[var(--border-subtle)] bg-transparent cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Quick swatches */}
                        <div className="flex gap-1 overflow-x-auto py-1">
                          {CURATED_PALETTE.slice(0, 8).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() =>
                                setActiveColorPerCell((prev) => ({
                                  ...prev,
                                  [id]: hexToColor(p),
                                }))
                              }
                              className="w-4 h-4 border border-[var(--border-subtle)] flex-shrink-0 cursor-pointer hover:scale-110"
                              style={{ backgroundColor: p }}
                            />
                          ))}
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          loading={repaintingId === id}
                          onClick={() => handleInlinePaint(id)}
                          className="w-full mt-1"
                        >
                          Repaint (free)
                        </Button>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            )}
          </div>
        </BotChainGate>
      </div>
    </PageShell>
  );
}
