import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  assertProofMatchesRequest,
  formatStatValidationProof,
  validationComputeBudgetInstruction,
} from "./validation";

const bytes32 = Array.from({ length: 32 }, (_, index) => index);

function proof(fixtureId = 42, statKeys = [1, 2]) {
  return {
    summary: {
      fixtureId,
      updateStats: {
        updateCount: 3,
        minTimestamp: 1_752_710_400_000,
        maxTimestamp: 1_752_710_401_000,
      },
      eventStatsSubTreeRoot: bytes32,
    },
    statsToProve: statKeys.map((key) => ({ key, value: key * 10, period: 1 })),
    statProofs: statKeys.map(() => []),
    subTreeProof: [],
    mainTreeProof: [],
    eventStatRoot: bytes32,
  };
}

describe("proof request binding", () => {
  it("accepts the proof fixture and exact requested stat-key set", () => {
    const formatted = formatStatValidationProof(proof());

    expect(() =>
      assertProofMatchesRequest(formatted, 42, [2, 1]),
    ).not.toThrow();
    expect(formatted.fixtureId).toBe(42);
  });

  it.each([
    ["different fixture", proof(43), 42, [1, 2]],
    ["missing stat", proof(42, [1]), 42, [1, 2]],
    ["extra stat", proof(42, [1, 2, 3]), 42, [1, 2]],
    ["duplicate stat", proof(42, [1, 1]), 42, [1]],
  ])("rejects a %s", (_label, value, fixtureId, statKeys) => {
    const formatted = formatStatValidationProof(value);
    expect(() =>
      assertProofMatchesRequest(formatted, fixtureId, statKeys),
    ).toThrow();
  });
});

it("uses the required compute-unit limit for proof simulation", () => {
  const instruction = validationComputeBudgetInstruction();

  expect(instruction.programId.equals(ComputeBudgetProgram.programId)).toBe(
    true,
  );
  expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(instruction)).toEqual(
    { units: 1_400_000 },
  );
});
