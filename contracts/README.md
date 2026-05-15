# Contracts

This directory holds the QuotaDEX on-chain escrow layer.

Current scope:

- `QuotaDEXEscrow.sol`
  - `registerFacilitatorPayment(paymentId, buyer, seller, amount, settlementTxHash)`
  - `release(paymentId)`
  - `refund(paymentId)`
  - `sweepNative(recipient, amount)`
  - `recoverUnsupportedToken(token, recipient, amount)`
  - `recoverExcessPaymentToken(recipient, amount)`
- `QuotaDEXEscrow.abi.json`
  - ABI used by Gateway settlement registration and execution

Assumptions:

- `paymentId` is the bytes32 form of the Gateway `payment_id`
- `payment_id` is currently the same value as the request `fingerprint`
- `payment_id` binds the request payload and `network_profile`, so Demo Testnet, Live Testnet, and Live Mainnet payments cannot be silently replayed across profiles
- `gateway` is a single EOA with payment registration, release, and refund permission
- `paymentToken` is constructor-configured and token-agnostic. The existing testnet deployment uses Test USDT for the one-click Demo route; the Live Mainnet deployment should use Kite Mainnet USDC.e.
- Standard x402 facilitator settlement transfers tokens to the escrow contract first; Gateway verifies that transfer off-chain and then registers the payment on-chain
- The guarded `direct-escrow` fallback uses the same receipt verification and registration path, but starts from a plain transfer tx hash when `X-PAYMENT` is temporarily unavailable and the selected network profile explicitly allows it
- The escrow contract does not need native KITE for gas. Gateway transactions consume gas from the Gateway EOA configured by `GATEWAY_PRIVATE_KEY`.
- Normal native KITE transfers to escrow are rejected. `sweepNative` exists only to recover native balance forced into the contract.
- `recoverExcessPaymentToken` can only move the configured payment token above `totalLiabilities`; it cannot withdraw funds backing registered payments.
- Live Dashboard should link escrow release/refund transaction hashes to the matching Kitescan network for auditability.

Test coverage:

- `tests/contracts/QuotaDEXEscrow.test.ts` compiles the Solidity source with `solc`
- tests run against a local `anvil` chain via `viem`
- covered paths: facilitator registration, duplicate guards, insufficient escrow balance, release, refund, native sweep, unsupported token recovery, excess payment-token recovery
