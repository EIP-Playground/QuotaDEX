import { randomInt } from "node:crypto";
import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20TransferEventAbi, looksLikeOnChainTxHash } from "@/lib/chain/escrow";

export class SellerBondReceiptError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_TX_HASH"
      | "INVALID_SELLER_ADDRESS"
      | "INVALID_RECEIVER_ADDRESS"
      | "INVALID_TOKEN_ADDRESS"
      | "RECEIPT_NOT_FOUND"
      | "TX_NOT_SUCCESSFUL"
      | "TX_TOKEN_TRANSFER_MISSING"
      | "TX_TOKEN_TRANSFER_MISMATCH"
  ) {
    super(message);
    this.name = "SellerBondReceiptError";
  }
}

export type SellerBondChallengeConfig = {
  receiverAddress: Address;
  tokenAddress: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  amountAtomic: string;
  amountDisplay: string;
  expiresAt: Date;
};

type SellerBondEnv = {
  GATEWAY_PRIVATE_KEY: string;
  KITE_PAYMENT_ASSET_ADDRESS: string;
  PAYMENT_CURRENCY: string;
  PAYMENT_TOKEN_DECIMALS: string;
};

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];

  return value && value.trim() !== "" ? value.trim() : fallback;
}

function requireAddress(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a valid EVM address.`);
  }

  return getAddress(value);
}

function gatewayAddressFromPrivateKey(privateKey: string): Address {
  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

  return privateKeyToAccount(normalized as Hex).address;
}

export function createSellerBondChallengeConfig(
  env: SellerBondEnv,
  options: { now?: Date } = {}
): SellerBondChallengeConfig {
  const tokenDecimals = Number.parseInt(
    optionalEnv(
      "SELLER_BOND_TOKEN_DECIMALS",
      optionalEnv("PASSPORT_PROOF_TOKEN_DECIMALS", env.PAYMENT_TOKEN_DECIMALS)
    ),
    10
  );

  if (!Number.isFinite(tokenDecimals) || tokenDecimals < 0) {
    throw new Error("SELLER_BOND_TOKEN_DECIMALS must be a non-negative integer.");
  }

  const baseAmount = optionalEnv(
    "SELLER_BOND_AMOUNT",
    optionalEnv("PASSPORT_PROOF_AMOUNT", "0.01")
  );
  const baseAmountAtomic = parseUnits(baseAmount, tokenDecimals);
  const dustAtomic = BigInt(randomInt(1, 1000));
  const amountAtomic = baseAmountAtomic + dustAtomic;
  const receiverAddress = requireAddress(
    optionalEnv(
      "SELLER_BOND_RECEIVER_ADDRESS",
      optionalEnv(
        "PASSPORT_PROOF_RECEIVER_ADDRESS",
        gatewayAddressFromPrivateKey(env.GATEWAY_PRIVATE_KEY)
      )
    ),
    "SELLER_BOND_RECEIVER_ADDRESS"
  );
  const tokenAddress = requireAddress(
    optionalEnv(
      "SELLER_BOND_TOKEN_ADDRESS",
      optionalEnv("PASSPORT_PROOF_TOKEN_ADDRESS", env.KITE_PAYMENT_ASSET_ADDRESS)
    ),
    "SELLER_BOND_TOKEN_ADDRESS"
  );
  const tokenSymbol = optionalEnv(
    "SELLER_BOND_TOKEN_SYMBOL",
    optionalEnv("PASSPORT_PROOF_TOKEN_SYMBOL", env.PAYMENT_CURRENCY)
  );
  const now = options.now ?? new Date();

  return {
    receiverAddress,
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    amountAtomic: amountAtomic.toString(),
    amountDisplay: formatUnits(amountAtomic, tokenDecimals),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000)
  };
}

export async function verifySellerBondTransferReceipt(params: {
  txHash: string;
  sellerId: string;
  receiverAddress: string;
  tokenAddress: string;
  amountAtomic: string;
  rpcUrl: string;
}): Promise<void> {
  if (!looksLikeOnChainTxHash(params.txHash)) {
    throw new SellerBondReceiptError(
      "seller bond tx hash must be a 32-byte transaction hash.",
      "INVALID_TX_HASH"
    );
  }

  let sellerAddress: Address;
  let receiverAddress: Address;
  let tokenAddress: Address;

  try {
    sellerAddress = requireAddress(params.sellerId, "seller_id");
  } catch {
    throw new SellerBondReceiptError(
      "seller_id must be a valid EVM address.",
      "INVALID_SELLER_ADDRESS"
    );
  }

  try {
    receiverAddress = requireAddress(params.receiverAddress, "receiverAddress");
  } catch {
    throw new SellerBondReceiptError(
      "seller bond receiver must be a valid EVM address.",
      "INVALID_RECEIVER_ADDRESS"
    );
  }

  try {
    tokenAddress = requireAddress(params.tokenAddress, "tokenAddress");
  } catch {
    throw new SellerBondReceiptError(
      "seller bond token must be a valid EVM address.",
      "INVALID_TOKEN_ADDRESS"
    );
  }

  const expectedAmount = BigInt(params.amountAtomic);
  const client = createPublicClient({
    transport: http(params.rpcUrl)
  });

  let receipt;

  try {
    receipt = await client.getTransactionReceipt({
      hash: params.txHash as Hex
    });
  } catch {
    throw new SellerBondReceiptError(
      "Seller bond transfer receipt was not found on the configured RPC.",
      "RECEIPT_NOT_FOUND"
    );
  }

  if (receipt.status !== "success") {
    throw new SellerBondReceiptError(
      "Seller bond transfer receipt is not successful.",
      "TX_NOT_SUCCESSFUL"
    );
  }

  const decodedTransfers = receipt.logs
    .filter((log) => log.address.toLowerCase() === tokenAddress.toLowerCase())
    .flatMap((log) => {
      try {
        const decodedLog = decodeEventLog({
          abi: erc20TransferEventAbi,
          data: log.data,
          topics: log.topics
        });

        return decodedLog.eventName === "Transfer" ? [decodedLog] : [];
      } catch {
        return [];
      }
    });

  if (decodedTransfers.length === 0) {
    throw new SellerBondReceiptError(
      "Seller bond transaction did not emit a matching token Transfer.",
      "TX_TOKEN_TRANSFER_MISSING"
    );
  }

  const matchingTransfer = decodedTransfers.find((event) => {
    const args = event.args;

    return (
      args.from.toLowerCase() === sellerAddress.toLowerCase() &&
      args.to.toLowerCase() === receiverAddress.toLowerCase() &&
      args.value === expectedAmount
    );
  });

  if (!matchingTransfer) {
    throw new SellerBondReceiptError(
      "Seller bond transfer did not match the challenge receiver and amount.",
      "TX_TOKEN_TRANSFER_MISMATCH"
    );
  }
}
