import { internalServerErrorResponse } from "@/lib/errors";
import { getDashboardEvents } from "@/lib/dashboard";

export async function GET() {
  try {
    return Response.json(await getDashboardEvents());
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load dashboard events.",
      "DASHBOARD_EVENTS_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown dashboard events error." }
    );
  }
}
