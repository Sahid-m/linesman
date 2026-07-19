import { scoreSummary } from "@/lib/txline/score-format";

export type GroundTruthEvent = {
  action: "goal" | "card";
  side: "home" | "away" | null;
  score: { home: number; away: number } | null;
};

const TRIGGER_ACTIONS = new Set(["goal", "card"]);

/**
 * TxLINE already tags each record with the action that occurred, so a
 * ground-truth event is read directly off the record rather than diffed
 * from a running score total (which would miss cards entirely and could
 * misattribute a goal if two arrive in the same tick).
 */
export function detectGroundTruthEvent(payload: unknown): GroundTruthEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const action = record.Action ?? record.action;
  if (typeof action !== "string" || !TRIGGER_ACTIONS.has(action)) return null;

  const participant = record.Participant ?? record.participant;
  const side = participant === 1 ? "home" : participant === 2 ? "away" : null;

  return {
    action: action as "goal" | "card",
    side,
    score: scoreSummary(record.Stats ?? record.stats),
  };
}
