"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount, useChainId, usePublicClient, useWatchContractEvent, useReadContracts } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import WallCanvas from "@/components/mosaic/WallCanvas";
import ToolStrip, { type ToolMode } from "@/components/mosaic/ToolStrip";
import CellCard from "@/components/mosaic/CellCard";
import PendingPill from "@/components/mosaic/PendingPill";
import AboutModal from "@/components/mosaic/AboutModal";
import { useToast } from "@/components/ui/Toast";
import { getDeployment } from "@/lib/botchain/deployment";
import { activeBotChain, isBotChainId } from "@/lib/botchain/chain";
import { mosaicAbi } from "@/lib/botchain/abi";
import {
  type Cell,
  fetchWall,
  applyLog,
  idToXY,
  xyToId,
} from "@/lib/mosaic";
import { BASE_PRICE_DEFAULT, STEP_DEFAULT, CELLS } from "@/lib/limits";

function WallView() {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [wall, setWall] = useState<Cell[]>([]);
  const [loadingWall, setLoadingWall] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<ToolMode>("select");
  const [batchIds, setBatchIds] = useState<number[]>([]);
  const [showMyCells, setShowMyCells] = useState<boolean>(false);
  const [showAbout, setShowAbout] = useState<boolean>(false);

  // Deployment configuration
  const activeId = isBotChainId(chainId) ? chainId : activeBotChain.id;
  const deployment = getDeployment(activeId);
  const contractAddress = deployment.address;

  // Base price and step from contract (or defaults)
  const { data: priceConfigs } = useReadContracts({
    contracts: contractAddress
      ? [
          {
            address: contractAddress,
            abi: mosaicAbi,
            functionName: "BASE_PRICE",
          },
          {
            address: contractAddress,
            abi: mosaicAbi,
            functionName: "STEP",
          },
        ]
      : [],
    query: {
      enabled: Boolean(contractAddress),
    },
  });

  const basePrice = (priceConfigs?.[0]?.result as bigint) ?? BASE_PRICE_DEFAULT;
  const stepPrice = (priceConfigs?.[1]?.result as bigint) ?? STEP_DEFAULT;

  const clientRef = useRef(publicClient);
  useEffect(() => {
    clientRef.current = publicClient;
  }, [publicClient]);

  // Initial Wall Load (4 parallel pages via fetchWall)
  useEffect(() => {
    let active = true;
    if (!contractAddress || !clientRef.current) {
      setLoadingWall(false);
      return;
    }

    setLoadingWall(true);
    fetchWall(clientRef.current as any, contractAddress)
      .then((cells) => {
        if (!active) return;
        setWall(cells);
        setLoadingWall(false);
      })
      .catch((err) => {
        console.error("Failed to load wall:", err);
        if (!active) return;
        // Fill placeholder empty cells on error
        const empty: Cell[] = Array.from({ length: CELLS }, (_, id) => ({
          id,
          owner: "0x0000000000000000000000000000000000000000",
          color: 0,
          sales: 0,
        }));
        setWall(empty);
        setLoadingWall(false);
      });

    return () => {
      active = false;
    };
  }, [contractAddress]);

  // Parse shareable query coordinate `?c=x,y` on load
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) {
      const parts = c.split(",");
      if (parts.length === 2) {
        const x = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);
        if (!isNaN(x) && !isNaN(y) && x >= 0 && x < 32 && y >= 0 && y < 32) {
          const id = xyToId(x, y);
          setSelectedId(id);
        }
      }
    }
  }, [searchParams]);

  // Live event subscription via watchContractEvent (§4.2)
  useWatchContractEvent({
    address: contractAddress,
    abi: mosaicAbi,
    eventName: "CellClaimed",
    poll: true,
    pollingInterval: 4000,
    onLogs(logs) {
      for (const log of logs) {
        setWall((prev) => {
          const next = [...prev];
          applyLog(next, log as any);
          return next;
        });
      }
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: mosaicAbi,
    eventName: "CellPainted",
    poll: true,
    pollingInterval: 4000,
    onLogs(logs) {
      for (const log of logs) {
        setWall((prev) => {
          const next = [...prev];
          applyLog(next, log as any);
          return next;
        });
      }
    },
  });

  // Select cell handler
  const handleSelectCell = useCallback(
    (id: number) => {
      setSelectedId(id);
      const { x, y } = idToXY(id);
      router.replace(`/?c=${x},${y}`, { scroll: false });
    },
    [router]
  );

  // Toggle batch cell handler
  const handleToggleBatchCell = useCallback((id: number) => {
    setBatchIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      if (prev.length >= 16) {
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  // Share handler
  const handleShare = useCallback(() => {
    let url = typeof window !== "undefined" ? window.location.href : "";
    if (selectedId !== null) {
      const { x, y } = idToXY(selectedId);
      url = `${window.location.origin}/?c=${x},${y}`;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast("info", "Link copied", url);
    }
  }, [selectedId, toast]);

  // Optimistic log updater on transaction success
  const handleTxSuccess = useCallback((logs: any[]) => {
    setWall((prev) => {
      const next = [...prev];
      for (const log of logs) {
        applyLog(next, log);
      }
      return next;
    });
  }, []);

  const selectedCell = selectedId !== null && wall[selectedId] ? wall[selectedId] : null;

  return (
    <div className="relative w-full flex-1 flex flex-col items-center justify-center">
      {/* Floating Pending Pill at Top Center */}
      <div className="absolute top-0 z-30 pointer-events-auto">
        <PendingPill contractAddress={contractAddress} />
      </div>

      {/* Main Canvas + Floating HUD Container */}
      <div className="w-full flex-1 flex flex-col md:flex-row items-center justify-center gap-4 py-4 md:py-6">
        {/* Left Tool Strip */}
        <div className="z-20 md:self-center order-2 md:order-1">
          <ToolStrip
            mode={mode}
            onModeChange={setMode}
            showMyCells={showMyCells}
            onToggleMyCells={() => setShowMyCells(!showMyCells)}
            onShare={handleShare}
            onToggleAbout={() => setShowAbout(true)}
            batchCount={batchIds.length}
          />
        </div>

        {/* Center Canvas */}
        <div className="z-10 flex flex-col items-center justify-center order-1 md:order-2">
          <WallCanvas
            wall={wall}
            loading={loadingWall}
            selectedId={selectedId}
            onSelectCell={handleSelectCell}
            batchIds={batchIds}
            onToggleBatchCell={handleToggleBatchCell}
            isBatchMode={mode === "batch"}
            showMyCells={showMyCells}
            userAddress={userAddress}
          />
        </div>

        {/* Right Floating Cell Card (Desktop) / Bottom Sheet (Mobile) */}
        <div className="z-20 md:self-center order-3 w-full md:w-auto flex justify-center">
          <CellCard
            cell={selectedCell}
            basePrice={basePrice}
            stepPrice={stepPrice}
            contractAddress={contractAddress}
            isBatchMode={mode === "batch"}
            batchIds={batchIds}
            wall={wall}
            onClearBatch={() => setBatchIds([])}
            onTxSuccess={handleTxSuccess}
            onClose={() => {
              if (mode === "batch") {
                setBatchIds([]);
              } else {
                setSelectedId(null);
              }
            }}
          />
        </div>
      </div>

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
}

export default function Home() {
  return (
    <PageShell>
      <Suspense fallback={<div className="font-mono text-xs text-[var(--text-muted)] p-12">Loading Mosaic…</div>}>
        <WallView />
      </Suspense>
    </PageShell>
  );
}
