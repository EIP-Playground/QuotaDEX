import { internalServerErrorResponse } from "@/lib/errors";
import { getDashboardMarketForScope } from "@/lib/dashboard";
import { getDashboardScopeFromRequest } from "@/lib/network-profiles";

export async function GET(request: Request) {
  try {
    return Response.json(
      await getDashboardMarketForScope(getDashboardScopeFromRequest(request))
    );
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load dashboard market.",
      "DASHBOARD_MARKET_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown dashboard market error." }
    );
  }
}
