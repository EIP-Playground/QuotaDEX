import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionData,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import escrowAbiJson from "@/contracts/QuotaDEXEscrow.abi.json";

export const DEFAULT_PAYMENT_TOKEN_DECIMALS = 18;

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

export const erc20TransferEventAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true
      },
      {
        name: "to",
        type: "address",
        indexed: true
      },
      {
        name: "value",
        type: "uint256",
        indexed: false
      }
    ]
  }
] as const;

export class InvalidEscrowReceiptError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_TX_HASH"
      | "INVALID_BUYER_ADDRESS"
      | "INVALID_SELLER_ADDRESS"
      | "RECEIPT_NOT_FOUND"
      | "TX_NOT_SUCCESSFUL"
      | "TX_TARGET_MISMATCH"
      | "TX_INPUT_MISMATCH"
      | "TX_PAYMENT_ID_MISMATCH"
      | "TX_SELLER_MISMATCH"
      | "TX_AMOUNT_MISMATCH"
      | "TX_BUYER_MISMATCH"
      | "TX_DEPOSIT_EVENT_MISSING"
      | "TX_DEPOSIT_EVENT_MISMATCH"
      | "TX_TOKEN_MISMATCH"
      | "TX_TOKEN_TRANSFER_MISSING"
      | "TX_TOKEN_TRANSFER_MISMATCH"
  ) {
    super(message);
    this.name = "InvalidEscrowReceiptError";
  }
}

export class EscrowGatewayActionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_GATEWAY_KEY"
      | "INVALID_ESCROW_ADDRESS"
      | "GATEWAY_ACTION_RECEIPT_FAILED"
  ) {
    super(message);
    this.name = "EscrowGatewayActionError";
  }
}

export function toPaymentIdBytes32(paymentId: string): Hex {
  const normalized = paymentId.startsWith("0x") ? paymentId : `0x${paymentId}`;

  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error("payment_id must be a 32-byte hex string.");
  }

  return normalized as Hex;
}

export function looksLikeOnChainTxHash(txHash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash.trim());
}

export function toOnChainAmount(
  amount: string,
  decimals = DEFAULT_PAYMENT_TOKEN_DECIMALS
): bigint {
  return parseUnits(amount, decimals);
}

export function requireAddress(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a valid EVM address.`);
  }

  return value;
}

export async function verifyEscrowDepositReceipt(params: {
  txHash: string;
  paymentId: string;
  buyerId: string;
  sellerId: string;
  amount: string;
  rpcUrl: string;
  escrowAddress: string;
  pyusdDecimals: number;
}): Promise<void> {
  if (!looksLikeOnChainTxHash(params.txHash)) {
    throw new InvalidEscrowReceiptError(
      "tx_hash must be a 32-byte transaction hash.",
      "INVALID_TX_HASH"
    );
  }

  let buyerAddress: Address;
  let sellerAddress: Address;
  let escrowAddress: Address;

  try {
    buyerAddress = requireAddress(params.buyerId, "buyer_id");
  } catch {
    throw new InvalidEscrowReceiptError(
      "buyer_id must be a valid EVM address for real receipt verification.",
      "INVALID_BUYER_ADDRESS"
    );
  }

  try {
    sellerAddress = requireAddress(params.sellerId, "seller_id");
  } catch {
    throw new InvalidEscrowReceiptError(
      "seller_id must be a valid EVM address for real receipt verification.",
      "INVALID_SELLER_ADDRESS"
    );
  }

  escrowAddress = requireAddress(params.escrowAddress, "ESCROW_CONTRACT_ADDRESS");

  const client = createPublicClient({
    transport: http(params.rpcUrl)
  });

  let receipt;

  try {
    receipt = await client.getTransactionReceipt({
      hash: params.txHash as Hex
    });
  } catch {
    throw new InvalidEscrowReceiptError(
      "Transaction receipt was not found on the configured RPC.",
      "RECEIPT_NOT_FOUND"
    );
  }

  if (receipt.status !== "success") {
    throw new InvalidEscrowReceiptError(
      "Transaction receipt is not successful.",
      "TX_NOT_SUCCESSFUL"
    );
  }

  const transaction = await client.getTransaction({
    hash: params.txHash as Hex
  });

  if (!transaction.to || transaction.to.toLowerCase() !== escrowAddress.toLowerCase()) {
    throw new InvalidEscrowReceiptError(
      "Transaction target does not match the configured Escrow contract.",
      "TX_TARGET_MISMATCH"
    );
  }

  const decoded = decodeFunctionData({
    abi: escrowAbi,
    data: transaction.input
  });

  if (decoded.functionName !== "deposit") {
    throw new InvalidEscrowReceiptError(
      "Transaction input is not an Escrow deposit call.",
      "TX_INPUT_MISMATCH"
    );
  }

  if (!decoded.args || decoded.args.length !== 3) {
    throw new InvalidEscrowReceiptError(
      "Transaction input does not contain the expected deposit arguments.",
      "TX_INPUT_MISMATCH"
    );
  }

  const [rawPaymentId, rawSeller, rawAmount] = decoded.args;

  if (
    typeof rawPaymentId !== "string" ||
    typeof rawSeller !== "string" ||
    typeof rawAmount !== "bigint"
  ) {
    throw new InvalidEscrowReceiptError(
      "Transaction input contains unexpected deposit argument types.",
      "TX_INPUT_MISMATCH"
    );
  }

  const txPaymentId = rawPaymentId;
  const txSeller = rawSeller;
  const txAmount = rawAmount;
  const expectedPaymentId = toPaymentIdBytes32(params.paymentId);
  const expectedAmount = toOnChainAmount(params.amount, params.pyusdDecimals);

  if (txPaymentId.toLowerCase() !== expectedPaymentId.toLowerCase()) {
    throw new InvalidEscrowReceiptError(
      "Transaction payment_id does not match the quote context.",
      "TX_PAYMENT_ID_MISMATCH"
    );
  }

  if (txSeller.toLowerCase() !== sellerAddress.toLowerCase()) {
    throw new InvalidEscrowReceiptError(
      "Transaction seller does not match the quote context.",
      "TX_SELLER_MISMATCH"
    );
  }

  if (txAmount !== expectedAmount) {
    throw new InvalidEscrowReceiptError(
      "Transaction amount does not match the quoted amount.",
      "TX_AMOUNT_MISMATCH"
    );
  }

  if (transaction.from.toLowerCase() !== buyerAddress.toLowerCase()) {
    throw new InvalidEscrowReceiptError(
      "Transaction sender does not match buyer_id.",
      "TX_BUYER_MISMATCH"
    );
  }

  const decodedDepositEvents = receipt.logs
    .filter((log) => log.address.toLowerCase() === escrowAddress.toLowerCase())
    .flatMap((log) => {
      try {
        const decodedLog = decodeEventLog({
          abi: escrowAbi,
          data: log.data,
          topics: log.topics
        });

        return decodedLog.eventName === "PaymentDeposited" ? [decodedLog] : [];
      } catch {
        return [];
      }
    });

  if (decodedDepositEvents.length === 0) {
    throw new InvalidEscrowReceiptError(
      "Escrow deposit event was not found in the transaction receipt.",
      "TX_DEPOSIT_EVENT_MISSING"
    );
  }

  const matchingEvent = decodedDepositEvents.find((event) => {
    const args = event.args;

    if (!args || args.length !== 4) {
      return false;
    }

    const [eventPaymentId, eventBuyer, eventSeller, eventAmount] = args;

    return (
      typeof eventPaymentId === "string" &&
      typeof eventBuyer === "string" &&
      typeof eventSeller === "string" &&
      typeof eventAmount === "bigint" &&
      eventPaymentId.toLowerCase() === expectedPaymentId.toLowerCase() &&
      eventBuyer.toLowerCase() === buyerAddress.toLowerCase() &&
      eventSeller.toLowerCase() === sellerAddress.toLowerCase() &&
      eventAmount === expectedAmount
    );
  });

  if (!matchingEvent) {
    throw new InvalidEscrowReceiptError(
      "Escrow deposit event payload does not match the expected payment data.",
      "TX_DEPOSIT_EVENT_MISMATCH"
    );
  }
}

export async function verifyFacilitatorSettlementReceipt(params: {
  txHash: string;
  paymentId: string;
  buyerId: string;
  amountAtomic: string;
  rpcUrl: string;
  tokenAddress: string;
  escrowAddress: string;
}): Promise<void> {
  if (!looksLikeOnChainTxHash(params.txHash)) {
    throw new InvalidEscrowReceiptError(
      "settlement tx hash must be a 32-byte transaction hash.",
      "INVALID_TX_HASH"
    );
  }

  let buyerAddress: Address;
  let tokenAddress: Address;
  let escrowAddress: Address;

  try {
    buyerAddress = requireAddress(params.buyerId, "buyer_id");
  } catch {
    throw new InvalidEscrowReceiptError(
      "buyer_id must be a valid EVM address for facilitator settlement verification.",
      "INVALID_BUYER_ADDRESS"
    );
  }

  try {
    tokenAddress = requireAddress(params.tokenAddress, "KITE_PAYMENT_ASSET_ADDRESS");
  } catch {
    throw new InvalidEscrowReceiptError(
      "KITE_PAYMENT_ASSET_ADDRESS must be a valid EVM address.",
      "TX_TOKEN_MISMATCH"
    );
  }

  escrowAddress = requireAddress(params.escrowAddress, "ESCROW_CONTRACT_ADDRESS");
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
    throw new InvalidEscrowReceiptError(
      "Facilitator settlement receipt was not found on the configured RPC.",
      "RECEIPT_NOT_FOUND"
    );
  }

  if (receipt.status !== "success") {
    throw new InvalidEscrowReceiptError(
      "Facilitator settlement receipt is not successful.",
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
    throw new InvalidEscrowReceiptError(
      `Facilitator settlement did not emit a token Transfer for payment ${params.paymentId}.`,
      "TX_TOKEN_TRANSFER_MISSING"
    );
  }

  const matchingTransfer = decodedTransfers.find((event) => {
    const args = event.args;

    return (
      args.from.toLowerCase() === buyerAddress.toLowerCase() &&
      args.to.toLowerCase() === escrowAddress.toLowerCase() &&
      args.value === expectedAmount
    );
  });

  if (!matchingTransfer) {
    throw new InvalidEscrowReceiptError(
      "Facilitator settlement token Transfer does not match buyer, escrow, or amount.",
      "TX_TOKEN_TRANSFER_MISMATCH"
    );
  }
}

export async function executeEscrowGatewayAction(params: {
  action: "release" | "refund";
  paymentId: string;
  rpcUrl: string;
  escrowAddress: string;
  gatewayPrivateKey: string;
}): Promise<{ txHash: Hex }> {
  let escrowAddress: Address;

  try {
    escrowAddress = requireAddress(params.escrowAddress, "ESCROW_CONTRACT_ADDRESS");
  } catch {
    throw new EscrowGatewayActionError(
      "ESCROW_CONTRACT_ADDRESS must be a valid EVM address.",
      "INVALID_ESCROW_ADDRESS"
    );
  }

  let account;

  try {
    account = privateKeyToAccount(
      params.gatewayPrivateKey.startsWith("0x")
        ? (params.gatewayPrivateKey as Hex)
        : (`0x${params.gatewayPrivateKey}` as Hex)
    );
  } catch {
    throw new EscrowGatewayActionError(
      "GATEWAY_PRIVATE_KEY is invalid.",
      "INVALID_GATEWAY_KEY"
    );
  }

  const paymentId = toPaymentIdBytes32(params.paymentId);
  const publicClient = createPublicClient({
    transport: http(params.rpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    transport: http(params.rpcUrl)
  });

  const txHash = await walletClient.writeContract({
    chain: undefined,
    address: escrowAddress,
    abi: escrowAbi,
    functionName: params.action,
    args: [paymentId]
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash
  });

  if (receipt.status !== "success") {
    throw new EscrowGatewayActionError(
      `Escrow ${params.action} transaction did not succeed.`,
      "GATEWAY_ACTION_RECEIPT_FAILED"
    );
  }

  return {
    txHash
  };
}

export async function registerFacilitatorEscrowPayment(params: {
  paymentId: string;
  buyerId: string;
  sellerId: string;
  amountAtomic: string;
  settlementTxHash: string;
  rpcUrl: string;
  escrowAddress: string;
  gatewayPrivateKey: string;
}): Promise<{ txHash: Hex }> {
  let escrowAddress: Address;
  let buyerAddress: Address;
  let sellerAddress: Address;

  try {
    escrowAddress = requireAddress(params.escrowAddress, "ESCROW_CONTRACT_ADDRESS");
    buyerAddress = requireAddress(params.buyerId, "buyer_id");
    sellerAddress = requireAddress(params.sellerId, "seller_id");
  } catch (error) {
    throw new EscrowGatewayActionError(
      error instanceof Error ? error.message : "Invalid escrow registration address.",
      "INVALID_ESCROW_ADDRESS"
    );
  }

  let account;

  try {
    account = privateKeyToAccount(
      params.gatewayPrivateKey.startsWith("0x")
        ? (params.gatewayPrivateKey as Hex)
        : (`0x${params.gatewayPrivateKey}` as Hex)
    );
  } catch {
    throw new EscrowGatewayActionError(
      "GATEWAY_PRIVATE_KEY is invalid.",
      "INVALID_GATEWAY_KEY"
    );
  }

  const paymentId = toPaymentIdBytes32(params.paymentId);
  const settlementTxHash = toPaymentIdBytes32(params.settlementTxHash);
  const amount = BigInt(params.amountAtomic);
  const publicClient = createPublicClient({
    transport: http(params.rpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    transport: http(params.rpcUrl)
  });

  const txHash = await walletClient.writeContract({
    chain: undefined,
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "registerFacilitatorPayment",
    args: [paymentId, buyerAddress, sellerAddress, amount, settlementTxHash]
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash
  });

  if (receipt.status !== "success") {
    throw new EscrowGatewayActionError(
      "Escrow facilitator registration transaction did not succeed.",
      "GATEWAY_ACTION_RECEIPT_FAILED"
    );
  }

  return {
    txHash
  };
}
