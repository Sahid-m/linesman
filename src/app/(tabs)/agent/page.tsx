import { AgentPanel } from "@/components/agent-panel";
import { AgentProfileBanner } from "@/components/agent-profile-banner";

export default function AgentPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent)]">
          GroundTruth
        </p>
        <h1 className="font-display text-3xl tracking-wide text-[color:var(--color-text)] md:text-4xl">
          Latency edge, executed
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--color-muted)] md:text-base">
          TxLINE verifies a goal or card the instant it happens. Venues reprice after.
          GroundTruth watches that gap, sizes against the slowest book, logs every decision
          on Solana, and grades the book against an on-chain proof of the final score.
        </p>
      </header>
      <AgentProfileBanner />
      <AgentPanel />
    </section>
  );
}
