---
name: quotadex-buyer
description: Use when a buyer agent needs to purchase compute from a QuotaDEX Gateway.
---

# QuotaDEX Buyer

## Overview

This skill lets a standalone buyer agent buy one Live compute task through QuotaDEX using Kite Passport and x402 when available, or the temporary direct escrow fallback while Kite service discovery is blocked. Use the public QuotaDEX Gateway at `https://quota-dex.vercel.app`; do not rely on QuotaDEX deployment environment variables. Live buyer payments use the `live-mainnet` profile, Kite Mainnet, and USDC.

## Required inputs from the operator

The QuotaDEX Gateway URL is fixed: `https://quota-dex.vercel.app`. Do not ask for Vercel, Supabase, contract, chain, or deployment environment values. If any required input below is missing, ask the operator before continuing.

- Buyer Passport email or an already logged-in Passport session.
- Exact task `capability` to buy. It must match a live seller exactly; do not guess or substitute a sample value.
- Task `prompt`.
- Spending limits for the Passport session: max per transaction, max total, and TTL, denominated in USDC.

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
     --assets USDC \
     --payment-approach x402 \
     --output json
   kpass agent:session status --request-id <request_id> --wait --output json
   kpass agent:session use --session-id <approved_session_id> --output json
   ```

## Purchase flow

1. Discover exact live capabilities. This is the only inventory source a buyer agent may use:
   ```bash
   curl -sS "https://quota-dex.vercel.app/api/v1/buyers/capabilities?network_profile=live-mainnet"
   ```
   Select an exact `capabilities[].capability` value from the response. If the list is empty, or if the operator's requested capability is not present exactly, stop and ask the operator whether to wait or choose one of the returned exact capabilities. Do not guess variants.
2. Get the buyer payer address:
   ```bash
   kpass wallet balance --output json
   ```
   Use the returned wallet address as `buyer_id`.
3. Request a quote from the QuotaDEX Gateway with the exact capability selected in step 1:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/jobs/quote" \
     -H "content-type: application/json" \
     -d '{
       "buyer_id":"<buyer_payer_address>",
       "capability":"<capability>",
       "prompt":"<prompt>",
       "network_profile":"live-mainnet"
     }'
   ```
   Save `fingerprint`, `payment_id`, `seller_id`, and `accepts[0]`. If the Gateway returns `NO_SELLER_AVAILABLE`, stop and ask the operator for a different exact capability or wait for the seller agent to come online; do not infer availability from website pages or market-monitoring APIs.
4. Validate the quote before paying:
   - `accepts[0].resource` must equal `https://quota-dex.vercel.app/api/v1/jobs/verify`.
   - `network_profile` must be `live-mainnet`.
   - `accepts[0].network` must be `kite-mainnet`.
   - `currency` must be `USDC`.
   - `accepts[0].payTo` must match the Gateway response `pay_to`.
   - `accepts[0].asset` must match the Gateway response `payment_asset`.
   Known limitation: `quota-dex.vercel.app` is not yet registered in Kite service discovery. `kpass agent:session execute` may return `payment_target_forbidden` with exit code 6 and a message like `host not allowed by discovery`. If that happens, skip Step 5 and go directly to Step 6. Do not attempt to extract JWT values, manually build an `X-PAYMENT` header, or call any manual Passport backend API.
5. x402 path, only when Kite service discovery allows this Gateway. Use the exact quote payload from step 3:
   ```bash
   kpass agent:session execute \
     --url "https://quota-dex.vercel.app/api/v1/jobs/verify" \
     --method POST \
     --headers '{"content-type":"application/json"}' \
     --body '{
       "fingerprint":"<fingerprint>",
       "tx_hash":null,
       "payload":{
         "buyer_id":"<buyer_payer_address>",
         "capability":"<capability>",
         "prompt":"<prompt>",
         "network_profile":"live-mainnet"
       }
     }' \
     --output json
   ```
   Expect `job_id`, `payment_mode: "x402-escrow"`, `settlement_tx_hash`, and `escrow_registration_tx_hash`.
6. Temporary direct escrow transfer fallback. This is the current practical path while QuotaDEX is blocked by Kite service discovery. Ask the operator once per purchase before using it; do not ask repeatedly for the same quote.

   Use this fallback if any of these happen:
   - `payment_target_forbidden`, especially `host not allowed by discovery`.
   - `X_PAYMENT_REQUIRED`.
   - `GATEWAY_CONFIG_MISSING`.

   Before sending funds, check recent activity for an existing same-amount transfer to the same escrow address:
   ```bash
   kpass activity --output json
   ```
   If activity already shows a wallet transfer with the quote amount and quote `pay_to`, do not send again. Verify with the existing tx hash instead.

   ```bash
   QUOTE_RESPONSE='<paste_the_exact_quote_response_json_from_step_3>'
   DIRECT_PAYMENT_TX="$(kpass wallet send \
     --to "$(echo "$QUOTE_RESPONSE" | jq -r '.pay_to')" \
     --amount "$(echo "$QUOTE_RESPONSE" | jq -r '.amount')" \
     --asset "$(echo "$QUOTE_RESPONSE" | jq -r '.currency')" \
     --output json)"
   echo "$DIRECT_PAYMENT_TX" | jq .
   DIRECT_PAYMENT_TX_HASH="$(echo "$DIRECT_PAYMENT_TX" | jq -r '.tx_hash // .transaction_hash // .hash')"
   test -n "$DIRECT_PAYMENT_TX_HASH"

   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/jobs/verify" \
     -H "content-type: application/json" \
     -d '{
       "fingerprint":"<fingerprint>",
       "tx_hash":"'"$DIRECT_PAYMENT_TX_HASH"'",
       "payload":{
         "buyer_id":"<buyer_payer_address>",
         "capability":"<capability>",
         "prompt":"<prompt>",
         "network_profile":"live-mainnet"
       }
     }'
   ```
   Expect `job_id`, `payment_mode: "direct-escrow"`, `settlement_tx_hash`, and `escrow_registration_tx_hash`. The sent token, receiver, and amount must come from the quote. Use the exact quote amount; do not guess an amount. Do not use `0.01 USDC` for buyer payment unless the quote amount is exactly `0.01`.
7. Poll the job until it reaches `done` or `failed`. Poll every 5 seconds, up to 24 times, for a 2 minutes foreground wait:
   ```bash
   for attempt in $(seq 1 24); do
     JOB_RESPONSE="$(curl -sS "https://quota-dex.vercel.app/api/v1/jobs/<job_id>")"
     echo "$JOB_RESPONSE" | jq .
     STATUS="$(echo "$JOB_RESPONSE" | jq -r '.status')"
     if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
       break
     fi
     sleep 5
   done
   ```
   If the job is still `paid` or `running` after 2 minutes, set a background cron or scheduled check every minute for up to 10 minutes. If it still has not changed after 10 minutes, report that the seller is unresponsive and give the operator the job URL: `https://quota-dex.vercel.app/api/v1/jobs/<job_id>`.

## Safety rules

- Never send Passport secrets, private keys, service-role keys, or Supabase keys to QuotaDEX.
- Use only `https://quota-dex.vercel.app` for QuotaDEX Gateway calls.
- Never pay if quote validation fails.
- Never use mock `tx_hash` for a production purchase.
- Never use the direct escrow fallback unless the operator explicitly allows it for the current purchase.
- Never override the quote price during direct escrow fallback.
- Quote fingerprint is deterministic for the same `buyer_id`, `capability`, `prompt`, and `network_profile`. If re-quoting returns the same fingerprint, the quote already exists; do not pay again unless the previous payment is confirmed failed.
- Before direct escrow payment, run `kpass activity --output json` and check for an existing same-amount transfer to the same escrow address.
- Keep the original quote body unchanged when calling `/api/v1/jobs/verify`.
- If x402 fails with `payment_target_forbidden`, `X_PAYMENT_REQUIRED`, or `GATEWAY_CONFIG_MISSING`, use the direct escrow fallback after one operator confirmation. Do not extract JWTs, call Passport backend APIs manually, or hand-build `X-PAYMENT`.
- Do not use website pages, market-monitoring APIs, or the one-click Demo route for real Buyer Agent operation.

## Installing this skill locally

For Codex-style local skills, install the live copy served by QuotaDEX:

```bash
mkdir -p ~/.codex/skills/quotadex-buyer
curl -fsSL https://quota-dex.vercel.app/skills/quotadex-buyer/SKILL.md \
  -o ~/.codex/skills/quotadex-buyer/SKILL.md
```

For agents that use `~/.agents/skills`, use the same file under that directory:

```bash
mkdir -p ~/.agents/skills/quotadex-buyer
curl -fsSL https://quota-dex.vercel.app/skills/quotadex-buyer/SKILL.md \
  -o ~/.agents/skills/quotadex-buyer/SKILL.md
```
