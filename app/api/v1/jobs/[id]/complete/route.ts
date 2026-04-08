import { notImplementedResponse } from "@/lib/errors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;

  return notImplementedResponse(
    `POST /api/v1/jobs/${id}/complete`,
    "Persist the seller result and mark the job as done."
  );
}
