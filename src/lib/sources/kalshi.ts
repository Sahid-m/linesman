import "server-only";

import { eventMentionsBothTeams, namesLooselyMatch } from "@/lib/markets/names";
import type { TeamNames } from "@/lib/sources/polymarket";

/**
 * Public, no-auth Kalshi Trade API reads. Used to resolve World Cup game
 * moneylines (series KXWCGAME) against TxLINE team names.
 */

const KALSHI_ORIGIN = "https://external-api.kalshi.com/trade-api/v2";
const FETCH_TIMEOUT_MS = 5_000;
const SERIES_TICKER = "KXWCGAME";

export interface KalshiRawMarket {
  id: string; // ticker
  question: string;
  yesPrice: number;
  liquidityUsd: number;
  closed: boolean;
  closedAt: number | null;
  url: string;
}

export interface KalshiMoneylineIds {
  homeTicker: string;
  awayTicker: string;
  drawTicker: string | null;
  eventTitle: string;
}

interface KalshiMarketRow {
  ticker?: string;
  event_ticker?: string;
  title?: string;
  subtitle?: string;
  no_sub_title?: string;
  status?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  liquidity_dollars?: string;
  close_time?: string;
}

async function kalshiFetch(path: string): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return await fetch(`${KALSHI_ORIGIN}${path}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    }).finally(() => clearTimeout(timeout));
  } catch {
    return null;
  }
}

function yesPriceFromRow(row: KalshiMarketRow): number | null {
  const bid = Number(row.yes_bid_dollars);
  const ask = Number(row.yes_ask_dollars);
  if (Number.isFinite(bid) && Number.isFinite(ask) && ask > 0) {
    const mid = (bid + ask) / 2;
    if (mid > 0 && mid < 1) return mid;
  }
  const last = Number(row.last_price_dollars);
  if (Number.isFinite(last) && last > 0 && last < 1) return last;
  return null;
}

function toRawMarket(row: KalshiMarketRow): KalshiRawMarket | null {
  if (!row.ticker) return null;
  const yesPrice = yesPriceFromRow(row);
  if (yesPrice === null) return null;
  const closed = row.status === "closed" || row.status === "settled" || row.status === "determined";
  const closedAtMs = row.close_time ? Date.parse(row.close_time) : NaN;
  return {
    id: row.ticker,
    question: row.title?.trim() || row.ticker,
    yesPrice,
    liquidityUsd: Number(row.liquidity_dollars ?? 0) || 0,
    closed,
    closedAt: Number.isFinite(closedAtMs) ? closedAtMs : null,
    url: `https://kalshi.com/markets/${row.ticker}`,
  };
}

export async function getKalshiMarketByTicker(ticker: string): Promise<KalshiRawMarket | null> {
  const res = await kalshiFetch(`/markets/${encodeURIComponent(ticker)}`);
  if (!res?.ok) return null;
  const body = (await res.json()) as { market?: KalshiMarketRow };
  return body.market ? toRawMarket(body.market) : null;
}

export async function getKalshiMarketsByTickers(tickers: string[]): Promise<Map<string, KalshiRawMarket>> {
  const unique = Array.from(new Set(tickers.filter(Boolean)));
  const markets = await Promise.all(unique.map((ticker) => getKalshiMarketByTicker(ticker)));
  const byId = new Map<string, KalshiRawMarket>();
  markets.forEach((market, index) => {
    if (market) byId.set(unique[index], market);
  });
  return byId;
}

function selectionFromMarket(
  market: KalshiMarketRow,
  home: string,
  away: string,
): "part1" | "part2" | "draw" | null {
  const sub = market.no_sub_title ?? "";
  if (/\b(tie|draw)\b/i.test(sub)) return "draw";
  if (sub && namesLooselyMatch(sub, home) && !namesLooselyMatch(sub, away)) return "part1";
  if (sub && namesLooselyMatch(sub, away) && !namesLooselyMatch(sub, home)) return "part2";

  const upper = (market.ticker ?? "").toUpperCase();
  if (upper.endsWith("-TIE") || upper.endsWith("-DRAW")) return "draw";
  return null;
}

/**
 * Find an open KXWCGAME moneyline book whose event title mentions both teams.
 * Returns Kalshi tickers for home / away / draw (draw optional).
 */
export type KalshiCandlePoint = { t: number; p: number }; // t = unix ms, p = 0..1

/**
 * YES mid/trade candlesticks for a Kalshi market over [startMs, endMs].
 * `periodMinutes` is Kalshi `period_interval` — public API accepts 1 (minute) or 60 (hour).
 */
export async function fetchKalshiCandlestickHistory(
  ticker: string,
  startMs: number,
  endMs: number,
  periodMinutes: 1 | 60 = 1,
): Promise<KalshiCandlePoint[]> {
  try {
    const startTs = Math.floor(startMs / 1_000);
    const endTs = Math.floor(endMs / 1_000);
    const path =
      `/series/${encodeURIComponent(SERIES_TICKER)}/markets/${encodeURIComponent(ticker)}` +
      `/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=${periodMinutes}`;
    const res = await kalshiFetch(path);
    if (!res?.ok) return [];
    const body = (await res.json()) as {
      candlesticks?: Array<{
        end_period_ts?: number;
        price?: { close_dollars?: string; mean_dollars?: string };
        yes_bid?: { close_dollars?: string };
        yes_ask?: { close_dollars?: string };
      }>;
    };
    const points: KalshiCandlePoint[] = [];
    for (const candle of body.candlesticks ?? []) {
      if (typeof candle.end_period_ts !== "number") continue;
      const close = Number(candle.price?.close_dollars ?? candle.price?.mean_dollars);
      const bid = Number(candle.yes_bid?.close_dollars);
      const ask = Number(candle.yes_ask?.close_dollars);
      let p: number | null = null;
      if (Number.isFinite(close) && close > 0 && close < 1) p = close;
      else if (Number.isFinite(bid) && Number.isFinite(ask) && ask > 0) p = (bid + ask) / 2;
      if (p === null || !(p > 0 && p < 1)) continue;
      points.push({ t: candle.end_period_ts * 1_000, p });
    }
    return points.sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

export function kalshiPriceAtOrBefore(series: KalshiCandlePoint[], timestampMs: number): number | null {
  let result: number | null = null;
  for (const point of series) {
    if (point.t > timestampMs) break;
    result = point.p;
  }
  return result;
}

export async function findKalshiMoneylineMarketIds(teams: TeamNames): Promise<KalshiMoneylineIds | null> {
  try {
    const res = await kalshiFetch(
      `/markets?series_ticker=${encodeURIComponent(SERIES_TICKER)}&status=open&limit=200`,
    );
    if (!res?.ok) return null;
    const body = (await res.json()) as { markets?: KalshiMarketRow[] };
    const markets = body.markets ?? [];

    const byEvent = new Map<string, KalshiMarketRow[]>();
    for (const market of markets) {
      const eventTicker = market.event_ticker ?? market.ticker?.replace(/-[A-Z0-9]+$/, "") ?? "";
      if (!eventTicker) continue;
      const list = byEvent.get(eventTicker) ?? [];
      list.push(market);
      byEvent.set(eventTicker, list);
    }

    for (const [, eventMarkets] of byEvent) {
      const title = eventMarkets[0]?.title ?? "";
      // Titles are often "Spain vs Argentina Winner?" — also check event pattern in ticker.
      const eventTicker = eventMarkets[0]?.event_ticker ?? "";
      const haystack = `${title} ${eventTicker}`;
      if (!eventMentionsBothTeams(haystack, teams.home, teams.away) && !eventMentionsBothTeams(title, teams.home, teams.away)) {
        // Fallback: ticker embeds ISO codes (ESPARG) — require both name hits on concatenated market text.
        const blob = eventMarkets.map((m) => `${m.ticker} ${m.title} ${m.no_sub_title ?? ""}`).join(" ");
        if (!eventMentionsBothTeams(blob, teams.home, teams.away)) continue;
      }

      let homeTicker: string | null = null;
      let awayTicker: string | null = null;
      let drawTicker: string | null = null;

      for (const market of eventMarkets) {
        if (!market.ticker) continue;
        const selection = selectionFromMarket(market, teams.home, teams.away);
        if (selection === "part1") homeTicker = market.ticker;
        else if (selection === "part2") awayTicker = market.ticker;
        else if (selection === "draw") drawTicker = market.ticker;
      }

      if (homeTicker && awayTicker) {
        return {
          homeTicker,
          awayTicker,
          drawTicker,
          eventTitle: title || `${teams.home} vs ${teams.away}`,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
