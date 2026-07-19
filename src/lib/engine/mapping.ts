import "server-only";

import fs from "node:fs";
import path from "node:path";

import { autoMapSharpLines } from "@/lib/engine/auto-map";
import { computeEdge } from "@/lib/engine/edge";
import { devigBook } from "@/lib/engine/devig";
import { getFixtureProvenResult } from "@/lib/sources/txline";
import { getKalshiMarketsByTickers, type KalshiRawMarket } from "@/lib/sources/kalshi";
import { getPolymarketMarketsByIds, type PolymarketRawMarket } from "@/lib/sources/polymarket";
import type { Network } from "@/lib/network/config";
import type { ClosedMarketRecord, Edge, SharpLine, Venue, VenuePrice } from "@/lib/types";

/**
 * Hand-curated join between TxLINE's real coverage and a specific venue
 * market. TxLINE's public odds feed doesn't carry venue market ids and no
 * public venue API exposes "find me the Polymarket market for fixture N" —
 * so this is the seam a human fills in once, per live match, using
 * `pnpm discover-markets`. Everything downstream (edges, Watchdog audits)
 * only ever sees mappings that actually resolved; a bad or stale entry here
 * just drops that one outcome, it never crashes a screen.
 */
export interface VenueMarketMapping {
  venue: Venue;
  venueMarketId: string;
  /** false if the venue's "Yes" outcome is the *opposite* of the TxLINE selection (rare, but some markets are phrased negatively). */
  yesMeansSelection: boolean;
}

export interface MarketMapping {
  outcomeId: string; // must equal the SharpLine.outcomeId this entry maps to
  txline: {
    fixtureId: string; // "txl-<numeric id>", matches SharpLine.fixtureId
    market: string; // "1x2" today; extend as more market types get mapped
    selection: string; // "part1" | "part2" | "draw" for 1x2 — matches the outcomeId's selection segment
  };
  venues: VenueMarketMapping[];
  mappingConfidence: "exact" | "heuristic";
  note?: string;
}

const MARKET_MAP_PATH = path.join(process.cwd(), "data", "market-map.json");

let cache: { mtimeMs: number; mappings: MarketMapping[] } | null = null;

function isVenueMapping(value: unknown): value is VenueMarketMapping {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.venue === "polymarket" || v.venue === "kalshi") &&
    typeof v.venueMarketId === "string" &&
    v.venueMarketId.length > 0 &&
    typeof v.yesMeansSelection === "boolean"
  );
}

function isMarketMapping(value: unknown): value is MarketMapping {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const txline = v.txline as Record<string, unknown> | undefined;
  return (
    typeof v.outcomeId === "string" &&
    v.outcomeId.length > 0 &&
    !!txline &&
    typeof txline.fixtureId === "string" &&
    typeof txline.market === "string" &&
    typeof txline.selection === "string" &&
    Array.isArray(v.venues) &&
    v.venues.length > 0 &&
    v.venues.every(isVenueMapping) &&
    (v.mappingConfidence === "exact" || v.mappingConfidence === "heuristic" || v.mappingConfidence === undefined)
  );
}

/** Loads + validates data/market-map.json, cached until the file's mtime changes. Never throws. */
export function loadMarketMap(): MarketMapping[] {
  try {
    const stat = fs.statSync(MARKET_MAP_PATH);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.mappings;
    const raw: unknown = JSON.parse(fs.readFileSync(MARKET_MAP_PATH, "utf8"));
    if (!Array.isArray(raw)) throw new Error("market-map.json must be a JSON array");
    const mappings = raw.filter(isMarketMapping);
    if (mappings.length !== raw.length) {
      console.warn(
        `[mapping] dropped ${raw.length - mappings.length} malformed entr${raw.length - mappings.length === 1 ? "y" : "ies"} from data/market-map.json`,
      );
    }
    cache = { mtimeMs: stat.mtimeMs, mappings };
    return mappings;
  } catch (error) {
    console.warn("[mapping] data/market-map.json missing or invalid — no curated live edges:", error);
    return [];
  }
}

/** Distinct fixture+market "books" — selections that share a book must be de-vigged together. */
function bookKey(mapping: MarketMapping): string {
  return `${mapping.txline.fixtureId}:${mapping.txline.market}`;
}

function primaryVenue(mapping: MarketMapping): VenueMarketMapping | undefined {
  return (
    mapping.venues.find((venue) => venue.venue === "polymarket") ??
    mapping.venues.find((venue) => venue.venue === "kalshi")
  );
}

type ResolvedVenueMarket = {
  venue: Venue;
  id: string;
  question: string;
  yesPrice: number;
  liquidityUsd: number;
  closed: boolean;
  closedAt: number | null;
  url: string;
};

function asResolved(
  venue: Venue,
  market: PolymarketRawMarket | KalshiRawMarket | undefined,
): ResolvedVenueMarket | null {
  if (!market) return null;
  return {
    venue,
    id: market.id,
    question: market.question,
    yesPrice: market.yesPrice,
    liquidityUsd: market.liquidityUsd,
    closed: market.closed,
    closedAt: market.closedAt,
    url: market.url,
  };
}

/** Curated file entries win on outcomeId; auto-discovered mappings fill gaps. */
export async function resolveEffectiveMappings(sharpLines: SharpLine[]): Promise<MarketMapping[]> {
  const curated = loadMarketMap();
  const curatedIds = new Set(curated.map((m) => m.outcomeId));
  const auto = await autoMapSharpLines(sharpLines);
  const merged = [...curated];
  for (const mapping of auto) {
    if (!curatedIds.has(mapping.outcomeId)) merged.push(mapping);
  }
  return merged;
}

export interface MappedEdgesResult {
  edges: Edge[];
  /** Distinct fixture+market books that resolved at least one live edge. */
  mappedMarketCount: number;
}

/**
 * Joins live SharpLine packets against curated + auto-discovered venue maps
 * and fresh Polymarket/Kalshi prices, de-vigging each 1x2 book together.
 */
export async function getMappedEdges(sharpLines: SharpLine[]): Promise<MappedEdgesResult> {
  const mappings = await resolveEffectiveMappings(sharpLines);
  if (mappings.length === 0) return { edges: [], mappedMarketCount: 0 };

  const primaryVenues = mappings
    .map(primaryVenue)
    .filter((v): v is VenueMarketMapping => !!v);
  const polymarketIds = primaryVenues.filter((v) => v.venue === "polymarket").map((v) => v.venueMarketId);
  const kalshiIds = primaryVenues.filter((v) => v.venue === "kalshi").map((v) => v.venueMarketId);

  const [polymarketById, kalshiById] = await Promise.all([
    getPolymarketMarketsByIds(polymarketIds),
    getKalshiMarketsByTickers(kalshiIds),
  ]);

  const sharpByOutcomeId = new Map(sharpLines.map((line) => [line.outcomeId, line]));

  // De-vig TxLINE 1x2 books so fairProb is comparable to venue Yes prices.
  const sharpBooks = new Map<string, SharpLine[]>();
  for (const line of sharpLines) {
    const key = `${line.fixtureId}:${line.market}`;
    const list = sharpBooks.get(key) ?? [];
    list.push(line);
    sharpBooks.set(key, list);
  }
  for (const book of sharpBooks.values()) {
    if (book.length < 2) continue;
    const fair = devigBook(
      book.map((line) => line.impliedProb),
      "power",
    );
    book.forEach((line, index) => {
      sharpByOutcomeId.set(line.outcomeId, { ...line, fairProb: fair[index] });
    });
  }

  const books = new Map<string, MarketMapping[]>();
  for (const mapping of mappings) {
    const list = books.get(bookKey(mapping)) ?? [];
    list.push(mapping);
    books.set(bookKey(mapping), list);
  }

  const edges: Edge[] = [];
  let mappedMarketCount = 0;

  for (const bookMappings of books.values()) {
    const resolved: Array<{ mapping: MarketMapping; market: ResolvedVenueMarket; rawProb: number }> = [];
    for (const mapping of bookMappings) {
      const venueMapping = primaryVenue(mapping);
      if (!venueMapping) continue;
      const market =
        venueMapping.venue === "polymarket"
          ? asResolved("polymarket", polymarketById.get(venueMapping.venueMarketId))
          : asResolved("kalshi", kalshiById.get(venueMapping.venueMarketId));
      if (!market || market.closed) continue;
      const rawProb = venueMapping.yesMeansSelection ? market.yesPrice : 1 - market.yesPrice;
      resolved.push({ mapping, market, rawProb });
    }
    if (resolved.length === 0) continue;

    // Only de-vig as a book when every selection in it resolved live —
    // a partial book falls back to each selection's own raw price rather
    // than being dropped, so one dead venue market doesn't blank a fixture.
    const canDevigBook = resolved.length === bookMappings.length && resolved.length >= 2;
    const fairProbs = canDevigBook ? devigBook(resolved.map((r) => r.rawProb), "power") : null;

    let bookHadEdge = false;
    resolved.forEach(({ mapping, market, rawProb }, index) => {
      const sharp = sharpByOutcomeId.get(mapping.outcomeId);
      if (!sharp) return;

      const fairVenueProb = fairProbs ? fairProbs[index] : rawProb;
      const venuePrice: VenuePrice = {
        outcomeId: mapping.outcomeId,
        venue: market.venue,
        venueMarketId: market.id,
        question: market.question,
        yesPrice: fairVenueProb,
        liquidityUsd: market.liquidityUsd,
        fetchedAt: Date.now(),
        venueUrl: market.url,
      };
      const confidence = mapping.mappingConfidence === "exact" ? "high" : "medium";
      edges.push(computeEdge({ sharp, venue: venuePrice, mappingConfidence: confidence }));
      bookHadEdge = true;
    });
    if (bookHadEdge) mappedMarketCount += 1;
  }

  return { edges, mappedMarketCount };
}

/** Static count of configured books, independent of live connectivity — used by /health. */
export function getMappedMarketCount(): number {
  const mappings = loadMarketMap();
  const books = new Set(mappings.map(bookKey));
  return books.size;
}

/**
 * Real settlement audits for mapped 1x2 books whose venue market has closed.
 * Defensive: `getFixtureProvenResult`'s score-shape parsing hasn't been
 * exercised against a real finished fixture (no live session while this was
 * built), so any surprise in that payload just drops the fixture rather
 * than fabricating a verdict — see docs/FRICTION.md.
 */
export async function getMappedClosedMarkets(
  userId: string,
  network: Network,
): Promise<ClosedMarketRecord[]> {
  const mappings = loadMarketMap();
  if (mappings.length === 0) return [];

  const venueIds = mappings.map(primaryVenue).filter((v): v is VenueMarketMapping => !!v).map((v) => v.venueMarketId);
  const polymarketById = await getPolymarketMarketsByIds(venueIds);

  const books = new Map<string, MarketMapping[]>();
  for (const mapping of mappings) {
    const list = books.get(bookKey(mapping)) ?? [];
    list.push(mapping);
    books.set(bookKey(mapping), list);
  }

  const records: ClosedMarketRecord[] = [];

  for (const bookMappings of books.values()) {
    const closedEntries = bookMappings
      .map((mapping) => {
        const venueMapping = primaryVenue(mapping);
        const market = venueMapping ? polymarketById.get(venueMapping.venueMarketId) : undefined;
        if (!venueMapping || !market || !market.closed) return null;
        return { mapping, venueMapping, market };
      })
      .filter((entry): entry is { mapping: MarketMapping; venueMapping: VenueMarketMapping; market: PolymarketRawMarket } => !!entry);
    if (closedEntries.length === 0) continue;

    const numericFixtureId = Number(closedEntries[0].mapping.txline.fixtureId.replace(/^txl-/, ""));
    if (!Number.isFinite(numericFixtureId)) continue;
    const proven = await getFixtureProvenResult(userId, network, numericFixtureId);
    if (!proven) continue;

    for (const { mapping, venueMapping, market } of closedEntries) {
      if (!proven.winningSelectionKey) continue;
      const resolvedYes = venueMapping.yesMeansSelection ? market.yesPrice : 1 - market.yesPrice;
      const venueSaidYes = resolvedYes >= 0.5;
      const provenIsYes = proven.winningSelectionKey === mapping.txline.selection;

      records.push({
        venueMarketId: market.id,
        venue: "polymarket",
        question: market.question,
        fixtureId: mapping.txline.fixtureId,
        provenResult: provenIsYes ? "YES" : "NO",
        venueResolution: venueSaidYes ? "YES" : "NO",
        resolvedAt: market.closedAt ?? undefined,
        fullTimeAt: market.closedAt ?? Date.now(),
        proofRef: { network, epochDay: Math.floor((market.closedAt ?? Date.now()) / 86_400_000) },
      });
    }
  }

  return records;
}
