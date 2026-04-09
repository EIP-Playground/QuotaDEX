# Contracts

This directory holds the QuotaDEX on-chain escrow layer.

Current scope:

- `QuotaDEXEscrow.sol`
  - `deposit(paymentId, seller, amount)`
  - `release(paymentId)`
  - `refund(paymentId)`
- `QuotaDEXEscrow.abi.json`
  - minimal ABI for buyer demo and later Gateway receipt verification

MVP assumptions:

- `paymentId` is the bytes32 form of the Gateway `payment_id`
- `payment_id` is currently the same value as the request `fingerprint`
- `gateway` is a single EOA with release/refund permission
- `paymentToken` is the PYUSD token contract

What is not in place yet:

- deployment toolchain
- contract tests
- ABI export
- receipt verification wired into the Gateway
