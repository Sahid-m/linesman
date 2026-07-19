"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { Edge } from "@/lib/types";
import { formatCents, formatLiquidity, formatPct } from "@/lib/format";
import { TeamCrest } from "@/components/linesman/team-crest";
import { ConfidenceDots } from "@/components/linesman/confidence-dots";
import { GapSparkline } from "@/components/linesman/gap-sparkline";
import { OdometerNumber } from "@/components/linesman/odometer-number";
import { ShareButton } from "@/components/linesman/share-button";

const VENUE_LABEL: Record<Edge["venue"]["venue"], string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
};

function accentTeamColor(edge: Edge): string {
  const { sharp } = edge;
  if (sharp.selectionLabel.startsWith(sharp.homeTeam.name)) return sharp.homeTeam.primaryColor;
  if (sharp.selectionLabel.startsWith(sharp.awayTeam.name)) return sharp.awayTeam.primaryColor;
  return sharp.homeTeam.primaryColor;
}

export function EdgeCard({ edge, isNew = false }: { edge: Edge; isNew?: boolean }) {
  const { sharp, venue } = edge;
  const positive = edge.direction === "underpriced";
  const detailId = encodeURIComponent(edge.outcomeId);
  const atMs = edge.sharp.packetTimestamp;
  const href = `/market/${detailId}?atMs=${atMs}`;

  return (
    <motion.div
      layout
      layoutId={`${edge.outcomeId}:${venue.venue}`}
      initial={isNew ? { opacity: 0, y: -24 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={`ln-edge-card relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] ${isNew ? "ln-pulse" : ""}`}
      style={{ borderLeft: `3px solid ${accentTeamColor(edge)}` }}
    >
      <Link href={href} className="block p-4 active:scale-[0.98]" style={{ transition: "transform 120ms ease" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TeamCrest team={sharp.homeTeam} size="sm" />
            <span className="text-xs font-semibold text-[color:var(--color-muted)]">vs</span>
            <TeamCrest team={sharp.awayTeam} size="sm" />
            <span className="ml-1 text-xs text-[color:var(--color-muted)]">
              {sharp.homeTeam.code} · {sharp.awayTeam.code}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {sharp.isLive && (
              <span className="flex items-center gap-1 rounded-full bg-[color:var(--color-alert)]/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--color-alert)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-alert)]" />
                Live
              </span>
            )}
            <ShareButton
              compact
              title="Linesman edge"
              text={`${sharp.selectionLabel} — ${edge.evPct > 0 ? "+" : ""}${edge.evPct.toFixed(0)}% EV vs ${VENUE_LABEL[venue.venue]}`}
              ogPath={`/api/og/edge/${encodeURIComponent(`${edge.outcomeId}::${venue.venue}`)}`}
            />
          </div>
        </div>

        <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug text-[color:var(--color-text)] lg:text-lg">
          {sharp.selectionLabel}
        </h3>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">
              {VENUE_LABEL[venue.venue]}
            </span>
            <span className="font-display text-xl leading-none text-[color:var(--color-text)]">
              {formatCents(venue.yesPrice)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">Sharp fair</span>
            <span className="font-display text-xl leading-none text-[color:var(--color-text)]">
              {formatPct(sharp.fairProb * 100)}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">
              {positive ? "Underpriced" : "Overpriced"}
            </span>
            <span style={{ color: positive ? "var(--color-accent)" : "var(--color-alert)" }}>
              <OdometerNumber
                value={edge.evPct}
                digits={0}
                prefix={edge.evPct > 0 ? "+" : ""}
                suffix="% EV"
                className="font-display text-[34px] leading-none tabular-nums"
              />
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <ConfidenceDots confidence={edge.confidence} />
          <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
            {formatLiquidity(venue.liquidityUsd)} liquidity
          </span>
        </div>

        <div className="mt-3">
          <GapSparkline history={edge.gapHistory} positive={positive} />
        </div>
      </Link>
    </motion.div>
  );
}
