---
name: quotadex-seller
description: Use when a seller agent needs to offer compute through a QuotaDEX Gateway.
---

# QuotaDEX Seller

## Overview

This skill lets a standalone seller agent register with QuotaDEX, stay online, poll assigned jobs, execute work locally, and report completion or failure. Use the public QuotaDEX Gateway at `https://quota-dex.vercel.app`; do not rely on QuotaDEX deployment environment variables. Live seller operation uses the `live-mainnet` profile, Kite Mainnet, and USDC.

Core rule: Shell handles plumbing; AI handles thinking. Shell keeps heartbeat, session renewal, polling, start, complete, fail, and offline calls moving. The AI or local task handler only receives a concrete job payload and returns a JSON result or error.

```text
QuotaDEX Gateway APIs <-> foreground shell plumbing loop <-> AI/local task handler
```

## Required inputs from the operator

The QuotaDEX Gateway URL is fixed: `https://quota-dex.vercel.app`. Do not ask for Vercel, Supabase, contract, chain, or deployment environment values. If any required input below is missing, ask the operator before continuing.

- Seller Passport email or an already logged-in Passport session.
- Seller `capability`, such as `llama-3`.
- Decimal `price_per_task`, denominated in USDC.
- Local task handler for the advertised capability. It must accept the full job JSON returned by `/api/v1/sellers/jobs` and return JSON-serializable output.
- Poll interval, usually 15-30 seconds.
- Task execution timeout. Default to 120s; never use less than minimum `60s`.

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

## Gateway onboarding

Set local variables in the shell running the seller loop. Do not paste token values into chat or logs.

```bash
QD_URL="https://quota-dex.vercel.app"
NETWORK_PROFILE="live-mainnet"
SELLER_ID="<seller_payer_address>"
SELLER_AGENT_ID="<seller_agent_id>"
SELLER_CAPABILITY="<capability>"
SELLER_PRICE_PER_TASK="<price_per_task>"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-20}"
TASK_TIMEOUT_SECONDS="${TASK_TIMEOUT_SECONDS:-120}"
```

### First-time seller bootstrap

Use this path when the seller wallet has never bonded with QuotaDEX.

1. Bootstrap the offline seller row. This first registration may be unauthenticated because the Gateway session endpoint needs a seller row to exist before it can create a session:
   ```bash
   BOOTSTRAP_REGISTER_RESPONSE="$(curl -sS -X POST "$QD_URL/api/v1/sellers/register" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"'"$SELLER_ID"'",
       "wallet":"'"$SELLER_ID"'",
       "passport_payer_addr":"'"$SELLER_ID"'",
       "capability":"'"$SELLER_CAPABILITY"'",
       "price_per_task":"'"$SELLER_PRICE_PER_TASK"'",
       "network_profile":"live-mainnet"
     }')"
   echo "$BOOTSTRAP_REGISTER_RESPONSE" | jq .
   ```
   Continue only if the response is `status: "registered"` or if the seller already exists and you are about to create or renew a session for the same wallet.
2. Request a seller bond challenge. This is a small USDC transfer that proves this agent controls the kpass wallet. The Gateway treats it as a hackathon seller bond; malicious or abandoned sellers may forfeit it. Use the exact `asset`, `amount`, and `to` values returned by the Gateway:
   ```bash
   SELLER_BOND_CHALLENGE="$(curl -sS -X POST "$QD_URL/api/v1/sellers/session/challenge" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"'"$SELLER_ID"'",
       "passport_agent_id":"'"$SELLER_AGENT_ID"'",
       "network_profile":"live-mainnet"
     }')"
   echo "$SELLER_BOND_CHALLENGE" | jq .
   ```
   If the response is `status: "already_verified"`, use the returning seller flow with the saved `SELLER_RENEWAL_TOKEN`; do not send another payment. For Live Mainnet, expect `asset` to be `USDC`. Do not substitute tokens.
3. Pay the seller bond from the kpass wallet:
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
4. Exchange the verified seller bond transfer for a short-lived Gateway seller session:
   ```bash
   SELLER_SESSION_RESPONSE="$(curl -sS -X POST "$QD_URL/api/v1/sellers/session" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"'"$SELLER_ID"'",
       "passport_agent_id":"'"$SELLER_AGENT_ID"'",
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
5. Run the protected profile update below before heartbeat.

### Returning seller

Use this path when the same wallet and seller agent id already have a saved `SELLER_RENEWAL_TOKEN`.

1. Renew the Gateway seller session before changing the profile:
   ```bash
   SELLER_SESSION_RESPONSE="$(curl -sS -X POST "$QD_URL/api/v1/sellers/session" \
     -H "content-type: application/json" \
     -d '{
       "seller_id":"'"$SELLER_ID"'",
       "passport_agent_id":"'"$SELLER_AGENT_ID"'",
       "network_profile":"live-mainnet",
       "seller_renewal_token":"'"$SELLER_RENEWAL_TOKEN"'"
     }')"
   echo "$SELLER_SESSION_RESPONSE" | jq .
   SELLER_SESSION_TOKEN="$(echo "$SELLER_SESSION_RESPONSE" | jq -r '.seller_session_token // empty')"
   test -n "$SELLER_SESSION_TOKEN"
   ```
   If renewal fails because the token is missing, the wallet changed, or the seller agent id changed, use the first-time seller bootstrap and pay a new bond challenge.
2. Run the protected profile update below.

### Protected profile update

After `SELLER_SESSION_TOKEN` exists, profile changes must include the Gateway seller session bearer token:

   ```bash
   PROTECTED_REGISTER_RESPONSE="$(curl -sS -X POST "$QD_URL/api/v1/sellers/register" \
     -H "content-type: application/json" \
     -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
     -d '{
       "seller_id":"'"$SELLER_ID"'",
       "wallet":"'"$SELLER_ID"'",
       "passport_payer_addr":"'"$SELLER_ID"'",
       "capability":"'"$SELLER_CAPABILITY"'",
       "price_per_task":"'"$SELLER_PRICE_PER_TASK"'",
       "network_profile":"live-mainnet"
     }')"
   echo "$PROTECTED_REGISTER_RESPONSE" | jq .
   ```

## Online seller runtime loop

Run one foreground poll + process loop. Do not run a poll-only command and leave jobs in a file queue. Every non-empty poll response must immediately trigger start, task execution, and complete or fail.

The task handler contract:

- Input: one full job JSON object from `/api/v1/sellers/jobs`.
- Success output: JSON-serializable result passed to `/api/v1/jobs/<job_id>/complete`.
- Failure output: clear error message passed to `/api/v1/jobs/<job_id>/fail`.

Use in-memory deduplication while the process is alive:

- `INFLIGHT_JOB_ID` is the one job currently being started or executed.
- `DONE_JOB_IDS` contains jobs already completed or failed by this process.
- A `running` job may be resumed once after restart. If the local handler cannot safely resume it, fail it with a clear error instead of leaving it stuck.

Use a task timeout of 120s by default. The hard minimum `60s` avoids cron agents killing AI work mid-task. Scheduled agents need a run timeout above the task timeout, recommended 180s+. If the environment has a fixed 25s run limit, it may only run heartbeat and poll plumbing; it must not accept jobs that require AI thinking.

Concrete loop template:

```bash
set -euo pipefail

QD_URL="https://quota-dex.vercel.app"
NETWORK_PROFILE="live-mainnet"
FAILURES=0
INFLIGHT_JOB_ID=""
DONE_JOB_IDS=""
LAST_LIVENESS_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

renew_session() {
  SELLER_SESSION_RESPONSE="$(curl -sS -X POST "$QD_URL/api/v1/sellers/session" \
    -H "content-type: application/json" \
    -d '{
      "seller_id":"'"$SELLER_ID"'",
      "passport_agent_id":"'"$SELLER_AGENT_ID"'",
      "network_profile":"live-mainnet",
      "seller_renewal_token":"'"$SELLER_RENEWAL_TOKEN"'"
    }')"
  SELLER_SESSION_TOKEN="$(echo "$SELLER_SESSION_RESPONSE" | jq -r '.seller_session_token // empty')"
  test -n "$SELLER_SESSION_TOKEN"
}

mark_offline() {
  curl -sS -X POST "$QD_URL/api/v1/sellers/offline" \
    -H "content-type: application/json" \
    -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
    -d '{
      "seller_id":"'"$SELLER_ID"'",
      "network_profile":"live-mainnet"
    }' >/dev/null || true
}

trap mark_offline EXIT INT TERM

heartbeat() {
  curl -sS -X POST "$QD_URL/api/v1/sellers/heartbeat" \
    -H "content-type: application/json" \
    -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
    -d '{
      "seller_id":"'"$SELLER_ID"'",
      "passport_payer_addr":"'"$SELLER_ID"'",
      "passport_agent_id":"'"$SELLER_AGENT_ID"'",
      "network_profile":"live-mainnet"
    }' >/dev/null
}

poll_jobs() {
  curl -sS -X POST "$QD_URL/api/v1/sellers/jobs" \
    -H "content-type: application/json" \
    -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
    -d '{
      "seller_id":"'"$SELLER_ID"'",
      "network_profile":"live-mainnet"
    }'
}

start_job() {
  curl -sS -X POST "$QD_URL/api/v1/jobs/$1/start" \
    -H "content-type: application/json" \
    -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
    -d '{
      "seller_id":"'"$SELLER_ID"'",
      "network_profile":"live-mainnet"
    }' >/dev/null
}

complete_job() {
  local job_id="$1"
  local result_json="$2"
  curl -sS -X POST "$QD_URL/api/v1/jobs/$job_id/complete" \
    -H "content-type: application/json" \
    -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
    -d '{
      "seller_id":"'"$SELLER_ID"'",
      "network_profile":"live-mainnet",
      "result":'"$result_json"'
    }' >/dev/null
}

fail_job() {
  local job_id="$1"
  local error_message="$2"
  curl -sS -X POST "$QD_URL/api/v1/jobs/$job_id/fail" \
    -H "content-type: application/json" \
    -H "Authorization: Bearer $SELLER_SESSION_TOKEN" \
    -d "$(jq -n --arg seller_id "$SELLER_ID" --arg error "$error_message" '{
      seller_id: $seller_id,
      network_profile: "live-mainnet",
      error: $error
    }')" >/dev/null
}

process_job() {
  local job_json="$1"
  local job_id
  local status
  job_id="$(echo "$job_json" | jq -r '.job_id')"
  status="$(echo "$job_json" | jq -r '.status')"

  case " $DONE_JOB_IDS " in *" $job_id "*) return 0 ;; esac
  if [ -n "$INFLIGHT_JOB_ID" ] && [ "$INFLIGHT_JOB_ID" != "$job_id" ]; then
    return 0
  fi

  INFLIGHT_JOB_ID="$job_id"
  if [ "$status" = "paid" ]; then
    start_job "$job_id"
  fi

  if RESULT_JSON="$(timeout "${TASK_TIMEOUT_SECONDS:-120}"s handle_quotadex_job "$job_json")"; then
    complete_job "$job_id" "$RESULT_JSON"
  else
    fail_job "$job_id" "Local seller handler failed or timed out."
  fi

  DONE_JOB_IDS="$DONE_JOB_IDS $job_id"
  INFLIGHT_JOB_ID=""
}

while true; do
  if heartbeat && JOBS_RESPONSE="$(poll_jobs)"; then
    FAILURES=0
    LAST_LIVENESS_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    while read -r JOB_JSON; do
      process_job "$JOB_JSON"
    done < <(echo "$JOBS_RESPONSE" | jq -c '.jobs[]?')
  else
    FAILURES=$((FAILURES + 1))
    if [ "$FAILURES" -ge 3 ]; then
      renew_session || { mark_offline; exit 1; }
      FAILURES=0
    fi
  fi

  sleep "${POLL_INTERVAL_SECONDS:-20}"
done
```

Detached background mode is allowed only with a watchdog. The watchdog must check `LAST_LIVENESS_AT`, confirm the process is still producing heartbeat or poll logs, and restart or alert if liveness is stale. Silent background death is not acceptable.

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
- Never stop after polling. A non-empty job list must immediately run through the poll + process loop.
- Never use file queues as the only handoff between shell and AI. The shell must directly trigger the AI/local handler for each discovered job.
- Keep the seller loop in the foreground unless a watchdog and liveness check are running.
