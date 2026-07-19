"use client";

import useSWR from "swr";
import { LayoutGroup } from "framer-motion";
import type { Edge, SettlementAudit } from "@/lib/types";
import type { SourceStatus } from "@/lib/sources/manager";
import type { WatchdogSummary } from "@/lib/engine/watchdog";
import { AuditRow } from "@/components/linesman/audit-row";
import { CountUp } from "@/components/linesman/count-up";
import { EdgeCard } from "@/components/linesman/edge-card";
import { DisagreementDial } from "@/components/linesman/disagreement-dial";
import { computeDisagreementIndex } from "@/lib/engine/disagreement";
import { useVenueSimStore } from "@/lib/store/venue-sim-store";
import { useMemo } from "react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type AuditWithLabel = SettlementAudit & { fixtureLabel?: string };

export default function WatchdogPage() {
  const atMs = useVenueSimStore((state) => state.atMs);
  const simLabel = useVenueSimStore((state) => state.label);
  const playing = useVenueSimStore((state) => state.playing);
  const hydrated = useVenueSimStore((state) => state.hydrated);
  const clearSim = useVenueSimStore((state) => state.clear);

  const key =
    !hydrated ? null : atMs != null ? `/api/watchdog?atMs=${atMs}` : "/api/watchdog";
  const { data, isLoading, mutate } = useSWR<{
    audits: AuditWithLabel[];
    summary: WatchdogSummary;
    status?: SourceStatus;
    edges?: Edge[];
    generatedAt: number;
  }>(key, fetcher, {
    refreshInterval: playing ? 0 : atMs != null ? 2_000 : 30_000,
    keepPreviousData: true,
  });

  const summary = data?.summary;
  const status = data?.status;
  const audits = data?.audits ?? [];
  const edges = data?.edges ?? [];
  const disagreement = useMemo(() => computeDisagreementIndex(edges), [edges]);
  const isSeeded = status?.mode === "mock" || (status?.mode === "replay" && atMs == null);

  async function clearFocus() {
    clearSim();
    await fetch("/api/focus", { method: "DELETE" });
    void mutate();
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div>
        <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Settlement Watchdog</p>
        <h1 className="font-display text-3xl leading-[0.95] text-[color:var(--color-text)] lg:text-5xl">
          {simLabel ? `${simLabel}` : "Did the market get it right?"}
        </h1>
        {status?.detail && (
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--color-muted)]">{status.detail}</p>
        )}
      </div>

      {(status?.focusFixture || atMs != null) && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm"
          style={{
            borderColor: "color-mix(in srgb, var(--color-accent) 40%, var(--color-border))",
            background: "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))",
          }}
        >
          <span>
            {playing ? "Live replay — venue gaps update each minute" : `Filtered to ${simLabel ?? status?.focusFixture?.label}`}
          </span>
          <button
            type="button"
            onClick={() => void clearFocus()}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ color: "var(--color-bg)", background: "var(--color-accent)" }}
          >
            Show all
          </button>
        </div>
      )}

      {edges.length > 0 && (
        <div className="flex flex-col gap-3">
          <DisagreementDial score={disagreement} />
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
            Live venue gaps at this minute
          </p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {edges.map((edge) => (
              <EdgeCard
                key={`${edge.outcomeId}:${edge.venue.venue}:${edge.sharp.packetTimestamp}`}
                edge={edge}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 lg:p-6">
        {summary ? (
          <p className="text-sm leading-relaxed text-[color:var(--color-text)] lg:text-base">
            <span className="font-display text-2xl lg:text-3xl" style={{ color: "var(--color-text)" }}>
              <CountUp value={summary.total} />
            </span>{" "}
            markets audited ·{" "}
            <span className="font-semibold" style={{ color: "var(--color-accent)" }}>
              <CountUp value={summary.correct} /> ✅
            </span>{" "}
            ·{" "}
            <span className="font-semibold" style={{ color: "var(--color-amber)" }}>
              <CountUp value={summary.late} /> late
            </span>{" "}
            ·{" "}
            <span className="font-semibold" style={{ color: "var(--color-alert)" }}>
              <CountUp value={summary.incorrect} /> ⚠️ incorrect
            </span>
            {isSeeded && (
              <span className="mt-2 block text-xs text-[color:var(--color-muted)]">
                Settlement tape is final-state; live gaps above move with the Replay clock.
              </span>
            )}
          </p>
        ) : (
          <div className="h-6 w-full animate-pulse rounded bg-[color:var(--color-border)]" />
        )}
      </div>

      {isLoading && audits.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <div
              key={key}
              className="h-[74px] animate-pulse rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
            />
          ))}
        </div>
      ) : audits.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-12 text-center">
          <p className="font-display text-xl text-[color:var(--color-text)]">No settlement audits yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--color-muted)]">
            {status?.liveTxlineConnected
              ? "We only list finished fixtures that match a Polymarket/Kalshi book. Pick a previous fixture on Replay, or wait for more closed markets."
              : "Connect a wallet and activate TxLINE to audit real venue settlements against proven scores."}
          </p>
        </div>
      ) : (
        <LayoutGroup>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {audits.map((audit) => (
              <AuditRow key={`${audit.venue}:${audit.venueMarketId}`} audit={audit} />
            ))}
          </div>
        </LayoutGroup>
      )}
    </div>
  );
}
