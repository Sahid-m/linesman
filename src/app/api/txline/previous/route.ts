import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { txlineFetch } from "@/lib/txline/client";
import {
  fixturesFrom,
  isHistoricalReplayEligible,
  replayWindowStartEpochDay,
} from "@/lib/txline/fixtures";
import type { PreviousFixture } from "@/lib/txline/previous";
import {
  WORLD_CUP_SCHEDULE,
  scheduledFixtureToSummary,
} from "@/lib/txline/worldcup-schedule";

const networkSchema = z.enum(["devnet", "mainnet"]);

/**
 * Lists fixtures you can pull previous TxLINE score history for
 * (started between 2 weeks and 6 hours ago).
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const network = networkSchema.parse(
      new URL(request.url).searchParams.get("network") ?? "devnet",
    );

    const startEpochDay = replayWindowStartEpochDay();
    let snapshotFixtures: ReturnType<typeof fixturesFrom> = [];
    try {
      const upstream = await txlineFetch(
        session.userId,
        network,
        `/api/fixtures/snapshot?startEpochDay=${startEpochDay}`,
      );
      if (upstream.ok) {
        snapshotFixtures = fixturesFrom(await upstream.json());
      }
    } catch {
      // Schedule-only fallback below.
    }

    const byId = new Map<number, PreviousFixture>();

    for (const scheduled of WORLD_CUP_SCHEDULE) {
      const eligible = isHistoricalReplayEligible(scheduled.startTime);
      // Still list recent knockout/finals even if slightly outside window —
      // user can try load; empty history is handled in the UI.
      const recentEnough = Date.now() - scheduled.startTime < 21 * 24 * 60 * 60 * 1_000;
      if (!eligible && !recentEnough) continue;
      const summary = scheduledFixtureToSummary(scheduled);
      byId.set(scheduled.id, {
        id: scheduled.id,
        label: `${scheduled.home} vs ${scheduled.away}`,
        competition: summary.competition,
        startTime: scheduled.startTime,
        finalScore: scheduled.finalScore,
        inReplayWindow: eligible,
        source: "schedule",
      });
    }

    for (const fixture of snapshotFixtures) {
      if (fixture.startTime === null) continue;
      if (!isHistoricalReplayEligible(fixture.startTime) && !byId.has(fixture.id)) continue;
      const existing = byId.get(fixture.id);
      const [matchup] = fixture.label.split(" · ");
      byId.set(fixture.id, {
        id: fixture.id,
        label: matchup || fixture.label,
        competition: fixture.competition,
        startTime: fixture.startTime,
        finalScore:
          existing?.finalScore ??
          (typeof fixture.raw.FinalScore === "string" ? fixture.raw.FinalScore : undefined),
        inReplayWindow: isHistoricalReplayEligible(fixture.startTime),
        source: existing ? existing.source : "snapshot",
      });
    }

    const fixtures = [...byId.values()].sort(
      (a, b) => (b.startTime ?? 0) - (a.startTime ?? 0),
    );

    return NextResponse.json({
      fixtures,
      network,
      windowNote:
        "TxLINE historical scores are available for fixtures that kicked off between 2 weeks and 6 hours ago.",
      generatedAt: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not list previous fixtures";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 },
    );
  }
}
