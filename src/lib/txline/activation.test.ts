import { expect, it } from "vitest";
import { buildActivationMessage } from "./activation";

it("keeps the empty leagues field as two colons", () => {
  expect(buildActivationMessage("tx123", "jwt456")).toBe("tx123::jwt456");
});
