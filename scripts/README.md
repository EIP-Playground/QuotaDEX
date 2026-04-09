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

Note:

- For Phase 7 real on-chain payment tests, `SELLER_ID` should be the seller wallet address because the escrow contract releases funds to `quote.seller_id`.

## buyer-demo.mjs

Minimal Phase 6/7 demo buyer:

- calls `POST /api/v1/jobs/quote`
- either simulates a mock payment or performs real `approve + deposit`
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

To enable real on-chain payment mode:

- set `BUYER_PRIVATE_KEY`
- set `KITE_RPC_URL`
- set `PYUSD_CONTRACT_ADDRESS`
- set `ESCROW_CONTRACT_ADDRESS`
- optionally set `PYUSD_DECIMALS` default: `6`

In real payment mode:

- `BUYER_ID` must match the wallet address derived from `BUYER_PRIVATE_KEY`
- the quoted `seller_id` must already be an EVM address
