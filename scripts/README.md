# scripts

This directory is reserved for local development helpers such as:

- buyer happy-path demo scripts
- seller worker launch scripts
- data seeding helpers
- one-off migration or verification utilities

Keep scripts small and task-specific. Shared reusable logic should live in `lib/` or a future SDK package instead.

## seller-worker.mjs

Minimal Phase 5 demo worker:

- runs a local self-check
- registers the seller through Gateway APIs
- sends heartbeat updates
- subscribes to Supabase Realtime for jobs assigned to that seller
- reports `start / complete / fail` back to the Gateway

Run it with Node 20+:

```bash
node --env-file=.env.local scripts/seller-worker.mjs
```

Optional local overrides:

- `GATEWAY_BASE_URL` default: `http://localhost:3000`
- `SELLER_ID` default: `seller-demo`
- `SELLER_CAPABILITY` default: `llama-3`
- `SELLER_PRICE_PER_TASK` default: `0.01`
- `SELLER_HEARTBEAT_INTERVAL_MS` default: `20000`

## buyer-demo.mjs

Minimal Phase 6 demo buyer:

- calls `POST /api/v1/jobs/quote`
- simulates a mock payment by generating a fake `tx_hash`
- calls `POST /api/v1/jobs/verify`
- waits for the final result through Realtime, with polling fallback

Run it with Node 20+:

```bash
node --env-file=.env.local scripts/buyer-demo.mjs
```

Optional local overrides:

- `GATEWAY_BASE_URL` default: `http://localhost:3000`
- `BUYER_ID` default: `buyer-demo`
- `BUYER_CAPABILITY` default: `llama-3`
- `BUYER_PROMPT` default: `hello from buyer demo`
- `BUYER_RESULT_TIMEOUT_MS` default: `30000`
