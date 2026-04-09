import { NextResponse } from "next/server";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse
} from "@/lib/errors";
import { executeEscrowGatewayAction } from "@/lib/chain/escrow";
import { getServerEnv } from "@/lib/env";
import {
  loadJobSnapshot,
  logJobEvent,
  parseCompleteJobBody,
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

  let completeRequest: ReturnType<typeof parseCompleteJobBody>;

  try {
    completeRequest = parseCompleteJobBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid complete request body.",
      "INVALID_REQUEST"
    );
  }

  let jobSnapshot;

  try {
    jobSnapshot = await loadJobSnapshot(id);
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load job before completion.",
      "JOB_READ_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job read error." }
    );
  }

  if (!jobSnapshot) {
    return notFoundResponse("Job not found.", "JOB_NOT_FOUND");
  }

  if (jobSnapshot.seller_id !== completeRequest.seller_id) {
    return forbiddenResponse(
      "This seller is not allowed to complete the job.",
      "SELLER_MISMATCH"
    );
  }

  if (jobSnapshot.status !== "running") {
    return conflictResponse(
      `Job must be in running status before completion. Current status is ${jobSnapshot.status}.`,
      "INVALID_JOB_STATE"
    );
  }

  let env: ReturnType<typeof getServerEnv>;

  try {
    env = getServerEnv();
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for completion.",
      "GATEWAY_CONFIG_MISSING",
      { reason: error instanceof Error ? error.message : "Unknown config error." }
    );
  }

  let updatedJob;

  try {
    updatedJob = await updateJobStatusForSeller({
      jobId: id,
      sellerId: completeRequest.seller_id,
      expectedStatus: "running",
      nextStatus: "done",
      result: completeRequest.result
    });
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to mark job as done.",
      "JOB_COMPLETE_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job complete error." }
    );
  }

  if (!updatedJob) {
    return conflictResponse(
      "Job could not be completed because its state changed concurrently.",
      "INVALID_JOB_STATE"
    );
  }

  let releaseStatus:
    | {
        status: "released";
        tx_hash: string;
      }
    | {
        status: "failed";
        error: string;
      };

  try {
    const release = await executeEscrowGatewayAction({
      action: "release",
      paymentId: jobSnapshot.payment_id,
      rpcUrl: env.KITE_RPC_URL,
      escrowAddress: env.ESCROW_CONTRACT_ADDRESS,
      gatewayPrivateKey: env.GATEWAY_PRIVATE_KEY
    });

    releaseStatus = {
      status: "released",
      tx_hash: release.txHash
    };

    try {
      await logJobEvent({
        jobId: id,
        type: "RELEASED",
        message: `Escrow released payment ${jobSnapshot.payment_id} for job ${id}.`
      });
    } catch (error) {
      console.error("Failed to log release event", {
        jobId: id,
        paymentId: jobSnapshot.payment_id,
        reason: error instanceof Error ? error.message : "Unknown event error."
      });
    }
  } catch (error) {
    const releaseErrorMessage =
      error instanceof Error ? error.message : "Unknown escrow release error.";

    releaseStatus = {
      status: "failed",
      error: releaseErrorMessage
    };

    console.error("Failed to release escrow after job completion", {
      jobId: id,
      paymentId: jobSnapshot.payment_id,
      reason: releaseErrorMessage
    });

    try {
      await logJobEvent({
        jobId: id,
        type: "RELEASE_FAILED",
        message: `Escrow release failed for payment ${jobSnapshot.payment_id}: ${releaseErrorMessage}`
      });
    } catch (eventError) {
      console.error("Failed to log release failure event", {
        jobId: id,
        paymentId: jobSnapshot.payment_id,
        reason: eventError instanceof Error ? eventError.message : "Unknown event error."
      });
    }
  }

  try {
    const sellerReleased = await setSellerIdleAfterExecution(completeRequest.seller_id);

    if (!sellerReleased) {
      console.error("Seller remained non-idle after job completion", {
        jobId: id,
        sellerId: completeRequest.seller_id
      });
    }
  } catch (error) {
    console.error("Failed to release seller after job completion", {
      jobId: id,
      sellerId: completeRequest.seller_id,
      reason: error instanceof Error ? error.message : "Unknown seller release error."
    });
  }

  try {
    await logJobEvent({
      jobId: id,
      type: "DONE",
      message: `Seller ${completeRequest.seller_id} completed job ${id}.`
    });
  } catch (error) {
    console.error("Failed to log completed job event", {
      jobId: id,
      sellerId: completeRequest.seller_id,
      reason: error instanceof Error ? error.message : "Unknown event error."
    });
  }

  return NextResponse.json({
    job_id: updatedJob.id,
    status: updatedJob.status,
    result: updatedJob.result,
    release: releaseStatus
  });
}
