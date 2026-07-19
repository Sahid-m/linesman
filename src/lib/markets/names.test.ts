import { describe, expect, it } from "vitest";
import { eventMentionsBothTeams, namesLooselyMatch } from "./names";

describe("namesLooselyMatch", () => {
  it("matches exact and substring team spellings", () => {
    expect(namesLooselyMatch("Spain", "Spain")).toBe(true);
    expect(namesLooselyMatch("Will Spain win?", "Spain")).toBe(true);
    expect(namesLooselyMatch("USA", "United States")).toBe(false);
  });

  it("ignores diacritics and punctuation", () => {
    expect(namesLooselyMatch("Côte d'Ivoire", "Cote dIvoire")).toBe(true);
  });
});

describe("eventMentionsBothTeams", () => {
  it("requires both sides", () => {
    expect(eventMentionsBothTeams("Spain vs. Argentina", "Spain", "Argentina")).toBe(true);
    expect(eventMentionsBothTeams("Spain vs. France", "Spain", "Argentina")).toBe(false);
  });
});
