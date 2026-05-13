# QuotaDEX Demo Video Script

## Goal

Show a complete Kite Testnet happy path from Buyer payment to Seller payout using the verified `QuotaDEXEscrow` contract.

## Preconditions

- Vercel production env has Supabase service access: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Vercel production env has Redis access for quote/demo state: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Vercel production env has Gateway config: `GATEWAY_SALT`, `GATEWAY_PRIVATE_KEY`, `ALLOW_MOCK_PAYMENTS=false`.
- Vercel production env has Kite Testnet payment config: `KITE_NETWORK=kite-testnet`, `KITE_CHAIN_ID=2368`, `KITE_RPC_URL`, `KITE_EXPLORER_URL`, `KITE_PAYMENT_ASSET_ADDRESS`, `PAYMENT_TOKEN_DECIMALS=18`, `PAYMENT_CURRENCY=USDT`, `ESCROW_CONTRACT_ADDRESS`.
- Vercel production env has demo wallets: `BUYER_PRIVATE_KEY` and `DEMO_SELLER_PRIVATE_KEY` or `SELLER_PRIVATE_KEY`.
- Optional Vercel production env sets `DEMO_PRICE_PER_TASK` and `DEMO_RATE_LIMIT`.
- Buyer demo wallet has Kite Testnet gas and Test USDT.
- Gateway wallet has Kite Testnet gas.
- `ESCROW_CONTRACT_ADDRESS` points to the verified Kite Testnet escrow.

## Screen Flow

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

## Narration

QuotaDEX starts with a Buyer task. The Buyer is not manually picking a Seller; the Gateway chooses an available Seller based on capability and price.

The demo Buyer wallet sends Test USDT to the verified Escrow contract on Kite Testnet. The Gateway confirms the token transfer, then registers the payment on-chain with a unique payment id and settlement transaction hash.

Once the Seller completes the job, the Gateway calls `release(paymentId)` on `QuotaDEXEscrow`. The Escrow contract sends the Test USDT to the Seller wallet. The result is a complete Buyer-to-Seller paid execution path with on-chain proof.

## Real Agent Follow-Up

For the real agent environment, replace the controlled demo payment with Kite Passport/x402:

- Buyer Agent uses the Buyer Skill to request a quote, approve `accepts[0]`, and submit `X-PAYMENT`.
- Seller Agent uses the Seller Skill to register, heartbeat, receive jobs, sign callbacks, and submit completion.
- Gateway keeps the same escrow release/refund role.
