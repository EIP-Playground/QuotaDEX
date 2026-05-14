import { internalServerErrorResponse } from "@/lib/errors";
import { getDashboardSummaryForScope } from "@/lib/dashboard";
import { getDashboardScopeFromRequest } from "@/lib/network-profiles";

export async function GET(request: Request) {
  try {
    return Response.json(
      await getDashboardSummaryForScope(getDashboardScopeFromRequest(request))
    );
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load dashboard summary.",
      "DASHBOARD_SUMMARY_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown dashboard summary error." }
    );
  }
}
