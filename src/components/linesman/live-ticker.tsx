"use client";

import useSWR from "swr";
import { LiveTickerStrip } from "@/components/linesman/live-ticker-strip";
import type { LiveWinnerMarket } from "@/lib/sources/polymarket";
// ^ type-only import: erased at build time, does not pull the "server-only" module into the client bundle.

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const FALLBACK_ITEMS = [
  "⛓ Sharp lines anchored on Solana every packet",
  "⏱ Replay past fixtures with real 1m Polymarket + Kalshi candles",
];

function formatPct(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

export function LiveTicker() {
  const { data } = useSWR<{ market: LiveWinnerMarket | null }>("/api/live/winner-market", fetcher, {
    refreshInterval: 60_000,
  });

  const market = data?.market;
  const liveItems =
    market && market.contenders.length > 0
      ? [
          `🔴 LIVE · Polymarket ${market.eventTitle} · ${market.contenders
            .slice(0, 2)
            .map((c) => `${c.team} ${formatPct(c.probability)}`)
            .join(" vs ")}`,
        ]
      : [];

  return <LiveTickerStrip items={[...liveItems, ...FALLBACK_ITEMS]} />;
}
