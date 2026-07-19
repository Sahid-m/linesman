"use client";

import { PreviousTxlinePanel } from "@/components/linesman/previous-txline-panel";

export default function ReplayPage() {
  return (
    <div className="flex flex-col gap-5 pt-1">
      <div>
        <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Replay</p>
        <h1 className="font-display text-3xl leading-[0.95] text-[color:var(--color-text)] lg:text-5xl">
          Re-run a real match
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--color-muted)] lg:text-base">
          Pick a fixture, press play, and the whole app follows that match clock — Edge Feed and
          Watchdog reprice minute by minute against the real Polymarket and Kalshi books from that day.
        </p>
      </div>

      <PreviousTxlinePanel />
    </div>
  );
}
