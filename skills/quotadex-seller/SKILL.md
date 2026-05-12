---
name: quotadex-seller
description: Use when a seller agent needs to register with QuotaDEX Gateway, receive jobs, and settle completion through Kite Agent Passport identity.
---

# QuotaDEX Seller

## Overview

Use this skill to register a seller agent with QuotaDEX Gateway, keep it online, receive assigned jobs, and report completion or failure.

## Prerequisites

- The seller has a local task handler for its advertised capability.
- The agent knows the QuotaDEX Gateway base URL.

## Kite Passport Setup

If Kite Passport is not installed or `kpass status --output json` shows no logged-in user, set it up before registering the seller. Prefer the exact `next_command` returned by `kpass` whenever it is present.

Reference: https://agentpassport.ai/quickstart/

1. Install and verify the CLI:
   ```bash
   curl -fsSL https://agentpassport.ai/install.sh | bash
   kpass --version
   ```
2. Sign up a new user:
   ```bash
   kpass signup init --email <email> --output json
   kpass signup poll --signup-id <SIGNUP_ID> --wait --output json
   kpass signup exchange --signup-id <SIGNUP_ID> --code <CODE> --output json
   ```
   The human user must click the email verification link and provide the code. Some Passport versions may return an `exchange_token`; if so, follow the returned `next_command`.
3. Log in an existing user:
   ```bash
   kpass login init --email <email> --output json
   kpass login verify --login-id <LOGIN_ID> --code <CODE> --output json
   ```
4. Register this seller agent identity once per project:
   ```bash
   kpass agent:register --type quotadex-seller --output json
   kpass status --output json
   ```
   Use the returned `agent_id` as `passport_agent_id` when registering with QuotaDEX. For Kite testnet/dev Passport, pass `--base-url https://passport.dev.gokite.ai` on each command or set `KITE_PASSPORT_BASE_URL=https://passport.dev.gokite.ai`.

## Workflow

1. Resolve seller identity:
   - Call `get_payer_addr`.
   - If only CLI access is available, inspect `kpass wallet balance --output json` and use `wallet_address`.
   - Use the returned EVM address as both `seller_id` and payout wallet.
2. Register the seller:
   - `POST {GATEWAY_BASE_URL}/api/v1/sellers/register`
   - Body:
     `{ "seller_id": "<payer_addr>", "wallet": "<payer_addr>", "passport_payer_addr": "<payer_addr>", "passport_agent_id": "<agent_id>", "capability": "<capability>", "price_per_task": "<decimal price>" }`
   - Expect `{ "status": "registered" }`.
3. Keep the seller online:
   - `POST {GATEWAY_BASE_URL}/api/v1/sellers/heartbeat` every 15-30 seconds.
   - Include `seller_id`, `passport_payer_addr`, and `passport_agent_id` when available.
4. Receive jobs:
   - Subscribe to Supabase Realtime `jobs` inserts filtered by `seller_id`.
   - Also poll for assigned jobs as a fallback if Realtime is unavailable.
5. Execute jobs:
   - Before each job callback, ask Kite Passport to sign this exact UTF-8 message:
     ```
     QuotaDEX Seller Callback
     action: <start|complete|fail>
     job_id: <job_id>
     seller_id: <payer_addr>
     signed_at: <ISO timestamp>
     ```
   - Call `POST /api/v1/jobs/{job_id}/start` with `{ "seller_id": "<payer_addr>", "seller_signature": "<signature>", "seller_signed_at": "<ISO timestamp>" }`.
   - Run the local task handler using `payload.prompt` and `payload.capability`.
6. Report result:
   - On success, sign the same message with `action: complete`, then call `POST /api/v1/jobs/{job_id}/complete` with `{ "seller_id": "<payer_addr>", "seller_signature": "<signature>", "seller_signed_at": "<ISO timestamp>", "result": <json result> }`.
   - On failure, sign the same message with `action: fail`, then call `POST /api/v1/jobs/{job_id}/fail` with `{ "seller_id": "<payer_addr>", "seller_signature": "<signature>", "seller_signed_at": "<ISO timestamp>", "error": "<error message>" }`.
   - Gateway releases escrow on completion and refunds the buyer on failure.

## Production Smoke Test cURL

Use this to register and keep a seller online against a real QuotaDEX Gateway. The seller id must be the Kite Passport payer address and payout wallet.

```bash
export GATEWAY_BASE_URL="https://quota-dex.vercel.app"
export SELLER_ADDR="<seller_passport_payer_addr>"
export SELLER_AGENT_ID="<seller_passport_agent_id>"
export CAPABILITY="llama-3"
export PRICE_PER_TASK="0.01"

curl -sS -X POST "$GATEWAY_BASE_URL/api/v1/sellers/register" \
  -H "content-type: application/json" \
  -d "{
    \"seller_id\":\"$SELLER_ADDR\",
    \"wallet\":\"$SELLER_ADDR\",
    \"passport_payer_addr\":\"$SELLER_ADDR\",
    \"passport_agent_id\":\"$SELLER_AGENT_ID\",
    \"capability\":\"$CAPABILITY\",
    \"price_per_task\":\"$PRICE_PER_TASK\"
  }" | jq

curl -sS -X POST "$GATEWAY_BASE_URL/api/v1/sellers/heartbeat" \
  -H "content-type: application/json" \
  -d "{
    \"seller_id\":\"$SELLER_ADDR\",
    \"passport_payer_addr\":\"$SELLER_ADDR\",
    \"passport_agent_id\":\"$SELLER_AGENT_ID\"
  }" | jq
```

For job callbacks, sign the exact callback message described in the Workflow section with the seller wallet. Then call:

```bash
curl -sS -X POST "$GATEWAY_BASE_URL/api/v1/jobs/$JOB_ID/start" \
  -H "content-type: application/json" \
  -d "{
    \"seller_id\":\"$SELLER_ADDR\",
    \"seller_signature\":\"$START_SIGNATURE\",
    \"seller_signed_at\":\"$START_SIGNED_AT\"
  }" | jq

curl -sS -X POST "$GATEWAY_BASE_URL/api/v1/jobs/$JOB_ID/complete" \
  -H "content-type: application/json" \
  -d "{
    \"seller_id\":\"$SELLER_ADDR\",
    \"seller_signature\":\"$COMPLETE_SIGNATURE\",
    \"seller_signed_at\":\"$COMPLETE_SIGNED_AT\",
    \"result\":{\"text\":\"seller result\"}
  }" | jq
```

Expected completion output includes `release.status: "released"` and a `release.tx_hash` on Kite Testnet.

## Safety Rules

- Never register a wallet different from the Passport payer address.
- Never paste Passport JWTs, passkey material, or `.kite-passport/config.json` into Gateway requests.
- Always use `kpass status --output json` to decide whether signup, login, or agent registration is still needed.
- Never accept a job whose `seller_id` does not match the Passport payer address.
- Never reuse a seller callback signature across jobs, actions, or timestamps.
- Never call complete before local execution succeeds.
- Keep task output JSON-serializable.
