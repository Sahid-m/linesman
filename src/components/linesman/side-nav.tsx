"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWalletControl } from "@/components/linesman/connect-wallet-modal";
import { useViewportStore } from "@/lib/store/viewport-store";

const TABS = [
  { href: "/feed", label: "Edge Feed", icon: "⚡" },
  { href: "/watchdog", label: "Watchdog", icon: "🛡" },
  { href: "/agent", label: "Agent", icon: "◎" },
  { href: "/replay", label: "Replay", icon: "⏱" },
] as const;

export function SideNav() {
  const pathname = usePathname();
  const mode = useViewportStore((state) => state.mode);
  const setMode = useViewportStore((state) => state.setMode);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-6 lg:flex"
    >
      <Link href="/feed" className="font-display text-2xl tracking-wide text-[color:var(--color-text)]">
        LINES<span style={{ color: "var(--color-accent)" }}>MAN</span>
      </Link>
      <p className="mt-1 text-xs text-[color:var(--color-muted)]">
        Sharp line · venue lag · on-chain proof
      </p>

      <div className="mt-10 flex flex-col gap-1.5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--color-accent)" : "var(--color-muted)",
                background: active ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
              }}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-8">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
          Preview
        </p>
        <div className="flex rounded-full border border-[color:var(--color-border)] p-1">
          {(["desktop", "phone"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className="min-h-9 flex-1 rounded-full px-3 text-xs font-semibold capitalize transition-colors"
              style={{
                color: mode === option ? "var(--color-bg)" : "var(--color-muted)",
                background: mode === option ? "var(--color-accent)" : "transparent",
              }}
              aria-pressed={mode === option}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto space-y-3">
        <ConnectWalletControl variant="nav" />
        <div className="rounded-xl border border-[color:var(--color-border)] p-3.5 text-xs text-[color:var(--color-muted)]">
          Every number traces to a Merkle-anchored TxLINE packet on Solana — tap any card&rsquo;s verify strip for the
          receipt.
        </div>
      </div>
    </nav>
  );
}
