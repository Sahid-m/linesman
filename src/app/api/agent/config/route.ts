import { NextResponse } from "next/server";
import { z } from "zod";

import { getAgentConfig, saveAgentConfig } from "@/lib/agent/config";
import { assertSameOrigin, requireSession } from "@/lib/auth/session";

const networkSchema = z.enum(["devnet", "mainnet"]).default("devnet");

const bodySchema = z.object({
  network: z.enum(["devnet", "mainnet"]).default("devnet"),
  riskLevel: z.enum(["conservative", "balanced", "aggressive"]),
  maxStakePerTrade: z.coerce.number().positive().max(100_000),
  minEdgePct: z.coerce.number().min(0).max(50),
  autoTrade: z.boolean(),
  notes: z.string().max(500).nullish(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const network = networkSchema.parse(url.searchParams.get("network") ?? undefined);
    const config = await getAgentConfig(network);
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load agent config" },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireSession();
    const input = bodySchema.parse(await request.json());
    const config = await saveAgentConfig({
      network: input.network,
      riskLevel: input.riskLevel,
      maxStakePerTrade: input.maxStakePerTrade,
      minEdgePct: input.minEdgePct,
      autoTrade: input.autoTrade,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    });
    return NextResponse.json({ config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save agent config";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
