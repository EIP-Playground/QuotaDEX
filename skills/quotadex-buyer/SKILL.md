---
name: quotadex-buyer
description: Use when a buyer agent needs to purchase compute from a QuotaDEX Gateway.
---

# QuotaDEX Buyer

## Overview

This skill lets a standalone buyer agent buy one compute task through QuotaDEX using Kite Passport and x402. The agent must receive the Gateway URL from its operator or task context; it must not rely on QuotaDEX deployment environment variables.

## Required inputs from the operator

Do not assume the Gateway URL, Vercel project, Supabase project, or any deployment environment value. If any required input is missing, ask the operator before continuing.

- QuotaDEX Gateway URL, for example `<gateway_url>`.
- Buyer Passport email or an already logged-in Passport session.
- Task `capability`, such as `llama-3`.
- Task `prompt`.
- Spending limits for the Passport session: max per transaction, max total, and TTL.
- Optional Passport backend URL. Use it only if the operator provides it.

## Passport setup

Run all Passport commands with `--output json`. If a command returns `next_command`, execute that exact command.

1. Install and inspect Passport:
   ```bash
   curl -fsSL https://agentpassport.ai/install.sh | bash
   kpass --version
   kpass status --output json
   ```
2. If not logged in, sign up or log in:
   ```bash
   kpass signup init --email <buyer_email> --output json
   kpass signup poll --signup-id <signup_id> --wait --output json
   kpass signup exchange --signup-id <signup_id> --code <email_code> --output json
   ```
   Existing users can use:
   ```bash
   kpass login init --email <buyer_email> --output json
   kpass login verify --login-id <login_id> --code <email_code> --output json
   ```
3. Register this buyer agent:
   ```bash
   kpass agent:register --type quotadex-buyer --output json
   ```
4. Create and activate a spending session:
   ```bash
   kpass agent:session create \
     --task-summary "QuotaDEX compute purchase" \
     --max-amount-per-tx <max_per_tx> \
     --max-total-amount <max_total> \
     --ttl <duration> \
     --assets USDT \
     --payment-approach x402 \
     --output json
   kpass agent:session status --request-id <request_id> --wait --output json
   kpass agent:session use --session-id <approved_session_id> --output json
   ```

## Purchase flow

1. Get the buyer payer address:
   ```bash
   kpass wallet balance --output json
   ```
   Use the returned wallet address as `buyer_id`.
2. Request a quote from the operator-provided Gateway URL:
   ```bash
   curl -sS -X POST "<gateway_url>/api/v1/jobs/quote" \
     -H "content-type: application/json" \
     -d '{
       "buyer_id":"<buyer_payer_address>",
       "capability":"<capability>",
       "prompt":"<prompt>"
     }'
   ```
   Save `fingerprint`, `payment_id`, `seller_id`, and `accepts[0]`.
3. Validate the quote before paying:
   - `accepts[0].resource` must equal `<gateway_url>/api/v1/jobs/verify`.
   - `accepts[0].network` must be `kite-testnet` unless the operator explicitly selected another network.
   - `accepts[0].payTo` must match the Gateway response `pay_to`.
   - `accepts[0].asset` must match the Gateway response `payment_asset`.
4. Pay and verify through Passport. Use the exact quote payload from step 2:
   ```bash
   kpass agent:session execute \
     --url "<gateway_url>/api/v1/jobs/verify" \
     --method POST \
     --headers '{"content-type":"application/json"}' \
     --body '{
       "fingerprint":"<fingerprint>",
       "tx_hash":null,
       "payload":{
         "buyer_id":"<buyer_payer_address>",
         "capability":"<capability>",
         "prompt":"<prompt>"
       }
     }' \
     --output json
   ```
   Expect `job_id`, `payment_mode: "x402-escrow"`, `settlement_tx_hash`, and `escrow_registration_tx_hash`.
5. Poll the job until it reaches `done` or `failed`:
   ```bash
   curl -sS "<gateway_url>/api/v1/jobs/<job_id>"
   ```

## Safety rules

- Never send Passport secrets, private keys, service-role keys, or Supabase keys to QuotaDEX.
- Never invent a Gateway URL. Ask the operator for it.
- Never pay if quote validation fails.
- Never use mock `tx_hash` for a production purchase.
- Keep the original quote body unchanged when calling `/api/v1/jobs/verify`.
