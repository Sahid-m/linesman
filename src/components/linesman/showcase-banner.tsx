"use client";

import { useState } from "react";
import useSWR from "swr";
import type { SourceStatus } from "@/lib/sources/manager";
import { useVenueSimStore } from "@/lib/store/venue-sim-store";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatClock(atMs: number, kickoffMs: number): string {
  const minute = Math.max(0, Math.round((atMs - kickoffMs) / 60_000));
  return `'${minute} · ${new Date(atMs).toISOString().slice(11, 16)} UTC`;
}

export function ShowcaseBanner() {
  const [dismissed, setDismissed] = useState(false);
  const atMs = useVenueSimStore((state) => state.atMs);
  const kickoffMs = useVenueSimStore((state) => state.kickoffMs);
  const label = useVenueSimStore((state) => state.label);
  const playing = useVenueSimStore((state) => state.playing);
  const speed = useVenueSimStore((state) => state.speed);
  const { data } = useSWR<{ status: SourceStatus }>(
    atMs != null ? `/api/status?atMs=${atMs}` : "/api/status",
    fetcher,
    { refreshInterval: playing ? 0 : 15_000 },
  );
  const status = data?.status;

  if (dismissed) return null;

  const simActive = label && atMs != null && kickoffMs != null;
  if (!simActive && (!status || status.mode === "live")) return null;

  const isReplay = simActive || status?.mode === "replay";
  const message = simActive
    ? `${playing ? "▶" : "❙❙"} Simulating 1m PM+Kalshi — ${label} · ${formatClock(atMs, kickoffMs)} · ${speed}×`
    : status?.detail?.startsWith("Simulating")
      ? `▶ ${status.detail}`
      : status?.mode === "replay"
        ? "▶ Replaying a pinned previous fixture"
        : status?.liveTxlineConnected
          ? "▶ TxLINE connected — waiting for a venue book to match"
          : "▶ Showcase mode — seeded demo data. Use Connect wallet for live odds.";

  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-1.5 text-xs"
      style={{
        background: isReplay ? "color-mix(in srgb, var(--color-amber) 12%, var(--color-surface))" : "var(--color-surface)",
        color: isReplay ? "var(--color-amber)" : "var(--color-muted)",
      }}
    >
      <span className="truncate">{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="-m-2.5 shrink-0 rounded-full p-2.5 opacity-70 transition-opacity hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
