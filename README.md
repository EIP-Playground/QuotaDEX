# QuotaDEX

QuotaDEX is an Agent-to-Agent (A2A) secondary market for AI compute. The MVP uses a Gateway + Supabase + Redis + Escrow design so AI agents can buy and sell idle model quota through HTTP 402 interception and Web3 micro-payments on Kite AI.

当前仓库已经从纯文档状态推进到第一阶段骨架，目标是先落地 Gateway、共享库和 Supabase schema，再逐步实现 `quote -> verify -> seller execution -> result delivery` 的 Happy Path。

## Read First

Before writing code, read these documents in order:

1. [docs/project/PieBazaar - QuotaDEX 技术规格说明书 v3.0 (Final).md](docs/project/PieBazaar%20-%20QuotaDEX%20%E6%8A%80%E6%9C%AF%E8%A7%84%E6%A0%BC%E8%AF%B4%E6%98%8E%E4%B9%A6%20v3.0%20%28Final%29.md)
2. [docs/mvp-rules(swen).md](docs/mvp-rules(swen).md)
3. [docs/development-order(swen).md](docs/development-order(swen).md)
4. [docs/phase-tracker(swen).md](docs/phase-tracker(swen).md)

## Current Phase

Current delivery status:

- `Phase 0` project skeleton: done
  Keywords: `Next.js` `app/api` `lib` `env`
- `Phase 1` data layer: done
  Keywords: `Supabase` `sellers` `jobs` `events`
- `Phase 2` seller lifecycle routes: done
  Keywords: `register` `heartbeat` `offline`
- `Phase 3` quote: next
  Keywords: `match seller` `reserved` `fingerprint` `402`

For the clearest phase view, open [docs/phase-tracker(swen).md](docs/phase-tracker(swen).md).

## Current Skeleton

The repo now contains the Phase 0 / Phase 1 gateway skeleton:

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
  redis.ts
  supabase.ts
supabase/
  migrations/
docs/
```

### Directory Responsibilities

- `app/api/v1/*`
  Gateway HTTP entrypoints for seller registration, buyer quote/verify, and seller job status callbacks.
- `lib/*`
  Shared server helpers for env loading, error responses, fingerprint generation, Redis, and Supabase.
- `supabase/migrations/*`
  Database schema for `sellers`, `jobs`, and `events`.
- `docs/*`
  Product spec, MVP rules, and development sequence.

## What Exists Today

- A minimal Next.js App Router project shell
- Implemented seller lifecycle routes:
  - `POST /api/v1/sellers/register`
  - `POST /api/v1/sellers/heartbeat`
  - `POST /api/v1/sellers/offline`
- Placeholder job routes for `quote`, `verify`, `start`, `complete`, `fail`, and polling
- Shared helper modules for env, errors, fingerprint, Redis, Supabase, and seller request parsing
- Initial Supabase migration with `payment_id` support
- A lightweight landing page describing the skeleton

## What Is Still TODO

- Real seller registration logic
- Database-backed seller reservation in `quote`
- Mock and real payment verification in `verify`
- Seller worker implementation
- Buyer demo script
- Escrow contract integration
- Dashboard and timeout handling

## Environment Variables

Copy `.env.example` and fill the required values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
GATEWAY_SALT=
KITE_RPC_URL=
PYUSD_CONTRACT_ADDRESS=
ESCROW_CONTRACT_ADDRESS=
GATEWAY_PRIVATE_KEY=
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

## Recommended Next Step

Continue with `Phase 3` from [docs/phase-tracker(swen).md](docs/phase-tracker(swen).md) and [docs/development-order(swen).md](docs/development-order(swen).md):

1. Fill in `quote`
2. Fill in mock `verify`
3. Add the first seller worker script
4. Add the first buyer demo script
