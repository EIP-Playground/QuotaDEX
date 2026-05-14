import { NextResponse } from "next/server";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse
} from "@/lib/errors";
import {
  decodeXPaymentHeader,
  FacilitatorRequestError,
  settleFacilitatorPayment,
  verifyFacilitatorPayment
} from "@/lib/chain/facilitator";
import {
  EscrowGatewayActionError,
  executeEscrowGatewayAction,
  InvalidEscrowReceiptError,
  looksLikeOnChainTxHash,
  registerFacilitatorEscrowPayment,
  verifyFacilitatorSettlementReceipt
} from "@/lib/chain/escrow";
import { getServerEnv } from "@/lib/env";
import { buildFingerprint } from "@/lib/fingerprint";
import {
  getNetworkProfile,
  NetworkProfileConfigError,
  type PaymentNetworkProfile
} from "@/lib/network-profiles";
import {
  createSettlingJob,
  deleteJob,
  deleteQuoteContext,
  DuplicateVerificationError,
  finalizeSettlingJobPayment,
  loadQuoteContext,
  markSellerBusyForPayment,
  parseVerifyRequestBody,
  setSellerIdleAfterExecution,
  verifyMockTxHash
} from "@/lib/jobs";
import { createServerSupabaseClient } from "@/lib/supabase";

class PaymentVerificationInputError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "PaymentVerificationInputError";
  }
}

type PaymentVerificationProgress = {
  settlementTxHash: string | null;
  escrowRegistered: boolean;
};

function quoteMatchesActiveNetworkProfile(
  quoteContext: NonNullable<Awaited<ReturnType<typeof loadQuoteContext>>>,
  networkProfile: PaymentNetworkProfile
): boolean {
  return (
    quoteContext.pay_to.toLowerCase() ===
      networkProfile.escrowContractAddress.toLowerCase() &&
    quoteContext.payment_asset.toLowerCase() ===
      networkProfile.paymentAssetAddress.toLowerCase() &&
    quoteContext.network === networkProfile.network &&
    quoteContext.chain_id === networkProfile.chainId
  );
}

function summarizeFacilitatorPayload(xPaymentHeader: string) {
  try {
    const payload = decodeXPaymentHeader(xPaymentHeader);

    return {
      authorizationKeys: Object.keys(payload.authorization ?? {}),
      hasSignature: typeof payload.signature === "string" && payload.signature.length > 0,
      network:
        typeof payload.network === "string" && payload.network.trim() !== ""
          ? payload.network.trim()
          : null
    };
  } catch {
    return {
      authorizationKeys: [],
      hasSignature: false,
      network: null
    };
  }
}

async function verifyPaymentForRequest(params: {
  txHash: string | null;
  xPaymentHeader: string | null;
  quoteContext: NonNullable<Awaited<ReturnType<typeof loadQuoteContext>>>;
  verifyRequest: ReturnType<typeof parseVerifyRequestBody>;
  env: ReturnType<typeof getServerEnv>;
  networkProfile: PaymentNetworkProfile;
  progress?: PaymentVerificationProgress;
}): Promise<{
  mode: "mock" | "x402-escrow" | "direct-escrow";
  resolvedTxHash: string | null;
  settlementTxHash?: string | null;
  escrowRegistrationTxHash?: string | null;
  buyerWalletAddress?: string | null;
  sellerWalletAddress?: string | null;
}> {
  if (params.xPaymentHeader) {
    console.info("Verify payment route selected", {
      mode: "facilitator",
      paymentId: params.quoteContext.payment_id,
      sellerId: params.quoteContext.seller_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      xPayment: summarizeFacilitatorPayload(params.xPaymentHeader)
    });

    const paymentPayload = decodeXPaymentHeader(params.xPaymentHeader);
    const verifyResponse = await verifyFacilitatorPayment({
      paymentPayload,
      baseUrl: params.networkProfile.facilitatorBaseUrl
    });

    console.info("Facilitator verify completed", {
      paymentId: params.quoteContext.payment_id,
      valid: verifyResponse.valid ?? null,
      responseKeys: Object.keys(verifyResponse)
    });

    if (verifyResponse.valid === false) {
      throw new FacilitatorRequestError(
        verifyResponse.error || "Facilitator verify rejected the payment.",
        "FACILITATOR_RESPONSE_INVALID",
        400,
        verifyResponse
      );
    }

    const settleResponse = await settleFacilitatorPayment({
      paymentPayload,
      baseUrl: params.networkProfile.facilitatorBaseUrl
    });

    console.info("Facilitator settle completed", {
      paymentId: params.quoteContext.payment_id,
      success: settleResponse.success ?? null,
      txHash:
        typeof settleResponse.txHash === "string" && settleResponse.txHash.trim() !== ""
          ? settleResponse.txHash.trim()
          : null,
      responseKeys: Object.keys(settleResponse)
    });

    if (settleResponse.success === false) {
      throw new FacilitatorRequestError(
        settleResponse.error || "Facilitator settle rejected the payment.",
        "FACILITATOR_RESPONSE_INVALID",
        400,
        settleResponse
      );
    }

    const settlementTxHash =
      typeof settleResponse.txHash === "string" && settleResponse.txHash.trim() !== ""
        ? settleResponse.txHash.trim()
        : null;

    if (!settlementTxHash) {
      throw new FacilitatorRequestError(
        "Facilitator settle response did not include a settlement transaction hash.",
        "FACILITATOR_RESPONSE_INVALID",
        400,
        settleResponse
      );
    }
    await verifyFacilitatorSettlementReceipt({
      txHash: settlementTxHash,
      paymentId: params.quoteContext.payment_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      amountAtomic: params.quoteContext.amount_atomic,
      rpcUrl: params.networkProfile.rpcUrl,
      tokenAddress: params.networkProfile.paymentAssetAddress,
      escrowAddress: params.networkProfile.escrowContractAddress
    });

    if (params.progress) {
      params.progress.settlementTxHash = settlementTxHash;
    }

    const escrowRegistration = await registerFacilitatorEscrowPayment({
      paymentId: params.quoteContext.payment_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      sellerId: params.quoteContext.seller_id,
      amountAtomic: params.quoteContext.amount_atomic,
      settlementTxHash,
      rpcUrl: params.networkProfile.rpcUrl,
      escrowAddress: params.networkProfile.escrowContractAddress,
      gatewayPrivateKey: params.networkProfile.gatewayPrivateKey
    });
    if (params.progress) {
      params.progress.escrowRegistered = true;
    }

    return {
      mode: "x402-escrow",
      resolvedTxHash: settlementTxHash,
      settlementTxHash,
      escrowRegistrationTxHash: escrowRegistration.txHash,
      buyerWalletAddress: params.verifyRequest.payload.buyer_id,
      sellerWalletAddress: params.quoteContext.seller_id
    };
  }

  if (params.networkProfile.allowMockPayments === "true") {
    if (!params.txHash) {
      throw new PaymentVerificationInputError(
        "tx_hash is required when X-PAYMENT is not provided.",
        "INVALID_TX_HASH"
      );
    }

    console.info("Verify payment route selected", {
      mode: "mock",
      paymentId: params.quoteContext.payment_id,
      sellerId: params.quoteContext.seller_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      txHash: params.txHash
    });

    verifyMockTxHash(params.txHash);

    return {
      mode: "mock",
      resolvedTxHash: params.txHash
    };
  }

  if (params.networkProfile.allowDirectEscrowPayments === "true") {
    if (!params.txHash) {
      throw new PaymentVerificationInputError(
        "tx_hash is required for direct escrow payment verification.",
        "INVALID_TX_HASH"
      );
    }

    console.info("Verify payment route selected", {
      mode: "direct-escrow",
      paymentId: params.quoteContext.payment_id,
      sellerId: params.quoteContext.seller_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      txHash: params.txHash
    });

    await verifyFacilitatorSettlementReceipt({
      txHash: params.txHash,
      paymentId: params.quoteContext.payment_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      amountAtomic: params.quoteContext.amount_atomic,
      rpcUrl: params.networkProfile.rpcUrl,
      tokenAddress: params.networkProfile.paymentAssetAddress,
      escrowAddress: params.networkProfile.escrowContractAddress
    });

    if (params.progress) {
      params.progress.settlementTxHash = params.txHash;
    }

    const escrowRegistration = await registerFacilitatorEscrowPayment({
      paymentId: params.quoteContext.payment_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      sellerId: params.quoteContext.seller_id,
      amountAtomic: params.quoteContext.amount_atomic,
      settlementTxHash: params.txHash,
      rpcUrl: params.networkProfile.rpcUrl,
      escrowAddress: params.networkProfile.escrowContractAddress,
      gatewayPrivateKey: params.networkProfile.gatewayPrivateKey
    });

    if (params.progress) {
      params.progress.escrowRegistered = true;
    }

    return {
      mode: "direct-escrow",
      resolvedTxHash: params.txHash,
      settlementTxHash: params.txHash,
      escrowRegistrationTxHash: escrowRegistration.txHash,
      buyerWalletAddress: params.verifyRequest.payload.buyer_id,
      sellerWalletAddress: params.quoteContext.seller_id
    };
  }

  throw new PaymentVerificationInputError(
    "X-PAYMENT header is required for production payment verification.",
    "X_PAYMENT_REQUIRED"
  );
}

export async function POST(request: Request) {
  const xPaymentHeader = request.headers.get("x-payment");
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let verifyRequest: ReturnType<typeof parseVerifyRequestBody>;

  try {
    verifyRequest = parseVerifyRequestBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid verify request body.",
      "INVALID_REQUEST"
    );
  }

  let env: ReturnType<typeof getServerEnv>;

  try {
    env = getServerEnv();
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for verify.",
      "GATEWAY_CONFIG_MISSING",
      { reason: error instanceof Error ? error.message : "Unknown config error." }
    );
  }

  const requestedNetworkProfile =
    verifyRequest.payload.network_profile ?? "live-mainnet";
  const recomputedFingerprint = buildFingerprint(
    {
      buyerId: verifyRequest.payload.buyer_id,
      capability: verifyRequest.payload.capability,
      prompt: verifyRequest.payload.prompt,
      networkProfile: requestedNetworkProfile
    },
    env.GATEWAY_SALT
  );

  if (recomputedFingerprint !== verifyRequest.fingerprint) {
    return forbiddenResponse(
      "Fingerprint is invalid for the provided payload.",
      "FINGERPRINT_INVALID"
    );
  }

  let quoteContext: NonNullable<Awaited<ReturnType<typeof loadQuoteContext>>> | null;

  try {
    quoteContext = await loadQuoteContext(verifyRequest.fingerprint);
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load quote context.",
      "QUOTE_CONTEXT_READ_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown quote context read error." }
    );
  }

  if (!quoteContext) {
    return forbiddenResponse(
      "Fingerprint is expired or no longer valid.",
      "FINGERPRINT_INVALID"
    );
  }

  if (
    quoteContext.fingerprint !== verifyRequest.fingerprint ||
    quoteContext.buyer_id !== verifyRequest.payload.buyer_id ||
    quoteContext.capability !== verifyRequest.payload.capability ||
    quoteContext.network_profile !== requestedNetworkProfile
  ) {
    return forbiddenResponse(
      "Quote context does not match the verification payload.",
      "FINGERPRINT_INVALID"
    );
  }

  let networkProfile: ReturnType<typeof getNetworkProfile>;

  try {
    networkProfile = getNetworkProfile(env, quoteContext.network_profile);
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway network profile configuration for verify.",
      "GATEWAY_CONFIG_MISSING",
      {
        code: error instanceof NetworkProfileConfigError ? error.code : undefined,
        reason: error instanceof Error ? error.message : "Unknown config error."
      }
    );
  }

  if (!quoteMatchesActiveNetworkProfile(quoteContext, networkProfile)) {
    return conflictResponse(
      "Quote payment network profile is no longer active. Request a fresh quote.",
      "QUOTE_PAYMENT_PROFILE_MISMATCH"
    );
  }

  if (
    !xPaymentHeader &&
    networkProfile.allowMockPayments !== "true" &&
    networkProfile.allowDirectEscrowPayments !== "true"
  ) {
    return badRequestResponse(
      "X-PAYMENT header is required for production payment verification.",
      "X_PAYMENT_REQUIRED"
    );
  }

  if (
    !xPaymentHeader &&
    networkProfile.allowMockPayments !== "true" &&
    networkProfile.allowDirectEscrowPayments === "true" &&
    (!verifyRequest.tx_hash || !looksLikeOnChainTxHash(verifyRequest.tx_hash))
  ) {
    return badRequestResponse(
      "tx_hash must be a 32-byte transaction hash for direct escrow payment verification.",
      "INVALID_TX_HASH"
    );
  }

  let settlingJob: Awaited<ReturnType<typeof createSettlingJob>>;

  try {
    const sellerMarkedBusy = await markSellerBusyForPayment(quoteContext);

    if (!sellerMarkedBusy) {
      try {
        await deleteQuoteContext(quoteContext.payment_id);
      } catch (quoteContextDeleteError) {
        console.error("Failed to delete stale quote context after seller reservation conflict", {
          paymentId: quoteContext.payment_id,
          reason:
            quoteContextDeleteError instanceof Error
              ? quoteContextDeleteError.message
              : "Unknown quote context delete error."
        });
      }

      return conflictResponse(
        "Seller reservation is no longer valid for this payment.",
        "QUOTE_EXPIRED"
      );
    }
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to mark the seller busy.",
      "SELLER_BUSY_UPDATE_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown seller busy update error." }
    );
  }

  try {
    settlingJob = await createSettlingJob({
      verifyRequest,
      quoteContext
    });
  } catch (error) {
    try {
      await setSellerIdleAfterExecution(
        quoteContext.seller_id,
        quoteContext.network_profile
      );
    } catch (releaseError) {
      console.error("Failed to release seller after settling job creation failure", {
        paymentId: quoteContext.payment_id,
        sellerId: quoteContext.seller_id,
        reason: releaseError instanceof Error ? releaseError.message : "Unknown seller release error."
      });
    }

    if (error instanceof DuplicateVerificationError) {
      return conflictResponse(
        error.reason === "payment_id"
          ? "This payment has already been verified."
          : "This tx_hash has already been used.",
        error.reason === "payment_id" ? "PAYMENT_ALREADY_VERIFIED" : "TX_ALREADY_USED"
      );
    }

    return internalServerErrorResponse(
      "Failed to create the settling job.",
      "JOB_CREATE_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job creation error." }
    );
  }

  let verifiedPayment: Awaited<ReturnType<typeof verifyPaymentForRequest>>;
  const activeQuoteContext = quoteContext;
  const verificationProgress: PaymentVerificationProgress = {
    settlementTxHash: null,
    escrowRegistered: false
  };

  async function cleanupFailedPaymentVerification(reason: string) {
    if (verificationProgress.settlementTxHash && !verificationProgress.escrowRegistered) {
      console.error("Escrow transfer verified but payment was not registered", {
        paymentId: activeQuoteContext.payment_id,
        jobId: settlingJob.id,
        settlementTxHash: verificationProgress.settlementTxHash,
        reason
      });
    }

    try {
      await deleteJob(settlingJob.id);
    } catch (deleteError) {
      console.error("Failed to delete settling job after payment verification failure", {
        paymentId: activeQuoteContext.payment_id,
        jobId: settlingJob.id,
        reason:
          deleteError instanceof Error
            ? deleteError.message
            : "Unknown settling job delete error."
      });
    }

    try {
      await setSellerIdleAfterExecution(
        activeQuoteContext.seller_id,
        activeQuoteContext.network_profile
      );
    } catch (releaseError) {
      console.error("Failed to release seller after payment verification failure", {
        paymentId: activeQuoteContext.payment_id,
        jobId: settlingJob.id,
        sellerId: activeQuoteContext.seller_id,
        reason:
          releaseError instanceof Error
            ? releaseError.message
            : "Unknown seller release error."
      });
    }

    try {
      await deleteQuoteContext(activeQuoteContext.payment_id);
    } catch (quoteContextDeleteError) {
      console.error("Failed to delete quote context after payment verification failure", {
        paymentId: activeQuoteContext.payment_id,
        jobId: settlingJob.id,
        reason:
          quoteContextDeleteError instanceof Error
            ? quoteContextDeleteError.message
            : "Unknown quote context delete error."
      });
    }
  }

  try {
    verifiedPayment = await verifyPaymentForRequest({
      txHash: verifyRequest.tx_hash,
      xPaymentHeader,
      quoteContext,
      verifyRequest,
      env,
      networkProfile,
      progress: verificationProgress
    });
  } catch (error) {
    await cleanupFailedPaymentVerification(
      error instanceof Error ? error.message : "Unknown payment verification error."
    );

    if (error instanceof FacilitatorRequestError) {
      console.warn("Facilitator payment verification failed", {
        paymentId: quoteContext.payment_id,
        code: error.code,
        status: error.status ?? null,
        details: error.details ?? null
      });

      return badRequestResponse(
        error.message,
        error.code,
        error.details && typeof error.details === "object"
          ? { facilitator: error.details as Record<string, unknown> }
          : undefined
      );
    }

    if (error instanceof InvalidEscrowReceiptError) {
      return badRequestResponse(error.message, error.code);
    }

    if (error instanceof EscrowGatewayActionError) {
      if (error.code === "SETTLEMENT_ALREADY_REGISTERED") {
        return conflictResponse(
          "This tx_hash has already been used.",
          "TX_ALREADY_USED"
        );
      }

      if (error.code === "PAYMENT_ALREADY_REGISTERED") {
        return conflictResponse(
          "This payment has already been verified.",
          "PAYMENT_ALREADY_VERIFIED"
        );
      }

      if (error.code === "ESCROW_REGISTRATION_FAILED") {
        return internalServerErrorResponse(
          "Failed to register escrow payment.",
          "ESCROW_REGISTRATION_FAILED",
          { reason: error.message }
        );
      }

      return badRequestResponse(error.message, error.code);
    }

    if (error instanceof PaymentVerificationInputError) {
      return badRequestResponse(error.message, error.code);
    }

    if (error instanceof Error && error.message === "tx_hash must be a valid mock transaction hash.") {
      return badRequestResponse(error.message, "INVALID_TX_HASH");
    }

    if (error instanceof Error && error.message === "tx_hash is required when X-PAYMENT is not provided.") {
      return badRequestResponse(error.message, "INVALID_TX_HASH");
    }

    return internalServerErrorResponse(
      "Failed to verify payment.",
      "PAYMENT_VERIFY_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown payment verify error." }
    );
  }

  const finalizationQuoteContext = quoteContext;

  async function compensateFailedFinalization(reason: string) {
    if (verifiedPayment.mode !== "mock") {
      try {
        const refund = await executeEscrowGatewayAction({
          action: "refund",
          paymentId: finalizationQuoteContext.payment_id,
          rpcUrl: networkProfile.rpcUrl,
          escrowAddress: finalizationQuoteContext.pay_to,
          gatewayPrivateKey: networkProfile.gatewayPrivateKey
        });

        console.error("Refunded escrow payment after local job finalization failure", {
          paymentId: finalizationQuoteContext.payment_id,
          jobId: settlingJob.id,
          refundTxHash: refund.txHash,
          reason
        });
      } catch (refundError) {
        console.error("Failed to compensate escrow payment after local job finalization failure", {
          paymentId: finalizationQuoteContext.payment_id,
          jobId: settlingJob.id,
          reason,
          refundReason:
            refundError instanceof Error ? refundError.message : "Unknown refund error."
        });
      }
    }

    try {
      await setSellerIdleAfterExecution(
        finalizationQuoteContext.seller_id,
        finalizationQuoteContext.network_profile
      );
    } catch (releaseError) {
      console.error("Failed to release seller after local job finalization failure", {
        paymentId: finalizationQuoteContext.payment_id,
        jobId: settlingJob.id,
        sellerId: finalizationQuoteContext.seller_id,
        reason:
          releaseError instanceof Error ? releaseError.message : "Unknown seller release error."
      });
    }
  }

  let createdJob;

  try {
    createdJob = await finalizeSettlingJobPayment({
      jobId: settlingJob.id,
      verifyRequest,
      quoteContext,
      txHash: verifiedPayment.resolvedTxHash,
      payment: {
        mode: verifiedPayment.mode,
        settlementTxHash: verifiedPayment.settlementTxHash,
        escrowRegistrationTxHash: verifiedPayment.escrowRegistrationTxHash,
        buyerWalletAddress: verifiedPayment.buyerWalletAddress,
        sellerWalletAddress: verifiedPayment.sellerWalletAddress,
        escrowContractAddress: quoteContext.pay_to
      }
    });
    console.info("Verify finalized paid job", {
      paymentId: quoteContext.payment_id,
      jobId: createdJob?.id ?? settlingJob.id,
      txHash: verifiedPayment.resolvedTxHash
    });
  } catch (error) {
    if (error instanceof DuplicateVerificationError) {
      return conflictResponse(
        error.reason === "payment_id"
          ? "This payment has already been verified."
          : "This tx_hash has already been used.",
        error.reason === "payment_id" ? "PAYMENT_ALREADY_VERIFIED" : "TX_ALREADY_USED"
      );
    }

    await compensateFailedFinalization(
      error instanceof Error ? error.message : "Unknown job finalization error."
    );

    return internalServerErrorResponse(
      "Failed to finalize the paid job.",
      "JOB_FINALIZE_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job finalization error." }
    );
  }

  if (!createdJob) {
    await compensateFailedFinalization("Settling job was no longer in a finalizable state.");

    return conflictResponse(
      "Payment job could not be finalized because its state changed concurrently.",
      "INVALID_JOB_STATE"
    );
  }

  try {
    await deleteQuoteContext(quoteContext.payment_id);
  } catch (error) {
    console.error("Failed to delete quote context after verify", {
      paymentId: quoteContext.payment_id,
      reason: error instanceof Error ? error.message : "Unknown quote context delete error."
    });
  }

  const supabase = createServerSupabaseClient();
  const { error: eventError } = await supabase.from("events").insert({
    job_id: createdJob.id,
    network_profile: quoteContext.network_profile,
    type: "PAID",
    message: `Payment ${quoteContext.payment_id} verified for seller ${quoteContext.seller_id}.`
  });

  if (eventError) {
    console.error("Failed to log verify paid event", {
      jobId: createdJob.id,
      paymentId: quoteContext.payment_id,
      reason: eventError.message
    });
  }

  return NextResponse.json({
    job_id: createdJob.id,
    status: createdJob.status,
    payment_mode: verifiedPayment.mode,
    settlement_tx_hash: verifiedPayment.settlementTxHash ?? null,
    escrow_registration_tx_hash: verifiedPayment.escrowRegistrationTxHash ?? null
  });
}
