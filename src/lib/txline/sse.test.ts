import { describe, expect, it } from "vitest";
import { parseSseDataLines } from "./sse";

describe("parseSseDataLines", () => {
  it("parses newline-joined historical data lines", () => {
    const body = [
      'data: {"FixtureId":1,"Ts":100}',
      'data: {"FixtureId":1,"Ts":200}',
      "",
    ].join("\n");
    expect(parseSseDataLines(body)).toEqual([
      { FixtureId: 1, Ts: 100 },
      { FixtureId: 1, Ts: 200 },
    ]);
  });
});
