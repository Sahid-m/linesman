"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useNetwork } from "@/components/app-providers";
import { ConnectWalletControl } from "@/components/linesman/connect-wallet-modal";
import { EdgeCard } from "@/components/linesman/edge-card";
import { isShowcaseSemiFixture } from "@/lib/sources/showcase-ids";
import type { SourceStatus } from "@/lib/sources/manager";
import { VENUE_SIM_SPEEDS, useVenueSimStore } from "@/lib/store/venue-sim-store";
import type { Edge } from "@/lib/types";
import type { PreviousFixture } from "@/lib/txline/previous";
import type { TxlineEvent } from "@/lib/txline/types";

type ListResponse = {
  fixtures?: PreviousFixture[];
  windowNote?: string;
  error?: string;
};

type VenueTimeline = {
  fixtureId: number;
  label: string;
  kickoffMs: number;
  startMs: number;
  endMs: number;
  minutes: number[];
};

const edgesFetcher = (url: string) => fetch(url).then((res) => res.json());

function formatWhen(ts: number | null): string {
  if (ts === null) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMatchClock(atMs: number, kickoffMs: number): string {
  const minute = Math.max(0, Math.round((atMs - kickoffMs) / 60_000));
  return `${minute}' · ${new Date(atMs).toISOString().slice(11, 16)} UTC`;
}

export function PreviousTxlinePanel() {
  const { network } = useNetwork();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [fixtures, setFixtures] = useState<PreviousFixture[]>([]);
  const [windowNote, setWindowNote] = useState<string>("");
  const [listError, setListError] = useState<string>();
  const [listLoading, setListLoading] = useState(false);
  const [events, setEvents] = useState<TxlineEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const [packetCursor, setPacketCursor] = useState(0);
  const [packetPlaying, setPacketPlaying] = useState(false);
  const [packetSpeed, setPacketSpeed] = useState<(typeof VENUE_SIM_SPEEDS)[number]>(1);

  const fixtureId = useVenueSimStore((state) => state.fixtureId);
  const label = useVenueSimStore((state) => state.label);
  const atMs = useVenueSimStore((state) => state.atMs);
  const kickoffMs = useVenueSimStore((state) => state.kickoffMs);
  const minutes = useVenueSimStore((state) => state.minutes);
  const minuteIndex = useVenueSimStore((state) => state.minuteIndex);
  const playing = useVenueSimStore((state) => state.playing);
  const speed = useVenueSimStore((state) => state.speed);
  const arm = useVenueSimStore((state) => state.arm);
  const togglePlaying = useVenueSimStore((state) => state.togglePlaying);
  const setSpeed = useVenueSimStore((state) => state.setSpeed);
  const setMinuteIndex = useVenueSimStore((state) => state.setMinuteIndex);

  const venueMode = fixtureId != null && isShowcaseSemiFixture(fixtureId);

  const { data: edgesData } = useSWR<{ edges: Edge[]; status: SourceStatus }>(
    venueMode && atMs != null ? `/api/edges?atMs=${atMs}` : null,
    edgesFetcher,
    { refreshInterval: 0, revalidateOnFocus: false },
  );

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      setAuthed(res.ok);
      return res.ok;
    } catch {
      setAuthed(false);
      return false;
    }
  }, []);

  const loadFixtures = useCallback(async () => {
    setListLoading(true);
    setListError(undefined);
    try {
      const res = await fetch(`/api/txline/previous?network=${network}`);
      const body = (await res.json()) as ListResponse;
      if (!res.ok) throw new Error(body.error ?? "Could not load previous fixtures");
      setFixtures(body.fixtures ?? []);
      setWindowNote(body.windowNote ?? "");
    } catch (error) {
      setFixtures([]);
      setListError(error instanceof Error ? error.message : "Load failed");
    } finally {
      setListLoading(false);
    }
  }, [network]);

  useEffect(() => {
    void refreshAuth().then((ok) => {
      if (ok) void loadFixtures();
    });
  }, [refreshAuth, loadFixtures]);

  // Non-venue TxLINE packet scrubber only.
  useEffect(() => {
    if (!packetPlaying || venueMode || events.length === 0) return;
    const intervalMs = Math.max(80, 1_000 / packetSpeed);
    const timer = setInterval(() => {
      setPacketCursor((prev) => {
        if (prev >= events.length - 1) {
          setPacketPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [packetPlaying, packetSpeed, venueMode, events.length]);

  const loadHistory = useCallback(
    async (fixture: PreviousFixture) => {
      const [home = fixture.label, away = ""] = fixture.label.split(/\s+vs\.?\s+/i);
      const meta = {
        label: fixture.label,
        home: home.trim(),
        away: away.trim() || "Away",
        competition: fixture.competition,
        finalScore: fixture.finalScore,
      };
      setHistoryLoading(true);
      setHistoryError(undefined);
      setEvents([]);
      setPacketCursor(0);
      setPacketPlaying(false);

      try {
        if (isShowcaseSemiFixture(fixture.id)) {
          const timelineRes = await fetch(`/api/replay/venue-timeline?fixtureId=${fixture.id}`);
          const timelineBody = (await timelineRes.json()) as VenueTimeline & { error?: string };
          if (!timelineRes.ok) throw new Error(timelineBody.error ?? "Venue timeline failed");

          arm({
            fixtureId: fixture.id,
            ...meta,
            kickoffMs: timelineBody.kickoffMs,
            minutes: timelineBody.minutes,
          });

          await fetch("/api/focus", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: fixture.id,
              ...meta,
              atMs: timelineBody.minutes[0] ?? timelineBody.kickoffMs,
            }),
          });
          // Start simulating immediately so Feed/Watchdog move without a second click.
          useVenueSimStore.getState().setPlaying(true);
          useVenueSimStore.getState().setSpeed(
            useVenueSimStore.getState().speed >= 10 ? useVenueSimStore.getState().speed : 10,
          );
          void mutate((key) => typeof key === "string" && key.startsWith("/api/edges"));
          void mutate((key) => typeof key === "string" && key.startsWith("/api/watchdog"));
          void mutate("/api/status");
        } else {
          useVenueSimStore.getState().clear();
          await fetch("/api/focus", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: fixture.id, ...meta }),
          });
          void mutate("/api/edges");
          void mutate("/api/watchdog");
          void mutate("/api/status");
        }

        const res = await fetch(`/api/txline/history/${fixture.id}?network=${network}`);
        const body: unknown = await res.json();
        if (res.ok && Array.isArray(body)) {
          setEvents(body as TxlineEvent[]);
        } else if (!isShowcaseSemiFixture(fixture.id)) {
          const message =
            body && typeof body === "object" && "error" in body
              ? String((body as { error: unknown }).error)
              : "History request failed";
          throw new Error(message);
        }
        if (!isShowcaseSemiFixture(fixture.id) && Array.isArray(body) && body.length === 0) {
          setHistoryError(
            "No historical sequence for this fixture. TxLINE only returns data for kickoffs 2 weeks–6 hours ago.",
          );
        }
      } catch (error) {
        setHistoryError(error instanceof Error ? error.message : "History failed");
      } finally {
        setHistoryLoading(false);
      }
    },
    [network, arm],
  );

  const selected = useMemo(
    () => fixtures.find((fixture) => fixture.id === fixtureId) ?? null,
    [fixtures, fixtureId],
  );
  const current = events[packetCursor];
  const payload =
    current?.payload && typeof current.payload === "object"
      ? (current.payload as Record<string, unknown>)
      : undefined;
  const speedIndex = VENUE_SIM_SPEEDS.indexOf(speed);
  const packetSpeedIndex = VENUE_SIM_SPEEDS.indexOf(packetSpeed);
  const edges = edgesData?.edges ?? [];

  if (authed === false) {
    return (
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
        <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Previous from TxLINE</p>
        <h2 className="mt-1 font-display text-2xl text-[color:var(--color-text)]">Pull real past scores</h2>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          Connect and activate TxLINE first — historical scores require an activated session.
        </p>
        <div className="mt-4 max-w-xs">
          <ConnectWalletControl variant="nav" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Previous from TxLINE</p>
          <h2 className="mt-1 font-display text-2xl text-[color:var(--color-text)]">Simulate a past match</h2>
          <p className="mt-2 max-w-xl text-sm text-[color:var(--color-muted)]">
            {windowNote ||
              "Pick a semi with 1m venue replay, hit ▶ at 10×/15×, then open Edge Feed or Watchdog — they follow the same clock."}
          </p>
        </div>
        <button
          type="button"
          disabled={listLoading || authed !== true}
          onClick={() => void loadFixtures()}
          className="rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ color: "var(--color-bg)", background: "var(--color-accent)" }}
        >
          {listLoading ? "Loading…" : "Refresh list"}
        </button>
      </div>

      {listError && (
        <p className="mt-3 text-sm" style={{ color: "var(--color-alert)" }} role="alert">
          {listError}
        </p>
      )}

      <div className="mt-4 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto lg:grid-cols-2">
        {fixtures.map((fixture) => {
          const active = fixture.id === fixtureId;
          const venue = isShowcaseSemiFixture(fixture.id);
          return (
            <button
              key={fixture.id}
              type="button"
              onClick={() => void loadHistory(fixture)}
              className="rounded-xl border p-3 text-left transition-colors"
              style={{
                borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                background: active
                  ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-bg))"
                  : "var(--color-bg)",
              }}
            >
              <p className="text-sm font-semibold text-[color:var(--color-text)]">{fixture.label}</p>
              <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">
                {fixture.competition}
                {fixture.finalScore ? ` · ${fixture.finalScore}` : ""}
                {venue ? " · 1m venue replay" : ""}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--color-muted)]">
                {formatWhen(fixture.startTime)}
                {fixture.inReplayWindow ? " · in window" : " · try anyway"}
              </p>
            </button>
          );
        })}
        {!listLoading && fixtures.length === 0 && !listError && (
          <p className="text-sm text-[color:var(--color-muted)] lg:col-span-2">
            No previous fixtures listed yet. Activate TxLINE, then hit Refresh.
          </p>
        )}
      </div>

      {(selected || historyLoading || historyError || fixtureId != null) && (
        <div className="mt-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[color:var(--color-text)]">
                {label ?? selected?.label ?? "History"}
              </p>
              <p className="text-[11px] text-[color:var(--color-accent)]">
                {venueMode && atMs != null && kickoffMs != null
                  ? `App-wide sim · ${formatMatchClock(atMs, kickoffMs)} — Feed & Watchdog follow`
                  : "Pinned TxLINE packet scrubber (this fixture only)"}
              </p>
            </div>
            <p className="text-xs text-[color:var(--color-muted)]">
              {historyLoading
                ? "Fetching…"
                : venueMode
                  ? `${minuteIndex + 1} / ${minutes.length} min`
                  : events.length
                    ? `${packetCursor + 1} / ${events.length} packets`
                    : "—"}
            </p>
          </div>

          {historyError && (
            <p className="mt-2 text-sm" style={{ color: "var(--color-alert)" }} role="alert">
              {historyError}
            </p>
          )}

          {(venueMode ? minutes.length > 0 : events.length > 0) && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => (venueMode ? togglePlaying() : setPacketPlaying((v) => !v))}
                  aria-label={playing || packetPlaying ? "Pause" : "Play"}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-[color:var(--color-bg)]"
                  style={{ background: "var(--color-accent)" }}
                >
                  {(venueMode ? playing : packetPlaying) ? "❙❙" : "▶"}
                </button>
                <div className="min-w-[180px] flex-1">
                  <p className="mb-1 text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                    Speed · {venueMode ? speed : packetSpeed}×
                  </p>
                  <input
                    aria-label="Replay speed"
                    type="range"
                    min={0}
                    max={VENUE_SIM_SPEEDS.length - 1}
                    step={1}
                    value={venueMode ? (speedIndex < 0 ? 0 : speedIndex) : packetSpeedIndex < 0 ? 0 : packetSpeedIndex}
                    onChange={(event) => {
                      const next = VENUE_SIM_SPEEDS[Number(event.target.value)];
                      if (venueMode) setSpeed(next);
                      else setPacketSpeed(next);
                    }}
                    className="w-full accent-[color:var(--color-accent)]"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] text-[color:var(--color-muted)]">
                    {VENUE_SIM_SPEEDS.map((value) => (
                      <span key={value}>{value}×</span>
                    ))}
                  </div>
                </div>
              </div>

              {venueMode ? (
                <input
                  aria-label="Match minute"
                  type="range"
                  min={0}
                  max={Math.max(0, minutes.length - 1)}
                  value={minuteIndex}
                  onChange={(event) => setMinuteIndex(Number(event.target.value))}
                  className="mt-3 w-full accent-[color:var(--color-accent)]"
                />
              ) : (
                <input
                  aria-label="History position"
                  type="range"
                  min={0}
                  max={Math.max(0, events.length - 1)}
                  value={packetCursor}
                  onChange={(event) => {
                    setPacketPlaying(false);
                    setPacketCursor(Number(event.target.value));
                  }}
                  className="mt-3 w-full accent-[color:var(--color-accent)]"
                />
              )}

              {!venueMode && (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[color:var(--color-muted)] sm:grid-cols-4">
                  <div>
                    <dt>Time</dt>
                    <dd className="text-[color:var(--color-text)]">
                      {current ? formatWhen(current.timestamp) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Seq</dt>
                    <dd className="text-[color:var(--color-text)]">{current?.seq ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Game state</dt>
                    <dd className="text-[color:var(--color-text)]">
                      {payload && "GameState" in payload
                        ? String(payload.GameState)
                        : payload && "gameState" in payload
                          ? String(payload.gameState)
                          : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd className="text-[color:var(--color-text)]">{current?.source ?? "history"}</dd>
                  </div>
                </dl>
              )}

              {venueMode && (
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                    Live prices at this minute
                  </p>
                  <p className="mt-0.5 text-[11px] text-[color:var(--color-muted)]">
                    {edgesData?.status.detail ?? "Sampling Polymarket + Kalshi…"} Open Edge Feed / Watchdog —
                    they use this same clock.
                  </p>
                  {edges.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {edges.map((edge) => (
                        <EdgeCard
                          key={`${edge.outcomeId}:${edge.venue.venue}:${edge.sharp.packetTimestamp}`}
                          edge={edge}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[color:var(--color-muted)]">Loading candle prices…</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
