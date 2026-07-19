# Integration friction log

Append-only. Each entry: what we hit, what we did about it.

---

**`drizzle-kit` doesn't read `.env.local`.** The Drizzle CLI (`db:generate`,
`db:migrate`) only sees `process.env`, not Next's `.env.local` convention.
Worked around by exporting `DATABASE_URL` in the shell before running
migrations; a real fix would be a `dotenv -e .env.local --` wrapper.

**Tailwind v4 cascade layers vs. legacy unlayered CSS.** The starter's
global CSS used bare element selectors (`h1`, `a`, `button`) with no
`@layer`. Since unlayered rules beat `@layer` rules regardless of source
order, Tailwind utility classes on the same tags were silently losing to
the old styles (headings staying huge/clamped on desktop). Fixed by
wrapping every legacy rule in `@layer base` in `globals.css`.

**`server-only` throws outside the Next.js bundler.** Any module that
`import "server-only"` (our `db/client.ts`, `lib/txline/credentials.ts`,
`lib/sources/recorder.ts`, etc.) throws immediately if required from a
plain Node/tsx process — the package's "react-server" export condition is
what neuters it, and that condition only exists inside Next's own bundling.
This meant `scripts/record.ts` (a genuinely headless recorder meant to run
with no browser open) *cannot* import the credential/DB layer directly.
Worked around by giving the recorder a small authenticated HTTP tick
endpoint (`POST /api/internal/record`) inside the running Next server, and
having the standalone script just poll that over plain `fetch` — same
pattern a keeper bot would use against a deployed instance anyway.

**No public per-match venue price API.** Polymarket/Kalshi only expose
headline outright markets (e.g. "World Cup Winner") through discoverable
public endpoints — there's no catalog of every regular fixture's own
match-winner market. That means a genuinely live TxLINE sharp line for an
arbitrary in-progress match currently has no real venue price to pair with
into an Edge; `lib/sources/manager.ts` reports the TxLINE connection as
healthy (`liveTxlineConnected`) without fabricating an edge from it. The one
real live venue integration we do have (Polymarket's WC Winner outright) is
wired into the ticker instead, where the market types genuinely match.

**`validateStatV2` stat-key semantics aren't documented publicly.** The
on-chain call needs specific integer "stat keys" (e.g. which key means "home
goals") that come from TxLINE's own internal registry. Without that
registry we use placeholder keys (`[0, 1]`) in `/api/verify/score` and
`scripts/verify-cli.ts` — correct proof-format and on-chain call shape, but
the "verified" happy path needs TxLINE's real key table to resolve
semantically instead of just structurally.

**Recharts `Tooltip` formatter typings.** `labelFormatter`/`formatter` props
type their arguments loosely (`unknown`-ish), so `detail-gap-chart.tsx`
casts to `number` explicitly inside the callbacks rather than fighting the
generic signature.

**No API maps a TxLINE fixture to a venue market — curation is the answer,
not automation.** Neither Polymarket nor Kalshi expose "find me the market
for TxLINE fixture N"; the join only exists in a human's head (team names +
kickoff time). `data/market-map.json` + `scripts/discover-markets.ts` make
that one-time human step as cheap as possible — list both sides, hand-pair
venue market ids, paste the generated skeleton in. This supersedes the
"No public per-match venue price API" note above: it's still true that
there's no *automatic* mapping, but `lib/engine/mapping.ts` now gives that
manual mapping a real, live-priced, de-vigged join once it exists.

**`getFixtureProvenResult` (Watchdog's live audit path) is defensive, not
verified.** Building the mapped Watchdog audit needed TxLINE's real
finished-fixture score payload shape (`/api/scores/snapshot/{fixtureId}`),
but no fixture finished during a live, activated session while this was
built — there was nothing to sample. It tries several plausible key names
(`homeGoals`/`homeScore`/`home`/...) and returns `null` (dropping that
fixture from the audit, never fabricating a verdict) on anything
unexpected. Whoever runs this live at the hackathon should sample a real
payload from a finished mapped fixture and tighten `numericFieldFrom`'s key
list in `lib/sources/txline.ts` if it doesn't match on the first try.

**Polymarket's 1x2 book is three separate binary markets, not one 3-way
market.** "Will Spain win?", "Will it draw?", "Will Argentina win?" are each
their own Yes/No Gamma market with their own id and their own (small) vig.
`lib/engine/mapping.ts` groups the three mapping entries that share a
fixture+market into one "book" and runs `devigBook()` across all three raw
Yes prices together before computing each selection's edge — de-vigging
each one independently against its own 2-outcome Yes/No book would double
another book's margin into the fair price.
