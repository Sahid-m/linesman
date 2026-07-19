import { namesLooselyMatch, type TeamNames, type VenuePrice } from "./types";

const SXBET_ORIGIN = "https://api.sx.bet";
const FIFA_WORLD_CUP_LEAGUE_ID = 1715;
const MONEYLINE_TYPE = 1;
const PERCENTAGE_ODDS_SCALE = 1e20;

type SxBetMarket = {
  marketHash: string;
  outcomeOneName: string;
  teamOneName: string;
  teamTwoName: string;
  type: number;
  status: string;
};

type SxBetOrder = {
  marketHash: string;
  percentageOdds: string;
  orderStatus: string;
};

async function fetchActiveWorldCupMarkets(): Promise<SxBetMarket[]> {
  const response = await fetch(
    `${SXBET_ORIGIN}/markets/active?leagueId=${FIFA_WORLD_CUP_LEAGUE_ID}`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as {
    data?: { markets?: SxBetMarket[] };
  };
  return body.data?.markets ?? [];
}

function findMoneylineMarketHash(
  markets: SxBetMarket[],
  fixtureTeams: TeamNames,
  outcomeTeam: string,
): string | null {
  const match = markets.find(
    (market) =>
      market.type === MONEYLINE_TYPE &&
      market.status === "ACTIVE" &&
      namesLooselyMatch(market.outcomeOneName, outcomeTeam) &&
      ((namesLooselyMatch(market.teamOneName, fixtureTeams.home) &&
        namesLooselyMatch(market.teamTwoName, fixtureTeams.away)) ||
        (namesLooselyMatch(market.teamOneName, fixtureTeams.away) &&
          namesLooselyMatch(market.teamTwoName, fixtureTeams.home))),
  );
  return match?.marketHash ?? null;
}

/**
 * SX Bet has no single consensus price — only resting maker orders. The
 * average percentageOdds across active orders is used as a market-depth
 * proxy for "current implied probability," not a precise best-bid/ask.
 */
async function averageImpliedPct(marketHash: string): Promise<number | null> {
  const response = await fetch(
    `${SXBET_ORIGIN}/orders?marketHashes=${marketHash}`,
    { cache: "no-store" },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: SxBetOrder[] };
  const active = (body.data ?? []).filter(
    (order) => order.orderStatus === "ACTIVE",
  );
  if (active.length === 0) return null;

  const total = active.reduce(
    (sum, order) => sum + Number(order.percentageOdds) / PERCENTAGE_ODDS_SCALE,
    0,
  );
  return (total / active.length) * 100;
}

type MarketHashes = { homeHash: string | null; awayHash: string | null; drawHash: string | null };

// A fixture's moneyline market hashes don't change mid-match, only the
// resting orders on them do — cached separately so repeated polling
// checkpoints skip re-listing all active World Cup markets every time.
const hashCache = new Map<string, Promise<MarketHashes>>();

function findMarketHashes(teams: TeamNames): Promise<MarketHashes> {
  const cacheKey = `${teams.home}:${teams.away}`;
  const cached = hashCache.get(cacheKey);
  if (cached) return cached;
  const promise = fetchActiveWorldCupMarkets().then((markets) => ({
    homeHash: findMoneylineMarketHash(markets, teams, teams.home),
    awayHash: findMoneylineMarketHash(markets, teams, teams.away),
    drawHash: findMoneylineMarketHash(markets, teams, "Tie"),
  }));
  hashCache.set(cacheKey, promise);
  return promise;
}

export async function fetchSxBetPrice(
  teams: TeamNames,
): Promise<VenuePrice | null> {
  const { homeHash, awayHash, drawHash } = await findMarketHashes(teams);
  if (!homeHash && !awayHash) return null;

  const [homePct, awayPct, drawPct] = await Promise.all([
    homeHash ? averageImpliedPct(homeHash) : Promise.resolve(null),
    awayHash ? averageImpliedPct(awayHash) : Promise.resolve(null),
    drawHash ? averageImpliedPct(drawHash) : Promise.resolve(null),
  ]);
  if (homePct === null && awayPct === null) return null;

  return {
    venue: "sxbet",
    homeImpliedPct: homePct,
    awayImpliedPct: awayPct,
    drawImpliedPct: drawPct,
    observedAt: Date.now(),
    raw: { homeHash, awayHash, drawHash },
  };
}
