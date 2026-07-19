import { create } from "zustand";

export const REPLAY_SPEEDS = [1, 2, 5, 10, 30, 60] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export interface RecordingSummary {
  id: string;
  label: string;
  description: string;
  eventCount: number;
  durationMinutes: number;
}

export const MOCK_RECORDINGS: RecordingSummary[] = [
  {
    id: "wc26-final",
    label: "Final · France vs Argentina",
    description: "Full 90+ minutes with the France mispricing story and two late goal swings.",
    eventCount: 214,
    durationMinutes: 97,
  },
  {
    id: "wc26-third-place",
    label: "3rd Place · Portugal vs Brazil",
    description: "Complete score + odds packet trail from kickoff to full time.",
    eventCount: 168,
    durationMinutes: 93,
  },
];

interface ReplayState {
  isReplayMode: boolean;
  isPlaying: boolean;
  selectedRecordingId: string;
  speed: ReplaySpeed;
  progress: number; // 0..1
  setReplayMode: (value: boolean) => void;
  setPlaying: (value: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setRecording: (id: string) => void;
  setProgress: (progress: number) => void;
  advance: (deltaSeconds: number) => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  isReplayMode: false,
  isPlaying: false,
  selectedRecordingId: MOCK_RECORDINGS[0].id,
  speed: 1,
  progress: 0,
  setReplayMode: (value) => set({ isReplayMode: value, isPlaying: value ? get().isPlaying : false }),
  setPlaying: (value) => set({ isPlaying: value }),
  togglePlaying: () =>
    set((state) => {
      const nextPlaying = !state.isPlaying;
      return { isPlaying: nextPlaying, isReplayMode: nextPlaying ? true : state.isReplayMode };
    }),
  setSpeed: (speed) => set({ speed }),
  setRecording: (id) => set({ selectedRecordingId: id, progress: 0, isPlaying: false }),
  setProgress: (progress) => set({ progress: Math.min(1, Math.max(0, progress)) }),
  advance: (deltaSeconds) =>
    set((state) => {
      const recording = MOCK_RECORDINGS.find((item) => item.id === state.selectedRecordingId);
      const durationSeconds = (recording?.durationMinutes ?? 90) * 60;
      const next = state.progress + (deltaSeconds * state.speed) / durationSeconds;
      return { progress: next >= 1 ? 1 : next, isPlaying: next >= 1 ? false : state.isPlaying };
    }),
}));
