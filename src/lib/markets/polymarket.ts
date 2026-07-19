import { namesLooselyMatch, type TeamNames, type VenuePrice } from "./types";

const GAMMA_ORIGIN = "https://gamma-api.polymarket.com";
const CLOB_ORIGIN = "https://clob.polymarket.com";

type GammaMarket = {
  id: string;
  question: string;
  outcomes: string;
  clobTokenIds: string;
  closed: boolean;
};

type GammaEvent = {
  id: string;
  title: string;
  markets?: GammaMarket[];
};

function parseJsonArrayField(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** The "Yes" outcome token from a market's ["Yes", "No"] outcome pair. */
function yesTokenId(market: GammaMarket): string | null {
  const outcomes = parseJsonArrayField(market.outcomes);
  const tokenIds = parseJsonArrayField(market.clobTokenIds);
  const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === "yes");
  return yesIndex === -1 ? null : (tokenIds[yesIndex] ?? null);
}

export type PolymarketMoneylineMarket = {
  homeTokenId: string;
  awayTokenId: string;
  drawTokenId: string | null;
};

// A finished fixture's market/token IDs and full price history never change
// mid-process, so the decision engine's repeated polling checkpoints reuse
// one fetch instead of re-searching/re-fetching on every check.
const marketCache = new Map<string, Promise<PolymarketMoneylineMarket | null>>();
const historyCache = new Map<string, Promise<PricePoint[]>>();

/**
 * Polymarket has no per-fixture ID that lines up with TxLINE's, so matches
 * are located by searching team names. World Cup matches are three separate
 * binary "Will X win?" / "Will it end in a draw?" markets (each ["Yes",
 * "No"]), not one combined two-outcome market, so matching is done by
 * question text rather than by outcome labels. A finished fixture's markets
 * are "closed" but their price history remains queryable, so historical
 * mode does not filter them out.
 */
export function findPolymarketMoneylineMarket(
  teams: TeamNames,
  mode: "live" | "historical" = "live",
): Promise<PolymarketMoneylineMarket | null> {
  const cacheKey = `${mode}:${teams.home}:${teams.away}`;
  const cached = marketCache.get(cacheKey);
  if (cached) return cached;
  const promise = findPolymarketMoneylineMarketUncached(teams, mode);
  marketCache.set(cacheKey, promise);
  return promise;
}

async function findPolymarketMoneylineMarketUncached(
  teams: TeamNames,
  mode: "live" | "historical",
): Promise<PolymarketMoneylineMarket | null> {
  const search = new URLSearchParams({
    q: `${teams.home} ${teams.away}`,
    limit_per_type: "10",
  });
  const response = await fetch(`${GAMMA_ORIGIN}/public-search?${search}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { events?: GammaEvent[] };
  const events = body.events ?? [];

  for (const event of events) {
    const markets = (event.markets ?? []).filter(
      (market) => mode === "historical" || !market.closed,
    );
    const isWinMarket = (market: GammaMarket, team: string) =>
      /\bwin\b/i.test(market.question) &&
      namesLooselyMatch(market.question, team);
    const isDrawMarket = (market: GammaMarket) =>
      /\bdraw\b/i.test(market.question);

    const homeMarket = markets.find((m) => isWinMarket(m, teams.home));
    const awayMarket = markets.find((m) => isWinMarket(m, teams.away));
    if (!homeMarket || !awayMarket) continue;

    const homeTokenId = yesTokenId(homeMarket);
    const awayTokenId = yesTokenId(awayMarket);
    if (!homeTokenId || !awayTokenId) continue;

    const drawMarket = markets.find(isDrawMarket);
    const drawTokenId = drawMarket ? yesTokenId(drawMarket) : null;
    return { homeTokenId, awayTokenId, drawTokenId };
  }
  return null;
}

async function midpointPrice(tokenId: string): Promise<number | null> {
  const response = await fetch(
    `${CLOB_ORIGIN}/midpoint?token_id=${encodeURIComponent(tokenId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { mid?: string | number };
  const mid = Number(body.mid);
  return Number.isFinite(mid) ? mid : null;
}

export async function fetchPolymarketPrice(
  teams: TeamNames,
): Promise<VenuePrice | null> {
  const market = await findPolymarketMoneylineMarket(teams, "live");
  if (!market) return null;

  const [homePrice, awayPrice, drawPrice] = await Promise.all([
    midpointPrice(market.homeTokenId),
    midpointPrice(market.awayTokenId),
    market.drawTokenId ? midpointPrice(market.drawTokenId) : null,
  ]);
  if (homePrice === null && awayPrice === null) return null;

  return {
    venue: "polymarket",
    homeImpliedPct: homePrice === null ? null : homePrice * 100,
    awayImpliedPct: awayPrice === null ? null : awayPrice * 100,
    drawImpliedPct: drawPrice === null ? null : drawPrice * 100,
    observedAt: Date.now(),
    raw: { market },
  };
}

export type PricePoint = { t: number; p: number };

function fetchPriceHistory(tokenId: string): Promise<PricePoint[]> {
  const cached = historyCache.get(tokenId);
  if (cached) return cached;
  const promise = fetchPriceHistoryUncached(tokenId);
  historyCache.set(tokenId, promise);
  return promise;
}

async function fetchPriceHistoryUncached(tokenId: string): Promise<PricePoint[]> {
  const response = await fetch(
    `${CLOB_ORIGIN}/prices-history?market=${encodeURIComponent(tokenId)}&interval=max&fidelity=1`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { history?: PricePoint[] };
  return body.history ?? [];
}

/** Last known price at or before `timestampMs`; series is assumed ascending by `t`. */
export function priceAtOrBefore(
  series: PricePoint[],
  timestampMs: number,
): number | null {
  const targetSeconds = timestampMs / 1000;
  let result: number | null = null;
  for (const point of series) {
    if (point.t > targetSeconds) break;
    result = point.p;
  }
  return result;
}

/**
 * Fetches both outcome tokens' full historical price series for a finished
 * fixture (queryable even after the market has resolved) and returns the
 * price as of `timestampMs` for each side, for replaying past events.
 */
export async function fetchPolymarketHistoricalPrice(
  teams: TeamNames,
  timestampMs: number,
): Promise<VenuePrice | null> {
  const market = await findPolymarketMoneylineMarket(teams, "historical");
  if (!market) return null;

  const [homeSeries, awaySeries, drawSeries] = await Promise.all([
    fetchPriceHistory(market.homeTokenId),
    fetchPriceHistory(market.awayTokenId),
    market.drawTokenId ? fetchPriceHistory(market.drawTokenId) : Promise.resolve([]),
  ]);
  const homePrice = priceAtOrBefore(homeSeries, timestampMs);
  const awayPrice = priceAtOrBefore(awaySeries, timestampMs);
  const drawPrice = priceAtOrBefore(drawSeries, timestampMs);
  if (homePrice === null && awayPrice === null) return null;

  return {
    venue: "polymarket",
    homeImpliedPct: homePrice === null ? null : homePrice * 100,
    awayImpliedPct: awayPrice === null ? null : awayPrice * 100,
    drawImpliedPct: drawPrice === null ? null : drawPrice * 100,
    observedAt: timestampMs,
    raw: { market },
  };
}
