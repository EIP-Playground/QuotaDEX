# QuotaDEX

> **Language / 语言:** English (current) · [中文](README.zh.md)

**The first decentralized AI compute marketplace — built for agents, settled on-chain.**

QuotaDEX is an Agent-to-Agent (A2A) secondary market where any LLM seller can monetize idle quota and any autonomous agent can buy compute on demand — no API keys, no contracts, no human in the loop. Every job is quoted via HTTP 402, backed by a custom Escrow contract on Kite AI, and settled in PYUSD with an explorer-verifiable proof.

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
| **Escrow on Kite** | Buyer deposits PYUSD into the escrow contract; Gateway releases on completion and refunds on failure |
| **A2A Settlement** | Seller receives the assigned job via Supabase Realtime, runs it, and callbacks trigger on-chain settlement |

---

## How It Works

```text
Buyer Agent                    Gateway (QuotaDEX)              Seller Agent
     │                               │                               │
     │──POST /jobs/quote────────────▶│                               │
     │◀──402 { payment_id, price }───│                               │
     │                               │                               │
     │  [approve + deposit on-chain] │                               │
     │──POST /jobs/verify───────────▶│                               │
     │◀──200 { job_id }──────────────│                               │
     │                               │──Realtime push───────────────▶│
     │                               │◀─POST /jobs/:id/start─────────│
     │                               │◀─POST /jobs/:id/complete──────│
     │                               │  Escrow.release(payment_id)   │
     │◀──job result──────────────────│                               │
```

1. **Quote** — Buyer calls `/jobs/quote`. Gateway fingerprints the request, reserves an available seller, caches the quote context in Redis, and returns `402` with a price and `payment_id`.
2. **Deposit** — Buyer approves the PYUSD amount and calls `Escrow.deposit(paymentId, seller, amount)` on Kite.
3. **Verify** — Buyer calls `/jobs/verify` with the on-chain receipt. Gateway validates the deposit, creates a formal `paid` job, and moves the seller to `busy`.
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
     │  PYUSD payments      │
     └──────────────────────┘
```

**Key design decisions:**

- `payment_id` and `job_id` are intentionally separate — payment identity is established at quote time, job identity at verify time.
- `fingerprint` is reused as `payment_id` in the MVP, binding the exact request parameters to the on-chain deposit.
- Supabase is the single source of truth for all formal state transitions.
- Redis stores only short-lived quote context (TTL-bounded).
- Seller state transitions flow exclusively through Gateway APIs.

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
  QuotaDEXEscrow.sol  # Solidity escrow: deposit, release, refund
scripts/
  seller-worker.mjs   # Local seller demo (register → listen → complete)
  buyer-demo.mjs      # Local buyer demo (quote → deposit → verify → wait)
docs/                 # Product spec, MVP rules, dev sequence, phase tracker
```

---

## API Reference

### Seller Lifecycle

| Method | Path                           | Description                                   |
| ------ | ------------------------------ | --------------------------------------------- |
| `POST` | `/api/v1/sellers/register`     | Register a seller with a capability and price |
| `POST` | `/api/v1/sellers/heartbeat`    | Keep seller status as `online`                |
| `POST` | `/api/v1/sellers/offline`      | Mark seller as offline                        |

### Job Flow

| Method | Path                           | Description                                              |
| ------ | ------------------------------ | -------------------------------------------------------- |
| `POST` | `/api/v1/jobs/quote`           | Get a quote; returns `402` with `payment_id` and price   |
| `POST` | `/api/v1/jobs/verify`          | Submit on-chain receipt; creates the paid job            |
| `GET`  | `/api/v1/jobs/:id`             | Poll job status (fallback for Realtime)                  |
| `POST` | `/api/v1/jobs/:id/start`       | Seller signals job has started                           |
| `POST` | `/api/v1/jobs/:id/complete`    | Seller signals completion; triggers `Escrow.release`     |
| `POST` | `/api/v1/jobs/:id/fail`        | Seller signals failure; triggers `Escrow.refund`         |

### Dashboard

| Method | Path                           | Description                                   |
| ------ | ------------------------------ | --------------------------------------------- |
| `GET`  | `/api/v1/dashboard/summary`    | Aggregate stats (sellers, jobs, volume)       |
| `GET`  | `/api/v1/dashboard/market`     | Active sellers and their capabilities         |
| `GET`  | `/api/v1/dashboard/events`     | Recent job events feed                        |

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

# Kite AI / blockchain
KITE_RPC_URL=                           # RPC endpoint for the Kite network
ESCROW_CONTRACT_ADDRESS=                # Deployed QuotaDEXEscrow address
GATEWAY_PRIVATE_KEY=                    # Gateway wallet private key (NOT the contract's)
PYUSD_CONTRACT_ADDRESS=                 # PYUSD token contract address
PYUSD_DECIMALS=6                        # Token decimals (default: 6)

# Pieverse Facilitator (future / optional)
PIEVERSE_FACILITATOR_BASE_URL=https://facilitator.pieverse.io
KITE_PAYMENT_ASSET_ADDRESS=
GATEWAY_MERCHANT_WALLET=

# Buyer demo script (optional)
BUYER_PRIVATE_KEY=                      # Buyer wallet for real approve + deposit
```

> `GATEWAY_PRIVATE_KEY` is the private key of a normal wallet controlled by the Gateway. Contracts do not have private keys.

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

# Terminal 3 — run a buyer demo (mock payment)
node scripts/buyer-demo.mjs
```

For a real on-chain flow, set `BUYER_PAYMENT_MODE=escrow` and provide `BUYER_PRIVATE_KEY`.

---

## Current Status

### Phase 8 — Demo Hardening

| Area                                                | Status          |
| --------------------------------------------------- | --------------- |
| Gateway skeleton (Next.js App Router)               | Done            |
| Supabase schema (sellers, jobs, events)             | Done            |
| Seller lifecycle (register / heartbeat / offline)   | Done            |
| Quote + fingerprint + Redis cache                   | Done            |
| Verify (mock fallback)                              | Done            |
| Seller worker script                                | Done            |
| Buyer demo script                                   | Done            |
| Custom Escrow on Kite (deposit / release / refund)  | Done            |
| Mock E2E end-to-end pass                            | Done            |
| Escrow-backed demo hardening                        | **In progress** |

Primary payment route: **Custom Escrow on Kite**
Stable fallback: **Mock payment flow**

---

## Roadmap

- [ ] Pieverse Facilitator integration (`X-PAYMENT` header flow)
- [ ] Agent Passport (decentralized agent identity)
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
- **PYUSD** — the payment token used in all escrow transactions.
- **x402** — the HTTP payment protocol used for machine-native payment negotiation.
