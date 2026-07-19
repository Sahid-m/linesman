import "server-only";

import type { MarketMapping, VenueMarketMapping } from "@/lib/engine/mapping";
import { findKalshiMoneylineMarketIds } from "@/lib/sources/kalshi";
import { findPolymarketMoneylineMarketIds } from "@/lib/sources/polymarket";
import type { SharpLine } from "@/lib/types";

const AUTO_MAP_TTL_MS = 45_000;
const autoMapCache = new Map<string, { at: number; mappings: MarketMapping[] }>();

function fixtureKey(line: SharpLine): string {
  return `${line.fixtureId}:${line.homeTeam.name}:${line.awayTeam.name}`;
}

function selectionFromOutcomeId(outcomeId: string): string | null {
  const parts = outcomeId.split(":");
  return parts[2] ?? null;
}

function venuesFromDiscovery(input: {
  polymarket?: { homeMarketId: string; awayMarketId: string; drawMarketId: string | null };
  kalshi?: { homeTicker: string; awayTicker: string; drawTicker: string | null };
  selection: string;
}): VenueMarketMapping[] {
  const venues: VenueMarketMapping[] = [];
  const { polymarket, kalshi, selection } = input;

  if (polymarket) {
    const id =
      selection === "part1"
        ? polymarket.homeMarketId
        : selection === "part2"
          ? polymarket.awayMarketId
          : polymarket.drawMarketId;
    if (id) {
      venues.push({ venue: "polymarket", venueMarketId: id, yesMeansSelection: true });
    }
  }

  if (kalshi) {
    const id =
      selection === "part1"
        ? kalshi.homeTicker
        : selection === "part2"
          ? kalshi.awayTicker
          : kalshi.drawTicker;
    if (id) {
      venues.push({ venue: "kalshi", venueMarketId: id, yesMeansSelection: true });
    }
  }

  return venues;
}

async function discoverFixtureMappings(lines: SharpLine[]): Promise<MarketMapping[]> {
  if (lines.length === 0) return [];
  const sample = lines[0];
  const teams = { home: sample.homeTeam.name, away: sample.awayTeam.name };

  const [polymarket, kalshi] = await Promise.all([
    findPolymarketMoneylineMarketIds(teams, "live"),
    findKalshiMoneylineMarketIds(teams),
  ]);

  if (!polymarket && !kalshi) return [];

  const mappings: MarketMapping[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const selection = selectionFromOutcomeId(line.outcomeId) ?? line.selectionLabel;
    const key = `${line.outcomeId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const normalized =
      selection === "part1" || selection === "home" || /home/i.test(selection)
        ? "part1"
        : selection === "part2" || selection === "away" || /away/i.test(selection)
          ? "part2"
          : selection === "draw" || /draw/i.test(selection)
            ? "draw"
            : null;
    if (!normalized) continue;

    const venues = venuesFromDiscovery({
      polymarket: polymarket
        ? {
            homeMarketId: polymarket.homeMarketId,
            awayMarketId: polymarket.awayMarketId,
            drawMarketId: polymarket.drawMarketId,
          }
        : undefined,
      kalshi: kalshi
        ? {
            homeTicker: kalshi.homeTicker,
            awayTicker: kalshi.awayTicker,
            drawTicker: kalshi.drawTicker,
          }
        : undefined,
      selection: normalized,
    });
    if (venues.length === 0) continue;

    mappings.push({
      outcomeId: line.outcomeId,
      txline: {
        fixtureId: line.fixtureId,
        market: "1x2",
        selection: normalized,
      },
      venues,
      mappingConfidence: "heuristic",
      note: `Auto-matched via public venue search (${polymarket ? "polymarket" : ""}${polymarket && kalshi ? "+" : ""}${kalshi ? "kalshi" : ""})`,
    });
  }

  return mappings;
}

/**
 * Build heuristic MarketMapping[] for live SharpLines by searching public
 * Polymarket + Kalshi APIs (team-name join). Cached briefly per fixture.
 */
export async function autoMapSharpLines(sharpLines: SharpLine[]): Promise<MarketMapping[]> {
  const byFixture = new Map<string, SharpLine[]>();
  for (const line of sharpLines) {
    if (line.market !== "1x2") continue;
    const key = fixtureKey(line);
    const list = byFixture.get(key) ?? [];
    list.push(line);
    byFixture.set(key, list);
  }

  const results: MarketMapping[] = [];
  await Promise.all(
    Array.from(byFixture.entries()).map(async ([key, lines]) => {
      const cached = autoMapCache.get(key);
      if (cached && Date.now() - cached.at < AUTO_MAP_TTL_MS) {
        results.push(...cached.mappings);
        return;
      }
      try {
        const mappings = await discoverFixtureMappings(lines);
        autoMapCache.set(key, { at: Date.now(), mappings });
        results.push(...mappings);
      } catch (error) {
        console.warn("[auto-map] discovery failed", key, error);
      }
    }),
  );

  return results;
}
