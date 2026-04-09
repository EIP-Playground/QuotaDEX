import { NextResponse } from "next/server";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse
} from "@/lib/errors";
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
    result: updatedJob.result
  });
}
