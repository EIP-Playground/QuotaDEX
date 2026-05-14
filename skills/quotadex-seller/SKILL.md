---
name: quotadex-seller
description: Use when a seller agent needs to offer compute through a QuotaDEX Gateway.
---

# QuotaDEX Seller

## Overview

This skill lets a standalone seller agent register with QuotaDEX, stay online, poll assigned jobs, execute work locally, and report completion or failure. Use the public QuotaDEX Gateway at `https://quota-dex.vercel.app`; do not rely on QuotaDEX deployment environment variables. Live seller operation uses the `live-mainnet` profile, Kite Mainnet, and USDC.

## Required inputs from the operator

The QuotaDEX Gateway URL is fixed: `https://quota-dex.vercel.app`. Do not ask for Vercel, Supabase, contract, chain, or deployment environment values. If any required input below is missing, ask the operator before continuing.

- Seller Passport email or an already logged-in Passport session.
- Seller `capability`, such as `llama-3`.
- Decimal `price_per_task`, denominated in USDC.
- Local task handler for the advertised capability.
- Poll interval, usually 15-30 seconds.

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
   kpass signup init --email <seller_email> --output json
   kpass signup poll --signup-id <signup_id> --wait --output json
   kpass signup exchange --signup-id <signup_id> --code <email_code> --output json
   ```
   Existing users can use:
   ```bash
   kpass login init --email <seller_email> --output json
   kpass login verify --login-id <login_id> --code <email_code> --output json
   ```
3. Register this seller agent:
   ```bash
   kpass agent:register --type quotadex-seller --output json
   ```
   Save the returned `agent_id`.
4. Get the seller payer address:
   ```bash
   kpass wallet balance --output json
   ```
   Use the returned wallet address as `seller_id`, payout wallet, and `passport_payer_addr`.

## Gateway registration

1. If this is a returning seller and you already have `SELLER_RENEWAL_TOKEN` from a previous successful bond, renew the Gateway seller session before changing the profile:
   ```bash
   SELLER_SESSION_RESPONSE="$(curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/session" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "passport_agent_id":"<seller_agent_id>",
       "network_profile":"live-mainnet",
       "seller_renewal_token":"'"$SELLER_RENEWAL_TOKEN"'"
     }')"
   echo "$SELLER_SESSION_RESPONSE" | jq .
   SELLER_SESSION_TOKEN="$(echo "$SELLER_SESSION_RESPONSE" | jq -r '.seller_session_token // empty')"
   test -n "$SELLER_SESSION_TOKEN"
   ```
   If this succeeds, keep using the returned `SELLER_SESSION_TOKEN` and skip to heartbeat. If it fails with an auth error, continue with registration and seller bond.
2. Register the seller profile with the QuotaDEX Gateway. Registration stores the seller profile but does not make the seller available for jobs yet:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/register" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "wallet":"<seller_payer_address>",
       "passport_payer_addr":"<seller_payer_address>",
       "capability":"<capability>",
       "price_per_task":"<price_per_task>",
       "network_profile":"live-mainnet"
     }'
   ```
   Continue only if the response is `status: "registered"`.
3. Request a seller bond challenge only when the session response did not include `seller_session_token`. This is a small USDC transfer that proves this agent controls the kpass wallet. The Gateway treats it as a hackathon seller bond; malicious or abandoned sellers may forfeit it. Use the exact `asset`, `amount`, and `to` values returned by the Gateway:
   ```bash
   SELLER_BOND_CHALLENGE="$(curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/session/challenge" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "passport_agent_id":"<seller_agent_id>",
       "network_profile":"live-mainnet"
     }')"
   echo "$SELLER_BOND_CHALLENGE" | jq .
   ```
   If the response is `status: "already_verified"`, use the renewal call in step 1 with the saved `SELLER_RENEWAL_TOKEN`; do not send another payment. For Live Mainnet, expect `asset` to be `USDC`. Do not substitute tokens.
4. Pay the seller bond from the kpass wallet:
   ```bash
   SELLER_BOND_TX="$(kpass wallet send \
     --to "$(echo "$SELLER_BOND_CHALLENGE" | jq -r '.to')" \
     --amount "$(echo "$SELLER_BOND_CHALLENGE" | jq -r '.amount')" \
     --asset "$(echo "$SELLER_BOND_CHALLENGE" | jq -r '.asset')" \
     --output json)"
   echo "$SELLER_BOND_TX" | jq .
   SELLER_BOND_TX_HASH="$(echo "$SELLER_BOND_TX" | jq -r '.tx_hash // .transaction_hash // .hash')"
   test -n "$SELLER_BOND_TX_HASH"
   ```
5. Exchange the verified seller bond transfer for a short-lived Gateway seller session:
   ```bash
   SELLER_SESSION_RESPONSE="$(curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/session" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "passport_agent_id":"<seller_agent_id>",
       "network_profile":"live-mainnet",
       "challenge_id":"'"$(echo "$SELLER_BOND_CHALLENGE" | jq -r '.challenge_id')"'",
       "tx_hash":"'"$SELLER_BOND_TX_HASH"'"
     }')"
   SELLER_SESSION_TOKEN="$(echo "$SELLER_SESSION_RESPONSE" | jq -r '.seller_session_token // empty')"
   SELLER_RENEWAL_TOKEN="$(echo "$SELLER_SESSION_RESPONSE" | jq -r '.seller_renewal_token // empty')"
   echo "$SELLER_SESSION_RESPONSE" | jq 'del(.seller_renewal_token)'
   test -n "$SELLER_SESSION_TOKEN"
   test -n "$SELLER_RENEWAL_TOKEN"
   ```
   Store `SELLER_RENEWAL_TOKEN` in the agent's local secret store or environment. It is the private proof used for future free renewals; never paste it into chat or logs. If the response says the challenge expired, request a new challenge and send the new exact amount.
6. Renew the Gateway seller session when it expires. Do not request a new bond challenge first; reuse the existing verified seller bond by calling the session endpoint with `SELLER_RENEWAL_TOKEN`:
   ```bash
   SELLER_SESSION_TOKEN="$(curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/session" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "passport_agent_id":"<seller_agent_id>",
       "network_profile":"live-mainnet",
       "seller_renewal_token":"'"$SELLER_RENEWAL_TOKEN"'"
     }' | jq -r '.seller_session_token')"
   test -n "$SELLER_SESSION_TOKEN"
   ```
   Only request and pay a new seller bond challenge if this renewal call says no verified seller bond exists, the renewal token is missing, or the wallet address or seller agent id changed.
7. Send heartbeat every 15-30 seconds while the agent is online. Heartbeat changes the registered seller from `offline` to `idle`, which makes it available for matching:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/heartbeat" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "passport_payer_addr":"<seller_payer_address>",
       "passport_agent_id":"<seller_agent_id>",
       "network_profile":"live-mainnet"
     }'
   ```

## Job polling

Poll jobs through the Gateway. Do not connect directly to Supabase.

1. Poll assigned jobs with the Gateway seller session token:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/jobs" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "network_profile":"live-mainnet"
     }'
   ```
   The response returns `jobs` with `status` `paid` or `running`.

## Execute a job

For each `paid` job:

1. Start the job:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/jobs/<job_id>/start" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "network_profile":"live-mainnet"
     }'
   ```
2. Run the local task handler with `payload.capability` and `payload.prompt`.
3. On success, send:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/jobs/<job_id>/complete" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "network_profile":"live-mainnet",
       "result":<json_result>
     }'
   ```
4. On failure, send:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/jobs/<job_id>/fail" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "network_profile":"live-mainnet",
       "error":"<error_message>"
     }'
   ```
5. When the agent is intentionally shutting down, mark the seller offline:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/offline" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "network_profile":"live-mainnet"
     }'
   ```

## Safety rules

- Never register a wallet different from the Passport payer address.
- Use only `https://quota-dex.vercel.app` for QuotaDEX Gateway calls.
- Never connect to Supabase or ask for Supabase keys.
- Never paste seller session tokens, seller renewal tokens, private keys, passkey material, or `.kpass` files into chat, logs, or unrelated JSON request bodies.
- Do not read local Passport JWT files for Gateway auth. Use the seller bond challenge flow.
- Send Gateway seller session tokens only as the HTTPS `Authorization` header to seller heartbeat, polling, start, complete, fail, and offline endpoints.
- Keep `network_profile` as `live-mainnet` for real Seller Agent operation.
- Never accept a job whose response `seller_id` does not match the payer address.
- Keep task output JSON-serializable.
