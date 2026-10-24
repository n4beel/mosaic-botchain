"use client";

import { useState, useEffect, useRef } from "react";
import { formatEther } from "viem";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { mosaicAbi } from "@/lib/botchain/abi";
import { describeError } from "@/lib/errors";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface PendingPillProps {
  contractAddress?: `0x${string}`;
}

export default function PendingPill({ contractAddress }: PendingPillProps) {
  const { address: userAddress, isConnected } = useAccount();
  const { toast } = useToast();

  const { data: pendingBalance, refetch: refetchPending } = useReadContract({
    address: contractAddress,
    abi: mosaicAbi,
    functionName: "pending",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(contractAddress && userAddress && isConnected),
      refetchInterval: 5000,
    },
  });

  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [working, setWorking] = useState(false);

  const { writeContractAsync } = useWriteContract();
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  const settledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!txHash || !receipt) return;
    if (settledRef.current.has(txHash)) return;

    if (receipt.status === "success") {
      settledRef.current.add(txHash);
      setWorking(false);
      setTxHash(null);
      refetchPending();
      toast("success", "Withdrawn", "Pending balance has been sent to your wallet.");
    } else if (receipt.status === "reverted") {
      settledRef.current.add(txHash);
      setWorking(false);
      setTxHash(null);
      toast("error", "Withdraw failed", "Transaction was reverted.");
    }
  }, [txHash, receipt?.status, refetchPending, toast]);

  const handleWithdraw = async () => {
    if (!contractAddress) return;
    setWorking(true);
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: mosaicAbi,
        functionName: "withdraw",
      });
      setTxHash(hash);
    } catch (err: unknown) {
      setWorking(false);
      const desc = describeError(err);
      toast("error", "Withdraw failed", desc);
    }
  };

  if (!isConnected || !pendingBalance || pendingBalance === 0n) {
    return null;
  }

  const formatted = formatEther(pendingBalance);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[0_2px_12px_rgba(31,29,26,0.06)] text-xs">
      <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
      <span>
        You're owed <strong className="font-mono">{formatted} BOT</strong>
      </span>
      <Button
        variant="primary"
        size="sm"
        loading={working}
        onClick={handleWithdraw}
        className="ml-1 text-[11px] h-6 px-2"
      >
        Withdraw
      </Button>
    </div>
  );
}
