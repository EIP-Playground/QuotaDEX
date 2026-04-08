import { notImplementedResponse } from "@/lib/errors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;

  return notImplementedResponse(
    `POST /api/v1/jobs/${id}/start`,
    "Mark a paid job as running after the seller worker accepts execution."
  );
}
