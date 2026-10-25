"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { footerLinks } from "@/lib/botchain/chain";
import { app } from "@/lib/app-config";

export interface NavItem {
  href: string;
  label: string;
}

export interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

export default function PageShell({ children }: PageShellProps) {
  const pathname = usePathname();
  const { site, explorer } = footerLinks();

  return (
    <div className="relative min-h-[100dvh] w-full bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col justify-between p-3 md:p-6 overflow-x-hidden">
      {/* Top Floating Controls */}
      <header className="w-full flex items-center justify-between z-20 pointer-events-none mb-3">
        <div className="flex items-baseline gap-3 pointer-events-auto">
          <Link
            href="/"
            className="flex items-center gap-2 group cursor-pointer focus:outline-none"
          >
            <span
              className="w-2.5 h-2.5 bg-[var(--accent)] inline-block flex-shrink-0"
              aria-hidden="true"
            />
            <span className="font-semibold text-lg tracking-tight text-[var(--text-primary)]">
              {app.name}
            </span>
          </Link>
          <span className="hidden sm:inline text-xs text-[var(--text-muted)] font-mono">
            32 × 32
          </span>
          <nav className="flex items-center gap-2 ml-4">
            <Link
              href="/"
              className={`text-xs px-2 py-0.5 border ${
                pathname === "/"
                  ? "border-[var(--text-primary)] font-medium text-[var(--text-primary)] bg-[var(--bg-surface)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              wall
            </Link>
            <Link
              href="/mine"
              className={`text-xs px-2 py-0.5 border ${
                pathname === "/mine"
                  ? "border-[var(--text-primary)] font-medium text-[var(--text-primary)] bg-[var(--bg-surface)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              my cells
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <NetworkBadge />
          <div className="w-[140px] md:w-[160px]">
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Canvas + HUD Area */}
      <main className="flex-1 w-full flex flex-col justify-center items-center z-10">
        {children}
      </main>

      {/* Attribution & Caption Line */}
      <footer className="w-full flex flex-col sm:flex-row items-center justify-between text-[11px] text-[var(--text-muted)] pt-3 gap-2 z-10">
        <p className="tracking-tight text-center sm:text-left">
          32 × 32. One colour per cell. A cell is yours until someone pays more.
        </p>

        <div className="flex items-center gap-3">
          <BuiltOnBotChain className="text-[10px] uppercase tracking-wider" />
          <span>·</span>
          <a
            href={site}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--text-primary)] underline decoration-[var(--border-subtle)]"
          >
            botchain.ai
          </a>
          <span>·</span>
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--text-primary)] underline decoration-[var(--border-subtle)]"
          >
            explorer
          </a>
        </div>
      </footer>
    </div>
  );
}
