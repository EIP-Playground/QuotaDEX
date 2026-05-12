import {
  createPublicClient,
  http,
  isAddress,
  type Address,
  type Hex,
  verifyMessage
} from "viem";

export type SellerCallbackAction = "start" | "complete" | "fail";

export class SellerCallbackSignatureError extends Error {
  readonly code = "SELLER_SIGNATURE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "SellerCallbackSignatureError";
  }
}

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

export function buildSellerCallbackMessage(params: {
  action: SellerCallbackAction;
  jobId: string;
  sellerId: string;
  signedAt: string;
}): string {
  return [
    "QuotaDEX Seller Callback",
    `action: ${params.action}`,
    `job_id: ${params.jobId}`,
    `seller_id: ${params.sellerId}`,
    `signed_at: ${params.signedAt}`
  ].join("\n");
}

export async function assertValidSellerCallbackSignature(params: {
  action: SellerCallbackAction;
  jobId: string;
  sellerId: string;
  signature?: string;
  signedAt?: string;
  rpcUrl: string;
  now?: Date;
}): Promise<void> {
  if (!params.signature || !params.signedAt) {
    throw new SellerCallbackSignatureError(
      "Seller callback must include seller_signature and seller_signed_at."
    );
  }

  if (!isAddress(params.sellerId)) {
    throw new SellerCallbackSignatureError("seller_id must be a valid EVM address.");
  }

  if (!/^0x[a-fA-F0-9]+$/.test(params.signature)) {
    throw new SellerCallbackSignatureError("seller_signature must be a hex signature.");
  }

  const signedAtMs = Date.parse(params.signedAt);

  if (Number.isNaN(signedAtMs)) {
    throw new SellerCallbackSignatureError("seller_signed_at must be an ISO timestamp.");
  }

  const nowMs = (params.now ?? new Date()).getTime();

  if (signedAtMs < nowMs - MAX_SIGNATURE_AGE_MS) {
    throw new SellerCallbackSignatureError("seller_signature has expired.");
  }

  if (signedAtMs > nowMs + MAX_CLOCK_SKEW_MS) {
    throw new SellerCallbackSignatureError("seller_signature timestamp is in the future.");
  }

  const message = buildSellerCallbackMessage({
    action: params.action,
    jobId: params.jobId,
    sellerId: params.sellerId,
    signedAt: params.signedAt
  });

  const address = params.sellerId as Address;
  const signature = params.signature as Hex;

  try {
    const eoaVerified = await verifyMessage({
      address,
      message,
      signature
    });

    if (eoaVerified) {
      return;
    }
  } catch {
    // Fall through to universal smart-account verification.
  }

  try {
    const client = createPublicClient({
      transport: http(params.rpcUrl)
    });
    const verified = await client.verifyMessage({
      address,
      message,
      signature
    });

    if (!verified) {
      throw new SellerCallbackSignatureError("seller_signature does not match seller_id.");
    }
  } catch (error) {
    if (error instanceof SellerCallbackSignatureError) {
      throw error;
    }

    throw new SellerCallbackSignatureError(
      error instanceof Error
        ? `Seller signature verification failed: ${error.message}`
        : "Seller signature verification failed."
    );
  }
}
