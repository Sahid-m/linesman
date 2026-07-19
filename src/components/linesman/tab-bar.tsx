"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/feed", label: "Feed", icon: "⚡" },
  { href: "/watchdog", label: "Watchdog", icon: "🛡" },
  { href: "/agent", label: "Agent", icon: "◎" },
  { href: "/replay", label: "Replay", icon: "⏱" },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-[480px] items-stretch justify-around">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium uppercase tracking-wide transition-transform active:scale-95"
              style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
