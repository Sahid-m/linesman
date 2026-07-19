import "server-only";

import { findKalshiMoneylineMarketIds, getKalshiMarketsByTickers } from "@/lib/sources/kalshi";
import {
  findPolymarketMoneylineMarketIds,
  getPolymarketMarketsByIds,
} from "@/lib/sources/polymarket";
import { getFixtureProvenResult } from "@/lib/sources/txline";
import type { Network } from "@/lib/network/config";
import type { ClosedMarketRecord } from "@/lib/types";
import { WORLD_CUP_SCHEDULE } from "@/lib/txline/worldcup-schedule";

function winnerFromScore(finalScore: string): "part1" | "part2" | "draw" | null {
  const match = /^(\d+)\s*[-:]\s*(\d+)$/.exec(finalScore.trim());
  if (!match) return null;
  const home = Number(match[1]);
  const away = Number(match[2]);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  if (home === away) return "draw";
  return home > away ? "part1" : "part2";
}

/**
 * Real settlement audits for finished World Cup fixtures (schedule + public
 * venue markets). Used by Watchdog when TxLINE is activated so we never fall
 * back to the 140-row seeded mock catalogue.
 */
export async function getScheduleClosedMarkets(
  userId: string,
  network: Network,
): Promise<ClosedMarketRecord[]> {
  const finished = WORLD_CUP_SCHEDULE.filter((fixture) => fixture.finalScore);
  const records: ClosedMarketRecord[] = [];

  await Promise.all(
    finished.map(async (fixture) => {
      const scheduleWinner = winnerFromScore(fixture.finalScore ?? "");
      const proven = await getFixtureProvenResult(userId, network, fixture.id);
      const winningSelectionKey = proven?.winningSelectionKey ?? scheduleWinner;
      if (!winningSelectionKey) return;

      const teams = { home: fixture.home, away: fixture.away };
      const [polymarket, kalshi] = await Promise.all([
        findPolymarketMoneylineMarketIds(teams, "historical"),
        findKalshiMoneylineMarketIds(teams),
      ]);

      const venueBooks: Array<{
        venue: "polymarket" | "kalshi";
        homeId: string;
        awayId: string;
        drawId: string | null;
      }> = [];
      if (polymarket) {
        venueBooks.push({
          venue: "polymarket",
          homeId: polymarket.homeMarketId,
          awayId: polymarket.awayMarketId,
          drawId: polymarket.drawMarketId,
        });
      }
      if (kalshi) {
        venueBooks.push({
          venue: "kalshi",
          homeId: kalshi.homeTicker,
          awayId: kalshi.awayTicker,
          drawId: kalshi.drawTicker,
        });
      }
      if (venueBooks.length === 0) return;

      for (const book of venueBooks) {
        const ids = [book.homeId, book.awayId, book.drawId].filter((id): id is string => !!id);
        const markets =
          book.venue === "polymarket"
            ? await getPolymarketMarketsByIds(ids)
            : await getKalshiMarketsByTickers(ids);

        const selections: Array<{ key: "part1" | "part2" | "draw"; id: string | null }> = [
          { key: "part1", id: book.homeId },
          { key: "part2", id: book.awayId },
          { key: "draw", id: book.drawId },
        ];

        for (const selection of selections) {
          if (!selection.id) continue;
          const market = markets.get(selection.id);
          if (!market) continue;
          // Prefer closed markets; for still-open books use yesPrice as the
          // venue's current resolution lean.
          const venueSaidYes = market.yesPrice >= 0.5;
          const provenIsYes = winningSelectionKey === selection.key;
          const fullTimeAt = market.closedAt ?? fixture.startTime + 2 * 60 * 60 * 1_000;

          records.push({
            venueMarketId: market.id,
            venue: book.venue,
            question: market.question,
            fixtureId: `txl-${fixture.id}`,
            provenResult: provenIsYes ? "YES" : "NO",
            venueResolution: venueSaidYes ? "YES" : "NO",
            resolvedAt: market.closedAt ?? undefined,
            fullTimeAt,
            proofRef: { network, epochDay: Math.floor(fullTimeAt / 86_400_000) },
          });
        }
      }
    }),
  );

  return records;
}

export function scheduleFixtureLabel(fixtureId: string): string | null {
  const numeric = Number(fixtureId.replace(/^txl-/, ""));
  if (!Number.isFinite(numeric)) return null;
  const match = WORLD_CUP_SCHEDULE.find((fixture) => fixture.id === numeric);
  if (!match) return null;
  return `${match.home} vs ${match.away}`;
}
