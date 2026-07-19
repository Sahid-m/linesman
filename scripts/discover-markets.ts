/**
 * scripts/discover-markets.ts
 *
 * Prints live TxLINE fixtures next to live Polymarket World Cup markets so a
 * human can hand-pair them into `data/market-map.json`. This is deliberately
 * NOT automatic — no public API maps "TxLINE fixture N" to "Polymarket market
 * id M", so someone has to eyeball team names + kickoff time once per match
 * and copy the emitted JSON skeleton across.
 *
 * Usage:
 *   RECORDER_SECRET=... RECORDER_USER_ID=<uuid> pnpm discover-markets
 *
 * The Polymarket half works with no TxLINE session at all (it's a public,
 * no-auth API) — so this is still useful standalone to browse what's live.
 *
 * Env vars:
 *   BASE_URL            App origin to hit (default http://localhost:3000)
 *   RECORDER_SECRET     Must match RECORDER_SECRET configured on the server (optional — skips TxLINE half if unset)
 *   RECORDER_USER_ID    uuid of the user whose activated TxLINE credential to read (optional)
 *   RECORDER_NETWORK    "devnet" (default) | "mainnet"
 */
import "dotenv/config";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.RECORDER_SECRET;
const USER_ID = process.env.RECORDER_USER_ID;
const NETWORK = process.env.RECORDER_NETWORK ?? "devnet";

const GAMMA_EVENTS_URL = "https://gamma-api.polymarket.com/events";

interface TxlineFixture {
  fixtureId: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: number;
  isLive: boolean;
  selections: Array<{ outcomeId: string; selection: string; label: string; decimalOdds: number | null }>;
}

interface PolymarketCandidate {
  eventTitle: string;
  eventSlug: string;
  marketId: string;
  question: string;
  yesPrice: number;
  liquidityUsd: number;
}

async function fetchTxlineFixtures(): Promise<TxlineFixture[]> {
  if (!SECRET || !USER_ID) {
    console.log("[discover] RECORDER_SECRET / RECORDER_USER_ID not set — skipping TxLINE half.\n");
    return [];
  }
  try {
    const res = await fetch(new URL("/api/internal/discover-fixtures", BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-recorder-secret": SECRET },
      body: JSON.stringify({ userId: USER_ID, network: NETWORK }),
    });
    const payload = await res.json();
    if (!res.ok) {
      console.warn(`[discover] TxLINE fetch failed: ${payload.error ?? res.status}`);
      return [];
    }
    if (payload.reason) console.warn(`[discover] TxLINE has no live fixtures right now: ${payload.reason}`);
    return payload.fixtures ?? [];
  } catch (error) {
    console.warn("[discover] TxLINE fetch errored:", error instanceof Error ? error.message : error);
    return [];
  }
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function fetchPolymarketCandidates(): Promise<PolymarketCandidate[]> {
  try {
    const url = new URL(GAMMA_EVENTS_URL);
    url.searchParams.set("limit", "60");
    url.searchParams.set("closed", "false");
    url.searchParams.set("tag_slug", "fifa-world-cup");
    url.searchParams.set("order", "volume24hr");
    url.searchParams.set("ascending", "false");
    const res = await fetch(url);
    if (!res.ok) return [];
    const events = (await res.json()) as Array<{
      title?: string;
      slug?: string;
      markets?: Array<{
        id?: string;
        question?: string;
        outcomes?: string | string[];
        outcomePrices?: string | string[];
        liquidityNum?: number;
        closed?: boolean;
      }>;
    }>;

    const candidates: PolymarketCandidate[] = [];
    for (const event of events) {
      // "Match winner" style events are small (<=3 markets: home / draw / away),
      // unlike prop-bet events with hundreds of markets — that's the filter.
      const markets = event.markets ?? [];
      if (markets.length === 0 || markets.length > 4) continue;
      for (const market of markets) {
        if (market.closed || !market.question) continue;
        const outcomes = parseJsonArray(market.outcomes);
        const prices = parseJsonArray(market.outcomePrices);
        const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === "yes");
        if (yesIndex === -1) continue;
        const yesPrice = Number(prices[yesIndex]);
        if (!Number.isFinite(yesPrice)) continue;
        candidates.push({
          eventTitle: event.title?.trim() ?? "",
          eventSlug: event.slug ?? "",
          marketId: String(market.id ?? ""),
          question: market.question.trim(),
          yesPrice,
          liquidityUsd: Number(market.liquidityNum ?? 0) || 0,
        });
      }
    }
    return candidates.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
  } catch (error) {
    console.warn("[discover] Polymarket fetch errored:", error instanceof Error ? error.message : error);
    return [];
  }
}

function printTxlineFixtures(fixtures: TxlineFixture[]): void {
  console.log(`\n=== TxLINE live fixtures (${fixtures.length}) ===`);
  if (fixtures.length === 0) {
    console.log("(none — TxLINE isn't covering a live match right now, or no session is activated)");
    return;
  }
  for (const fixture of fixtures) {
    console.log(`\n${fixture.homeTeam} vs ${fixture.awayTeam}  [${fixture.competition}]  fixtureId=${fixture.fixtureId}  live=${fixture.isLive}`);
    for (const selection of fixture.selections) {
      console.log(
        `    ${selection.selection.padEnd(6)} ${selection.label.padEnd(24)} odds=${selection.decimalOdds?.toFixed(2) ?? "—"}  outcomeId=${selection.outcomeId}`,
      );
    }
  }
}

function printPolymarketCandidates(candidates: PolymarketCandidate[]): void {
  console.log(`\n=== Polymarket live World Cup match markets (${candidates.length}) ===`);
  if (candidates.length === 0) {
    console.log("(none found — tag_slug=fifa-world-cup may have changed, check gamma-api.polymarket.com)");
    return;
  }
  for (const candidate of candidates.slice(0, 40)) {
    console.log(
      `  id=${candidate.marketId.padEnd(9)} yes=${candidate.yesPrice.toFixed(3)}  liq=$${Math.round(candidate.liquidityUsd).toLocaleString()}  "${candidate.question}"  (${candidate.eventTitle})`,
    );
  }
}

function printSkeleton(fixtures: TxlineFixture[]): void {
  if (fixtures.length === 0) return;
  console.log("\n=== Paste-and-edit skeleton for data/market-map.json ===");
  console.log("// Fill in the venueMarketId for each selection from the Polymarket table above, then copy this array into data/market-map.json.");
  const skeleton = fixtures.flatMap((fixture) =>
    fixture.selections.map((selection) => ({
      outcomeId: selection.outcomeId,
      txline: { fixtureId: fixture.fixtureId, market: "1x2", selection: selection.selection },
      venues: [{ venue: "polymarket", venueMarketId: "REPLACE_ME", yesMeansSelection: true }],
      mappingConfidence: "exact",
      note: `${fixture.homeTeam} vs ${fixture.awayTeam} — ${selection.label}`,
    })),
  );
  console.log(JSON.stringify(skeleton, null, 2));
}

async function main() {
  console.log(`[discover] base=${BASE_URL} network=${NETWORK}`);
  const [fixtures, candidates] = await Promise.all([fetchTxlineFixtures(), fetchPolymarketCandidates()]);
  printTxlineFixtures(fixtures);
  printPolymarketCandidates(candidates);
  printSkeleton(fixtures);
}

void main();
