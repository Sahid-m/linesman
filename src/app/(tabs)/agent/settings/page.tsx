"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useNetwork } from "@/components/app-providers";
import {
  RISK_COPY,
  RISK_LEVELS,
  RISK_PRESETS,
  type RiskLevel,
} from "@/lib/agent/risk";

type AgentConfig = {
  network: "devnet" | "mainnet";
  riskLevel: RiskLevel;
  maxStakePerTrade: number;
  minEdgePct: number;
  autoTrade: boolean;
  notes: string | null;
  updatedAt: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AgentSettingsPage() {
  const { network } = useNetwork();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConfig(null);
    fetch(`/api/agent/config?network=${network}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.config) setConfig(body.config);
      })
      .catch(() => {
        if (!cancelled) setErrorMsg("Could not load current settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [network]);

  function patch(next: Partial<AgentConfig>) {
    setSaveState("idle");
    setConfig((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function applyRisk(level: RiskLevel) {
    patch({
      riskLevel: level,
      maxStakePerTrade: RISK_PRESETS[level].maxStakePerTrade,
      minEdgePct: RISK_PRESETS[level].minEdgePct,
    });
  }

  async function save() {
    if (!config) return;
    setSaveState("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/agent/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...config, network }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setConfig(body.config);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setErrorMsg(
        error instanceof Error
          ? error.message === "Unauthorized"
            ? "Connect your wallet to arm the agent."
            : error.message
          : "Save failed",
      );
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent)]">
          <Link href="/agent" className="text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]">
            Agent
          </Link>
          <span className="text-[color:var(--color-muted)]">/</span>
          <span>Settings</span>
        </div>
        <h1 className="font-display text-3xl tracking-wide text-[color:var(--color-text)] md:text-4xl">
          How should GroundTruth trade for you?
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--color-muted)] md:text-base">
          Set your risk appetite once. The agent reads this before every detected
          goal or card and trades on your behalf — sizing positions and skipping
          gaps that are too small for your comfort.
        </p>
      </header>

      {!config ? (
        <div className="h-64 animate-pulse rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {RISK_LEVELS.map((level) => {
              const active = config.riskLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => applyRisk(level)}
                  className="rounded-2xl border p-4 text-left transition-colors"
                  style={{
                    borderColor: active
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                    background: active
                      ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))"
                      : "var(--color-surface)",
                  }}
                  aria-pressed={active}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: active ? "var(--color-accent)" : "var(--color-text)" }}
                  >
                    {RISK_COPY[level].label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">
                    {RISK_COPY[level].tagline}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
              <div className="flex items-baseline justify-between">
                <label htmlFor="stake" className="text-sm font-semibold text-[color:var(--color-text)]">
                  Max stake per trade
                </label>
                <span className="font-mono text-sm text-[color:var(--color-accent)]">
                  {config.maxStakePerTrade.toFixed(0)} USDC
                </span>
              </div>
              <input
                id="stake"
                type="range"
                min={10}
                max={500}
                step={10}
                value={config.maxStakePerTrade}
                onChange={(e) => patch({ maxStakePerTrade: Number(e.target.value) })}
                className="mt-3 w-full accent-[color:var(--color-accent)]"
              />
              <p className="mt-1 text-xs text-[color:var(--color-muted)]">
                Notional the agent commits to each qualifying event.
              </p>
            </div>

            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
              <div className="flex items-baseline justify-between">
                <label htmlFor="edge" className="text-sm font-semibold text-[color:var(--color-text)]">
                  Minimum edge to act
                </label>
                <span className="font-mono text-sm text-[color:var(--color-accent)]">
                  {config.minEdgePct.toFixed(1)}%
                </span>
              </div>
              <input
                id="edge"
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={config.minEdgePct}
                onChange={(e) => patch({ minEdgePct: Number(e.target.value) })}
                className="mt-3 w-full accent-[color:var(--color-accent)]"
              />
              <p className="mt-1 text-xs text-[color:var(--color-muted)]">
                Skip any cross-venue gap smaller than this. Lower = more trades.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <div>
              <p className="text-sm font-semibold text-[color:var(--color-text)]">
                Auto-trade on my behalf
              </p>
              <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">
                When armed, GroundTruth acts automatically on every detected
                event. Turn off to pause without losing your settings.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.autoTrade}
              onClick={() => patch({ autoTrade: !config.autoTrade })}
              className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
              style={{ background: config.autoTrade ? "var(--color-accent)" : "var(--color-border)" }}
            >
              <span
                className="absolute top-1 h-5 w-5 rounded-full bg-[color:var(--color-bg)] transition-transform"
                style={{ transform: config.autoTrade ? "translateX(26px)" : "translateX(4px)" }}
              />
            </button>
          </div>

          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <label htmlFor="notes" className="text-sm font-semibold text-[color:var(--color-text)]">
              Describe your strategy <span className="text-[color:var(--color-muted)]">(optional)</span>
            </label>
            <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">
              A note to yourself about why you set it this way. Shown alongside
              the agent&rsquo;s decisions.
            </p>
            <textarea
              id="notes"
              rows={3}
              maxLength={500}
              value={config.notes ?? ""}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="e.g. Only chase big, obvious lags on Kalshi — I don't want tiny scalps."
              className="mt-3 w-full resize-none rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-muted)]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[color:var(--color-muted)]">
              {saveState === "saved"
                ? "Saved — the agent will use this on its next decision."
                : errorMsg
                  ? errorMsg
                  : `Network: ${network}${config.updatedAt ? ` · last saved ${new Date(config.updatedAt).toLocaleString()}` : ""}`}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="/agent"
                className="rounded-xl border border-[color:var(--color-border)] px-4 py-2 text-sm font-semibold text-[color:var(--color-text)]"
              >
                View decisions
              </Link>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saveState === "saving"}
                className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ color: "var(--color-bg)", background: "var(--color-accent)" }}
              >
                {saveState === "saving" ? "Saving…" : "Arm agent"}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
