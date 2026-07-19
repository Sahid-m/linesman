import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { agentPositions, agentVenueObservations } from "@/db/schema";
import type { Network } from "@/lib/network/config";
import { fetchKalshiHistoricalPrice, fetchKalshiPrice } from "@/lib/markets/kalshi";
import {
  fetchPolymarketHistoricalPrice,
  fetchPolymarketPrice,
} from "@/lib/markets/polymarket";
import { fetchSxBetPrice } from "@/lib/markets/sxbet";
import type { TeamNames, VenuePrice } from "@/lib/markets/types";
import { getAgentConfig } from "./config";
import type { GroundTruthEvent } from "./detector";
import { logDecisionMemo } from "./memo";
import { generateTradeRationale } from "./rationale";
import { pickCounterpartyAndFairValue, type VenueReaction } from "./reaction";

const REACTION_THRESHOLD_PCT = 1.5;
const REACTION_WINDOW_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 30_000;

export type FixtureContext = {
  network: Network;
  fixtureId: number;
  mode: "live" | "replay";
  teams: TeamNames;
};

/**
 * Live mode reads whatever's currently quoted across all three venues;
 * replay mode can only read Polymarket and Kalshi, since they're the two
 * with a public historical price archive (SX Bet and TxOdds per-bookmaker
 * prices are live-only here).
 */
async function gatherVenueSnapshots(
  ctx: FixtureContext,
  atTimestampMs: number,
): Promise<VenuePrice[]> {
  if (ctx.mode === "replay") {
    const [poly, kalshi] = await Promise.all([
      fetchPolymarketHistoricalPrice(ctx.teams, atTimestampMs).catch(() => null),
      fetchKalshiHistoricalPrice(ctx.teams, atTimestampMs).catch(() => null),
    ]);
    return [poly, kalshi].filter((price): price is VenuePrice => price !== null);
  }
  const [poly, sx, kalshi] = await Promise.all([
    fetchPolymarketPrice(ctx.teams).catch(() => null),
    fetchSxBetPrice(ctx.teams).catch(() => null),
    fetchKalshiPrice(ctx.teams).catch(() => null),
  ]);
  return [poly, sx, kalshi].filter((price): price is VenuePrice => price !== null);
}

function impliedPctForSide(
  price: VenuePrice,
  side: "home" | "away",
): number | null {
  return side === "home" ? price.homeImpliedPct : price.awayImpliedPct;
}

/**
 * Polls (virtual timestamps in replay mode, real wall-clock time live)
 * until every venue seen "before" the event has either moved by more than
 * REACTION_THRESHOLD_PCT or the window elapses, recording each venue's own
 * reaction time independently.
 */
async function measureReactions(
  ctx: FixtureContext,
  side: "home" | "away",
  beforeSnapshots: VenuePrice[],
  eventTimestampMs: number,
): Promise<VenueReaction[]> {
  const before = new Map(beforeSnapshots.map((s) => [s.venue, s]));
  const resolved = new Map<string, VenueReaction>();
  const deadline = eventTimestampMs + REACTION_WINDOW_MS;

  for (
    let checkpoint = eventTimestampMs;
    checkpoint <= deadline && resolved.size < before.size;
    checkpoint += POLL_INTERVAL_MS
  ) {
    const atTimestamp = ctx.mode === "replay" ? checkpoint : Date.now();
    const current = await gatherVenueSnapshots(ctx, atTimestamp);
    for (const snapshot of current) {
      if (resolved.has(snapshot.venue)) continue;
      const beforeSnapshot = before.get(snapshot.venue);
      const beforePct = beforeSnapshot
        ? impliedPctForSide(beforeSnapshot, side)
        : null;
      const nowPct = impliedPctForSide(snapshot, side);
      if (
        beforePct !== null &&
        nowPct !== null &&
        Math.abs(nowPct - beforePct) >= REACTION_THRESHOLD_PCT
      ) {
        resolved.set(snapshot.venue, {
          snapshot,
          reactionMs: atTimestamp - eventTimestampMs,
        });
      }
    }
    if (ctx.mode === "live" && resolved.size < before.size) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  for (const [venueName, snapshot] of before) {
    if (!resolved.has(venueName)) {
      resolved.set(venueName, { snapshot, reactionMs: null });
    }
  }
  return [...resolved.values()];
}

function toNumericString(value: number | null): string | null {
  return value === null ? null : value.toFixed(4);
}

/**
 * Runs the full decide-and-record loop for one detected event: gathers
 * every venue's price just before the event, waits to see who reacts,
 * trades against the stalest venue at the fastest reactor's fair
 * value, and persists both the position and every venue's observation
 * (idempotent against re-processing the same event/side twice).
 */
export async function processGroundTruthEvent(
  ctx: FixtureContext,
  event: GroundTruthEvent,
  eventSeq: number,
  eventTimestampMs: number,
): Promise<void> {
  if (!event.side) return;

  // Bot settings gate the whole loop: if auto-trade is off the agent is
  // paused, and every decision honours the configured stake + min edge.
  const config = await getAgentConfig(ctx.network);
  if (!config.autoTrade) return;

  const beforeSnapshots = await gatherVenueSnapshots(
    ctx,
    eventTimestampMs - 60_000,
  );
  if (beforeSnapshots.length === 0) return;

  const reactions = await measureReactions(
    ctx,
    event.side,
    beforeSnapshots,
    eventTimestampMs,
  );
  const decision = pickCounterpartyAndFairValue(reactions, event.side);
  if (!decision) return;

  const entryPct = impliedPctForSide(
    decision.counterparty.snapshot,
    event.side,
  );
  const fairPct = impliedPctForSide(decision.fairValueSource.snapshot, event.side);
  if (entryPct === null || fairPct === null) return;

  // Only act when the cross-venue gap clears the configured risk threshold.
  const edgePct = fairPct - entryPct;
  if (edgePct < config.minEdgePct) return;

  const db = getDb();
  const [position] = await db
    .insert(agentPositions)
    .values({
      network: ctx.network,
      fixtureId: ctx.fixtureId,
      mode: ctx.mode,
      eventSeq,
      eventAction: event.action,
      side: event.side,
      counterpartyVenue: decision.counterparty.snapshot.venue,
      size: config.maxStakePerTrade.toFixed(4),
      entryFairValue: (entryPct / 100).toFixed(4),
    })
    .onConflictDoNothing({
      target: [
        agentPositions.fixtureId,
        agentPositions.eventSeq,
        agentPositions.side,
      ],
    })
    .returning();
  if (!position) return;

  await db.insert(agentVenueObservations).values(
    reactions.map((reaction) => ({
      positionId: position.id,
      venue: reaction.snapshot.venue,
      bookmaker: reaction.snapshot.bookmaker ?? null,
      homeImpliedPct: toNumericString(reaction.snapshot.homeImpliedPct),
      awayImpliedPct: toNumericString(reaction.snapshot.awayImpliedPct),
      drawImpliedPct: toNumericString(reaction.snapshot.drawImpliedPct),
      observedAt: new Date(reaction.snapshot.observedAt),
      reactionMs: reaction.reactionMs,
    })),
  );

  // Best-effort: an unfunded/unavailable devnet signer shouldn't lose the
  // trade itself, only the on-chain audit-trail receipt for it.
  try {
    const memoTxSignature = await logDecisionMemo(ctx.network, {
      fixtureId: ctx.fixtureId,
      eventSeq,
      eventAction: event.action,
      side: event.side,
      counterpartyVenue: decision.counterparty.snapshot.venue,
      entryFairValue: entryPct / 100,
      timestamp: eventTimestampMs,
    });
    await db
      .update(agentPositions)
      .set({ memoTxSignature })
      .where(eq(agentPositions.id, position.id));
  } catch (error) {
    console.error("Memo logging failed for position", position.id, error);
  }

  const rationale = await generateTradeRationale({
    fixtureLabel: `${ctx.teams.home} vs ${ctx.teams.away}`,
    eventAction: event.action,
    side: event.side,
    counterpartyVenue: decision.counterparty.snapshot.venue,
    entryFairValue: entryPct / 100,
    reactions,
  });
  if (rationale) {
    await db
      .update(agentPositions)
      .set({ rationale })
      .where(eq(agentPositions.id, position.id));
  }
}
