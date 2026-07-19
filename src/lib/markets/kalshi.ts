import { namesLooselyMatch, type TeamNames, type VenuePrice } from "./types";

const KALSHI_ORIGIN = "https://external-api.kalshi.com/trade-api/v2";
const MONEYLINE_SERIES = "KXWCGAME";

type KalshiMarket = {
  ticker: string;
  event_ticker: string;
  yes_sub_title: string;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  last_price_dollars: string;
  expected_expiration_time: string;
};

export type KalshiMoneylineMarket = {
  homeTicker: string;
  awayTicker: string;
  tieTicker: string | null;
};

const MAX_PAGES = 5;

/**
 * Event sub_titles use 3-letter codes ("ESP vs ARG"), not full team names,
 * so matching is done on each market's own yes_sub_title ("Reg Time:
 * Spain") instead — every moneyline market across the whole series is
 * paged through and grouped by event_ticker.
 */
async function fetchAllMoneylineMarkets(): Promise<KalshiMarket[]> {
  const markets: KalshiMarket[] = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ series_ticker: MONEYLINE_SERIES, limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${KALSHI_ORIGIN}/markets?${params}`, { cache: "no-store" });
    if (!response.ok) break;
    const body = (await response.json()) as { markets?: KalshiMarket[]; cursor?: string };
    markets.push(...(body.markets ?? []));
    if (!body.cursor) break;
    cursor = body.cursor;
  }
  return markets;
}

const marketCache = new Map<string, Promise<KalshiMoneylineMarket | null>>();

async function findMoneylineMarket(
  teams: TeamNames,
): Promise<KalshiMoneylineMarket | null> {
  const cacheKey = `${teams.home}:${teams.away}`;
  const cached = marketCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const allMarkets = await fetchAllMoneylineMarkets();
    const byEvent = new Map<string, KalshiMarket[]>();
    for (const market of allMarkets) {
      const group = byEvent.get(market.event_ticker) ?? [];
      group.push(market);
      byEvent.set(market.event_ticker, group);
    }
    // A team can appear in many events across the tournament, so both sides
    // must match within the *same* event group, not just anywhere in the list.
    for (const eventMarkets of byEvent.values()) {
      const homeMarket = eventMarkets.find((m) => namesLooselyMatch(m.yes_sub_title, teams.home));
      const awayMarket = eventMarkets.find((m) => namesLooselyMatch(m.yes_sub_title, teams.away));
      if (!homeMarket || !awayMarket) continue;
      const tieMarket = eventMarkets.find((m) => /\btie\b/i.test(m.yes_sub_title));
      return {
        homeTicker: homeMarket.ticker,
        awayTicker: awayMarket.ticker,
        tieTicker: tieMarket?.ticker ?? null,
      };
    }
    return null;
  })();
  marketCache.set(cacheKey, promise);
  return promise;
}

async function fetchMarket(ticker: string): Promise<KalshiMarket | null> {
  const response = await fetch(`${KALSHI_ORIGIN}/markets/${ticker}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { market?: KalshiMarket };
  return body.market ?? null;
}

function midpointDollars(market: KalshiMarket | null): number | null {
  if (!market) return null;
  const bid = Number(market.yes_bid_dollars);
  const ask = Number(market.yes_ask_dollars);
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  const last = Number(market.last_price_dollars);
  return Number.isFinite(last) ? last : null;
}

export async function fetchKalshiPrice(teams: TeamNames): Promise<VenuePrice | null> {
  const market = await findMoneylineMarket(teams);
  if (!market) return null;

  const [home, away, tie] = await Promise.all([
    fetchMarket(market.homeTicker),
    fetchMarket(market.awayTicker),
    market.tieTicker ? fetchMarket(market.tieTicker) : Promise.resolve(null),
  ]);
  const homePrice = midpointDollars(home);
  const awayPrice = midpointDollars(away);
  if (homePrice === null && awayPrice === null) return null;

  return {
    venue: "kalshi",
    homeImpliedPct: homePrice === null ? null : homePrice * 100,
    awayImpliedPct: awayPrice === null ? null : awayPrice * 100,
    drawImpliedPct: tie ? (midpointDollars(tie) ?? null) : null,
    observedAt: Date.now(),
    raw: { market },
  };
}

export type CandlePoint = { t: number; closeDollars: number };

const candleCache = new Map<string, Promise<CandlePoint[]>>();

async function fetchCandlesticks(ticker: string): Promise<CandlePoint[]> {
  const cached = candleCache.get(ticker);
  if (cached) return cached;

  const promise = (async () => {
    const market = await fetchMarket(ticker);
    if (!market) return [];
    // Kalshi caps a single request at 5000 candlesticks. Markets open days
    // before kickoff, so the window is anchored on expected_expiration_time
    // (≈ full-time) rather than "now" — a few hours either side comfortably
    // covers the match at 1-minute resolution and stays well under the cap.
    const expiration = Math.floor(Date.parse(market.expected_expiration_time) / 1000);
    const startTs = expiration - 5 * 3600;
    const endTs = expiration + 3600;
    const response = await fetch(
      `${KALSHI_ORIGIN}/series/${MONEYLINE_SERIES}/markets/${ticker}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=1`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as {
      candlesticks?: Array<{ end_period_ts: number; price?: { close_dollars?: string } }>;
    };
    return (body.candlesticks ?? [])
      .map((candle) => ({
        t: candle.end_period_ts,
        closeDollars: Number(candle.price?.close_dollars),
      }))
      .filter((point) => Number.isFinite(point.closeDollars));
  })();
  candleCache.set(ticker, promise);
  return promise;
}

function priceAtOrBefore(series: CandlePoint[], timestampMs: number): number | null {
  const targetSeconds = timestampMs / 1000;
  let result: number | null = null;
  for (const point of series) {
    if (point.t > targetSeconds) break;
    result = point.closeDollars;
  }
  return result;
}

export async function fetchKalshiHistoricalPrice(
  teams: TeamNames,
  timestampMs: number,
): Promise<VenuePrice | null> {
  const market = await findMoneylineMarket(teams);
  if (!market) return null;

  const [homeSeries, awaySeries, tieSeries] = await Promise.all([
    fetchCandlesticks(market.homeTicker),
    fetchCandlesticks(market.awayTicker),
    market.tieTicker ? fetchCandlesticks(market.tieTicker) : Promise.resolve([]),
  ]);
  const homePrice = priceAtOrBefore(homeSeries, timestampMs);
  const awayPrice = priceAtOrBefore(awaySeries, timestampMs);
  const tiePrice = priceAtOrBefore(tieSeries, timestampMs);
  if (homePrice === null && awayPrice === null) return null;

  return {
    venue: "kalshi",
    homeImpliedPct: homePrice === null ? null : homePrice * 100,
    awayImpliedPct: awayPrice === null ? null : awayPrice * 100,
    drawImpliedPct: tiePrice === null ? null : tiePrice * 100,
    observedAt: timestampMs,
    raw: { market },
  };
}
