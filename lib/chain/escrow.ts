import { isAddress, parseUnits, type Address, type Hex } from "viem";
import escrowAbiJson from "@/contracts/QuotaDEXEscrow.abi.json";

export const DEFAULT_PYUSD_DECIMALS = 6;

export const escrowAbi = escrowAbiJson;

export const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "spender",
        type: "address"
      },
      {
        name: "value",
        type: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable"
  }
] as const;

export function toPaymentIdBytes32(paymentId: string): Hex {
  const normalized = paymentId.startsWith("0x") ? paymentId : `0x${paymentId}`;

  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error("payment_id must be a 32-byte hex string.");
  }

  return normalized as Hex;
}

export function toOnChainAmount(
  amount: string,
  decimals = DEFAULT_PYUSD_DECIMALS
): bigint {
  return parseUnits(amount, decimals);
}

export function requireAddress(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a valid EVM address.`);
  }

  return value;
}
