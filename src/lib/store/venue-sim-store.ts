"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const VENUE_SIM_SPEEDS = [1, 2, 5, 10, 15, 30] as const;
export type VenueSimSpeed = (typeof VENUE_SIM_SPEEDS)[number];

type ArmInput = {
  fixtureId: number;
  label: string;
  home: string;
  away: string;
  competition?: string;
  finalScore?: string;
  kickoffMs: number;
  minutes: number[];
};

export type VenueSimState = {
  fixtureId: number | null;
  label: string | null;
  home: string | null;
  away: string | null;
  competition?: string;
  finalScore?: string;
  kickoffMs: number | null;
  minutes: number[];
  minuteIndex: number;
  atMs: number | null;
  playing: boolean;
  speed: VenueSimSpeed;
  generation: number;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  arm: (input: ArmInput) => void;
  clear: () => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (speed: VenueSimSpeed) => void;
  setMinuteIndex: (index: number) => void;
  tick: () => boolean;
};

/**
 * True once the replay clock has reached its final minute — the match is
 * over and venue books have settled to the result, so their prices are no
 * longer live edges.
 */
export function selectIsFullTime(state: VenueSimState): boolean {
  return (
    state.fixtureId != null &&
    state.minutes.length > 1 &&
    state.minuteIndex >= state.minutes.length - 1
  );
}

export const useVenueSimStore = create<VenueSimState>()(
  persist(
    (set, get) => ({
      fixtureId: null,
      label: null,
      home: null,
      away: null,
      competition: undefined,
      finalScore: undefined,
      kickoffMs: null,
      minutes: [],
      minuteIndex: 0,
      atMs: null,
      playing: false,
      speed: 10,
      generation: 0,
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),
      arm: (input) =>
        set({
          fixtureId: input.fixtureId,
          label: input.label,
          home: input.home,
          away: input.away,
          competition: input.competition,
          finalScore: input.finalScore,
          kickoffMs: input.kickoffMs,
          minutes: input.minutes,
          minuteIndex: 0,
          atMs: input.minutes[0] ?? input.kickoffMs,
          playing: false,
          generation: get().generation + 1,
        }),
      clear: () =>
        set({
          fixtureId: null,
          label: null,
          home: null,
          away: null,
          competition: undefined,
          finalScore: undefined,
          kickoffMs: null,
          minutes: [],
          minuteIndex: 0,
          atMs: null,
          playing: false,
          generation: get().generation + 1,
        }),
      setPlaying: (playing) => set({ playing }),
      togglePlaying: () => set((state) => ({ playing: !state.playing })),
      setSpeed: (speed) => set({ speed }),
      setMinuteIndex: (index) => {
        const { minutes } = get();
        if (minutes.length === 0) return;
        const minuteIndex = Math.min(Math.max(0, Math.floor(index)), minutes.length - 1);
        set({ minuteIndex, atMs: minutes[minuteIndex] });
      },
      tick: () => {
        const { minutes, minuteIndex, playing } = get();
        if (!playing || minutes.length < 2) {
          if (playing) set({ playing: false });
          return false;
        }
        if (minuteIndex >= minutes.length - 1) {
          set({ playing: false });
          return false;
        }
        const next = minuteIndex + 1;
        set({ minuteIndex: next, atMs: minutes[next] });
        return true;
      },
    }),
    {
      name: "linesman-venue-sim-v1",
      // localStorage so phone-preview iframe + tab navigations share one clock.
      partialize: (state) => ({
        fixtureId: state.fixtureId,
        label: state.label,
        home: state.home,
        away: state.away,
        competition: state.competition,
        finalScore: state.finalScore,
        kickoffMs: state.kickoffMs,
        minutes: state.minutes,
        minuteIndex: state.minuteIndex,
        atMs: state.atMs,
        playing: state.playing,
        speed: state.speed,
        generation: state.generation,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
