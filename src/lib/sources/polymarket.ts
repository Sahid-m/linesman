import "server-only";

/**
 * Real, no-auth read of Polymarket's public Gamma API. Used to surface a
 * genuinely live line in the ticker strip (World Cup outright winner odds)
 * without touching the demo-proof mock pipeline that powers the Feed and
 * Watchdog. Any failure here must degrade silently — this is a bonus signal,
 * never a dependency.
 */

const GAMMA_EVENT_URL = "https://gamma-api.polymarket.com/events/slug/world-cup-winner";
const GAMMA_MARKET_URL = "https://gamma-api.polymarket.com/markets";
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
