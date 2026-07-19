"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useNetwork } from "@/components/app-providers";
import { RISK_COPY, type RiskLevel } from "@/lib/agent/risk";

type AgentConfig = {
  riskLevel: RiskLevel;
  maxStakePerTrade: number;
  minEdgePct: number;
  autoTrade: boolean;
};

export function AgentProfileBanner() {
  const { network } = useNetwork();
  const [config, setConfig] = useState<AgentConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agent/config?network=${network}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled && body.config) setConfig(body.config);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [network]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: config?.autoTrade
                ? "var(--color-accent)"
                : "var(--color-muted)",
            }}
          />
          <strong className="text-[color:var(--color-text)]">
            {config
              ? config.autoTrade
                ? "Auto-trading armed"
                : "Auto-trade paused"
              : "Loading profile…"}
          </strong>
        </span>
        {config && (
          <span className="text-[color:var(--color-muted)]">
            {RISK_COPY[config.riskLevel].label} · {config.maxStakePerTrade.toFixed(0)} USDC/trade ·{" "}
            {config.minEdgePct.toFixed(1)}% min edge
          </span>
        )}
      </div>
      <Link
        href="/agent/settings"
        className="rounded-xl border border-[color:var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
      >
        Edit risk settings
      </Link>
    </div>
  );
}
