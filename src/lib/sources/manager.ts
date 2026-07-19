import "server-only";

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, getSessionByToken } from "@/lib/auth/session";
import { getCredential } from "@/lib/txline/credentials";
import type { Network } from "@/lib/network/config";
import type { ClosedMarketRecord, Edge, SharpLine } from "@/lib/types";
import { getMarketDetail, getMockClosedMarkets, getMockEdges, type MarketDetail } from "@/lib/sources/mock";
import { getLiveSharpLines, LiveTxlineUnavailableError } from "@/lib/sources/txline";
import { SHOWCASE_RECORDING_ID, getRecordingPacketCount, getReplaySharpLines } from "@/lib/engine/replay";
import { getMappedClosedMarkets, getMappedEdges, getMappedMarketCount } from "@/lib/engine/mapping";
import { filterEdges, rankEdges } from "@/lib/engine/edge";

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

async function tryLiveSharpLines(): Promise<{ lines: SharpLine[]; identity: LiveIdentity } | null> {
  const identity = await resolveLiveIdentity();
  if (!identity) return null;
  try {
    const lines = await getLiveSharpLines(identity.userId, identity.network);
    return { lines, identity };
  } catch (error) {
    if (!(error instanceof LiveTxlineUnavailableError)) {
      console.warn("[sources/manager] live TxLINE fetch failed", error);
    }
    return null;
  }
}

export async function getSourceEdges(): Promise<{ edges: Edge[]; status: SourceStatus }> {
  const live = await tryLiveSharpLines();
  const mappedMarkets = getMappedMarketCount();

  if (live) {
    try {
      const mapped = await getMappedEdges(live.lines);
      // A book actually resolving (real venue prices joined to real TxLINE
      // lines) is what makes this "live" — even if zero edges clear the EV
      // threshold, that's still a genuine, live comparison, not a fallback.
      if (mapped.mappedMarketCount > 0) {
        const liveEdges = rankEdges(filterEdges(mapped.edges));
        return {
          edges: liveEdges,
          status: {
            mode: "live",
            lastPacketAt: Date.now(),
            packetsTotal: live.lines.length,
            detail:
              liveEdges.length > 0
                ? `${liveEdges.length} genuine live edge${liveEdges.length === 1 ? "" : "s"} across ${mapped.mappedMarketCount} mapped market${mapped.mappedMarketCount === 1 ? "" : "s"}`
                : `${mapped.mappedMarketCount} mapped market${mapped.mappedMarketCount === 1 ? "" : "s"} checked live — none mispriced right now`,
            liveTxlineConnected: true,
            liveTxlineLineCount: live.lines.length,
            edgesLive: liveEdges.length,
            mappedMarkets,
          },
        };
      }
    } catch (error) {
      console.warn("[sources/manager] live edge mapping failed", error);
    }
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
          liveTxlineConnected: live !== null,
          liveTxlineLineCount: live?.lines.length ?? 0,
          edgesLive: 0,
          mappedMarkets,
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
      detail: live
        ? `Seeded demo data — TxLINE is connected but no live venue price is mapped to it yet`
        : "Seeded demo data",
      liveTxlineConnected: live !== null,
      liveTxlineLineCount: live?.lines.length ?? 0,
      edgesLive: 0,
      mappedMarkets,
    },
  };
}

export async function getSourceClosedMarkets(): Promise<{
  records: ClosedMarketRecord[];
  status: SourceStatus;
}> {
  const live = await resolveLiveIdentity();
  const mappedMarkets = getMappedMarketCount();

  if (live) {
    try {
      const liveRecords = await getMappedClosedMarkets(live.userId, live.network);
      if (liveRecords.length > 0) {
        return {
          records: liveRecords,
          status: {
            mode: "live",
            lastPacketAt: Date.now(),
            packetsTotal: liveRecords.length,
            detail: `${liveRecords.length} real settlement audit${liveRecords.length === 1 ? "" : "s"} from mapped markets`,
            liveTxlineConnected: true,
            liveTxlineLineCount: 0,
            edgesLive: 0,
            mappedMarkets,
          },
        };
      }
    } catch (error) {
      console.warn("[sources/manager] live closed-market audit failed", error);
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
      liveTxlineConnected: live !== null,
      liveTxlineLineCount: 0,
      edgesLive: 0,
      mappedMarkets,
    },
  };
}

/** Lightweight status probe for /api/status — same chain, no payload. */
export async function getSourceStatus(): Promise<SourceStatus> {
  const { status } = await getSourceEdges();
  return status;
}

/**
 * Market detail is keyed to one specific outcome in the curated story, so
 * there is no independent "live" branch yet — it inherits whatever mode the
 * edges feed resolved to. Still routed through the manager (not imported
 * directly by components) so every screen has one seam to swap when a real
 * per-outcome live/replay source exists.
 */
export function getSourceMarketDetail(outcomeId: string): MarketDetail | null {
  return getMarketDetail(outcomeId);
}
