import { notImplementedResponse } from "@/lib/errors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;

  return notImplementedResponse(
    `GET /api/v1/jobs/${id}`,
    "Fetch a job as a polling fallback when Realtime is unavailable."
  );
}
