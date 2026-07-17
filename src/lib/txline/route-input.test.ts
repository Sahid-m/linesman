import { expect, it } from "vitest";

import { parseFixtureRouteInput } from "./route-input";

it("canonicalizes numeric fixture route IDs before forwarding", () => {
  expect(parseFixtureRouteInput("devnet", "00042")).toEqual({
    network: "devnet",
    fixtureId: 42,
  });
});

it("rejects non-canonicalizable fixture route IDs", () => {
  expect(() => parseFixtureRouteInput("mainnet", "42x")).toThrow();
});
