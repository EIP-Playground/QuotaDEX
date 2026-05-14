import { internalServerErrorResponse } from "@/lib/errors";
import { getDashboardEventsForScope } from "@/lib/dashboard";
import { getDashboardScopeFromRequest } from "@/lib/network-profiles";

export async function GET(request: Request) {
  try {
    return Response.json(
      await getDashboardEventsForScope(getDashboardScopeFromRequest(request))
    );
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load dashboard events.",
      "DASHBOARD_EVENTS_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown dashboard events error." }
    );
  }
}
