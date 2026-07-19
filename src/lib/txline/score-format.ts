/**
 * Soccer game-phase and action encodings, from
 * https://github.com/txodds/tx-on-chain/blob/main/documentation/scores/soccer-feed.mdx
 */
const SOCCER_PHASE_LABELS: Record<number, string> = {
  1: "Not started",
  2: "1st half",
  3: "Half-time",
  4: "2nd half",
  5: "Full-time",
  6: "Waiting for extra time",
  7: "Extra time · 1st half",
  8: "Extra time · half-time",
  9: "Extra time · 2nd half",
  10: "Full-time (after extra time)",
  11: "Waiting for penalties",
  12: "Penalty shootout",
  13: "Full-time (after penalties)",
  14: "Interrupted",
  15: "Abandoned",
  16: "Cancelled",
  17: "Coverage cancelled",
  18: "Coverage suspended",
  19: "Postponed",
};

const ACTION_LABELS: Record<string, string> = {
  coverage_update: "Coverage update",
  free_kick: "Free kick",
  shot: "Shot",
  goal: "Goal",
  var: "VAR check",
  var_end: "VAR decision",
  penalty: "Penalty",
  comment: "Match note",
  substitution: "Substitution",
  action_amend: "Action amended",
  game_finalised: "Full-time — final result",
  halftime_finalised: "Half-time confirmed",
  score: "Score update",
  card: "Card",
  corner: "Corner",
  offside: "Offside",
};

export function phaseLabel(statusId: unknown): string | null {
  const id = Number(statusId);
  if (!Number.isFinite(id)) return null;
  return SOCCER_PHASE_LABELS[id] ?? `Status ${id}`;
}

export function actionLabel(action: unknown): string {
  if (typeof action !== "string" || !action) return "Update";
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export function formatClock(seconds: unknown): string | null {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return null;
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function participantLabel(
  participant: unknown,
  teams?: { home?: string; away?: string },
): string | null {
  if (participant === 1) return teams?.home ?? "Home";
  if (participant === 2) return teams?.away ?? "Away";
  return null;
}

/** Full-game goal tally, from Stats keys 1 (home) and 2 (away). */
export function scoreSummary(
  stats: unknown,
): { home: number; away: number } | null {
  if (!stats || typeof stats !== "object") return null;
  const record = stats as Record<string, unknown>;
  const home = Number(record["1"]);
  const away = Number(record["2"]);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
}

/** Human-readable "key: value" pairs from a score record's freeform Data object. */
export function describeEventData(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  if (entries.length === 0) return undefined;
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
}
