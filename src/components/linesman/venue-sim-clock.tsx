"use client";

import { useEffect, useRef } from "react";
import { mutate } from "swr";
import { isShowcaseSemiFixture } from "@/lib/sources/showcase-ids";
import { useReplayStore } from "@/lib/store/replay-store";
import { useVenueSimStore } from "@/lib/store/venue-sim-store";

async function syncFocusCookie() {
  const state = useVenueSimStore.getState();
  if (
    state.fixtureId == null ||
    state.atMs == null ||
    !state.label ||
    !state.home ||
    !state.away
  ) {
    return;
  }
  await fetch("/api/focus", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: state.fixtureId,
      label: state.label,
      home: state.home,
      away: state.away,
      competition: state.competition,
      finalScore: state.finalScore,
      atMs: Math.round(state.atMs),
    }),
  });
}

/**
 * App-wide simulation clock. Persisted in localStorage so phone-preview iframes
 * and tab switches keep the same match-minute.
 */
export function VenueSimClock() {
  const playing = useVenueSimStore((state) => state.playing);
  const speed = useVenueSimStore((state) => state.speed);
  const fixtureId = useVenueSimStore((state) => state.fixtureId);
  const atMs = useVenueSimStore((state) => state.atMs);
  const hydrated = useVenueSimStore((state) => state.hydrated);
  const setReplayMode = useReplayStore((state) => state.setReplayMode);
  const lastCookieAt = useRef<number | null>(null);
  const rehydrateAttempted = useRef(false);

  // Ensure persist hydration flag flips even if onRehydrateStorage was skipped.
  useEffect(() => {
    const unsub = useVenueSimStore.persist.onFinishHydration(() => {
      useVenueSimStore.getState().setHydrated(true);
    });
    if (useVenueSimStore.persist.hasHydrated()) {
      useVenueSimStore.getState().setHydrated(true);
    }
    return unsub;
  }, []);

  // If memory store is empty but the focus cookie still pins a semi, rebuild the timeline.
  useEffect(() => {
    if (!hydrated || rehydrateAttempted.current) return;
    rehydrateAttempted.current = true;
    const current = useVenueSimStore.getState();
    if (current.fixtureId != null && current.minutes.length > 1) return;

    void (async () => {
      try {
        const res = await fetch("/api/focus");
        const body = (await res.json()) as {
          focus?: {
            id: number;
            label: string;
            home: string;
            away: string;
            competition?: string;
            finalScore?: string;
            atMs?: number;
          } | null;
        };
        const focus = body.focus;
        if (!focus || !isShowcaseSemiFixture(focus.id)) return;

        const timelineRes = await fetch(`/api/replay/venue-timeline?fixtureId=${focus.id}`);
        if (!timelineRes.ok) return;
        const timeline = (await timelineRes.json()) as {
          kickoffMs: number;
          minutes: number[];
        };
        if (!timeline.minutes?.length) return;

        let minuteIndex = 0;
        if (typeof focus.atMs === "number") {
          const found = timeline.minutes.findIndex((t) => t >= focus.atMs!);
          minuteIndex = found === -1 ? timeline.minutes.length - 1 : found;
        }

        useVenueSimStore.setState({
          fixtureId: focus.id,
          label: focus.label,
          home: focus.home,
          away: focus.away,
          competition: focus.competition,
          finalScore: focus.finalScore,
          kickoffMs: timeline.kickoffMs,
          minutes: timeline.minutes,
          minuteIndex,
          atMs: timeline.minutes[minuteIndex] ?? timeline.kickoffMs,
          // Don't auto-play on rehydrate — user hits Play explicitly.
          playing: false,
        });
      } catch {
        // ignore
      }
    })();
  }, [hydrated]);

  // Drive the match clock from the layout so Feed/Watchdog keep moving.
  useEffect(() => {
    if (!playing || fixtureId == null) return;
    // Phone preview: parent page hosts an iframe of the app — only the iframe should tick
    // or we'd advance two minutes per interval.
    const inIframe = window.self !== window.top;
    const phoneParentHostsFrame = Boolean(
      !inIframe && document.querySelector('iframe[title="Linesman — phone preview"]'),
    );
    if (phoneParentHostsFrame) return;

    setReplayMode(true);
    const intervalMs = Math.max(60, Math.round(1_000 / Math.max(1, speed)));
    const timer = window.setInterval(() => {
      useVenueSimStore.getState().tick();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, speed, fixtureId, setReplayMode]);

  // Push every minute into the focus cookie + SWR caches.
  useEffect(() => {
    if (fixtureId == null || atMs == null) return;
    if (lastCookieAt.current === atMs) return;
    lastCookieAt.current = atMs;

    void mutate((key) => typeof key === "string" && key.startsWith("/api/edges"));
    void mutate((key) => typeof key === "string" && key.startsWith("/api/watchdog"));
    void mutate("/api/status");
    void syncFocusCookie();
  }, [fixtureId, atMs]);

  // Cross-tab / iframe sync via storage events (persist writes localStorage).
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== "linesman-venue-sim-v1") return;
      void useVenueSimStore.persist.rehydrate();
      void mutate((key) => typeof key === "string" && key.startsWith("/api/edges"));
      void mutate((key) => typeof key === "string" && key.startsWith("/api/watchdog"));
      void mutate("/api/status");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
