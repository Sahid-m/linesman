import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db/client";

const querySchema = z.object({
  network: z.enum(["devnet", "mainnet"]).default("devnet"),
  fixtureId: z.coerce.number().int().positive().optional(),
});

/**
 * Public read of the agent's recorded decisions — no TxLINE session
 * required; reads what the standalone agent process already wrote.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = querySchema.parse({
      network: url.searchParams.get("network") ?? undefined,
      fixtureId: url.searchParams.get("fixtureId") ?? undefined,
    });

    const db = getDb();
    const positions = await db.query.agentPositions.findMany({
      where: (position, { and, eq }) =>
        input.fixtureId === undefined
          ? eq(position.network, input.network)
          : and(eq(position.network, input.network), eq(position.fixtureId, input.fixtureId)),
      orderBy: (position, { desc }) => [desc(position.createdAt)],
      with: { venueObservations: true },
    });

    return NextResponse.json({ positions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load agent positions" },
      { status: 400 },
    );
  }
}
