export type TxlineEvent = {
  source: "live" | "history";
  fixtureId: number;
  seq?: number;
  timestamp: number;
  payload: unknown;
};

function numericField(
  value: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim() !== "") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
}

/**
 * Final-outcome record for a match. Relies on action + statusId; period is
 * accepted when present and equal to 100, but omitted period still counts
 * as final (observed on real historical feeds).
 */
export function isFinalScoreRecord(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const action = record.action ?? record.Action;
  const statusId = Number(record.statusId ?? record.StatusId);
  const rawPeriod = record.period ?? record.Period;
  const period = rawPeriod === undefined ? null : Number(rawPeriod);
  return (
    action === "game_finalised" && statusId === 100 && (period === null || period === 100)
  );
}

export function normalizeScoreEvent(
  payload: unknown,
  source: TxlineEvent["source"],
): TxlineEvent {
  if (!payload || typeof payload !== "object") {
    throw new Error("Score record must be an object");
  }
  const record = payload as Record<string, unknown>;
  const fixtureId = numericField(record, "fixtureId", "FixtureId");
  const timestamp = numericField(record, "timestamp", "Timestamp", "ts", "Ts");
  const seq = numericField(record, "seq", "Seq");
  if (!fixtureId || !Number.isSafeInteger(fixtureId)) {
    throw new Error("Score record has no valid fixture ID");
  }
  if (timestamp === undefined) {
    throw new Error("Score record has no timestamp");
  }
  return {
    source,
    fixtureId,
    ...(seq === undefined ? {} : { seq }),
    timestamp,
    payload,
  };
}
