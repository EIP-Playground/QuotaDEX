---
name: quotadex-buyer
description: Use when a buyer agent needs to buy compute through QuotaDEX Gateway using Kite Agent Passport and x402 payment.
---

# QuotaDEX Buyer

## Overview

Use this skill to request a seller quote, approve x402 payment with Kite Agent Passport, and verify the paid job with QuotaDEX Gateway.

## Prerequisites

- The agent knows the QuotaDEX Gateway base URL.
- The Gateway payment asset is Kite Testnet USDT unless the Gateway response says otherwise.

## Kite Passport Setup

If Kite Passport is not installed or `kpass status --output json` shows no logged-in user, set it up before requesting a QuotaDEX quote. Prefer the exact `next_command` returned by `kpass` whenever it is present.

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
4. Register this buyer agent identity once per project:
   ```bash
   kpass agent:register --type quotadex-buyer --output json
   kpass status --output json
   ```
5. Create and activate a spending session for QuotaDEX x402 payments:
   ```bash
   kpass agent:session create \
     --task-summary "QuotaDEX compute purchases" \
     --max-amount-per-tx <amount> \
     --max-total-amount <amount> \
     --ttl <duration> \
     --assets USDT \
     --payment-approach x402 \
     --output json
   kpass agent:session status --request-id <REQUEST_ID> --wait --output json
   ```
   Open the returned approval URL, review the policy, and approve with passkey. For Kite testnet/dev Passport, pass `--base-url https://passport.dev.gokite.ai` on each command or set `KITE_PASSPORT_BASE_URL=https://passport.dev.gokite.ai`.

## Workflow

1. Resolve the buyer payer address with Kite Passport:
   - Call `get_payer_addr`.
   - If only CLI access is available, inspect `kpass wallet balance --output json` and use `wallet_address`.
   - Use the returned EVM address as `buyer_id`.
2. Request a quote:
   - `POST {GATEWAY_BASE_URL}/api/v1/jobs/quote`
   - Body: `{ "buyer_id": "<payer_addr>", "capability": "<capability>", "prompt": "<task>" }`
   - Expect HTTP `402` with `payment_id`, `fingerprint`, `seller_id`, and `accepts`.
3. Approve the x402 payment:
   - Pass the selected `accepts[0]` entry to Kite Passport `approve_payment`.
   - Confirm `payTo` is the escrow contract and `network` is `kite-testnet`.
   - Confirm `resource` is the absolute Gateway verify URL: `{GATEWAY_BASE_URL}/api/v1/jobs/verify`.
   - Keep the returned `X-PAYMENT` payload exactly as provided.
4. Verify the job:
   - `POST {GATEWAY_BASE_URL}/api/v1/jobs/verify`
   - Header: `X-PAYMENT: <approval payload>`
   - Body: `{ "fingerprint": "<fingerprint>", "tx_hash": null, "payload": <original quote body> }`
   - Expect `job_id`, `payment_mode: "x402-escrow"`, `settlement_tx_hash`, and `escrow_registration_tx_hash`.
5. Track the job:
   - Poll `GET {GATEWAY_BASE_URL}/api/v1/jobs/{job_id}` until status is `done` or `failed`.
   - A completed job returns seller output.
   - A failed job should trigger escrow refund through the Gateway.

## Production Smoke Test cURL

Use these commands when validating a real QuotaDEX Gateway deployment. This path requires a Kite Passport-approved `X-PAYMENT` value; do not use mock `tx_hash` in production.

```bash
export GATEWAY_BASE_URL="https://quota-dex.vercel.app"
export BUYER_ADDR="<buyer_passport_payer_addr>"
export CAPABILITY="llama-3"
export PROMPT="hello quotadex"

curl -sS -o /tmp/quotadex-quote.json -w "HTTP:%{http_code}\n" \
  -X POST "$GATEWAY_BASE_URL/api/v1/jobs/quote" \
  -H "content-type: application/json" \
  -d "{
    \"buyer_id\":\"$BUYER_ADDR\",
    \"capability\":\"$CAPABILITY\",
    \"prompt\":\"$PROMPT\"
  }"

jq '{code,payment_mode,pay_to,payment_asset,chain_id,amount,accepts}' \
  /tmp/quotadex-quote.json
```

Approve `accepts[0]` with Kite Passport. Keep the returned `X-PAYMENT` value exactly as returned by Passport.

```bash
export X_PAYMENT="<passport_returned_x_payment>"
export FINGERPRINT="$(jq -r '.fingerprint' /tmp/quotadex-quote.json)"

curl -sS -X POST "$GATEWAY_BASE_URL/api/v1/jobs/verify" \
  -H "content-type: application/json" \
  -H "X-PAYMENT: $X_PAYMENT" \
  -d "{
    \"fingerprint\":\"$FINGERPRINT\",
    \"tx_hash\":null,
    \"payload\":{
      \"buyer_id\":\"$BUYER_ADDR\",
      \"capability\":\"$CAPABILITY\",
      \"prompt\":\"$PROMPT\"
    }
  }" | tee /tmp/quotadex-verify.json | jq

export JOB_ID="$(jq -r '.job_id' /tmp/quotadex-verify.json)"
curl -sS "$GATEWAY_BASE_URL/api/v1/jobs/$JOB_ID" | jq
```

Expected verification output includes `payment_mode: "x402-escrow"`, a non-null `settlement_tx_hash`, and a non-null `escrow_registration_tx_hash`.

## Safety Rules

- Never send Passport secrets, private keys, or service role keys to QuotaDEX.
- Never paste Passport JWTs, passkey material, or `.kite-passport/config.json` into Gateway requests.
- Always use `kpass status --output json` to decide whether signup, login, agent registration, or session activation is still needed.
- Reject a quote if `accepts[0].payTo` is not the escrow contract from the response.
- Reject a quote if `accepts[0].asset` does not match the expected Kite payment asset.
- Treat a missing `X-PAYMENT` header as a failed production payment flow.
