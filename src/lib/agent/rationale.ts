import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { VenueReaction } from "./reaction";

const DEFAULT_MODEL = "openai/gpt-oss-20b:free";

export type RationaleInput = {
  fixtureLabel: string;
  eventAction: string;
  side: "home" | "away";
  counterpartyVenue: string;
  entryFairValue: number;
  reactions: VenueReaction[];
};

/**
 * Best-effort natural-language explanation of an already-decided trade —
 * decorative context for the dashboard/demo, never the thing that decides
 * the trade. Returns null on any failure (missing key, rate limit, etc.)
 * so a flaky free-tier model never blocks the deterministic trade path.
 */
export async function generateTradeRationale(
  input: RationaleInput,
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const openrouter = createOpenRouter({ apiKey });
    const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
    const venueLines = input.reactions
      .map((r) => {
        const pct = r.snapshot.homeImpliedPct ?? r.snapshot.awayImpliedPct;
        const reaction =
          r.reactionMs === null ? "never reacted" : `reacted in ${r.reactionMs}ms`;
        return `- ${r.snapshot.venue}: ${pct?.toFixed(1) ?? "?"}% implied, ${reaction}`;
      })
      .join("\n");

    const { text } = await generateText({
      model: openrouter.chat(model),
      prompt: `A trading agent just detected a ${input.eventAction} favoring the ${input.side} side in ${input.fixtureLabel}. It traded against ${input.counterpartyVenue} (entry implied probability ${(input.entryFairValue * 100).toFixed(1)}%) because that venue was slowest to reprice. Venue observations:\n${venueLines}\n\nWrite a one-sentence, plain-English explanation of this trade for a dashboard. No hedging, no disclaimers, just the reasoning.`,
    });
    return text.trim() || null;
  } catch (error) {
    console.error("Rationale generation failed", error);
    return null;
  }
}
