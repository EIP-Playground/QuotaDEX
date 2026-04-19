import { internalServerErrorResponse } from "@/lib/errors";
import { getDashboardSummary } from "@/lib/dashboard";

export async function GET() {
  try {
    return Response.json(await getDashboardSummary());
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load dashboard summary.",
      "DASHBOARD_SUMMARY_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown dashboard summary error." }
    );
  }
}
