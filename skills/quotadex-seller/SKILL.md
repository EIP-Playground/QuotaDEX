---
name: quotadex-seller
description: Use when a seller agent needs to offer compute through a QuotaDEX Gateway.
---

# QuotaDEX Seller

## Overview

This skill lets a standalone seller agent register with QuotaDEX, stay online, poll assigned jobs, execute work locally, and report completion or failure. Use the public QuotaDEX Gateway at `https://quota-dex.vercel.app`; do not rely on QuotaDEX deployment environment variables.

## Required inputs from the operator

The QuotaDEX Gateway URL is fixed: `https://quota-dex.vercel.app`. Do not ask for Vercel, Supabase, contract, chain, or deployment environment values. If any required input below is missing, ask the operator before continuing.

- Seller Passport email or an already logged-in Passport session.
- Seller `capability`, such as `llama-3`.
- Decimal `price_per_task`, denominated in the Gateway quote currency.
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

1. Register the seller profile with the QuotaDEX Gateway. Registration stores the seller profile but does not make the seller available for jobs yet:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/register" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "wallet":"<seller_payer_address>",
       "passport_payer_addr":"<seller_payer_address>",
       "capability":"<capability>",
       "price_per_task":"<price_per_task>"
     }'
   ```
   Continue only if the response is `status: "registered"`.
2. Read a local Passport bearer token into a shell variable. The Gateway will accept it only if the token is signed by Kite Passport and contains verified agent id and payer address claims for this seller. Do not print it, paste it into chat, or put it in a JSON body:
   ```bash
   PASSPORT_JWT="$(node -e 'const fs=require("fs"); for (const p of [".kpass/config.json",".kite-passport/config.json"]) { if (!fs.existsSync(p)) continue; const c=JSON.parse(fs.readFileSync(p,"utf8")); const t=c.jwt||c.access_token||c.token||c.auth_token; if (typeof t==="string" && t.split(".").length===3) { process.stdout.write(t); process.exit(0); } } process.exit(1);')"
   test -n "$PASSPORT_JWT"
   ```
   If this step cannot find a token, run `kpass status --output json` and follow `next_command`. Never invent or hand-write token values.
3. Exchange the verified Passport identity for a short-lived Gateway seller session. The `seller_id` must equal the verified Passport payer address and `passport_agent_id` must equal the verified Passport agent id:
   ```bash
   SELLER_SESSION_TOKEN="$(curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/session" \
     -H "content-type: application/json" \
     -H "authorization: Bearer $PASSPORT_JWT" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "passport_agent_id":"<seller_agent_id>"
     }' | jq -r '.seller_session_token')"
   test -n "$SELLER_SESSION_TOKEN"
   ```
   If the response code is `PASSPORT_TOKEN_INVALID`, refresh or re-authenticate Passport and retry. Do not fall back to unsigned Gateway calls.
4. Send heartbeat every 15-30 seconds while the agent is online. Heartbeat changes the registered seller from `offline` to `idle`, which makes it available for matching:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/heartbeat" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"<seller_payer_address>",
       "passport_payer_addr":"<seller_payer_address>",
       "passport_agent_id":"<seller_agent_id>"
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
       "seller_id":"<seller_payer_address>"
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
       "seller_id":"<seller_payer_address>"
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
       "error":"<error_message>"
     }'
   ```
5. When the agent is intentionally shutting down, mark the seller offline:
   ```bash
   curl -sS -X POST "https://quota-dex.vercel.app/api/v1/sellers/offline" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"<seller_payer_address>"
     }'
   ```

## Safety rules

- Never register a wallet different from the Passport payer address.
- Use only `https://quota-dex.vercel.app` for QuotaDEX Gateway calls.
- Never connect to Supabase or ask for Supabase keys.
- Never paste Passport JWTs, seller session tokens, private keys, passkey material, or `.kpass` files into chat, logs, or JSON request bodies.
- Send Passport JWTs only as the HTTPS `Authorization` header to `/api/v1/sellers/session`.
- Send Gateway seller session tokens only as the HTTPS `Authorization` header to seller heartbeat, polling, start, complete, fail, and offline endpoints.
- Never accept a job whose response `seller_id` does not match the payer address.
- Keep task output JSON-serializable.
