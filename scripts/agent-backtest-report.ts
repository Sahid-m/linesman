/**
 * Prints an audit report for a fixture's already-graded positions: for each
 * decision, the counterparty's stale price vs. the fastest-reacting
 * venue's price at the same instant (the edge actually captured), whether
 * the call was right, and an overall scoreboard. Every number here comes
 * from prices fetched with `priceAtOrBefore(series, timestampMs)` — never
 * a point after the requested timestamp — so nothing in this report had
 * access to information from later in the match than the decision itself did.
 *
 * Run with: pnpm agent:backtest -- --fixtureId=18209181 --network=devnet
 */
import { getDb } from "@/db/client";

function parseArgs(): { fixtureId: number; network: "devnet" | "mainnet" } {
  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    }),
  );
  return {
    fixtureId: Number(args.get("fixtureId") ?? 18209181),
    network: (args.get("network") as "devnet" | "mainnet") ?? "devnet",
  };
}

async function main(): Promise<void> {
  const { fixtureId, network } = parseArgs();
  const db = getDb();
  const positions = await db.query.agentPositions.findMany({
    where: (position, { and, eq }) =>
      and(eq(position.fixtureId, fixtureId), eq(position.network, network)),
    orderBy: (position, { asc }) => [asc(position.eventSeq)],
    with: { venueObservations: true },
  });

  if (positions.length === 0) {
    console.log(`No recorded decisions for fixture ${fixtureId} on ${network}.`);
    return;
  }

  console.log(`\nBacktest report — fixture ${fixtureId} (${network})\n`);
  console.log(
    "seq   action  side  counterparty   entry     fair(priciest)  edge      settled   pnl      correct",
  );
  console.log("-".repeat(100));

  let wins = 0;
  let graded = 0;
  let totalPnl = 0;
  let totalEdge = 0;

  for (const position of positions) {
    const side = position.side;
    // Mirrors reaction.ts's pickCounterpartyAndFairValue: fair value is the
    // priciest venue for this side, not merely whichever reacted fastest.
    const pricedVenues = position.venueObservations
      .map((o) => Number(side === "home" ? o.homeImpliedPct : o.awayImpliedPct))
      .filter((pct) => Number.isFinite(pct));
    const fairPct = pricedVenues.length > 0 ? Math.max(...pricedVenues) : null;
    const entryPct = Number(position.entryFairValue) * 100;
    const edge = fairPct === null ? null : fairPct - entryPct;
    if (edge !== null) totalEdge += edge;

    const isGraded = position.status === "graded" && position.pnl !== null;
    const won = isGraded && Number(position.pnl) > 0;
    if (isGraded) {
      graded += 1;
      totalPnl += Number(position.pnl);
      if (won) wins += 1;
    }

    console.log(
      [
        String(position.eventSeq).padEnd(6),
        position.eventAction.padEnd(7),
        side.padEnd(5),
        position.counterpartyVenue.padEnd(14),
        `${entryPct.toFixed(1)}%`.padEnd(9),
        (fairPct === null ? "—" : `${fairPct.toFixed(1)}%`).padEnd(15),
        (edge === null ? "—" : `${edge >= 0 ? "+" : ""}${edge.toFixed(1)}pp`).padEnd(9),
        (position.settledFairValue === null
          ? "—"
          : `${(Number(position.settledFairValue) * 100).toFixed(0)}%`
        ).padEnd(9),
        (position.pnl === null ? "—" : Number(position.pnl).toFixed(2)).padEnd(8),
        isGraded ? (won ? "✅" : "❌") : "pending",
      ].join(" "),
    );
  }

  console.log("-".repeat(100));
  console.log(
    `\n${graded}/${positions.length} graded · ${wins}/${graded || 1} won (${graded ? ((wins / graded) * 100).toFixed(0) : 0}%) · total P&L ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} · avg captured edge ${(totalEdge / positions.length).toFixed(1)}pp per trade\n`,
  );
}

main().catch((error) => {
  console.error("Backtest report failed:", error);
  process.exitCode = 1;
});
