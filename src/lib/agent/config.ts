import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { agentConfig } from "@/db/schema";
import type { Network } from "@/lib/network/config";
import { RISK_PRESETS, type RiskLevel } from "./risk";

export type { RiskLevel } from "./risk";

export type AgentConfig = {
  network: Network;
  riskLevel: RiskLevel;
  maxStakePerTrade: number;
  minEdgePct: number;
  autoTrade: boolean;
  notes: string | null;
  updatedAt: string | null;
};

export function defaultAgentConfig(network: Network): AgentConfig {
  return {
    network,
    riskLevel: "balanced",
    maxStakePerTrade: RISK_PRESETS.balanced.maxStakePerTrade,
    minEdgePct: RISK_PRESETS.balanced.minEdgePct,
    autoTrade: true,
    notes: null,
    updatedAt: null,
  };
}

/** Reads the stored config for a network, or returns the balanced default. */
export async function getAgentConfig(network: Network): Promise<AgentConfig> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.network, network))
    .limit(1);
  if (!row) return defaultAgentConfig(network);
  return {
    network,
    riskLevel: row.riskLevel,
    maxStakePerTrade: Number(row.maxStakePerTrade),
    minEdgePct: Number(row.minEdgePct),
    autoTrade: row.autoTrade,
    notes: row.notes,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function saveAgentConfig(input: {
  network: Network;
  riskLevel: RiskLevel;
  maxStakePerTrade: number;
  minEdgePct: number;
  autoTrade: boolean;
  notes: string | null;
}): Promise<AgentConfig> {
  const db = getDb();
  const values = {
    network: input.network,
    riskLevel: input.riskLevel,
    maxStakePerTrade: input.maxStakePerTrade.toFixed(4),
    minEdgePct: input.minEdgePct.toFixed(4),
    autoTrade: input.autoTrade,
    notes: input.notes,
    updatedAt: new Date(),
  };
  await db
    .insert(agentConfig)
    .values(values)
    .onConflictDoUpdate({
      target: agentConfig.network,
      set: {
        riskLevel: values.riskLevel,
        maxStakePerTrade: values.maxStakePerTrade,
        minEdgePct: values.minEdgePct,
        autoTrade: values.autoTrade,
        notes: values.notes,
        updatedAt: values.updatedAt,
      },
    });
  return getAgentConfig(input.network);
}
