# Linesman × GroundTruth — Product Brief

**TxODDS × Solana World Cup Hackathon**  
**One product. Two killer loops. Fully on-chain verifiable.**

---

## One-liner

Linesman is the sharp-line cockpit for World Cup prediction markets — and GroundTruth is the agent that trades the milliseconds between a verified match event and the venues that still haven’t moved.

---

## The problem

Polymarket and Kalshi are crowd books. When a goal lands, every venue reprices on its own clock. Without an independent, cryptographically anchored fair line, traders are guessing which lag is real and which is noise — and nothing about a bot’s track record can be trusted after the fact.

TxLINE already publishes de-vigged, Merkle-anchored, timestamped ground truth on Solana. What’s missing is the product layer that **sees**, **proves**, and **acts**.

---

## What we built

### 1. Linesman — signal, not catalogue

A mobile-first feed that auto-joins TxLINE sharp lines to open Polymarket and Kalshi books, ranks edge, and exposes a Disagreement Index. Watchdog audits whether venues settled correctly. Every card can press **Verify on-chain** and hit `validateStatV2` against the daily Merkle root.

### 2. GroundTruth — autonomous latency agent

When TxLINE tags a goal or card, the agent:

1. Snapshots reachable venues (Polymarket, Kalshi, SX Bet, TxLINE bookmaker ticks)
2. Measures who reprices and by how much
3. Selects the **slowest** book relative to the **fastest** fair
4. Logs the decision as an SPL Memo on Solana — timestamped, tamper-evident
5. At full-time, grades every open position against a real on-chain score proof

Zero manual steps once the loop is running. Replay mode demos any past fixture; live mode streams whatever’s in play.

### 3. Shared trust rail

Wallet-authenticated TxLINE access, encrypted credentials server-side, Solana proof validation, World Cup schedule awareness, and honest source labeling (`LIVE` / `REPLAY`) — one foundation for both the human cockpit and the agent.

---

## Why judges should care

| Criterion | How we hit it |
| --- | --- |
| **TxLINE as the trust layer** | Fair value, score events, and grading all flow from TxLINE; proofs use `validateStatV2` |
| **On-chain accountability** | Agent decisions land as Solana memos; settlement checks are Merkle-backed |
| **Autonomy** | GroundTruth runs unattended after start — detect → decide → log → grade |
| **Production-shaped UX** | Feed / Watchdog / Agent / Replay — demo-ready on phone and desktop |
| **Cross-venue truth** | Not a single-book toy; Polymarket + Kalshi (+ SX Bet on the agent path) |
| **Deterministic strategy** | Trade the measured price gap, not vibes; optional LLM text never decides |

**Track fit:** strongest in **Trading Tools & Agents**, with clear spillover into **Prediction Markets & Settlement** (independent verification + settlement audit) and a consumer-grade Feed for the fan track narrative.

---

## Demo script (3 minutes)

1. Connect wallet → activate TxLINE (devnet).
2. Open **Feed** — live sharp vs venue gaps, source chip honest.
3. **Replay** → England vs Argentina → match minute advances; Feed/Watchdog move with the clock.
4. Open a card → **Verify on-chain** receipt.
5. **Agent** → show decisions, venue reaction table, Solana explorer memo, graded P&L.

Optional live: `pnpm agent:run -- --fixtureId=… --mode=replay --speed=300` during the pitch so new rows appear while you talk.

---

## Technical spine

- **Stack:** Next.js, Neon Postgres, Solana wallet adapter, TxLINE REST/SSE, Drizzle
- **Venues:** Polymarket CLOB + history, Kalshi `KXWCGAME`, SX Bet (agent), TxLINE StablePrice
- **Agent loop:** `detector → decision/reaction → memo → grading`
- **Proofs:** read-only `validateStatV2` view against daily_scores_roots
- **Honesty:** activated sessions never silently mix mock into live cards

---

## What’s next (roadmap language)

Venue coverage expands as public books allow. Mainnet level-12 unlocks tighter latency. The same decision log is the natural bridge into fuller execution and settlement rails — the verification and audit layers are already in place.

---

## Team ask

We’re shipping a working sharp-line product **and** a verifiable autonomous agent on the same TxLINE × Solana stack. That’s the World Cup story organizers asked for: ground truth, proof, and action — in one repo judges can run.
