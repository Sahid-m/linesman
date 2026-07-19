import type { VenuePrice } from "@/lib/markets/types";

export type VenueReaction = {
  snapshot: VenuePrice;
  reactionMs: number | null;
};

function impliedPctForSide(
  price: VenuePrice,
  side: "home" | "away",
): number | null {
  return side === "home" ? price.homeImpliedPct : price.awayImpliedPct;
}

/**
 * The counterparty is whichever venue is *cheapest* for the backed side —
 * not merely whichever hasn't moved yet. A venue can fail to "react" past
 * the threshold while still being priced higher than a venue that did
 * react (different priors going in), and trading against it wouldn't be a
 * genuine arbitrage, just a correct directional bet with no price edge.
 * Fair value is the priciest (most bullish) venue among the rest — the
 * best available read on where the market has already converged. Requires
 * at least two venues with a real price gap; reactionMs is kept for
 * display only, not selection.
 */
export function pickCounterpartyAndFairValue(
  reactions: VenueReaction[],
  side: "home" | "away",
): { counterparty: VenueReaction; fairValueSource: VenueReaction } | null {
  const priced = reactions
    .map((reaction) => ({
      reaction,
      pct: impliedPctForSide(reaction.snapshot, side),
    }))
    .filter((entry): entry is { reaction: VenueReaction; pct: number } => entry.pct !== null)
    .sort((a, b) => a.pct - b.pct);

  if (priced.length < 2) return null;

  const cheapest = priced[0];
  const priciest = priced[priced.length - 1];
  if (cheapest.pct >= priciest.pct) return null;

  return { counterparty: cheapest.reaction, fairValueSource: priciest.reaction };
}
