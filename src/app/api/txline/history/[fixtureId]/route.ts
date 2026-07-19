import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { txlineFetch } from "@/lib/txline/client";
import { parseFixtureRouteInput } from "@/lib/txline/route-input";
import { parseSseDataLines } from "@/lib/txline/sse";
import { normalizeScoreEvent } from "@/lib/txline/types";

export async function GET(
  request: Request,
  context: { params: Promise<{ fixtureId: string }> },
) {
  try {
    const session = await requireSession();
    const params = await context.params;
    const { network, fixtureId } = parseFixtureRouteInput(
      new URL(request.url).searchParams.get("network"),
      params.fixtureId,
    );
    const upstream = await txlineFetch(
      session.userId,
      network,
      `/api/scores/historical/${fixtureId}`,
    );
    const text = await upstream.text();
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `History request failed (${upstream.status})`,
          detail: text.slice(0, 300),
        },
        { status: upstream.status },
      );
    }
    // TxLINE often returns an empty body when the fixture is outside the
    // 2-week to 6-hour historical window.
    if (!text.trim()) {
      return NextResponse.json([]);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      // Historical endpoint returns SSE-framed lines ("data: {...}" per record).
      const sseRecords = parseSseDataLines(text);
      if (sseRecords.length === 0) {
        throw new Error("History response was not valid JSON");
      }
      raw = sseRecords;
    }
    const records = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && "scores" in raw
        ? (raw as { scores: unknown }).scores
        : [];
    if (!Array.isArray(records)) throw new Error("Invalid history response");
    const normalized = [];
    for (const record of records) {
      try {
        normalized.push(normalizeScoreEvent(record, "history"));
      } catch {
        // Skip malformed rows rather than failing the whole replay panel.
      }
    }
    normalized.sort((a, b) => a.timestamp - b.timestamp);
    return NextResponse.json(normalized);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "History request failed" },
      { status: 400 },
    );
  }
}
