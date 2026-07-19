"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { mutate } from "swr";
import { useNetwork } from "@/components/app-providers";
import { WalletSession } from "@/components/wallet-session";
import { TxlineSetup } from "@/components/txline-setup";
import { getNetworkConfig, type Network } from "@/lib/network/config";

type Session = { userId: string; walletPublicKey: string };

type Props = {
  /** Visual density for the trigger button. */
  variant?: "nav" | "header";
};

export function ConnectWalletControl({ variant = "nav" }: Props) {
  const titleId = useId();
  const { network, setNetwork } = useNetwork();
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const sessionRes = await fetch("/api/auth/session");
      const session = sessionRes.ok ? ((await sessionRes.json()) as Session) : null;
      if (!session) {
        setAuthenticated(false);
        setReady(false);
        setWalletLabel(null);
        return;
      }
      setAuthenticated(true);
      setWalletLabel(
        `${session.walletPublicKey.slice(0, 4)}…${session.walletPublicKey.slice(-4)}`,
      );
      const statusRes = await fetch(`/api/txline/setup/status?network=${network}`);
      if (!statusRes.ok) {
        setReady(false);
        return;
      }
      const status = (await statusRes.json()) as { state?: string };
      setReady(status.state === "activated");
    } catch {
      // ignore — button falls back to Connect
    }
  }, [network]);

  useEffect(() => {
    setReady(false);
    void refreshStatus();
  }, [refreshStatus, network]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !setupBusy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setupBusy]);

  const handleSession = useCallback((session: Session | null) => {
    setAuthenticated(Boolean(session));
    if (!session) {
      setReady(false);
      setWalletLabel(null);
      return;
    }
    setWalletLabel(
      `${session.walletPublicKey.slice(0, 4)}…${session.walletPublicKey.slice(-4)}`,
    );
  }, []);

  const handleReady = useCallback(
    (value: boolean) => {
      setReady(value);
      if (value) {
        void mutate("/api/status");
        void mutate("/api/edges");
        void mutate("/api/live/lines");
        void refreshStatus();
      }
    },
    [refreshStatus],
  );

  const triggerLabel = ready
    ? `Live · ${walletLabel ?? "wallet"}`
    : authenticated
      ? `Signed in · ${walletLabel ?? "wallet"}`
      : variant === "header"
        ? "Connect"
        : "Connect wallet";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "header"
            ? "rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
            : "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
        }
        style={
          ready
            ? {
                color: "var(--color-accent)",
                background: "color-mix(in srgb, var(--color-accent) 14%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)",
              }
            : {
                color: "var(--color-bg)",
                background: "var(--color-accent)",
              }
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {ready && (
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-accent)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-accent) 25%, transparent)" }}
          />
        )}
        {triggerLabel}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="connect-modal-root linesman fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4"
            role="presentation"
          >
          <button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
            aria-label="Close connect wallet dialog"
            disabled={setupBusy}
            onClick={() => {
              if (!setupBusy) setOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="connect-modal relative z-[1] flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border)] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                  Live data
                </p>
                <h2 id={titleId} className="font-display text-2xl tracking-wide text-[color:var(--color-text)]">
                  Connect wallet
                </h2>
                <p className="mt-1 text-sm text-[color:var(--color-muted)]">
                  Sign in, activate TxLINE, stay on the feed — no separate setup page.
                </p>
              </div>
              <button
                type="button"
                disabled={setupBusy}
                onClick={() => setOpen(false)}
                className="rounded-full px-2.5 py-1 text-lg leading-none text-[color:var(--color-muted)] transition-colors hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-text)]"
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-5 py-3">
              <label className="flex items-center gap-2 text-xs text-[color:var(--color-muted)]">
                <span className="font-semibold uppercase tracking-wide">Network</span>
                <select
                  disabled={setupBusy}
                  value={network}
                  onChange={(event) => setNetwork(event.target.value as Network)}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2.5 py-1.5 text-sm text-[color:var(--color-text)]"
                >
                  <option value="devnet">Devnet</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              </label>
              <p className="truncate text-[11px] text-[color:var(--color-muted)]">
                {new URL(getNetworkConfig(network).apiOrigin).host}
              </p>
            </div>

            <div className="connect-modal-body min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <WalletSession onSession={handleSession} />
              <TxlineSetup
                authenticated={authenticated}
                onReady={handleReady}
                onBusy={setSetupBusy}
              />
            </div>

            <footer className="flex flex-col gap-2 border-t border-[color:var(--color-border)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[color:var(--color-muted)]">
                {ready
                  ? "TxLINE activated — feed uses live lines. Or pull previous scores on Replay."
                  : authenticated
                    ? "Next: set up TxLINE (subscribe + activate)."
                    : "Step 1: connect, then sign in with your wallet."}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {ready && (
                  <Link
                    href="/replay"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-[color:var(--color-border)] px-3.5 py-2 text-sm font-semibold text-[color:var(--color-text)]"
                  >
                    Previous data
                  </Link>
                )}
                {ready && (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3.5 py-2 text-sm font-semibold"
                    style={{ color: "var(--color-bg)", background: "var(--color-accent)" }}
                  >
                    Done
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
