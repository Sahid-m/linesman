import { describe, expect, it } from "vitest";
import { pickCounterpartyAndFairValue, type VenueReaction } from "./reaction";

function venue(
  name: string,
  homeImpliedPct: number,
  reactionMs: number | null,
): VenueReaction {
  return {
    snapshot: {
      venue: name as never,
      homeImpliedPct,
      awayImpliedPct: 100 - homeImpliedPct,
      drawImpliedPct: null,
      observedAt: 0,
      raw: {},
    },
    reactionMs,
  };
}

describe("pickCounterpartyAndFairValue", () => {
  it("trades against the cheapest venue, marked to the priciest venue's price", () => {
    const result = pickCounterpartyAndFairValue(
      [venue("polymarket", 55, 8_000), venue("sxbet", 30, null)],
      "home",
    );
    expect(result?.counterparty.snapshot.venue).toBe("sxbet");
    expect(result?.fairValueSource.snapshot.venue).toBe("polymarket");
  });

  it("ignores reaction timing when picking — price gap is what matters", () => {
    // sxbet reacted fastest but is still the more expensive (less favorable) entry.
    const result = pickCounterpartyAndFairValue(
      [venue("polymarket", 30, null), venue("sxbet", 55, 1_000)],
      "home",
    );
    expect(result?.counterparty.snapshot.venue).toBe("polymarket");
    expect(result?.fairValueSource.snapshot.venue).toBe("sxbet");
  });

  it("returns null with fewer than two priced venues", () => {
    expect(pickCounterpartyAndFairValue([], "home")).toBeNull();
    expect(pickCounterpartyAndFairValue([venue("polymarket", 55, null)], "home")).toBeNull();
  });

  it("returns null when there's no real price gap", () => {
    const result = pickCounterpartyAndFairValue(
      [venue("polymarket", 55, null), venue("sxbet", 55, null)],
      "home",
    );
    expect(result).toBeNull();
  });

  it("returns null when a venue has no price for the requested side", () => {
    const noAwayPrice: VenueReaction = {
      snapshot: {
        venue: "polymarket",
        homeImpliedPct: 55,
        awayImpliedPct: null,
        drawImpliedPct: null,
        observedAt: 0,
        raw: {},
      },
      reactionMs: null,
    };
    expect(
      pickCounterpartyAndFairValue([noAwayPrice, venue("sxbet", 40, null)], "away"),
    ).toBeNull();
  });
});
