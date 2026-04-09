import {
  internalServerErrorResponse,
  notFoundResponse
} from "@/lib/errors";
import { loadJobSnapshot } from "@/lib/jobs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;

  let jobSnapshot;

  try {
    jobSnapshot = await loadJobSnapshot(id);
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load job.",
      "JOB_READ_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown job read error." }
    );
  }

  if (!jobSnapshot) {
    return notFoundResponse("Job not found.", "JOB_NOT_FOUND");
  }

  return Response.json({
    job_id: jobSnapshot.id,
    payment_id: jobSnapshot.payment_id,
    seller_id: jobSnapshot.seller_id,
    status: jobSnapshot.status,
    result: jobSnapshot.result
  });
}
