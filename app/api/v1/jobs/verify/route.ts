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
  verifyFacilitatorSettlementReceipt,
  verifyEscrowDepositReceipt
} from "@/lib/chain/escrow";
import { getServerEnv } from "@/lib/env";
import { buildFingerprint } from "@/lib/fingerprint";
import {
  createSettlingJob,
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
}): Promise<{
  mode: "mock" | "escrow-chain" | "x402-escrow";
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
      baseUrl: params.env.PIEVERSE_FACILITATOR_BASE_URL
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
      baseUrl: params.env.PIEVERSE_FACILITATOR_BASE_URL
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
      rpcUrl: params.env.KITE_RPC_URL,
      tokenAddress: params.quoteContext.payment_asset,
      escrowAddress: params.quoteContext.pay_to
    });

    const escrowRegistration = await registerFacilitatorEscrowPayment({
      paymentId: params.quoteContext.payment_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      sellerId: params.quoteContext.seller_id,
      amountAtomic: params.quoteContext.amount_atomic,
      settlementTxHash,
      rpcUrl: params.env.KITE_RPC_URL,
      escrowAddress: params.quoteContext.pay_to,
      gatewayPrivateKey: params.env.GATEWAY_PRIVATE_KEY
    });

    return {
      mode: "x402-escrow",
      resolvedTxHash: settlementTxHash,
      settlementTxHash,
      escrowRegistrationTxHash: escrowRegistration.txHash,
      buyerWalletAddress: params.verifyRequest.payload.buyer_id,
      sellerWalletAddress: params.quoteContext.seller_id
    };
  }

  if (params.env.ALLOW_MOCK_PAYMENTS !== "true") {
    throw new PaymentVerificationInputError(
      "X-PAYMENT header is required for production payment verification.",
      "X_PAYMENT_REQUIRED"
    );
  }

  if (!params.txHash) {
    throw new PaymentVerificationInputError(
      "tx_hash is required when X-PAYMENT is not provided.",
      "INVALID_TX_HASH"
    );
  }

  if (looksLikeOnChainTxHash(params.txHash)) {
    console.info("Verify payment route selected", {
      mode: "escrow-chain",
      paymentId: params.quoteContext.payment_id,
      sellerId: params.quoteContext.seller_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      txHash: params.txHash
    });

    await verifyEscrowDepositReceipt({
      txHash: params.txHash,
      paymentId: params.quoteContext.payment_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      sellerId: params.quoteContext.seller_id,
      amount: params.quoteContext.amount,
      rpcUrl: params.env.KITE_RPC_URL,
      escrowAddress: params.env.ESCROW_CONTRACT_ADDRESS,
      pyusdDecimals: Number.parseInt(params.env.PAYMENT_TOKEN_DECIMALS, 10)
    });
    return {
      mode: "escrow-chain",
      resolvedTxHash: params.txHash
    };
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

  const recomputedFingerprint = buildFingerprint(
    {
      buyerId: verifyRequest.payload.buyer_id,
      capability: verifyRequest.payload.capability,
      prompt: verifyRequest.payload.prompt
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
    quoteContext.capability !== verifyRequest.payload.capability
  ) {
    return forbiddenResponse(
      "Quote context does not match the verification payload.",
      "FINGERPRINT_INVALID"
    );
  }

  if (quoteContext.pay_to.toLowerCase() !== env.ESCROW_CONTRACT_ADDRESS.toLowerCase()) {
    return conflictResponse(
      "Quote escrow contract is no longer active. Request a fresh quote.",
      "QUOTE_ESCROW_MISMATCH"
    );
  }

  if (!xPaymentHeader && env.ALLOW_MOCK_PAYMENTS !== "true") {
    return badRequestResponse(
      "X-PAYMENT header is required for production payment verification.",
      "X_PAYMENT_REQUIRED"
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
      await setSellerIdleAfterExecution(quoteContext.seller_id);
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

  try {
    verifiedPayment = await verifyPaymentForRequest({
      txHash: verifyRequest.tx_hash,
      xPaymentHeader,
      quoteContext,
      verifyRequest,
      env
    });
  } catch (error) {
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
          rpcUrl: env.KITE_RPC_URL,
          escrowAddress: finalizationQuoteContext.pay_to,
          gatewayPrivateKey: env.GATEWAY_PRIVATE_KEY
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
      await setSellerIdleAfterExecution(finalizationQuoteContext.seller_id);
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
