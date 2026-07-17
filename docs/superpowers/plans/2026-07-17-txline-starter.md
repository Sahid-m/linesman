# TxLINE Solana Starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-deployable Next.js starter that authenticates Solana wallets, activates per-network TxLINE access, streams World Cup data, replays historical scores, and validates score proofs on-chain.

**Architecture:** Browser code owns wallet connection and signatures. Next.js route handlers own sessions, encrypted TxLINE credentials, API proxying, and short-lived SSE proxy connections. Neon Postgres persists wallet users, nonce challenges, sessions, and one setup record per wallet/network.

**Tech Stack:** Next.js App Router, React, TypeScript, Solana Wallet Adapter/Wallet Standard, Anchor, Drizzle ORM, Neon Postgres, Zod, Vitest, Playwright, Vercel.

## Global Constraints

- Use the repository root for the Next.js application; preserve the existing Markdown research and `docs/` files.
- Support `devnet` and `mainnet` only.
- Devnet uses TxLINE service level `1`; mainnet allows levels `1` and `12`.
- Subscription duration is exactly four weeks.
- Store TxLINE JWTs and API tokens encrypted with AES-256-GCM.
- Never expose the API token to browser JavaScript.
- Expose the guest JWT only in the one-time activation signing message.
- Preserve score `seq` exactly; never synthesize or default it.
- Keep stream events in bounded browser memory, not Postgres.
- Use focused tests only: four unit-test areas, one auth/credential integration test, and one mocked browser smoke test.
- Treat commit steps as checkpoints; run them only after the user explicitly authorizes commits.

## File Map

### Foundation

- `package.json`: scripts and dependencies.
- `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`: TypeScript and Next.js configuration.
- `.env.example`: Neon, encryption, RPC, and application environment contract.
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`: application shell and neutral dashboard.
- `src/components/app-providers.tsx`: wallet and selected-network providers.
- `src/lib/network/config.ts`: indivisible devnet/mainnet configuration.
- `src/lib/network/config.test.ts`: network-isolation unit tests.

### Persistence and wallet auth

- `drizzle.config.ts`: migration configuration.
- `src/db/client.ts`: Neon/Drizzle client.
- `src/db/schema.ts`: users, nonces, sessions, and TxLINE credentials.
- `src/lib/security/encryption.ts`, `src/lib/security/encryption.test.ts`: AES-GCM credential envelope.
- `src/lib/auth/message.ts`: deterministic wallet-login message.
- `src/lib/auth/session.ts`: nonce, signature, cookie, and session helpers.
- `src/app/api/auth/nonce/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/api/auth/session/route.ts`, `src/app/api/auth/logout/route.ts`: auth API.
- `src/components/wallet-session.tsx`: connect/sign-in/logout UI.
- `src/test/auth-credentials.integration.test.ts`: access-control integration test.

### TxLINE setup

- `src/lib/txline/idl/devnet.json`, `src/lib/txline/idl/mainnet.json`: official matching IDLs.
- `src/lib/txline/activation.ts`, `src/lib/txline/activation.test.ts`: exact activation preimage.
- `src/lib/txline/credentials.ts`: encrypted credential persistence and JWT renewal.
- `src/lib/txline/subscription.ts`: client-side Anchor subscription builder.
- `src/app/api/txline/setup/start/route.ts`: create guest JWT.
- `src/app/api/txline/setup/activation-message/route.ts`: persist confirmed transaction and return preimage.
- `src/app/api/txline/setup/activate/route.ts`: activate and store API token.
- `src/app/api/txline/setup/status/route.ts`: resumable setup status.
- `src/components/txline-setup.tsx`: four-step setup wizard.

### Data, replay, and validation

- `src/lib/txline/client.ts`: authenticated server-side HTTP client with one JWT renewal.
- `src/lib/txline/sse.ts`, `src/lib/txline/sse.test.ts`: SSE parser preserving IDs and payloads.
- `src/lib/txline/types.ts`: normalized live/replay event types.
- `src/app/api/txline/fixtures/route.ts`: fixture snapshot proxy.
- `src/app/api/txline/odds/[fixtureId]/route.ts`: odds snapshot proxy.
- `src/app/api/txline/scores/[fixtureId]/route.ts`: score snapshot proxy.
- `src/app/api/txline/stream/[kind]/route.ts`: odds/scores SSE proxy.
- `src/app/api/txline/history/[fixtureId]/route.ts`: historical score proxy.
- `src/lib/replay/controller.ts`: browser replay scheduler.
- `src/app/api/txline/validate/route.ts`: proof retrieval and `validateStatV2` view.
- `src/components/fixture-browser.tsx`, `src/components/live-stream.tsx`, `src/components/replay-panel.tsx`, `src/components/validation-panel.tsx`: dashboard features.

### Delivery

- `e2e/happy-path.spec.ts`: one mocked browser smoke test.
- `playwright.config.ts`, `vitest.config.ts`: focused test configuration.
- `README.md`: setup, architecture, endpoints, and manual devnet runbook.
- `vercel.json`: Node runtime and SSE route duration configuration.

---

### Task 1: Application Foundation and Network Isolation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/lib/network/config.test.ts`
- Create: `src/lib/network/config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/components/app-providers.tsx`

**Interfaces:**
- Produces: `Network = "devnet" | "mainnet"`.
- Produces: `getNetworkConfig(network: Network): NetworkConfig`.
- Produces: browser `NetworkProvider` with `{ network, setNetwork }`.

- [ ] **Step 1: Create the package and tool configuration**

Create scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`, `db:generate`, and `db:migrate`. Install current package releases rather than pinning guessed versions:

```bash
pnpm add next@latest react@latest react-dom@latest @coral-xyz/anchor @solana/web3.js @solana/spl-token @solana/wallet-adapter-base @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @neondatabase/serverless drizzle-orm zod tweetnacl bs58 bn.js
pnpm add -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next drizzle-kit vitest @vitest/coverage-v8 @playwright/test
```

Set `package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

`.env.example` must define:

```dotenv
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
CREDENTIAL_ENCRYPTION_KEY_BASE64=replace-with-32-random-bytes-in-base64
SESSION_COOKIE_NAME=txline_session
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEVNET_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_MAINNET_RPC_URL=https://api.mainnet-beta.solana.com
```

- [ ] **Step 2: Write the failing network-isolation test**

```typescript
import { describe, expect, it } from "vitest";
import { getNetworkConfig } from "./config";

describe("getNetworkConfig", () => {
  it("returns a complete devnet tuple", () => {
    expect(getNetworkConfig("devnet")).toMatchObject({
      network: "devnet",
      apiOrigin: "https://txline-dev.txodds.com",
      programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
      txlMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
      serviceLevels: [1],
    });
  });

  it("keeps mainnet values together", () => {
    const config = getNetworkConfig("mainnet");
    expect(config.apiOrigin).toBe("https://txline.txodds.com");
    expect(config.serviceLevels).toEqual([1, 12]);
  });
});
```

- [ ] **Step 3: Run the test and verify failure**

Run: `pnpm test -- src/lib/network/config.test.ts`

Expected: FAIL because `./config` does not exist.

- [ ] **Step 4: Implement typed network configuration**

```typescript
export type Network = "devnet" | "mainnet";

export type NetworkConfig = Readonly<{
  network: Network;
  rpcUrl: string;
  apiOrigin: string;
  programId: string;
  txlMint: string;
  serviceLevels: readonly number[];
}>;

const configs: Record<Network, NetworkConfig> = {
  devnet: {
    network: "devnet",
    rpcUrl: process.env.NEXT_PUBLIC_DEVNET_RPC_URL ?? "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
    txlMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
    serviceLevels: [1],
  },
  mainnet: {
    network: "mainnet",
    rpcUrl: process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
    txlMint: "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
    serviceLevels: [1, 12],
  },
};

export function getNetworkConfig(network: Network): NetworkConfig {
  return configs[network];
}
```

- [ ] **Step 5: Add the app shell and wallet/network providers**

`AppProviders` must wrap `ConnectionProvider`, `WalletProvider`, `WalletModalProvider`, and a local network context. Changing network recreates the Solana connection and clears selected fixture/stream UI state. The home page renders cards for wallet session, TxLINE setup, fixtures, live streams, replay, and validation, with locked states until prerequisites are met.

Use `dynamic(() => import("../components/app-providers"), { ssr: false })` if a wallet package reads browser globals during SSR.

- [ ] **Step 6: Verify the foundation**

Run: `pnpm test -- src/lib/network/config.test.ts && pnpm typecheck && pnpm build`

Expected: two tests PASS; typecheck and production build exit 0.

- [ ] **Step 7: Commit checkpoint if authorized**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next-env.d.ts next.config.ts eslint.config.mjs .gitignore .env.example src
git commit -m "feat: scaffold network-aware TxLINE starter"
```

---

### Task 2: Database, Encryption, and Credential Boundaries

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/db/client.ts`
- Create: `src/db/schema.ts`
- Create: `src/lib/security/encryption.test.ts`
- Create: `src/lib/security/encryption.ts`
- Create: `src/lib/txline/credentials.ts`

**Interfaces:**
- Produces: `encryptSecret(value: string): string`.
- Produces: `decryptSecret(envelope: string): string`.
- Produces: `getCredential(userId: string, network: Network): Promise<TxlineCredential | null>`.
- Produces: `upsertCredentialState(input: CredentialStateInput): Promise<void>`.

- [ ] **Step 1: Define the Drizzle schema**

Use UUID primary keys and timezone-aware timestamps. Define:

```typescript
export const setupState = pgEnum("setup_state", [
  "guest_created",
  "subscribed",
  "activated",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletPublicKey: text("wallet_public_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Add `wallet_nonces`, `sessions`, and `txline_credentials` exactly as specified in the design. Enforce a unique index on `(userId, network)`. Credential JWT fields are non-null after `guest_created`; API-token fields are nullable until `activated`.

- [ ] **Step 2: Write encryption failure and round-trip tests**

```typescript
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY_BASE64 =
    Buffer.alloc(32, 7).toString("base64");
});

it("round-trips an encrypted credential", async () => {
  const { decryptSecret, encryptSecret } = await import("./encryption");
  const envelope = encryptSecret("secret-token");
  expect(envelope).not.toContain("secret-token");
  expect(decryptSecret(envelope)).toBe("secret-token");
});

it("rejects a modified authentication tag", async () => {
  const { decryptSecret, encryptSecret } = await import("./encryption");
  const envelope = encryptSecret("secret-token");
  const parsed = JSON.parse(Buffer.from(envelope, "base64url").toString());
  parsed.tag = Buffer.alloc(16).toString("base64url");
  const tampered = Buffer.from(JSON.stringify(parsed)).toString("base64url");
  expect(() => decryptSecret(tampered)).toThrow();
});
```

- [ ] **Step 3: Run encryption tests and verify failure**

Run: `pnpm test -- src/lib/security/encryption.test.ts`

Expected: FAIL because `./encryption` does not exist.

- [ ] **Step 4: Implement AES-256-GCM envelopes**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Envelope = { v: 1; iv: string; tag: string; ciphertext: string };

function key(): Buffer {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY_BASE64;
  if (!value) throw new Error("CREDENTIAL_ENCRYPTION_KEY_BASE64 is required");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return decoded;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const envelope: Envelope = {
    v: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
  return Buffer.from(JSON.stringify(envelope)).toString("base64url");
}

export function decryptSecret(value: string): string {
  const envelope = JSON.parse(
    Buffer.from(value, "base64url").toString("utf8"),
  ) as Envelope;
  if (envelope.v !== 1) throw new Error("Unsupported credential envelope");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 5: Generate and apply the first migration**

Run: `pnpm db:generate && pnpm db:migrate`

Expected: a migration appears under `drizzle/` and applies successfully to the configured Neon database.

- [ ] **Step 6: Implement scoped credential access**

All functions require `userId` and `network`; do not export an unscoped lookup. Store only encrypted credential values. Decode the guest JWT `exp` claim without treating it as trusted authorization data. Calculate subscription expiry as `subscriptionCreatedAt + durationWeeks * 7 days`.

- [ ] **Step 7: Verify persistence**

Run: `pnpm test -- src/lib/security/encryption.test.ts && pnpm typecheck`

Expected: encryption tests PASS and typecheck exits 0.

- [ ] **Step 8: Commit checkpoint if authorized**

```bash
git add drizzle.config.ts drizzle src/db src/lib/security src/lib/txline/credentials.ts
git commit -m "feat: add encrypted wallet credential storage"
```

---

### Task 3: Wallet Authentication and Session Integration

**Files:**
- Create: `src/lib/auth/message.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/app/api/auth/nonce/route.ts`
- Create: `src/app/api/auth/verify/route.ts`
- Create: `src/app/api/auth/session/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/components/wallet-session.tsx`
- Create: `src/test/auth-credentials.integration.test.ts`

**Interfaces:**
- Produces: `buildLoginMessage(input: LoginMessageInput): string`.
- Produces: `requireSession(): Promise<{ sessionId: string; userId: string; walletPublicKey: string }>`.
- Produces API: `POST /api/auth/nonce`, `POST /api/auth/verify`, `GET /api/auth/session`, `POST /api/auth/logout`.

- [ ] **Step 1: Write the integration test**

Use a temporary test transaction or mocked Drizzle adapter. Generate a `tweetnacl` keypair, request a nonce, sign the returned message, verify it, then assert:

```typescript
expect(verifyResponse.status).toBe(200);
expect(verifyResponse.headers.get("set-cookie")).toContain("HttpOnly");
expect((await sessionResponse.json()).walletPublicKey).toBe(walletPublicKey);
expect(await getCredential(otherUserId, "devnet")).toBeNull();
```

Also assert nonce reuse returns `409` and a mainnet lookup cannot return devnet credentials.

- [ ] **Step 2: Run the integration test and verify failure**

Run: `pnpm test -- src/test/auth-credentials.integration.test.ts`

Expected: FAIL because auth routes/helpers do not exist.

- [ ] **Step 3: Implement deterministic login messages**

```typescript
export function buildLoginMessage(input: {
  domain: string;
  walletPublicKey: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    `${input.domain} wants you to sign in with your Solana account:`,
    input.walletPublicKey,
    "",
    "Sign in to the TxLINE starter. This does not submit a transaction.",
    "",
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expiresAt}`,
  ].join("\n");
}
```

- [ ] **Step 4: Implement nonce and session helpers**

Hash nonce and session tokens with SHA-256 before storage. Nonces expire after five minutes and are consumed atomically. Sessions expire after seven days. Verify detached Ed25519 signatures with `tweetnacl.sign.detached.verify`, `bs58.decode(walletPublicKey)`, and the exact UTF-8 message bytes.

The cookie must use `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`, `path: "/"`, and `maxAge: 604800`.

- [ ] **Step 5: Implement auth routes and wallet UI**

Validate all inputs with Zod. The browser flow is connect wallet → request nonce → `signMessage` → verify → refresh session. If `signMessage` is unavailable, show a compatibility error. Logout revokes the session row before deleting the cookie.

- [ ] **Step 6: Verify authentication**

Run: `pnpm test -- src/test/auth-credentials.integration.test.ts && pnpm typecheck && pnpm build`

Expected: integration assertions PASS; build exits 0.

- [ ] **Step 7: Commit checkpoint if authorized**

```bash
git add src/lib/auth src/app/api/auth src/components/wallet-session.tsx src/test
git commit -m "feat: authenticate users with Solana wallets"
```

---

### Task 4: TxLINE Subscription and Activation Wizard

**Files:**
- Create: `src/lib/txline/idl/devnet.json`
- Create: `src/lib/txline/idl/mainnet.json`
- Create: `src/lib/txline/activation.test.ts`
- Create: `src/lib/txline/activation.ts`
- Create: `src/lib/txline/subscription.ts`
- Create: `src/app/api/txline/setup/start/route.ts`
- Create: `src/app/api/txline/setup/activation-message/route.ts`
- Create: `src/app/api/txline/setup/activate/route.ts`
- Create: `src/app/api/txline/setup/status/route.ts`
- Create: `src/components/txline-setup.tsx`

**Interfaces:**
- Produces: `buildActivationMessage(txSig: string, jwt: string): string`.
- Produces: `subscribeFreeTier(input: SubscribeInput): Promise<string>`.
- Produces setup status `{ state, network, serviceLevelId, txSignature, error? }`.

- [ ] **Step 1: Vendor official network IDLs**

Copy without modification from:

```text
https://github.com/txodds/tx-on-chain/blob/main/examples/devnet/idl/txoracle.json
https://github.com/txodds/tx-on-chain/blob/main/examples/mainnet/idl/txoracle.json
```

After copying, instantiate each `Program` in a test/script and assert its IDL address matches the configured program ID before allowing setup.

- [ ] **Step 2: Write the activation-message test**

```typescript
import { expect, it } from "vitest";
import { buildActivationMessage } from "./activation";

it("keeps the empty leagues field as two colons", () => {
  expect(buildActivationMessage("tx123", "jwt456")).toBe("tx123::jwt456");
});
```

- [ ] **Step 3: Run the test and verify failure**

Run: `pnpm test -- src/lib/txline/activation.test.ts`

Expected: FAIL because `./activation` does not exist.

- [ ] **Step 4: Implement activation formatting and subscription**

```typescript
export function buildActivationMessage(txSig: string, jwt: string): string {
  if (!txSig || !jwt) throw new Error("Transaction signature and JWT are required");
  return `${txSig}::${jwt}`;
}
```

`subscribeFreeTier` must derive `token_treasury_v2` and `pricing_matrix` PDAs, derive token accounts using Token-2022, call `subscribe(serviceLevelId, 4)`, and return the confirmed transaction signature. Reject service levels not present in `getNetworkConfig(network).serviceLevels`.

- [ ] **Step 5: Implement setup routes**

`start` calls `${apiOrigin}/auth/guest/start`, encrypts the JWT, and sets state `guest_created`.

`activation-message` accepts `{ network, txSignature }`, verifies the transaction through the matching RPC, confirms the authenticated wallet is a signer, stores the signature/state, decrypts the JWT, and returns `{ message: buildActivationMessage(txSignature, jwt) }`.

`activate` accepts `{ network, walletSignature }`, base64-encodes are performed in the browser before submission, then POSTs `{ txSig, walletSignature, leagues: [] }` to `${apiOrigin}/api/token/activate`. Store the returned token encrypted and set state `activated`. Never include the token in the response.

`status` returns only non-sensitive progress fields.

- [ ] **Step 6: Implement the resumable wizard**

Render four explicit states: guest credential, on-chain subscription, activation signature, ready. Disable network switching while a wallet prompt or transaction is active. On reload, fetch status and resume. Display transaction links using the selected network's explorer cluster.

- [ ] **Step 7: Verify setup code**

Run: `pnpm test -- src/lib/txline/activation.test.ts && pnpm typecheck && pnpm build`

Expected: activation test PASS; typecheck and build exit 0.

- [ ] **Step 8: Commit checkpoint if authorized**

```bash
git add src/lib/txline src/app/api/txline/setup src/components/txline-setup.tsx
git commit -m "feat: add TxLINE subscription and activation"
```

---

### Task 5: Fixtures, Snapshots, and Live SSE

**Files:**
- Create: `src/lib/txline/types.ts`
- Create: `src/lib/txline/client.ts`
- Create: `src/lib/txline/sse.test.ts`
- Create: `src/lib/txline/sse.ts`
- Create: `src/app/api/txline/fixtures/route.ts`
- Create: `src/app/api/txline/odds/[fixtureId]/route.ts`
- Create: `src/app/api/txline/scores/[fixtureId]/route.ts`
- Create: `src/app/api/txline/stream/[kind]/route.ts`
- Create: `src/components/fixture-browser.tsx`
- Create: `src/components/live-stream.tsx`

**Interfaces:**
- Produces: `txlineFetch(userId, network, path, init?): Promise<Response>`.
- Produces: `parseSseBlock(block: string): SseMessage | null`.
- Produces: normalized `{ source, fixtureId, seq?, timestamp, payload }`.

- [ ] **Step 1: Write SSE parser tests**

```typescript
import { expect, it } from "vitest";
import { parseSseBlock } from "./sse";

it("preserves event ID and score sequence", () => {
  const message = parseSseBlock(
    'id: score-9\nevent: score\ndata: {"fixtureId":42,"seq":880}\n',
  );
  expect(message?.id).toBe("score-9");
  expect(JSON.parse(message!.data).seq).toBe(880);
});

it("joins multiline data and ignores heartbeat comments", () => {
  expect(parseSseBlock(": heartbeat\n")).toBeNull();
  expect(parseSseBlock("data: one\ndata: two\n")?.data).toBe("one\ntwo");
});
```

- [ ] **Step 2: Run the parser tests and verify failure**

Run: `pnpm test -- src/lib/txline/sse.test.ts`

Expected: FAIL because `./sse` does not exist.

- [ ] **Step 3: Implement the SSE parser**

Implement the field parser from TxLINE's official streaming guide. Ignore comment lines, preserve `id`, `event`, and `retry`, join multiple data lines with newlines, and return null only when the block has no data/event/id.

- [ ] **Step 4: Implement authenticated TxLINE fetch**

Load credentials only through `getCredential(userId, network)`. Send both `Authorization: Bearer ${jwt}` and `X-Api-Token`. On `401`, call the matching `/auth/guest/start`, encrypt/store the replacement JWT, and retry exactly once. On `403`, return a typed network/subscription mismatch without retrying.

- [ ] **Step 5: Add snapshot and stream routes**

Validate fixture IDs as positive safe integers. Allow stream kind only `odds` or `scores`. The stream route forwards `Accept: text/event-stream`, `Cache-Control: no-cache`, and incoming `Last-Event-ID`; it returns the upstream body as a streaming `Response` with buffering disabled headers.

- [ ] **Step 6: Build fixture and live-stream UI**

Fetch fixture snapshot after activation, allow one selected fixture, and show odds/score snapshots. Each live panel holds at most 250 events, displays connecting/live/idle/reconnecting/failed, remembers the last SSE ID, and reconnects with jittered exponential delays of 1, 2, 4, 8, then 15 seconds maximum.

Do not infer a missing score sequence. Disable proof actions for records without a real `seq`/`Seq`.

- [ ] **Step 7: Verify data features**

Run: `pnpm test -- src/lib/txline/sse.test.ts && pnpm typecheck && pnpm build`

Expected: SSE tests PASS; build exits 0.

- [ ] **Step 8: Commit checkpoint if authorized**

```bash
git add src/lib/txline src/app/api/txline src/components/fixture-browser.tsx src/components/live-stream.tsx
git commit -m "feat: stream TxLINE fixtures odds and scores"
```

---

### Task 6: Historical Replay and Read-Only Proof Validation

**Files:**
- Create: `src/lib/replay/controller.ts`
- Create: `src/app/api/txline/history/[fixtureId]/route.ts`
- Create: `src/lib/txline/validation.ts`
- Create: `src/app/api/txline/validate/route.ts`
- Create: `src/components/replay-panel.tsx`
- Create: `src/components/validation-panel.tsx`

**Interfaces:**
- Produces: `ReplayController` with `play()`, `pause()`, `seek(index)`, `setSpeed(multiplier)`, and `dispose()`.
- Produces API: `GET /api/txline/history/:fixtureId?network=devnet`.
- Produces API: `POST /api/txline/validate`.

- [ ] **Step 1: Implement the replay scheduler**

Accept sorted normalized score records and an `onEvent` callback. Schedule delays from source timestamps divided by playback speed, capped at two seconds so large source gaps remain demo-friendly. Seeking emits no events until playback resumes. `dispose()` clears every timer.

The replay panel supports 0.5×, 1×, 2×, 5×, and 10×, plus play, pause, seek, current index, source timestamp, and game state.

- [ ] **Step 2: Implement historical proxying**

Require an activated session/network credential and call `/api/scores/historical/{fixtureId}`. Normalize casing while retaining the untouched payload. Reject records without a timestamp; retain records without `seq` but mark them non-verifiable.

- [ ] **Step 3: Implement proof formatting**

Use the official `subscription_scores_v2.ts` shape. Validate every proof hash has exactly 32 bytes. Derive:

```typescript
const epochDay = Math.floor(minTimestamp / 86_400_000);
const [dailyScoresPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)],
  program.programId,
);
```

Build `StatValidationInput` from `summary`, `subTreeProof`, `mainTreeProof`, `eventStatRoot`, `statsToProve`, and `statProofs`. For the starter's deterministic verification receipt, create one equality predicate per requested stat using the values returned by the proof response. This guarantees complete stat coverage and demonstrates proof validity without product-specific market logic.

- [ ] **Step 4: Implement the validation route**

Accept:

```typescript
const requestSchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
  fixtureId: z.number().int().positive(),
  seq: z.number().int().nonnegative(),
  statKeys: z.array(z.number().int().nonnegative()).min(1).max(8),
});
```

Request `/api/scores/stat-validation?fixtureId=...&seq=...&statKeys=...`, construct an Anchor provider with the configured RPC, invoke `.validateStatV2(payload, strategy).accounts({ dailyScoresMerkleRoots: dailyScoresPda }).view()`, and return a redacted receipt containing validity, fixture ID, seq, stat keys/values, timestamp, epoch day, root PDA, and proof-node counts.

- [ ] **Step 5: Build replay and validation panels**

Both live and replay score records expose the same “Verify” action when a real sequence exists. The validation panel allows supported stat-key selection, shows pending/pass/fail, and distinguishes malformed proof, root mismatch, and incomplete stat coverage.

- [ ] **Step 6: Verify replay and validation**

Run: `pnpm typecheck && pnpm build && pnpm test`

Expected: all focused tests PASS and production build exits 0.

- [ ] **Step 7: Commit checkpoint if authorized**

```bash
git add src/lib/replay src/lib/txline/validation.ts src/app/api/txline/history src/app/api/txline/validate src/components/replay-panel.tsx src/components/validation-panel.tsx
git commit -m "feat: replay and verify TxLINE score proofs"
```

---

### Task 7: Smoke Test, Deployment, and Manual Devnet Runbook

**Files:**
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `e2e/happy-path.spec.ts`
- Create: `vercel.json`
- Create: `README.md`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes all preceding browser and API interfaces.
- Produces a deployable, documented starter and one mocked happy-path smoke test.

- [ ] **Step 1: Configure focused tests**

Vitest includes `src/**/*.test.ts` and excludes `e2e/`. Playwright starts `pnpm dev` on port 3000 and runs Chromium only. Do not add coverage thresholds.

- [ ] **Step 2: Write one mocked browser smoke test**

Intercept auth and TxLINE setup/data routes. Provide a browser test wallet shim with deterministic public key, message signature, and transaction signature. Assert this single path:

```typescript
await page.getByRole("button", { name: "Connect wallet" }).click();
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("button", { name: "Set up TxLINE" }).click();
await expect(page.getByText("TxLINE ready")).toBeVisible();
await expect(page.getByText("Argentina vs Spain")).toBeVisible();
await expect(page.getByText("Live scores")).toBeVisible();
```

Mocks must also assert activation receives `${txSig}::${jwt}` and API responses never expose `apiToken`.

- [ ] **Step 3: Run the smoke test**

Run: `pnpm exec playwright install chromium && pnpm test:e2e`

Expected: one Chromium test PASS.

- [ ] **Step 4: Add Vercel configuration**

Set Node.js runtime for TxLINE routes and a supported maximum duration for `/api/txline/stream/[kind]`. Do not claim permanent SSE connections; README must explain browser reconnection and Vercel duration limits.

- [ ] **Step 5: Write the README and manual runbook**

Document:

- prerequisites: Node 20+, pnpm, Neon database, compatible Solana wallet
- environment variables and generation of a 32-byte base64 encryption key
- `pnpm install`, migration, dev, test, and build commands
- devnet/mainnet program IDs and API hosts
- service level 1 vs 12 behavior
- exact guest → subscribe → sign `${txSig}::${jwt}` → activate flow
- fixture, odds, scores, historical, and stat-validation endpoints used
- manual devnet checklist
- common `401`, `403`, insufficient SOL, unsupported `signMessage`, quiet stream, and proof errors
- explicit note that the project is infrastructure, not a wagering product
- API feedback section ready for hackathon submission notes

- [ ] **Step 6: Run final local verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Expected: lint/typecheck/build exit 0; focused unit/integration tests and one browser smoke test PASS.

- [ ] **Step 7: Run the live devnet checklist**

With a funded devnet wallet:

1. Sign in.
2. Select devnet.
3. Create guest credentials.
4. Submit service-level-1 four-week subscription.
5. Sign the activation preimage.
6. Confirm setup shows ready after reload.
7. Fetch fixtures and snapshots.
8. Open odds and score streams; verify quiet streams show idle rather than failed.
9. Replay an eligible historical fixture.
10. Select a record with a real sequence and validate at least one stat on-chain.
11. Confirm application logs contain no JWT, API token, authorization header, or signatures.

Expected: all eleven checks complete, or any external TxLINE availability issue is recorded precisely in README/API feedback without masking it with fake data.

- [ ] **Step 8: Deploy to Vercel**

Create a Vercel project, attach `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEY_BASE64`, `SESSION_COOKIE_NAME`, `NEXT_PUBLIC_APP_URL`, and RPC URLs, apply migrations to the production Neon branch, deploy, and repeat the wallet setup plus fixture fetch on the deployed URL.

- [ ] **Step 9: Commit checkpoint if authorized**

```bash
git add vitest.config.ts playwright.config.ts e2e vercel.json README.md src/app/globals.css
git commit -m "docs: prepare TxLINE starter for deployment"
```
