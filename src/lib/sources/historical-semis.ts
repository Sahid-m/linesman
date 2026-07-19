import "server-only";

import { computeEdge } from "@/lib/engine/edge";
import { devigBook } from "@/lib/engine/devig";
import {
  fetchKalshiCandlestickHistory,
  kalshiPriceAtOrBefore,
  type KalshiCandlePoint,
} from "@/lib/sources/kalshi";
import {
  fetchPolymarketCandlestickHistory,
  priceAtOrBefore,
  type PricePoint,
} from "@/lib/sources/polymarket";
import { SHOWCASE_SEMI_IDS } from "@/lib/sources/showcase-ids";
import { getShowcaseSemiAudits, getShowcaseSemiEdges } from "@/lib/sources/showcase-semis";
import type { ClosedMarketRecord, Edge, GapPoint, Team } from "@/lib/types";

export { SHOWCASE_SEMI_IDS, isShowcaseSemiFixture } from "@/lib/sources/showcase-ids";

type SelectionKey = "part1" | "part2" | "draw";

type SemiSpec = {
  fixtureId: number;
  label: string;
  competition: string;
  home: Team;
  away: Team;
  kickoffMs: number;
  polymarket: Record<SelectionKey, string>;
  kalshi: Record<SelectionKey, string>;
  winner: SelectionKey;
};

const FRA: Team = { code: "FRA", name: "France", primaryColor: "#002395", secondaryColor: "#ED2939" };
const ESP: Team = { code: "ESP", name: "Spain", primaryColor: "#AA151B", secondaryColor: "#F1BF00" };
const ENG: Team = { code: "ENG", name: "England", primaryColor: "#FFFFFF", secondaryColor: "#CF081F" };
const ARG: Team = { code: "ARG", name: "Argentina", primaryColor: "#6CACE4", secondaryColor: "#FCD116" };

const SEMIS: SemiSpec[] = [
  {
    fixtureId: SHOWCASE_SEMI_IDS.franceSpain,
    label: "France vs Spain",
    competition: "World Cup · Semi-finals",
    home: FRA,
    away: ESP,
    kickoffMs: Date.UTC(2026, 6, 14, 19, 0),
    polymarket: { part1: "2879968", draw: "2879969", part2: "2879970" },
    kalshi: {
      part1: "KXWCGAME-26JUL14FRAESP-FRA",
      draw: "KXWCGAME-26JUL14FRAESP-TIE",
      part2: "KXWCGAME-26JUL14FRAESP-ESP",
    },
    winner: "part2",
  },
  {
    fixtureId: SHOWCASE_SEMI_IDS.englandArgentina,
    label: "England vs Argentina",
    competition: "World Cup · Semi-finals",
    home: ENG,
    away: ARG,
    kickoffMs: Date.UTC(2026, 6, 15, 19, 0),
    polymarket: { part1: "2891165", draw: "2891166", part2: "2891167" },
    kalshi: {
      part1: "KXWCGAME-26JUL15ENGARG-ENG",
      draw: "KXWCGAME-26JUL15ENGARG-TIE",
      part2: "KXWCGAME-26JUL15ENGARG-ARG",
    },
    winner: "part2",
  },
];

const KEYS: SelectionKey[] = ["part1", "part2", "draw"];

type CandleBook = {
  spec: SemiSpec;
  candleStart: number;
  candleEnd: number;
  pmSeries: PricePoint[][];
  kxSeries: KalshiCandlePoint[][];
  minutes: number[];
  fetchedAt: number;
};

const bookCache = new Map<number, CandleBook>();
const BOOK_TTL_MS = 10 * 60_000;

function gapFromSeries(
  series: Array<{ t: number; p: number }>,
  fairProb: number,
  signalMs: number,
): GapPoint[] {
  const normalized = series.map((point) => ({
    t: point.t < 1e12 ? point.t * 1_000 : point.t,
    p: point.p,
  }));
  const windowStart = Math.max(normalized[0]?.t ?? signalMs - 45 * 60_000, signalMs - 45 * 60_000);
  const sliced = normalized.filter(
    (point) => point.t >= windowStart && point.t <= signalMs + 5 * 60_000,
  );
  const source = sliced.length > 2 ? sliced : normalized.slice(-40);
  return source.map((point) => ({
    t: point.t,
    gapPct: point.p > 0 ? (fairProb / point.p - 1) * 100 : 0,
  }));
}

function buildMinuteAxis(kickoffMs: number, kxSeries: KalshiCandlePoint[][]): number[] {
  const start = kickoffMs;
  const end = kickoffMs + 130 * 60_000;
  const minutes: number[] = [];
  for (let t = start; t <= end; t += 60_000) minutes.push(t);
  // Prefer actual Kalshi timestamps when denser/sparser.
  const fromKx = new Set<number>();
  for (const series of kxSeries) {
    for (const point of series) {
      if (point.t >= start && point.t <= end) fromKx.add(point.t);
    }
  }
  if (fromKx.size >= 30) return [...fromKx].sort((a, b) => a - b);
  return minutes;
}

async function loadCandleBook(spec: SemiSpec): Promise<CandleBook | null> {
  const cached = bookCache.get(spec.fixtureId);
  if (cached && Date.now() - cached.fetchedAt < BOOK_TTL_MS) return cached;

  const candleStart = spec.kickoffMs - 30 * 60_000;
  const candleEnd = spec.kickoffMs + 150 * 60_000;
  const pmSeries = await Promise.all(
    KEYS.map((key) => fetchPolymarketCandlestickHistory(spec.polymarket[key], candleStart, candleEnd, 1)),
  );
  const kxSeries = await Promise.all(
    KEYS.map((key) => fetchKalshiCandlestickHistory(spec.kalshi[key], candleStart, candleEnd, 1)),
  );
  if (pmSeries.some((s) => s.length < 2) || kxSeries.some((s) => s.length < 2)) return null;

  const book: CandleBook = {
    spec,
    candleStart,
    candleEnd,
    pmSeries,
    kxSeries,
    minutes: buildMinuteAxis(spec.kickoffMs, kxSeries),
    fetchedAt: Date.now(),
  };
  bookCache.set(spec.fixtureId, book);
  return book;
}

function edgesAtMinute(book: CandleBook, atMs: number): Edge[] {
  const { spec, pmSeries, kxSeries } = book;
  const signalMs = Math.min(Math.max(atMs, book.minutes[0] ?? atMs), book.minutes.at(-1) ?? atMs);

  const pmPrices = pmSeries.map((series) => priceAtOrBefore(series, signalMs));
  const kxPrices = kxSeries.map((series) => kalshiPriceAtOrBefore(series, signalMs));
  if (pmPrices.some((p) => p === null) || kxPrices.some((p) => p === null)) return [];

  let fair: number[];
  try {
    fair = devigBook(pmPrices as number[], "power");
  } catch {
    return [];
  }

  const edges: Edge[] = [];
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    const fairProb = fair[i];
    const selectionLabel =
      key === "part1" ? spec.home.name : key === "part2" ? spec.away.name : "Draw";
    const outcomeId = `txl-${spec.fixtureId}:1x2:${key}`;
    const sharp = {
      outcomeId,
      fixtureId: `txl-${spec.fixtureId}`,
      competition: spec.competition,
      homeTeam: spec.home,
      awayTeam: spec.away,
      market: "1x2" as const,
      selectionLabel,
      decimalOdds: 1 / fairProb,
      impliedProb: fairProb,
      fairProb,
      packetTimestamp: signalMs,
      proofRef: {
        network: "devnet" as const,
        epochDay: Math.floor(signalMs / 86_400_000),
        merkleRoot: `hist-pm-devig-${spec.fixtureId}`,
      },
      kickoffTime: spec.kickoffMs,
      isLive: true,
    };

    // Always show both venues at this minute — that's the "live instance" view.
    edges.push(
      computeEdge({
        sharp,
        venue: {
          outcomeId,
          venue: "kalshi",
          venueMarketId: spec.kalshi[key],
          question: `${spec.label} Winner? · ${selectionLabel}`,
          yesPrice: kxPrices[i]!,
          liquidityUsd: 50_000,
          fetchedAt: signalMs,
          venueUrl: `https://kalshi.com/markets/${spec.kalshi[key]}`,
        },
        gapHistory: gapFromSeries(kxSeries[i], fairProb, signalMs),
        mappingConfidence: "high",
        recentImpliedProbs: [fairProb],
      }),
    );
    edges.push(
      computeEdge({
        sharp,
        venue: {
          outcomeId,
          venue: "polymarket",
          venueMarketId: spec.polymarket[key],
          question:
            key === "draw"
              ? `Will ${spec.label} end in a draw?`
              : `Will ${selectionLabel} win on ${new Date(spec.kickoffMs).toISOString().slice(0, 10)}?`,
          yesPrice: pmPrices[i]!,
          liquidityUsd: 200_000,
          fetchedAt: signalMs,
          venueUrl: `https://polymarket.com/market/${spec.polymarket[key]}`,
        },
        gapHistory: gapFromSeries(pmSeries[i], fairProb, signalMs),
        mappingConfidence: "high",
        recentImpliedProbs: [fairProb],
      }),
    );
  }
  return edges;
}

function formatClock(atMs: number, kickoffMs: number): string {
  const minute = Math.max(0, Math.round((atMs - kickoffMs) / 60_000));
  const utc = new Date(atMs).toISOString().slice(11, 16);
  return `'${minute} · ${utc} UTC`;
}

export type VenueReplayTimeline = {
  fixtureId: number;
  label: string;
  kickoffMs: number;
  startMs: number;
  endMs: number;
  minutes: number[];
};

export async function getVenueReplayTimeline(fixtureId: number): Promise<VenueReplayTimeline | null> {
  const spec = SEMIS.find((item) => item.fixtureId === fixtureId);
  if (!spec) return null;
  const book = await loadCandleBook(spec);
  if (!book) return null;
  return {
    fixtureId: spec.fixtureId,
    label: spec.label,
    kickoffMs: spec.kickoffMs,
    startMs: book.minutes[0] ?? spec.kickoffMs,
    endMs: book.minutes.at(-1) ?? spec.kickoffMs,
    minutes: book.minutes,
  };
}

/**
 * Edges at a specific match minute from cached 1m Polymarket + Kalshi candles.
 * Pass `atMs` to scrub; omit to start at kickoff.
 */
export async function getHistoricalSemiEdges(
  fixtureId?: number,
  opts?: { atMs?: number },
): Promise<{
  edges: Edge[];
  source: "historical-venues" | "fallback-tape";
  atMs?: number;
  clockLabel?: string;
}> {
  const specs = fixtureId == null ? SEMIS : SEMIS.filter((spec) => spec.fixtureId === fixtureId);
  if (specs.length === 0) {
    return { edges: getShowcaseSemiEdges(fixtureId), source: "fallback-tape" };
  }

  const books = await Promise.all(specs.map((spec) => loadCandleBook(spec)));
  if (books.some((book) => book === null)) {
    return { edges: getShowcaseSemiEdges(fixtureId), source: "fallback-tape" };
  }

  const edges: Edge[] = [];
  let clockLabel: string | undefined;
  let usedAt: number | undefined;
  for (const book of books as CandleBook[]) {
    const atMs = opts?.atMs ?? book.minutes[0] ?? book.spec.kickoffMs;
    const slice = edgesAtMinute(book, atMs);
    edges.push(...slice);
    usedAt = atMs;
    clockLabel = formatClock(atMs, book.spec.kickoffMs);
  }

  if (edges.length === 0) {
    return { edges: getShowcaseSemiEdges(fixtureId), source: "fallback-tape" };
  }
  return { edges, source: "historical-venues", atMs: usedAt, clockLabel };
}

export async function getHistoricalSemiAudits(fixtureId?: number): Promise<ClosedMarketRecord[]> {
  return getShowcaseSemiAudits(fixtureId).map((record) => {
    const spec = SEMIS.find((item) => record.fixtureId === `txl-${item.fixtureId}`);
    if (!spec) return record;
    if (record.venue === "kalshi") {
      if (record.venueMarketId.includes("fra-esp-fra") || record.venueMarketId.includes("eng-arg-eng")) {
        return { ...record, venueMarketId: spec.kalshi.part1 };
      }
      if (record.venueMarketId.includes("fra-esp-esp") || record.venueMarketId.includes("eng-arg-arg")) {
        return { ...record, venueMarketId: spec.kalshi.part2 };
      }
      if (record.venueMarketId.includes("draw") || record.venueMarketId.includes("tie")) {
        return { ...record, venueMarketId: spec.kalshi.draw };
      }
    }
    if (record.venue === "polymarket") {
      const isHome = record.question.toLowerCase().includes(spec.home.name.toLowerCase());
      const isAway = record.question.toLowerCase().includes(spec.away.name.toLowerCase());
      if (record.question.toLowerCase().includes("draw")) {
        return { ...record, venueMarketId: spec.polymarket.draw };
      }
      if (isHome && !isAway) return { ...record, venueMarketId: spec.polymarket.part1 };
      if (isAway) return { ...record, venueMarketId: spec.polymarket.part2 };
    }
    return record;
  });
}
