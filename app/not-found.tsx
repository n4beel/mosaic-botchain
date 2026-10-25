import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";

export default function NotFound() {
  return (
    <PageShell>
      <div className="max-w-md mx-auto py-16">
        <Panel className="text-center py-12 space-y-4">
          <div className="text-4xl">404</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Cell Not Found
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-mono">
            The page or canvas coordinate you requested does not exist.
          </p>
          <div className="pt-4">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90 transition-opacity"
            >
              ← Back to canvas
            </Link>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
