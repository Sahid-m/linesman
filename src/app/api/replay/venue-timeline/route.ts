import { NextResponse } from "next/server";

import { getVenueReplayTimeline } from "@/lib/sources/historical-semis";
import { isShowcaseSemiFixture } from "@/lib/sources/showcase-ids";

/** Minute axis for venue-candle simulation of a known semi. */
export async function GET(request: Request) {
  const fixtureId = Number(new URL(request.url).searchParams.get("fixtureId"));
  if (!Number.isFinite(fixtureId) || !isShowcaseSemiFixture(fixtureId)) {
    return NextResponse.json({ error: "Unknown venue-replay fixture" }, { status: 400 });
  }
  const timeline = await getVenueReplayTimeline(fixtureId);
  if (!timeline) {
    return NextResponse.json({ error: "Could not load 1m candle timeline" }, { status: 502 });
  }
  return NextResponse.json(timeline);
}
