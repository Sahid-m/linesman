# Linesman — 5-minute pitch (YC formula)

**Timing:** ~4:30 talk + buffer. Bracketed cues are for you, not to read aloud.

---

## 0:00 — Hook (15s)

> "When a goal goes in at the World Cup, every prediction market is wrong for a few seconds. We built the thing that knows the truth first — and trades it."

## 0:15 — What we do, one sentence (YC clarity rule) (20s)

> "Linesman is the sharp-line cockpit for World Cup prediction markets. We take TxLINE's cryptographically-verified match data on Solana, join it to Polymarket and Kalshi, and show you exactly where the crowd is mispriced — then our agent, GroundTruth, acts on it automatically."

## 0:35 — Problem (45s)

> "Polymarket and Kalshi are crowd prices. When something happens on the pitch, each venue reprices on its own clock — some in a second, some in thirty. Traders today are guessing which gap is real and which is noise.
>
> And there's a deeper trust problem: any bot can *claim* a great track record. You can't verify it after the fact. Screenshots aren't proof."

[Beat.]

> "So you have two broken things: no independent fair line, and no way to trust anyone's results."

## 1:20 — Insight / Why now (30s)

> "Here's what changed. TxLINE now publishes a de-vigged, Merkle-anchored, timestamped fair line — on Solana, outside any venue's book. That's ground truth you can prove. Once that exists, two products fall out of it: a way to *see* mispricing, and a way to *act* on it that can't be faked."

## 1:50 — Solution + Demo (2:00) — the core

> "Let me show you." [Share screen.]

**Feed (30s)**

> "This is the Edge Feed. Each card is a live venue price next to TxLINE's sharp fair value. This number here is the gap — that's the mispricing, ranked. This chip tells you honestly whether you're seeing live data or replay — we never fake that."

[Tap a card → verify.]

> "And this is the part judges asked for: I press Verify, and it checks the score against TxLINE's proof on Solana. Every number on this screen traces back to an on-chain Merkle root."

**Replay (25s)**

> "For the demo I'll pin England vs Argentina. The match clock runs, and the whole app follows it — Feed and Watchdog reprice minute by minute off real Polymarket and Kalshi books. So you can watch a gap open the moment a goal lands."

**Agent (45s) — the money shot**

> "Now the Agent tab. This is GroundTruth running on its own. The second TxLINE confirms a goal or card, it snapshots every venue, measures who reprices and how fast, and acts against the slowest book.
>
> This column — reaction time — is the whole thesis made visible: Polymarket moved in two seconds, this venue took twelve. Every decision is logged here as a Solana memo — I click through to the explorer, there's the transaction. And at full-time it grades itself against the on-chain final-score proof. Its track record is verifiable by anyone, forever."

[Return to face cam.]

## 3:50 — Why we win (30s)

> "Three reasons. One: everything is anchored to TxLINE's proofs — this is exactly the trust layer the organizers built the hackathon around. Two: it's not a single-book toy — we're across Polymarket, Kalshi, and SX Bet. Three: it's a real product on both phone and desktop, plus a fully autonomous agent, on one shared rail."

## 4:20 — Traction / status (15s)

> "It's live today on devnet, end to end: wallet activation, live feed, on-chain verification, and the autonomous agent grading its own calls."

## 4:35 — Ask / close (20s)

> "Prediction markets asked for ground truth, proof, and action. Most teams pick one. We shipped all three in one repo you can run right now. That's Linesman."

---

## Q&A prep (have ready, don't say unless asked)

- **"Is it trading real money?"** → "The agent runs on devnet with its own signer; the strategy and the on-chain proof-of-record are the product. Scaling execution is the roadmap — the verification and audit layers are already done."
- **"What's defensible?"** → "The reaction-time dataset per venue per event. Nobody else is measuring who's slow, against a proof."
- **"Coverage gaps?"** → "Venue coverage expands as public books allow; mainnet level-12 tightens latency further."
- **"Biggest technical risk?"** → "Feed availability during live matches — that's why replay is the deterministic demo path."
