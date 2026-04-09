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
  parseStartJobBody,
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

  let startRequest: ReturnType<typeof parseStartJobBody>;

  try {
    startRequest = parseStartJobBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid start request body.",
      "INVALID_REQUEST"
    );
  }

  let jobSnapshot;

  try {
    jobSnapshot = await loadJobSnapshot(id);
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load job before start.",
      "JOB_READ_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job read error." }
    );
  }

  if (!jobSnapshot) {
    return notFoundResponse("Job not found.", "JOB_NOT_FOUND");
  }

  if (jobSnapshot.seller_id !== startRequest.seller_id) {
    return forbiddenResponse(
      "This seller is not allowed to start the job.",
      "SELLER_MISMATCH"
    );
  }

  if (jobSnapshot.status !== "paid") {
    return conflictResponse(
      `Job must be in paid status before start. Current status is ${jobSnapshot.status}.`,
      "INVALID_JOB_STATE"
    );
  }

  let updatedJob;

  try {
    updatedJob = await updateJobStatusForSeller({
      jobId: id,
      sellerId: startRequest.seller_id,
      expectedStatus: "paid",
      nextStatus: "running"
    });
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to mark job as running.",
      "JOB_START_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job start error." }
    );
  }

  if (!updatedJob) {
    return conflictResponse(
      "Job could not be started because its state changed concurrently.",
      "INVALID_JOB_STATE"
    );
  }

  try {
    await logJobEvent({
      jobId: id,
      type: "RUNNING",
      message: `Seller ${startRequest.seller_id} started job ${id}.`
    });
  } catch (error) {
    console.error("Failed to log running job event", {
      jobId: id,
      sellerId: startRequest.seller_id,
      reason: error instanceof Error ? error.message : "Unknown event error."
    });
  }

  return NextResponse.json({
    job_id: updatedJob.id,
    status: updatedJob.status
  });
}
