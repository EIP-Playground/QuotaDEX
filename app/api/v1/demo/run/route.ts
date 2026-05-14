import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  badRequestResponse,
  errorResponse,
  internalServerErrorResponse
} from "@/lib/errors";
import {
  accountFromDemoPrivateKey,
  assertDemoEscrowConfig,
  DemoChainError,
  transferDemoPaymentToEscrow
} from "@/lib/chain/demo";
import {
  executeEscrowGatewayAction,
  registerFacilitatorEscrowPayment,
  recoverExcessEscrowPaymentToken,
  toOnChainAmount,
  verifyFacilitatorSettlementReceipt
} from "@/lib/chain/escrow";
import { getServerEnv } from "@/lib/env";
import { buildFingerprint } from "@/lib/fingerprint";
import {
  getNetworkProfile,
  NetworkProfileConfigError
} from "@/lib/network-profiles";
import {
  buildQuoteContext,
  createSettlingJob,
  finalizeSettlingJobPayment,
  logJobEvent,
  recordJobPaymentTransition,
  setSellerIdleAfterExecution,
  updateJobStatusForSeller
} from "@/lib/jobs";
import { createRedisClient } from "@/lib/redis";
import {
  assertValidSellerCallbackSignature,
  buildSellerCallbackMessage
} from "@/lib/seller-callback-auth";
import { createServerSupabaseClient } from "@/lib/supabase";

type DemoRunBody = {
  capability: string;
  prompt: string;
};

class DemoConfigError extends Error {
  readonly code = "DEMO_CONFIG_MISSING";
}

const DEMO_RATE_LIMIT_DEFAULT = 3;
const DEMO_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

function readRequiredDemoPrivateKey(
  label: string,
  value: string | undefined
): string {
  if (!value || value.trim() === "") {
    throw new DemoConfigError(`${label} is required for the on-chain demo.`);
  }

  return value.trim();
}

function parseDemoRunBody(input: unknown): DemoRunBody {
  if (typeof input !== "object" || input === null) {
    throw new Error("Request body must be a JSON object.");
  }

  const record = input as Record<string, unknown>;
  const capability = typeof record.capability === "string"
    ? record.capability.trim()
    : "";
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";

  if (!capability) {
    throw new Error("capability must be a non-empty string.");
  }

  if (!prompt) {
    throw new Error("prompt must be a non-empty string.");
  }

  if (prompt.length > 2_000) {
    throw new Error("prompt must be 2000 characters or fewer.");
  }

  return {
    capability,
    prompt
  };
}

function readDemoRateLimit(): number {
  const configuredLimit = Number.parseInt(
    process.env.DEMO_RATE_LIMIT ?? "",
    10
  );

  return Number.isFinite(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEMO_RATE_LIMIT_DEFAULT;
}

function getDemoRateLimitClientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function enforceDemoRateLimit(request: Request) {
  const limit = readDemoRateLimit();
  const redis = createRedisClient();
  const clientKey = getDemoRateLimitClientKey(request);
  const rateLimitKey = `quotadex:demo:run:${clientKey}`;
  const count = Number(await redis.incr(rateLimitKey));

  if (count === 1) {
    await redis.expire(rateLimitKey, DEMO_RATE_LIMIT_WINDOW_SECONDS);
  }

  if (count > limit) {
    return errorResponse(429, {
      error: "Demo run rate limit exceeded.",
      code: "DEMO_RATE_LIMITED",
      details: {
        limit,
        window_seconds: DEMO_RATE_LIMIT_WINDOW_SECONDS
      }
    });
  }

  return null;
}

async function registerDemoSeller(params: {
  sellerId: string;
  capability: string;
  pricePerTask: string;
}): Promise<void> {
  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("sellers").upsert(
    {
      id: params.sellerId,
      wallet_address: params.sellerId,
      passport_agent_id: "quotadex-demo-seller",
      passport_payer_addr: params.sellerId,
      approval_status: "approved",
      network_profile: "demo-testnet",
      capability: params.capability,
      price_per_task: params.pricePerTask,
      status: "busy",
      last_heartbeat_at: now,
      updated_at: now
    },
    {
      onConflict: "id,network_profile"
    }
  );

  if (error) {
    throw new Error(`Failed to register demo seller: ${error.message}`);
  }
}

async function signSellerCallback(params: {
  sellerPrivateKey: string;
  action: "start" | "complete";
  jobId: string;
  sellerId: string;
}) {
  const sellerAccount = accountFromDemoPrivateKey(params.sellerPrivateKey);
  const signedAt = new Date().toISOString();
  const message = buildSellerCallbackMessage({
    action: params.action,
    jobId: params.jobId,
    sellerId: params.sellerId,
    signedAt
  });
  const signature = await sellerAccount.signMessage({ message });

  return {
    signedAt,
    signature
  };
}

async function completeDemoJobWithRetry(params: {
  jobId: string;
  sellerId: string;
  result: unknown;
}) {
  try {
    return await updateJobStatusForSeller({
      jobId: params.jobId,
      sellerId: params.sellerId,
      expectedStatus: "running",
      nextStatus: "done",
      result: params.result
    });
  } catch (error) {
    console.error("Demo job completion update failed after release; retrying once", {
      jobId: params.jobId,
      sellerId: params.sellerId,
      reason: error instanceof Error ? error.message : "Unknown completion update error."
    });
  }

  return updateJobStatusForSeller({
    jobId: params.jobId,
    sellerId: params.sellerId,
    expectedStatus: "running",
    nextStatus: "done",
    result: params.result
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let demoRequest: DemoRunBody;

  try {
    demoRequest = parseDemoRunBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid demo request body.",
      "INVALID_REQUEST"
    );
  }

  let env: ReturnType<typeof getServerEnv>;
  let demoProfile: ReturnType<typeof getNetworkProfile>;

  try {
    env = getServerEnv();
    demoProfile = getNetworkProfile(env, "demo-testnet");
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for demo.",
      "GATEWAY_CONFIG_MISSING",
      {
        code: error instanceof NetworkProfileConfigError ? error.code : undefined,
        reason: error instanceof Error ? error.message : "Unknown config error."
      }
    );
  }

  if (demoProfile.network !== "kite-testnet" || demoProfile.chainId !== "2368") {
    return badRequestResponse(
      "The one-click chain demo only runs on Kite Testnet.",
      "DEMO_NETWORK_UNSUPPORTED"
    );
  }

  let buyerPrivateKey: string;
  let sellerPrivateKey: string;

  try {
    buyerPrivateKey = readRequiredDemoPrivateKey(
      "BUYER_PRIVATE_KEY",
      process.env.BUYER_PRIVATE_KEY
    );
    sellerPrivateKey = readRequiredDemoPrivateKey(
      "DEMO_SELLER_PRIVATE_KEY or SELLER_PRIVATE_KEY",
      process.env.DEMO_SELLER_PRIVATE_KEY || process.env.SELLER_PRIVATE_KEY
    );
  } catch (error) {
    return internalServerErrorResponse(
      "Missing private key configuration for demo.",
      "DEMO_CONFIG_MISSING",
      { reason: error instanceof Error ? error.message : "Unknown demo config error." }
    );
  }

  try {
    const rateLimitResponse = await enforceDemoRateLimit(request);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to check demo rate limit.",
      "DEMO_RATE_LIMIT_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown rate limit error." }
    );
  }

  let activeSellerId: string | null = null;
  let demoBuyerId: string | null = null;
  let settlingJobId: string | null = null;
  let registeredPaymentId: string | null = null;
  let demoAmountAtomic: string | null = null;
  let settlementTxHash: string | null = null;
  let escrowRegistered = false;
  let releaseTxHash: string | null = null;
  let compensationRefundTxHash: string | null = null;
  let compensationRecoveryTxHash: string | null = null;

  try {
    const buyerAccount = accountFromDemoPrivateKey(buyerPrivateKey);
    const sellerAccount = accountFromDemoPrivateKey(sellerPrivateKey);
    demoBuyerId = buyerAccount.address;
    const runId = randomUUID();
    const pricePerTask = process.env.DEMO_PRICE_PER_TASK?.trim() || "0.001";
    const tokenDecimals = Number.parseInt(demoProfile.paymentTokenDecimals, 10);
    const amountAtomic = toOnChainAmount(pricePerTask, tokenDecimals).toString();
    demoAmountAtomic = amountAtomic;
    const promptForFingerprint = `${demoRequest.prompt}\n\n[QuotaDEX demo run: ${runId}]`;
    const fingerprint = buildFingerprint(
      {
        buyerId: buyerAccount.address,
        capability: demoRequest.capability,
        prompt: promptForFingerprint,
        networkProfile: "demo-testnet"
      },
      env.GATEWAY_SALT
    );
    const quoteContext = buildQuoteContext({
      payment_id: fingerprint,
      fingerprint,
      buyer_id: buyerAccount.address,
      seller_id: sellerAccount.address,
      seller_reserved_at: new Date().toISOString(),
      capability: demoRequest.capability,
      amount: pricePerTask,
      amount_atomic: amountAtomic,
      currency: demoProfile.paymentCurrency,
      payment_mode: "x402-escrow",
      payment_asset: demoProfile.paymentAssetAddress,
      pay_to: demoProfile.escrowContractAddress,
      network_profile: "demo-testnet",
      network: demoProfile.network,
      chain_id: demoProfile.chainId
    });
    const verifyRequest = {
      fingerprint,
      tx_hash: null,
      payload: {
        buyer_id: buyerAccount.address,
        capability: demoRequest.capability,
        prompt: promptForFingerprint,
        demo_run_id: runId,
        demo_payment_mode: "demo-direct-escrow" as const
      }
    };

    await assertDemoEscrowConfig({
      rpcUrl: demoProfile.rpcUrl,
      escrowAddress: demoProfile.escrowContractAddress,
      paymentTokenAddress: demoProfile.paymentAssetAddress,
      gatewayPrivateKey: demoProfile.gatewayPrivateKey
    });

    await registerDemoSeller({
      sellerId: sellerAccount.address,
      capability: demoRequest.capability,
      pricePerTask
    });
    activeSellerId = sellerAccount.address;

    const settlingJob = await createSettlingJob({
      verifyRequest,
      quoteContext
    });
    settlingJobId = settlingJob.id;
    const settlement = await transferDemoPaymentToEscrow({
      buyerPrivateKey,
      rpcUrl: demoProfile.rpcUrl,
      tokenAddress: demoProfile.paymentAssetAddress,
      escrowAddress: demoProfile.escrowContractAddress,
      amountAtomic
    });
    settlementTxHash = settlement.txHash;

    await verifyFacilitatorSettlementReceipt({
      txHash: settlement.txHash,
      paymentId: quoteContext.payment_id,
      buyerId: buyerAccount.address,
      amountAtomic,
      rpcUrl: demoProfile.rpcUrl,
      tokenAddress: demoProfile.paymentAssetAddress,
      escrowAddress: demoProfile.escrowContractAddress
    });

    const escrowRegistration = await registerFacilitatorEscrowPayment({
      paymentId: quoteContext.payment_id,
      buyerId: buyerAccount.address,
      sellerId: sellerAccount.address,
      amountAtomic,
      settlementTxHash: settlement.txHash,
      rpcUrl: demoProfile.rpcUrl,
      escrowAddress: demoProfile.escrowContractAddress,
      gatewayPrivateKey: demoProfile.gatewayPrivateKey
    });
    registeredPaymentId = quoteContext.payment_id;
    escrowRegistered = true;

    const paidJob = await finalizeSettlingJobPayment({
      jobId: settlingJob.id,
      verifyRequest,
      quoteContext,
      txHash: settlement.txHash,
      payment: {
        mode: "x402-escrow",
        settlementTxHash: settlement.txHash,
        escrowRegistrationTxHash: escrowRegistration.txHash,
        buyerWalletAddress: buyerAccount.address,
        sellerWalletAddress: sellerAccount.address,
        escrowContractAddress: demoProfile.escrowContractAddress
      }
    });

    if (!paidJob) {
      throw new Error("Demo paid job could not be finalized.");
    }

    const startSignature = await signSellerCallback({
      sellerPrivateKey,
      action: "start",
      jobId: paidJob.id,
      sellerId: sellerAccount.address
    });
    await assertValidSellerCallbackSignature({
      action: "start",
      jobId: paidJob.id,
      sellerId: sellerAccount.address,
      signature: startSignature.signature,
      signedAt: startSignature.signedAt,
      rpcUrl: demoProfile.rpcUrl
    });
    const runningJob = await updateJobStatusForSeller({
      jobId: paidJob.id,
      sellerId: sellerAccount.address,
      expectedStatus: "paid",
      nextStatus: "running"
    });

    if (!runningJob) {
      throw new Error("Demo job could not be started.");
    }

    const completeSignature = await signSellerCallback({
      sellerPrivateKey,
      action: "complete",
      jobId: paidJob.id,
      sellerId: sellerAccount.address
    });
    await assertValidSellerCallbackSignature({
      action: "complete",
      jobId: paidJob.id,
      sellerId: sellerAccount.address,
      signature: completeSignature.signature,
      signedAt: completeSignature.signedAt,
      rpcUrl: demoProfile.rpcUrl
    });
    const release = await executeEscrowGatewayAction({
      action: "release",
      paymentId: quoteContext.payment_id,
      rpcUrl: demoProfile.rpcUrl,
      escrowAddress: demoProfile.escrowContractAddress,
      gatewayPrivateKey: demoProfile.gatewayPrivateKey
    });
    releaseTxHash = release.txHash;

    await recordJobPaymentTransition({
      jobId: paidJob.id,
      paymentStatus: "released",
      releaseTxHash: release.txHash
    });

    const result = {
      text: `[Demo result] ${demoRequest.capability} processed the prompt and Gateway released ${pricePerTask} ${demoProfile.paymentCurrency} to the seller on Kite Testnet.`,
      meta: {
        job_id: paidJob.id,
        completed_at: new Date().toISOString(),
        run_id: runId,
        release_tx_hash: release.txHash
      }
    };
    const completedJob = await completeDemoJobWithRetry({
      jobId: paidJob.id,
      sellerId: sellerAccount.address,
      result
    });

    if (!completedJob) {
      throw new Error("Demo job could not be completed.");
    }

    await setSellerIdleAfterExecution(sellerAccount.address, "demo-testnet");
    await logJobEvent({
      jobId: paidJob.id,
      networkProfile: "demo-testnet",
      type: "DEMO_DONE",
      message: `Demo run ${runId} completed and released payment ${quoteContext.payment_id}.`
    });

    return NextResponse.json({
      status: "done",
      payment_mode: "demo-direct-escrow",
      run_id: runId,
      quote: {
        payment_id: quoteContext.payment_id,
        fingerprint,
        buyer_id: buyerAccount.address,
        seller_id: sellerAccount.address,
        network_profile: "demo-testnet",
        pay_to: demoProfile.escrowContractAddress,
        amount: pricePerTask,
        amount_atomic: amountAtomic,
        currency: demoProfile.paymentCurrency,
        payment_asset: demoProfile.paymentAssetAddress,
        network: demoProfile.network,
        chain_id: demoProfile.chainId
      },
      payment: {
        settlement_tx_hash: settlement.txHash,
        escrow_registration_tx_hash: escrowRegistration.txHash,
        release_tx_hash: release.txHash
      },
      seller_callbacks: {
        start_signed_at: startSignature.signedAt,
        complete_signed_at: completeSignature.signedAt
      },
      job: {
        job_id: completedJob.id,
        status: completedJob.status,
        result: completedJob.result
      },
      explorer: {
        escrow: `${demoProfile.explorerUrl}/address/${demoProfile.escrowContractAddress}`,
        settlement: `${demoProfile.explorerUrl}/tx/${settlement.txHash}`,
        escrow_registration: `${demoProfile.explorerUrl}/tx/${escrowRegistration.txHash}`,
        release: `${demoProfile.explorerUrl}/tx/${release.txHash}`
      }
    });
  } catch (error) {
    if (escrowRegistered && !releaseTxHash && registeredPaymentId) {
      try {
        const refund = await executeEscrowGatewayAction({
          action: "refund",
          paymentId: registeredPaymentId,
          rpcUrl: demoProfile.rpcUrl,
          escrowAddress: demoProfile.escrowContractAddress,
          gatewayPrivateKey: demoProfile.gatewayPrivateKey
        });
        compensationRefundTxHash = refund.txHash;

        if (settlingJobId) {
          await recordJobPaymentTransition({
            jobId: settlingJobId,
            paymentStatus: "refunded",
            refundTxHash: refund.txHash
          });
        }
      } catch (refundError) {
        console.error("Failed to refund registered demo escrow payment", {
          paymentId: registeredPaymentId,
          jobId: settlingJobId,
          reason:
            refundError instanceof Error
              ? refundError.message
              : "Unknown escrow refund error."
        });
      }
    } else if (
      settlementTxHash &&
      !escrowRegistered &&
      demoBuyerId &&
      demoAmountAtomic
    ) {
      try {
        const recovery = await recoverExcessEscrowPaymentToken({
          recipientAddress: demoBuyerId,
          amountAtomic: demoAmountAtomic,
          rpcUrl: demoProfile.rpcUrl,
          escrowAddress: demoProfile.escrowContractAddress,
          gatewayPrivateKey: demoProfile.gatewayPrivateKey
        });
        compensationRecoveryTxHash = recovery.txHash;
      } catch (recoveryError) {
        console.error("Failed to recover unregistered demo escrow token balance", {
          settlementTxHash,
          buyerId: demoBuyerId,
          amountAtomic: demoAmountAtomic,
          reason:
            recoveryError instanceof Error
              ? recoveryError.message
              : "Unknown escrow recovery error."
        });
      }
    }

    if (activeSellerId) {
      try {
        await setSellerIdleAfterExecution(activeSellerId, "demo-testnet");
      } catch (sellerError) {
        console.error("Failed to release demo seller after failed run", {
          sellerId: activeSellerId,
          reason:
            sellerError instanceof Error
              ? sellerError.message
              : "Unknown seller release error."
        });
      }
    }

    const details =
      error instanceof DemoChainError
        ? { reason: error.message, code: error.code }
        : {
            reason:
              error instanceof Error ? error.message : "Unknown demo run error."
          };

    return internalServerErrorResponse(
      "Failed to run the on-chain demo.",
      "DEMO_RUN_FAILED",
      {
        ...details,
        settlement_tx_hash: settlementTxHash,
        compensation_refund_tx_hash: compensationRefundTxHash,
        compensation_recovery_tx_hash: compensationRecoveryTxHash
      }
    );
  }
}
