export type PreviousFixture = {
  id: number;
  label: string;
  competition: string;
  startTime: number | null;
  finalScore?: string;
  inReplayWindow: boolean;
  source: "schedule" | "snapshot";
};
