import { describe, expect, it } from "vitest";
import { detectGroundTruthEvent } from "./detector";

describe("detectGroundTruthEvent", () => {
  it("detects a home goal", () => {
    const event = detectGroundTruthEvent({
      Action: "goal",
      Participant: 1,
      Stats: { "1": 1, "2": 0 },
    });
    expect(event).toEqual({
      action: "goal",
      side: "home",
      score: { home: 1, away: 0 },
    });
  });

  it("detects an away card", () => {
    const event = detectGroundTruthEvent({
      action: "card",
      participant: 2,
    });
    expect(event?.action).toBe("card");
    expect(event?.side).toBe("away");
  });

  it("ignores non-trigger actions", () => {
    expect(detectGroundTruthEvent({ Action: "corner", Participant: 1 })).toBeNull();
    expect(detectGroundTruthEvent({ Action: "coverage_update" })).toBeNull();
  });

  it("ignores non-object payloads", () => {
    expect(detectGroundTruthEvent(null)).toBeNull();
    expect(detectGroundTruthEvent("goal")).toBeNull();
  });
});
