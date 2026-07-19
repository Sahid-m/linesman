# Linesman — 5-minute pitch (demo-screen script)

**How to use this:** You're presenting entirely from the screen share. Each block below is one screen. **SHOW** = what to have on screen. **SAY** = what to say while it's up. Bracketed cues `[ ]` are actions, not spoken.

**Timing:** ~5:00. Hook + problem are ~1 min of talking over the app; the rest is live clicking.

---

## 1 — Hook + one-liner (0:00–0:45)

**SHOW:** The **Feed** tab, already loaded, edges visible.

**SAY:**
> "When a goal goes in at the World Cup, every prediction market is wrong for a few seconds. Polymarket, Kalshi — they all reprice on their own clock. We built the thing that knows the truth first, proves it on-chain, and trades the gap for you.
>
> This is **Linesman**. It takes TxLINE's cryptographically-verified match data on Solana, joins it to the real venues, shows you exactly where the crowd is mispriced — and our agent, **GroundTruth**, acts on it automatically, on your terms."

---

## 2 — The problem, on the Feed (0:45–1:30)

**SHOW:** Stay on **Feed**. Point at one edge card — the venue price, the fair value, the gap number, and the live/replay chip.

**SAY:**
> "Two broken things today. One — there's no independent fair line. Every price you see is somebody's book. Two — nobody's track record is trustworthy. Any bot can *claim* it prints money; screenshots aren't proof.
>
> Here's our answer to the first one. [Point at a card.] Each card is a live venue price next to TxLINE's sharp fair value. This number is the gap — the mispricing — ranked biggest first. And this chip tells you honestly whether it's live or replay. We never fake that."

---

## 3 — Proof on Solana (1:30–2:05)

**SHOW:** Tap a card → **Verify**. Let the on-chain check resolve, then click through to the Solana explorer transaction.

**SAY:**
> "This is the trust layer the hackathon was built around. I hit Verify — it checks the score against TxLINE's proof on Solana. [Explorer opens.] There's the transaction. Every number on this screen traces back to an on-chain Merkle root. Not our database — the chain."

---

## 4 — Replay: watch a gap open (2:05–2:35)

**SHOW:** **Replay** tab → pin **England vs Argentina**. Let the match clock advance a few minutes so Feed/Watchdog reprice.

**SAY:**
> "There's no live World Cup match right now, so I'll re-run a real one. [Start replay.] The match clock runs and the whole app follows it — Feed and Watchdog reprice minute by minute off the actual Polymarket and Kalshi books from that game. Watch a gap open the instant a goal lands. This is real historical market data, not a mockup."

---

## 5 — Agent Settings: the "trade on my behalf" moment (2:35–3:20)

**SHOW:** **Agent** tab → click **Edit risk settings** → the settings page. Click **Aggressive**, nudge the stake slider, drop the min-edge slider, toggle **Auto-trade on**, type one line in the strategy box, hit **Arm agent**.

**SAY:**
> "Here's what makes it a product, not a script. You don't write code to use the agent — you tell it how much risk you want.
>
> [Click Aggressive.] Pick a risk profile — that sets your stake and how big a gap it needs before it acts. [Move sliders.] Or fine-tune: max stake per trade, and the minimum edge worth chasing. [Toggle.] Arm auto-trade, and GroundTruth trades on your behalf on every detected event. [Type note, Arm agent.] Saved. This isn't cosmetic — the agent reads this exact config before every decision."

---

## 6 — Agent: the money shot (3:20–4:20)

**SHOW:** Back to **Agent** tab. Active-profile banner shows "Auto-trading armed · Aggressive · …". Scroll the decisions: expand one to show per-venue reaction times, click its on-chain memo link, point at a graded P&L / hit-rate.

**SAY:**
> "Now GroundTruth running on its own. Up top — the profile I just set, armed. The second TxLINE confirms a goal, it snapshots every venue, measures who reprices and how fast, and trades against the slowest book — sized to my risk setting.
>
> [Expand a decision.] This column — reaction time — is the whole thesis made visible. Polymarket moved in two seconds; this venue took twelve. [Click memo.] Every decision is logged as a Solana memo — there's the transaction. And at full-time it grades itself against the on-chain final-score proof. [Point at hit rate / P&L.] So its track record is verifiable by anyone, forever. No screenshots. Just the chain."

---

## 7 — Why we win + close (4:20–5:00)

**SHOW:** Back on **Agent** tab (banner + decisions visible) or **Feed**.

**SAY:**
> "Three reasons we win. One: everything is anchored to TxLINE's proofs — the exact trust layer this hackathon is about. Two: it's not a single-book toy — Polymarket, Kalshi, and SX Bet on one rail. Three: it's a real product — phone and desktop, plus an autonomous agent you configure in plain English and arm in one click.
>
> It's live today on devnet, end to end: wallet activation, live feed, on-chain verification, and an agent that grades its own calls against a proof. Prediction markets asked for ground truth, proof, and action. Most teams pick one. We shipped all three. That's Linesman."

---

## Demo flow cheat-sheet (screens in order)

1. **Feed** — hook + problem + the gap number
2. **Feed → Verify → Explorer** — on-chain proof
3. **Replay** — pin England vs Argentina, run the clock
4. **Agent → Edit risk settings** — pick risk, arm auto-trade
5. **Agent** — reaction times, on-chain memo, self-graded P&L
6. **Close** on Agent or Feed

**Pre-demo checklist:**
- Wallet connected + activated on devnet (needed to arm the agent).
- At least one graded decision already in the Agent feed (run `pnpm agent:run` on the England vs Argentina fixture beforehand so the money-shot screen isn't empty).
- Replay fixture pre-selected so you don't fumble the picker on stage.

---

## Q&A prep (have ready, don't say unless asked)

- **"Is it trading real money?"** → "The agent runs on devnet with its own signer; the strategy, the risk-config layer, and the on-chain proof-of-record are the product. Scaling execution is the roadmap — verification and audit are already done."
- **"How does the settings page actually control the agent?"** → "It writes a config row per network; the agent loads it before every event and honors stake, minimum edge, and the auto-trade switch. Turn it off and the agent pauses — live."
- **"What's defensible?"** → "The reaction-time dataset per venue per event, measured against a proof. Nobody else knows who's slow, provably."
- **"Coverage gaps?"** → "Venue coverage expands as public books allow; mainnet level-12 tightens latency further."
- **"Biggest technical risk?"** → "Feed availability during live matches — that's why replay is the deterministic demo path."
