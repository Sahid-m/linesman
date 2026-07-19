import { describe, expect, it } from "vitest";
import {
  actionLabel,
  describeEventData,
  formatClock,
  participantLabel,
  phaseLabel,
  scoreSummary,
} from "./score-format";

describe("phaseLabel", () => {
  it("maps documented statusId values", () => {
    expect(phaseLabel(4)).toBe("2nd half");
    expect(phaseLabel(5)).toBe("Full-time");
  });

  it("falls back for unknown ids and non-numeric input", () => {
    expect(phaseLabel(999)).toBe("Status 999");
    expect(phaseLabel(undefined)).toBeNull();
  });
});

describe("actionLabel", () => {
  it("maps known actions and humanizes unknown ones", () => {
    expect(actionLabel("free_kick")).toBe("Free kick");
    expect(actionLabel("game_finalised")).toBe("Full-time — final result");
    expect(actionLabel("something_new")).toBe("something new");
    expect(actionLabel(undefined)).toBe("Update");
  });
});

describe("formatClock", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatClock(2742)).toBe("45:42");
    expect(formatClock(59)).toBe("0:59");
  });

  it("returns null for invalid input", () => {
    expect(formatClock(-1)).toBeNull();
    expect(formatClock(undefined)).toBeNull();
  });
});

describe("participantLabel", () => {
  it("resolves team names when provided", () => {
    expect(participantLabel(1, { home: "France", away: "Morocco" })).toBe(
      "France",
    );
    expect(participantLabel(2, { home: "France", away: "Morocco" })).toBe(
      "Morocco",
    );
  });

  it("falls back to Home/Away without team names", () => {
    expect(participantLabel(1)).toBe("Home");
    expect(participantLabel(2)).toBe("Away");
  });

  it("returns null for an unrecognized participant", () => {
    expect(participantLabel(3)).toBeNull();
  });
});

describe("scoreSummary", () => {
  it("reads stat keys 1 and 2 as the full-game score", () => {
    expect(scoreSummary({ "1": 2, "2": 0 })).toEqual({ home: 2, away: 0 });
  });

  it("returns null when stats are missing", () => {
    expect(scoreSummary({})).toBeNull();
    expect(scoreSummary(null)).toBeNull();
  });
});

describe("describeEventData", () => {
  it("joins non-empty fields", () => {
    expect(describeEventData({ FreeKickType: "Safe" })).toBe(
      "FreeKickType: Safe",
    );
  });

  it("returns undefined for empty data", () => {
    expect(describeEventData({})).toBeUndefined();
    expect(describeEventData(null)).toBeUndefined();
  });
});
