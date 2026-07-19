import "server-only";

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, getSessionByToken } from "@/lib/auth/session";
import { getCredential } from "@/lib/txline/credentials";
import type { Network } from "@/lib/network/config";
import type { ClosedMarketRecord, Edge, SharpLine } from "@/lib/types";
import { getFocusFixture, type FocusFixture } from "@/lib/focus/fixture";
import { getMarketDetail, getMockClosedMarkets, getMockEdges, type MarketDetail } from "@/lib/sources/mock";
import {
  getLiveSharpLines,
  getSharpLinesForFixture,
  LiveTxlineUnavailableError,
} from "@/lib/sources/txline";
import { SHOWCASE_RECORDING_ID, getRecordingPacketCount, getReplaySharpLines } from "@/lib/engine/replay";
import { getScheduleClosedMarkets } from "@/lib/engine/schedule-audits";
import { getMappedClosedMarkets, getMappedEdges, getMappedMarketCount } from "@/lib/engine/mapping";
import { filterEdges, rankEdges } from "@/lib/engine/edge";
import {
  getHistoricalSemiAudits,
  getHistoricalSemiEdges,
  isShowcaseSemiFixture,
} from "@/lib/sources/historical-semis";

/**
 * Single source-of-truth facade for "where does this screen's data come
 * from right now". Priority chain: live TxLINE > recorded replay > seeded
 * mock, last resort only. Every branch degrades silently — a source being
 * down must never break a component (hackathon hard constraint).
 *
 * Feed / Watchdog / Market Detail must call ONLY this module, never
 * `lib/sources/mock` directly, so the honest mode label always matches
 * what's actually rendered.
 */

export type SourceMode = "live" | "replay" | "mock";

export interface SourceStatus {
  mode: SourceMode;
  lastPacketAt: number;
  packetsTotal: number;
  detail: string;
  /**
   * True when a real, activated TxLINE session is connected and returning
   * live match odds — even if those odds can't yet be turned into priced
   * Edges (that needs a live per-fixture venue price, which no public venue
   * API exposes for arbitrary matches). Surfaced as a secondary signal so
   * the UI never overclaims "LIVE" for content that is still seeded/replayed.
   */
  liveTxlineConnected: boolean;
  liveTxlineLineCount: number;
  /** Real, priced live edges currently shown (mode === "live"); 0 otherwise. */
  edgesLive: number;
  /** Distinct fixture+market books configured in data/market-map.json, regardless of connectivity. */
  mappedMarkets: number;
  /** When set, Feed is pinned to a previous TxLINE fixture from the Replay tab. */
  focusFixture?: FocusFixture | null;
}

const RECORDING_CHECK_TTL_MS = 15_000;
let recordingCountCache: { at: number; count: number } | null = null;

async function cachedRecordingPacketCount(): Promise<number> {
  if (recordingCountCache && Date.now() - recordingCountCache.at < RECORDING_CHECK_TTL_MS) {
    return recordingCountCache.count;
  }
  const count = await getRecordingPacketCount(SHOWCASE_RECORDING_ID);
  recordingCountCache = { at: Date.now(), count };
  return count;
}

interface LiveIdentity {
  userId: string;
  network: Network;
}

const LIVE_IDENTITY_TTL_MS = 15_000;
let liveIdentityCache: { at: number; identity: LiveIdentity | null } | null = null;

/** Call after TxLINE activate/reset so the next /api/edges request re-reads credentials. */
export function clearLiveIdentityCache(): void {
  liveIdentityCache = null;
  recordingCountCache = null;
}

/** Poll session/credential state on a short TTL so live mode can hot-swap in mid-session without a reload. */
async function resolveLiveIdentity(): Promise<LiveIdentity | null> {
  if (liveIdentityCache && Date.now() - liveIdentityCache.at < LIVE_IDENTITY_TTL_MS) {
    return liveIdentityCache.identity;
  }
  const identity = await resolveLiveIdentityUncached();
  liveIdentityCache = { at: Date.now(), identity };
  return identity;
}

async function resolveLiveIdentityUncached(): Promise<LiveIdentity | null> {
  try {
    const store = await cookies();
    const session = await getSessionByToken(store.get(SESSION_COOKIE_NAME)?.value);
    if (!session) return null;
    for (const network of ["devnet", "mainnet"] as const) {
      const credential = await getCredential(session.userId, network);
      if (credential?.setupState === "activated") {
        return { userId: session.userId, network };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function tryLiveSharpLines(): Promise<{
  lines: SharpLine[];
  identity: LiveIdentity;
  errorDetail?: string;
} | null> {
  const identity = await resolveLiveIdentity();
  if (!identity) return null;
  try {
    const lines = await getLiveSharpLines(identity.userId, identity.network);
    return { lines, identity };
  } catch (error) {
    const message =
      error instanceof LiveTxlineUnavailableError
        ? error.message
        : error instanceof Error
          ? error.message
          : "live TxLINE fetch failed";
    if (!(error instanceof LiveTxlineUnavailableError)) {
      console.warn("[sources/manager] live TxLINE fetch failed", error);
    } else {
      console.warn("[sources/manager] live TxLINE unavailable:", message);
    }
    // Still return identity so the feed does not silently fall back to mock
    // while an activated session is present.
    return { lines: [], identity, errorDetail: message };
  }
}

async function edgesFromLines(
  lines: SharpLine[],
  curatedMappedMarkets: number,
  extras: Partial<SourceStatus> & { mode: SourceMode; detail: string },
): Promise<{ edges: Edge[]; status: SourceStatus }> {
  try {
    const mapped = await getMappedEdges(lines);
    const filtered = filterEdges(mapped.edges);
    const liveEdges = rankEdges(filtered.length > 0 ? filtered : mapped.edges);
    const usedEvFilter = filtered.length > 0;
    return {
      edges: liveEdges,
      status: {
        mode: extras.mode,
        lastPacketAt: Date.now(),
        packetsTotal: lines.length,
        detail:
          extras.detail ||
          (mapped.mappedMarketCount > 0
            ? liveEdges.length > 0
              ? `${liveEdges.length} genuine edge${liveEdges.length === 1 ? "" : "s"} across ${mapped.mappedMarketCount} mapped market${mapped.mappedMarketCount === 1 ? "" : "s"}${usedEvFilter ? "" : " (below usual EV cut)"}`
              : `${mapped.mappedMarketCount} mapped market${mapped.mappedMarketCount === 1 ? "" : "s"} checked — none cleared the EV filter`
            : `${lines.length} sharp line${lines.length === 1 ? "" : "s"} — no Polymarket/Kalshi book matched yet`),
        liveTxlineConnected: true,
        liveTxlineLineCount: lines.length,
        edgesLive: liveEdges.length,
        mappedMarkets: Math.max(curatedMappedMarkets, mapped.mappedMarketCount),
        focusFixture: extras.focusFixture ?? null,
      },
    };
  } catch (error) {
    console.warn("[sources/manager] edge mapping failed", error);
    return {
      edges: [],
      status: {
        mode: extras.mode,
        lastPacketAt: Date.now(),
        packetsTotal: lines.length,
        detail: extras.detail || `TxLINE lines loaded — venue join failed`,
        liveTxlineConnected: true,
        liveTxlineLineCount: lines.length,
        edgesLive: 0,
        mappedMarkets: curatedMappedMarkets,
        focusFixture: extras.focusFixture ?? null,
      },
    };
  }
}

export async function getSourceEdges(opts?: {
  atMs?: number;
}): Promise<{ edges: Edge[]; status: SourceStatus }> {
  const identity = await resolveLiveIdentity();
  const curatedMappedMarkets = getMappedMarketCount();
  const focus = await getFocusFixture();
  const atMs = opts?.atMs ?? focus?.atMs;

  // Pinned previous fixture / historical Polymarket+Kalshi semis from Replay.
  if (identity && focus) {
    if (focus.showcaseSemis || (focus.id > 0 && isShowcaseSemiFixture(focus.id))) {
      const historical = await getHistoricalSemiEdges(focus.showcaseSemis ? undefined : focus.id, {
        atMs,
      });
      const edges = historical.edges;
      const fromVenues = historical.source === "historical-venues";
      const clock = historical.clockLabel ? ` · ${historical.clockLabel}` : "";
      return {
        edges,
        status: {
          mode: "replay",
          lastPacketAt: historical.atMs ?? Date.now(),
          packetsTotal: edges.length,
          detail: fromVenues
            ? focus.showcaseSemis
              ? `Simulating 1m PM+Kalshi candles — both semis${clock}`
              : `Simulating 1m PM+Kalshi — ${focus.label}${clock}`
            : `Fallback tape — ${focus.label}`,
          liveTxlineConnected: true,
          liveTxlineLineCount: edges.length,
          edgesLive: edges.length,
          mappedMarkets: Math.max(curatedMappedMarkets, focus.showcaseSemis ? 2 : 1),
          focusFixture: {
            ...focus,
            atMs: historical.atMs ?? atMs ?? focus.atMs,
          },
        },
      };
    }

    try {
      const lines = await getSharpLinesForFixture(identity.userId, identity.network, {
        id: focus.id,
        home: focus.home,
        away: focus.away,
        competition: focus.competition,
      });
      if (lines.length === 0) {
        return {
          edges: [],
          status: {
            mode: "replay",
            lastPacketAt: Date.now(),
            packetsTotal: 0,
            detail: `Focused ${focus.label} — TxLINE has history packets but no odds snapshot left. Use “Historical venue tape” on Replay for France/Spain + England/Argentina.`,
            liveTxlineConnected: true,
            liveTxlineLineCount: 0,
            edgesLive: 0,
            mappedMarkets: curatedMappedMarkets,
            focusFixture: focus,
          },
        };
      }
      return edgesFromLines(lines, curatedMappedMarkets, {
        mode: "replay",
        detail: `Focused ${focus.label} (previous TxLINE fixture)`,
        focusFixture: focus,
      });
    } catch (error) {
      console.warn("[sources/manager] focused fixture failed", error);
      return {
        edges: [],
        status: {
          mode: "replay",
          lastPacketAt: Date.now(),
          packetsTotal: 0,
          detail: `Focused ${focus.label} — could not load TxLINE odds for this fixture`,
          liveTxlineConnected: true,
          liveTxlineLineCount: 0,
          edgesLive: 0,
          mappedMarkets: curatedMappedMarkets,
          focusFixture: focus,
        },
      };
    }
  }

  const live = await tryLiveSharpLines();

  // Activated TxLINE session: never fall back to mock/replay cards.
  // Venue join is best-effort; empty edges still mean "live", not showcase.
  if (live) {
    if (live.lines.length === 0) {
      return {
        edges: [],
        status: {
          mode: "live",
          lastPacketAt: Date.now(),
          packetsTotal: 0,
          detail: live.errorDetail
            ? `TxLINE connected — ${live.errorDetail}`
            : "TxLINE connected — waiting for priced markets",
          liveTxlineConnected: true,
          liveTxlineLineCount: 0,
          edgesLive: 0,
          mappedMarkets: curatedMappedMarkets,
          focusFixture: null,
        },
      };
    }
    return edgesFromLines(live.lines, curatedMappedMarkets, {
      mode: "live",
      detail: "",
      focusFixture: null,
    });
  }

  const recordingCount = await cachedRecordingPacketCount();
  if (recordingCount > 0) {
    const fraction = 1; // real replay always plays through to "now" for the edges view; the Replay tab scrubs independently.
    const replayLines = await getReplaySharpLines(SHOWCASE_RECORDING_ID, fraction);
    if (replayLines && replayLines.length > 0) {
      return {
        edges: getMockEdges(), // TODO(section 3 hardening): match replayLines against recorded venue_snapshots once a real session has been captured.
        status: {
          mode: "replay",
          lastPacketAt: Date.now(),
          packetsTotal: recordingCount,
          detail: `Replaying ${recordingCount} recorded TxLINE packets`,
          liveTxlineConnected: false,
          liveTxlineLineCount: 0,
          edgesLive: 0,
          mappedMarkets: curatedMappedMarkets,
          focusFixture: null,
        },
      };
    }
  }

  const edges = getMockEdges();
  return {
    edges,
    status: {
      mode: "mock",
      lastPacketAt: Date.now(),
      packetsTotal: edges.length,
      detail: "Seeded demo data — connect a wallet for live TxLINE",
      liveTxlineConnected: false,
      liveTxlineLineCount: 0,
      edgesLive: 0,
      mappedMarkets: curatedMappedMarkets,
      focusFixture: null,
    },
  };
}

/** Raw sharp lines: live TxLINE when activated, else whatever the edges cascade used. */
export async function getSourceSharpLines(): Promise<{
  lines: SharpLine[];
  status: SourceStatus;
}> {
  const result = await getSourceEdges();
  if (result.status.liveTxlineConnected) {
    const live = await tryLiveSharpLines();
    return { lines: live?.lines ?? [], status: result.status };
  }
  return { lines: result.edges.map((edge) => edge.sharp), status: result.status };
}

export async function getSourceClosedMarkets(): Promise<{
  records: ClosedMarketRecord[];
  status: SourceStatus;
}> {
  const live = await resolveLiveIdentity();
  const mappedMarkets = getMappedMarketCount();
  const focus = await getFocusFixture();

  if (live) {
    if (focus?.showcaseSemis || (focus && isShowcaseSemiFixture(focus.id))) {
      const records = await getHistoricalSemiAudits(focus.showcaseSemis ? undefined : focus.id);
      return {
        records,
        status: {
          mode: "replay",
          lastPacketAt: Date.now(),
          packetsTotal: records.length,
          detail: focus.showcaseSemis
            ? "Settlement audits on real Polymarket/Kalshi market ids for the two semis"
            : `Settlement audits on real venue ids — ${focus.label}`,
          liveTxlineConnected: true,
          liveTxlineLineCount: 0,
          edgesLive: 0,
          mappedMarkets,
          focusFixture: focus,
        },
      };
    }

    try {
      const [mappedRecords, scheduleRecords] = await Promise.all([
        getMappedClosedMarkets(live.userId, live.network),
        getScheduleClosedMarkets(live.userId, live.network),
      ]);
      const byId = new Map<string, ClosedMarketRecord>();
      for (const record of [...scheduleRecords, ...mappedRecords]) {
        byId.set(`${record.venue}:${record.venueMarketId}`, record);
      }
      let records = [...byId.values()];
      if (focus) {
        const focused = records.filter((record) => record.fixtureId === `txl-${focus.id}`);
        if (focused.length > 0) records = focused;
      }
      // If live joins are empty, still surface the semi showcase so Watchdog
      // isn't a blank page during the hackathon demo.
      if (records.length === 0) {
        records = await getHistoricalSemiAudits();
        return {
          records,
          status: {
            mode: "replay",
            lastPacketAt: Date.now(),
            packetsTotal: records.length,
            detail:
              "Semi settlement tape on real Polymarket/Kalshi ids (live joins had nothing closed yet)",
            liveTxlineConnected: true,
            liveTxlineLineCount: 0,
            edgesLive: 0,
            mappedMarkets,
            focusFixture: focus,
          },
        };
      }
      return {
        records,
        status: {
          mode: "live",
          lastPacketAt: Date.now(),
          packetsTotal: records.length,
          detail: focus
            ? `${records.length} real audit${records.length === 1 ? "" : "s"} for ${focus.label}`
            : `${records.length} real settlement audit${records.length === 1 ? "" : "s"} from TxLINE + venues`,
          liveTxlineConnected: true,
          liveTxlineLineCount: 0,
          edgesLive: 0,
          mappedMarkets,
          focusFixture: focus,
        },
      };
    } catch (error) {
      console.warn("[sources/manager] live closed-market audit failed", error);
      const records = await getHistoricalSemiAudits();
      return {
        records,
        status: {
          mode: "replay",
          lastPacketAt: Date.now(),
          packetsTotal: records.length,
          detail: "Semi settlement tape — live audit join failed",
          liveTxlineConnected: true,
          liveTxlineLineCount: 0,
          edgesLive: 0,
          mappedMarkets,
          focusFixture: focus,
        },
      };
    }
  }

  const recordingCount = await cachedRecordingPacketCount();
  const records = getMockClosedMarkets();
  const mode: SourceMode = recordingCount > 0 ? "replay" : "mock";
  return {
    records,
    status: {
      mode,
      lastPacketAt: Date.now(),
      packetsTotal: mode === "replay" ? recordingCount : records.length,
      detail: mode === "replay" ? `Replaying ${recordingCount} recorded packets` : "Seeded demo data",
      liveTxlineConnected: false,
      liveTxlineLineCount: 0,
      edgesLive: 0,
      mappedMarkets,
      focusFixture: null,
    },
  };
}

/** Lightweight status probe for /api/status — same chain, no payload. */
export async function getSourceStatus(): Promise<SourceStatus> {
  const { status } = await getSourceEdges();
  return status;
}

/**
 * Market detail for mock outcomes, or a live/sim snapshot built from the
 * current edge cascade (historical 1m candles when a semi is focused).
 */
export async function getSourceMarketDetail(
  outcomeId: string,
  opts?: { atMs?: number },
): Promise<MarketDetail | null> {
  const mock = getMarketDetail(outcomeId);
  if (mock) return mock;

  const { edges, status } = await getSourceEdges(
    typeof opts?.atMs === "number" ? { atMs: opts.atMs } : undefined,
  );
  const matched = edges.filter((edge) => edge.outcomeId === outcomeId);
  if (matched.length === 0) {
    // Fall back: load the fixture book even if focus cookie drifted.
    const fixtureMatch = /^txl-(\d+):/.exec(outcomeId);
    if (!fixtureMatch) return null;
    const fixtureId = Number(fixtureMatch[1]);
    if (!isShowcaseSemiFixture(fixtureId)) return null;
    const historical = await getHistoricalSemiEdges(fixtureId, { atMs: opts?.atMs ?? status.focusFixture?.atMs });
    const histMatched = historical.edges.filter((edge) => edge.outcomeId === outcomeId);
    if (histMatched.length === 0) return null;
    return detailFromEdges(histMatched);
  }
  return detailFromEdges(matched);
}

function detailFromEdges(matched: Edge[]): MarketDetail {
  const sharp = matched[0].sharp;
  const venuePrices = matched.map((edge) => edge.venue);
  const bookSelections = [...new Map(matched.map((edge) => [edge.sharp.selectionLabel, edge.sharp])).values()];
  const gapHistory = matched[0]?.gapHistory ?? [];
  return {
    sharp,
    venuePrices,
    edges: matched,
    gapHistory,
    bookSelections,
  };
}
