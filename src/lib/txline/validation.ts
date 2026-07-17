import BN from "bn.js";
import { ComputeBudgetProgram } from "@solana/web3.js";

type ProofNode = { hash: number[]; isRightSibling: boolean };
type ScoreStat = { key: number; value: number; period: number };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error(`Malformed proof: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function numberField(
  value: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const result = value[key];
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`Malformed proof: ${label} must be a number`);
  }
  return result;
}

function bytes32(value: unknown, label: string): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== 32 ||
    value.some(
      (byte) =>
        typeof byte !== "number" ||
        !Number.isInteger(byte) ||
        byte < 0 ||
        byte > 255,
    )
  ) {
    throw new Error(`Malformed proof: ${label} must contain exactly 32 bytes`);
  }
  return value;
}

function proofNodes(value: unknown, label: string): ProofNode[] {
  if (!Array.isArray(value)) {
    throw new Error(`Malformed proof: ${label} must be an array`);
  }
  return value.map((item, index) => {
    const node = record(item, `${label}[${index}]`);
    if (typeof node.isRightSibling !== "boolean") {
      throw new Error(`Malformed proof: ${label}[${index}] direction missing`);
    }
    return {
      hash: bytes32(node.hash, `${label}[${index}].hash`),
      isRightSibling: node.isRightSibling,
    };
  });
}

export function formatStatValidationProof(value: unknown) {
  const proof = record(value, "response");
  const summary = record(proof.summary, "summary");
  const updateStats = record(summary.updateStats, "summary.updateStats");
  const fixtureId = numberField(summary, "fixtureId", "summary.fixtureId");
  const minTimestamp = numberField(
    updateStats,
    "minTimestamp",
    "summary.updateStats.minTimestamp",
  );
  const rawStats = proof.statsToProve;
  const rawStatProofs = proof.statProofs;
  if (!Array.isArray(rawStats) || !Array.isArray(rawStatProofs)) {
    throw new Error("Malformed proof: stats and stat proofs are required");
  }
  if (rawStats.length !== rawStatProofs.length) {
    throw new Error("Incomplete stat coverage");
  }
  const stats: ScoreStat[] = rawStats.map((item, index) => {
    const stat = record(item, `statsToProve[${index}]`);
    return {
      key: numberField(stat, "key", `statsToProve[${index}].key`),
      value: numberField(stat, "value", `statsToProve[${index}].value`),
      period: numberField(stat, "period", `statsToProve[${index}].period`),
    };
  });
  const fixtureProof = proofNodes(proof.subTreeProof, "subTreeProof");
  const mainTreeProof = proofNodes(proof.mainTreeProof, "mainTreeProof");
  const statProofs = rawStatProofs.map((nodes, index) =>
    proofNodes(nodes, `statProofs[${index}]`),
  );
  return {
    fixtureId,
    minTimestamp,
    statValues: stats.map((stat) => ({ key: stat.key, value: stat.value })),
    payload: {
      ts: new BN(minTimestamp),
      fixtureSummary: {
        fixtureId: new BN(fixtureId),
        updateStats: {
          updateCount: numberField(
            updateStats,
            "updateCount",
            "summary.updateStats.updateCount",
          ),
          minTimestamp: new BN(minTimestamp),
          maxTimestamp: new BN(
            numberField(
              updateStats,
              "maxTimestamp",
              "summary.updateStats.maxTimestamp",
            ),
          ),
        },
        eventsSubTreeRoot: bytes32(
          summary.eventStatsSubTreeRoot,
          "summary.eventStatsSubTreeRoot",
        ),
      },
      fixtureProof,
      mainTreeProof,
      eventStatRoot: bytes32(proof.eventStatRoot, "eventStatRoot"),
      stats: stats.map((stat, index) => ({
        stat,
        statProof: statProofs[index],
      })),
    },
    strategy: {
      geometricTargets: [],
      distancePredicate: null,
      discretePredicates: stats.map((stat, index) => ({
        single: {
          index,
          predicate: {
            threshold: stat.value,
            comparison: { equalTo: {} },
          },
        },
      })),
    },
    proofNodeCounts: {
      fixture: fixtureProof.length,
      main: mainTreeProof.length,
      stats: statProofs.map((nodes) => nodes.length),
    },
  };
}

export function assertProofMatchesRequest(
  proof: ReturnType<typeof formatStatValidationProof>,
  fixtureId: number,
  statKeys: readonly number[],
): void {
  if (proof.fixtureId !== fixtureId) {
    throw new Error("Proof fixture does not match requested fixture");
  }
  const proofKeys = proof.statValues.map((stat) => stat.key);
  if (
    new Set(statKeys).size !== statKeys.length ||
    new Set(proofKeys).size !== proofKeys.length ||
    proofKeys.length !== statKeys.length ||
    [...proofKeys].sort((a, b) => a - b).some(
      (key, index) => key !== [...statKeys].sort((a, b) => a - b)[index],
    )
  ) {
    throw new Error("Incomplete stat coverage");
  }
}

export function validationComputeBudgetInstruction() {
  return ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
}
