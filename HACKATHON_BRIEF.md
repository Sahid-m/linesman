# TxOdds × Solana — World Cup Hackathon Brief

**London local event:** Encode Hub, Sat 18 – Sun 19 July 2026 (doors 10am Sat, submission deadline 12pm Sun local, finale 5:30pm)
**Global online hackathon:** Submissions close **July 19, 2026, 23:59 UTC** · Winners announced July 29
**Prize money:** $5,000 local pool + **$50,000 global pool** across three tracks
**Submit via:** Superteam Earn (links given on the day)
**Team size:** max 3 · individuals fine · free entry

---

## 1. The three global tracks

| Track | Pool | 1st / 2nd / 3rd | Submissions so far | Field |
|---|---|---|---|---|
| **Prediction Markets & Settlement** (flagship) | $18k | 12k / 4k / 2k | 68 | Most crowded |
| **Trading Tools & Agents** | $16k | 10k / 4k / 2k | 54 | Middle |
| **Consumer & Fan Experiences** | $16k | 10k / 4k / 2k | 52 | Least crowded |

A team can enter multiple tracks (per FAQ list), but one focused, working product beats two half-finished ones in a 30-hour build.

### Track A — Prediction Markets & Settlement ($18k)
Markets, resolution, settlement on verifiable World Cup data.

**Judging criteria:** core functionality with live/simulated feeds · UX & use case · code quality (clean, documented, deterministic resolution logic).

**What the organizers explicitly said they'll reward:** building an independent verification layer using TxLINE's **Merkle proofs** — "if your team chooses to design independent, custom check gates or validation logic using these primitives, your effort will be **highly valued by the judges**." Also: custom on-chain settlement engines that **CPI into TxLINE's `validate_stat` instruction** to trustlessly confirm outcomes and release escrowed funds.

**Hard constraints:**
- The TxL credit token is **locked to their program** — you cannot use TxL for P2P staking, wagering pools, or transfers. Use USDC/SOL/other SPL tokens for user funds.
- Trustless P2P wagering pools, escrows, and AMMs in *other* tokens are explicitly encouraged.

### Track B — Trading Tools & Agents ($16k)
Autonomous agents that ingest live odds/scores, detect signals, run strategies, execute without human input.

**Judging criteria:** data ingestion & smooth execution · **full autonomy** (zero manual intervention once deployed) · clean deterministic, *strategically defensible* logic · novelty · **production readiness** ("could a professional trading team realistically deploy it").

**Their starter ideas:** sharp-movement detector, agent-vs-agent arena with on-chain settlement, in-play market maker quoting two-sided prices.

### Track C — Consumer & Fan Experiences ($16k)
Fan-facing apps/games/bots that update live during matches.

**Judging criteria:** mainstream-fan UX polish · real-time responsiveness · originality · **clear monetization path** · completeness ("a functional end-to-end product feature, even if scope is deliberately small").

**Their starter ideas:** live group sweepstake, AI pundit Telegram bot (bonus for TTS), hi-lo stats streak game.

---

## 2. Universal submission requirements (all tracks)

1. **Demo video ≤ 5 min** (Loom/YouTube) — problem, live walkthrough, how TxLINE powers the backend. *Absolute requirement to pass initial screening.* Judging is "heavily based on the demo video" because matches will be over during review.
2. **Public GitHub repo.**
3. **Working deployed link** — website OR functional API/devnet endpoint judges can test.
4. **Brief technical doc** — core idea, highlights, and the **specific TxLINE endpoints used**.
5. **API feedback** — what you liked, where you hit friction (they ask for this explicitly; give a thoughtful answer, it's basically a free rubric item).

Auto-disqualified: pitch decks, wireframes, mockups, non-working concepts. Must integrate TxLINE as a **live input**.

**Winner process:** shortlist after close → **live interview rounds** → winners July 29. Be ready to talk through your architecture live.

⚠️ **Eligibility gotcha raised in the comments:** the track says "open to AI agents," but Hackathon T&C §5.1 reportedly requires entries to be human-created/submitted and allows disqualification if "materially controlled by agents." You're a human submitting — fine — but own your code and be able to explain every line in the interview.

---

## 3. TxLINE technical primer

### Getting access (free World Cup tier)
1. `POST /auth/guest/start` → guest **JWT** (valid 30 days), used as `Authorization: Bearer <jwt>`.
2. World Cup Free Tier: no TxL purchase needed, but you need a Solana wallet and a little SOL for tx fees. Subscribe on-chain (Anchor program), then `POST /api/token/activate` — activation requires **signing a message** (subscription tx signature + leagues + JWT) with your wallet's `signMessage`.
3. All data requests carry **both** headers: `Authorization: Bearer <jwt>` and `X-Api-Token`.

Hackathon perk: **all commercial fees waived through July 19, 23:59 UTC** — real-time premium feeds free. (Normal free tier Level 1 has a 60-second delay; Level 12 is real-time.)

### Networks — keep everything on ONE network
| | Mainnet | Devnet |
|---|---|---|
| API base | `https://txline.txodds.com/api/` | `https://txline-dev.txodds.com/api/` |
| Program ID | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxL mint | `Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL` | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` |

401 → renew guest JWT. 403 → your API token belongs to the other network.

### Core data endpoints
- **Fixtures** — upcoming/current fixture metadata (all 104 WC matches).
- **Odds** — snapshots, historical updates, and **SSE stream** of "StablePrice" consensus odds: `GET /api/odds/stream` (`Accept: text/event-stream`).
- **Scores** — snapshots, historical, and SSE stream of score/match events: `GET /api/scores/stream`. Each update carries a **`seq`** number — preserve it exactly (needed for proof validation; never substitute 0).
- **Historical replay** — `GET /api/scores/historical/{fixtureId}` returns the full score sequence for any fixture that started between 2 weeks and 6 hours ago. **This is your demo lifeline** (see §5).
- **Validation proofs** — `GET/POST /api/scores/stat-validation` with fixture ID + seq + stat keys → Merkle proof nodes + stat values.

Full spec: `https://txline.txodds.com/docs/docs.yaml` (OpenAPI). Runnable devnet scripts exist (`subscription_free_tier.ts`, `subscription_scores.ts`, `subscription_scores_v2.ts`) that handle the whole credential lifecycle.

### On-chain validation (the judge-pleaser)
- TxODDS anchors a Merkle root of each day's score data in a PDA: seed `"daily_scores_roots"` + epoch-day (`timestamp_ms / 86_400_000` as little-endian u16).
- Your client (or your smart contract via **CPI**) calls `validateStat` (single/two stats) or **`validateStatV2`** (array of `statKeys` with strategy predicates) on their program to prove a stat value against the on-chain root. Can be run read-only via Anchor `.view()` — no transaction needed for display purposes.
- All proof hashes must decode to **exactly 32 bytes**; PDA epoch-day must match the proof's timestamp, or you get `InvalidMainTreeProof`. In V2, every requested stat must be covered by exactly one strategy predicate or you get `IncompleteStatCoverage`. Debug predicates with exact-equality checks first.

---

## 4. Which track to target — recommendation

**Target: Prediction Markets & Settlement**, with the on-chain `validate_stat` CPI settlement as the centerpiece.

Why:
- **Biggest 1st prize ($12k)** and the organizers told you the answer key: they said verbatim that custom validation layers using their Merkle-proof primitives will be "highly valued." Most of the 68 submissions will be web dashboards that just read the SSE feed; a genuinely trustless settlement engine that CPIs into `validate_stat` will stand out sharply.
- It's the sponsor's flagship — TxLINE's whole pitch is "cryptographically verifiable on-chain data," and the project that best *demonstrates why that matters* wins their hearts.
- The crowd size is misleading: high submission count, but the floor is low (many will be non-working or feed-repackaging entries, which get auto-DQ'd or score poorly).

**Fallback / lower-risk option: Trading Tools & Agents.** If you're solo and not comfortable shipping an Anchor program in a weekend, an autonomous agent is far more forgiving — no smart contract required, judging rewards clean deterministic logic and logging, and "production readiness" is achievable with good engineering hygiene alone. 54 entries but the autonomy bar ("zero manual input") will eliminate many.

**Skip Consumer** unless you have a designer on the team — it's judged on mainstream-fan UX polish, which is the hardest thing to fake in 30 hours.

### Sweet-spot play: one build, two tracks
Teams can enter multiple tracks. A **prediction market with an autonomous keeper bot** naturally decomposes into two submissions:
- *Prediction Markets track:* the market + escrow + CPI settlement engine.
- *Trading Agents track:* the keeper/market-maker agent that watches the SSE feed, triggers resolutions, and quotes prices.
Same codebase, two demo videos framed differently. (Confirm the "one team, multiple prizes" FAQ on the day.)

---

## 5. Winning ideas, ranked

### 🥇 "ProofPlay" — trustless parametric prop-bet escrow (Prediction Markets)
Users lock USDC into a PDA against a specific verifiable stat condition ("total corners > 10", "Team A wins", "over 2.5 goals"). When the match ends, **anyone** (or your keeper bot) submits the TxLINE Merkle proof; your Anchor program CPIs into `validateStatV2`, verifies the stat against the on-chain daily root, and pays out **automatically with no oracle, no admin key, no multisig**. UI shows the Merkle proof "receipt" per settlement — the Verifiable Resolution UI they suggested, built in.
- Hits every explicitly-flagged high-value item in the track description (escrow ✓, CPI validation ✓, proof receipt ✓, deterministic resolution ✓).
- Demo story is killer: "watch the contract pay the winner the second the proof lands — nobody can stop it, nobody has to be trusted."
- Scope control: 2–3 hardcoded market templates on devnet is enough. Depth beats breadth.

### 🥈 "SharpLine" — odds-movement signal agent with on-chain paper-trading ledger (Trading Agents)
Agent polls/streams StablePrice odds for all fixtures, computes implied probability shifts, flags "sharp" moves (fast line movement beyond a threshold, steam moves across correlated markets), takes a paper position, and records every signal + entry price + outcome on-chain (memo or tiny program) so its track record is **tamper-proof and auditable** — which is exactly the "cryptographically verifiable" theme applied to the agent itself. Ships with a P&L dashboard and full decision logs.
- No user funds → no gambling-law headaches, fully demoable on replay data.
- "Strategically defensible logic" criterion: implied-probability math + z-score thresholds is easy to defend and document.

### 🥉 "Settlement-as-a-Service" oracle toolkit (Prediction Markets, infra angle)
A small open-source Anchor crate + TS SDK that *any* prediction market can drop in: `resolve(fixture, statKey, predicate)` → fetches proof, CPIs into `validate_stat`, emits a settlement event. Plus a CLI + hosted keeper. B2B infra plays impress judges ("production readiness", "oracle tooling" is named in the track blurb) and TxODDS themselves would want this to exist.

### Worth a look if you go Consumer
**Live sweepstake with proof-settled payouts:** friends each stake a small amount, get assigned teams, leaderboard updates live off the SSE feed, and the pot pays out at the final via a Merkle-proof-verified settlement — the group-chat use case everyone actually has during a World Cup, minus the "who holds the money" problem.

---

## 6. The demo-video problem (and the replay solution)

The tournament **ends the same day submissions close** — the final is Sunday July 19, judging happens after. Judges said it plainly: *"Submissions will be evaluated heavily based on the demo video."*

Plan accordingly:
- **Live matches during the build:** likely only the 3rd-place playoff (Sat) and the **final (Sun ~8pm, after the deadline)**. Capture live footage during Saturday's match if there is one.
- **`GET /api/scores/historical/{fixtureId}`** gives you full score sequences for any match in the last 2 weeks — that's the entire knockout stage. Build a **replay harness** early (feed historical sequences through your app at accelerated speed) so you can demo "live" behavior on demand, with real World Cup data. This also makes judges' post-deadline testing work — mention it in the README.
- Record the demo video **Sunday morning, before the 12pm local deadline**, not at 11:40am. Script it: problem (30s) → walkthrough (3min) → TxLINE integration + proof verification shown explicitly (1min) → close (30s).

---

## 7. Weekend battle plan

**Before Saturday (you have 3 days):**
- Get devnet access working *now*: guest JWT → free-tier subscribe → token activate → pull a fixture snapshot and hit both SSE streams. This auth flow is the most likely friction point; do not burn Saturday afternoon on it.
- Run their devnet example scripts; skim the OpenAPI yaml; fetch a real `stat-validation` proof and run `validateStatV2` via `.view()` once.
- Scaffold the repo (Anchor workspace + Next.js/TS client or plain TS agent).

**Saturday:** core loop working end-to-end by dinner — data in, decision/market logic, settlement path (even hardcoded). Everything after dinner is polish and the second market template. Rooftop party is a nice checkpoint, not a deadline extension.

**Sunday:** freeze features at 10am. Record video, write the tech doc + API feedback, deploy, submit by 11:30am local. Global deadline is 23:59 UTC if you need slack for the online submission, but the local pitch needs everything done by 12pm.

**Compliance note:** real-money wagering has legal exposure (they put the burden on you). Devnet + test USDC sidesteps it entirely and is explicitly acceptable ("live or on devnet").

---

## 8. Links
- Quickstart: https://txline.txodds.com/documentation/quickstart
- World Cup free tier: https://txline.txodds.com/documentation/worldcup
- OpenAPI spec: https://txline.txodds.com/docs/docs.yaml
- Docs index: https://txline-docs.txodds.com/llms.txt
- Streaming examples: https://txline.txodds.com/documentation/examples/streaming-data
- On-chain validation guide: https://txline.txodds.com/documentation/examples/onchain-validation
- Devnet runnable examples: https://txline.txodds.com/documentation/examples/devnet-examples
- Program addresses: https://txline.txodds.com/documentation/programs/addresses
