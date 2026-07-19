import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { clearLiveIdentityCache, getSourceEdges, getSourceSharpLines } from "@/lib/sources/manager";

/**
 * Dev helper: force-refresh live identity and return sharp lines + edges for
 * the current cookie session. Not for production clients.
 */
export async function POST() {
  try {
    await requireSession();
    clearLiveIdentityCache();
    const [{ lines, status: lineStatus }, { edges, status }] = await Promise.all([
      getSourceSharpLines(),
      getSourceEdges(),
    ]);
    return NextResponse.json({
      lineStatus,
      status,
      lineCount: lines.length,
      edgeCount: edges.length,
      sampleLines: lines.slice(0, 6).map((line) => ({
        outcomeId: line.outcomeId,
        competition: line.competition,
        selection: line.selectionLabel,
        fairProb: line.fairProb,
      })),
      sampleEdges: edges.slice(0, 6).map((edge) => ({
        outcomeId: edge.outcomeId,
        venue: edge.venue.venue,
        evPct: edge.evPct,
        question: edge.venue.question,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "probe failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 },
    );
  }
}
