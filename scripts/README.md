# scripts

This directory is reserved for local development helpers such as:

- buyer happy-path demo scripts
- seller worker launch scripts
- data seeding helpers
- one-off migration or verification utilities

Keep scripts small and task-specific. Shared reusable logic should live in `lib/` or a future SDK package instead.

## seller-worker.mjs

Local seller worker for development and controlled demos:

- runs a local self-check
- registers the seller through Gateway APIs
- sends heartbeat updates
- subscribes to Supabase Realtime for jobs assigned to that seller
- polls for existing `paid` jobs as a fallback if Realtime misses an insert
- reports `start / complete / fail` back to the Gateway with a Gateway seller session token; legacy EVM signatures are only a local fallback

For the local controlled demo, the worker prefers `SUPABASE_SERVICE_ROLE_KEY` when it is present.
This avoids depending on anon-key table read grants during testing.

Run it with Node 20+:

```bash
node --env-file=.env.local scripts/seller-worker.mjs
```

Optional local overrides:

- `GATEWAY_BASE_URL` default: `http://localhost:3000`
- `SELLER_SESSION_TOKEN` required for the current authenticated seller callback path
- `SELLER_ID` required unless `SELLER_PRIVATE_KEY` is present; when both are set, `SELLER_ID` must match the derived address
- `SELLER_PRIVATE_KEY` optional for session-token mode; required only for legacy seller signatures
- `SELLER_CAPABILITY` default: `llama-3`
- `SELLER_PRICE_PER_TASK` default: `0.01`
- `SELLER_HEARTBEAT_INTERVAL_MS` default: `20000`
- `SELLER_PENDING_JOB_POLL_INTERVAL_MS` default: `5000`

Notes:

- For Kite Passport/x402 tests, `SELLER_ID` should be the seller Passport payer address because the escrow contract releases funds to `quote.seller_id`.
- Obtain `SELLER_SESSION_TOKEN` through the flow in `skills/quotadex-seller/SKILL.md`: register seller, request bond challenge, send the exact USDC bond with `kpass wallet send`, then exchange the bond `tx_hash` at `/api/v1/sellers/session`.
- Keep the returned `SELLER_RENEWAL_TOKEN` outside logs and chat. Returning sellers should renew their Gateway session with that token before paying another bond.
- Production seller agents should follow `skills/quotadex-seller/SKILL.md`; this script is a local runtime helper once a session token already exists.

## buyer-demo.mjs

Local demo buyer:

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

To enable current x402 escrow mode in this local script:

- set `BUYER_PAYMENT_MODE=facilitator`
- set `BUYER_ID` to the buyer Passport payer address
- set `BUYER_X_PAYMENT` to a real `X-PAYMENT` value produced by Kite Passport `approve_payment`
- ensure Gateway has `KITE_PAYMENT_ASSET_ADDRESS`, `PAYMENT_TOKEN_DECIMALS`, `PAYMENT_CURRENCY`, `ESCROW_CONTRACT_ADDRESS`, and `GATEWAY_PRIVATE_KEY`

In real payment mode:

- `BUYER_ID` should be the buyer Passport payer address
- the quoted `seller_id` must already be an EVM address
- quote capability must match an online seller exactly; in production Buyer Agents should discover it through `/api/v1/buyers/capabilities`

Direct `approve + deposit` mode has been removed from the production escrow contract. Production verification expects `X-PAYMENT`.
The newer `direct-escrow` fallback is intentionally not automated in this script because it should only be used when x402 is blocked and the operator explicitly allows that fallback for the current purchase. Use `skills/quotadex-buyer/SKILL.md` for the full public Buyer Agent workflow.
