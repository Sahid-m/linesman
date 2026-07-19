/**
 * Autonomous GroundTruth agent loop. Run with:
 *   NODE_OPTIONS='--conditions=react-server' pnpm agent:run -- --fixtureId=18172260 --mode=replay --speed=180
 *
 * Once started this makes every decision itself — ingest, detect, trade,
 * log the on-chain memo, and grade at full-time — with no further input.
 */
import { getDb } from "@/db/client";
import type { Network } from "@/lib/network/config";
import {
  fetchHistoricalScoreEvents,
  replayAtSpeed,
  streamLiveScoreEvents,
} from "@/lib/agent/ingest";
import { detectGroundTruthEvent } from "@/lib/agent/detector";
import { processGroundTruthEvent, type FixtureContext } from "@/lib/agent/decision";
import { gradeFixturePositions } from "@/lib/agent/grading";
import { WORLD_CUP_SCHEDULE } from "@/lib/txline/worldcup-schedule";
import { isFinalScoreRecord } from "@/lib/txline/types";

function parseArgs(): {
  fixtureId: number;
  network: Network;
  mode: "live" | "replay";
  speed: number;
} {
  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    }),
  );
  return {
    fixtureId: Number(args.get("fixtureId") ?? 18172260),
    network: (args.get("network") as Network) ?? "devnet",
    mode: (args.get("mode") as "live" | "replay") ?? "replay",
    speed: Number(args.get("speed") ?? 180),
  };
}

async function findActivatedUserId(network: Network): Promise<string> {
  const db = getDb();
  const credential = await db.query.txlineCredentials.findFirst({
    where: (row, { and, eq }) =>
      and(eq(row.network, network), eq(row.setupState, "activated")),
  });
  if (!credential) {
    throw new Error(
      `No activated ${network} TxLINE credential found — complete setup in the app first.`,
    );
  }
  return credential.userId;
}

function log(message: string, data?: unknown): void {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] ${message}`, data ?? "");
}

async function main(): Promise<void> {
  const { fixtureId, network, mode, speed } = parseArgs();
  const scheduled = WORLD_CUP_SCHEDULE.find((fixture) => fixture.id === fixtureId);
  if (!scheduled) throw new Error(`Fixture ${fixtureId} not in the known World Cup schedule`);

  const ctx: FixtureContext = {
    network,
    fixtureId,
    mode,
    teams: { home: scheduled.home, away: scheduled.away },
  };
  const userId = await findActivatedUserId(network);

  log(`Starting GroundTruth agent`, {
    fixtureId,
    teams: `${scheduled.home} vs ${scheduled.away}`,
    network,
    mode,
    ...(mode === "replay" ? { speed } : {}),
  });

  const events =
    mode === "replay"
      ? replayAtSpeed(await fetchHistoricalScoreEvents(userId, network, fixtureId), speed)
      : streamLiveScoreEvents(userId, network, fixtureId);

  let processed = 0;
  let detected = 0;
  let graded = false;

  for await (const event of events) {
    processed += 1;
    const groundTruth = detectGroundTruthEvent(event.payload);
    if (groundTruth && event.seq !== undefined) {
      detected += 1;
      log(`Ground-truth event detected`, {
        action: groundTruth.action,
        side: groundTruth.side,
        score: groundTruth.score,
        seq: event.seq,
      });
      try {
        await processGroundTruthEvent(ctx, groundTruth, event.seq, event.timestamp);
        log(`Decision recorded for seq ${event.seq}`);
      } catch (error) {
        log(`Decision failed for seq ${event.seq}`, error instanceof Error ? error.message : error);
      }
    }

    if (isFinalScoreRecord(event.payload) && event.seq !== undefined && !graded) {
      graded = true;
      log(`Full-time reached — grading all open positions`, { seq: event.seq });
      try {
        const count = await gradeFixturePositions(userId, network, fixtureId, event.seq);
        log(`Graded ${count} position(s) against the on-chain final score`);
      } catch (error) {
        log(`Grading failed`, error instanceof Error ? error.message : error);
      }
      if (mode === "replay") break;
    }
  }

  log(`Agent run complete`, { eventsProcessed: processed, eventsDetected: detected, graded });
}

main().catch((error) => {
  console.error("Agent run failed:", error);
  process.exitCode = 1;
});
