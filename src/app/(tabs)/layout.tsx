import type { ReactNode } from "react";
import Link from "next/link";
import { ConnectWalletControl } from "@/components/linesman/connect-wallet-modal";
import { LiveTicker } from "@/components/linesman/live-ticker";
import { TabBar } from "@/components/linesman/tab-bar";
import { SideNav } from "@/components/linesman/side-nav";
import { ReplayBug } from "@/components/linesman/replay-bug";
import { ShowcaseToast } from "@/components/linesman/showcase-toast";
import { VenueSimBanner } from "@/components/linesman/venue-sim-banner";
import { VenueSimClock } from "@/components/linesman/venue-sim-clock";
import { PhonePreviewGate } from "@/components/linesman/phone-preview-gate";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <PhonePreviewGate>
      <div className="linesman min-h-screen pb-24 lg:pb-0 lg:pl-60">
        <VenueSimClock />
        <ReplayBug />
        <SideNav />
        <LiveTicker />
        <ShowcaseToast />
        <VenueSimBanner />
        <header className="mx-auto flex max-w-[480px] items-center justify-between px-4 py-3 lg:hidden">
          <Link href="/feed" className="font-display text-xl tracking-wide text-[color:var(--color-text)]">
            LINES<span style={{ color: "var(--color-accent)" }}>MAN</span>
          </Link>
          <ConnectWalletControl variant="header" />
        </header>
        <main className="mx-auto max-w-[480px] px-4 pb-6 pt-4 md:max-w-3xl lg:max-w-5xl lg:px-10 lg:pt-8 xl:max-w-6xl">
          {children}
        </main>
        <TabBar />
      </div>
    </PhonePreviewGate>
  );
}
