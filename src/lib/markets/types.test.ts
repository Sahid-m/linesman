import { describe, expect, it } from "vitest";
import { namesLooselyMatch } from "./types";

describe("namesLooselyMatch", () => {
  it("matches identical names", () => {
    expect(namesLooselyMatch("Argentina", "Argentina")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(namesLooselyMatch("argentina", "ARGENTINA")).toBe(true);
  });

  it("ignores diacritics", () => {
    expect(namesLooselyMatch("Cote d'Ivoire", "Côte d'Ivoire")).toBe(true);
  });

  it("matches substrings for differing full names", () => {
    expect(namesLooselyMatch("USA", "United States of America")).toBe(false);
    expect(namesLooselyMatch("Not Spain", "Spain")).toBe(true);
  });

  it("rejects unrelated names", () => {
    expect(namesLooselyMatch("Spain", "Argentina")).toBe(false);
  });
});
