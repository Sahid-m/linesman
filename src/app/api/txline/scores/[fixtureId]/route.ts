import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { txlineFetch } from "@/lib/txline/client";
import { parseFixtureRouteInput } from "@/lib/txline/route-input";

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
      `/api/scores/snapshot/${fixtureId}`,
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Score request failed" },
      { status: 400 },
    );
  }
}
