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
  InvalidEscrowReceiptError,
  looksLikeOnChainTxHash,
  verifyEscrowDepositReceipt
} from "@/lib/chain/escrow";
import { getServerEnv } from "@/lib/env";
import { buildFingerprint } from "@/lib/fingerprint";
import {
  createPaidJob,
  deleteJob,
  deleteQuoteContext,
  DuplicateVerificationError,
  loadQuoteContext,
  markSellerBusyForPayment,
  parseVerifyRequestBody,
  verifyMockTxHash
} from "@/lib/jobs";
import { createServerSupabaseClient } from "@/lib/supabase";

async function verifyPaymentForRequest(params: {
  txHash: string | null;
  xPaymentHeader: string | null;
  quoteContext: NonNullable<Awaited<ReturnType<typeof loadQuoteContext>>>;
  verifyRequest: ReturnType<typeof parseVerifyRequestBody>;
  env: ReturnType<typeof getServerEnv>;
}): Promise<{ resolvedTxHash: string | null }> {
  if (params.xPaymentHeader) {
    const paymentPayload = decodeXPaymentHeader(params.xPaymentHeader);
    const verifyResponse = await verifyFacilitatorPayment({
      paymentPayload,
      baseUrl: params.env.PIEVERSE_FACILITATOR_BASE_URL
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

    if (settleResponse.success === false) {
      throw new FacilitatorRequestError(
        settleResponse.error || "Facilitator settle rejected the payment.",
        "FACILITATOR_RESPONSE_INVALID",
        400,
        settleResponse
      );
    }

    return {
      resolvedTxHash:
        typeof settleResponse.txHash === "string" && settleResponse.txHash.trim() !== ""
          ? settleResponse.txHash.trim()
          : null
    };
  }

  if (!params.txHash) {
    throw new Error("tx_hash is required when X-PAYMENT is not provided.");
  }

  if (looksLikeOnChainTxHash(params.txHash)) {
    await verifyEscrowDepositReceipt({
      txHash: params.txHash,
      paymentId: params.quoteContext.payment_id,
      buyerId: params.verifyRequest.payload.buyer_id,
      sellerId: params.quoteContext.seller_id,
      amount: params.quoteContext.amount,
      rpcUrl: params.env.KITE_RPC_URL,
      escrowAddress: params.env.ESCROW_CONTRACT_ADDRESS,
      pyusdDecimals: Number.parseInt(params.env.PYUSD_DECIMALS, 10)
    });
    return {
      resolvedTxHash: params.txHash
    };
  }

  verifyMockTxHash(params.txHash);

  return {
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

  let quoteContext;

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

  let verifiedPayment;

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

  let createdJob;

  try {
    createdJob = await createPaidJob({
      verifyRequest,
      quoteContext,
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

    return internalServerErrorResponse(
      "Failed to create the paid job.",
      "JOB_CREATE_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job creation error." }
    );
  }

  try {
    const sellerMarkedBusy = await markSellerBusyForPayment(quoteContext);

    if (!sellerMarkedBusy) {
      await deleteJob(createdJob.id);

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
    try {
      await deleteJob(createdJob.id);
    } catch (rollbackError) {
      console.error("Failed to roll back paid job after seller busy update failure", {
        jobId: createdJob.id,
        reason: rollbackError instanceof Error ? rollbackError.message : "Unknown rollback error."
      });
    }

    return internalServerErrorResponse(
      "Failed to mark the seller busy.",
      "SELLER_BUSY_UPDATE_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown seller busy update error." }
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
    status: createdJob.status
  });
}
