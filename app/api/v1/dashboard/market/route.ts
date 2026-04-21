import { internalServerErrorResponse } from "@/lib/errors";
import { getDashboardMarket } from "@/lib/dashboard";

export async function GET() {
  try {
    return Response.json(await getDashboardMarket());
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load dashboard market.",
      "DASHBOARD_MARKET_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown dashboard market error." }
    );
  }
}
