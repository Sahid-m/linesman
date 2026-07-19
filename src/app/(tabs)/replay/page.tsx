"use client";

import { PreviousTxlinePanel } from "@/components/linesman/previous-txline-panel";
import { useReplayStore } from "@/lib/store/replay-store";

export default function ReplayPage() {
  const { isReplayMode, setReplayMode, setPlaying } = useReplayStore();

  return (
    <div className="flex flex-col gap-5 pt-1">
      <div>
        <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Replay</p>
        <h1 className="font-display text-3xl leading-[0.95] text-[color:var(--color-text)] lg:text-5xl">
          Previous TxLINE fixtures
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--color-muted)] lg:text-base">
          Select a semi with “1m venue replay”, set 10× or 15×, hit ▶ — then switch to Edge Feed or Watchdog.
          The match clock keeps running app-wide and every screen samples that minute.
        </p>
      </div>

      <PreviousTxlinePanel />

      <label className="flex items-center justify-between rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
        <div>
          <p className="text-sm font-semibold text-[color:var(--color-text)]">Replay badge</p>
          <p className="text-xs text-[color:var(--color-muted)]">
            Shows the “Replay ●” pill in the header. Does not change Feed data.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isReplayMode}
          onClick={() => {
            const next = !isReplayMode;
            setReplayMode(next);
            if (!next) setPlaying(false);
          }}
          className="relative h-7 w-12 rounded-full transition-colors"
          style={{ background: isReplayMode ? "var(--color-accent)" : "var(--color-border)" }}
        >
          <span
            className="absolute top-1 h-5 w-5 rounded-full bg-[color:var(--color-bg)] transition-transform"
            style={{ transform: isReplayMode ? "translateX(26px)" : "translateX(4px)" }}
          />
        </button>
      </label>
    </div>
  );
}
