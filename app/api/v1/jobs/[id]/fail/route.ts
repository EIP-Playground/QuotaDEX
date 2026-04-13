import { NextResponse } from "next/server";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse
} from "@/lib/errors";
import {
  executeEscrowGatewayAction,
  looksLikeOnChainTxHash
} from "@/lib/chain/escrow";
import { getServerEnv } from "@/lib/env";
import {
  loadJobSnapshot,
  logJobEvent,
  parseFailJobBody,
  setSellerIdleAfterExecution,
  updateJobStatusForSeller
} from "@/lib/jobs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let failRequest: ReturnType<typeof parseFailJobBody>;

  try {
    failRequest = parseFailJobBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid fail request body.",
      "INVALID_REQUEST"
    );
  }

  let jobSnapshot;

  try {
    jobSnapshot = await loadJobSnapshot(id);
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load job before failure update.",
      "JOB_READ_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job read error." }
    );
  }

  if (!jobSnapshot) {
    return notFoundResponse("Job not found.", "JOB_NOT_FOUND");
  }

  if (jobSnapshot.seller_id !== failRequest.seller_id) {
    return forbiddenResponse(
      "This seller is not allowed to fail the job.",
      "SELLER_MISMATCH"
    );
  }

  if (jobSnapshot.status !== "running") {
    return conflictResponse(
      `Job must be in running status before failure. Current status is ${jobSnapshot.status}.`,
      "INVALID_JOB_STATE"
    );
  }

  let env: ReturnType<typeof getServerEnv>;

  try {
    env = getServerEnv();
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for failure handling.",
      "GATEWAY_CONFIG_MISSING",
      { reason: error instanceof Error ? error.message : "Unknown config error." }
    );
  }

  let updatedJob;

  try {
    updatedJob = await updateJobStatusForSeller({
      jobId: id,
      sellerId: failRequest.seller_id,
      expectedStatus: "running",
      nextStatus: "failed",
      result: {
        error: failRequest.error
      }
    });
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to mark job as failed.",
      "JOB_FAIL_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job fail error." }
    );
  }

  if (!updatedJob) {
    return conflictResponse(
      "Job could not be failed because its state changed concurrently.",
      "INVALID_JOB_STATE"
    );
  }

  let refundStatus:
    | {
        status: "refunded";
        tx_hash: string;
      }
    | {
        status: "skipped";
        reason: "mock_payment";
      }
    | {
        status: "failed";
        error: string;
      };

  if (!jobSnapshot.tx_hash || !looksLikeOnChainTxHash(jobSnapshot.tx_hash)) {
    refundStatus = {
      status: "skipped",
      reason: "mock_payment"
    };

    try {
      await logJobEvent({
        jobId: id,
        type: "REFUND_SKIPPED",
        message: `Escrow refund skipped for mock payment ${jobSnapshot.payment_id}.`
      });
    } catch (error) {
      console.error("Failed to log skipped refund event", {
        jobId: id,
        paymentId: jobSnapshot.payment_id,
        reason: error instanceof Error ? error.message : "Unknown event error."
      });
    }
  } else {
    try {
      const refund = await executeEscrowGatewayAction({
        action: "refund",
        paymentId: jobSnapshot.payment_id,
        rpcUrl: env.KITE_RPC_URL,
        escrowAddress: env.ESCROW_CONTRACT_ADDRESS,
        gatewayPrivateKey: env.GATEWAY_PRIVATE_KEY
      });

      refundStatus = {
        status: "refunded",
        tx_hash: refund.txHash
      };

      try {
        await logJobEvent({
          jobId: id,
          type: "REFUNDED",
          message: `Escrow refunded payment ${jobSnapshot.payment_id} for job ${id}.`
        });
      } catch (error) {
        console.error("Failed to log refund event", {
          jobId: id,
          paymentId: jobSnapshot.payment_id,
          reason: error instanceof Error ? error.message : "Unknown event error."
        });
      }
    } catch (error) {
      const refundErrorMessage =
        error instanceof Error ? error.message : "Unknown escrow refund error.";

      refundStatus = {
        status: "failed",
        error: refundErrorMessage
      };

      console.error("Failed to refund escrow after job failure", {
        jobId: id,
        paymentId: jobSnapshot.payment_id,
        reason: refundErrorMessage
      });

      try {
        await logJobEvent({
          jobId: id,
          type: "REFUND_FAILED",
          message: `Escrow refund failed for payment ${jobSnapshot.payment_id}: ${refundErrorMessage}`
        });
      } catch (eventError) {
        console.error("Failed to log refund failure event", {
          jobId: id,
          paymentId: jobSnapshot.payment_id,
          reason: eventError instanceof Error ? eventError.message : "Unknown event error."
        });
      }
    }
  }

  try {
    const sellerReleased = await setSellerIdleAfterExecution(failRequest.seller_id);

    if (!sellerReleased) {
      console.error("Seller remained non-idle after job failure", {
        jobId: id,
        sellerId: failRequest.seller_id
      });
    }
  } catch (error) {
    console.error("Failed to release seller after job failure", {
      jobId: id,
      sellerId: failRequest.seller_id,
      reason: error instanceof Error ? error.message : "Unknown seller release error."
    });
  }

  try {
    await logJobEvent({
      jobId: id,
      type: "FAILED",
      message: `Seller ${failRequest.seller_id} failed job ${id}: ${failRequest.error}`
    });
  } catch (error) {
    console.error("Failed to log failed job event", {
      jobId: id,
      sellerId: failRequest.seller_id,
      reason: error instanceof Error ? error.message : "Unknown event error."
    });
  }

  return NextResponse.json({
    job_id: updatedJob.id,
    status: updatedJob.status,
    result: updatedJob.result,
    refund: refundStatus
  });
}
