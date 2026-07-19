import "server-only";

import { eventMentionsBothTeams, namesLooselyMatch } from "@/lib/markets/names";

/**
 * Real, no-auth read of Polymarket's public Gamma API. Used to surface a
 * genuinely live line in the ticker strip (World Cup outright winner odds)
 * without touching the demo-proof mock pipeline that powers the Feed and
 * Watchdog. Any failure here must degrade silently — this is a bonus signal,
 * never a dependency.
 */

const GAMMA_ORIGIN = "https://gamma-api.polymarket.com";
const GAMMA_EVENT_URL = `${GAMMA_ORIGIN}/events/slug/world-cup-winner`;
const GAMMA_MARKET_URL = `${GAMMA_ORIGIN}/markets`;
const FETCH_TIMEOUT_MS = 4_000;

export interface LiveWinnerQuote {
  team: string;
  probability: number; // 0..1
}

export interface LiveWinnerMarket {
  eventTitle: string;
  fetchedAt: number;
  contenders: LiveWinnerQuote[];
  sourceUrl: string;
}

interface GammaMarket {
  id?: string;
  slug?: string;
  question?: string;
  closed?: boolean;
  active?: boolean;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  liquidityNum?: number;
  closedTime?: string;
}

/** A single curated-mapping market, resolved to the shape `lib/engine/mapping.ts` needs. */
export interface PolymarketRawMarket {
  id: string;
  question: string;
  yesPrice: number; // raw "Yes" implied probability, 0..1, before any book de-vig
  liquidityUsd: number;
  closed: boolean;
  closedAt: number | null;
  url: string;
}

interface GammaEvent {
  title?: string;
  slug?: string;
  markets?: GammaMarket[];
}

function parseJsonArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function teamFromQuestion(question: string): string | null {
  const match = /^Will (.+?) win the 2026 FIFA World Cup\?$/i.exec(question.trim());
  return match?.[1]?.trim() ?? null;
}

export async function getLiveWinnerMarket(): Promise<LiveWinnerMarket | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(GAMMA_EVENT_URL, {
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;

    const event = (await res.json()) as GammaEvent;
    const markets = Array.isArray(event.markets) ? event.markets : [];

    const contenders: LiveWinnerQuote[] = [];
    for (const market of markets) {
      if (market.closed || !market.question) continue;
      const team = teamFromQuestion(market.question);
      if (!team) continue;
      const outcomes = parseJsonArray(market.outcomes);
      const prices = parseJsonArray(market.outcomePrices);
      const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === "yes");
      if (yesIndex === -1) continue;
      const probability = Number(prices[yesIndex]);
      if (!Number.isFinite(probability) || probability <= 0) continue;
      contenders.push({ team, probability });
    }

    if (contenders.length === 0) return null;
    contenders.sort((a, b) => b.probability - a.probability);

    return {
      eventTitle: event.title?.trim() || "World Cup Winner",
      fetchedAt: Date.now(),
      contenders: contenders.slice(0, 6),
      sourceUrl: `https://polymarket.com/event/${event.slug ?? "world-cup-winner"}`,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a single Gamma market by its numeric id — used to resolve the venue
 * side of a hand-curated `data/market-map.json` entry. Kept separate from
 * `getLiveWinnerMarket` (the fixed World-Cup-outright ticker feed) since this
 * is looked up per mapping, for whatever match TxLINE is actually covering.
 */
export async function getPolymarketMarketById(id: string): Promise<PolymarketRawMarket | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${GAMMA_MARKET_URL}/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;

    const market = (await res.json()) as GammaMarket;
    const outcomes = parseJsonArray(market.outcomes);
    const prices = parseJsonArray(market.outcomePrices);
    const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
    if (yesIndex === -1) return null;
    const yesPrice = Number(prices[yesIndex]);
    if (!Number.isFinite(yesPrice) || yesPrice <= 0 || yesPrice >= 1) return null;

    const closedAtMs = market.closedTime ? Date.parse(market.closedTime) : NaN;
    return {
      id: String(market.id ?? id),
      question: market.question?.trim() || "Polymarket market",
      yesPrice,
      liquidityUsd: Number(market.liquidityNum ?? 0) || 0,
      closed: Boolean(market.closed),
      closedAt: Number.isFinite(closedAtMs) ? closedAtMs : null,
      url: `https://polymarket.com/market/${market.slug ?? id}`,
    };
  } catch {
    return null;
  }
}

/** Batch lookup, deduped, for a whole market-map at once. Failures are dropped, not thrown. */
export async function getPolymarketMarketsByIds(ids: string[]): Promise<Map<string, PolymarketRawMarket>> {
  const uniqueIds = Array.from(new Set(ids));
  const markets = await Promise.all(uniqueIds.map((id) => getPolymarketMarketById(id)));
  const byId = new Map<string, PolymarketRawMarket>();
  markets.forEach((market, index) => {
    if (market) byId.set(uniqueIds[index], market);
  });
  return byId;
}

export type PricePoint = { t: number; p: number }; // t = unix seconds, p = 0..1

const CLOB_ORIGIN = "https://clob.polymarket.com";

/** Yes-token id for a Gamma market (first outcome when outcomes are Yes/No). */
export async function getPolymarketYesTokenId(marketId: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${GAMMA_MARKET_URL}/${encodeURIComponent(marketId)}`, {
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;
    const market = (await res.json()) as GammaMarket & { clobTokenIds?: string | string[] };
    const outcomes = parseJsonArray(market.outcomes);
    const tokenIds = parseJsonArray(market.clobTokenIds);
    const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
    if (yesIndex === -1) return tokenIds[0] ?? null;
    return tokenIds[yesIndex] ?? null;
  } catch {
    return null;
  }
}

/** Full CLOB price history for a Yes token (works after market close). */
export async function fetchPolymarketPriceHistory(
  tokenId: string,
  opts?: { startMs?: number; endMs?: number; fidelityMinutes?: number },
): Promise<PricePoint[]> {
  try {
    const fidelity = opts?.fidelityMinutes ?? 5;
    const params = new URLSearchParams({
      market: tokenId,
      fidelity: String(fidelity),
    });
    // Prefer absolute window (same idea as Kalshi candlesticks). interval + startTs are mutually exclusive.
    if (opts?.startMs != null && opts?.endMs != null) {
      params.set("startTs", String(Math.floor(opts.startMs / 1_000)));
      params.set("endTs", String(Math.floor(opts.endMs / 1_000)));
    } else {
      params.set("interval", "max");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${CLOB_ORIGIN}/prices-history?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return [];
    const body = (await res.json()) as { history?: PricePoint[] };
    return Array.isArray(body.history) ? body.history : [];
  } catch {
    return [];
  }
}

/**
 * Close series for a Gamma market over [startMs, endMs] — Polymarket's
 * candle-equivalent (CLOB `/prices-history`). Default fidelity = 1 minute.
 */
export async function fetchPolymarketCandlestickHistory(
  marketId: string,
  startMs: number,
  endMs: number,
  fidelityMinutes = 1,
): Promise<PricePoint[]> {
  const tokenId = await getPolymarketYesTokenId(marketId);
  if (!tokenId) return [];
  return fetchPolymarketPriceHistory(tokenId, {
    startMs,
    endMs,
    fidelityMinutes,
  });
}

export function priceAtOrBefore(series: PricePoint[], timestampMs: number): number | null {
  const targetSeconds = timestampMs / 1_000;
  let result: number | null = null;
  for (const point of series) {
    if (point.t > targetSeconds) break;
    result = point.p;
  }
  return result;
}

export async function fetchPolymarketPriceAt(
  marketId: string,
  timestampMs: number,
  window?: { startMs: number; endMs: number },
): Promise<{ price: number; series: PricePoint[]; tokenId: string } | null> {
  const tokenId = await getPolymarketYesTokenId(marketId);
  if (!tokenId) return null;
  const series = window
    ? await fetchPolymarketPriceHistory(tokenId, {
        startMs: window.startMs,
        endMs: window.endMs,
        fidelityMinutes: 1,
      })
    : await fetchPolymarketPriceHistory(tokenId);
  // If the hourly window is sparse, fall back to denser max history for the sample price.
  let price = priceAtOrBefore(series, timestampMs);
  let usedSeries = series;
  if (price === null || !(price > 0 && price < 1)) {
    usedSeries = await fetchPolymarketPriceHistory(tokenId, { fidelityMinutes: 5 });
    price = priceAtOrBefore(usedSeries, timestampMs);
  }
  if (price === null || !(price > 0 && price < 1)) return null;
  return { price, series: usedSeries.length > 0 ? usedSeries : series, tokenId };
}

export type TeamNames = { home: string; away: string };

/** Gamma market ids for a 1x2 book discovered by public team-name search. */
export interface PolymarketMoneylineIds {
  homeMarketId: string;
  awayMarketId: string;
  drawMarketId: string | null;
  eventTitle: string;
}

type GammaSearchMarket = GammaMarket & { id?: string; closed?: boolean; question?: string };
type GammaSearchEvent = { title?: string; markets?: GammaSearchMarket[] };

/**
 * Polymarket has no TxLINE fixture id, so matches are located by searching
 * team names (ported from Solana_WorldCupHack). World Cup games are three
 * binary "Will X win?" / draw markets — we return Gamma numeric ids so the
 * existing mapping engine can resolve prices via getPolymarketMarketById.
 */
export async function findPolymarketMoneylineMarketIds(
  teams: TeamNames,
  mode: "live" | "historical" = "live",
): Promise<PolymarketMoneylineIds | null> {
  try {
    const search = new URLSearchParams({
      q: `${teams.home} ${teams.away}`,
      limit_per_type: "10",
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(`${GAMMA_ORIGIN}/public-search?${search}`, {
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) return null;

    const body = (await response.json()) as { events?: GammaSearchEvent[] };
    for (const event of body.events ?? []) {
      const title = event.title?.trim() ?? "";
      if (title && !eventMentionsBothTeams(title, teams.home, teams.away)) continue;

      const markets = (event.markets ?? []).filter((market) => mode === "historical" || !market.closed);
      const isWinMarket = (market: GammaSearchMarket, team: string) =>
        Boolean(market.question) &&
        /\bwin\b/i.test(market.question!) &&
        namesLooselyMatch(market.question!, team) &&
        !/\bdraw\b/i.test(market.question!);
      const isDrawMarket = (market: GammaSearchMarket) =>
        Boolean(market.question) && /\bdraw\b/i.test(market.question!);

      const homeMarket = markets.find((m) => isWinMarket(m, teams.home));
      const awayMarket = markets.find((m) => isWinMarket(m, teams.away));
      if (!homeMarket?.id || !awayMarket?.id) continue;

      const drawMarket = markets.find(isDrawMarket);
      return {
        homeMarketId: String(homeMarket.id),
        awayMarketId: String(awayMarket.id),
        drawMarketId: drawMarket?.id ? String(drawMarket.id) : null,
        eventTitle: title || `${teams.home} vs ${teams.away}`,
      };
    }
    return null;
  } catch {
    return null;
  }
}
