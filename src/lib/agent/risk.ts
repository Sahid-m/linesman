export type RiskLevel = "conservative" | "balanced" | "aggressive";

export type RiskPreset = {
  maxStakePerTrade: number;
  minEdgePct: number;
};

/**
 * Presets each risk level snaps to. Users can still fine-tune stake and edge
 * afterwards; the level is the headline choice. Client- and server-safe (no
 * server-only imports) so both the settings UI and the agent can use it.
 */
export const RISK_PRESETS: Record<RiskLevel, RiskPreset> = {
  conservative: { maxStakePerTrade: 50, minEdgePct: 4 },
  balanced: { maxStakePerTrade: 100, minEdgePct: 1.5 },
  aggressive: { maxStakePerTrade: 250, minEdgePct: 0.5 },
};

export const RISK_COPY: Record<
  RiskLevel,
  { label: string; tagline: string }
> = {
  conservative: {
    label: "Conservative",
    tagline: "Small stakes, only the widest, most obvious gaps.",
  },
  balanced: {
    label: "Balanced",
    tagline: "Default. Meaningful stakes on clear cross-venue edges.",
  },
  aggressive: {
    label: "Aggressive",
    tagline: "Larger stakes, acts on the faintest venue lag.",
  },
};

export const RISK_LEVELS: RiskLevel[] = [
  "conservative",
  "balanced",
  "aggressive",
];
