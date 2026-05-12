---
name: quotadex-buyer
description: Use when a buyer agent needs to buy compute through QuotaDEX Gateway using Kite Agent Passport and x402 payment.
---

# QuotaDEX Buyer

## Overview

Use this skill to request a seller quote, approve x402 payment with Kite Agent Passport, and verify the paid job with QuotaDEX Gateway.

## Prerequisites

- Kite Agent Passport is configured for the buyer agent.
- The agent can call Kite Passport tools, including `get_payer_addr` and `approve_payment`.
- The agent knows the QuotaDEX Gateway base URL.

## Workflow

1. Resolve the buyer payer address with Kite Passport:
   - Call `get_payer_addr`.
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

## Safety Rules

- Never send Passport secrets, private keys, or service role keys to QuotaDEX.
- Reject a quote if `accepts[0].payTo` is not the escrow contract from the response.
- Reject a quote if `accepts[0].asset` does not match the expected Kite payment asset.
- Treat a missing `X-PAYMENT` header as a failed production payment flow.
