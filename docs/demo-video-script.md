# QuotaDEX Demo Video Script

## Goal

Show a complete Agent-to-Agent paid compute task that settles on Kite chain, with enough UI and Kitescan evidence for hackathon judging.

Primary recording path: public Vercel app at `https://quota-dex.vercel.app`, starting from `/demo` for the controlled Kite Testnet proof and `/marketplace` for Live Dashboard auditability.

## Preconditions

- Vercel production env has Supabase service access: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Vercel production env has Redis access for quote/demo state: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Vercel production env has Gateway config: `GATEWAY_SALT`, `GATEWAY_PUBLIC_BASE_URL=https://quota-dex.vercel.app`, `GATEWAY_PRIVATE_KEY`, `ALLOW_MOCK_PAYMENTS=false`.
- Vercel production env has Kite Testnet payment config: `KITE_NETWORK=kite-testnet`, `KITE_CHAIN_ID=2368`, `KITE_RPC_URL`, `KITE_EXPLORER_URL`, `KITE_PAYMENT_ASSET_ADDRESS`, `PAYMENT_TOKEN_DECIMALS=18`, `PAYMENT_CURRENCY=USDT`, `ESCROW_CONTRACT_ADDRESS`.
- Vercel production env has Live Mainnet profile config if showing real-agent mainnet: `LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS`, `LIVE_MAINNET_PAYMENT_ASSET_ADDRESS`, `LIVE_MAINNET_PAYMENT_CURRENCY=USDC`, `LIVE_MAINNET_PAYMENT_TOKEN_DECIMALS=6`, `LIVE_MAINNET_KITE_RPC_URL`, `LIVE_MAINNET_KITE_EXPLORER_URL`.
- Vercel production env has demo wallets: `BUYER_PRIVATE_KEY` and `DEMO_SELLER_PRIVATE_KEY` or `SELLER_PRIVATE_KEY`.
- Optional Vercel production env sets `DEMO_PRICE_PER_TASK` and `DEMO_RATE_LIMIT`.
- Buyer demo wallet has Kite Testnet gas and Test USDT.
- Gateway wallet has Kite Testnet gas.
- `ESCROW_CONTRACT_ADDRESS` points to the verified Kite Testnet escrow.
- For Live Mainnet demo, at least one Seller Agent is online for the exact capability you will buy, and `/api/v1/buyers/capabilities?network_profile=live-mainnet` returns that capability.

## Screen Flow A: Public Kite Testnet Demo

1. Open `https://quota-dex.vercel.app/demo`.
2. Show the header: `A2A Demo · Kite Testnet`.
3. Explain that this page runs a controlled server-side demo:
   - Buyer wallet sends Test USDT to Escrow.
   - Gateway validates the settlement transfer.
   - Gateway registers the payment in `QuotaDEXEscrow`.
   - Seller completes the job.
   - Gateway calls `Escrow.release`.
   - Seller receives Test USDT.
4. Select a capability, for example `llama-3`.
5. Enter a short prompt.
6. Click `Start Demo`.
7. Walk through the timeline:
   - `Check demo wallets`
   - `Register seller agent`
   - `Buyer pays Test USDT`
   - `Gateway registers escrow`
   - `Seller completes job`
   - `Escrow.release to seller`
8. Show the payment snapshot:
   - `payment_id`
   - `amount`
   - `currency`
   - `pay_to`
   - `asset`
   - `chain`
9. Show the job state:
   - `status = done`
   - `mode = demo-direct-escrow`
   - `release_tx`
10. Open the KiteScan transaction links:
    - Buyer Test USDT transfer to Escrow.
    - Gateway escrow registration.
    - Escrow release to Seller.

## Screen Flow B: Live Dashboard Attestation

1. Open `https://quota-dex.vercel.app/marketplace`.
2. Switch between Demo, Live Testnet, and Live Mainnet.
3. Show that selection persists after refresh.
4. In Live mode, point out:
   - real seller statuses: `offline`, `idle`, `reserved`, `busy`
   - top sellers by 24h released volume
   - recent settlements from released/refunded jobs
   - seller address links to Kitescan
   - settlement tx links to the selected network's Kitescan
5. If Live Mainnet seller inventory is empty, say that the controlled Testnet demo is the guaranteed public E2E proof and Live Mainnet requires an online seller for the selected capability.

## Optional Live Agent Clip

1. Open `skills/quotadex-seller/SKILL.md` and show the seller autonomy loop:
   - Passport setup
   - register seller
   - seller bond challenge
   - `kpass wallet send`
   - session token + renewal token
   - heartbeat
   - poll/process jobs
2. Open `skills/quotadex-buyer/SKILL.md` and show the buyer autonomy loop:
   - discover exact capabilities
   - quote
   - approve x402 payment
   - submit `X-PAYMENT`
   - direct escrow fallback only if operator explicitly allows it
   - poll final result

## Narration

QuotaDEX starts with a Buyer task. The Buyer Agent is not manually picking a Seller; it first discovers exact available capabilities, then the Gateway reserves an eligible Seller based on capability, price, and network profile.

In the controlled demo, the Buyer wallet sends Test USDT to the verified Escrow contract on Kite Testnet. The Gateway confirms the token transfer, registers the payment on-chain with a unique payment id and settlement transaction hash, then releases funds when the Seller completes the task.

In the real-agent path, the Buyer Agent uses Kite Passport/x402. The Gateway verifies and settles the `X-PAYMENT` through Pieverse, checks that the settlement transfer reached `QuotaDEXEscrow`, and registers that payment before creating the paid job. The Seller Agent uses a Passport-bound Gateway session backed by a small USDC bond, so callbacks are authenticated without raw private-key sharing.

The core point for judges: an autonomous buyer pays for work, an autonomous seller performs it, and settlement/refund decisions are recorded through Kite escrow transactions that can be audited in Kitescan.

## Judging Callouts

- **Agent Autonomy:** Buyer and Seller Skills document the minimal-human workflow.
- **Paid Actions:** `X-PAYMENT` is primary; direct escrow transfer is only a guarded fallback.
- **Production:** demo and dashboard are public on Vercel.
- **Kite Attestations:** show escrow registration and release/refund links on Kitescan.
- **Developer Experience:** README plus Skills make the demo reproducible.
