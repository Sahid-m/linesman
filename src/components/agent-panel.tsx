"use client";

import { useEffect, useState } from "react";
import { useNetwork } from "@/components/app-providers";

type VenueObservation = {
  id: string;
  venue: string;
  bookmaker: string | null;
  homeImpliedPct: string | null;
  awayImpliedPct: string | null;
  drawImpliedPct: string | null;
  observedAt: string;
  reactionMs: number | null;
};

type AgentPosition = {
  id: string;
  fixtureId: number;
  mode: "live" | "replay";
  eventSeq: number;
  eventAction: string;
  side: "home" | "away";
  counterpartyVenue: string;
  size: string;
  entryFairValue: string;
  memoTxSignature: string | null;
  rationale: string | null;
  status: "open" | "graded";
  settledFairValue: string | null;
  pnl: string | null;
  createdAt: string;
  venueObservations: VenueObservation[];
};

function explorerTxUrl(signature: string, network: "devnet" | "mainnet"): string {
  const cluster = network === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

function pct(value: string | null): string {
  if (value === null) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function venuePct(value: string | null): string {
  if (value === null) return "—";
  return `${Number(value).toFixed(1)}%`;
}

function reactionLabel(ms: number | null): string {
  if (ms === null) return "no move";
  if (ms === 0) return "instant";
  return `${(ms / 1000).toFixed(1)}s`;
}

function PositionCard({
  position,
  network,
}: {
  position: AgentPosition;
  network: "devnet" | "mainnet";
}) {
  const [expanded, setExpanded] = useState(false);
  const pnl = position.pnl === null ? null : Number(position.pnl);

  return (
    <article className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[color:color-mix(in_srgb,var(--color-accent)_14%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-accent)]">
          {position.eventAction}
        </span>
        <strong className="text-sm text-[color:var(--color-text)]">
          {position.side} · seq {position.eventSeq}
        </strong>
        <span
          className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            color:
              position.status === "graded" ? "var(--color-accent)" : "var(--color-muted)",
            background:
              position.status === "graded"
                ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
                : "color-mix(in srgb, var(--color-muted) 14%, transparent)",
          }}
        >
          {position.status}
        </span>
      </div>

      <p className="mt-2 text-sm text-[color:var(--color-muted)]">
        Against <strong className="text-[color:var(--color-text)]">{position.counterpartyVenue}</strong>{" "}
        at {pct(position.entryFairValue)} implied · {position.mode}
      </p>

      {position.rationale && (
        <p className="mt-2 text-sm italic text-[color:var(--color-muted)]">
          “{position.rationale}”
        </p>
      )}

      {pnl !== null && (
        <p
          className="mt-2 font-mono text-sm font-semibold"
          style={{ color: pnl >= 0 ? "var(--color-accent)" : "var(--color-alert)" }}
        >
          {pnl >= 0 ? "+" : ""}
          {pnl.toFixed(2)} (settled {pct(position.settledFairValue)})
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {position.memoTxSignature && (
          <a
            href={explorerTxUrl(position.memoTxSignature, network)}
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--color-accent)] underline-offset-2 hover:underline"
          >
            On-chain memo ↗
          </a>
        )}
        {position.venueObservations.length > 0 && (
          <button
            type="button"
            className="text-[color:var(--color-accent)]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "Show"} {position.venueObservations.length} venue
            {position.venueObservations.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs text-[color:var(--color-muted)]">
            <thead>
              <tr>
                <th className="border-b border-[color:var(--color-border)] py-2 pr-3 font-semibold">
                  Venue
                </th>
                <th className="border-b border-[color:var(--color-border)] py-2 pr-3 font-semibold">
                  Home
                </th>
                <th className="border-b border-[color:var(--color-border)] py-2 pr-3 font-semibold">
                  Away
                </th>
                <th className="border-b border-[color:var(--color-border)] py-2 pr-3 font-semibold">
                  Draw
                </th>
                <th className="border-b border-[color:var(--color-border)] py-2 font-semibold">
                  Reaction
                </th>
              </tr>
            </thead>
            <tbody>
              {position.venueObservations.map((observation) => (
                <tr key={observation.id}>
                  <td className="border-b border-[color:var(--color-border)] py-2 pr-3 text-[color:var(--color-text)]">
                    {observation.bookmaker ?? observation.venue}
                  </td>
                  <td className="border-b border-[color:var(--color-border)] py-2 pr-3">
                    {venuePct(observation.homeImpliedPct)}
                  </td>
                  <td className="border-b border-[color:var(--color-border)] py-2 pr-3">
                    {venuePct(observation.awayImpliedPct)}
                  </td>
                  <td className="border-b border-[color:var(--color-border)] py-2 pr-3">
                    {venuePct(observation.drawImpliedPct)}
                  </td>
                  <td className="border-b border-[color:var(--color-border)] py-2">
                    {reactionLabel(observation.reactionMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function AgentPanel({ fixtureId }: { fixtureId?: number }) {
  const { network } = useNetwork();
  const [positions, setPositions] = useState<AgentPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ network });
    if (fixtureId) params.set("fixtureId", String(fixtureId));

    fetch(`/api/agent/positions?${params}`)
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
        } else {
          setPositions(body.positions);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });

    return () => {
      cancelled = true;
    };
  }, [network, fixtureId]);

  if (error) {
    return (
      <p className="text-sm text-[color:var(--color-muted)]">
        Couldn’t load agent activity: {error}
      </p>
    );
  }
  if (!positions) {
    return <p className="text-sm text-[color:var(--color-muted)]">Loading agent activity…</p>;
  }
  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 text-sm text-[color:var(--color-muted)]">
        No decisions on this network yet. Set your risk appetite in{" "}
        <a href="/agent/settings" className="text-[color:var(--color-accent)] underline-offset-2 hover:underline">
          agent settings
        </a>{" "}
        and GroundTruth will trade the next detected event on your behalf.
      </div>
    );
  }

  const graded = positions.filter((p) => p.status === "graded" && p.pnl !== null);
  const totalPnl = graded.reduce((sum, p) => sum + Number(p.pnl), 0);
  const wins = graded.filter((p) => Number(p.pnl) > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Decisions", value: String(positions.length) },
          { label: "Hit rate", value: graded.length ? `${wins}/${graded.length}` : "—" },
          {
            label: "P&L",
            value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}`,
            tone: totalPnl >= 0 ? "var(--color-accent)" : "var(--color-alert)",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
              {stat.label}
            </p>
            <p
              className="mt-1 font-mono text-xl font-semibold text-[color:var(--color-text)]"
              style={stat.tone ? { color: stat.tone } : undefined}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        {positions.map((position) => (
          <PositionCard key={position.id} position={position} network={network} />
        ))}
      </div>
    </div>
  );
}
