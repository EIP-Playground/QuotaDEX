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
- polls for existing `paid` jobs as a fallback if Realtime misses an insert
- signs and reports `start / complete / fail` back to the Gateway

For the local controlled demo, the worker prefers `SUPABASE_SERVICE_ROLE_KEY` when it is present.
This avoids depending on anon-key table read grants during testing.

Run it with Node 20+:

```bash
node --env-file=.env.local scripts/seller-worker.mjs
```

Optional local overrides:

- `GATEWAY_BASE_URL` default: `http://localhost:3000`
- `SELLER_PRIVATE_KEY` required; the derived address is used as the seller ID
- `SELLER_ID` optional, but when set it must match `SELLER_PRIVATE_KEY`
- `SELLER_CAPABILITY` default: `llama-3`
- `SELLER_PRICE_PER_TASK` default: `0.01`
- `SELLER_HEARTBEAT_INTERVAL_MS` default: `20000`
- `SELLER_PENDING_JOB_POLL_INTERVAL_MS` default: `5000`

Notes:

- For Kite Passport/x402 tests, `SELLER_ID` should be the seller Passport payer address because the escrow contract releases funds to `quote.seller_id`.
- Production seller agents should use Kite Passport signing instead of raw private keys; this script is a local EOA helper.

## buyer-demo.mjs

Legacy local demo buyer:

- calls `POST /api/v1/jobs/quote`
- either simulates a mock payment or attaches a prebuilt `X-PAYMENT`
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
- `BUYER_PAYMENT_MODE`
  - omitted: use `mock`
  - `mock`: use the existing local mock payment flow
  - `facilitator`: send a real `X-PAYMENT` header to the Gateway

To enable current x402 escrow mode:

- set `BUYER_PAYMENT_MODE=facilitator`
- set `BUYER_ID` to the buyer Passport payer address
- set `BUYER_X_PAYMENT` to a real `X-PAYMENT` value produced by Kite Passport `approve_payment`
- ensure Gateway has `KITE_PAYMENT_ASSET_ADDRESS`, `PAYMENT_TOKEN_DECIMALS`, `PAYMENT_CURRENCY`, `ESCROW_CONTRACT_ADDRESS`, and `GATEWAY_PRIVATE_KEY`

In real payment mode:

- `BUYER_ID` should be the buyer Passport payer address
- the quoted `seller_id` must already be an EVM address

Direct `approve + deposit` mode has been removed from the production escrow contract. Production verification expects `X-PAYMENT`.
