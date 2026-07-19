export type FixtureSummary = {
  id: number;
  label: string;
  competition: string;
  startTime: number | null;
  gameState: number | null;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numeric(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function text(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function listFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ["fixtures", "Fixtures", "data", "Data", "items"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

/** TxLINE fixture snapshots use Participant1/Participant2, not homeTeam/awayTeam. */
export function fixturesFrom(value: unknown): FixtureSummary[] {
  return listFrom(value).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const id = numeric(record, "FixtureId", "fixtureId", "id");
    if (id === null || !Number.isSafeInteger(id) || id <= 0) return [];

    const participant1 = text(
      record,
      "Participant1",
      "participant1",
      "HomeTeam",
      "homeTeam",
      "home",
    );
    const participant2 = text(
      record,
      "Participant2",
      "participant2",
      "AwayTeam",
      "awayTeam",
      "away",
    );
    const competition = text(record, "Competition", "competition") ?? "Fixture";
    const startTime = numeric(record, "StartTime", "startTime", "start");
    const gameState = numeric(record, "GameState", "gameState");
    const named = text(record, "name", "Name");
    const matchup =
      participant1 && participant2
        ? `${participant1} vs ${participant2}`
        : named ?? `Fixture ${id}`;

    return [
      {
        id,
        label: `${matchup} · ${competition}`,
        competition,
        startTime,
        gameState,
        raw: record,
      },
    ];
  });
}

/** Historical scores are only available for fixtures started 2 weeks–6 hours ago. */
export function isHistoricalReplayEligible(
  startTimeMs: number | null,
  now = Date.now(),
): boolean {
  if (startTimeMs === null || !Number.isFinite(startTimeMs)) return false;
  const earliest = now - 14 * 24 * 60 * 60 * 1_000;
  const latest = now - 6 * 60 * 60 * 1_000;
  return startTimeMs >= earliest && startTimeMs <= latest;
}

/**
 * `/api/fixtures/snapshot` defaults to "today forward" — without an explicit
 * `startEpochDay` it never returns fixtures that already kicked off on a
 * previous UTC day, even ones still inside the replay window.
 */
export function replayWindowStartEpochDay(now = Date.now()): number {
  return Math.floor((now - 14 * 24 * 60 * 60 * 1_000) / 86_400_000);
}
