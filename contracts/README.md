# Contracts

This directory holds the QuotaDEX on-chain escrow layer.

Current scope:

- `QuotaDEXEscrow.sol`
  - `registerFacilitatorPayment(paymentId, buyer, seller, amount, settlementTxHash)`
  - `deposit(paymentId, seller, amount)`
  - `release(paymentId)`
  - `refund(paymentId)`
- `QuotaDEXEscrow.abi.json`
  - ABI used by Gateway receipt verification and settlement execution

Assumptions:

- `paymentId` is the bytes32 form of the Gateway `payment_id`
- `payment_id` is currently the same value as the request `fingerprint`
- `gateway` is a single EOA with payment registration, release, and refund permission
- `paymentToken` is the Kite payment token, currently Test USDT on Kite Testnet
- Standard x402 facilitator settlement transfers tokens to the escrow contract first; Gateway verifies that transfer off-chain and then registers the payment on-chain

Test coverage:

- `tests/contracts/QuotaDEXEscrow.test.ts` compiles the Solidity source with `solc`
- tests run against a local `anvil` chain via `viem`
- covered paths: facilitator registration, duplicate guards, insufficient escrow balance, release, refund
