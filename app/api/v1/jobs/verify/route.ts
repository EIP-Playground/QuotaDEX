import { NextResponse } from "next/server";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse
} from "@/lib/errors";
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

export async function POST(request: Request) {
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

  if (looksLikeOnChainTxHash(verifyRequest.tx_hash)) {
    try {
      await verifyEscrowDepositReceipt({
        txHash: verifyRequest.tx_hash,
        paymentId: quoteContext.payment_id,
        buyerId: verifyRequest.payload.buyer_id,
        sellerId: quoteContext.seller_id,
        amount: quoteContext.amount,
        rpcUrl: env.KITE_RPC_URL,
        escrowAddress: env.ESCROW_CONTRACT_ADDRESS,
        pyusdDecimals: Number.parseInt(env.PYUSD_DECIMALS, 10)
      });
    } catch (error) {
      if (error instanceof InvalidEscrowReceiptError) {
        return badRequestResponse(error.message, error.code);
      }

      return internalServerErrorResponse(
        "Failed to verify on-chain receipt.",
        "RECEIPT_VERIFY_FAILED",
        { reason: error instanceof Error ? error.message : "Unknown receipt verify error." }
      );
    }
  } else {
    try {
      verifyMockTxHash(verifyRequest.tx_hash);
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : "Invalid mock tx hash.",
        "INVALID_TX_HASH"
      );
    }
  }

  let createdJob;

  try {
    createdJob = await createPaidJob(verifyRequest, quoteContext);
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
