"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import useSWR from "swr";
import type { SourceStatus } from "@/lib/sources/manager";
import { useVenueSimStore } from "@/lib/store/venue-sim-store";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const AUTO_DISMISS_MS = 9_000;

type ToastCopy = { title: string; body: string };

function copyFor(
  simActive: boolean,
  status: SourceStatus | undefined,
  label: string | null,
): ToastCopy {
  if (simActive) {
    return {
      title: "No match kicking off right now",
      body: `You're watching a real-data replay${label ? ` — ${label}` : ""}. Prices step through actual Polymarket and Kalshi books minute by minute.`,
    };
  }
  if (status?.mode === "replay") {
    return {
      title: "No match kicking off right now",
      body: "Replaying a previous fixture from recorded TxLINE and venue data so you can see Linesman working end to end.",
    };
  }
  if (status?.liveTxlineConnected) {
    return {
      title: "TxLINE connected",
      body: "Waiting on a venue book to match before edges go live.",
    };
  }
  return {
    title: "No match kicking off right now",
    body: "You're in showcase mode with seeded demo data. Connect your wallet for live odds once a match is on.",
  };
}

/**
 * Product-style transient notice shown when the app is not on a live match.
 * Replaces the old always-on "Simulating…" banner with a dismissible toast.
 */
export function ShowcaseToast() {
  const atMs = useVenueSimStore((state) => state.atMs);
  const kickoffMs = useVenueSimStore((state) => state.kickoffMs);
  const label = useVenueSimStore((state) => state.label);

  const { data } = useSWR<{ status: SourceStatus }>("/api/status", fetcher, {
    refreshInterval: 30_000,
  });
  const status = data?.status;

  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownRef = useRef(false);

  const simActive = Boolean(label && atMs != null && kickoffMs != null);
  const noLive = simActive || (status != null && status.mode !== "live");

  useEffect(() => {
    if (dismissed || shownRef.current || !noLive) return;
    shownRef.current = true;
    const showTimer = window.setTimeout(() => setVisible(true), 600);
    return () => window.clearTimeout(showTimer);
  }, [noLive, dismissed]);

  useEffect(() => {
    if (!visible) return;
    const hideTimer = window.setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(hideTimer);
  }, [visible]);

  const { title, body } = copyFor(simActive, status, label);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur">
            <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-amber)] opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--color-amber)]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[color:var(--color-text)]">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--color-muted)]">{body}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setVisible(false);
                setDismissed(true);
              }}
              aria-label="Dismiss"
              className="-m-1.5 shrink-0 rounded-full p-1.5 text-[color:var(--color-muted)] transition-colors hover:text-[color:var(--color-text)]"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
