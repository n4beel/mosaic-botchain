"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { formatEther } from "viem";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { mosaicAbi } from "@/lib/botchain/abi";
import {
  type Cell,
  idToXY,
  priceFor,
  batchTotal,
  colorToHex,
  hexToColor,
} from "@/lib/mosaic";
import { BASE_PRICE_DEFAULT, STEP_DEFAULT, MAX_BATCH } from "@/lib/limits";
import { describeError, shortAddress } from "@/lib/errors";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import PalettePicker from "./PalettePicker";
import BotChainGate from "@/components/botchain/BotChainGate";
import { useToast } from "@/components/ui/Toast";

interface CellCardProps {
  cell: Cell | null;
  basePrice: bigint;
  stepPrice: bigint;
  contractAddress?: `0x${string}`;
  isBatchMode: boolean;
  batchIds: number[];
  wall: Cell[];
  onClearBatch: () => void;
  onTxSuccess: (logArgs: any) => void;
  onClose?: () => void;
}

type TxStage = "idle" | "preparing" | "waiting-wallet" | "confirming" | "confirmed" | "error";

export default function CellCard({
  cell,
  basePrice = BASE_PRICE_DEFAULT,
  stepPrice = STEP_DEFAULT,
  contractAddress,
  isBatchMode,
  batchIds,
  wall,
  onClearBatch,
  onTxSuccess,
  onClose,
}: CellCardProps) {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { toast } = useToast();

  const [selectedColor, setSelectedColor] = useState<number>(0xc2401f); // default vermilion
  const [stage, setStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [priceChangeNotice, setPriceChangeNotice] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const { data: receipt, isLoading: isConfirmingReceipt } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  const settledRef = useRef<Set<string>>(new Set());
  const clientRef = useRef(publicClient);
  useEffect(() => {
    clientRef.current = publicClient;
  }, [publicClient]);

  // When a single cell is selected, update default color to current color if already claimed
  useEffect(() => {
    if (cell) {
      if (cell.sales > 0) {
        setSelectedColor(cell.color);
      } else {
        setSelectedColor(0xc2401f);
      }
      setErrorMessage(null);
      setPriceChangeNotice(null);
      setStage("idle");
    }
  }, [cell?.id, cell?.sales, cell?.color]);

  // Settle transaction once receipt arrives
  useEffect(() => {
    if (!txHash || !receipt) return;
    if (settledRef.current.has(txHash)) return;

    if (receipt.status === "success") {
      settledRef.current.add(txHash);
      setStage("confirmed");
      toast("success", "Transaction confirmed", `Applied on block ${receipt.blockNumber}`);

      // Pass first decoded log to caller for optimistic update
      onTxSuccess(receipt.logs);
      if (isBatchMode) {
        onClearBatch();
      }
    } else if (receipt.status === "reverted") {
      settledRef.current.add(txHash);
      setStage("error");
      setErrorMessage("Transaction was reverted by the network.");
      toast("error", "Transaction failed");
    }
  }, [txHash, receipt?.status, receipt?.blockNumber, onTxSuccess, isBatchMode, onClearBatch, toast]);

  // Reset stage after confirmation
  const handleReset = () => {
    setStage("idle");
    setTxHash(null);
    setErrorMessage(null);
    setPriceChangeNotice(null);
  };

  // Compute pricing and ownership
  const isOwner = Boolean(
    userAddress &&
      cell?.owner &&
      cell.sales > 0 &&
      cell.owner.toLowerCase() === userAddress.toLowerCase()
  );

  const currentPrice = cell ? priceFor(cell.sales, basePrice, stepPrice) : basePrice;
  const nextPrice = cell ? priceFor(cell.sales + 1, basePrice, stepPrice) : basePrice + stepPrice;

  // Batch calculations
  const batchCells = useMemo(() => {
    return batchIds.map((id) => wall[id] || { id, owner: "0x0" as any, color: 0, sales: 0 });
  }, [batchIds, wall]);

  const batchCost = useMemo(() => {
    return batchTotal(batchCells, basePrice, stepPrice, userAddress);
  }, [batchCells, basePrice, stepPrice, userAddress]);

  const ownedSkippedCount = useMemo(() => {
    if (!userAddress) return 0;
    const lower = userAddress.toLowerCase();
    return batchCells.filter((c) => c.owner?.toLowerCase() === lower).length;
  }, [batchCells, userAddress]);

  // Actions
  const handleClaim = async () => {
    if (!cell || !contractAddress) return;
    setStage("waiting-wallet");
    setErrorMessage(null);
    setPriceChangeNotice(null);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "claim",
        args: [cell.id, selectedColor],
        value: currentPrice,
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err: unknown) {
      setStage("error");
      const desc = describeError(err);
      setErrorMessage(desc);

      // Check if price changed under the buyer
      if (desc.includes("Someone got there first")) {
        setPriceChangeNotice(desc);
      }
      toast("error", "Claim failed", desc);
    }
  };

  const handlePaint = async () => {
    if (!cell || !contractAddress) return;
    setStage("waiting-wallet");
    setErrorMessage(null);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "paint",
        args: [cell.id, selectedColor],
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err: unknown) {
      setStage("error");
      const desc = describeError(err);
      setErrorMessage(desc);
      toast("error", "Repaint failed", desc);
    }
  };

  const handleBatchClaim = async () => {
    if (!contractAddress || batchIds.length === 0) return;
    setStage("waiting-wallet");
    setErrorMessage(null);

    const validBatch = batchCells.filter(
      (c) => !userAddress || c.owner?.toLowerCase() !== userAddress.toLowerCase()
    );

    if (validBatch.length === 0) {
      setStage("error");
      setErrorMessage("All selected cells are already owned by you.");
      return;
    }

    if (validBatch.length > MAX_BATCH) {
      setStage("error");
      setErrorMessage(`Pick between 1 and ${MAX_BATCH} cells.`);
      return;
    }

    const ids = validBatch.map((c) => c.id);
    const colors = validBatch.map(() => selectedColor);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "claimMany",
        args: [ids, colors],
        value: batchCost,
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err: unknown) {
      setStage("error");
      const desc = describeError(err);
      setErrorMessage(desc);
      toast("error", "Batch claim failed", desc);
    }
  };

  // --- STAGE CONFIRMED BRANCH FIRST (§3.3) ---
  if (stage === "confirmed") {
    return (
      <Panel kind="card" className="w-full max-w-[340px] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-mono tracking-wider text-[var(--success)] font-medium">
            ✓ Confirmed
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
        <p className="text-sm">
          {isBatchMode
            ? `Successfully claimed ${batchIds.length} cells.`
            : `Cell at (${idToXY(cell?.id ?? 0).x}, ${idToXY(cell?.id ?? 0).y}) updated.`}
        </p>
        {txHash && (
          <a
            href={`https://scan.botchain.ai/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-[var(--accent)] underline break-all"
          >
            {shortAddress(txHash)}
          </a>
        )}
        <Button variant="ghost" size="sm" onClick={handleReset} className="w-full mt-1">
          Done
        </Button>
      </Panel>
    );
  }

  // --- BATCH MODE CARD ---
  if (isBatchMode) {
    const validCount = batchCells.length - ownedSkippedCount;
    return (
      <Panel kind="card" className="w-full max-w-[340px] flex flex-col gap-3.5">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm">Batch Claim</span>
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {batchIds.length} / {MAX_BATCH} cells
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClearBatch}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline cursor-pointer"
            >
              clear
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {batchIds.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-4 text-center">
            Click or drag across cells on the wall to select up to {MAX_BATCH} cells.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between font-mono">
                <span className="text-[var(--text-muted)]">Total cost:</span>
                <span className="font-bold text-[var(--text-primary)]">
                  {formatEther(batchCost)} BOT
                </span>
              </div>
              {ownedSkippedCount > 0 && (
                <p className="text-[11px] text-[var(--warning)] italic">
                  {ownedSkippedCount} cell{ownedSkippedCount > 1 ? "s" : ""} you already own skipped
                </p>
              )}
            </div>

            <PalettePicker currentColor={selectedColor} onChange={setSelectedColor} />

            {errorMessage && (
              <p className="text-xs text-[var(--danger)] bg-[rgba(194,64,31,0.06)] p-2 border border-[var(--border-subtle)]">
                {errorMessage}
              </p>
            )}

            <BotChainGate noWalletNote="Connect a wallet to claim these cells.">
              <Button
                variant="primary"
                size="md"
                disabled={validCount === 0 || validCount > MAX_BATCH}
                loading={stage === "waiting-wallet" || stage === "confirming"}
                onClick={handleBatchClaim}
                className="w-full"
              >
                Claim {validCount} cell{validCount === 1 ? "" : "s"} · {formatEther(batchCost)} BOT
              </Button>
            </BotChainGate>
          </>
        )}
      </Panel>
    );
  }

  // --- SINGLE CELL CARD ---
  if (!cell) {
    return (
      <Panel kind="card" className="w-full max-w-[340px] text-xs text-[var(--text-muted)] p-5 text-center">
        Select a cell on the wall to view or claim.
      </Panel>
    );
  }

  const { x, y } = idToXY(cell.id);
  const isUnclaimed = cell.sales === 0;

  return (
    <Panel kind="card" className="w-full max-w-[340px] flex flex-col gap-3">
      {/* Header with coordinates and close */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-baseline gap-2 font-mono">
          <span className="font-bold text-sm tracking-tight">
            {x},{y}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            #{cell.id}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Details sentence based on state (§3.3) */}
      <div className="text-xs leading-relaxed">
        {isUnclaimed ? (
          <p>
            <span className="text-[var(--text-muted)]">unclaimed · </span>
            <span className="font-mono font-medium">{formatEther(currentPrice)} BOT</span>
            <span className="text-[var(--text-muted)]"> · you'd be first.</span>
          </p>
        ) : isOwner ? (
          <div>
            <p>
              <span className="font-medium text-[var(--success)]">owned by you</span>
              <span className="text-[var(--text-muted)]"> · taken {cell.sales} time{cell.sales === 1 ? "" : "s"}</span>
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono">
              Next buyer pays {formatEther(nextPrice)} BOT
            </p>
          </div>
        ) : (
          <p>
            <span className="text-[var(--text-muted)]">owned by </span>
            <span className="font-mono">{shortAddress(cell.owner)}</span>
            <span className="text-[var(--text-muted)]"> · taken {cell.sales} time{cell.sales === 1 ? "" : "s"} · </span>
            <span className="font-mono font-medium">{formatEther(currentPrice)} BOT</span>
          </p>
        )}
      </div>

      {/* Palette Picker */}
      <PalettePicker currentColor={selectedColor} onChange={setSelectedColor} />

      {/* Price change under you alert (§3.3) */}
      {priceChangeNotice && (
        <div className="p-2 border border-[var(--warning)] bg-[rgba(212,168,87,0.08)] text-xs text-[var(--text-primary)] leading-snug">
          {priceChangeNotice}
        </div>
      )}

      {errorMessage && !priceChangeNotice && (
        <p className="text-xs text-[var(--danger)] bg-[rgba(194,64,31,0.06)] p-2 border border-[var(--border-subtle)] leading-snug">
          {errorMessage}
        </p>
      )}

      {/* Action Buttons wrapped in BotChainGate (§3.11) */}
      <BotChainGate
        noWalletNote={
          isOwner
            ? "Connect wallet to repaint."
            : isUnclaimed
            ? "Connect wallet to claim."
            : "Connect wallet to take it."
        }
      >
        {isOwner ? (
          <Button
            variant="primary"
            size="md"
            loading={stage === "waiting-wallet" || stage === "confirming"}
            onClick={handlePaint}
            className="w-full"
          >
            Repaint (free)
          </Button>
        ) : isUnclaimed ? (
          <Button
            variant="primary"
            size="md"
            loading={stage === "waiting-wallet" || stage === "confirming"}
            onClick={handleClaim}
            className="w-full"
          >
            Claim for {formatEther(currentPrice)} BOT
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            loading={stage === "waiting-wallet" || stage === "confirming"}
            onClick={handleClaim}
            className="w-full"
          >
            Take it for {formatEther(currentPrice)} BOT
          </Button>
        )}
      </BotChainGate>
    </Panel>
  );
}
