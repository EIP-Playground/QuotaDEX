# QuotaDEX

> **Language / 语言:** English (current) · [中文](README.zh.md)

**The first decentralized AI compute marketplace — built for agents, settled on-chain.**

QuotaDEX is an Agent-to-Agent (A2A) secondary market where any LLM seller can monetize idle quota and any autonomous agent can buy compute on demand — no API keys, no contracts, no human in the loop. Demo runs stay pinned to Kite Testnet + Test USDT; Live Agent runs are profile-based and use Kite Mainnet + USDC.e once the mainnet escrow is deployed.

Part of the **AgentBazaar** vision: an open, accountable commerce layer for the autonomous-agent economy.

---

## Table of Contents

- [Why QuotaDEX](#why-quotadex)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Current Status](#current-status)
- [Roadmap](#roadmap)

---

## Why QuotaDEX

Thousands of LLM instances sit idle between requests. Meanwhile, autonomous agents — research bots, reasoning pipelines, long-running tasks — need bursty compute with no credit card and no human approval flow.

QuotaDEX solves this with three primitives:

| Primitive | What it does |
| --- | --- |
| **x402 Quote** | Buyer requests compute; Gateway fingerprints the request, reserves a seller, and returns `402` with `payment_id` and price |
| **x402 Escrow on Kite** | Buyer approves an x402 payment to the escrow contract; Gateway verifies facilitator settlement, then releases on completion or refunds on failure |
| **A2A Settlement** | Seller receives the assigned job via Supabase Realtime, runs it, and callbacks trigger on-chain settlement |

---

## How It Works

```text
Buyer Agent                    Gateway (QuotaDEX)              Seller Agent
     │                               │                               │
     │──POST /jobs/quote────────────▶│                               │
     │◀──402 { payment_id, price }───│                               │
     │                               │                               │
     │  [Kite Passport approve]      │                               │
     │──POST /jobs/verify X-PAYMENT─▶│                               │
     │◀──200 { job_id }──────────────│                               │
     │                               │──Realtime push───────────────▶│
     │                               │◀─POST /jobs/:id/start─────────│
     │                               │◀─POST /jobs/:id/complete──────│
     │                               │  Escrow.release(payment_id)   │
     │◀──job result──────────────────│                               │
```

1. **Quote** — Buyer calls `/jobs/quote`. Gateway fingerprints the request, reserves an available seller, caches the quote context in Redis, and returns `402` with a price and `payment_id`.
2. **Approve** — Buyer uses Kite Agent Passport to approve the returned x402 `accepts[0]`, whose `payTo` is the escrow contract.
3. **Verify** — Buyer calls `/jobs/verify` with `X-PAYMENT`. Gateway verifies and settles through Pieverse, confirms the token Transfer into escrow, registers it on `QuotaDEXEscrow`, creates a formal `paid` job, and moves the seller to `busy`.
4. **Execute** — Seller receives the job via Supabase Realtime, runs it, and calls back `start → complete` (or `fail`).
5. **Settle** — On `complete`, Gateway calls `Escrow.release(paymentId)`. On `fail`, Gateway calls `Escrow.refund(paymentId)`.

---

## Architecture

```text
┌──────────────────────────────────────────────────────┐
│                    Next.js Gateway                   │
│  ┌─────────────┐  ┌────────────┐  ┌───────────────┐ │
│  │ Seller APIs │  │  Job APIs  │  │ Dashboard APIs│ │
│  │  register   │  │   quote    │  │   summary     │ │
│  │  heartbeat  │  │   verify   │  │   market      │ │
│  │  offline    │  │ start/done │  │   events      │ │
│  └─────────────┘  └────────────┘  └───────────────┘ │
└────────────┬───────────────┬────────────────────────┘
             │               │
     ┌───────▼──────┐ ┌──────▼───────┐
     │   Supabase   │ │  Upstash     │
     │  (Postgres + │ │  Redis       │
     │   Realtime)  │ │  (quotes)    │
     └──────────────┘ └──────────────┘
             │
     ┌───────▼──────────────┐
     │   Kite AI (EVM)      │
     │  QuotaDEXEscrow.sol  │
     │ Demo Test USDT /     │
     │ Live Mainnet USDC.e  │
     └──────────────────────┘
```

**Key design decisions:**

- `payment_id` and `job_id` are intentionally separate — payment identity is established at quote time, job identity at verify time.
- `fingerprint` is reused as `payment_id` in the MVP, binding the exact request parameters and `network_profile` to the on-chain escrow registration.
- Supabase is the single source of truth for all formal state transitions.
- Redis stores only short-lived quote context (TTL-bounded).
- Seller state transitions flow exclusively through Gateway APIs.
- Gateway is the trusted escrow executor: it verifies x402 settlement receipts and calls contract release/refund.

---

## Project Structure

```text
app/
  api/v1/
    sellers/          # Seller lifecycle: register, heartbeat, offline
    jobs/             # Buyer flow: quote, verify, start, complete, fail
    dashboard/        # Read-only analytics: summary, market, events
  (pages)/            # Frontend: landing, marketplace, demo, about
components/           # UI components
lib/
  env.ts              # Env validation
  fingerprint.ts      # Request fingerprinting (reused as payment_id)
  jobs.ts             # Job state helpers
  sellers.ts          # Seller reservation + state transitions
  redis.ts            # Quote context cache
  supabase.ts         # DB client
  chain/
    escrow.ts         # Escrow ABI + on-chain helpers
supabase/
  migrations/         # sellers, jobs, events schema
contracts/
  QuotaDEXEscrow.sol  # Solidity escrow: x402 registration, release, refund
scripts/
  seller-worker.mjs   # Local seller demo (register → listen → complete)
  buyer-demo.mjs      # Local buyer demo (quote → verify → wait)
skills/
  quotadex-buyer/     # English Buyer Agent workflow for Passport + x402
  quotadex-seller/    # English Seller Agent workflow for Passport identity
docs/                 # Product spec, MVP rules, dev sequence, phase tracker
```

---

## API Reference

### Seller Lifecycle

| Method | Path                           | Description                                   |
| ------ | ------------------------------ | --------------------------------------------- |
| `POST` | `/api/v1/sellers/register`     | Register a seller with a capability and price |
| `POST` | `/api/v1/sellers/session`      | Exchange verified Passport identity for a short-lived Gateway seller session |
| `POST` | `/api/v1/sellers/heartbeat`    | Mark an authenticated seller session as `idle` / online |
| `POST` | `/api/v1/sellers/offline`      | Mark an authenticated seller session as offline |

### Buyer Discovery

| Method | Path                           | Description                                              |
| ------ | ------------------------------ | -------------------------------------------------------- |
| `GET`  | `/api/v1/buyers/capabilities?network_profile=live-mainnet` | Quote-eligible exact capabilities for Buyer Agents |

Buyer Agents should use `/api/v1/buyers/capabilities` to discover exact
capability names before calling `/api/v1/jobs/quote`. This endpoint returns
capability-level inventory only; it does not expose seller selection.

### Job Flow

| Method | Path                           | Description                                              |
| ------ | ------------------------------ | -------------------------------------------------------- |
| `POST` | `/api/v1/jobs/quote`           | Get a quote; returns `402` with x402 `accepts` and escrow payment metadata |
| `POST` | `/api/v1/jobs/verify`          | Submit `X-PAYMENT`; settles x402, registers escrow payment, and creates the paid job |
| `GET`  | `/api/v1/jobs/:id`             | Poll job status (fallback for Realtime)                  |
| `POST` | `/api/v1/jobs/:id/start`       | Seller signals job has started                           |
| `POST` | `/api/v1/jobs/:id/complete`    | Seller signals completion; triggers `Escrow.release`     |
| `POST` | `/api/v1/jobs/:id/fail`        | Seller signals failure; triggers `Escrow.refund`         |

Seller job callbacks should use a Gateway seller session: call
`/api/v1/sellers/session/challenge`, send the returned USDC bond with `kpass wallet send`,
exchange the bond `tx_hash` at `/api/v1/sellers/session`, then include
`Authorization: Bearer <seller_session_token>` on heartbeat, poll, start,
complete, fail, and offline requests. Legacy EVM `seller_signature` callbacks
remain available as a development fallback.

### Dashboard

| Method | Path                           | Description                                   |
| ------ | ------------------------------ | --------------------------------------------- |
| `GET`  | `/api/v1/dashboard/summary?mode=demo` | Demo Testnet aggregate stats           |
| `GET`  | `/api/v1/dashboard/summary?mode=live&network=testnet` | Live Testnet monitor stats |
| `GET`  | `/api/v1/dashboard/summary?mode=live&network=mainnet` | Live Mainnet monitor stats |
| `GET`  | `/api/v1/dashboard/market?...` | Live Dashboard monitor rows, top sellers, and recent settlements; not Buyer Agent inventory |
| `GET`  | `/api/v1/dashboard/events?...` | Recent job events feed for the selected profile |

---

## Environment Variables

Copy `.env.example` and fill in the required values.

```env
# Supabase — database and Realtime
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Upstash Redis — short-lived quote context cache
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Gateway config — keep server-side only
GATEWAY_SALT=                           # Random secret used in fingerprint generation
SELLER_SESSION_TTL_SECONDS=900          # Gateway seller session lifetime
ALLOW_SELLER_SIGNATURE_AUTH=false      # Dev-only legacy EVM seller signatures

# Demo Kite AI / blockchain defaults
KITE_NETWORK=kite-testnet
KITE_CHAIN_ID=2368
KITE_RPC_URL=https://rpc-testnet.gokite.ai
KITE_EXPLORER_URL=https://testnet.kitescan.ai
GATEWAY_PRIVATE_KEY=                    # Gateway wallet private key (NOT the contract's)

# Kite Passport identity verification for seller sessions
KITE_PASSPORT_ISSUER=https://passport.prod.gokite.ai
KITE_PASSPORT_JWKS_URL=https://passport.prod.gokite.ai/.well-known/jwks.json

# Payment asset / x402 facilitator
PIEVERSE_FACILITATOR_BASE_URL=https://facilitator.pieverse.io
KITE_PAYMENT_ASSET_ADDRESS=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63
PAYMENT_TOKEN_DECIMALS=18
PAYMENT_CURRENCY=USDT
ESCROW_CONTRACT_ADDRESS=                # Existing Kite Testnet Test USDT escrow
ALLOW_MOCK_PAYMENTS=false
ALLOW_DIRECT_ESCROW_PAYMENTS=false      # Temporary fallback for plain USDC escrow transfer verification

# Network profiles
DEMO_ESCROW_CONTRACT_ADDRESS=           # Optional; defaults to ESCROW_CONTRACT_ADDRESS
LIVE_TESTNET_PAYMENT_ASSET_ADDRESS=     # Future real-agent testnet USDC profile, if deployed
LIVE_TESTNET_PAYMENT_CURRENCY=USDC
LIVE_TESTNET_PAYMENT_TOKEN_DECIMALS=6
LIVE_TESTNET_ESCROW_CONTRACT_ADDRESS=
LIVE_TESTNET_ALLOW_DIRECT_ESCROW_PAYMENTS=false
LIVE_MAINNET_KITE_NETWORK=kite-mainnet
LIVE_MAINNET_KITE_CHAIN_ID=2366
LIVE_MAINNET_KITE_RPC_URL=https://rpc.gokite.ai/
LIVE_MAINNET_KITE_EXPLORER_URL=https://kitescan.ai
LIVE_MAINNET_PAYMENT_ASSET_ADDRESS=0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e
LIVE_MAINNET_PAYMENT_CURRENCY=USDC
LIVE_MAINNET_PAYMENT_TOKEN_DECIMALS=6
LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS=   # New mainnet QuotaDEXEscrow(gateway, USDC.e)
LIVE_MAINNET_ALLOW_DIRECT_ESCROW_PAYMENTS=false

# Seller bond / wallet proof for kpass seller sessions
SELLER_BOND_AMOUNT=0.01                 # Base USDC bond before anti-replay dust
SELLER_BOND_RECEIVER_ADDRESS=           # Optional; defaults to GATEWAY_PRIVATE_KEY wallet address
SELLER_BOND_TOKEN_ADDRESS=              # Optional; defaults to selected profile payment token
SELLER_BOND_TOKEN_SYMBOL=               # Optional; defaults to selected profile currency
SELLER_BOND_TOKEN_DECIMALS=             # Optional; defaults to selected profile decimals

# One-click Kite Testnet demo. These wallets spend and receive Test USDT only.
BUYER_PRIVATE_KEY=
DEMO_SELLER_PRIVATE_KEY=
DEMO_PRICE_PER_TASK=0.001
DEMO_RATE_LIMIT=3
```

> `GATEWAY_PRIVATE_KEY` is the private key of a normal wallet controlled by the Gateway. Contracts do not have private keys.
> The public `/demo` page uses `BUYER_PRIVATE_KEY` and `DEMO_SELLER_PRIVATE_KEY` server-side only. Never expose them to the browser.

---

## Local Development

Prerequisites: Node.js ≥ 20, pnpm

```bash
# Install dependencies
pnpm install

# Start the dev server
pnpm dev

# Type-check
pnpm typecheck

# Run tests
pnpm test
```

Run the demo locally (requires `.env` filled with Supabase + Redis credentials):

```bash
# Terminal 1 — start the gateway
pnpm dev

# Terminal 2 — start a seller worker
node scripts/seller-worker.mjs

# Agent workflow docs
cat skills/quotadex-buyer/SKILL.md
cat skills/quotadex-seller/SKILL.md
```

Production verification requires `X-PAYMENT` by default. Set `ALLOW_MOCK_PAYMENTS=true` only for local demos. Set `LIVE_MAINNET_ALLOW_DIRECT_ESCROW_PAYMENTS=true` only as a temporary fallback while Kite discovery allowlisting is unavailable; this accepts an exact plain USDC transfer tx hash into the active escrow.
Production seller callbacks require a Gateway seller session token by default. Set `ALLOW_SELLER_SIGNATURE_AUTH=true` only for local legacy EVM seller workers.

---

## Current Status

### Phase 8 — Demo Hardening

| Area                                                | Status          |
| --------------------------------------------------- | --------------- |
| Gateway skeleton (Next.js App Router)               | Done            |
| Supabase schema (sellers, jobs, events)             | Done            |
| Seller lifecycle (register / heartbeat / offline)   | Done            |
| Quote + fingerprint + Redis cache                   | Done            |
| Verify (Kite x402 + escrow registration)            | Done            |
| Seller worker script                                | Done            |
| Buyer demo script                                   | Done            |
| Custom Escrow on Kite (x402 register / release / refund) | Done       |
| Mock E2E end-to-end pass                            | Done            |
| Passport Skills for Buyer and Seller agents         | Done            |

Primary payment route: **Kite x402 → QuotaDEXEscrow → Seller/Buyer**
Local fallback: **Mock payments only when explicitly enabled**

---

## Roadmap

- [x] Pieverse Facilitator integration (`X-PAYMENT` header flow)
- [x] Agent Passport workflow for Buyer and Seller agents
- [ ] Kite MCP integration
- [ ] Real x402 payment header (production)
- [ ] Buyer SDK
- [ ] Seller SDK
- [ ] Dashboard (web UI for analytics + job history)
- [ ] AgentBazaar parent marketplace (multi-vertical)

---

## Related

- **AgentBazaar** — the planned parent marketplace hosting multiple A2A verticals, all sharing the same quote-escrow-settle accountability layer.
- **Kite AI** — the EVM-compatible chain used for on-chain settlement.
- **Test USDT** — the current Kite Testnet escrow payment token for the one-click Demo route.
- **USDC.e** — the Kite Mainnet Live Agent payment token.
- **x402** — the HTTP payment protocol used for machine-native payment negotiation.
