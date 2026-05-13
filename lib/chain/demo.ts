import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { escrowAbi, requireAddress } from "@/lib/chain/escrow";

const erc20DemoAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable"
  }
] as const;

export class DemoChainError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_DEMO_PRIVATE_KEY"
      | "INVALID_DEMO_ADDRESS"
      | "DEMO_ESCROW_GATEWAY_MISMATCH"
      | "DEMO_PAYMENT_TOKEN_MISMATCH"
      | "DEMO_BUYER_USDT_INSUFFICIENT"
      | "DEMO_TRANSFER_RECEIPT_FAILED"
  ) {
    super(message);
    this.name = "DemoChainError";
  }
}

function privateKeyToHex(privateKey: string): Hex {
  const normalized = privateKey.trim().startsWith("0x")
    ? privateKey.trim()
    : `0x${privateKey.trim()}`;

  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new DemoChainError(
      "Demo private key must be a 32-byte hex private key.",
      "INVALID_DEMO_PRIVATE_KEY"
    );
  }

  return normalized as Hex;
}

export function accountFromDemoPrivateKey(privateKey: string) {
  try {
    return privateKeyToAccount(privateKeyToHex(privateKey));
  } catch (error) {
    if (error instanceof DemoChainError) {
      throw error;
    }

    throw new DemoChainError(
      "Demo private key could not be decoded.",
      "INVALID_DEMO_PRIVATE_KEY"
    );
  }
}

export async function assertDemoEscrowConfig(params: {
  rpcUrl: string;
  escrowAddress: string;
  paymentTokenAddress: string;
  gatewayPrivateKey: string;
}): Promise<void> {
  let escrowAddress: Address;
  let paymentTokenAddress: Address;

  try {
    escrowAddress = requireAddress(params.escrowAddress, "ESCROW_CONTRACT_ADDRESS");
    paymentTokenAddress = requireAddress(
      params.paymentTokenAddress,
      "KITE_PAYMENT_ASSET_ADDRESS"
    );
  } catch (error) {
    throw new DemoChainError(
      error instanceof Error ? error.message : "Invalid demo contract address.",
      "INVALID_DEMO_ADDRESS"
    );
  }

  const gatewayAccount = accountFromDemoPrivateKey(params.gatewayPrivateKey);
  const publicClient = createPublicClient({
    transport: http(params.rpcUrl)
  });

  const [contractGateway, contractPaymentToken] = await Promise.all([
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "gateway"
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "paymentToken"
    })
  ]);

  if (
    typeof contractGateway !== "string" ||
    !isAddress(contractGateway) ||
    contractGateway.toLowerCase() !== gatewayAccount.address.toLowerCase()
  ) {
    throw new DemoChainError(
      "GATEWAY_PRIVATE_KEY does not match the deployed escrow gateway.",
      "DEMO_ESCROW_GATEWAY_MISMATCH"
    );
  }

  if (
    typeof contractPaymentToken !== "string" ||
    !isAddress(contractPaymentToken) ||
    contractPaymentToken.toLowerCase() !== paymentTokenAddress.toLowerCase()
  ) {
    throw new DemoChainError(
      "KITE_PAYMENT_ASSET_ADDRESS does not match the deployed escrow payment token.",
      "DEMO_PAYMENT_TOKEN_MISMATCH"
    );
  }
}

export async function transferDemoPaymentToEscrow(params: {
  buyerPrivateKey: string;
  rpcUrl: string;
  tokenAddress: string;
  escrowAddress: string;
  amountAtomic: string;
}): Promise<{ txHash: Hex }> {
  let tokenAddress: Address;
  let escrowAddress: Address;

  try {
    tokenAddress = requireAddress(params.tokenAddress, "KITE_PAYMENT_ASSET_ADDRESS");
    escrowAddress = requireAddress(params.escrowAddress, "ESCROW_CONTRACT_ADDRESS");
  } catch (error) {
    throw new DemoChainError(
      error instanceof Error ? error.message : "Invalid demo transfer address.",
      "INVALID_DEMO_ADDRESS"
    );
  }

  const amount = BigInt(params.amountAtomic);
  const buyerAccount = accountFromDemoPrivateKey(params.buyerPrivateKey);
  const publicClient = createPublicClient({
    transport: http(params.rpcUrl)
  });
  const walletClient = createWalletClient({
    account: buyerAccount,
    transport: http(params.rpcUrl)
  });

  const buyerBalance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20DemoAbi,
    functionName: "balanceOf",
    args: [buyerAccount.address]
  });

  if (buyerBalance < amount) {
    throw new DemoChainError(
      "Demo buyer wallet does not have enough Test USDT.",
      "DEMO_BUYER_USDT_INSUFFICIENT"
    );
  }

  const txHash = await walletClient.writeContract({
    chain: undefined,
    address: tokenAddress,
    abi: erc20DemoAbi,
    functionName: "transfer",
    args: [escrowAddress, amount]
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash
  });

  if (receipt.status !== "success") {
    throw new DemoChainError(
      "Demo buyer payment transfer did not succeed.",
      "DEMO_TRANSFER_RECEIPT_FAILED"
    );
  }

  return {
    txHash
  };
}
