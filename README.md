# QuotaDEX

QuotaDEX is an Agent-to-Agent (A2A) secondary market for AI compute. The MVP uses a Gateway + Supabase + Redis + Escrow design so AI agents can buy and sell idle model quota through HTTP 402 interception and Web3 micro-payments on Kite AI.

PieBazaar is the planned parent Agent Marketplace for the broader vision. Its positioning is an Agent Marketplace that showcases the Accountable Agent Commerce Layer. QuotaDEX is the first vertical service planned inside that future PieBazaar marketplace.

当前仓库已经完成 `Phase 7`：Gateway 骨架、Supabase schema、Seller 生命周期、`quote`、`verify(Mock)`、Seller worker、Buyer demo、Escrow 合约骨架、真实 `deposit`、receipt 校验、`release`、`refund` 都已落地，下一步进入 SDK 提炼。

## Read First

Before writing code, read these documents in order:

1. [docs/project/QuotaDEX 技术规格说明书 v3.0 (Final).md](docs/project/QuotaDEX%20%E6%8A%80%E6%9C%AF%E8%A7%84%E6%A0%BC%E8%AF%B4%E6%98%8E%E4%B9%A6%20v3.0%20%28Final%29.md)
2. [docs/mvp-rules(swen).md](docs/mvp-rules(swen).md)
3. [docs/development-order(swen).md](docs/development-order(swen).md)
4. [docs/phase-tracker(swen).md](docs/phase-tracker(swen).md)

## Current Phase

Current delivery summary:

- Current phase: `Phase 8 - SDK`
- Current step: `Step 1/2` extract `buyer-sdk`
- Next milestone: package the buyer happy path into a reusable SDK entry
- Latest checkpoint: `Mock E2E passed`
  - `quote -> verify(mock) -> seller done -> buyer final result`

## Finished Phases

- `Phase 0 - project skeleton`
  - `Next.js`, `app/api`, `lib`, `env`
- `Phase 1 - data layer`
  - `Supabase`, `sellers`, `jobs`, `events`, `migration`
- `Phase 2 - seller lifecycle`
  - `register`, `heartbeat`, `offline`
- `Phase 3 - quote`
  - request validation, seller reservation, `fingerprint`, Redis quote context, `402`
- `Phase 4 - verify (Mock)`
  - recompute `fingerprint`, load quote context, mock `tx_hash`, create `paid` job, move seller to `busy`
- `Phase 5 - seller worker`
  - self-check, register, heartbeat, Realtime subscribe, `start`, `complete`, `fail`
- `Phase 6 - buyer demo`
  - `quote`, mock pay, `verify`, Realtime wait, polling fallback
- `Phase 7 - real chain + Escrow`
  - Escrow contract, real `deposit`, receipt validation, `release`, `refund`
- `Mock E2E checkpoint`
  - local Gateway + Supabase + Redis + seller worker + buyer demo passed end to end

## Full Tracker

For the full phase path, step progress, and unfinished tasks:

- [docs/phase-tracker(swen).md](docs/phase-tracker(swen).md)

## Project Structure

The repo now contains the current gateway project structure:

```text
app/
  api/v1/
    sellers/
      register/
      heartbeat/
      offline/
    jobs/
      quote/
      verify/
      [id]/
        start/
        complete/
        fail/
lib/
  env.ts
  errors.ts
  fingerprint.ts
  jobs.ts
  chain/
  redis.ts
  sellers.ts
  supabase.ts
supabase/
  migrations/
docs/
scripts/
contracts/
```

### Directory Responsibilities

- `app/api/v1/*`
  Gateway HTTP entrypoints for seller registration, buyer quote/verify, and seller job status callbacks.
- `lib/*`
  Shared server helpers for env loading, error responses, fingerprint generation, Redis, and Supabase.
- `lib/chain/*`
  Shared chain helpers for Escrow ABI, payment ID normalization, and on-chain amount conversion.
- `supabase/migrations/*`
  Database schema for `sellers`, `jobs`, and `events`.
- `docs/*`
  Product spec, MVP rules, and development sequence.
- `scripts/*`
  Local demo helpers such as the seller worker and later buyer happy-path scripts.
- `contracts/*`
  Solidity escrow contracts for on-chain payment funding, release, and refund.

## Current Implementation

- A minimal `Next.js App Router` gateway application is in place.
- Seller lifecycle routes are implemented:
  - `POST /api/v1/sellers/register`
  - `POST /api/v1/sellers/heartbeat`
  - `POST /api/v1/sellers/offline`
- The `POST /api/v1/jobs/quote` route is implemented:
  - validates `buyer_id / capability / prompt`
  - reserves a seller with a conditional database update
  - builds `fingerprint` and reuses it as `payment_id`
  - stores `quote:{payment_id}` in Redis
  - returns `402 Payment Required`
- The `POST /api/v1/jobs/verify` route is implemented:
  - recomputes `fingerprint` from the payload
  - loads `quote:{payment_id}` from Redis
  - verifies real Escrow deposit receipts for full transaction hashes
  - keeps mock `tx_hash` validation as a local fallback
  - creates a formal `paid` job
  - moves the seller from `reserved` to `busy`
- The seller execution callbacks are implemented:
  - `POST /api/v1/jobs/:id/start`
  - `POST /api/v1/jobs/:id/complete`
  - `POST /api/v1/jobs/:id/fail`
  - `complete` now triggers Gateway-side `Escrow.release(payment_id)`
  - `fail` now triggers Gateway-side `Escrow.refund(payment_id)`
- A minimal seller worker script exists:
  - `scripts/seller-worker.mjs`
  - local self-check before startup
  - seller register and heartbeat
  - Supabase Realtime subscription for seller-assigned jobs
  - Gateway callbacks for `start / complete / fail`
- The polling fallback endpoint is implemented:
  - `GET /api/v1/jobs/:id`
- A minimal buyer demo script exists:
  - `scripts/buyer-demo.mjs`
  - `quote -> mock pay or real approve+deposit -> verify -> wait result`
  - Supabase Realtime result subscription
  - polling fallback through `GET /api/v1/jobs/:id`
- A minimal escrow contract skeleton exists:
  - `contracts/QuotaDEXEscrow.sol`
  - `deposit(paymentId, seller, amount)`
  - `release(paymentId)`
  - `refund(paymentId)`
- The Escrow ABI and chain helpers already exist:
  - `contracts/QuotaDEXEscrow.abi.json`
  - `lib/chain/escrow.ts`
- Shared helpers already exist for:
  - env loading
  - error responses
  - fingerprint generation
  - quote and verify parsing
  - quote context storage and loading
  - seller reservation and busy/idle transitions
  - seller execution status transitions
  - Redis access
  - Supabase access
  - seller request parsing
- The initial Supabase migration is in place, including `payment_id`.
- A minimal landing page exists so the app can build and run locally.
- A basic contract note exists in `contracts/README.md`.

## Environment Variables

Copy `.env.example` and fill the required values.

These variables come from four places:

- `Supabase`
  This is the hosted online database and Realtime service used by the project.
  Get these values from your Supabase project dashboard.
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

- `Upstash Redis`
  This is the hosted online cache used for short-lived quote context.
  Get these values from your Upstash Redis database dashboard.
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

- `Gateway server config`
  `GATEWAY_SALT` is a random secret string generated by your team.
  It is used when building the request fingerprint and should stay server-side only.

- `Blockchain config`
  These values are used later for real payment verification and Escrow contract operations.
  - `KITE_RPC_URL`: the RPC endpoint for the Kite network
  - `PYUSD_CONTRACT_ADDRESS`: the PYUSD token contract address
  - `PYUSD_DECIMALS`: token decimals, default `6` for PYUSD in the demo flow
  - `ESCROW_CONTRACT_ADDRESS`: your deployed Escrow contract address
  - `GATEWAY_PRIVATE_KEY`: the private key of the Gateway wallet
  - `BUYER_PRIVATE_KEY`: optional buyer wallet private key for real `approve + deposit`

Important:

- `GATEWAY_PRIVATE_KEY` is the private key of a normal wallet controlled by the Gateway.
- It is not the "private key" of `ESCROW_CONTRACT_ADDRESS`.
- Contracts do not have private keys.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
GATEWAY_SALT=
KITE_RPC_URL=
PYUSD_CONTRACT_ADDRESS=
PYUSD_DECIMALS=6
ESCROW_CONTRACT_ADDRESS=
GATEWAY_PRIVATE_KEY=
BUYER_PRIVATE_KEY=
```

## Local Development

Install dependencies and start the gateway:

```bash
npm install
npm run dev
```

Type-check once dependencies are installed:

```bash
npm run typecheck
```

## Implementation Notes

- `payment_id` and `job_id` are intentionally separate.
- `fingerprint` is reused as `payment_id` in the MVP.
- `Supabase` is the single source of truth for formal state.
- `Redis` only stores short-lived quote context and optional short-term dedupe state.
- Seller state changes should flow through Gateway APIs rather than direct client-side writes.
