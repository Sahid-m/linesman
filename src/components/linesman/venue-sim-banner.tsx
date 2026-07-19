"use client";

import Link from "next/link";
import { selectIsFullTime, useVenueSimStore } from "@/lib/store/venue-sim-store";

function formatClock(atMs: number, kickoffMs: number): string {
  const minute = Math.max(0, Math.round((atMs - kickoffMs) / 60_000));
  return `${minute}' · ${new Date(atMs).toISOString().slice(11, 16)} UTC`;
}

/** Visible on every tab while a venue candle sim is armed. */
export function VenueSimBanner() {
  const fixtureId = useVenueSimStore((state) => state.fixtureId);
  const label = useVenueSimStore((state) => state.label);
  const atMs = useVenueSimStore((state) => state.atMs);
  const kickoffMs = useVenueSimStore((state) => state.kickoffMs);
  const playing = useVenueSimStore((state) => state.playing);
  const speed = useVenueSimStore((state) => state.speed);
  const minuteIndex = useVenueSimStore((state) => state.minuteIndex);
  const minutes = useVenueSimStore((state) => state.minutes);
  const finalScore = useVenueSimStore((state) => state.finalScore);
  const togglePlaying = useVenueSimStore((state) => state.togglePlaying);
  const clear = useVenueSimStore((state) => state.clear);
  const isFullTime = useVenueSimStore(selectIsFullTime);

  if (fixtureId == null || atMs == null || kickoffMs == null || !label) return null;

  const accent = isFullTime ? "var(--color-muted)" : "var(--color-accent)";

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 35%, var(--color-border))`,
        background: `color-mix(in srgb, ${accent} 12%, var(--color-surface))`,
        color: "var(--color-text)",
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {isFullTime
            ? `● Full time · ${label}${finalScore ? ` · ${finalScore}` : ""}`
            : `${playing ? "▶" : "❙❙"} ${label} · ${formatClock(atMs, kickoffMs)} · ${speed}×`}
        </p>
        <p className="text-[11px] text-[color:var(--color-muted)]">
          {isFullTime
            ? "Books have settled — see the Watchdog for the settlement audit"
            : `${minuteIndex + 1}/${minutes.length} min · Edge Feed + Watchdog follow this clock`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!isFullTime && (
          <button
            type="button"
            onClick={() => togglePlaying()}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
            style={{ color: "var(--color-bg)", background: "var(--color-accent)" }}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
        <Link
          href="/replay"
          className="rounded-lg border border-[color:var(--color-border)] px-2.5 py-1.5 text-[11px] font-semibold"
        >
          {isFullTime ? "Replay" : "Scrub"}
        </Link>
        <button
          type="button"
          onClick={() => {
            clear();
            void fetch("/api/focus", { method: "DELETE" });
          }}
          className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--color-muted)]"
        >
          {isFullTime ? "Clear" : "Stop"}
        </button>
      </div>
    </div>
  );
}
