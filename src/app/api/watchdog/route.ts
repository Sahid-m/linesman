import { NextResponse } from "next/server";
import { scheduleFixtureLabel } from "@/lib/engine/schedule-audits";
import { getFixtureLabel } from "@/lib/sources/mock";
import { getSourceClosedMarkets, getSourceEdges } from "@/lib/sources/manager";
import { computeAudits, sortAudits, summarizeAudits } from "@/lib/engine/watchdog";

export async function GET(request: Request) {
  const rawAt = new URL(request.url).searchParams.get("atMs");
  const atMs = rawAt != null ? Number(rawAt) : undefined;
  const atOpts = typeof atMs === "number" && Number.isFinite(atMs) ? { atMs } : undefined;

  const [{ records, status }, edgesBundle] = await Promise.all([
    getSourceClosedMarkets(),
    atOpts ? getSourceEdges(atOpts) : Promise.resolve(null),
  ]);

  const audits = sortAudits(computeAudits(records)).map((audit) => ({
    ...audit,
    fixtureLabel: scheduleFixtureLabel(audit.fixtureId) ?? getFixtureLabel(audit.fixtureId),
  }));
  const summary = summarizeAudits(audits);

  // While simulating, prefer the live edge status clock so Watchdog header moves with Feed.
  const mergedStatus = edgesBundle
    ? {
        ...status,
        detail: edgesBundle.status.detail,
        lastPacketAt: edgesBundle.status.lastPacketAt,
        focusFixture: edgesBundle.status.focusFixture ?? status.focusFixture,
        mode: edgesBundle.status.mode,
      }
    : status;

  return NextResponse.json({
    audits,
    summary,
    status: mergedStatus,
    edges: edgesBundle?.edges ?? [],
    generatedAt: Date.now(),
  });
}
