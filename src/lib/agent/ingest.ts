import "server-only";

import type { Network } from "@/lib/network/config";
import { txlineFetch } from "@/lib/txline/client";
import { parseSseDataLines, SseStreamDecoder } from "@/lib/txline/sse";
import { normalizeScoreEvent, type TxlineEvent } from "@/lib/txline/types";

/**
 * Mirrors /api/txline/history's parsing (JSON array, {scores: [...]}, or
 * newline-joined SSE data lines) without going through a browser session —
 * the agent runs as a standalone process authenticated by userId directly.
 */
export async function fetchHistoricalScoreEvents(
  userId: string,
  network: Network,
  fixtureId: number,
): Promise<TxlineEvent[]> {
  const upstream = await txlineFetch(
    userId,
    network,
    `/api/scores/historical/${fixtureId}`,
  );
  const text = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`History request failed (${upstream.status}): ${text.slice(0, 200)}`);
  }
  if (!text.trim()) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    const sseRecords = parseSseDataLines(text);
    if (sseRecords.length === 0) throw new Error("History response was not valid JSON");
    raw = sseRecords;
  }
  const records = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && "scores" in raw
      ? (raw as { scores: unknown }).scores
      : [];
  if (!Array.isArray(records)) throw new Error("Invalid history response");

  const normalized: TxlineEvent[] = [];
  for (const record of records) {
    try {
      normalized.push(normalizeScoreEvent(record, "history"));
    } catch {
      // Skip malformed rows rather than failing the whole replay.
    }
  }
  normalized.sort((a, b) => a.timestamp - b.timestamp);
  return normalized;
}

export async function* streamLiveScoreEvents(
  userId: string,
  network: Network,
  fixtureId: number,
  signal?: AbortSignal,
): AsyncGenerator<TxlineEvent> {
  const upstream = await txlineFetch(
    userId,
    network,
    `/api/scores/stream?fixtureId=${fixtureId}`,
    { signal },
  );
  if (!upstream.ok || !upstream.body) {
    throw new Error(`Live stream request failed (${upstream.status})`);
  }

  const decoder = new SseStreamDecoder();
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const message of decoder.push(value)) {
        if (!message.data) continue;
        let payload: unknown;
        try {
          payload = JSON.parse(message.data);
        } catch {
          continue;
        }
        try {
          yield normalizeScoreEvent(payload, "live");
        } catch {
          // Heartbeats and malformed records have no fixtureId/timestamp.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const MAX_REPLAY_STEP_WAIT_MS = 150;

/**
 * Replays historical events at accelerated speed, preserving relative gaps
 * — capped per step so outlier gaps (hours of pre-kickoff coverage pings,
 * the halftime break) can't stall a demo run for real minutes even at a
 * high speed multiplier.
 */
export async function* replayAtSpeed(
  events: TxlineEvent[],
  speedMultiplier: number,
): AsyncGenerator<TxlineEvent> {
  let previousTimestamp: number | null = null;
  for (const event of events) {
    if (previousTimestamp !== null) {
      const realGapMs = event.timestamp - previousTimestamp;
      const waitMs = Math.min(
        MAX_REPLAY_STEP_WAIT_MS,
        Math.max(0, realGapMs / speedMultiplier),
      );
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    previousTimestamp = event.timestamp;
    yield event;
  }
}
