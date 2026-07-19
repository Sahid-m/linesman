import type { ReactNode } from "react";
import Link from "next/link";
import { ReplayBug } from "@/components/linesman/replay-bug";
import { ViewportFrame } from "@/components/linesman/viewport-frame";

export default function MarketLayout({ children }: { children: ReactNode }) {
  return (
    <div className="linesman min-h-screen">
      <ReplayBug />
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]/95 px-4 py-3 backdrop-blur lg:px-8">
        <Link
          href="/feed"
          aria-label="Back to feed"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[color:var(--color-text)] transition-transform active:scale-90"
        >
          ←
        </Link>
        <span className="font-display text-sm tracking-wide text-[color:var(--color-muted)]">MARKET DETAIL</span>
      </header>
      <main className="mx-auto max-w-[480px] px-4 pb-32 pt-4 md:max-w-2xl lg:max-w-3xl lg:px-8 lg:pb-10 lg:pt-8">
        <ViewportFrame>{children}</ViewportFrame>
      </main>
    </div>
  );
}
