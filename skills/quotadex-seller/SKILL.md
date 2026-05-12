---
name: quotadex-seller
description: Use when a seller agent needs to register with QuotaDEX Gateway, receive jobs, and settle completion through Kite Agent Passport identity.
---

# QuotaDEX Seller

## Overview

Use this skill to register a seller agent with QuotaDEX Gateway, keep it online, receive assigned jobs, and report completion or failure.

## Prerequisites

- Kite Agent Passport is configured for the seller agent.
- The agent can call Kite Passport `get_payer_addr`.
- The seller has a local task handler for its advertised capability.
- The agent knows the QuotaDEX Gateway base URL.

## Workflow

1. Resolve seller identity:
   - Call `get_payer_addr`.
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

## Safety Rules

- Never register a wallet different from the Passport payer address.
- Never accept a job whose `seller_id` does not match the Passport payer address.
- Never reuse a seller callback signature across jobs, actions, or timestamps.
- Never call complete before local execution succeeds.
- Keep task output JSON-serializable.
