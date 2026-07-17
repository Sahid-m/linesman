# TxLINE Solana Starter Design

## Goal

Build a neutral, reusable Next.js foundation for any TxODDS × Solana World Cup hackathon entry. It must complete the full TxLINE integration path before product-specific work begins: wallet authentication, on-chain subscription, API activation, live data, historical replay, and read-only proof validation.

The starter will deploy to Vercel, use Neon Postgres, support devnet and mainnet from the UI, and avoid committing to a prediction market, trading agent, or fan-experience concept.

## Scope

### Included

- Solana wallet connection, transaction signing, and message signing
- Sign-in with Solana using a single-use server nonce
- Visible devnet/mainnet switch
- Wallet SOL balance and active-network status
- TxLINE guest JWT creation
- Four-week free-tier on-chain subscription
- Activation-message signing and API-token activation
- Encrypted, database-backed credentials per wallet and network
- Fixture snapshots and fixture details
- Odds and scores SSE streams
- Historical score replay with speed controls
- Merkle proof retrieval for observed score events
- Read-only on-chain `validateStatV2` verification
- Raw event and proof inspectors for debugging and demos
- Focused automated tests and manual devnet verification

### Excluded

- A custom Anchor program or CPI settlement
- Markets, escrow, wagering, trading strategies, or product-specific logic
- TxL purchasing and paid league bundles
- Permanent background stream workers
- Broad test coverage or a large design system

## Architecture

The application uses the Next.js App Router and TypeScript. Interactive wallet operations run in the browser. Next.js route handlers own wallet sessions, TxLINE credential storage, authenticated API proxying, and SSE proxying. Neon Postgres stores users, sessions, nonce challenges, and encrypted TxLINE credentials. Drizzle ORM manages the schema and migrations.

Solana Wallet Standard-compatible adapters provide wallet discovery and connection. The client creates and signs the TxLINE subscription transaction because private keys never reach the server. Server routes create guest credentials, prepare activation data, activate the signed subscription, and persist the resulting credentials.

TxLINE requests pass through authenticated server routes. The guest JWT must appear in the activation message signed by the wallet, so it is returned to the browser only during that setup step. The API token is never returned to browser JavaScript, and neither credential is returned after activation. SSE routes proxy upstream odds and score streams. Because Vercel functions are not permanent workers, the browser reconnects when a proxy connection closes.

No custom Anchor program is included. The starter uses TxLINE's program directly for subscription and read-only `validateStatV2` calls.

## Network Configuration

Network configuration is centralized in one typed module. Each entry contains:

- Solana RPC URL
- TxLINE API origin
- TxLINE program ID
- TxL mint
- supported free service levels
- matching IDL

Devnet supports service level 1. Mainnet setup allows service level 1 for the 60-second feed or level 12 for real-time data. The selected network controls every related value as one unit; callers cannot independently mix an RPC, host, program ID, IDL, or stored credential from another network.

Changing networks updates the wallet connection context, data routes, and setup status. Credentials and subscription records are keyed by both wallet and network.

## User Flow

### Wallet sign-in

1. The user connects a wallet.
2. The client requests a short-lived nonce.
3. The wallet signs a human-readable login message containing the nonce, domain, issued time, and expiry.
4. The server verifies the signature and nonce, creates a session, and sets a secure HTTP-only cookie.

### TxLINE setup

1. The user chooses devnet or mainnet and an available free service level.
2. The server creates a guest JWT on the matching TxLINE host and stores it temporarily.
3. The browser constructs and submits `subscribe(serviceLevelId, 4)` to the matching TxLINE program.
4. After confirmation, the server returns the exact activation preimage `${txSig}::${jwt}`.
5. The same wallet signs that message.
6. The server verifies request ownership and calls `/api/token/activate`.
7. The server encrypts and stores the JWT, API token, transaction signature, service level, decoded JWT expiry, and calculated subscription expiry.

The setup wizard records progress and resumes at the first incomplete step after a reload or recoverable failure.

### Data dashboard

The dashboard lists fixtures and displays details for a selected fixture. Separate panels show live StablePrice odds and score updates. Stream state is visible as connecting, live, idle/heartbeat, reconnecting, or failed. A bounded in-memory list powers the raw-event inspector; stream events are not persisted to Neon.

Score sequence values are preserved exactly as received. The application never substitutes `0` or synthesizes a sequence number.

### Historical replay

For eligible completed fixtures, the server retrieves `/api/scores/historical/{fixtureId}`. The browser replay controller provides play, pause, seek, and playback-speed controls. Historical records pass through the same normalized event interface used by live score events, allowing future product logic to work unchanged with live or replayed input.

### Verification

The user selects an observed score record and supported stat keys. The server requests the corresponding stat-validation proof using the record's real fixture ID and sequence. The server formats proof nodes as exact 32-byte values, derives the daily root PDA from the proof timestamp, and performs a read-only `validateStatV2` call through the configured RPC. The UI receives the proof receipt and shows requested stats, predicates, proof metadata, root account, and a clear pass/fail result.

## Components and Boundaries

- `network-config`: returns an indivisible, validated configuration for one network.
- `wallet-auth`: creates nonces, verifies wallet signatures, and manages sessions.
- `txline-setup`: coordinates guest auth, subscription state, activation messages, and credential persistence.
- `credential-store`: encrypts, decrypts, and scopes credentials by user and network.
- `txline-client`: typed server-side snapshots, history, proof, and stream requests.
- `sse`: parses upstream SSE safely and proxies events without changing payload values.
- `replay-controller`: schedules normalized historical records independently of UI rendering.
- `validation`: formats proofs, derives root PDAs, builds predicates, and invokes read-only validation.
- `dashboard UI`: renders setup, fixtures, streams, replay, validation, and diagnostics without owning integration logic.

## Data Model

### `users`

- `id`
- `wallet_public_key` (unique)
- `created_at`
- `updated_at`

### `wallet_nonces`

- `id`
- `wallet_public_key`
- `nonce_hash`
- `expires_at`
- `consumed_at`
- `created_at`

Nonces are short-lived and single-use.

### `sessions`

- `id`
- `user_id`
- `token_hash`
- `expires_at`
- `revoked_at`
- `created_at`
- `last_seen_at`

Only a random session token is placed in the secure HTTP-only cookie; the database stores its hash.

### `txline_credentials`

- `id`
- `user_id`
- `network`
- `encrypted_jwt`
- `encrypted_api_token`
- `subscription_tx_signature`
- `service_level_id`
- `duration_weeks`
- `setup_state`
- `subscription_created_at`
- `guest_jwt_expires_at`
- `subscription_expires_at`
- `created_at`
- `updated_at`

There is one current credential record per user and network. `setup_state` is `guest_created`, `subscribed`, or `activated`; the API-token fields remain null until activation succeeds. Sensitive values use authenticated encryption with a server-only application key.

## Security

- Private wallet keys never leave the wallet.
- Login nonces expire, are single-use, and are verified against the requesting wallet.
- Session cookies are HTTP-only, secure in production, and SameSite=Lax.
- TxLINE JWTs and API tokens are encrypted at rest. The guest JWT is exposed once as part of the wallet activation preimage; the API token is never exposed to browser JavaScript.
- Every credential query is scoped to the authenticated user and selected network.
- Activation checks that the authenticated wallet matches the wallet that submitted the subscription.
- Request bodies and route parameters are schema-validated.
- Credentials, authorization headers, login signatures, and activation signatures are redacted from logs.
- State-changing routes use same-origin checks and basic per-wallet throttling.
- Devnet and mainnet records cannot be used interchangeably.

## Error Handling

- Unsupported `signMessage`: explain that activation requires a compatible wallet.
- Insufficient SOL: show the active network and provide devnet funding guidance where applicable.
- Rejected signatures or transactions: preserve wizard state and allow retry.
- Failed confirmation: retain the signature and provide an explicit recheck action.
- TxLINE `401`: renew the guest JWT on the same host, update encrypted storage, and retry once.
- TxLINE `403`: stop retrying and report a likely wallet, subscription, or network mismatch.
- SSE interruption: reconnect with exponential backoff and jitter; reset backoff after a healthy connection.
- Quiet stream: show idle/heartbeat state rather than treating a lack of match events as failure.
- Invalid proof nodes: report incorrect byte length before invoking validation.
- Invalid root or predicates: distinguish epoch-day/root mismatch from incomplete stat coverage.

## Testing and Verification

Automated testing is intentionally small:

- unit tests for activation-message formatting
- unit tests for indivisible network configuration
- unit tests for SSE block parsing and sequence preservation
- unit tests for credential encryption round trips and authentication failure
- one integration test for wallet session and credential access control
- one mocked browser happy-path smoke test covering wallet login, TxLINE setup, and dashboard loading

Manual verification will run the complete flow on devnet: connect a wallet, subscribe, activate, fetch fixtures, open both streams, replay historical scores, retrieve a proof, and execute read-only validation.

## Success Criteria

The starter is complete when:

1. It deploys to Vercel with Neon Postgres.
2. A user can authenticate with a compatible Solana wallet.
3. Devnet and mainnet can be selected without mixing configuration or credentials.
4. A wallet can complete TxLINE free-tier subscription and activation from the UI.
5. Fixtures, odds streams, and score streams work through authenticated server routes.
6. A completed fixture can be replayed through the same event interface used by live data.
7. An observed score event can produce a proof and a visible read-only on-chain validation result.
8. Sensitive credentials remain encrypted server-side.
9. The focused automated checks pass and the manual devnet flow is documented.
