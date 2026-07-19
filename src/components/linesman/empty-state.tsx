interface EmptyStateProps {
  lastScanAt: number;
  /** When the source is genuinely live (real TxLINE + mapped venue prices), the copy should own that instead of reading like the generic seeded-data placeholder. */
  isGenuinelyLive?: boolean;
  mappedMarkets?: number;
  /** Previous-fixture focus from Replay — explain empty odds honestly. */
  focusLabel?: string | null;
  detail?: string | null;
}

export function EmptyState({
  lastScanAt,
  isGenuinelyLive = false,
  mappedMarkets = 0,
  focusLabel = null,
  detail = null,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-14 text-center">
      <svg width="72" height="52" viewBox="0 0 72 52" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="70" height="50" rx="6" stroke="var(--color-accent)" strokeWidth="2" />
        <line x1="36" y1="1" x2="36" y2="51" stroke="var(--color-accent)" strokeWidth="2" />
        <circle cx="36" cy="26" r="6" stroke="var(--color-accent)" strokeWidth="2" />
        <path d="M1 26H30" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M42 26H71" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="4 4" />
      </svg>
      {focusLabel ? (
        <>
          <p className="font-display text-xl uppercase tracking-wide text-[color:var(--color-text)]">
            {focusLabel}
          </p>
          <p className="max-w-sm text-sm text-[color:var(--color-muted)]">
            {detail ||
              "Pinned from Replay. Finished fixtures often have TxLINE score history but no odds snapshot left — scrub packets on the Replay tab, or clear focus to return to live priced markets."}
          </p>
        </>
      ) : isGenuinelyLive ? (
        <>
          <p className="font-display text-xl uppercase tracking-wide text-[color:var(--color-text)]">
            The market is honest right now
          </p>
          <p className="max-w-xs text-sm text-[color:var(--color-muted)]">
            That&rsquo;s a real result, not a gap in coverage — {mappedMarkets} genuinely live TxLINE‑vs‑Polymarket
            {mappedMarkets === 1 ? " market" : " markets"} checked this tick, none mispriced past our threshold.
            We&rsquo;ll surface it the instant one moves.
          </p>
        </>
      ) : (
        <>
          <p className="font-display text-xl uppercase tracking-wide text-[color:var(--color-text)]">
            Markets are efficient right now
          </p>
          <p className="max-w-xs text-sm text-[color:var(--color-muted)]">
            We&rsquo;ll ping you the moment a sharp line and a venue price disagree by enough to matter.
          </p>
        </>
      )}
      <p className="text-xs text-[color:var(--color-muted)]">
        Last scan {new Date(lastScanAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
