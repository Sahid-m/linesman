"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import type { Edge } from "@/lib/types";
import type { SourceStatus } from "@/lib/sources/manager";
import { computeDisagreementIndex, disagreementLabel } from "@/lib/engine/disagreement";
import { DisagreementDial } from "@/components/linesman/disagreement-dial";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const CAPTIONS = [
  "Signal, not catalogue.",
  "Sharp line vs the market — scored live.",
  "Every card traces to a Merkle-anchored TxLINE packet on Solana.",
  "Tap Verify on-chain. Watch the proof resolve.",
  "Built for the TxODDS × Solana World Cup Hackathon.",
  "Football-fan native. Proof one tap deep.",
];

const MODE_LABEL: Record<SourceStatus["mode"], string> = {
  live: "LIVE",
  replay: "REPLAY",
  mock: "DEMO",
};

export function ShowcaseStage() {
  const { data } = useSWR<{ edges: Edge[]; status: SourceStatus }>("/api/edges", fetcher, {
    refreshInterval: 8_000,
  });
  const [captionIndex, setCaptionIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCaptionIndex((i) => (i + 1) % CAPTIONS.length), 4_200);
    return () => clearInterval(id);
  }, []);

  const score = useMemo(() => computeDisagreementIndex(data?.edges ?? []), [data]);
  const mode = data?.status.mode ?? "mock";

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center overflow-hidden bg-[#05070c] px-6 py-10 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 18%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
      />

      <header className="relative z-10 flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--color-muted)]">
          TxODDS × Solana World Cup Hackathon
        </p>
        <h1 className="font-display text-4xl tracking-wide sm:text-5xl">
          LINES<span style={{ color: "var(--color-accent)" }}>MAN</span>
        </h1>
        <span
          className="rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
          style={{
            borderColor: mode === "live" ? "var(--color-accent)" : "var(--color-border)",
            color: mode === "live" ? "var(--color-accent)" : "var(--color-muted)",
          }}
        >
          ● {MODE_LABEL[mode]}
        </span>
      </header>

      <div className="relative z-10 mt-8 flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 lg:flex-row lg:items-stretch lg:gap-14">
        <div className="flex flex-col items-center gap-4 lg:w-64 lg:items-start lg:justify-center">
          <div className="w-full max-w-[280px]">
            <DisagreementDial score={score} />
          </div>
          <p className="max-w-[280px] text-center text-xs text-[color:var(--color-muted)] lg:text-left">
            {disagreementLabel(score)}
          </p>
        </div>

        <div className="relative">
          <div
            className="relative overflow-hidden rounded-[2.75rem] border-[6px] border-[#1a1e27] bg-black shadow-[0_40px_120px_-20px_rgba(0,230,118,0.25)]"
            style={{ width: 390, height: 844 }}
          >
            <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-[#1a1e27]" />
            <iframe
              src="/feed?view=desktop"
              title="Linesman — live"
              className="h-full w-full border-0"
              style={{ colorScheme: "dark" }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 lg:w-64 lg:items-start lg:justify-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)] lg:text-left">
            What you&rsquo;re seeing
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={captionIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="max-w-[280px] text-center font-display text-xl leading-tight text-[color:var(--color-text)] lg:text-left"
            >
              {CAPTIONS[captionIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <footer className="relative z-10 mt-10 text-center text-xs text-[color:var(--color-muted)]">
        linesman.app · scroll, tap, and verify — it&rsquo;s the real app, just framed for the big screen
      </footer>
    </div>
  );
}
