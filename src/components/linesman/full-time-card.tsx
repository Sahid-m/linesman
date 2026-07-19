"use client";

import Link from "next/link";
import { useVenueSimStore } from "@/lib/store/venue-sim-store";

function parseScore(finalScore: string | undefined): [string, string] | null {
  if (!finalScore) return null;
  const match = finalScore.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!match) return null;
  return [match[1], match[2]];
}

/**
 * Shown on the Feed when a replayed match has reached full-time. The books
 * have settled to the result, so we present the outcome instead of the huge
 * (resolved) price gaps that would otherwise read as live mispricing.
 */
export function FullTimeCard({ variant = "feed" }: { variant?: "feed" | "watchdog" }) {
  const label = useVenueSimStore((state) => state.label);
  const home = useVenueSimStore((state) => state.home);
  const away = useVenueSimStore((state) => state.away);
  const finalScore = useVenueSimStore((state) => state.finalScore);
  const score = parseScore(finalScore);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-10 text-center">
      <span className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
        Full time
      </span>

      {score ? (
        <div className="flex items-center justify-center gap-4">
          <span className="max-w-[8rem] text-right text-sm font-semibold text-[color:var(--color-text)] sm:text-base">
            {home}
          </span>
          <span className="font-display text-4xl text-[color:var(--color-text)] sm:text-5xl">
            {score[0]}<span className="mx-2 text-[color:var(--color-muted)]">–</span>{score[1]}
          </span>
          <span className="max-w-[8rem] text-left text-sm font-semibold text-[color:var(--color-text)] sm:text-base">
            {away}
          </span>
        </div>
      ) : (
        <p className="font-display text-2xl text-[color:var(--color-text)]">{label ?? "Match complete"}</p>
      )}

      <p className="max-w-md text-sm leading-relaxed text-[color:var(--color-muted)]">
        The match is over and the venue books have settled to the result — so
        there are no live edges to trade here anymore.
        {variant === "feed"
          ? " Head to the Watchdog to see which venues settled correctly."
          : ""}
      </p>

      {variant === "feed" && (
        <Link
          href="/watchdog"
          className="rounded-xl px-4 py-2 text-sm font-semibold"
          style={{ color: "var(--color-bg)", background: "var(--color-accent)" }}
        >
          Open Watchdog
        </Link>
      )}
    </div>
  );
}
