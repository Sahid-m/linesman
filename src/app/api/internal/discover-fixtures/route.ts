import { NextResponse } from "next/server";
import { z } from "zod";
import { getLiveSharpLines, LiveTxlineUnavailableError } from "@/lib/sources/txline";

/**
 * Internal tick endpoint for `pnpm discover-markets` (scripts/discover-markets.ts).
 * Same reason as `/api/internal/record`: TxLINE credential access is
 * `server-only` and can't be imported from a bare Node/tsx process.
 */

const bodySchema = z.object({
  userId: z.string().uuid(),
  network: z.enum(["devnet", "mainnet"]).default("devnet"),
});

function assertSecret(request: Request): void {
  const expected = process.env.RECORDER_SECRET;
  if (!expected) throw new Error("RECORDER_SECRET is not configured on the server");
  if (request.headers.get("x-recorder-secret") !== expected) {
    throw new Error("Invalid recorder secret");
  }
}

export async function POST(request: Request) {
  try {
    assertSecret(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }

  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed discover request" }, { status: 400 });
  }

  try {
    const lines = await getLiveSharpLines(input.userId, input.network);
    const byFixture = new Map<string, typeof lines>();
    for (const line of lines) {
      const list = byFixture.get(line.fixtureId) ?? [];
      list.push(line);
      byFixture.set(line.fixtureId, list);
    }
    const fixtures = Array.from(byFixture.entries()).map(([fixtureId, fixtureLines]) => ({
      fixtureId,
      competition: fixtureLines[0].competition,
      homeTeam: fixtureLines[0].homeTeam.name,
      awayTeam: fixtureLines[0].awayTeam.name,
      kickoffTime: fixtureLines[0].kickoffTime,
      isLive: fixtureLines[0].isLive,
      selections: fixtureLines.map((line) => ({
        outcomeId: line.outcomeId,
        selection: line.outcomeId.split(":").slice(2).join(":"),
        label: line.selectionLabel,
        decimalOdds: line.decimalOdds,
        impliedProb: line.impliedProb,
      })),
    }));
    return NextResponse.json({ fixtures });
  } catch (error) {
    if (error instanceof LiveTxlineUnavailableError) {
      return NextResponse.json({ fixtures: [], reason: error.message });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Discovery failed" }, { status: 500 });
  }
}
